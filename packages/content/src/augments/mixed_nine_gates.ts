/**
 * 뒤섞인 아홉 개의 연꽃 (mixed_nine_gates, prism).
 *
 * 구련보등이 무늬를 가리지 않는다 — 만·통·삭을 하나로 보고
 * 1112345678999 + 아무 랭크 1장이면 역만.
 *
 * 설계 결정:
 * - **랭크만 본다.** 표준 구련보등은 "한 무늬 순혈"이 전부지만, 이 증강은 그 벽을 지운다.
 *   1m1m1p 2s 3m 4p … 처럼 무늬가 흩어져 있어도 랭크 배열만 맞으면 역만이다.
 * - **무늬가 2종 이상 섞였을 때만** 성립시킨다. 한 무늬 순혈이면 표준 구련보등이
 *   이미 잡으므로, 이 역을 함께 붙이면 역만이 이중으로 세어진다.
 * - 추가 보너스 없음. 멘젠(후로 없음) 필수.
 *
 * 구현:
 * ① 커스텀 역(ctx.yaku) 하나 — 화료형 14장의 **랭크 카운트로 직접 판정**한다.
 * ② **화료형 자체를 열어 주는 규칙** — 랭크만 맞고 무늬가 흩어진 1112345678999는
 *    표준 분해로는 4멘쯔+작두가 서지 않아 **화료가 아예 안 됐다**(2026-07-31 사용자 보고:
 *    "섞어서 1112345678999 9 였는데 화료가 안 됨"). 역만 붙여 놓고 화료를 막고 있었던 셈이다.
 *    그래서 보유자의 손이 **이 배열일 때만** `scoring.mixedRuns`·`scoring.mixedTriplets`를
 *    켜서 무늬를 무시하고 몸통을 세우게 한다.
 *
 *    범위가 좁은 것이 핵심이다 — 조건이 "손패가 정확히 구련 뼈대(+1장)"라, 무너진 국경·
 *    동수의 결속처럼 아무 손에나 무늬를 지워 주는 일은 없다. 13장(텐파이) 상태에도 켜지므로
 *    대기·후리텐·유국 텐파이 판정이 화료 판정과 어긋나지 않는다.
 *
 * 보유자 판별은 yakuHolders — 여러 명이 보유해도 역 등록은 게임당 1회.
 */

import { defineAugment, isNumberSuit, winHandKindsOf } from "@majak/core";
import type { AugmentDef, GameState, TileKind } from "@majak/core";
import { addYakuHolder, yakuHolders } from "../util.js";

const ID = "mixed_nine_gates";

/** 구련보등의 뼈대 — 랭크 1~9의 최소 장수 (index 0은 사용하지 않음) */
const BASE: readonly number[] = [0, 3, 1, 1, 1, 1, 1, 1, 1, 3];

/**
 * 구련 뼈대(1112345678999)를 **랭크만 보고** 채우고 있는가.
 * 남는 장수(extra)를 돌려주고, 뼈대에 못 미치거나 수패가 아니면 null.
 */
function nineGatesExtra(hand: readonly TileKind[]): number | null {
  if (!hand.every(isNumberSuit)) return null;
  const counts = new Array<number>(10).fill(0);
  for (const k of hand) {
    if (k.rank < 1 || k.rank > 9) return null;
    counts[k.rank] = (counts[k.rank] ?? 0) + 1;
  }
  let extra = 0;
  for (let r = 1; r <= 9; r++) {
    const diff = (counts[r] ?? 0) - (BASE[r] ?? 0);
    if (diff < 0) return null;
    extra += diff;
  }
  return extra;
}

/**
 * 무늬를 무시한 구련보등 형태인가.
 * ①14장 전부 수패 ②무늬 2종 이상(순혈은 표준 구련의 몫)
 * ③랭크 카운트가 뼈대 + 아무 랭크 1장.
 */
function isMixedNineGates(hand: readonly TileKind[]): boolean {
  if (hand.length !== 14) return false;
  if (new Set(hand.map((k) => k.suit)).size < 2) return false;
  return nineGatesExtra(hand) === 1;
}

/**
 * 지금 이 사람의 손이 "무늬만 흩어진 구련보등"으로 가는 길 위에 있는가.
 *
 * 13장(뼈대 정확히 = 9면 대기)과 14장 둘 다 받는다 — 대기·후리텐·유국 텐파이도
 * 화료와 같은 분해를 써야 판정이 갈라지지 않기 때문이다. 후로한 손은 제외한다
 * (이 역은 멘젠 전용이고, 후로 멘쯔가 끼면 랭크 카운트로 뼈대를 셀 수 없다).
 *
 * ⚠ 14장은 **한 장을 빼면 뼈대가 되는가**로 본다. 예전엔 14장 전체가 수패이고
 * 뼈대+1일 때만 켜져서, 뼈대 13장을 쥔 채 자패를 쯔모한 순간(=그 자패를 버리면
 * 곧바로 텐파이) 무늬 무시가 꺼졌다 — `winningKinds`가 대기를 0으로 보고
 * **리치가 아예 제시되지 않았다**(2026-08-01 사용자 보고: "텐파이인지 모르겠어,
 * 리치도 안 나오고"). 뼈대 밖의 한 장은 어차피 몸통이 되지 못하므로,
 * 이 조건이 넓어져도 없던 화료형이 생기지는 않는다.
 */
function onNineGatesPath(state: GameState, player: string): boolean {
  if ((state.round.byPlayer[player]?.melds.length ?? 0) > 0) return false;
  const hand = winHandKindsOf(state, undefined, player);
  if (hand.length === 13) return nineGatesExtra(hand) === 0;
  if (hand.length === 14) {
    return hand.some(
      (_k, i) => nineGatesExtra(hand.filter((_x, j) => j !== i)) === 0,
    );
  }
  return false;
}

export const mixedNineGates: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "shape",
  complexity: 3,
  name: "뒤섞인 아홉 개의 연꽃",
  description:
    "(상시 · 멘젠 한정) 구련보등이 무늬를 가리지 않는다 — 만·통·삭을 하나로 보고 1112345678999 + 아무 수패 1장이면 역만이다. 자패는 한 장도 섞이면 안 되고, 한 번이라도 울면 성립하지 않는다.",
  detail:
    "(상시) 멘젠 화료형 14장이 **모두 수패**이고, 무늬와 무관하게 랭크가 1112345678999에 아무 랭크 한 장을 더한 배열이면 역만이 된다.\n\n제약 둘을 분명히 해 둔다. **자패(동남서북·백발중)는 한 장도 섞일 수 없다** — 무늬를 무시하는 것은 만·통·삭 사이의 이야기지 자패까지 포함하는 것이 아니다. 그리고 **멘젠이어야 한다** — 치·퐁·대명깡을 한 번이라도 하면 성립하지 않는다(안깡도 손에 멘쯔로 남아 이 형태를 깬다).\n\n무늬가 한 종류뿐이면 표준 구련보등이 그대로 적용되므로 이 역은 무늬가 두 종류 이상 섞였을 때 값한다. 추가 보너스는 없다.",
  install(ctx) {
    // 화료형을 열어 준다 — 손이 구련 뼈대일 때만 무늬를 무시하고 몸통을 세운다.
    // (슌쯔·커쯔·머리 셋 다 필요하다: 1112345678999는 111·999 커쯔와 234·567·89x 슌쯔로
    //  서고, 오름패가 만드는 작두는 무늬가 갈린 두 장인 경우가 대부분이다 —
    //  머리를 안 열면 27종 대기 중 같은 무늬 짝이 맞는 3종만 화료가 됐다.)
    for (const rule of [
      "scoring.mixedRuns",
      "scoring.mixedTriplets",
      "scoring.mixedPairs",
    ] as const) {
      ctx.engine.rules.addModifier<boolean>(rule, {
        source: ctx.instanceId,
        layer: ctx.layer,
        apply: (cur, rctx) => {
          if (cur) return cur;
          if (rctx.playerId !== ctx.holder) return cur;
          const state = rctx.state as GameState | undefined;
          if (state === undefined) return cur;
          return onNineGatesPath(state, ctx.holder);
        },
      });
    }

    const yaku = ctx.yaku;
    if (yaku === undefined) return;
    if (yaku.get(ID) === undefined) {
      yaku.register({
        // 무장해제되면 이 역도 함께 잠긴다 (evaluate가 disarmedSources와 대조)
        source: ctx.instanceId,
        id: ID,
        name: "뒤섞인 아홉 개의 연꽃",
        closedHan: 13,
        openHan: null,
        isYakuman: true,
        check: (variant, wctx) =>
          wctx.winnerId !== undefined &&
          yakuHolders(yaku, ID).has(wctx.winnerId) &&
          variant.isClosed &&
          wctx.melds.length === 0 &&
          isMixedNineGates(wctx.hand),
      });
    }
    addYakuHolder(ctx, yaku, ID);
  },
});
