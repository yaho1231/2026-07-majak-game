/**
 * 오야 근성 (dealer_grit, silver).
 * 자신이 오야(친)인 국에서 화료하면 +1판.
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef } from "@majak/core";
import { addHanBonus } from "../util.js";

export const dealerGrit: AugmentDef = defineAugment({
  id: "dealer_grit",
  tier: "silver",
  name: "오야의 근성",
  description: "자신이 오야(친)인 국에서 화료하면 +1판. 오야가 아닌 국에는 효과가 없다.",
  install(ctx) {
    addHanBonus(ctx, (state) => {
      const me = state.players.find((p) => p.id === ctx.holder);
      return me !== undefined && me.seat === state.round.dealerSeat ? 1 : 0;
    });
  },
});
