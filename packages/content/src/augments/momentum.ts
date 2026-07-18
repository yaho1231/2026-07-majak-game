/**
 * 기세 (momentum, gold).
 * 연속으로 화료할수록 판이 커진다: 1연승 +1 → 2연승 +2 → 3연승 이상 +3.
 * 화료하지 못한 국이 하나라도 끼면 연승이 끊긴다.
 */

import { ROUND_SETTLED, augmentDataSet, defineAugment } from "@majak/core";
import type { AugmentDef, PlayerId, RoundSettledPayload } from "@majak/core";
import { addHanBonus, counterOf, viewKey } from "../util.js";

const streakKey = (holder: PlayerId): string => `momentum:streak:${holder}`;

export const momentum: AugmentDef = defineAugment({
  id: "momentum",
  tier: "gold",
  name: "기세",
  description:
    "화료를 연속할수록 판이 커진다 — 1연승 +1판, 2연승 +2판, 3연승 이상 +3판(상한). 화료 없이 국을 넘기면 연승이 0으로 초기화된다.",
  install(ctx) {
    const key = streakKey(ctx.holder);
    // 이번 화료를 포함한 연승 수만큼(최대 3) 판 추가
    addHanBonus(ctx, (state) => Math.min(counterOf(state, key) + 1, 3));

    ctx.reaction(ROUND_SETTLED, (event, rc) => {
      const p = event.payload as RoundSettledPayload;
      const won = (p.winInfos ?? []).some((w) => w.winner === ctx.holder);
      const next = won ? counterOf(rc.state, key) + 1 : 0;
      rc.emit(augmentDataSet(key, next));
      rc.emit(augmentDataSet(viewKey("*", `momentum:${ctx.holder}`), next));
    });
  },
});
