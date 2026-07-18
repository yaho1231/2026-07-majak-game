/**
 * 현상금 사냥꾼·삼색 (bounty_sanshoku, silver).
 * 본인 전용: 삼색동순을 포함해 화료하면 +4500점 (어려운 역이라 상금이 크다).
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef } from "@majak/core";
import { yakuBountyBonus } from "../util.js";

export const bountySanshoku: AugmentDef = defineAugment({
  id: "bounty_sanshoku",
  tier: "silver",
  name: "삼색 전문가",
  description: "삼색동순(三色同順)을 포함해 화료하면 +4500점을 추가로 받는다.",
  install(ctx) {
    yakuBountyBonus(ctx, ["sanshoku"], 4500);
  },
});
