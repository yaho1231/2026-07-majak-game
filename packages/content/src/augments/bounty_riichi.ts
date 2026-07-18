/**
 * 현상금 사냥꾼·리치 (bounty_riichi, silver).
 * 본인 전용: 리치(또는 더블리치)를 포함해 화료하면 +2500점.
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef } from "@majak/core";
import { yakuBountyBonus } from "../util.js";

export const bountyRiichi: AugmentDef = defineAugment({
  id: "bounty_riichi",
  tier: "silver",
  name: "리치 전문가",
  description: "리치(또는 더블리치)를 걸고 화료하면 +2500점을 추가로 받는다.",
  install(ctx) {
    yakuBountyBonus(ctx, ["riichi", "double_riichi"], 2500);
  },
});
