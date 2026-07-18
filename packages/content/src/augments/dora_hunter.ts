/**
 * 도라 헌터 (dora_hunter, silver).
 * 이번 국에서 도라를 한 번도 버리지 않고 화료하면 추가 점수 (매 국 판정).
 */

import { defineAugment, discardsZone, doraKindFor, kindKey } from "@majak/core";
import type { AugmentDef } from "@majak/core";
import { addWinPointBonus } from "../util.js";

export const doraHunter: AugmentDef = defineAugment({
  id: "dora_hunter",
  tier: "silver",
  name: "도라 헌터",
  description:
    "이번 국에서 도라(적도라 포함)를 한 장도 버리지 않고 화료하면 +1500점. 도라를 한 번이라도 버렸다면 효과가 없다.",
  install(ctx) {
    addWinPointBonus(ctx, (state) => {
      const doraKeys = new Set(
        state.round.doraIndicators.map((id) => {
          const t = state.tiles[id];
          return t !== undefined ? kindKey(doraKindFor(t.kind)) : "";
        }),
      );
      const discards = state.zones[discardsZone(ctx.holder)]?.tileIds ?? [];
      const discardedDora = discards.some((id) => {
        const t = state.tiles[id];
        if (t === undefined) return false;
        return t.attrs.red === true || doraKeys.has(kindKey(t.kind));
      });
      return discardedDora ? 0 : 1500;
    });
  },
});
