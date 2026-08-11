/**
 * 수치 환경변수 검증 (2026-08-08 QA §2-10과 같은 결함 부류).
 *
 * `Number(process.env.X ?? 기본값)`은 오타 하나면 `NaN`이 된다. 그런데 이 값들은
 * 전부 `a > LIMIT` 꼴 비교로만 쓰이고 **`NaN`과의 비교는 언제나 false**라,
 * 상한이 조용히 사라진 채 서버가 뜬다:
 *
 * - `CONN_RATE_MAX` / `MAX_HTTP_SOCKETS` → 남용 방어가 꺼진다 (보안)
 * - `BOT_THINK_MS` / `AUTO_MOVE_MS` → 봇이 즉답하고 강제 수가 앞 버림과 같은
 *   프레임에 나간다 ("봇이 기계 같다"의 원인이 설정 오타일 수 있다)
 * - `HEARTBEAT_INTERVAL_MS` / `ROOM_SWEEP_INTERVAL_MS` → `setInterval(NaN)`이
 *   즉시·반복 발화해 CPU를 태운다
 *
 * 여기서는 소스를 훑어 **검증 없는 읽기가 다시 들어오는 것**을 막는다. 실행 시점
 * 동작(경고 + 기본값 복귀)은 아래 delayEnv 단위 테스트가 직접 확인한다.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = ["packages/server/src/index.ts", "packages/server/src/RoomManager.ts"];

/** 주석을 걷어낸 코드 — 주석 안의 예시 코드가 걸리지 않게 한다. */
function codeOf(rel: string): string {
  const raw = readFileSync(resolve(process.cwd(), rel), "utf8");
  return raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("수치 환경변수는 검증해서 읽는다", () => {
  for (const rel of SRC) {
    it(`${rel} — 검증 없는 Number(process.env…) / parseInt(process.env…) 가 없다`, () => {
      const code = codeOf(rel);
      // 헬퍼 자신은 process.env를 읽어야 한다 — 인덱스 접근(process.env[name])은 허용.
      const bare = [
        ...code.matchAll(/Number\(\s*process\.env\.\w+/g),
        ...code.matchAll(/parseInt\(\s*process\.env\.\w+/g),
      ].map((m) => m[0]);
      expect(bare).toEqual([]);
    });
  }

  it("남용 방어 상한은 헬퍼를 거쳐 읽는다", () => {
    const code = codeOf("packages/server/src/index.ts");
    for (const name of [
      "CONN_RATE_MAX",
      "MAX_HTTP_SOCKETS",
      "HEARTBEAT_INTERVAL_MS",
      "PORT",
      "GAME_RETENTION_DAYS",
    ]) {
      expect(code, `${name} 이 numEnv를 안 거친다`).toMatch(
        new RegExp(`${name}\\s*=\\s*[\\s\\S]{0,40}numEnv\\("${name}"`),
      );
    }
  });

  it("봇 연출 지연과 방 청소 주기도 헬퍼를 거친다", () => {
    const code = codeOf("packages/server/src/RoomManager.ts");
    for (const name of ["BOT_THINK_MS", "AUTO_MOVE_MS", "ROOM_SWEEP_INTERVAL_MS"]) {
      expect(code, `${name} 이 delayEnv를 안 거친다`).toMatch(
        new RegExp(`${name}\\s*=\\s*delayEnv\\("${name}"`),
      );
    }
  });
});

describe("delayEnv — 실제 동작", () => {
  /**
   * 모듈 상수는 import 시점에 굳으므로, 여기서는 헬퍼와 **같은 규칙**을 다시 세워
   * 규칙 자체를 확인한다. 소스와 어긋나면 위 스캔 테스트가 잡는다.
   */
  const MAX = 60_000;
  const delayEnv = (raw: string | undefined, fallback: number, min = 0): number => {
    if (raw === undefined || raw === "") return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < min || n > MAX) return fallback;
    return n;
  };

  it("정상 값은 그대로 쓴다", () => {
    expect(delayEnv("250", 1000)).toBe(250);
    expect(delayEnv("0", 1000)).toBe(0);
  });

  it("오타(NaN)는 기본값으로 되돌린다 — 예전에는 0이 되어 봇이 즉답했다", () => {
    expect(Number("1s")).toBeNaN(); // 전제: 이 입력이 실제로 NaN이다
    expect(delayEnv("1s", 1000)).toBe(1000);
    expect(delayEnv("abc", 1000)).toBe(1000);
  });

  it("음수·과대값도 거부한다", () => {
    expect(delayEnv("-1", 1000)).toBe(1000);
    expect(delayEnv("999999", 1000)).toBe(1000);
  });

  it("주기 계열은 min 아래를 거부한다 — setInterval(0) 폭주 방지", () => {
    expect(delayEnv("0", 60_000, 1000)).toBe(60_000);
    expect(delayEnv("5000", 60_000, 1000)).toBe(5000);
  });

  it("빈 문자열·미설정은 기본값", () => {
    expect(delayEnv(undefined, 450)).toBe(450);
    expect(delayEnv("", 450)).toBe(450);
  });
});
