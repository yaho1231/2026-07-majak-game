/**
 * 투시 (xray_hand) — 상대들의 손패 앞 3장을 항상 볼 수 있다.
 *
 * visibility.hand 규칙에 Modifier를 얹어, "보유자가 타인의 손패 Zone을
 * 보는" 시점에만 {mode:"peek",count:3}을 돌려준다. 그 외(타인끼리·본인
 * 손패)는 기존 값을 그대로 유지하므로 다른 가시성 증강과도 합성된다.
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef, VisibilityRule } from "@majak/core";

export const xrayHand: AugmentDef = defineAugment({
  id: "xray_hand",
  tier: "gold",
  name: "투시",
  description: "상대들의 손패 앞 3장을 항상 볼 수 있다.",
  install(ctx) {
    const { holder } = ctx;
    ctx.engine.rules.addModifier<VisibilityRule>("visibility.hand", {
      source: ctx.instanceId,
      layer: ctx.layer,
      // 뷰어가 보유자이고, 존 주인이 타인일 때만 앞 3장 엿보기
      apply: (cur, rctx) =>
        rctx.playerId === holder &&
        rctx.zoneOwner !== undefined &&
        rctx.zoneOwner !== holder
          ? { mode: "peek", count: 3 }
          : cur,
    });
  },
});
