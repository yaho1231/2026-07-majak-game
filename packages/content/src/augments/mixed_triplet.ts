/**
 * 동수의 결속 (mixed_triplet, prism) — **커쯔를 무늬 상관없이 만든다.**
 * 1만·1통·1삭도 하나의 커쯔다. 슌쯔는 기존처럼(같은 무늬)지만, 같은 숫자면
 * 무늬가 섞여도 몸통(커쯔)이 된다. 치·펑·깡도 무늬를 안 가린다.
 *
 * 부수는 상식: "커쯔는 완전히 같은 패 3장"이라는 대원칙. 무너진 국경이 슌쯔의
 * 무늬 국경을 지웠다면, 이쪽은 커쯔의 동일성을 숫자로만 재정의한다.
 *
 * 대응: 혼합 커쯔는 청일색·혼일색·삼색동각을 스스로 깬다.
 * (또이또이·산안커는 무늬를 보지 않으므로 **정상 성립한다** — 2026-07-29 감사에서
 *  문구가 약화를 암시해 오해를 부른다는 지적을 받아 바로잡았다.)
 * 홀더가 한 숫자를 세 무늬로 모으므로, 같은 랭크 버림이 사라지는 것이 읽기 단서다.
 *
 * 구현: 코어 규칙 `scoring.mixedTriplets`(보유자 전용) 하나. 무너진 국경(broken_border)이
 * 이미 쓰는 규칙을 슌쯔(mixedRuns) 없이 커쯔에만 적용한 셈이다 — decompose.extractSets가
 * 혼색 커쯔 후보를 만들고, scoringOptionsOf가 화료·텐파이·대기·후로 판정에 같은 옵션을 흘린다.
 *
 * ⚠ 무늬를 요구하는 커쯔 역(삼색동각)은 standardYaku의 `isPureTriplet` 가드가
 *    혼색 커쯔를 걸러낸다. 클라 waitDecompOptions도 이 옵션을 미러링해야 대기 표시가 맞다.
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef } from "@majak/core";

export const mixedTriplet: AugmentDef = defineAugment({
  id: "mixed_triplet",
  tier: "prism",
  category: "shape",
  complexity: 2,
  name: "동수의 결속",
  description:
    "(상시) 커쯔의 무늬 제한이 사라진다 — 1만·1통·1삭도 하나의 커쯔다. 슌쯔는 그대로이며 커쯔만 무늬를 가리지 않는다.",
  detail:
    "(상시) 자신에게만 커쯔의 무늬 제한이 사라진다. 숫자만 같으면 커쯔가 되고 화료·텐파이·대기 판정과 펑·깡에 모두 적용되며, 슌쯔는 기존처럼 같은 무늬로만 만든다. 다만 혼색으로 만든 커쯔는 청일색·혼일색·삼색동각을 성립시키지 못한다(또이또이·산안커는 그대로 붙는다).",
  install(ctx) {
    ctx.setHolderRule("scoring.mixedTriplets", true);
  },
});
