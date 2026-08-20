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

describe("hidden_blade — 리치를 걸었다가 취소해도 다마텐 보너스는 없다", () => {
  /*
   * 역 check가 볼 수 있는 것은 `wctx.riichi`뿐인데, 승부수·손바닥 뒤집기가 리치를
   * 풀면 그 값이 null이 된다 → **리치 → 취소 → 멘젠 론**에 +2판과 뒷도라가 전부
   * 붙었다(docs/25 P10). 공탁을 내고 손을 굳히는 대가를 치른 뒤 그 대가만 무르고
   * 다마텐 보상을 가져가는 셈이다. "이번 국에 선언한 적이 있는가"로 봐야 한다.
   */
  const DECLARED_KEY = (s: GameState): string =>
    `hidden_blade:declared:${s.round.prevalentWind}-${s.round.roundNumber}-${s.round.honba}:p0#round`;

  /** 리치를 선언한 뒤 취소한 상태 (선언 이력만 남고 riichi는 null) */
  function craftCancelled(): GameState {
    const s = craftRon(false);
    return { ...s, augmentData: { ...s.augmentData, [DECLARED_KEY(s)]: true } };
  }

  it("선언 이력이 있으면 뒷도라 문이 닫힌다", () => {
    const game = setup(craftCancelled());
    expect(
      game.engine.rules.resolve<boolean>("scoring.uraWithoutRiichi", {
        playerId: "p0",
        state: game.engine.state,
        winType: "ron",
        isClosed: true,
      } as never),
    ).toBe(false);
  });

  it("선언 이력이 있으면 +2판 역도 금지된다", () => {
    const game = setup(craftCancelled());
    const blocked = game.engine.rules.resolve<string[]>("win.blockedYaku", {
      playerId: "p0",
      state: game.engine.state,
    });
    expect(blocked).toContain("hidden_blade");
  });

  it("선언한 적이 없으면 종전대로 열린다 (대조군)", () => {
    const game = setup(craftRon(false));
    expect(
      game.engine.rules.resolve<string[]>("win.blockedYaku", {
        playerId: "p0",
        state: game.engine.state,
      }),
    ).not.toContain("hidden_blade");
  });
});
