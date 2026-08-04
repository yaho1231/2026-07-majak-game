/**
 * 염색 — 게임 전체 5회 자원 (2026-08-04, 국당 1회에서 연금술사와 같은 구조로 개편).
 * 한 순에 한 번, 게임 전체 5회, 남은 횟수는 보유자 채널로 노출된다.
 */

import { describe, expect, it } from "vitest";
import { createStandardGameFromState, installAugment } from "@majak/core";
import type { GameState, TileId } from "@majak/core";
import { tileDyeing } from "../src/augments/tile_dyeing.js";
import { craft } from "./helpers.js";

/** used = 이미 쓴 횟수 (게임 스코프 카운터를 미리 세팅해 한도를 시험한다) */
function scene(used = 0): GameState {
  const s = craft({
    hands: { p0: "123m456p789s11z2z", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return {
    ...s,
    players: s.players.map((p) => (p.id === "p0" ? { ...p, augments: ["tile_dyeing"] } : p)),
    augmentData: { ...s.augmentData, ...(used > 0 ? { "tile_dyeing:used:p0": used } : {}) },
  };
}

function setup(used = 0): ReturnType<typeof createStandardGameFromState> {
  const game = createStandardGameFromState(scene(used), undefined, [tileDyeing]);
  installAugment(game.engine, tileDyeing, "p0", { yaku: game.yaku });
  return game;
}

function dye(
  game: ReturnType<typeof createStandardGameFromState>,
  idx: number,
  suit: "man" | "pin" | "sou",
): boolean {
  const hand = game.engine.state.zones["hand:p0"]?.tileIds ?? [];
  return game.engine.submit({
    player: "p0",
    type: "tile_dye",
    payload: { tileId: hand[idx] as TileId, suit },
  }).ok;
}

describe("염색 — 게임 전체 5회", () => {
  it("한 순에 두 번은 못 쓴다", () => {
    const game = setup();
    expect(dye(game, 0, "pin")).toBe(true);
    expect(dye(game, 1, "sou")).toBe(false);
  });

  it("이미 5회를 썼으면 막힌다", () => {
    const game = setup(5);
    expect(dye(game, 0, "pin")).toBe(false);
    // 후보 열거에서도 사라진다 (액티브 버튼이 헛돌지 않게)
    const opts = game.engine.turnOptionProviders.flatMap((p) => p(game.engine.state, "p0"));
    expect(opts.some((o) => o.type === "tile_dye")).toBe(false);
  });

  it("4회를 썼으면 마지막 1회는 쓸 수 있고 남은 횟수가 0이 된다", () => {
    const game = setup(4);
    expect(dye(game, 0, "pin")).toBe(true);
    expect(game.engine.state.augmentData["view:p0:tile_dyeing:left"]).toBe(0);
  });

  it("남은 횟수 채널이 국 스코프가 아니라 게임 스코프 키로 실린다", () => {
    const game = setup();
    expect(dye(game, 0, "pin")).toBe(true);
    expect(game.engine.state.augmentData["view:p0:tile_dyeing:left"]).toBe(4);
    // 국이 바뀌어도 지워지지 않아야 하므로 roundKey가 섞이지 않은 고정 키다
    expect(game.engine.state.augmentData["tile_dyeing:used:p0"]).toBe(1);
  });
});
