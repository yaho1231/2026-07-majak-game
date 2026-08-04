/**
 * 뚫린 천장 — 오야 **취급** 증강(win.treatAsDealer)을 함께 봐야 한다.
 *
 * 정산(`sysSettleWin`)은 `isDealer || win.treatAsDealer`로 오야 배율을 정하는데,
 * 뚫린 천장은 자리(dealerSeat)만 보고 상한 해제분을 계산했다 → 만년 오야·찬탈자가
 * 오야 취급을 켠 국에서 **자 기준으로 깎인 금액**만 얹혔다(docs/25 역/점수 #15).
 * 큰손(big_hand)은 같은 문제를 이미 고쳐 뒀다.
 */

import { describe, expect, it } from "vitest";
import {
  ROUND_SETTLED,
  RuleLayer,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type { GameState, PlayerId, RoundSettledPayload, WinInfo } from "@majak/core";
import { craft } from "./helpers.js";
import { aotenjouCeiling } from "../src/augments/aotenjou_ceiling.js";

/** 8판 40부 론 — 만관 상한에 걸리는 손 (자 8000 / 오야 12000) */
const INFO: WinInfo = {
  winner: "p0",
  from: "p1",
  winType: "ron",
  winningTileId: 0,
  han: 8,
  fu: 40,
  yakumanCount: 0,
  extraHan: 0,
  yaku: [],
  doraHan: 0,
  uraHan: 0,
  redHan: 0,
  // 정산이 이미 낸 화료점 (뚫린 천장은 이 값을 쓰지 않고 han·fu로 기준선을 다시 잰다)
  points: 16000,
  limit: "배만",
};

/** p0(자리 0)가 오야가 아닌 판 — 오야는 자리 1 */
function scene(): GameState {
  const base = craft({
    hands: { p0: "123m456m789m123p11s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
  });
  return {
    ...base,
    players: base.players.map((p) =>
      p.id === "p0" ? { ...p, augments: ["aotenjou_ceiling"] } : p,
    ),
    round: { ...base.round, dealerSeat: 1, rotationSeat: 1 },
  };
}

/** 인터셉터를 통과시킨 뒤 p0가 얹어 받은 금액 */
function transferred(treatAsDealer: boolean): number {
  const game = createStandardGameFromState(scene());
  if (treatAsDealer) {
    game.engine.rules.addModifier<boolean>("win.treatAsDealer", {
      source: "test:treatAsDealer",
      layer: RuleLayer.Prism,
      apply: (cur, rctx) => (rctx.playerId === "p0" ? true : cur),
    });
  }
  installAugment(game.engine, aotenjouCeiling, "p0", { yaku: game.yaku });

  const payload: RoundSettledPayload = {
    outcome: "win",
    deltas: { p0: 0, p1: 0, p2: 0, p3: 0 },
    dealerSeat: 1,
    honba: 0,
    riichiPot: 0,
    roundNumber: 1,
    prevalentWind: 1,
    winInfos: [INFO],
  };
  const out = game.engine.effects
    .interceptorsFor(ROUND_SETTLED)
    .reduce<{ type: string; payload: unknown }>(
      (ev, i) =>
        i.intercept(ev, { state: game.engine.state, rules: game.engine.rules } as never) ??
        ev,
      { type: ROUND_SETTLED, payload },
    );
  const deltas = (out.payload as RoundSettledPayload).deltas as Record<PlayerId, number>;
  return deltas["p0"] ?? 0;
}

describe("뚫린 천장 × 오야 취급", () => {
  it("자로 화료하면 자 기준으로 상한을 푼다 (기준선)", () => {
    // 8판: 청천정 기본점 2000+(8−5)×1000 = 5000 → 자 론 5000×4 = 20000.
    // 표준 자 배만은 16000이므로 차액 4000이 얹힌다.
    expect(transferred(false)).toBe(20000 - 16000);
  });

  it("오야 취급(win.treatAsDealer)이면 오야 배율로 상한을 푼다", () => {
    // 같은 손을 오야 배율로: 5000×6 = 30000, 표준 오야 배만 24000 → 차액 6000.
    // 자 기준으로 재면 4000밖에 안 얹혀 오야 취급이 통째로 무시된다.
    expect(transferred(true)).toBe(30000 - 24000);
  });
});
