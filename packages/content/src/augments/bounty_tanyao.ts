/**
 * 현상금 사냥꾼·탕야오 (bounty_tanyao, silver).
 * 본인 전용: 탕야오를 포함해 화료하면 +2500점.
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef } from "@majak/core";
import { yakuBountyBonus } from "../util.js";

export const bountyTanyao: AugmentDef = defineAugment({
  id: "bounty_tanyao",
  tier: "silver",
  name: "탕야오 전문가",
  description: "탕야오(단요구)를 포함해 화료하면 +2500점을 추가로 받는다.",
  install(ctx) {
    yakuBountyBonus(ctx, ["tanyao"], 2500);
  },
});
