/**
 * 청빈 (minimalist, gold).
 * 도라를 하나도 갖지 않고 화료하면 큰 추가 점수. (욕심과 정반대)
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef } from "@majak/core";
import { addWinPointBonus } from "../util.js";

export const minimalist: AugmentDef = defineAugment({
  id: "minimalist",
  tier: "gold",
  name: "청빈",
  description:
    "표도라·우라도라·적도라를 하나도 갖지 않은 손으로 화료하면 +3200점. 도라가 한 개라도 있으면 효과가 없다.",
  install(ctx) {
    addWinPointBonus(ctx, (_state, info) =>
      info.doraHan + info.uraHan + info.redHan === 0 ? 3200 : 0,
    );
  },
});
