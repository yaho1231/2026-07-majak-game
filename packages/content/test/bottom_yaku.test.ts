/**
 * 바닥의 족보 (bottom_yaku) — 화료 순간 자기 **버림 이력**을 읽어 판을 얹는 거울상 역.
 * 여기서는 evaluateWin이 실제로 (a) 한 무늬 숫자 7종 → +2판(역류 통관),
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
  kindKey,
  kindOf,
  meldsZone,
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
  it("(a) 한 무늬 숫자 7종 이상을 버렸으면 역류 통관 +2판", () => {
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

  /*
   * 회귀 (2026-08-20 QA 확정): 남이 울어 간 버림패는 **바닥 zone에서 사라진다**
   * (flowEvents가 버린 사람의 discards zone에서 빼서 운 사람의 melds로 옮긴다).
   * zone을 보던 예전 구현은 그 순간 조건이 깨져 "5만을 퐁당했다"는 이유로 역이
   * 통째로 사라졌다. 판정 근거는 append-only인 `discardedKinds`(후리텐 이력)여야 한다.
   */
  /** 코어가 퐁 성립 때 하는 이동 그대로: victim의 바닥 → caller의 후로 zone */
  function callAway(
    state: GameState,
    victim: PlayerId,
    caller: PlayerId,
    kindStr: string,
  ): GameState {
    const dz = discardsZone(victim);
    const ids = state.zones[dz]?.tileIds ?? [];
    const target = ids.find((id) => kindKey(kindOf(state, id)) === kindStr);
    if (target === undefined) throw new Error(`바닥에 ${kindStr}가 없다`);
    const mz = meldsZone(caller);
    return {
      ...state,
      zones: {
        ...state.zones,
        [dz]: {
          ...state.zones[dz]!,
          tileIds: ids.filter((id) => id !== target),
        },
        [mz]: {
          ...state.zones[mz]!,
          tileIds: [...(state.zones[mz]?.tileIds ?? []), target],
        },
      },
    };
  }

  it("(e1) 완주한 한 장을 남이 울어 가도 역류 통관은 살아 있다", () => {
    const state = callAway(craftRon("123456789m"), "p0", "p1", "man5");
    // 바닥 zone에서는 5만이 빠졌지만 버림 이력은 9장 그대로다
    expect(state.zones[discardsZone("p0")]?.tileIds).toHaveLength(8);
    expect(state.round.byPlayer["p0"]?.discardedKinds).toHaveLength(9);
    const ev = evalP0Ron(setup(state));
    expect(ev?.ok).toBe(true);
    expect(hanOf(ev, FLOW)).toBe(2);
  });

  it("(e2) 3장 버린 것 중 하나를 울려 가도 미련 없음은 살아 있다", () => {
    const state = callAway(craftRon("111z"), "p0", "p1", "wind1");
    expect(state.zones[discardsZone("p0")]?.tileIds).toHaveLength(2);
    const ev = evalP0Ron(setup(state));
    expect(ev?.ok).toBe(true);
    expect(hanOf(ev, LETGO)).toBe(1);
  });

  it("(e3) 둘 다 울려 가도 합 3판이 그대로 남는다", () => {
    let state = callAway(craftRon("123456789m111z"), "p0", "p1", "man5");
    state = callAway(state, "p0", "p2", "wind1");
    const ev = evalP0Ron(setup(state));
    expect(hanOf(ev, FLOW)).toBe(2);
    expect(hanOf(ev, LETGO)).toBe(1);
  });

  it("(e4) 애초에 버리지 않은 패는 여전히 세지 않는다 (이력에도 없다)", () => {
    // 1~6만만 버렸다 — 6종이라 7종 문턱에 한 종 모자란다
    const ev = evalP0Ron(setup(craftRon("123456m")));
    expect(hanOf(ev, FLOW)).toBeUndefined();
  });

  /*
   * 밸런스 2026-08-27: 역류 통관 문턱 **9종(1~9 전부) → 같은 무늬 7종**.
   * 예전 사양(1~9 완주)을 못박던 (a)·(e4)도 이 새 사양으로 고쳤다.
   */
  describe("(f) 역류 통관 문턱은 같은 무늬 7종", () => {
    it("연속 7종(1~7만)이면 붙는다", () => {
      expect(hanOf(evalP0Ron(setup(craftRon("1234567m"))), FLOW)).toBe(2);
    });

    it("흩어진 7종(1·3·5·6·7·8·9만)이어도 붙는다 — 연속일 필요가 없다", () => {
      expect(hanOf(evalP0Ron(setup(craftRon("1356789m"))), FLOW)).toBe(2);
    });

    it("6종이면 붙지 않는다 (경계는 정확히 7)", () => {
      expect(hanOf(evalP0Ron(setup(craftRon("135789m"))), FLOW)).toBeUndefined();
    });

    it("같은 숫자를 여러 장 버려도 종류 수로만 센다", () => {
      // 1만 3장 + 2~6만 = 숫자 6종 → 역류 통관은 없고 미련 없음만 붙는다
      const ev = evalP0Ron(setup(craftRon("111m23456m")));
      expect(hanOf(ev, FLOW)).toBeUndefined();
      expect(hanOf(ev, LETGO)).toBe(1);
    });

    it("7종이 무늬를 넘나들면 붙지 않는다 (한 무늬 안에서만 센다)", () => {
      // 만 4종 + 통 4종 = 어느 무늬도 7종이 아니다
      expect(hanOf(evalP0Ron(setup(craftRon("1234m6789p"))), FLOW)).toBeUndefined();
    });
  });
});
