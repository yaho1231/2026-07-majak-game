/**
 * 중앙 인포 패널은 **다음 국이 실제로 시작될 때** 바뀐다 — 회귀 가드.
 *
 * 서버의 정산 뷰(phase=`round.over`)는 ROUND_SETTLED가 국번호·장풍·본장·공탁·오야를
 * **미리 올려서** 보낸다. 그 뷰를 그대로 그리면 론/쯔모 컷인도, 점수표도, 증강 선택창도
 * 뜨기 전에 중앙 패널만 홱 다음 국으로 넘어간다 (2026-08-11 사용자 보고).
 *
 * 올바른 순서: 국 종료 → (컷인) → 점수표 → (증강 있으면) 증강 선택 → 전원 선택 →
 * 다음 국 시작 → **그때** 중앙 패널 교체.
 *
 * qaPredeployClient.test.ts 와 같은 **정적 소스 스캔**이다 (이 패키지에는 jsdom이 없다).
 * 지키는 것은 "이 순서를 성립시키는 장치가 사라지지 않았는가" 하나다.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, "../src/App.tsx"), "utf8");

/** 주석을 걷어낸 코드만 — 주석에 적힌 옛 형태가 검사에 걸리지 않게 한다 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const APP_CODE = code(APP);

/** `function 이름(` 부터 **열 0에서 닫히는** `}` 까지 (중첩 블록은 전부 들여쓰여 있다) */
function fn(name: string): string {
  const start = APP_CODE.indexOf(`function ${name}(`);
  expect(start, `${name} 를 못 찾았다`).toBeGreaterThanOrEqual(0);
  const rest = APP_CODE.slice(start);
  const end = rest.indexOf("\n}\n");
  expect(end, `${name} 의 끝을 못 찾았다`).toBeGreaterThan(0);
  return rest.slice(0, end);
}

describe("중앙 패널 — 정산 뷰에서는 안 바뀐다", () => {
  it("round.over 뷰는 국 스냅샷을 갱신하지 않는다", () => {
    // 정산 뷰를 건너뛰는 가드. 이 한 줄이 사라지면 패널이 다시 컷인보다 먼저 넘어간다.
    expect(APP_CODE).toMatch(
      /if\s*\(msg\.view\.round\.phase\s*!==\s*"round\.over"\)\s*setCenterView\(msg\.view\)/,
    );
  });

  it("얼려 둘 이전 국이 없으면(재접속·중간 관전) 정산 뷰라도 쓴다", () => {
    // 이게 없으면 국 사이에 합류한 사람의 중앙 패널이 통째로 비어 버린다.
    expect(APP_CODE).toMatch(/setCenterView\(\(cur\)\s*=>\s*cur\s*\?\?\s*msg\.view\)/);
  });

  it("판이 스냅샷을 실제로 받아 쓴다", () => {
    expect(APP_CODE).toMatch(/roundView=\{centerView\s*\?\?\s*view\}/);
    expect(APP_CODE).toMatch(/roundView=\{props\.roundView\s*\?\?\s*view\}/);
  });
});

describe("중앙 패널 — 스냅샷에서 읽는 것과 live 뷰에서 읽는 것", () => {
  const panel = fn("CenterPanel");

  it("국 정보(국번호·장풍·본장·공탁·오야)는 스냅샷에서 읽는다", () => {
    for (const field of [
      "prevalentWind",
      "roundNumber",
      "honba",
      "riichiPot",
      "dealerSeat",
    ]) {
      expect(panel, `${field} 가 스냅샷에서 오지 않는다`).toContain(
        `${field}: snap.${field}`,
      );
    }
  });

  it("자풍은 스냅샷의 오야로 센다", () => {
    // live 오야로 세면 정산 순간 東이 한 자리 돌아간다.
    expect(panel).toContain("seatWindChar(windView, p)");
  });

  it("뒷도라·패산은 live 뷰에서 읽는다", () => {
    // 뒷도라는 **정산 뷰에서 처음 공개**된다 — 패널을 통째로 얼리면 이번 국의
    // 뒷도라를 아무도 못 본다. 패산도 같은 이유로 live다.
    expect(panel).toContain('view.zones["wall"]');
    expect(panel).not.toContain('roundView.zones["wall"]');
    expect(panel).toContain("view.tiles[id]");
    expect(panel).not.toContain("roundView.tiles[id]");
  });

  it("점수판의 점수는 live 뷰에서 온다", () => {
    // 점수표가 보여 주는 수치와 뒤의 점수판이 어긋나면 그게 더 헷갈린다.
    expect(panel).toContain("p.score.toLocaleString()");
    expect(panel).not.toContain("roundView.players");
  });
});

describe("증강 선택창은 점수표 뒤에 온다", () => {
  it("점수표가 떠 있는 동안에는 증강 선택창을 그리지 않는다", () => {
    expect(APP_CODE).toMatch(/draftVisible\s*=[^;]*roundResult === null/);
  });
});
