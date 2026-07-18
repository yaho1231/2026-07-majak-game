/**
 * 노련함 (veteran, gold).
 * 후반(12순 이후)에 화료하면 후로(치·펑·명깡) 1개당 +1판.
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef } from "@majak/core";
import { addHanBonus } from "../util.js";

export const veteran: AugmentDef = defineAugment({
  id: "veteran",
  tier: "gold",
  name: "노련함",
  description:
    "12순 이후에 화료하면 후로(치·펑·명깡) 1개당 +1판. 11순까지는 효과가 없고, 안깡은 후로로 치지 않는다.",
  install(ctx) {
    addHanBonus(ctx, (state) => {
      if (state.round.turnCount < 12) return 0;
      const melds = state.round.byPlayer[ctx.holder]?.melds ?? [];
      return melds.filter((m) => m.kind !== "kan_closed").length;
    });
  },
});
