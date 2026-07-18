/**
 * 전문 도박사 (gambler_pro, gold).
 * 획득 시 무작위 프리즘 증강 하나를 함께 얻는다.
 * 지급은 DraftController가 처리하므로(state.augments 기록) install은 비어 있다.
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef } from "@majak/core";

export const gamblerPro: AugmentDef = defineAugment({
  id: "gambler_pro",
  tier: "gold",
  name: "전문 도박사",
  description: "획득 시 무작위 프리즘 증강 하나를 함께 얻는다.",
  grantsRandomTier: "prism",
  install() {
    /* 지급형 증강 — 직접 효과 없음(지급은 드래프트가 처리) */
  },
});
