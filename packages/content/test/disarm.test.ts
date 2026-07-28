/**
 * 무장해제 (disarm) — 상대 증강을 이번 국 무효화.
 *  1. 지목한 상대 증강의 규칙 Modifier가 이번 국 동안 게이트로 건너뛰어진다.
 *  2. 국 종료(ROUND_SETTLED)에 되돌아온다.
 *  3. 게임당 1회.
 */

import { describe, expect, it } from "vitest";
import {
  DISARMED_SOURCES_KEY,
  SYSTEM_PLAYER,
  augmentInstanceId,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "./helpers.js";
import { disarm } from "../src/augments/disarm.js";
import { alwaysTenpai } from "../src/augments/always_tenpai.js";

function withAug(state: GameState, map: Record<PlayerId, string[]>): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      map[p.id] ? { ...p, augments: [...map[p.id]!] } : p,
    ),
  };
}

/** p0 = disarm, p1 = always_tenpai */
function setup(mode?: "tonpuu" | "hanchan") {
  const crafted = craft({
    hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
  });
  const base =
    mode !== undefined ? { ...crafted, config: { ...crafted.config, mode } } : crafted;
  const state = withAug(base, { p0: ["disarm"], p1: ["always_tenpai"] });
  const game = createStandardGameFromState(state);
  installAugment(game.engine, disarm, "p0", { yaku: game.yaku });
  installAugment(game.engine, alwaysTenpai, "p1", { yaku: game.yaku });
  return game;
}

function treatAsTenpaiP1(game: ReturnType<typeof setup>): boolean {
  return game.engine.rules.resolve<boolean>("draw.treatAsTenpai", {
    playerId: "p1",
    state: game.engine.state,
  });
}

describe("무장해제 (disarm)", () => {
  it("지목 전에는 상대 증강이 정상 작동한다", () => {
    const game = setup();
    expect(treatAsTenpaiP1(game)).toBe(true);
  });

  it("지목하면 상대 증강의 규칙이 이번 국 동안 무효가 된다", () => {
    const game = setup();
    const r = game.engine.submit({
      player: "p0",
      type: "disarm_lock",
      payload: { target: "p1", augmentId: "always_tenpai" },
    });
    expect(r.ok).toBe(true);
    // 대상 인스턴스가 무장해제 목록에 들어갔다
    const list = game.engine.state.augmentData[DISARMED_SOURCES_KEY];
    expect(list).toContain(augmentInstanceId("p1", "always_tenpai"));
    // always_tenpai의 Modifier가 게이트로 건너뛰어져 규칙이 기본값(false)이 된다
    expect(treatAsTenpaiP1(game)).toBe(false);
  });

  it("국이 끝나면 되돌아온다", () => {
    const game = setup();
    game.engine.submit({
      player: "p0",
      type: "disarm_lock",
      payload: { target: "p1", augmentId: "always_tenpai" },
    });
    expect(treatAsTenpaiP1(game)).toBe(false);
    // 국 종료 → disarm의 ROUND_SETTLED 리액션이 해제
    game.engine.submit({ player: SYSTEM_PLAYER, type: "sys.settleAbort", payload: {} });
    expect(game.engine.state.augmentData[DISARMED_SOURCES_KEY]).toEqual([]);
    expect(treatAsTenpaiP1(game)).toBe(true);
  });

  it("동풍전 1회 — 두 번째 지목은 거부된다", () => {
    const game = setup("tonpuu");
    game.engine.submit({
      player: "p0",
      type: "disarm_lock",
      payload: { target: "p1", augmentId: "always_tenpai" },
    });
    const second = game.engine.submit({
      player: "p0",
      type: "disarm_lock",
      payload: { target: "p1", augmentId: "always_tenpai" },
    });
    expect(second.ok).toBe(false);
  });

  it("자기 자신·미보유 증강은 지목할 수 없다", () => {
    const game = setup();
    expect(
      game.engine.submit({ player: "p0", type: "disarm_lock", payload: { target: "p0", augmentId: "always_tenpai" } }).ok,
    ).toBe(false);
    expect(
      game.engine.submit({ player: "p0", type: "disarm_lock", payload: { target: "p1", augmentId: "spy" } }).ok,
    ).toBe(false);
  });
});
