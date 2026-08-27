/**
 * 비대칭 (async_chiitoi, prism) — **무늬가 달라도 숫자가 같으면 치또이 머리다.**
 * 1만+1통도 한 쌍. 자패는 기존처럼 같은 종류 2장, 같은 패는 최대 3장까지(4장 금지).
 *
 * 부수는 상식: "또이쯔는 완전히 같은 패 2장"이라는 치또이의 정의 — 숫자만 남긴다.
 *
 * 도파민 순간: 아무리 봐도 안 맞던 손이 "같은 숫자끼리 짝지어라"로 다시 보이는 순간,
 * 7쌍이 순식간에 완성된다. 원래는 성립 불가한 배열로 리치가 걸린다.
 *
 * 대응: 치또이 특유의 단기 대기는 그대로라 한 장 대기의 약점은 유지된다. 홀더가 같은
 * 숫자를 모으므로 랭크 편식이 읽기 단서다.
 *
 * ## 2026-08-23 (사용자 지시) — 상시 → **2국에 1회 액티브**
 * 자기 순에 선언한 **그 국 동안만** 무늬 제한이 사라진다. 배선은 형제 둘(동수의 결속·
 * 무너진 국경)과 함께 `shapeDeclare.ts`가 들고 있다.
 *
 * ## 2026-08-27 (사용자 지시) — **국 첫 순 한정 · 동풍전 2국 / 반장전 3국 쿨다운**
 * 발동 창이 「자기 순 아무 때나」에서 **국의 첫 순**으로 좁아졌고, 쿨다운이 매치 길이를
 * 탄다. 근거와 판정 규약은 `shapeDeclare.ts` 머리말에 한 곳으로 적혀 있다.
 *
 * 구현: 코어 규칙 `scoring.chiitoiMixedPairs`(보유자 전용, 선언한 국 한정). decompose가 "수패 랭크별 짝수 +
 * 자패 종류별 짝수 + 같은 패 ≤3장"이면 치또이로 인정한다(표준 치또이의 상위집합).
 * 이종 쌍은 `ScoringVariant.pairs`(쌍당 kind 하나)로는 표현 못 하므로, WinContext가 치또이
 * variant에 실제 손패 14장(`handKinds`)을 실어 allKinds가 무늬·노두·자패를 정확히 판정한다.
 *
 * ⚠ 클라 waitDecompOptions도 이 옵션을 미러링해야 대기(단기) 표시가 맞다.
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef } from "@majak/core";
import { shapeDeclareParts } from "./shapeDeclare.js";

export const asyncChiitoi: AugmentDef = defineAugment({
  id: "async_chiitoi",
  tier: "prism",
  category: "shape",
  complexity: 2,
  name: "비대칭",
  description:
    "(동풍전 2국에 1회 · 반장전 3국에 1회) 국의 첫 순에 발동하면 이번 국 동안 치또이쯔의 무늬 제한이 사라진다 — 1만·1통도 한 또이쯔다.",
  detail:
    "**국의 첫 순에만 발동할 수 있다** — 이 국에 한 장이라도 버린 뒤에는 잠긴다. 무늬 제한은 발동한 국 동안만 풀린다. 자패는 기존처럼 같은 종류 2장이어야 하고, 같은 패 3장은 «2장 한 쌍 + 남은 1장이 다른 무늬와 짝»으로 쓸 수 있다(3삭 3장 + 3만 → 3삭3삭 · 3삭3만). 4장은 같은 쌍이 두 번 나오므로 못 쓴다.\n\n발동은 전원에게 공개되고, 리치 중에는 발동할 수 없다.",
  // 배선은 셋(동수의 결속·무너진 국경·비대칭)이 공유한다 — shapeDeclare.ts 머리말 참고.
  ...shapeDeclareParts({
    id: "async_chiitoi",
    action: "declare_async_chiitoi",
    rule: "scoring.chiitoiMixedPairs",
    option: "chiitoiMixedPairs",
  }),
});
