/**
 * 침착함 (composure, gold).
 * 한 번도 울지 않고(멘젠) 12순 이후에 화료하면 +2판.
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef } from "@majak/core";
import { addHanBonus } from "../util.js";

export const composure: AugmentDef = defineAugment({
  id: "composure",
  tier: "gold",
  name: "침착함",
  description:
    "한 번도 울지 않고(멘젠 유지) 12순 이후에 화료하면 +2판. 치·펑·명깡을 한 번이라도 하면 그 국에는 무효(안깡은 허용).",
  install(ctx) {
    addHanBonus(ctx, (state) => {
      if (state.round.turnCount < 12) return 0;
      const melds = state.round.byPlayer[ctx.holder]?.melds ?? [];
      const opened = melds.some((m) => m.kind !== "kan_closed");
      return opened ? 0 : 2;
    });
  },
});
