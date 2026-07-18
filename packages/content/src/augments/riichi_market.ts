/**
 * riichi_market — 리치봉 시세 (silver).
 * 본인 전용: 화료해 리치봉(공탁)을 회수할 때, 회수하는 리치봉 1개당
 * +1000점을 추가로 받는다. 상대에게는 아무 영향이 없다.
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef } from "@majak/core";
import { addWinPointBonus } from "../util.js";

/** 표준 리치봉 1개 값 (riichiPot을 개수로 환산할 때 쓴다) */
const STICK_VALUE = 1000;

export const riichiMarket: AugmentDef = defineAugment({
  id: "riichi_market",
  tier: "silver",
  name: "리치봉 시세",
  description:
    "화료해 리치봉(공탁)을 회수할 때, 회수하는 리치봉 1개당 +1000점을 추가로 받는다. 리치가 걸린 국을 이길수록 이득이 커진다.",
  install(ctx) {
    // 정산 적용 전 state의 공탁(리치봉 누적)을 개수로 환산해 개당 +1000점.
    // 본인이 리치를 걸고 이기면 최소 1개(자기 리치봉)가 잡혀 항상 발동한다.
    addWinPointBonus(ctx, (state) => {
      const pot = state.round.riichiPot;
      if (pot <= 0) return 0;
      return Math.round(pot / STICK_VALUE) * 1000;
    });
  },
});
