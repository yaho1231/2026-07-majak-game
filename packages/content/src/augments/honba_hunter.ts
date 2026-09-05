/**
 * 본장 사냥꾼 (honba_hunter, prism) — 쌓인 본장이 전부 내 몫이 된다.
 *
 * 나에게만 본장 1개당 추가 점수가 300 → **1500점**이 된다. 5본장이면 화료에 +7500,
 * 상한은 없다. 론이면 쏜 사람이 전액을, 쯔모면 코어가 1/3씩 나눠 받는다
 * (score.honbaPerStick 규칙 하나로 두 경우가 모두 처리된다).
 *
 * 노잼 방지 — **본장이 쌓이는 것 자체가 테이블의 긴장이 되어야 한다.**
 * 그래서 현재 본장과 "지금 이 국에서 내 본장이 얼마짜리인가"를 매 국 시작마다
 * 전원 공개 채널(view:*:honba_hunter:{holder})에 실어, 클라이언트가 보유자 앞의
 * 본장 표시를 붉게 부풀려 상시 시각화하게 한다. 유국이 반복될수록 표시가 커지므로
 * "쟤 앞에서 유국시키면 안 된다"가 눈으로 보이는 압박이 된다.
 * 정산 보정이 아니라 **테이블 위의 물건이 커지는 것**이 이 증강의 발동 연출이다.
 */

import { ROUND_STARTED, augmentDataSet, defineAugment } from "@majak/core";
import type { AugmentDef } from "@majak/core";
import { roundViewKey } from "../util.js";

const ID = "honba_hunter";
/** 보유자의 본장 1개당 지불액 — 표준은 300이고 이 증강이 그 값을 이만큼으로 올린다 */
const HONBA_PER_STICK = 1500;

export const honbaHunter: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "scoring",
  complexity: 2,
  name: "본장 사냥꾼",
  description:
    "(상시) 나에게만 본장 1개당 추가 점수가 300점이 아니라 1,500점이 된다.",
  detail:
    "내 화료의 본장 보너스가 1개당 300점이 아니라 1,500점이다.\n\n상한은 없고, 내 앞의 본장 표시는 실제 가치만큼 부풀어 전원에게 보인다.",
  install(ctx) {
    const { holder } = ctx;

    // 보유자가 화료할 때만 본장 단가가 오른다 (론·쯔모 배분은 코어가 처리)
    ctx.setHolderRule("score.honbaPerStick", HONBA_PER_STICK);

    // 매 국 시작마다 현재 본장과 그 가치를 전원 공개 — 클라이언트가 본장 표시를 부풀린다
    ctx.reaction(ROUND_STARTED, (_event, rc) => {
      const honba = rc.state.round.honba;
      rc.emit(
        augmentDataSet(roundViewKey("*", `${ID}:${holder}`), {
          honba,
          perStick: HONBA_PER_STICK,
          value: honba * HONBA_PER_STICK,
        }),
      );
    });
  },
});
