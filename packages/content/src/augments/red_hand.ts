/**
 * 붉은 손 (red_hand, silver).
 * 화료 시 손에 든 적도라(붉은 5) 1장당 추가 점수.
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef } from "@majak/core";
import { addWinPointBonus } from "../util.js";

export const redHand: AugmentDef = defineAugment({
  id: "red_hand",
  tier: "silver",
  name: "붉은 손",
  description: "화료할 때 손(부로 포함)에 든 적도라(붉은 5) 1장당 +400점을 추가로 받는다.",
  install(ctx) {
    addWinPointBonus(ctx, (_state, info) => info.redHan * 400);
  },
});
