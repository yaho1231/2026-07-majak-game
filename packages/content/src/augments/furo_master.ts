/**
 * furo_master — 부르는 게 값 (gold).
 * 화료 시 자신의 후로(멜드) 1개당 +1판.
 */

import { defineAugment, meldCountOf } from "@majak/core";
import type { AugmentDef, GameState } from "@majak/core";

export const furoMaster: AugmentDef = defineAugment({
  id: "furo_master",
  tier: "gold",
  name: "부르는 게 값",
  description: "화료 시 후로(멜드) 1개당 +1판. 부를수록 비싸진다.",
  install(ctx) {
    ctx.engine.rules.addModifier<number>("score.extraHan", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== ctx.holder) return cur;
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return cur;
        return cur + meldCountOf(state, ctx.holder);
      },
    });
  },
});
