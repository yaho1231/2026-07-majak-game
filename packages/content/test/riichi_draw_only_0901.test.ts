/**
 * 리치 중 손패 편집은 **쯔모한 그 한 장**에만 (2026-09-01 사용자 보고).
 *
 * 연금술사·염색은 48차에서 "리치 중에도 쓸 수 있다"로 열렸는데, 리치로 고정된 13장을
 * 바꾸면 대기가 어긋난 채 되돌릴 수단이 없어 그 국은 화료가 불가능해진다. 쯔모패는
 * 어차피 버릴 패라 대기를 건드리지 않는다 — 그 한 장만 대상으로 좁혔다.
 *
 * 딸려 오는 것: 리치의 자동 쯔모기리는 «턴 선택지가 버림 하나뿐일 때»만 서므로
 * (FlowController), 쯔모패가 수패면 증강 후보가 서서 자동으로 안 넘어가고, 자패면
 * 후보가 없어 예전처럼 자동 쯔모기리다. 그 두 갈래를 함께 못 박는다.
 */

import { describe, expect, it } from "vitest";
import { createStandardGameFromState, installAugment } from "@majak/core";
import type { GameState, TileId } from "@majak/core";
import { alchemist } from "../src/augments/alchemist.js";
import { tileDyeing } from "../src/augments/tile_dyeing.js";
import { craft } from "./helpers.js";

/** 쯔모패까지 14장을 들고 turn.act에 선 p0 (riichi=true면 리치 중) */
function scene(hand: string, riichi: boolean): GameState {
  const s = craft({
    hands: { p0: hand, p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return {
    ...s,
    players: s.players.map((p) =>
      p.id === "p0" ? { ...p, augments: ["alchemist", "tile_dyeing"] } : p,
    ),
    round: {
      ...s.round,
      byPlayer: {
        ...s.round.byPlayer,
        p0: {
          ...s.round.byPlayer["p0"]!,
          riichi: riichi ? { double: false, ippatsu: false, discardIndex: 0, cost: 1000 } : null,
        },
      },
    },
  };
}

function setup(hand: string, riichi: boolean): ReturnType<typeof createStandardGameFromState> {
  const game = createStandardGameFromState(scene(hand, riichi), undefined, [
    alchemist,
    tileDyeing,
  ]);
  installAugment(game.engine, alchemist, "p0", { yaku: game.yaku });
  installAugment(game.engine, tileDyeing, "p0", { yaku: game.yaku });
  return game;
}

const handOf = (game: ReturnType<typeof createStandardGameFromState>): TileId[] =>
  game.engine.state.zones["hand:p0"]?.tileIds ?? [];

const augOptions = (game: ReturnType<typeof createStandardGameFromState>): string[] =>
  game.engine.turnOptionProviders
    .flatMap((p) => p(game.engine.state, "p0"))
    .map((o) => o.type);

describe("리치 중 연금술사·염색 — 쯔모패 한정", () => {
  // 마지막 한 장(2z=남)이 쯔모패다. 앞의 13장이 리치로 고정된 손패.
  const HAND = "123m456p789s11z2m";

  it("리치가 아니면 고정 손패도 바꿀 수 있다 (기존 동작)", () => {
    const game = setup(HAND, false);
    const first = handOf(game)[0] as TileId;
    expect(
      game.engine.submit({ player: "p0", type: "alchemy", payload: { tileId: first, delta: 1 } })
        .ok,
    ).toBe(true);
  });

  it("리치 중에는 고정된 손패를 바꿀 수 없다", () => {
    const game = setup(HAND, true);
    const first = handOf(game)[0] as TileId;
    expect(
      game.engine.submit({ player: "p0", type: "alchemy", payload: { tileId: first, delta: 1 } })
        .ok,
    ).toBe(false);
    expect(
      game.engine.submit({ player: "p0", type: "tile_dye", payload: { tileId: first, suit: "pin" } })
        .ok,
    ).toBe(false);
  });

  it("리치 중에도 쯔모패 한 장은 바꿀 수 있다", () => {
    const game = setup(HAND, true);
    const drawn = game.engine.state.round.lastDrawnTile as TileId;
    expect(
      game.engine.submit({ player: "p0", type: "tile_dye", payload: { tileId: drawn, suit: "pin" } })
        .ok,
    ).toBe(true);
  });

  it("리치 중 후보 열거도 쯔모패 하나로 좁혀진다", () => {
    const game = setup(HAND, true);
    const drawn = game.engine.state.round.lastDrawnTile as TileId;
    const opts = game.engine.turnOptionProviders.flatMap((p) => p(game.engine.state, "p0"));
    const targets = opts
      .filter((o) => o.type === "alchemy" || o.type === "tile_dye")
      .map((o) => (o.payload as { tileId: TileId }).tileId);
    expect(targets.length).toBeGreaterThan(0);
    expect(new Set(targets)).toEqual(new Set([drawn]));
  });

  it("쯔모패가 자패면 후보가 없다 — 자동 쯔모기리 경로가 그대로 산다", () => {
    // 마지막 한 장이 2z(남) = 숫자 변동 증강의 대상이 아니다
    const game = setup("123m456p789s2m1z2z", true);
    expect(augOptions(game)).not.toContain("alchemy");
    expect(augOptions(game)).not.toContain("tile_dye");
  });
});
