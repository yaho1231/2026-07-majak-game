/**
 * 뒤섞인 아홉 개의 연꽃 — **혼색 머리의 «대표 아닌 쪽»** 으로 화료해도 역만이 선다 (A-5).
 *
 * 기존 `mixed_nine_gates.test.ts`는 뼈대에 순수 머리(11m)가 따로 있고 화료패 5p가
 * 마침 머리의 대표(무늬 사전순 앞) 쪽이라 이 결함을 못 잡았다. 여기서는 머리가
 * 반드시 혼색(2만+2통)이 되는 뼈대에서 **뒤 무늬**로 화료해 역만 48,000을 확인한다.
 * 되돌리면 `evaluateWin`이 null을 답한다(변형 0개 = 「화료형 아님」).
 */
import { describe, expect, it } from "vitest";
import {
  buildWinContext,
  createStandardGameFromState,
  discardsZone,
  evaluateWin,
  installAugment,
} from "@majak/core";
import type { GameState, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { mixedNineGates } from "../src/augments/mixed_nine_gates.js";

/** 무늬가 흩어진 구련 뼈대 13장 — 머리가 될 쌍이 혼색뿐이다 */
const SKELETON = "1m1p1s2m3p4s5m6p7s8m9p9s9m";

function ronWith(spec: string): ReturnType<typeof evaluateWin> {
  const st: GameState = craft({
    hands: { p0: SKELETON, p1: "*", p2: "*", p3: "*" },
    phase: "reaction",
    turnSeat: 1,
    lastDiscard: { player: "p1", spec },
  });
  const game = createStandardGameFromState(st);
  installAugment(game.engine, mixedNineGates, "p0", { yaku: game.yaku });
  const ron = game.engine.state.zones[discardsZone("p1")]?.tileIds[0] as TileId;
  return evaluateWin(
    buildWinContext(game.engine.state, "p0", "ron", ron, {
      rules: game.engine.rules,
      from: "p1",
    }),
    game.yaku,
  );
}

describe("뒤섞인 아홉 개의 연꽃 — 혼색 머리의 다른 쪽 무늬 화료", () => {
  // 예전에 죽어 있던 6종 (머리의 «대표 아닌 쪽»)
  for (const t of ["2p", "5p", "8p", "2s", "5s", "8s"]) {
    it(`${t} 론으로 역만이 선다`, () => {
      const ev = ronWith(t);
      expect(ev, `${t} 는 화료형이어야 한다`).not.toBeNull();
      expect(ev?.ok).toBe(true);
      expect(ev?.yaku.some((y) => y.id === "mixed_nine_gates")).toBe(true);
      expect(ev?.yakumanCount ?? 0).toBeGreaterThanOrEqual(1);
    });
  }

  it("대표 쪽(1m 등)도 그대로 역만이다 (회귀 가드)", () => {
    const ev = ronWith("1m");
    expect(ev?.ok).toBe(true);
    expect(ev?.yaku.some((y) => y.id === "mixed_nine_gates")).toBe(true);
  });
});
