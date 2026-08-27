/**
 * 혼 사냥 (soul_hunt, prism) — 리치 중인 상대에게서 론하면 그의 리치를 통째로 강탈한다.
 * 내가 리치를 안 걸었어도 그 화료에 **리치 판정(+1판)이 붙고 뒷도라가 뒤집힌다.**
 * (리치 공탁 회수는 화료자가 공탁을 가져가는 표준 정산으로 자동)
 *
 * 부수는 상식: 리치의 보상은 선언한 자의 것 — 사냥당한 리치는 사냥꾼의 전리품이 된다.
 *
 * 도파민 순간: 다마텐으로 리치자를 저격한 순간 리치도 안 건 내 손 밑에서 우라도라가
 * 뒤집힌다 — "네가 왜 우라를 까?!"
 *
 * 대응: 홀더 앞에서 리치는 목에 현상금을 거는 일 — 다마텐 전환이 정면 카운터고,
 * 쯔모·타가 방총에는 아무 일도 없다.
 *
 * 구현: hidden_blade와 같은 두 갈래 —
 *  ① 커스텀 역 `soul_hunt`(론 + 방총자 리치 + 보유자) = 리치 대신 붙는 +1판(오픈에도).
 *     역이므로 다른 실역이 없어도 이 화료를 성립시킨다(win.requiresYaku 충족).
 *  ② 뒷도라: 규칙 `scoring.uraWithoutRiichi` Modifier가 "보유자의 론 + 방총자가 리치"일 때만
 *     WinContext.uraAlways를 켠다. 방총자는 buildWinContext와 같이 lastDiscard.player로 판정.
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef, GameState } from "@majak/core";
import { addYakuHolder, yakuHolders } from "../util.js";

const ID = "soul_hunt";

/** 이 론의 방총자(쏜 사람) — buildWinContext의 from 판정과 동형 */
function ronTarget(state: GameState): string | undefined {
  return state.round.chankan?.player ?? state.round.lastDiscard?.player;
}

export const soulHunt: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "scoring",
  // 난도 2 (2026-08-27 재평가): '리치한 상대를 론하면 내 화료가 리치 취급' — 리치 하나로 읽힌다.
  complexity: 2,
  name: "혼 사냥",
  description:
    "(상시) 리치 중인 상대를 론하면 그의 리치를 강탈한다 — 내 화료가 리치로 취급되어 뒷도라가 적용된다.",
  detail:
    "리치를 걸고 있는 상대에게서 론을 잡으면 그 리치가 내 것이 된다. 내가 리치를 걸지 않았어도 뒷도라가 뒤집히고 +1판이 붙는다 — 내가 이미 리치를 걸었다면 겹쳐 붙지 않는다.\n\n쯔모 화료나 리치를 걸지 않은 상대에게서 잡은 론에는 아무 효과도 없다.",
  install(ctx) {
    const { holder } = ctx;

    // ② 보유자의 론 + 방총자가 리치일 때만 뒷도라를 연다
    ctx.engine.rules.addModifier<boolean>("scoring.uraWithoutRiichi", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        if (rctx.winType !== "ron") return cur;
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return cur;
        const from = ronTarget(state);
        if (from === undefined) return cur;
        return state.round.byPlayer[from]?.riichi != null ? true : cur;
      },
    });

    // ① 강탈한 리치 = 붙는 +1판 (리치 대신). 오픈에도 붙는다(마법적 강탈).
    const yaku = ctx.yaku;
    if (yaku === undefined) return;
    if (yaku.get(ID) === undefined) {
      yaku.register({
        // 무장해제되면 이 역도 함께 잠긴다 (evaluate가 disarmedSources와 대조)
        source: ctx.instanceId,
        id: ID,
        name: "혼 사냥",
        closedHan: 1,
        openHan: 1,
        // "리치 **대신**" 붙는 1판이다 — 내가 이미 리치를 걸었다면 표준 리치가
        // 이미 그 1판을 주고 있으므로 더 붙을 근거가 없다. 예전에는 내 리치 여부를
        // 보지 않아 리치 + 혼 사냥이 **둘 다** 붙어 조용히 +1판이었다
        // (QA score-b 확정 3).
        check: (_variant, wctx) =>
          wctx.winnerId !== undefined &&
          yakuHolders(yaku, ID).has(wctx.winnerId) &&
          wctx.winType === "ron" &&
          wctx.riichi === null &&
          wctx.fromRiichi === true,
      });
    }
    addYakuHolder(ctx, yaku, ID);
  },
});
