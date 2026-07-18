/**
 * 흐름 (flow, silver).
 * 2국 연속으로 화료에 실패하면, 그 다음 화료에 +2판.
 */

import { ROUND_SETTLED, augmentDataSet, defineAugment } from "@majak/core";
import type { AugmentDef, PlayerId, RoundSettledPayload } from "@majak/core";
import { addHanBonus, counterOf } from "../util.js";

const missKey = (holder: PlayerId): string => `flow:miss:${holder}`;

export const flow: AugmentDef = defineAugment({
  id: "flow",
  tier: "silver",
  name: "흐름",
  description:
    "2국 이상 연속으로 화료하지 못한 뒤 화료하면 +2판. 화료하면 실패 카운트가 0으로 초기화된다.",
  install(ctx) {
    const key = missKey(ctx.holder);
    addHanBonus(ctx, (state) => (counterOf(state, key) >= 2 ? 2 : 0));

    ctx.reaction(ROUND_SETTLED, (event, rc) => {
      const p = event.payload as RoundSettledPayload;
      const won = (p.winInfos ?? []).some((w) => w.winner === ctx.holder);
      rc.emit(augmentDataSet(key, won ? 0 : counterOf(rc.state, key) + 1));
    });
  },
});
