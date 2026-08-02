/**
 * 적도라 표식이 종류 변경을 따라가던 문제 (docs/25 P1).
 *
 * TILE_KIND_CHANGED 리듀서가 attrs를 그대로 병합해서, 종류를 바꾸는 증강 6종
 * (소환·염색·분열·한 끗 차이·허장성세·미련)이 존재할 수 없는 패를 만들었다 —
 * 적도라 東, 적4·적6, 그리고 **적5통 2장**(적도라 규정은 무늬당 1장).
 * alchemist만 2026-07-29에 개별 수정됐고 나머지에는 안 퍼졌다.
 *
 * 이제 리듀서가 "종류가 실제로 바뀌면 red/redFor를 기본으로 뗀다"를 보장한다.
 */

import { describe, expect, it } from "vitest";
import {
  TILE_KIND_CHANGED,
  createStandardGameFromState,
  handZone,
  installAugment,
  tileKindChanged,
} from "@majak/core";
import type { GameState, TileId } from "@majak/core";
import { tileDyeing } from "../src/augments/tile_dyeing.js";
import { craft } from "./helpers.js";

/** 손패 첫 패를 적도라로 만든 상태 */
function withRedFirstTile(state: GameState): { state: GameState; tileId: TileId } {
  const tileId = state.zones[handZone("p0")]?.tileIds[0] as TileId;
  const tile = state.tiles[tileId];
  if (tile === undefined) throw new Error("no tile");
  return {
    state: {
      ...state,
      tiles: { ...state.tiles, [tileId]: { ...tile, attrs: { ...tile.attrs, red: true } } },
    },
    tileId,
  };
}

function scene(): GameState {
  return craft({
    hands: { p0: "555m567p789p11s22s" },
    phase: "turn.act",
    turnSeat: 0,
  });
}

describe("적도라 표식 × 종류 변경 (docs/25 P1)", () => {
  it("종류가 바뀌면 red·redFor가 떨어진다", () => {
    const { state: s, tileId } = withRedFirstTile(scene());
    const game = createStandardGameFromState({
      ...s,
      tiles: {
        ...s.tiles,
        [tileId]: { ...s.tiles[tileId]!, attrs: { red: true, redFor: "p0" } },
      },
    });

    const before = game.engine.state.tiles[tileId]!;
    expect(before.attrs.red).toBe(true);

    const after = game.engine.reducers.dispatch(game.engine.state, {
      seq: 1,
      type: TILE_KIND_CHANGED,
      payload: tileKindChanged([
        { tileId, kind: { suit: "pin", rank: 5 }, attrs: { conjured: true } },
      ]).payload,
    }).tiles[tileId]!;

    expect(after.kind).toEqual({ suit: "pin", rank: 5 });
    expect(after.attrs.red).toBeUndefined();
    expect(after.attrs.redFor).toBeUndefined();
    expect(after.attrs.conjured).toBe(true);
  });

  it("종류가 그대로면 red는 유지된다 (붉은 손길처럼 attrs만 바꾸는 경로)", () => {
    const { state: s, tileId } = withRedFirstTile(scene());
    const game = createStandardGameFromState(s);

    const after = game.engine.reducers.dispatch(game.engine.state, {
      seq: 1,
      type: TILE_KIND_CHANGED,
      payload: tileKindChanged([{ tileId, attrs: { redFor: "p0" } }]).payload,
    }).tiles[tileId]!;

    expect(after.attrs.red).toBe(true);
    expect(after.attrs.redFor).toBe("p0");
  });

  it("변경 주체가 red를 명시하면 그쪽이 이긴다", () => {
    const { state: s, tileId } = withRedFirstTile(scene());
    const game = createStandardGameFromState(s);

    const after = game.engine.reducers.dispatch(game.engine.state, {
      seq: 1,
      type: TILE_KIND_CHANGED,
      payload: tileKindChanged([
        { tileId, kind: { suit: "sou", rank: 5 }, attrs: { red: true, redFor: "p0" } },
      ]).payload,
    }).tiles[tileId]!;

    expect(after.attrs.red).toBe(true);
  });

  it("염색: 적5만을 통으로 물들여도 '적5통 2장'이 생기지 않는다", () => {
    const { state: s, tileId } = withRedFirstTile(scene());
    const game = createStandardGameFromState(
      { ...s, players: s.players.map((p) => (p.id === "p0" ? { ...p, augments: ["tile_dyeing"] } : p)) },
      undefined,
      [tileDyeing],
    );
    installAugment(game.engine, tileDyeing, "p0", { yaku: game.yaku });

    const res = game.engine.submit({
      player: "p0",
      type: "tile_dye",
      payload: { tileId, suit: "pin" },
    });
    expect(res.ok).toBe(true);

    const t = game.engine.state.tiles[tileId]!;
    expect(t.kind).toEqual({ suit: "pin", rank: 5 });
    expect(t.attrs.red).toBeUndefined();

    // 게임 전체에 적5통은 원래의 1장뿐이어야 한다
    const redPin5 = Object.values(game.engine.state.tiles).filter(
      (x) => x.attrs.red === true && x.kind.suit === "pin" && x.kind.rank === 5,
    ).length;
    expect(redPin5).toBeLessThanOrEqual(1);
  });
});
