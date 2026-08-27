/**
 * 자동응답의 «패를 내려놓는 시간» — 2026-08-27 사용자 지시("타패하는 게 보인 다음 1초").
 *
 * 자동 화료·자동버림·후로없음은 프롬프트가 도착한 프레임에 그대로 답을 쏘고 있었다.
 * 그러면 내 수가 앞 사람의 버림과 한 프레임에 붙어, 무엇이 나갔는지 보이지 않는다.
 * 서버가 리치의 강제 쯔모기리에 두는 박자(`AUTO_MOVE_MS`)와 **같은 값**이어야 한다.
 *
 * `qaRound4ClientA/B`와 같은 방식(정적 소스 스캔) — 이 배관은 소켓·타이머·React
 * 상태가 얽혀 있어 통합 테스트로 세우는 비용이 크고, 되돌아가는 방식은 언제나
 * "그냥 send로 되돌리기" 하나다.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p: string): string => readFileSync(join(HERE, p), "utf8");
const APP = read("../src/App.tsx");
const ROOM_MANAGER = read("../../server/src/RoomManager.ts");

/** 주석을 걷어낸 코드만 — 주석에 적힌 옛 형태가 검사에 걸리지 않게 한다 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const APP_CODE = code(APP);

describe("자동응답은 한 박자 뒤에 나간다", () => {
  it("클라이언트의 박자와 서버의 강제 수 박자가 같은 1초다", () => {
    const client = /const AUTO_RESPOND_MS = ([\d_]+);/.exec(APP);
    expect(client).not.toBeNull();
    const server = /delayEnv\("AUTO_MOVE_MS", process\.env\.VITEST \? 0 : ([\d_]+)\)/.exec(
      ROOM_MANAGER,
    );
    expect(server).not.toBeNull();
    const ms = Number((client?.[1] ?? "0").replace(/_/g, ""));
    expect(ms).toBe(1000);
    expect(Number((server?.[1] ?? "0").replace(/_/g, ""))).toBe(ms);
  });

  it("자동 화료·후로없음·자동버림이 셋 다 즉시 send 하지 않는다", () => {
    const at = APP_CODE.indexOf("function tryAutoRespond(");
    expect(at).toBeGreaterThan(0);
    const body = APP_CODE.slice(at, APP_CODE.indexOf("function connect()", at));
    expect(body.length).toBeGreaterThan(0);
    // 세 갈래가 전부 예약을 거친다 (win · pass · discard).
    expect(body.match(/scheduleAutoRespond\(/g)?.length).toBe(3);
    // 액션 전송도 정확히 셋 — 예약보다 많으면 어느 갈래가 예약을 건너뛴 것이다.
    expect(body.match(/send\(\{ type: "action"/g)?.length).toBe(3);
  });

  it("접힌 프롬프트(promptCancel)와 방 나가기에서 예약을 걷는다", () => {
    // 반 박자 사이에 상대의 더 센 선언이 확정되면 이미 접힌 프롬프트에 답이 나간다.
    const at = APP_CODE.indexOf('msg.type === "promptCancel"');
    expect(at).toBeGreaterThan(0);
    expect(APP_CODE.slice(at, at + 1600)).toContain("cancelAutoRespond(msg.seat)");
    const reset = APP_CODE.indexOf("function resetGameState()");
    expect(reset).toBeGreaterThan(0);
    expect(APP_CODE.slice(reset, reset + 400)).toContain("cancelAutoRespond()");
  });
});
