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
  evaluateWin,
  installAugment,
  kindOf,
} from "@majak/core";
import type { ActionOption, GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { snakeKan } from "../src/augments/snake_kan.js";
import { brokenWall } from "../src/augments/broken_wall.js";

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

/**
 * 끝없는 윤회(broken_wall)를 함께 들면 9→1을 넘는 4연속도 장사진이다
 * (2026-08-15 사용자 요청: "8912 깡 가능하게").
 */
describe("장사진 + 끝없는 윤회 — 순환 4연속 깡", () => {
  /** p0 손: 8901p가 아니라 8p9p1p2p(순환 4연속) + 나머지. 14장 자기 턴 */
  function wrapScene(augs: string[]): GameState {
    return withAug(
      craft({
        hands: { p0: "8912p123m456m789m1s", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      "p0",
      augs,
    );
  }

  const ranksOf = (game: ReturnType<typeof setup>, o: ActionOption): string =>
    (o.payload as { tileIds: number[] }).tileIds
      .map((id) => kindOf(game.engine.state, id).rank)
      .sort((a, b) => a - b)
      .join(",");

  it("장사진만 있으면 8-9-1-2는 깡이 아니다 (대조군)", () => {
    const game = setup(wrapScene(["snake_kan"]), true);
    installAugment(game.engine, brokenWall, "p1", { yaku: game.yaku }); // 남이 들어도 무관
    expect(ankanOptions(game).map((o) => ranksOf(game, o))).not.toContain("1,2,8,9");
  });

  it("끝없는 윤회를 함께 들면 8-9-1-2 안깡 후보가 선다", () => {
    const game = setup(wrapScene(["snake_kan", "broken_wall"]), true);
    installAugment(game.engine, brokenWall, "p0", { yaku: game.yaku });
    expect(ankanOptions(game).map((o) => ranksOf(game, o))).toContain("1,2,8,9");
  });

  it("채점 대표 3장은 8-9-1이다 (오름차순 1-2-8이 아니라)", () => {
    const game = setup(wrapScene(["snake_kan", "broken_wall"]), true);
    installAugment(game.engine, brokenWall, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("awaiting");
    const opt = (status.prompts.find((p) => p.player === "p0")?.options ?? []).find(
      (o) => o.type === "ankan" && ranksOf(game, o) === "1,2,8,9",
    );
    expect(opt).toBeDefined();
    flow.submit("p0", opt!);

    const st = game.engine.state;
    const hand = st.zones["hand:p0"]?.tileIds ?? [];
    const ctx = buildWinContext(st, "p0", "tsumo", hand.at(-1) as TileId, {
      rules: game.engine.rules,
    });
    for (const v of buildVariants(ctx)) {
      const meldSet = v.sets.find((s) => s.isKan);
      if (meldSet !== undefined) {
        expect(meldSet.type).toBe("run");
        expect(meldSet.tiles.map((t) => t.rank)).toEqual([8, 9, 1]);
      }
    }
  });
});

describe("장사진 — 네 번째 패가 역 판정에서 사라지지 않는다 (QA 2026-08-20)", () => {
  /**
   * 4연속 깡의 채점 대표는 앞 3장(6-7-8만)이라, 남는 9만이 `allKinds`에서 빠져
   * **9만이 든 손에 탕야오가** 붙었다(qa-lab text 확정 22). 대표에 없는 종류를
   * 되돌려 주는 `setKinds`로 막았다.
   */
  function winYaku(handSpec: string, kanSpec: string): string[] {
    const base = craft({
      hands: { p0: handSpec, p1: "*", p2: "*", p3: "*" },
      melds: { p0: [{ kind: "kan_closed" as const, spec: kanSpec }] },
      phase: "turn.act",
      turnSeat: 0,
    });
    const game = createStandardGameFromState(withAug(base, "p0", ["snake_kan"]));
    installAugment(game.engine, snakeKan, "p0");
    const st = game.engine.state;
    const winTile = (st.zones["hand:p0"]?.tileIds ?? []).at(-1) as TileId;
    const ctx = buildWinContext(st, "p0", "tsumo", winTile, { rules: game.engine.rules });
    return (evaluateWin(ctx, game.yaku)?.yaku ?? []).map((y) => y.id);
  }

  it("9만이 든 장사진(6-7-8-9만)에는 탕야오가 붙지 않는다", () => {
    expect(winYaku("234p567p345s22s", "6789m")).not.toContain("tanyao");
  });

  it("1만이 든 장사진(1-2-3-4만)에도 탕야오가 붙지 않는다", () => {
    expect(winYaku("234p567p345s22s", "1234m")).not.toContain("tanyao");
  });

  it("대조군: 중장패만 든 장사진(3-4-5-6통)에는 탕야오가 그대로 붙는다", () => {
    expect(winYaku("234p567p345s22s", "3456p")).toContain("tanyao");
  });
});
