/**
 * 편식 (picky_eater, silver).
 * 만·통·삭 중 한 종류의 수패를 전혀 쓰지 않고 화료하면 추가 점수 (매 국 판정).
 */

import { defineAugment, handKindsOf, isNumberSuit } from "@majak/core";
import type { AugmentDef } from "@majak/core";
import { addWinPointBonus } from "../util.js";

export const pickyEater: AugmentDef = defineAugment({
  id: "picky_eater",
  tier: "silver",
  name: "편식",
  description:
    "만·통·삭 중 최소 한 종류의 수패를 전혀 쓰지 않은 손으로 화료하면 +1000점. 세 수패를 모두 쓰면 효과가 없다.",
  install(ctx) {
    addWinPointBonus(ctx, (state, info) => {
      const suits = new Set<string>();
      for (const k of handKindsOf(state, ctx.holder)) {
        if (isNumberSuit(k)) suits.add(k.suit);
      }
      for (const m of state.round.byPlayer[ctx.holder]?.melds ?? []) {
        for (const id of m.tileIds) {
          const t = state.tiles[id];
          if (t !== undefined && isNumberSuit(t.kind)) suits.add(t.kind.suit);
        }
      }
      const win = state.tiles[info.winningTileId];
      if (win !== undefined && isNumberSuit(win.kind)) suits.add(win.kind.suit);
      return suits.size < 3 ? 1000 : 0;
    });
  },
});
