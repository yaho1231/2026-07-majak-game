/**
 * 현상금 사냥꾼·역패 (bounty_yakuhai, silver).
 * 본인 전용: 역패(백·발·중·자풍·장풍)를 하나라도 포함해 화료하면 +2500점.
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef } from "@majak/core";
import { yakuBountyBonus } from "../util.js";

export const bountyYakuhai: AugmentDef = defineAugment({
  id: "bounty_yakuhai",
  tier: "silver",
  name: "역패 전문가",
  description: "역패(백·발·중·자풍·장풍)를 하나라도 포함해 화료하면 +2500점을 추가로 받는다.",
  install(ctx) {
    yakuBountyBonus(
      ctx,
      [
        "yakuhai_haku",
        "yakuhai_hatsu",
        "yakuhai_chun",
        "yakuhai_seat",
        "yakuhai_prevalent",
      ],
      2500,
    );
  },
});
