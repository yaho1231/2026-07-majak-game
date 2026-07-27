/**
 * 장사진 (snake_kan) — 같은 무늬 연속 4장을 깡으로.
 *  1. 보유자에게만 4연속 안깡 후보가 제시되고, 제출하면 깡 멜드가 선다.
 *  2. 채점에서는 커쯔가 아니라 슌쯔성 몸통으로 나간다(또이또이·삼색동각 오판 방지).
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  buildVariants,
  buildWinContext,
  createStandardGameFromState,
  installAugment,
  kindOf,
} from "@majak/core";
import type { ActionOption, GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { snakeKan } from "../src/augments/snake_kan.js";

function withAug(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === player ? { ...p, augments: [...ids] } : p)),
  };
}

/** p0 손: 3456p(연속 4장) + 나머지. drawnLastFor로 14장 자기 턴 */
function scene(withSnake: boolean): GameState {
  const base = craft({
    hands: { p0: "3456p123m456m789m1s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return withSnake ? withAug(base, "p0", ["snake_kan"]) : base;
}

function setup(state: GameState, install: boolean) {
  const game = createStandardGameFromState(state);
  if (install) installAugment(game.engine, snakeKan, "p0", { yaku: game.yaku });
  return game;
}

function ankanOptions(game: ReturnType<typeof setup>): ActionOption[] {
  const status = new FlowController(game.engine).begin();
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  return (status.prompts.find((p) => p.player === "p0")?.options ?? []).filter(
    (o) => o.type === "ankan",
  );
}

describe("장사진 (snake_kan)", () => {
  it("보유자는 같은 무늬 연속 4장을 안깡으로 낼 수 있다", () => {
    const game = setup(scene(true), true);
    const opts = ankanOptions(game);
    const snake = opts.find((o) => {
      const ids = (o.payload as { tileIds: number[] }).tileIds;
      const ranks = ids.map((id) => kindOf(game.engine.state, id)).map((k) => k.rank).sort();
      return ids.length === 4 && ranks.join(",") === "3,4,5,6";
    });
    expect(snake).toBeDefined();
  });

  it("보유하지 않으면 4연속 안깡 후보가 없다 (대조군)", () => {
    const game = setup(scene(false), false);
    expect(ankanOptions(game)).toHaveLength(0);
  });

  it("제출하면 깡 멜드가 서고, 채점에서 슌쯔성 몸통으로 나간다", () => {
    const game = setup(scene(true), true);
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("awaiting");
    const opt = (status.prompts.find((p) => p.player === "p0")?.options ?? []).find(
      (o) => o.type === "ankan",
    );
    expect(opt).toBeDefined();
    flow.submit("p0", opt!);

    const melds = game.engine.state.round.byPlayer["p0"]?.melds ?? [];
    const kan = melds.find((m) => m.kind === "kan_closed");
    expect(kan).toBeDefined();

    // 채점: 커쯔가 아니라 run으로 나가야 한다 (커쯔면 또이또이·삼색동각 오판)
    const st = game.engine.state;
    const hand = st.zones["hand:p0"]?.tileIds ?? [];
    const ctx = buildWinContext(st, "p0", "tsumo", hand.at(-1) as TileId, {
      rules: game.engine.rules,
    });
    const kanSet = ctx.melds.find((m) => m.kind === "kan_closed");
    expect(kanSet).toBeDefined();
    const variants = buildVariants(ctx);
    for (const v of variants) {
      const meldSet = v.sets.find((s) => s.isKan);
      if (meldSet !== undefined) {
        expect(meldSet.type).toBe("run");
        // 대표 3장이 실제로 연속이다
        const ranks = meldSet.tiles.map((t) => t.rank);
        expect(ranks).toEqual([3, 4, 5]);
      }
    }
  });
});
