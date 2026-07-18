/**
 * noten_insurance — 노텐 보험 (silver).
 * 유국 시 노텐이어도 벌점을 내지 않는다 (draw.notenExempt).
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef } from "@majak/core";

export const notenInsurance: AugmentDef = defineAugment({
  id: "noten_insurance",
  tier: "silver",
  name: "노텐 보험",
  description: "유국 시 노텐이어도 벌점을 내지 않는다.",
  install(ctx) {
    ctx.setHolderRule("draw.notenExempt", true);
  },
});
