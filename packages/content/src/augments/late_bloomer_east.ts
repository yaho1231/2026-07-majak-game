/**
 * 대기만성 (late_bloomer_east, prism) — 동풍전 전용.
 *
 * 52차 개편: 반장전판(late_bloomer)과 같은 개편을 동풍전 템포로 옮긴 변형이다.
 * 동4국(남입 연장 포함)에 들어서는 순간 만개해서, 그 이후로는
 *   - 후리텐을 무시하고 론할 수 있고(`win.furiten.enabled` = false)
 *   - 역이 없어도 화료할 수 있다(`win.requiresYaku` = false)
 * 점수 배율은 없다 — 규칙 두 개가 보상이다.
 *
 * 구현은 반장전판과 동일하되, 만개 판정만 동풍전 종반(동4국 이후 또는 남입)으로 바꾼다.
 */

import { ROUND_STARTED, augmentDataSet, defineAugment } from "@majak/core";
import type { AugmentDef, GameState } from "@majak/core";
import { stringOf, viewKey } from "../util.js";

const ID = "late_bloomer_east";

/**
 * 지금이 만개 구간인가 — 동4국 이후 또는 남입(장≥2).
 * (반장전판이 "남4국 이후 또는 서입(장≥3)"인 것과 대칭.)
 */
function inBloom(state: GameState | undefined): boolean {
  if (state === undefined) return false;
  const r = state.round;
  return (r.prevalentWind === 1 && r.roundNumber >= 4) || r.prevalentWind >= 2;
}

export const lateBloomerEast: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "shape",
  // 반장전판(late_bloomer)과 이름이 똑같으면 도감·통계·티어표가 둘을 구분하지 못한다
  // (모드 게이트 덕에 드래프트에는 하나만 뜨지만, 그 셋은 모드와 무관하게 전부 나열한다).
  // 만개 시점이 다른 별개의 증강이므로 이름에 그 시점을 붙여 갈라 둔다.
  name: "대기만성 (동풍전)",
  description:
    "(상시 · 동풍전 전용 · 게임 시작 드래프트에서만 등장) 동4국(남입 연장 포함)에 들어서면 만개한다 — 그 이후로는 후리텐을 무시하고 론할 수 있고, 역이 없어도 화료할 수 있다.",
  draftStages: ["gameStart"],
  modes: ["tonpuu"],
  detail:
    "(상시 · 동풍전 전용 · 게임 시작 드래프트에서만 등장) 동4국(남입 연장 포함)에 들어서는 순간 만개해, 그 이후의 모든 국에서 후리텐이 적용되지 않고 역 없이도 화료할 수 있다. 점수 배율은 붙지 않으며 만개 사실은 전원에게 공개된다. 만개 전까지는 아무 효과도 없다.",
  install(ctx) {
    const { holder } = ctx;
    const vKey = viewKey("*", `${ID}:${holder}`);

    ctx.engine.rules.addModifier<boolean>("win.furiten.enabled", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        return inBloom(rctx.state as GameState | undefined) ? false : cur;
      },
    });

    ctx.engine.rules.addModifier<boolean>("win.requiresYaku", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        return inBloom(rctx.state as GameState | undefined) ? false : cur;
      },
    });

    // 후반에 들어서는 그 순간이 테이블에 보이게 — 전원 공개
    ctx.reaction(ROUND_STARTED, (_event, rc) => {
      if (!inBloom(rc.state)) return;
      if (stringOf(rc.state, vKey) === "만개") return;
      rc.emit(augmentDataSet(vKey, "만개"));
    });
  },
});
