/**
 * 진짜 용 (true_dragon, prism) — 몸통(멘쯔) 5개 + 머리 1개, 총 17장으로 승부한다.
 * 배패를 16장 받고, 화료하면 +2판을 얻는다.
 *
 * 구현:
 * - deal.handSize=16 — setupRound가 이 규칙으로 배패 장수를 정한다.
 * - scoring.totalSets=5 — scoringOptionsOf를 거치는 모든 판정
 *   (화료·텐파이·후리텐·대기)에 5멘쯔 1작두 형태가 일관 적용된다.
 * - score.extraHan +3 — 다른 extraHan 증강과 합산되도록 교체가 아닌 addModifier.
 *   (역만에는 적용되지 않는다 — sys.settleWin이 보장)
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef } from "@majak/core";

export const trueDragon: AugmentDef = defineAugment({
  id: "true_dragon",
  tier: "prism",
  name: "진짜 용",
  description:
    "배패를 16장 받고, 멘쯔 5개 + 머리 1개(총 17장)로 화료한다. 화료 시 +3판.",
  install(ctx) {
    // 배패 16장 (보유자만)
    ctx.setHolderRule("deal.handSize", 16);
    // 표준형 멘쯔 수 5개 (보유자만)
    ctx.setHolderRule("scoring.totalSets", 5);
    // 화료 시 +3판 — 보유자에게만 현재 값에 더한다
    ctx.engine.rules.addModifier<number>("score.extraHan", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (current, rctx) =>
        rctx.playerId === ctx.holder ? current + 3 : current,
    });
  },
});
