/**
 * 영상 정찰 (rinshan_preview) — 영상패(왕패 앞 4장)를 미리 볼 수 있다.
 *
 * visibility.deadWall 규칙에 Modifier를 얹어, 보유자가 볼 때만
 * {mode:"peek",count:4}를 돌려준다. 왕패의 앞 4장이 곧 영상패
 * (깡 후 보충 쯔모 순서)이므로, 깡 선택의 정보 우위를 준다.
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef, VisibilityRule } from "@majak/core";

export const rinshanPreview: AugmentDef = defineAugment({
  id: "rinshan_preview",
  tier: "gold",
  name: "영상 정찰",
  description: "영상패(왕패 앞 4장)를 미리 볼 수 있다.",
  install(ctx) {
    const { holder } = ctx;
    ctx.engine.rules.addModifier<VisibilityRule>("visibility.deadWall", {
      source: ctx.instanceId,
      layer: ctx.layer,
      // 보유자 시점에만 왕패 앞 4장(영상패)을 공개
      apply: (cur, rctx) =>
        rctx.playerId === holder ? { mode: "peek", count: 4 } : cur,
    });
  },
});
