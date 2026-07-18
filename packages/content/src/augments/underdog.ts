/**
 * 역전극 (underdog, gold).
 * 화료 순간 자신이 단독 꼴찌라면 +2판.
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef } from "@majak/core";
import { addHanBonus } from "../util.js";

export const underdog: AugmentDef = defineAugment({
  id: "underdog",
  tier: "gold",
  name: "역전극",
  description:
    "화료하는 순간 자신의 점수가 단독 꼴찌(다른 셋보다 모두 낮음)라면 +2판. 공동 꼴찌면 효과가 없다.",
  install(ctx) {
    addHanBonus(ctx, (state) => {
      const me = state.players.find((p) => p.id === ctx.holder);
      if (me === undefined) return 0;
      const soleLast = state.players
        .filter((p) => p.id !== ctx.holder)
        .every((p) => p.score > me.score);
      return soleLast ? 2 : 0;
    });
  },
});
