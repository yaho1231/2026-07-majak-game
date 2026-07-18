/**
 * gokuakumudo — 극악무도 (silver).
 * 자신이 화료하면 후로(멜드)한 패 1장당 +100점을 얻는다.
 */

import { WIN_DECLARED, defineAugment, scoreChanged } from "@majak/core";
import type { AugmentDef, WinDeclaredPayload } from "@majak/core";

export const gokuakumudo: AugmentDef = defineAugment({
  id: "gokuakumudo",
  tier: "silver",
  name: "극악무도",
  description: "화료하면 후로한 패 1장당 +100점을 얻는다 (치·펑 3장, 깡 4장).",
  install(ctx) {
    ctx.reaction(WIN_DECLARED, (event, rc) => {
      const p = event.payload as WinDeclaredPayload;
      if (p.winner !== ctx.holder) return;
      // 멜드에 들어간 패의 총 장수 (WIN_DECLARED reducer는 identity — 멜드 그대로)
      const melds = rc.state.round.byPlayer[ctx.holder]?.melds ?? [];
      const tileCount = melds.reduce((sum, m) => sum + m.tileIds.length, 0);
      if (tileCount > 0) {
        rc.emit(scoreChanged(ctx.holder, tileCount * 100, "gokuakumudo"));
      }
    });
  },
});
