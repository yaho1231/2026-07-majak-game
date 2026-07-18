/**
 * 부숴진 벽 (prism) — 8-9-1, 9-1-2 같은 순환 순자가 가능해진다.
 *
 * 구현: scoring.wrapRuns 규칙을 보유자에게만 켠다. scoringOptionsOf를 거치는
 * 모든 판정 지점(화료·텐파이·후리텐·대기·치 후보)에 일관 적용된다.
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef } from "@majak/core";

export const brokenWall: AugmentDef = defineAugment({
  id: "broken_wall",
  tier: "prism",
  name: "부숴진 벽",
  description: "8-9-1, 9-1-2처럼 9와 1을 이어 붙인 순환 순자를 만들 수 있다.",
  install(ctx) {
    ctx.setHolderRule("scoring.wrapRuns", true);
  },
});
