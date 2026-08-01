/**
 * 강제 배패(증강 테스트 손패 지정) 단위 테스트.
 *
 * 검증: 지정한 종류가 그 좌석 손에 들어간다 · 패 총량·왕패가 흐트러지지 않는다 ·
 *       일부만 지정하면 나머지는 무작위로 채워진다 · 남은 사본이 없으면 조용히 건너뛴다 ·
 *       지정이 없으면 기존 배패와 **완전히 동일**하다(회귀 방지).
 */

import { describe, expect, it } from "vitest";
import {
  DEAD_WALL_SIZE,
  createInitialGameState,
  setupRound,
} from "../src/engine/state/GameState.js";
import type { GameState } from "../src/engine/state/GameState.js";
import { DEAD_WALL, WALL, handZone } from "../src/engine/zones/Zone.js";
import { kindKey } from "../src/mahjong/tiles/Tile.js";

const PLAYERS = ["p0", "p1", "p2", "p3"];

function fresh(): GameState {
  return createInitialGameState(
    { seed: 12345, playerIds: PLAYERS },
    { startScore: 25000, redFivesPerSuit: 1 },
  );
}

/** 손패를 kindKey 목록으로 (정렬 없이 배패 순서 그대로) */
function handKeys(state: GameState, player: string): string[] {
  return (state.zones[handZone(player)]?.tileIds ?? []).map((id) =>
    kindKey(state.tiles[id]!.kind),
  );
}

/** 어느 존에도 패가 중복되거나 사라지지 않았는가 */
function totalTiles(state: GameState): number {
  return Object.values(state.zones).reduce((n, z) => n + z.tileIds.length, 0);
}

describe("강제 배패 (deal.presetHand)", () => {
  it("지정한 종류를 그 좌석이 실제로 쥔다", () => {
    const want = ["man1", "man2", "man3", "pin5", "wind1"];
    const state = setupRound(fresh(), { presetHandFor: (id) => (id === "p0" ? want : undefined) });
    expect(handKeys(state, "p0").slice(0, want.length)).toEqual(want);
  });

  it("패 총량·왕패 크기가 그대로다 (남은 장수·도라가 어긋나지 않는다)", () => {
    const plain = setupRound(fresh());
    const preset = setupRound(fresh(), {
      presetHandFor: () => ["sou9", "sou9", "sou9", "dragon1"],
    });
    expect(totalTiles(preset)).toBe(totalTiles(plain));
    expect(preset.zones[DEAD_WALL]!.tileIds).toHaveLength(DEAD_WALL_SIZE);
    for (const p of PLAYERS) expect(preset.zones[handZone(p)]!.tileIds).toHaveLength(13);
    // 패 id는 어느 존에도 중복되지 않는다
    const all = Object.values(preset.zones).flatMap((z) => z.tileIds);
    expect(new Set(all).size).toBe(all.length);
  });

  it("일부만 지정하면 나머지 자리는 그대로 채워진다", () => {
    const state = setupRound(fresh(), { presetHandFor: (id) => (id === "p1" ? ["pin1"] : []) });
    expect(handKeys(state, "p1")).toHaveLength(13);
    expect(handKeys(state, "p1")[0]).toBe("pin1");
  });

  it("한 종류를 5장 요구해도 세상에 있는 만큼만 들어간다 (없는 자리는 무작위)", () => {
    const state = setupRound(fresh(), {
      presetHandFor: (id) => (id === "p0" ? ["man7", "man7", "man7", "man7", "man7"] : []),
    });
    const got = handKeys(state, "p0").filter((k) => k === "man7").length;
    expect(got).toBeGreaterThanOrEqual(3); // 왕패로 샌 사본이 없으면 4장
    expect(got).toBeLessThanOrEqual(4);
    expect(handKeys(state, "p0")).toHaveLength(13);
  });

  it("다른 좌석이 이미 쥔 패도 가져오고, 뺏긴 좌석은 패산에서 다시 채운다", () => {
    // 한 종류 4장을 다 요구하면 남의 손에 간 사본까지 회수해야 한다
    const state = setupRound(fresh(), {
      presetHandFor: (id) => (id === "p0" ? ["pin3", "pin3", "pin3", "pin3"] : []),
    });
    for (const p of PLAYERS) expect(handKeys(state, p)).toHaveLength(13);
    const all = Object.values(state.zones).flatMap((z) => z.tileIds);
    expect(new Set(all).size).toBe(all.length);
  });

  it("여러 좌석이 같은 패를 요구하면 친부터 가져간다 (결정적)", () => {
    const state = setupRound(fresh(), { presetHandFor: () => ["dragon3", "dragon3", "dragon3"] });
    const counts = PLAYERS.map((p) => handKeys(state, p).filter((k) => k === "dragon3").length);
    expect(counts[0]).toBe(3); // 친(p0)이 요구한 3장을 먼저 확보
    // 남은 사본은 왕패에 있을 수 있어 총합은 4장 이하 (왕패는 건드리지 않는다)
    expect(counts.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(4);
  });

  it("왕패 영상패로 샌 사본도 회수한다 — 도라 표시패는 그대로 (2026-08-01)", () => {
    // 한 종류 4장을 요구하면 어느 시드에서는 사본 하나가 왕패로 간다.
    // 영상패(앞 4장)에 있으면 회수하고, 표시패(뒤 10장)는 끝까지 건드리지 않는다.
    for (const seed of [1, 2, 3, 5, 8, 13, 21, 34, 55, 12345]) {
      const base = createInitialGameState(
        { seed, playerIds: PLAYERS },
        { startScore: 25000, redFivesPerSuit: 1 },
      );
      const plain = setupRound(base);
      const preset = setupRound(base, {
        presetHandFor: (id) => (id === "p0" ? ["sou5", "sou5", "sou5", "sou5"] : []),
      });
      const got = handKeys(preset, "p0").filter((k) => k === "sou5").length;
      const inIndicators = plain.zones[DEAD_WALL]!.tileIds.slice(4).filter(
        (id) => kindKey(plain.tiles[id]!.kind) === "sou5",
      ).length;
      // 표시패 블록에 숨은 사본만 못 가져온다
      expect(got, `seed ${seed}`).toBe(4 - inIndicators);
      // 도라 표시패는 한 장도 바뀌지 않았다
      expect(preset.round.doraIndicators).toEqual(plain.round.doraIndicators);
      expect(preset.zones[DEAD_WALL]!.tileIds.slice(4)).toEqual(
        plain.zones[DEAD_WALL]!.tileIds.slice(4),
      );
      expect(preset.zones[DEAD_WALL]!.tileIds).toHaveLength(DEAD_WALL_SIZE);
      const all = Object.values(preset.zones).flatMap((z) => z.tileIds);
      expect(new Set(all).size).toBe(all.length);
    }
  });

  it("14장을 지정하면 마지막 한 장이 그 좌석의 첫 쯔모가 된다", () => {
    const want = [
      "man1", "man2", "man3", "man4", "man5", "man6", "man7",
      "pin1", "pin2", "pin3", "sou1", "sou2", "sou3", "dragon2",
    ];
    const state = setupRound(fresh(), { presetHandFor: (id) => (id === "p0" ? want : []) });
    expect(handKeys(state, "p0")).toEqual(want.slice(0, 13));
    const first = state.zones[WALL]!.tileIds[0]!;
    expect(kindKey(state.tiles[first]!.kind)).toBe("dragon2");
    for (const p of PLAYERS) expect(handKeys(state, p)).toHaveLength(13);
    const all = Object.values(state.zones).flatMap((z) => z.tileIds);
    expect(new Set(all).size).toBe(all.length);
  });

  it("자(子) 좌석의 14번째 지정은 그 좌석의 첫 쯔모 자리에 들어간다", () => {
    // 친(p0)부터 한 장씩 뽑으므로 p2의 첫 쯔모는 패산 index 2다
    const want = [
      "man1", "man1", "man2", "man2", "man3", "man3", "man4",
      "man4", "pin7", "pin7", "sou8", "sou8", "wind3", "dragon3",
    ];
    const state = setupRound(fresh(), { presetHandFor: (id) => (id === "p2" ? want : []) });
    const wall = state.zones[WALL]!.tileIds;
    expect(kindKey(state.tiles[wall[2]!]!.kind)).toBe("dragon3");
    for (const p of PLAYERS) expect(handKeys(state, p)).toHaveLength(13);
  });

  it("지정이 없으면 배패가 기존과 한 장도 다르지 않다", () => {
    const plain = setupRound(fresh());
    const empty = setupRound(fresh(), { presetHandFor: () => [] });
    for (const p of PLAYERS) {
      expect(empty.zones[handZone(p)]!.tileIds).toEqual(plain.zones[handZone(p)]!.tileIds);
    }
    expect(empty.zones[WALL]!.tileIds).toEqual(plain.zones[WALL]!.tileIds);
  });
});
