import { describe, expect, it } from "vitest";
import {
  DEAD_WALL,
  WALL,
  discardsZone,
  handZone,
  meldsZone,
} from "../src/engine/zones/Zone.js";
import {
  DEAD_WALL_SIZE,
  FIRST_DORA_INDEX,
  HAND_START_SIZE,
  createInitialGameState,
  setupRound,
} from "../src/engine/state/GameState.js";
import type { GameState } from "../src/engine/state/GameState.js";

const PLAYERS = ["p0", "p1", "p2", "p3"];

function newGame(seed = 42): GameState {
  return createInitialGameState(
    { seed, playerIds: [...PLAYERS] },
    { startScore: 25000, redFivesPerSuit: 1 },
  );
}

describe("createInitialGameState", () => {
  it("플레이어 4명, 25000점, 표준 Zone 14개, 136장 전부 wall", () => {
    const state = newGame();
    expect(state.players).toHaveLength(4);
    for (const p of state.players) {
      expect(p.score).toBe(25000);
      expect(p.augments).toEqual([]);
    }
    expect(Object.keys(state.zones)).toHaveLength(14);
    expect(state.zones[WALL]?.tileIds).toHaveLength(136);
    expect(state.round.phase).toBe("setup");
  });

  it("중복 플레이어 id는 실패", () => {
    expect(() =>
      createInitialGameState(
        { seed: 1, playerIds: ["a", "a", "b", "c"] },
        { startScore: 25000, redFivesPerSuit: 1 },
      ),
    ).toThrow("Duplicate");
  });

  it("JSON 직렬화 왕복이 무손실이다 (스냅샷·리플레이의 전제)", () => {
    const state = setupRound(newGame());
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});

describe("setupRound", () => {
  it("배패 후 분포: wall 70, deadWall 14, 손패 13×4, 버림·멜드 0", () => {
    const state = setupRound(newGame());
    expect(state.zones[WALL]?.tileIds).toHaveLength(70);
    expect(state.zones[DEAD_WALL]?.tileIds).toHaveLength(DEAD_WALL_SIZE);
    for (const p of PLAYERS) {
      expect(state.zones[handZone(p)]?.tileIds).toHaveLength(HAND_START_SIZE);
      expect(state.zones[discardsZone(p)]?.tileIds).toHaveLength(0);
      expect(state.zones[meldsZone(p)]?.tileIds).toHaveLength(0);
    }
  });

  it("패는 보존된다 — 전 Zone 합집합이 정확히 136장", () => {
    const state = setupRound(newGame());
    const all = Object.values(state.zones).flatMap((z) => z.tileIds);
    expect(all).toHaveLength(136);
    expect(new Set(all).size).toBe(136);
  });

  it("첫 도라 표시패는 deadWall 규약 인덱스의 패다", () => {
    const state = setupRound(newGame());
    expect(state.round.doraIndicators).toEqual([
      state.zones[DEAD_WALL]?.tileIds[FIRST_DORA_INDEX],
    ]);
  });

  it("친의 쯔모 대기 상태로 시작한다", () => {
    const state = setupRound(newGame());
    expect(state.round.phase).toBe("turn.draw");
    expect(state.round.turnSeat).toBe(state.round.dealerSeat);
    expect(state.round.turnCount).toBe(0);
  });

  it("같은 시드 → 같은 배패, 다른 시드 → 다른 배패 (결정론)", () => {
    const a = setupRound(newGame(7));
    const b = setupRound(newGame(7));
    const c = setupRound(newGame(8));
    expect(a.zones).toEqual(b.zones);
    expect(a.zones).not.toEqual(c.zones);
  });

  it("PRNG 상태가 전진한다 (다음 난수 소비 지점과 이어짐)", () => {
    const before = newGame();
    const after = setupRound(before);
    expect(after.prngState).not.toBe(before.prngState);
  });

  it("순수 함수 — 원본 상태는 불변", () => {
    const before = newGame();
    setupRound(before);
    expect(before.zones[WALL]?.tileIds).toHaveLength(136);
    expect(before.round.phase).toBe("setup");
  });
});
