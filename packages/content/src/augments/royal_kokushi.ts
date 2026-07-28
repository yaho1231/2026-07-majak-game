/**
 * 왕의 징표 (royal_kokushi, prism) — **국사무쌍에 중복을 허용한다.**
 * 요구패 13종을 다 모으지 않아도, 한 종류가 빠진 자리를 중복(같은 요구패 2장 이상)으로
 * 메워 국사가 선다. 마작 최고 난도의 조건을 정면으로 완화한다.
 *
 * 부수는 상식: "국사무쌍은 요구패 13종을 하나도 빠짐없이 모아야 한다." 두 장까지
 * 중복을 허용해 12종 + 중복으로도 역만에 도달한다.
 *
 * 대응: 요구패 편식이 바닥에 드러나므로 홀더에게 요구패(1·9·자패)를 흘리지 않는 것이
 * 유일한 방어. 대신 홀더는 완성이 한 종류 더 쉬워졌을 뿐, 여전히 요구패만 모아야 한다.
 *
 * 구현: 코어 규칙 `scoring.kokushiDupes`(보유자 전용, 여기서는 1) → decompose가 닫힌 국사
 * 판정에서 "빠진 종류 수 ≤ dupes"면 성립시킨다. 손패는 여전히 14장 전부 요구패여야 하고,
 * 머리는 count≥2인 종류 하나. 국사 변형은 allKinds가 handKinds(실제 패)를 쓰므로
 * 이종 중복도 역 판정에 안전하다.
 *
 * ⚠ 클라 waitDecompOptions도 이 옵션을 미러링해야 대기(13면 대기 포함) 표시가 맞다.
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef } from "@majak/core";

/** 허용할 "빠진 요구패 종류" 수. 1 = 12종만 모아도 됨(밸런스는 실테스트로 조정) */
const DUPES = 1;

export const royalKokushi: AugmentDef = defineAugment({
  id: "royal_kokushi",
  tier: "prism",
  category: "shape",
  name: "왕의 징표",
  description:
    "(상시) 국사무쌍에 중복이 허용된다 — 요구패 13종을 다 모으지 않아도, 빠진 한 종류를 다른 요구패의 중복으로 메워 국사가 선다.",
  detail:
    "(상시) 국사무쌍의 '13종 전부' 조건이 느슨해진다. 요구패 한 종류가 빠져도 다른 요구패를 2장 이상 중복해 그 자리를 메우면 국사로 인정되어, 12종 + 중복으로도 역만에 도달한다. 손패는 여전히 14장 전부 요구패여야 한다.",
  install(ctx) {
    ctx.setHolderRule("scoring.kokushiDupes", DUPES);
  },
});
