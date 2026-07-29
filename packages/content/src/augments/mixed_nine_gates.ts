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
 * 구현: 커스텀 역(ctx.yaku) 하나. `decompose`가 만든 멘쯔 구성과 무관하게
 * 화료형 14장의 **랭크 카운트로 직접 판정**한다(그래서 분해가 어떻게 되든 상관없다).
 * 다만 역 판정은 '화료형일 때'만 돌아가므로, 애초에 화료 가능한 배열이어야 한다.
 * 보유자 판별은 yakuHolders — 여러 명이 보유해도 역 등록은 게임당 1회.
 */

import { defineAugment, isNumberSuit } from "@majak/core";
import type { AugmentDef, TileKind } from "@majak/core";
import { yakuHolders } from "../util.js";

const ID = "mixed_nine_gates";

/** 구련보등의 뼈대 — 랭크 1~9의 최소 장수 (index 0은 사용하지 않음) */
const BASE: readonly number[] = [0, 3, 1, 1, 1, 1, 1, 1, 1, 3];

/**
 * 무늬를 무시한 구련보등 형태인가.
 * ①14장 전부 수패 ②무늬 2종 이상(순혈은 표준 구련의 몫)
 * ③랭크 카운트가 뼈대 + 아무 랭크 1장.
 */
function isMixedNineGates(hand: readonly TileKind[]): boolean {
  if (hand.length !== 14) return false;
  if (!hand.every(isNumberSuit)) return false;
  const suits = new Set(hand.map((k) => k.suit));
  if (suits.size < 2) return false;

  const counts = new Array<number>(10).fill(0);
  for (const k of hand) {
    if (k.rank < 1 || k.rank > 9) return false;
    counts[k.rank] = (counts[k.rank] ?? 0) + 1;
  }
  let extra = 0;
  for (let r = 1; r <= 9; r++) {
    const diff = (counts[r] ?? 0) - (BASE[r] ?? 0);
    if (diff < 0) return false;
    extra += diff;
  }
  return extra === 1;
}

export const mixedNineGates: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "shape",
  name: "뒤섞인 아홉 개의 연꽃",
  description:
    "(상시) 구련보등이 무늬를 가리지 않는다 — 만·통·삭을 하나로 보고 1112345678999 + 아무 패 1장이면 역만이다.",
  detail:
    "(상시) 멘젠 화료형 14장이 모두 수패이고, 무늬와 무관하게 랭크가 1112345678999에 아무 랭크 한 장을 더한 배열이면 역만이 된다. 무늬가 한 종류뿐이면 표준 구련보등이 그대로 적용되므로 이 역은 무늬가 두 종류 이상 섞였을 때만 성립한다. 후로하면 성립하지 않으며 추가 보너스는 없다.",
  install(ctx) {
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
    yakuHolders(yaku, ID).add(ctx.holder);
  },
});
