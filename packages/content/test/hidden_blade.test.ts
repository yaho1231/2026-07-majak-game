/**
 * hidden_blade (숨은 칼날) — 리치를 걸지 않은 멘젠 론에 +2판 + **뒷도라 적용**.
 *
 * 뒷도라 문은 코어 규칙 `scoring.uraWithoutRiichi`(→ WinContext.uraAlways)로 열린다.
 * 여기서는 (1) 그 문이 "다마텐 론"에서만 열리는지, (2) evaluate가 uraAlways를 실제로
 * 우라 계산에 쓰는지를 확인한다.
 */

import { describe, expect, it } from "vitest";
import {
  buildWinContext,
  createStandardGameFromState,
  discardsZone,
  evaluateWin,
  installAugment,
} from "@majak/core";
import type { GameState, TileId, WinContext } from "@majak/core";
import { craft } from "./helpers.js";
import { hiddenBlade } from "../src/augments/hidden_blade.js";

const RIICHI = { double: false, ippatsu: false, discardIndex: 0 };

/** p1이 9s를 버린 상태에서 p0가 론으로 잡을 수 있는 멘젠 손 */
function craftRon(riichi = false): GameState {
  const s = craft({
    hands: { p0: "123m123p123s678s9s", p1: "*", p2: "*", p3: "*" },
    discards: { p1: "9s" },
    phase: "reaction",
    turnSeat: 1,
    lastDiscard: { player: "p1", spec: "9s" },
  });
  if (!riichi) return s;
  return {
    ...s,
    round: {
      ...s.round,
      byPlayer: {
        ...s.round.byPlayer,
        p0: { ...s.round.byPlayer["p0"]!, riichi: RIICHI },
      },
    },
  };
}

function setup(state: GameState) {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, hiddenBlade, "p0", { yaku: game.yaku });
  return game;
}

function ronTileOf(game: ReturnType<typeof setup>): TileId {
  return game.engine.state.zones[discardsZone("p1")]?.tileIds[0] as TileId;
}

describe("hidden_blade (숨은 칼날)", () => {
  it("다마텐 론이면 뒷도라 문이 열린다 (uraAlways)", () => {
    const game = setup(craftRon());
    const ctx = buildWinContext(
      game.engine.state,
      "p0",
      "ron",
      ronTileOf(game),
      { includeUra: true, rules: game.engine.rules, from: "p1" },
    );
    expect(ctx.uraAlways).toBe(true);
  });

  it("쯔모·리치 손에는 열리지 않는다 (다마텐 론 전용)", () => {
    const game = setup(craftRon());
    const tsumo = buildWinContext(
      game.engine.state,
      "p0",
      "tsumo",
      ronTileOf(game),
      { includeUra: true, rules: game.engine.rules },
    );
    expect(tsumo.uraAlways).toBe(false);

    const riichiGame = setup(craftRon(true));
    const riichiCtx = buildWinContext(
      riichiGame.engine.state,
      "p0",
      "ron",
      ronTileOf(riichiGame),
      { includeUra: true, rules: riichiGame.engine.rules, from: "p1" },
    );
    // 이미 리치라 굳이 문을 열 필요가 없다 (evaluate가 riichi로 우라를 센다)
    expect(riichiCtx.uraAlways).toBe(false);
  });

  it("증강이 없으면 다마텐 론에도 문이 열리지 않는다 (대조군)", () => {
    const game = createStandardGameFromState(craftRon());
    const ctx = buildWinContext(
      game.engine.state,
      "p0",
      "ron",
      game.engine.state.zones[discardsZone("p1")]?.tileIds[0] as TileId,
      { includeUra: true, rules: game.engine.rules, from: "p1" },
    );
    expect(ctx.uraAlways).toBe(false);
  });

  it("evaluate는 리치가 없어도 uraAlways면 뒷도라를 센다", () => {
    const game = setup(craftRon());
    const base = buildWinContext(
      game.engine.state,
      "p0",
      "ron",
      ronTileOf(game),
      { includeUra: true, rules: game.engine.rules, from: "p1" },
    );
    // 손에 실제로 들어 있는 1만을 뒷도라로 지정해 차이를 관측한다
    const uraDoraKinds = [{ suit: "man", rank: 1 }];
    const withUra: WinContext = { ...base, uraDoraKinds };
    const withoutUra: WinContext = { ...base, uraDoraKinds, uraAlways: false };

    const a = evaluateWin(withUra, game.yaku);
    const b = evaluateWin(withoutUra, game.yaku);
    expect(a?.ok).toBe(true);
    expect(b?.ok).toBe(true);
    expect(a?.uraHan).toBe(1);
    expect(b?.uraHan).toBe(0);
    expect((a?.han ?? 0) - (b?.han ?? 0)).toBe(1);
  });
});
