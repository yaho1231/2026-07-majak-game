/**
 * 현상금 사냥꾼·또이또이 (bounty_toitoi, silver).
 * 본인 전용: 또이또이(대대화)를 포함해 화료하면 +4000점.
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef } from "@majak/core";
import { yakuBountyBonus } from "../util.js";

export const bountyToitoi: AugmentDef = defineAugment({
  id: "bounty_toitoi",
  tier: "silver",
  name: "또이또이 전문가",
  description: "또이또이(對對和)를 포함해 화료하면 +4000점을 추가로 받는다.",
  install(ctx) {
    yakuBountyBonus(ctx, ["toitoi"], 4000);
  },
});
