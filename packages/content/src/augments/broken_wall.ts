/**
 * 끝없는 윤회 (broken_wall, prism) — 8-9-1, 9-1-2 같은 순환 슌쯔가 가능해진다.
 * (파일명·id는 옛 이름 `broken_wall` 그대로다 — 출고 이름만 바뀌었다.)
 *
 * 구현: scoring.wrapRuns 규칙을 보유자에게만 켠다. scoringOptionsOf를 거치는
 * 모든 판정 지점(화료·텐파이·후리텐·대기·치 후보)에 일관 적용된다.
 *
 * 2026-08-27 버프: 실측에서 공식 13게임 0승·순수 인간 7게임 0승으로 카탈로그에서
 * 가장 존재감이 없었다(사용자 지시). "순환"이라는 정체성을 슌쯔 밖으로 넓혀,
 * **다른 증강의 ±1 숫자 이동도 1↔9를 넘게** 한다 — `hand.wrapRanks`를 함께 켠다.
 * 연금술사는 9→1·1→9가 가능해지고, 한 끗 차이는 9 대기에 1을(또는 그 반대) 잡아도
 * 밀린다. 규칙 하나로 통신하므로 이 파일은 다른 증강의 id를 알지 못한다.
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef } from "@majak/core";
import { WRAP_RANKS_RULE } from "./wrapRanks.js";

export const brokenWall: AugmentDef = defineAugment({
  id: "broken_wall",
  tier: "prism",
  category: "shape",
  complexity: 2,
  name: "끝없는 윤회",
  description:
    "(상시) 슌쯔가 원을 그리며 순환한다 — 8-9-1, 9-1-2도 하나의 몸통으로 인정된다. 증강의 숫자 이동도 1↔9로 순환한다.",
  detail:
    "자신에게만 적용되며, 화료·텐파이·후리텐·대기·치 판정에 모두 반영된다.\n\n숫자의 끝이 사라지므로, 패의 숫자를 ±1 옮기는 다른 증강도 벽을 넘는다 — 연금술사는 9를 1로·1을 9로 옮길 수 있고, 한 끗 차이는 9 대기에 1을(1 대기에 9를) 쯔모해도 한 칸 밀어 준다.",
  install(ctx) {
    ctx.setHolderRule("scoring.wrapRuns", true);
    // 숫자 이동(±1)을 다루는 증강들이 읽는 축. 보유자 스코프다.
    ctx.setHolderRule(WRAP_RANKS_RULE, true);
  },
});
