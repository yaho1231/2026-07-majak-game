/**
 * 욕심 (greed, silver).
 * 화료 시 도라가 3개 이상이면 추가 점수.
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef } from "@majak/core";
import { addWinPointBonus } from "../util.js";

export const greed: AugmentDef = defineAugment({
  id: "greed",
  tier: "silver",
  name: "욕심",
  description:
    "화료 시 도라(표도라 + 적도라)가 3개 이상이면 +2000점을 추가로 받는다. 2개 이하면 효과가 없다.",
  install(ctx) {
    addWinPointBonus(ctx, (_state, info) =>
      info.doraHan + info.redHan >= 3 ? 2000 : 0,
    );
  },
});
