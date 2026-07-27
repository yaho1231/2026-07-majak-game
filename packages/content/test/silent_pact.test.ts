/**
 * 묵계 (silent_pact) — 멘젠 유지 퐁.
 *  1. 리액션에서 silent_pon이 제시되고, 발동하면 silent:true 멜드가 생긴다.
 *  2. 그 멜드는 멘젠을 깨지 않는다 — openMeldCountOf === 0, 채점 isClosed 유지.
 *  3. 국당 1회.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  buildWinContext,
  buildVariants,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { silentPact } from "../src/augments/silent_pact.js";

/** 멘젠을 깨는(열린) 멜드 수 — 안깡·묵계(silent)는 제외 (helpers.openMeldCountOf 규칙) */
function openMelds(state: GameState, id: PlayerId): number {
  return (state.round.byPlayer[id]?.melds ?? []).filter(
    (m) => m.kind !== "kan_closed" && m.silent !== true,
  ).length;
}

function withAug(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...ids] } : p,
    ),
  };
}

/** p1이 2m을 버린 reaction 국면. p0는 2m 두 장 + 나머지 손패 + 묵계 보유. */
function scene(): GameState {
  const base = craft({
    hands: { p0: "22m234p567p789p55s", p1: "*", p2: "*", p3: "*" },
    phase: "reaction",
    turnSeat: 1,
    lastDiscard: { player: "p1", spec: "2m" },
  });
  return withAug(base, "p0", ["silent_pact"]);
}

function startFlow(state: GameState) {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, silentPact, "p0", { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  return { game, flow, status };
}

describe("묵계 (silent_pact)", () => {
  it("리액션에 silent_pon이 제시된다", () => {
    const { status } = startFlow(scene());
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const p0 = status.prompts.find((p) => p.player === "p0");
    expect(p0?.options.some((o) => o.type === "silent_pon")).toBe(true);
  });

  it("발동하면 silent 멜드가 생기고 멘젠이 유지된다 (openMeldCountOf === 0)", () => {
    const { game, flow, status } = startFlow(scene());
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const p0 = status.prompts.find((p) => p.player === "p0");
    const opt = p0?.options.find((o) => o.type === "silent_pon");
    if (opt === undefined) throw new Error("no silent_pon option");
    flow.submit("p0", opt);

    const melds = game.engine.state.round.byPlayer["p0"]?.melds ?? [];
    expect(melds.length).toBe(1);
    expect(melds[0]?.kind).toBe("pon");
    expect(melds[0]?.silent).toBe(true);
    // 멘젠 유지 — 열린 멜드로 세지 않는다
    expect(openMelds(game.engine.state, "p0")).toBe(0);
  });

  it("silent 멜드가 있어도 채점 isClosed가 유지된다 (멘젠쯔모·멘젠 론 부수)", () => {
    // 묵계 펑(222m) + 234p 567p 789p 55s 완성형. 5s 쯔모 화료 가정.
    const base = craft({
      hands: { p0: "234p567p789p5s5s", p1: "*", p2: "*", p3: "*" },
      melds: { p0: [{ kind: "pon", spec: "222m" }] },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    // 멜드에 silent 표식을 단다 (묵계로 만든 펑)
    const silent: GameState = {
      ...base,
      round: {
        ...base.round,
        byPlayer: {
          ...base.round.byPlayer,
          p0: {
            ...base.round.byPlayer["p0"]!,
            melds: [{ ...base.round.byPlayer["p0"]!.melds[0]!, silent: true }],
          },
        },
      },
    };
    const game = createStandardGameFromState(silent);
    const ctx = buildWinContext(
      game.engine.state,
      "p0",
      "tsumo",
      game.engine.state.zones["hand:p0"]?.tileIds.at(-1) as TileId,
      { rules: game.engine.rules },
    );
    const variants = buildVariants(ctx);
    // 완성형 변형이 하나라도 있고, 전부 isClosed=true (silent 펑이 손을 열지 않음)
    expect(variants.length).toBeGreaterThan(0);
    expect(variants.every((v) => v.isClosed)).toBe(true);
  });

  it("대조군: silent가 아닌 일반 펑은 손을 연다", () => {
    const base = craft({
      hands: { p0: "234p567p789p5s5s", p1: "*", p2: "*", p3: "*" },
      melds: { p0: [{ kind: "pon", spec: "222m" }] },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = createStandardGameFromState(base);
    expect(openMelds(game.engine.state, "p0")).toBe(1);
    const ctx = buildWinContext(
      game.engine.state,
      "p0",
      "tsumo",
      game.engine.state.zones["hand:p0"]?.tileIds.at(-1) as TileId,
      { rules: game.engine.rules },
    );
    const variants = buildVariants(ctx);
    expect(variants.some((v) => v.isClosed)).toBe(false);
  });
});
