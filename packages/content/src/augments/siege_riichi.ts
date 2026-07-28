/**
 * 공성계 (siege_riichi, prism) — **텐파이가 아니어도 리치를 선언할 수 있다.**
 * 가짜 리치로 테이블을 접게 만드는 순수 심리전. 걸고 나면 손이 잠기고 쯔모기리가
 * 강제되는 것은 진짜 리치와 같다 — 다만 화료는 애초에 불가능하다.
 *
 * 부수는 상식: "리치는 텐파이 선언"이라는 대전제. 노텐 리치로 상대를 속인다.
 *
 * 도파민 순간: 누가 봐도 위험한 판에 홀더가 리치를 때린다 — 셋이 전부 손을 접고
 * 안전패만 버리는데, 정작 홀더 손은 텐파이가 아니다. 유국이 나야 진실이 드러난다.
 *
 * 대응: 리치봉 1000점과 노텐 벌부가 그대로 걸리는 자해다 — 홀더가 리치 후에도
 * 값싼 손처럼 굴면 블러프를 의심하라. 쯔모기리라 홀더의 버림은 정보가 되지 않는다.
 *
 * 구현: 코어 규칙 `riichi.requiresTenpai`(보유자 전용, false) 하나. 리치 액션 validate가
 * 텐파이 검사를 이 규칙으로 게이트한다. 손 잠금·쯔모기리·리치봉·노텐 판정은 표준 그대로 —
 * 텐파이가 아니므로 winningKinds가 0이라 유국에 자동으로 노텐 처리된다.
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef } from "@majak/core";

export const siegeRiichi: AugmentDef = defineAugment({
  id: "siege_riichi",
  tier: "prism",
  category: "riichi",
  name: "공성계",
  description:
    "(상시) 텐파이가 아니어도 리치를 선언할 수 있다.",
  detail:
    "(상시) 리치의 텐파이 조건이 사라져 노텐 상태로도 리치를 걸 수 있다. 손이 잠기고 쯔모기리가 강제되는 것은 진짜 리치와 같고, 텐파이가 아니면 당연히 화료할 수 없다. 리치봉 1000점과 유국 시 노텐 벌부도 그대로 걸린다.",
  install(ctx) {
    ctx.setHolderRule("riichi.requiresTenpai", false);
  },
});
