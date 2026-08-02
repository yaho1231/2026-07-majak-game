/**
 * 뒤집힌 모래시계 (hourglass) — 유국 거부 + 왕패 솔로 쯔모.
 *  1. 유국 순간 텐파이면 정산이 연장으로 대체된다(왕패 4장 → 패산, 턴은 홀더).
 *  2. 노텐이면 그대로 유국 정산된다.
 *  3. 연장 후 두 번째 유국은 그대로 정산된다(무한 연장 없음).
 */

import { describe, expect, it } from "vitest";
import {
  DEAD_WALL,
  ROUND_SETTLED,
  SYSTEM_PLAYER,
  WALL,
  createStandardGameFromState,
  installAugment,
  playerOf,
} from "@majak/core";
import type { GameEvent, GameState, PlayerId } from "@majak/core";
import { craft } from "./helpers.js";
import { hourglass } from "../src/augments/hourglass.js";

function withAug(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === player ? { ...p, augments: [...ids] } : p)),
  };
}

/** 벽을 비운 유국 직전 상태. p0 손패를 지정해 텐파이/노텐을 조절한다. */
function scene(p0Hand: string): GameState {
  const base = craft({
    hands: { p0: p0Hand, p1: "*", p2: "*", p3: "*" },
    phase: "turn.draw",
    turnSeat: 1,
  });
  const s = withAug(base, "p0", ["hourglass"]);
  return { ...s, zones: { ...s.zones, [WALL]: { ...s.zones[WALL]!, tileIds: [] } } };
}

function setup(state: GameState) {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, hourglass, "p0", { yaku: game.yaku });
  return game;
}

function settled(game: ReturnType<typeof setup>): boolean {
  return game.engine.eventLog.some((e: GameEvent) => e.type === ROUND_SETTLED);
}

describe("뒤집힌 모래시계 (hourglass)", () => {
  it("유국 순간 텐파이면 연장된다 — 왕패 4장이 패산으로, 턴은 홀더", () => {
    // 123m456m789m11p23p = 1p/4p 대기 텐파이(13장)
    const game = setup(scene("123m456m789m11p23p"));
    const deadBefore = game.engine.state.zones[DEAD_WALL]!.tileIds.length;

    const r = game.engine.submit({ player: SYSTEM_PLAYER, type: "sys.settleDraw", payload: {} });
    expect(r.ok).toBe(true);

    const st = game.engine.state;
    // 유국 정산이 일어나지 않았다 (연장으로 대체)
    expect(settled(game)).toBe(false);
    // 왕패 4장이 패산으로 넘어왔다
    expect(st.zones[WALL]!.tileIds.length).toBe(4);
    expect(st.zones[DEAD_WALL]!.tileIds.length).toBe(deadBefore - 4);
    // 턴이 홀더에게, 페이즈는 쯔모
    expect(st.round.turnSeat).toBe(playerOf(st, "p0").seat);
    expect(st.round.phase).toBe("turn.draw");
    // 쿨다운 기준점이 찍혔다 (2국에 1회 — 이 국 시퀀스를 기록한다)
    expect(typeof st.augmentData["hourglass:usedSeq:p0"]).toBe("number");
  });

  it("노텐이면 그대로 유국 정산된다", () => {
    const game = setup(scene("19m19p19s1234z55m"));
    const r = game.engine.submit({ player: SYSTEM_PLAYER, type: "sys.settleDraw", payload: {} });
    expect(r.ok).toBe(true);
    expect(settled(game)).toBe(true);
    expect(game.engine.state.augmentData["hourglass:usedSeq:p0"]).toBeUndefined();
  });

  it("연장 후 두 번째 유국은 그대로 정산된다 (무한 연장 없음)", () => {
    const game = setup(scene("123m456m789m11p23p"));
    game.engine.submit({ player: SYSTEM_PLAYER, type: "sys.settleDraw", payload: {} });
    // 연장분 4장을 비워 두 번째 유국을 만든다
    const st = game.engine.state;
    const drained: GameState = {
      ...st,
      zones: { ...st.zones, [WALL]: { ...st.zones[WALL]!, tileIds: [] } },
      round: { ...st.round, phase: "turn.draw" },
    };
    const game2 = createStandardGameFromState(drained);
    installAugment(game2.engine, hourglass, "p0", { yaku: game2.yaku });
    const r = game2.engine.submit({ player: SYSTEM_PLAYER, type: "sys.settleDraw", payload: {} });
    expect(r.ok).toBe(true);
    expect(game2.engine.eventLog.some((e: GameEvent) => e.type === ROUND_SETTLED)).toBe(true);
  });

  /**
   * 2026-08-02 상향: "동풍1/반장2"에서 **2국에 1회**로 바뀌었다.
   * 쿨다운은 국 시퀀스(`hourglass:seq:*`) - 마지막 사용(`usedSeq`) >= 2 로 판정한다.
   */
  it("직전 국에 썼으면 쿨다운이라 그대로 정산된다", () => {
    const s = scene("123m456m789m11p23p");
    const game = setup({
      ...s,
      augmentData: { ...s.augmentData, "hourglass:seq:p0": 1, "hourglass:usedSeq:p0": 0 },
    });
    expect(
      game.engine.submit({ player: SYSTEM_PLAYER, type: "sys.settleDraw", payload: {} }).ok,
    ).toBe(true);
    expect(settled(game)).toBe(true);
  });

  it("2국이 지나면 다시 연장된다", () => {
    const s = scene("123m456m789m11p23p");
    const game = setup({
      ...s,
      augmentData: { ...s.augmentData, "hourglass:seq:p0": 2, "hourglass:usedSeq:p0": 0 },
    });
    expect(
      game.engine.submit({ player: SYSTEM_PLAYER, type: "sys.settleDraw", payload: {} }).ok,
    ).toBe(true);
    expect(settled(game)).toBe(false);
  });
});
