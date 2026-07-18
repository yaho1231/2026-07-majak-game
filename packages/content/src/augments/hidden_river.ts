/**
 * 안개 강 (hidden_river) — 자신의 버림패가 상대에게 장수만 보인다.
 *
 * visibility.discards 규칙에 Modifier를 얹어, "타인이 보유자의 강을
 * 보는" 시점에만 "count_only"를 돌려준다. 보유자 본인에게는 그대로
 * 공개되고, 마지막 버림패는 round.lastDiscard로 별도 노출되므로
 * 론·부로 반응 판정에는 지장이 없다.
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef, VisibilityRule } from "@majak/core";

export const hiddenRiver: AugmentDef = defineAugment({
  id: "hidden_river",
  tier: "gold",
  name: "안개 강",
  description: "자신의 버림패가 상대에게는 장수만 보인다 (마지막 버림패는 보인다).",
  install(ctx) {
    const { holder } = ctx;
    ctx.engine.rules.addModifier<VisibilityRule>("visibility.discards", {
      source: ctx.instanceId,
      layer: ctx.layer,
      // 존 주인이 보유자이고, 뷰어가 타인일 때만 장수만 공개
      apply: (cur, rctx) =>
        rctx.zoneOwner === holder && rctx.playerId !== holder
          ? "count_only"
          : cur,
    });
  },
});
