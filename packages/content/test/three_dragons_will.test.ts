/**
 * 삼원의 의지 (three_dragons_will) — 7장 대삼원.
 *  1. 삼원패 2커쯔면 발동해 나머지 한 종류의 부족분을 잡패에서 물질화한다(손패 장수 불변).
 *  2. 나머지를 0장 쥐었어도 3장 전부를 세운다 (2026-08-27 사양 완화).
 *  3. 그 결과 세 삼원 커쯔가 실제로 서서 대삼원(역만)이 표준 채점으로 성립한다.
 *  4. 조건 미충족(커쯔 1개)·리치 중은 거부된다.
 */

import { describe, expect, it } from "vitest";
import {
  buildWinContext,
  createStandardGameFromState,
  evaluateWin,
  handIdsOf,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { threeDragonsWill } from "../src/augments/three_dragons_will.js";

/** kindKey = `${suit}${rank}` — 중(dragon3) */
const CHUN = kindKey({ suit: "dragon", rank: 3 });

function withAug(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...ids] } : p,
    ),
  };
}

/**
 * p0: 백3(5z5z5z) + 발3(6z6z6z) + 중1(7z) + 123m + 잡패 4장(9m·1p·5p·9s).
 * = 3+3+1+3+4 = 14장. 중 2장을 잡패에서 채우면 대삼원 사정권.
 */
function scene(hand: string, riichi = false): GameState {
  const base = craft({
    hands: { p0: hand, p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const s = withAug(base, "p0", ["three_dragons_will"]);
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
  installAugment(game.engine, threeDragonsWill, "p0", { yaku: game.yaku });
  return game;
}

function handKeys(game: ReturnType<typeof setup>): string[] {
  const st = game.engine.state;
  return handIdsOf(st, "p0").map((id) => kindKey(kindOf(st, id)));
}

describe("삼원의 의지 (three_dragons_will)", () => {
  it("삼원패 2커쯔 + 중 1장이면 잡패 2장이 중으로 물질화한다 (장수 불변)", () => {
    const game = setup(scene("555z666z7z123m9m1p5p9s"));
    const before = handKeys(game).length;

    const r = game.engine.submit({ player: "p0", type: "dragons_will", payload: {} });
    expect(r.ok).toBe(true);

    const after = handKeys(game);
    expect(after.length).toBe(before); // 손패 장수 불변
    // 중이 3장이 됐다
    expect(after.filter((k) => k === CHUN).length).toBe(3);
    // 생성된 두 장은 conjured
    const st = game.engine.state;
    const conjured = handIdsOf(st, "p0").filter(
      (id) => kindKey(kindOf(st, id)) === CHUN && st.tiles[id]?.attrs?.conjured === true,
    );
    expect(conjured.length).toBe(2);
    expect(st.augmentData["three_dragons_will:uses:p0"]).toBe(1);
  });

  it("발동 후 대삼원(역만)이 표준 채점으로 성립한다", () => {
    // 백3 발3 중1 + 123m(멘쯔) + 9p9p(머리) + 고립 자패 2장(東·南).
    // 고립 자패가 가장 쓸모없으므로 재료로 뽑혀 중으로 바뀐다 →
    // 발동 후: 백3 발3 중3 + 123m + 9p9p = 4멘쯔 + 머리(14장) 화료형.
    const game = setup(scene("555z666z7z123m9p9p1z2z"));
    const r = game.engine.submit({ player: "p0", type: "dragons_will", payload: {} });
    expect(r.ok).toBe(true);

    const st = game.engine.state;
    const winTile = handIdsOf(st, "p0").at(-1) as TileId;
    const ctx = buildWinContext(st, "p0", "tsumo", winTile, { rules: game.engine.rules });
    const result = evaluateWin(ctx, game.yaku);
    expect(result?.ok).toBe(true);
    // 대삼원이 붙었다
    expect(result?.yaku.some((y) => y.id === "daisangen")).toBe(true);
    expect((result?.yakumanCount ?? 0)).toBeGreaterThanOrEqual(1);
  });

  it("삼원패 커쯔가 하나뿐이면 발동할 수 없다", () => {
    const game = setup(scene("555z66z7z123m456m9m1p"));
    expect(game.engine.submit({ player: "p0", type: "dragons_will", payload: {} }).ok).toBe(false);
  });

  /*
   * 2026-08-27 사양 변경: 예전에는 "나머지 한 종류를 0장 쥐었으면 발동 불가"였다
   * (옛 테스트가 그 사양을 못박고 있었다). 이제 3장 전부를 물질화한다.
   */
  it("나머지 한 종류를 하나도 안 쥐었어도 잡패 3장이 그 종류로 물질화한다", () => {
    // 백3 발3 + 중 0장 + 123m + 잡패 5장(456m9m1p) = 14장
    const game = setup(scene("555z666z123m456m9m1p"));
    const before = handKeys(game).length;

    const r = game.engine.submit({ player: "p0", type: "dragons_will", payload: {} });
    expect(r.ok).toBe(true);

    const after = handKeys(game);
    expect(after.length).toBe(before); // 손패 장수 불변
    expect(after.filter((k) => k === CHUN).length).toBe(3);
    const st = game.engine.state;
    const conjured = handIdsOf(st, "p0").filter(
      (id) => kindKey(kindOf(st, id)) === CHUN && st.tiles[id]?.attrs?.conjured === true,
    );
    expect(conjured.length).toBe(3);
  });

  it("0장에서 세워도 대삼원(역만)이 표준 채점으로 성립한다", () => {
    // 백3 발3 + 중 0장 + 123m(멘쯔) + 9p9p(머리) + 고립 자패 3장(東南西).
    // 고립 자패 3장이 재료로 뽑혀 중이 된다 → 백3 발3 중3 + 123m + 9p9p (14장).
    const game = setup(scene("555z666z123m9p9p1z2z3z"));
    expect(game.engine.submit({ player: "p0", type: "dragons_will", payload: {} }).ok).toBe(true);

    const st = game.engine.state;
    const winTile = handIdsOf(st, "p0").at(-1) as TileId;
    const ctx = buildWinContext(st, "p0", "tsumo", winTile, { rules: game.engine.rules });
    const result = evaluateWin(ctx, game.yaku);
    expect(result?.ok).toBe(true);
    expect(result?.yaku.some((y) => y.id === "daisangen")).toBe(true);
  });


  it("리치 중에는 발동할 수 없다", () => {
    const game = setup(scene("555z666z7z123m9m1p5p9s", true));
    expect(game.engine.submit({ player: "p0", type: "dragons_will", payload: {} }).ok).toBe(false);
  });

  it("설명 문구가 실제 사용 횟수 제한(동풍전 1회·반장전 2회)을 숨기지 않는다", () => {
    // 코드는 matchUses로 실제 캡을 거는데 예전 설명은 "(상시)"로만 적혀 있어
    // 무제한처럼 보였다 — 다른 액티브 증강들과 같은 문구 규약을 지키는지 회귀 검증.
    expect(threeDragonsWill.detail ?? "").toMatch(/동풍전 1회.*반장전 2회/);
    expect(threeDragonsWill.detail).toMatch(/동풍전 1회.*반장전 2회/);
  });
});
