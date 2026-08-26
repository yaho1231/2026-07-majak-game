/**
 * 끝없는 윤회 (broken_wall, prism) — 8-9-1, 9-1-2 같은 순환 슌쯔가 가능해진다.
 * (파일명·id는 옛 이름 `broken_wall` 그대로다 — 출고 이름만 바뀌었다.)
 *
 * 구현: scoring.wrapRuns 규칙을 보유자에게만 켠다. scoringOptionsOf를 거치는
 * 모든 판정 지점(화료·텐파이·후리텐·대기·치 후보)에 일관 적용된다.
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef } from "@majak/core";

export const brokenWall: AugmentDef = defineAugment({
  id: "broken_wall",
  tier: "prism",
  category: "shape",
  complexity: 2,
  name: "끝없는 윤회",
  description:
    "(상시) 슌쯔가 원을 그리며 순환한다 — 8-9-1, 9-1-2도 하나의 몸통으로 인정된다.",
  detail:
    "자신에게만 적용되며, 화료·텐파이·후리텐·대기·치 판정에 모두 반영된다.",
  install(ctx) {
    ctx.setHolderRule("scoring.wrapRuns", true);
  },
});
