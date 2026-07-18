/**
 * 연장전 (overtime, silver).
 * 유국 시 자신이 텐파이였다면, 다음 국의 화료에 +1판.
 */

import {
  ROUND_SETTLED,
  augmentDataSet,
  defineAugment,
  handKindsOf,
  meldCountOf,
  scoringOptionsOf,
  winningKinds,
} from "@majak/core";
import type { AugmentDef, GameState, PlayerId, RoundSettledPayload } from "@majak/core";
import { addHanBonus, flagOf } from "../util.js";

const key = (holder: PlayerId): string => `overtime:${holder}`;

export const overtime: AugmentDef = defineAugment({
  id: "overtime",
  tier: "silver",
  name: "연장전",
  description:
    "유국(황패유국) 시 자신이 텐파이였다면 바로 다음 국의 화료에 +1판. 효과는 다음 국에만 적용되고 사라진다.",
  install(ctx) {
    const k = key(ctx.holder);
    const isTenpai = (state: GameState): boolean =>
      winningKinds(
        handKindsOf(state, ctx.holder),
        meldCountOf(state, ctx.holder),
        undefined,
        scoringOptionsOf(state, ctx.engine.rules, ctx.holder),
      ).length > 0;

    addHanBonus(ctx, (state) => (flagOf(state, k) ? 1 : 0));

    ctx.reaction(ROUND_SETTLED, (event, rc) => {
      const p = event.payload as RoundSettledPayload;
      const tenpaiDraw = p.outcome === "draw" && isTenpai(rc.state);
      if (flagOf(rc.state, k) !== tenpaiDraw) {
        rc.emit(augmentDataSet(k, tenpaiDraw));
      }
    });
  },
});
