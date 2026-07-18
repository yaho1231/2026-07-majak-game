/**
 * 막판 스퍼트 (final_spurt, silver).
 * 패산이 20장 이하로 남았을 때 화료하면 +1판.
 */

import { WALL, defineAugment } from "@majak/core";
import type { AugmentDef } from "@majak/core";
import { addHanBonus } from "../util.js";

export const finalSpurt: AugmentDef = defineAugment({
  id: "final_spurt",
  tier: "silver",
  name: "막판 스퍼트",
  description: "패산(남은 쯔모 패)이 20장 이하로 남은 시점에 화료하면 +1판.",
  install(ctx) {
    addHanBonus(ctx, (state) =>
      (state.zones[WALL]?.tileIds.length ?? 0) <= 20 ? 1 : 0,
    );
  },
});
