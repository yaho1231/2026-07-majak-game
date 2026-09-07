/**
 * 무너진 국경(broken_border) × 장사진(snake_kan) — 함께 들었을 때 (2026-09-07 확인).
 *
 * 둘 다 «몸통의 모양»을 바꾸지만 담당이 갈려 있다:
 * - 무너진 국경은 **슌쯔의 무늬 제한**(`scoring.mixedRuns`)을 그 국 동안 지운다.
 * - 장사진은 **깡의 재료**(`call.snakeKan` → `isRunQuad`)를 연속 4장까지 넓힌다.
 *
 * 그래서 함께 들면 «혼색 슌쯔로 화료하면서 4연속 깡을 친다»가 되고, 그 조합이 실제로
 * 서는지가 이 파일이 지키는 선이다. 반대로 **혼색 4연속은 장사진 깡이 되지 않는다** —
 * `isRunQuad`가 같은 무늬를 요구하고, 무너진 국경은 깡(`call.*`)을 건드리지 않는다.
 * 이건 사고가 아니라 담당의 경계이므로, 조용히 뒤집히지 않게 함께 못 박아 둔다.
 */

import { describe, expect, it } from "vitest";
import { FlowController, createStandardGameFromState, installAugment, kindOf } from "@majak/core";
import type { ActionOption, GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { snakeKan } from "../src/augments/snake_kan.js";
import { brokenBorder } from "../src/augments/broken_border.js";

function withAug(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === player ? { ...p, augments: [...ids] } : p)),
  };
}

function setup(state: GameState): ReturnType<typeof createStandardGameFromState> {
  const game = createStandardGameFromState(withAug(state, "p0", ["snake_kan", "broken_border"]));
  installAugment(game.engine, snakeKan, "p0", { yaku: game.yaku });
  installAugment(game.engine, brokenBorder, "p0", { yaku: game.yaku });
  return game;
}

function options(game: ReturnType<typeof createStandardGameFromState>): ActionOption[] {
  const status = new FlowController(game.engine).begin();
  if (status.kind !== "awaiting") throw new Error(`expected awaiting, got ${status.kind}`);
  return status.prompts.find((p) => p.player === "p0")?.options ?? [];
}

/** 안깡 후보를 「3만4만5만6만」처럼 사람이 읽는 문자열로 편다 */
function ankanShapes(game: ReturnType<typeof createStandardGameFromState>): string[] {
  return options(game)
    .filter((o) => o.type === "ankan")
    .map((o) =>
      (o.payload as { tileIds: TileId[] }).tileIds
        .map((id) => {
          const k = kindOf(game.engine.state, id);
          return `${k.rank ?? ""}${k.suit}`;
        })
        .join(""),
    );
}

describe("무너진 국경 × 장사진", () => {
  it("무너진 국경을 선언해도 장사진 깡은 같은 무늬 연속 4장뿐이다", () => {
    // 손패에 혼색 연속 4장(3만·4통·5삭·6만)과 같은 무늬 연속(1~6만)이 함께 있다.
    const game = setup(
      craft({
        hands: { p0: "3m4p5s6m123m456m1s", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
    );
    expect(game.engine.submit({ player: "p0", type: "declare_broken_border", payload: {} }).ok).toBe(
      true,
    );
    const shapes = ankanShapes(game);
    // 같은 무늬 연속은 그대로 후보다
    expect(shapes).toContain("3man4man5man6man");
    // 혼색 연속(3만4통5삭6만)은 후보에 없다 — 무너진 국경은 깡을 건드리지 않는다
    expect(shapes.every((sh) => new Set(sh.match(/[a-z]+/g)).size === 1)).toBe(true);
  });

  it("장사진 깡을 세운 손이 혼색 슌쯔로 화료한다", () => {
    // 3456통 장사진 깡 + 손패는 혼색 슌쯔 둘 + 커쯔 + 머리 (11장)
    const game = setup(
      craft({
        hands: { p0: "2m3p4s5m6p7s9m9m9m1z1z", p1: "*", p2: "*", p3: "*" },
        melds: { p0: [{ kind: "kan_closed", spec: "3456p" }] },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
    );
    // 선언 전에는 혼색 슌쯔가 몸통이 아니라 화료가 서지 않는다
    expect(options(game).some((o) => o.type === "win")).toBe(false);
    expect(game.engine.submit({ player: "p0", type: "declare_broken_border", payload: {} }).ok).toBe(
      true,
    );
    expect(options(game).some((o) => o.type === "win")).toBe(true);
  });
});
