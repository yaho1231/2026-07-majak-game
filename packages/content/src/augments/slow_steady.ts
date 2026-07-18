/**
 * slow_steady — 천천히 꾸준히 (gold).
 * 6순이 지날 때마다 화료 시 +1판 (6순 이후 +1, 12순 이후 +2 …).
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef, GameState } from "@majak/core";

export const slowSteady: AugmentDef = defineAugment({
  id: "slow_steady",
  tier: "gold",
  name: "천천히 꾸준히",
  description: "6순이 지날 때마다 화료 시 +1판 (12순이면 +2판…). 늦을수록 강해진다.",
  install(ctx) {
    // score.extraHan은 정산 시점에 state와 함께 resolve된다 — 순수 계산만 한다
    ctx.engine.rules.addModifier<number>("score.extraHan", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== ctx.holder) return cur;
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return cur;
        return cur + Math.floor(state.round.turnCount / 6);
      },
    });
  },
});
