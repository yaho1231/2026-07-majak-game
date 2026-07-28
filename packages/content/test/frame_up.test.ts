/**
 * 누명 (frame_up) — 내 버림을 상대 명의로 심는다.
 *  1. 패가 지목 대상의 바닥으로 가고, 그 사람의 후리텐 이력(discardedKinds)에 새겨진다.
 *  2. 손패 출처·방총 책임(lastDiscard.player)은 실제로 버린 나 그대로다.
 *  3. 내 바닥·내 이력에는 남지 않는다(내 후리텐 회피).
 *  4. 자기 자신 지목·리치 중은 거부된다.
 */

import { describe, expect, it } from "vitest";
import {
  createStandardGameFromState,
  discardsZone,
  handIdsOf,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { frameUp } from "../src/augments/frame_up.js";

const M3 = kindKey({ suit: "man", rank: 3 });

function withAug(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...ids] } : p,
    ),
  };
}

function scene(riichi = false): GameState {
  const base = craft({
    hands: { p0: "3m123m456m789m11p", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const s = withAug(base, "p0", ["frame_up"]);
  if (!riichi) return s;
  return {
    ...s,
    round: {
      ...s.round,
      byPlayer: {
        ...s.round.byPlayer,
        p0: { ...s.round.byPlayer["p0"]!, riichi: { double: false, ippatsu: false, discardIndex: 0 } },
      },
    },
  };
}

function setup(state: GameState) {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, frameUp, "p0", { yaku: game.yaku });
  return game;
}

function findTile(game: ReturnType<typeof setup>, key: string): TileId {
  const st = game.engine.state;
  return handIdsOf(st, "p0").find((id) => kindKey(kindOf(st, id)) === key) as TileId;
}

describe("누명 (frame_up)", () => {
  it("심은 패가 대상의 바닥·후리텐 이력에 기록된다", () => {
    const game = setup(scene());
    const tile = findTile(game, M3);
    const r = game.engine.submit({
      player: "p0",
      type: "frame_discard",
      payload: { tileId: tile, target: "p1" },
    });
    expect(r.ok).toBe(true);

    const st = game.engine.state;
    // 대상 바닥에 패가 있다
    expect(st.zones[discardsZone("p1")]?.tileIds).toContain(tile);
    // 대상의 후리텐 이력에 새겨졌다
    expect(st.round.byPlayer["p1"]?.discardedKinds).toContain(M3);
    // 내 바닥·이력에는 없다 (내 후리텐 회피)
    expect(st.zones[discardsZone("p0")]?.tileIds ?? []).not.toContain(tile);
    expect(st.round.byPlayer["p0"]?.discardedKinds ?? []).not.toContain(M3);
    // 손패에서는 빠졌다 (표준 버림과 동일)
    expect(handIdsOf(st, "p0")).not.toContain(tile);
    // 방총 책임은 실제 버린 나 — lastDiscard.player = p0
    expect(st.round.lastDiscard?.player).toBe("p0");
    expect(st.round.lastDiscard?.tileId).toBe(tile);
    // 사용 카운터 소진
    expect(st.augmentData["frame_up:uses:p0"]).toBe(1);
  });

  it("자기 자신은 지목할 수 없다", () => {
    const game = setup(scene());
    const tile = findTile(game, M3);
    expect(
      game.engine.submit({
        player: "p0",
        type: "frame_discard",
        payload: { tileId: tile, target: "p0" },
      }).ok,
    ).toBe(false);
  });

  it("리치 중에는 발동할 수 없다", () => {
    const game = setup(scene(true));
    const tile = findTile(game, M3);
    expect(
      game.engine.submit({
        player: "p0",
        type: "frame_discard",
        payload: { tileId: tile, target: "p1" },
      }).ok,
    ).toBe(false);
  });

  it("대조군: creditTo 없는 표준 버림은 내 바닥·내 이력에 남는다", () => {
    const game = setup(scene());
    const tile = findTile(game, M3);
    game.engine.submit({ player: "p0", type: "discard", payload: { tileId: tile } });
    const st = game.engine.state;
    expect(st.zones[discardsZone("p0")]?.tileIds).toContain(tile);
    expect(st.round.byPlayer["p0"]?.discardedKinds).toContain(M3);
    expect(st.round.byPlayer["p1"]?.discardedKinds ?? []).not.toContain(M3);
  });
});
