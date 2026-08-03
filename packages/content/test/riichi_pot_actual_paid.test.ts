/**
 * 리치 공탁은 **실제로 낸 만큼만** 돌려받는다 (docs/25 최우선#2).
 *
 * 환급액이 규칙 상수 `riichi.cost`(1000) 고정이라, 공탁을 내지 않는 리치
 * (스텔스 리치 — `riichiCost: 0`)가 1000점을 그대로 받아 갔다. 두 경로:
 *   ① 리치 선언패를 그대로 론당했을 때의 "리치 불성립" 환급
 *   ② 승부수(last_stand)의 리치 취소 환급
 *
 * ②는 공탁이 비어 있으면 riichiPot을 **음수**로 만들어, 그 국 화료자가
 * `deltas[winner] += riichiPot`으로 되레 점수를 뺏겼다.
 *
 * 사용자 확정 규칙(2026-08-03): 공탁을 안 내는 증강은 **있는 공탁금만** 받는다.
 *   - 본인만 스텔스 리치 → 공탁 0
 *   - 본인 스텔스 + 남이 정상 리치 → 남이 낸 공탁만 받는다
 */

import { describe, expect, it } from "vitest";
import {
  createStandardGameFromState,
  handIdsOf,
  installAugment,
  kindOf,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { stealthRiichi } from "../src/augments/stealth_riichi.js";
import { lastStand } from "../src/augments/last_stand.js";

type Game = ReturnType<typeof createStandardGameFromState>;

function withAug(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...p.augments, ...ids] } : p,
    ),
  };
}

/** p0가 텐파이로 자기 순을 맞은 국면 (공탁 이월액은 pot으로 지정) */
function scene(pot: number, augs: string[]): Game {
  const base = craft({
    hands: { p0: "123m456m789m11p234p", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const state: GameState = {
    ...withAug(base, "p0", augs),
    round: { ...base.round, riichiPot: pot },
  };
  const defs = [stealthRiichi, lastStand].filter((d) => augs.includes(d.id));
  const game = createStandardGameFromState(state, undefined, defs);
  for (const d of defs) installAugment(game.engine, d, "p0", { yaku: game.yaku });
  return game;
}

/**
 * 리치 선언으로 턴이 넘어간 뒤, 같은 상태에서 보유자의 행동 페이즈를 다시 연다.
 * cancel_riichi는 "자기 순 turn.act"에서만 유효하기 때문이다 (다음 자기 순의 재현).
 */
function reopenTurn(game: Game, augs: string[]): Game {
  const s = game.engine.state;
  const next: GameState = {
    ...s,
    round: { ...s.round, phase: "turn.act", turnSeat: 0 },
  };
  const defs = [stealthRiichi, lastStand].filter((d) => augs.includes(d.id));
  const g = createStandardGameFromState(next, undefined, defs);
  for (const d of defs) installAugment(g.engine, d, "p0", { yaku: g.yaku });
  return g;
}

/**
 * 버려도 텐파이가 유지되는 패. 손은 123m456m789m11p234p(14장)이라
 * 4p를 버리면 11p 머리 + 23p 양면 대기(1p/4p)로 텐파이가 선다.
 */
function anyDiscard(game: Game): TileId {
  const state = game.engine.state;
  const id = handIdsOf(state, "p0").find((t) => {
    const k = kindOf(state, t);
    return k.suit === "pin" && k.rank === 4;
  });
  if (id === undefined) throw new Error("expected a 4p in hand");
  return id;
}

describe("스텔스 리치는 공탁을 내지 않는다 (기준선)", () => {
  it("선언해도 점수가 줄지 않고 공탁도 늘지 않는다", () => {
    const game = scene(0, ["stealth_riichi"]);
    const before = game.engine.state.players.find((p) => p.id === "p0")?.score ?? 0;

    const res = game.engine.submit({
      player: "p0",
      type: "stealth_riichi",
      payload: { tileId: anyDiscard(game) },
    });
    expect(res.ok).toBe(true);

    const s = game.engine.state;
    expect(s.players.find((p) => p.id === "p0")?.score).toBe(before);
    expect(s.round.riichiPot).toBe(0);
    expect(s.round.byPlayer["p0"]?.riichi).not.toBeNull();
    // 실납부액이 상태에 남는다 — 환급 상한의 근거
    expect(s.round.byPlayer["p0"]?.riichi?.cost).toBe(0);
  });
});

describe("승부수로 리치를 취소해도 안 낸 공탁은 못 받는다", () => {
  it("공탁이 비어 있으면 환급 0 — riichiPot이 음수가 되지 않는다", () => {
    const game = scene(0, ["stealth_riichi", "last_stand"]);
    game.engine.submit({
      player: "p0",
      type: "stealth_riichi",
      payload: { tileId: anyDiscard(game) },
    });
    const mid = game.engine.state.players.find((p) => p.id === "p0")?.score ?? 0;

    const g2 = reopenTurn(game, ["stealth_riichi", "last_stand"]);
    const res = g2.engine.submit({ player: "p0", type: "cancel_riichi", payload: {} });
    expect(res.ok).toBe(true);

    const s = g2.engine.state;
    expect(s.players.find((p) => p.id === "p0")?.score).toBe(mid); // 없던 1000점이 생기지 않는다
    expect(s.round.riichiPot).toBe(0); // 음수가 되지 않는다
    expect(s.round.byPlayer["p0"]?.riichi).toBeNull();
  });

  it("남이 쌓아 둔 공탁이 있어도 내가 안 냈으면 가져오지 못한다", () => {
    // 이월 공탁 1000(남이 낸 것) — 스텔스 리치는 여기에 손대면 안 된다
    const game = scene(1000, ["stealth_riichi", "last_stand"]);
    game.engine.submit({
      player: "p0",
      type: "stealth_riichi",
      payload: { tileId: anyDiscard(game) },
    });
    const mid = game.engine.state.players.find((p) => p.id === "p0")?.score ?? 0;

    const g2 = reopenTurn(game, ["stealth_riichi", "last_stand"]);
    g2.engine.submit({ player: "p0", type: "cancel_riichi", payload: {} });

    const s = g2.engine.state;
    expect(s.players.find((p) => p.id === "p0")?.score).toBe(mid);
    expect(s.round.riichiPot).toBe(1000); // 남의 공탁은 그대로 남는다
  });
});

describe("정상 리치는 종전대로 낸 만큼 돌려받는다", () => {
  it("표준 리치 선언 → 취소하면 1000점이 그대로 환급된다", () => {
    const game = scene(0, ["last_stand"]);
    const before = game.engine.state.players.find((p) => p.id === "p0")?.score ?? 0;

    const declared = game.engine.submit({
      player: "p0",
      type: "riichi",
      payload: { tileId: anyDiscard(game) },
    });
    expect(declared.ok).toBe(true);
    const s1 = game.engine.state;
    expect(s1.players.find((p) => p.id === "p0")?.score).toBe(before - 1000);
    expect(s1.round.riichiPot).toBe(1000);
    expect(s1.round.byPlayer["p0"]?.riichi?.cost).toBe(1000);

    const g2 = reopenTurn(game, ["last_stand"]);
    g2.engine.submit({ player: "p0", type: "cancel_riichi", payload: {} });
    const s2 = g2.engine.state;
    expect(s2.players.find((p) => p.id === "p0")?.score).toBe(before);
    expect(s2.round.riichiPot).toBe(0);
  });
});
