/**
 * 비대칭 (async_chiitoi, prism) — **무늬가 달라도 숫자가 같으면 치또이 머리다.**
 * 1만+1통도 한 쌍. 자패는 기존처럼 같은 종류 2장, 같은 패는 최대 2장까지(4장 금지).
 *
 * 부수는 상식: "또이쯔는 완전히 같은 패 2장"이라는 치또이의 정의 — 숫자만 남긴다.
 *
 * 도파민 순간: 아무리 봐도 안 맞던 손이 "같은 숫자끼리 짝지어라"로 다시 보이는 순간,
 * 7쌍이 순식간에 완성된다. 원래는 성립 불가한 배열로 리치가 걸린다.
 *
 * 대응: 치또이 특유의 단기 대기는 그대로라 한 장 대기의 약점은 유지된다. 홀더가 같은
 * 숫자를 모으므로 랭크 편식이 읽기 단서다.
 *
 * 구현: 코어 규칙 `scoring.chiitoiMixedPairs`(보유자 전용). decompose가 "수패 랭크별 짝수 +
 * 자패 종류별 짝수 + 같은 패 ≤2장"이면 치또이로 인정한다(표준 치또이의 상위집합).
 * 이종 쌍은 `ScoringVariant.pairs`(쌍당 kind 하나)로는 표현 못 하므로, WinContext가 치또이
 * variant에 실제 손패 14장(`handKinds`)을 실어 allKinds가 무늬·노두·자패를 정확히 판정한다.
 *
 * ⚠ 클라 waitDecompOptions도 이 옵션을 미러링해야 대기(단기) 표시가 맞다.
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef } from "@majak/core";

export const asyncChiitoi: AugmentDef = defineAugment({
  id: "async_chiitoi",
  tier: "prism",
  category: "shape",
  complexity: 2,
  name: "비대칭",
  description:
    "(상시) 치또이쯔의 무늬 제한이 사라진다 — 1만·1통도 한 또이쯔다.",
  detail:
    "(상시) 숫자만 같으면 무늬가 달라도 한 쌍이다. 자패는 기존처럼 같은 종류 2장이어야 하고, 같은 패는 최대 2장까지만 쓸 수 있다(4장을 2쌍으로 쓰지 못한다).\n\n같은 패가 3장 모이면 그 손은 치또이가 아니라 일반 손으로 읽히고, 안커가 있으면 머리보다 안커로 우선 취급된다.",
  install(ctx) {
    ctx.setHolderRule("scoring.chiitoiMixedPairs", true);
  },
});
