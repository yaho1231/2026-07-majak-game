/**
 * 유국역만 — 판정은 바닥이 아니라 **버림 이력**으로 한다 (사용자 확정 2026-08-03).
 *
 * 이 증강이 부수는 규칙은 정확히 하나: "내 버림을 누가 울면 유국만관이 무효"다.
 * "무엇을 버렸는가"는 그대로다 — 요구패가 아닌 패를 버렸으면, 그게 울려 나가
 * 바닥에서 사라졌더라도 성립하지 않는다.
 *
 * 예전에는 바닥에 남은 패만 봐서 규칙이 거꾸로 섰다. 5통을 버렸는데 상대가 울어
 * 가면 그 5통이 바닥에서 사라져 **없던 역만이 생겼다**.
 */

import { describe, expect, it } from "vitest";
import {
  ROUND_SETTLED,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type { GameState, RoundSettledPayload } from "@majak/core";
import { craft } from "./helpers.js";
import { nagashiYakuman } from "../src/augments/nagashi_yakuman.js";

/** p0의 버림 이력과 바닥을 따로 지정한 게임 (울림으로 둘이 갈리는 상황을 만든다) */
function game(history: string[], pond: string): ReturnType<typeof createStandardGameFromState> {
  const base = craft({
    hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
    discards: { p0: pond },
    phase: "turn.act",
    turnSeat: 0,
  });
  const p0r = base.round.byPlayer["p0"];
  if (p0r === undefined) throw new Error("no p0 round state");
  const state: GameState = {
    ...base,
    players: base.players.map((p) =>
      p.id === "p0" ? { ...p, augments: ["nagashi_yakuman"] } : p,
    ),
    round: {
      ...base.round,
      byPlayer: { ...base.round.byPlayer, p0: { ...p0r, discardedKinds: history } },
    },
  };
  const g = createStandardGameFromState(state, undefined, [nagashiYakuman]);
  installAugment(g.engine, nagashiYakuman, "p0", { yaku: g.yaku });
  return g;
}

/** 유국 정산을 흘려 p0의 최종 delta를 얻는다 */
function drawDelta(g: ReturnType<typeof createStandardGameFromState>): number {
  let payload: RoundSettledPayload = {
    outcome: "draw",
    deltas: { p0: 0, p1: 0, p2: 0, p3: 0 },
    dealerSeat: g.engine.state.round.dealerSeat,
    honba: 0,
    riichiPot: 0,
    roundNumber: g.engine.state.round.roundNumber,
    prevalentWind: g.engine.state.round.prevalentWind,
  };
  for (const { intercept } of g.engine.effects.interceptorsFor(ROUND_SETTLED)) {
    const out = intercept(
      { type: ROUND_SETTLED, payload },
      { state: g.engine.state, rules: g.engine.rules },
    );
    if (out !== null) payload = out.payload as RoundSettledPayload;
  }
  return payload.deltas["p0"] ?? 0;
}

describe("성립 — 요구패·자패만 버렸다", () => {
  it("바닥에 그대로 남아 있으면 성립한다", () => {
    expect(drawDelta(game(["man1", "sou9", "wind1"], "1m9s1z"))).toBeGreaterThan(0);
  });

  it("**울려 나가서 바닥이 비어도** 성립한다 — 이 증강이 부수는 규칙이다", () => {
    // 이력에는 요구패 셋이 남아 있고, 바닥은 전부 울려 나가 비었다
    expect(drawDelta(game(["man1", "sou9", "wind1"], ""))).toBeGreaterThan(0);
  });
});

describe("불성립 — 요구패가 아닌 패를 버렸다", () => {
  it("그 패가 바닥에 남아 있으면 성립하지 않는다 (기준선)", () => {
    expect(drawDelta(game(["man1", "pin5"], "1m5p"))).toBe(0);
  });

  it("그 패가 **울려 나가 바닥에서 사라져도** 성립하지 않는다", () => {
    // 예전에는 바닥만 봐서 여기서 역만이 붙었다 — 없던 역만이 생기던 경로
    expect(drawDelta(game(["man1", "pin5"], "1m"))).toBe(0);
  });
});

describe("버림이 하나도 없으면 성립하지 않는다", () => {
  it("이력이 비었으면 0", () => {
    expect(drawDelta(game([], ""))).toBe(0);
  });
});
