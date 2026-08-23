/**
 * 무너진 국경 (broken_border, prism) — **슌쯔를 무늬 상관없이 만든다.**
 * 2만·3통·4삭도 슌쯔다. 랭크만 연속이면 만·통·삭이 뒤섞여도 몸통이 된다.
 *
 * 부수는 상식: "슌쯔는 같은 무늬로 이룬다"는 마작의 대원칙. 무늬라는 국경 자체가
 * 지워진다 — 상대는 이 사람에게 안전한 색이라는 개념을 통째로 잃는다.
 *
 * 대응: 혼색 슌쯔는 청일색·삼색동순·일기통관을 스스로 깨 화력이 낮다.
 * 자패·역패 중심의 큰 손으로 점수 경쟁하거나, 싸구려 속공을 리치 맞불로 눌러야 한다.
 *
 * # 담당 범위 — 슌쯔만 (2026-07-27, 60차 사용자 확정)
 *
 * 예전엔 혼색 **커쯔**(2만·2통·2삭)까지 이 증강이 함께 열었다. 그런데 그건
 * **동수의 결속(`mixed_triplet`)의 능력 전부**여서, 두 증강을 같이 뽑으면 동수의 결속이
 * 아무 일도 하지 않는 죽은 픽이 됐다(무너진 국경 ⊃ 동수의 결속).
 * 그래서 역할을 갈랐다 — **무늬 없는 슌쯔는 무너진 국경, 무늬 없는 커쯔는 동수의 결속.**
 * 둘을 같이 뽑으면 그때 비로소 "랭크만 맞으면 뭐든 몸통"이 완성된다(진짜 시너지).
 *
 * # 2026-08-23 (사용자 지시) — 상시 → **2국에 1회 액티브**
 *
 * 자기 순에 선언한 **그 국 동안만** 무늬 제한이 사라진다. 배선은 형제 둘(동수의 결속·
 * 비대칭)과 함께 `shapeDeclare.ts`가 들고 있다.
 *
 * 구현: 코어 규칙 하나(보유자 전용, 선언한 국 한정) — `scoring.mixedRuns`(혼색 슌쯔).
 * decompose.extractSets가 후보 슌쯔의 무늬 조합까지 시도하고, scoringOptionsOf가
 * 화료·텐파이·대기·후리텐 전 판정 지점에 같은 옵션을 흘린다.
 * **치(chi)도 같은 규칙을 본다** — standardActions의 validate와 FlowController의
 * 후보 생성이 무늬를 안 가린다. (펑·깡은 `scoring.mixedTriplets`를 보므로
 * 동수의 결속 쪽 담당이다.)
 *
 * ⚠ 무늬를 요구하는 역은 standardYaku의 `isPureRun`(삼색동순·일기통관·이페코)이
 *    혼색 슌쯔를 걸러낸다. 안 걸면 2만3통4삭이 '만 슌쯔'로 오인돼 역이 헛성립한다.
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef } from "@majak/core";
import { shapeDeclareParts } from "./shapeDeclare.js";

export const brokenBorder: AugmentDef = defineAugment({
  id: "broken_border",
  tier: "prism",
  category: "shape",
  complexity: 2,
  name: "무너진 국경",
  description:
    "(2국에 1회) 자기 순에 발동하면 이번 국 동안 슌쯔의 무늬 제한이 사라진다 — 2만·3통·4삭도 한 몸통이다.",
  detail:
    "(2국에 1회) 발동한 국에만 열리고, 한 번 쓰면 2국이 지나야 다시 열린다. 그 국 동안은 숫자만 연속이면 만·통·삭이 뒤섞여도 슌쯔가 되며, 화료·텐파이·대기 판정과 치 전부에 적용된다. 혼색으로 만든 슌쯔는 청일색·삼색동순·일기통관을 성립시키지 않는다.\n\n무늬 없는 커쯔(2만·2통·2삭)는 이 증강이 아니라 동수의 결속이 담당한다. 발동은 전원에게 공개되고, 리치 중에는 발동할 수 없다.",
  // 배선은 셋(동수의 결속·무너진 국경·비대칭)이 공유한다 — shapeDeclare.ts 머리말 참고.
  ...shapeDeclareParts({
    id: "broken_border",
    action: "declare_broken_border",
    rule: "scoring.mixedRuns",
    option: "mixedRuns",
  }),
});
