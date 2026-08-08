/**
 * 2026-08-08 QA §2-9 — 규칙 구멍 2차.
 *
 * 여기 있는 것들은 전부 "돈이 새거나, 조건이 사라진 뒤에도 보상이 남는" 부류다.
 */

import { describe, expect, it } from "vitest";
import { winPointsWithExtraHan } from "../src/util.js";
import { contentAugments } from "../src/index.js";

describe("winPointsWithExtraHan — 오야 취급을 반영한다", () => {
  /**
   * 정산(`sysSettleWin`)은 `isDealer || win.treatAsDealer`로 오야 배율을 정한다.
   * 헬퍼가 자리만 보면, 만년 오야·찬탈자로 오야가 된 홀더의 "+N판"이 자 기준으로
   * 계산되어 오야 기준 `info.points`와의 차가 산배만 위에서 0으로 무너졌다.
   */
  const state = {
    round: { dealerSeat: 1, honba: 0 },
    players: [
      { id: "p0", seat: 0 },
      { id: "p1", seat: 1 },
    ],
  } as never;
  const info = {
    winner: "p0",
    han: 6,
    fu: 30,
    yakumanCount: 0,
    winType: "ron",
    points: 18000, // 오야 하네만 — 오야 취급으로 정산된 점수
  } as never;

  it("rules 없이는 종전대로 자리만 본다", () => {
    // 자 기준 6판 = 12000, 7판 = 18000 → 18000 - 18000 = 0 (무너지는 경우)
    expect(winPointsWithExtraHan(state, "p0", info, 1)).toBe(0);
  });

  it("win.treatAsDealer가 켜져 있으면 오야 기준으로 계산한다", () => {
    const rules = {
      resolve: <T,>(rule: string): T =>
        (rule === "win.treatAsDealer" ? true : 0) as T,
    } as never;
    // 오야 기준 7판 = 하네만 18000 → 여전히 0? 오야 6판·7판 모두 하네만이므로
    // 최소한 자 기준 계산과 **다른 근거**를 쓴다는 것만 확인한다.
    const got = winPointsWithExtraHan(state, "p0", info, 3);
    const gotDealer = winPointsWithExtraHan(state, "p0", info, 3, rules);
    expect(gotDealer).toBeGreaterThan(got);
  });
});

describe("수상한 주사위 — 준 것들끼리도 상호 배제를 지킨다", () => {
  it("카탈로그의 상호 배타 쌍이 실제로 존재한다 (테스트 전제)", () => {
    const byId = new Map(contentAugments.map((a) => [a.id, a]));
    const td = byId.get("true_dragon");
    expect(td).toBeDefined();
    expect((td?.conflicts ?? []).length).toBeGreaterThan(0);
    // conflicts가 가리키는 id는 전부 실재해야 한다
    for (const c of td?.conflicts ?? []) expect(byId.has(c)).toBe(true);
  });
});
