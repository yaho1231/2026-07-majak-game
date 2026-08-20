/**
 * 큰손 × 일확천금 — 만관 하한과 배수의 상호작용 (docs/25 역/점수 #6·#7).
 *
 * 큰손의 하한 보전이 **배수 전 값**(info.points)으로 차액을 계산해서, 이미 배수가
 * 적용된 deltas에 그 차액을 얹었다:
 *   · 0.5배: 1000 → 500(배수) → +7000(차액) = **7500** — 만관 하한이 무너진다
 *   · 3배  : 3000 → +7000 = **10000** — 만관을 넘겨 준다
 *
 * 일확천금은 여기에 더해 ① Math.round로 100점 격자를 벗어나고 ② 공탁(리치봉)까지
 * 배로 불려 뱅크가 남의 봉을 새로 발행하게 만들었다.
 */

import { describe, expect, it } from "vitest";
import {
  ROUND_SETTLED,
  SETTLE_STAGE,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type { GameState, PlayerId, RoundSettledPayload } from "@majak/core";
import { craft } from "./helpers.js";
import { bigHand } from "../src/augments/big_hand.js";
import { jackpot } from "../src/augments/jackpot.js";
import { roundKey } from "../src/util.js";

type Game = ReturnType<typeof createStandardGameFromState>;

/** p0가 큰손을 선언했고 일확천금 배수도 뽑아 둔 상태 */
function scene(mult: number | null, pot = 0): Game {
  const base = craft({
    hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const rk = roundKey(base);
  const augs = mult === null ? ["big_hand"] : ["big_hand", "jackpot"];
  const state: GameState = {
    ...base,
    players: base.players.map((p) =>
      p.id === "p0" ? { ...p, augments: augs } : p,
    ),
    round: { ...base.round, riichiPot: pot },
    augmentData: {
      ...base.augmentData,
      [`big_hand:round:p0`]: rk,
      ...(mult === null ? {} : { [`jackpot:mult:${rk}:p0`]: mult }),
    },
  };
  const defs = mult === null ? [bigHand] : [bigHand, jackpot];
  const game = createStandardGameFromState(state, undefined, defs);
  for (const d of defs) installAugment(game.engine, d, "p0", { yaku: game.yaku });
  return game;
}

/** ROUND_SETTLED를 정산 인터셉터 체인에 흘려 최종 deltas를 얻는다 */
function settle(game: Game, winPoints: number, pot = 0): RoundSettledPayload {
  let payload: RoundSettledPayload = {
    outcome: "win",
    deltas: { p0: winPoints + pot, p1: -winPoints },
    dealerSeat: game.engine.state.round.dealerSeat,
    honba: 0,
    // 엔진과 같은 모양 — 화료 정산의 payload.riichiPot은 언제나 0이고,
    // 회수액은 winInfo.riichiPotGain에만 실린다
    riichiPot: 0,
    roundNumber: game.engine.state.round.roundNumber,
    prevalentWind: game.engine.state.round.prevalentWind,
    winInfos: [
      {
        winner: "p0" as PlayerId,
        from: "p1" as PlayerId,
        winType: "ron",
        points: winPoints,
        han: 1,
        fu: 30,
        yaku: [],
        yakumanCount: 0,
        ...(pot > 0 ? { riichiPotGain: pot } : {}),
      } as unknown as RoundSettledPayload["winInfos"] extends (infer T)[] ? T : never,
    ],
  };
  for (const { intercept } of game.engine.effects.interceptorsFor(ROUND_SETTLED)) {
    const out = intercept(
      { type: ROUND_SETTLED, payload },
      { state: game.engine.state, rules: game.engine.rules },
    );
    if (out !== null) payload = out.payload as RoundSettledPayload;
  }
  return payload;
}

describe("큰손 — 만관 하한은 배수가 끝난 최종 수령액 기준이다", () => {
  // craft 기본값에서 p0가 친(dealerSeat=0)이라 하한은 오야 만관 12000이다
  it("배수 없이 1000점 화료 → 오야 만관(12000)으로 채워진다", () => {
    expect(settle(scene(null), 1000).deltas["p0"]).toBe(12000);
  });

  it("0.5배와 겹쳐도 하한이 무너지지 않는다 (예전 7500)", () => {
    expect(settle(scene(0.5), 1000).deltas["p0"]).toBe(12000);
  });

  it("3배와 겹쳐도 하한 위로 과지급되지 않는다 (예전 10000)", () => {
    // 1000 × 3 = 3000 → 하한 미만이라 12000으로 보전. 배수 전 값으로 차액을
    // 계산하던 예전에는 3000 + (12000-1000) = 14000이 나갔다.
    expect(settle(scene(3), 1000).deltas["p0"]).toBe(12000);
  });

  it("이미 하한을 넘는 화료는 건드리지 않는다", () => {
    expect(settle(scene(null), 20000).deltas["p0"]).toBe(20000);
  });
});

describe("일확천금 — 격자와 공탁", () => {
  it("배수 결과가 100점 격자를 벗어나지 않는다", () => {
    // 3900 × 0.5 = 1950 → 격자로 2000. 큰손이 없으면 그대로 남는다.
    const game = scene(0.5);
    const out = settle(game, 3900);
    expect((out.deltas["p0"] ?? 0) % 100).toBe(0);
  });

  it("공탁(리치봉)은 배수 대상이 아니다 — 남의 봉을 뱅크가 발행하지 않는다", () => {
    const pot = 1000;
    const out = settle(scene(3, pot), 3900, pot);
    // 화료분만 3배가 되고 공탁은 그대로: 3900*3 + 1000 = 12700
    expect(out.deltas["p0"]).toBe(3900 * 3 + pot);
  });
});
