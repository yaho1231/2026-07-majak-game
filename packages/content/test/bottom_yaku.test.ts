/**
 * 바닥의 족보 (bottom_yaku) — 화료 순간 자기 버림 zone을 읽어 판을 얹는 거울상 역.
 * 여기서는 evaluateWin이 실제로 (a) 한 무늬 1~9 완주 → +2판(역류 통관),
 * (b) 같은 패 3장 → +1판(미련 없음), (c) 둘 겹침 → +3판을 합산하고,
 * (d) 비보유자·빈 바닥에는 아무것도 얹지 않는지 확인한다.
 */

import { describe, expect, it } from "vitest";
import {
  buildWinContext,
  createStandardGameFromState,
  discardsZone,
  evaluateWin,
  installAugment,
} from "@majak/core";
import type { GameState, PlayerId, TileId, WinEvaluation } from "@majak/core";
import { craft } from "./helpers.js";
import { bottomYaku } from "../src/augments/bottom_yaku.js";

const FLOW = "bottom_flow";
const LETGO = "bottom_letgo";

/** p1이 4s를 버린 상태에서 p0가 론으로 잡는 멘젠 손 (123p456p789p 234s 55s) */
function craftRon(bottom: string): GameState {
  return craft({
    hands: { p0: "123p456p789p23s55s", p1: "*", p2: "*", p3: "*" },
    discards: { p0: bottom },
    phase: "reaction",
    turnSeat: 1,
    lastDiscard: { player: "p1", spec: "4s" },
  });
}

function setup(state: GameState, holder: PlayerId = "p0") {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, bottomYaku, holder, { yaku: game.yaku });
  return game;
}

/** p0의 론 화료를 채점한다 (화료패 = p1이 버린 4s) */
function evalP0Ron(game: ReturnType<typeof setup>): WinEvaluation | null {
  const ronTile = game.engine.state.zones[discardsZone("p1")]
    ?.tileIds[0] as TileId;
  const ctx = buildWinContext(game.engine.state, "p0", "ron", ronTile, {
    rules: game.engine.rules,
    from: "p1",
  });
  return evaluateWin(ctx, game.yaku);
}

/** ev 안에서 특정 역의 판수 (없으면 undefined) */
function hanOf(ev: WinEvaluation | null, id: string): number | undefined {
  return ev?.yaku.find((y) => y.id === id)?.han;
}

describe("바닥의 족보 (bottom_yaku)", () => {
  it("(a) 한 무늬 1~9를 모두 버렸으면 역류 통관 +2판", () => {
    const ev = evalP0Ron(setup(craftRon("123456789m")));
    expect(ev?.ok).toBe(true);
    expect(hanOf(ev, FLOW)).toBe(2);
    expect(hanOf(ev, LETGO)).toBeUndefined();
  });

  it("(b) 같은 패를 3장 버렸으면 미련 없음 +1판 (완주는 없음)", () => {
    const ev = evalP0Ron(setup(craftRon("111z")));
    expect(ev?.ok).toBe(true);
    expect(hanOf(ev, FLOW)).toBeUndefined();
    expect(hanOf(ev, LETGO)).toBe(1);
  });

  it("(c) 완주 + 3장 버림이 겹치면 +3판 (2 + 1)", () => {
    const ev = evalP0Ron(setup(craftRon("123456789m111z")));
    expect(ev?.ok).toBe(true);
    expect(hanOf(ev, FLOW)).toBe(2);
    expect(hanOf(ev, LETGO)).toBe(1);
    // 이 역들만의 합 = 3판
    expect((hanOf(ev, FLOW) ?? 0) + (hanOf(ev, LETGO) ?? 0)).toBe(3);
  });

  it("(d1) 바닥이 비면 아무것도 얹지 않는다", () => {
    const ev = evalP0Ron(setup(craftRon("")));
    expect(hanOf(ev, FLOW)).toBeUndefined();
    expect(hanOf(ev, LETGO)).toBeUndefined();
  });

  it("(d2) 비보유자의 바닥은 완주여도 역이 붙지 않는다", () => {
    // 증강은 p1이 가졌고, 화료·바닥은 p0의 것 — p0는 보유자가 아니다
    const ev = evalP0Ron(setup(craftRon("123456789m111z"), "p1"));
    expect(hanOf(ev, FLOW)).toBeUndefined();
    expect(hanOf(ev, LETGO)).toBeUndefined();
  });
});
