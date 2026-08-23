/**
 * 남은 사용 횟수 뱃지(`view:{보유자}:uses:{증강id}`)는 **발동한 그 자리에서** 줄어든다.
 *
 * 2026-08-16 사용자 보고: "날치기 남은 횟수가 안 줄어든다", "단색 세계 카운트가 안
 * 줄어든다", "증강들 카운트가 능력 사용하자마자가 아니라 나중에 줄어든다". 셋 다 같은
 * 원인이었다 — `publishUsesLeft`가 쯔모·버림·국 시작 세 이벤트에만 걸려 있어서, 액티브
 * 증강을 쓰는 순간(그 증강의 자기 이벤트)에는 채널이 갱신되지 않고 **다음 쯔모나 버림이
 * 올 때까지** 옛 숫자가 그대로 서 있었다.
 *
 * 이 테스트는 그 계약을 두 방향에서 잠근다:
 *  - 카운터를 이벤트(augmentDataSet)로 올리는 증강 (단색 세계)
 *  - 카운터를 리듀서 안에서 직접 올리는 증강 (날치기 — augmentData 이벤트조차 안 난다)
 */

import { describe, expect, it } from "vitest";
import { createStandardGameFromState, installAugment } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "./helpers.js";
import { pondSnatch } from "../src/augments/pond_snatch.js";
import { suitUnify } from "../src/augments/suit_unify.js";

/** publishUsesLeft가 발행하는 채널의 값 */
function usesLeft(
  state: GameState,
  holder: PlayerId,
  augId: string,
): { left?: number; total?: number; scope?: string } | undefined {
  return state.augmentData[`view:${holder}:uses:${augId}`] as
    | { left?: number; total?: number; scope?: string }
    | undefined;
}

function withAugment(state: GameState, player: PlayerId, id: string): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...p.augments, id] } : p,
    ),
  };
}

describe("남은 사용 횟수는 발동 즉시 갱신된다", () => {
  it("날치기 — 주운 그 자리에서 5회 → 4회 (다음 버림을 기다리지 않는다)", () => {
    const base = craft({
      hands: { p0: "123m456m789m123p3m9p", p1: "*", p2: "*", p3: "*" },
      discards: { p0: "1z", p1: "2z3z3m", p2: "5z", p3: "6z" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = createStandardGameFromState(withAugment(base, "p0", "pond_snatch"));
    installAugment(game.engine, pondSnatch, "p0", { yaku: game.yaku });

    const pond = game.engine.state.zones["discards:p1"]?.tileIds ?? [];
    const snatchId = pond[pond.length - 1];
    const res = game.engine.submit({
      player: "p0",
      type: "pond_snatch",
      payload: { snatchId, fromPlayer: "p1" },
    });
    expect(res.ok, res.ok ? "" : res.reason).toBe(true);

    // 카운터는 리듀서가 올렸고, 뷰 채널도 **같은 제출 안에서** 따라왔다
    expect(game.engine.state.augmentData["pond_snatch:used:p0"]).toBe(1);
    expect(usesLeft(game.engine.state, "p0", "pond_snatch")).toEqual({
      left: 4,
      total: 5,
      scope: "match",
    });
  });

  it("단색 세계 — 물들인 그 자리에서 2회 → 1회", () => {
    const base = craft({
      hands: { p0: "123m456m789p123s99p", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
      seed: 11,
    });
    const game = createStandardGameFromState(withAugment(base, "p0", "suit_unify"));
    installAugment(game.engine, suitUnify, "p0", { yaku: game.yaku });

    const res = game.engine.submit({
      player: "p0",
      type: "mono_world",
      payload: { suit: "pin" },
    });
    expect(res.ok, res.ok ? "" : res.reason).toBe(true);

    // 반장전 기본이라 2회 중 1회를 썼다
    expect(usesLeft(game.engine.state, "p0", "suit_unify")).toEqual({
      left: 1,
      total: 2,
      scope: "match",
    });
  });
});
