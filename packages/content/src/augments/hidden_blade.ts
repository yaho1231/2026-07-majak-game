/**
 * 숨은 칼날 (hidden_blade, gold).
 * 리치를 선언하지 않은 멘젠 론 화료에 +2판 — 그리고 **리치를 걸지 않았는데도
 * 뒷도라가 적용된다**. 공탁 1000점도, 손을 굳히는 대가도 없이 리치의 가장 큰
 * 보상만 가져오는 다마텐 전용 칼이다.
 *
 * 구현:
 *  - 보조(auxiliary) 커스텀 역: winType==='ron' + isClosed(멘젠) + riichi 미선언.
 *    다른 실역이 있어야 붙는다(wait_art와 같은 패턴).
 *  - 뒷도라: 코어 규칙 `scoring.uraWithoutRiichi` Modifier. buildWinContext가
 *    winType·isClosed를 RuleContext로 넘겨 주므로 "다마텐 론"만 정확히 골라
 *    WinContext.uraAlways를 켠다(evaluate가 리치 대신 이 플래그로 우라를 센다).
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef, GameState } from "@majak/core";
import { addYakuHolder, yakuHolders } from "../util.js";

const ID = "hidden_blade";

export const hiddenBlade: AugmentDef = defineAugment({
  id: ID,
  tier: "gold",
  category: "scoring",
  name: "숨은 칼날",
  description:
    "(상시) 리치를 선언하지 않은 멘젠 론 화료에 +2판이 붙고, 리치를 걸지 않았어도 뒷도라가 적용된다.",
  detail:
    "(상시) 리치를 선언하지 않은 채 멘젠으로 론 화료하면 +2판이 붙고, 리치를 걸지 않았는데도 뒷도라가 뒤집힌다. 리치 역이 붙는 것이 아니라 판만 얹는 것이라 다른 역이 하나 이상 있어야 하며, 쯔모 화료·후로 화료나 실제로 리치를 건 손에는 붙지 않는다.",
  // B급 무효(docs/25 §conflicts): 둘 다 scoring.uraWithoutRiichi를 연다.
  // "멘젠 다마텐 론 + 상대 리치" 손에서 뒷도라 해제가 완전히 중복된다.
  conflicts: ["soul_hunt"],
  install(ctx) {
    const { holder } = ctx;

    // 다마텐 론에 한해 뒷도라를 연다 (winType·isClosed는 buildWinContext가 넘긴다)
    ctx.engine.rules.addModifier<boolean>("scoring.uraWithoutRiichi", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        if (rctx.winType !== "ron" || rctx.isClosed !== true) return cur;
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return cur;
        return state.round.byPlayer[holder]?.riichi == null ? true : cur;
      },
    });

    const yaku = ctx.yaku;
    if (yaku === undefined) return;
    if (yaku.get(ID) === undefined) {
      yaku.register({
        // 무장해제되면 이 역도 함께 잠긴다 (evaluate가 disarmedSources와 대조)
        source: ctx.instanceId,
        id: ID,
        name: "숨은 칼날",
        closedHan: 2,
        openHan: 0,
        auxiliary: true,
        check: (variant, wctx) =>
          wctx.winnerId !== undefined &&
          yakuHolders(yaku, ID).has(wctx.winnerId) &&
          variant.isClosed &&
          wctx.winType === "ron" &&
          wctx.riichi === null,
      });
    }
    addYakuHolder(ctx, yaku, ID);
  },
});
