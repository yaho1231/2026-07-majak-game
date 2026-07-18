/**
 * 현상금 사냥꾼·혼일색 (bounty_honitsu, silver).
 * 본인 전용: 혼일색 또는 청일색을 포함해 화료하면 +4500점.
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef } from "@majak/core";
import { yakuBountyBonus } from "../util.js";

export const bountyHonitsu: AugmentDef = defineAugment({
  id: "bounty_honitsu",
  tier: "silver",
  name: "혼일색 전문가",
  description: "혼일색 또는 청일색을 포함해 화료하면 +4500점을 추가로 받는다.",
  install(ctx) {
    yakuBountyBonus(ctx, ["honitsu", "chinitsu"], 4500);
  },
});
