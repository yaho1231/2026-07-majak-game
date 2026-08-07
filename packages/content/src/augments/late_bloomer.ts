/**
 * 대기만성 (late_bloomer, prism) — 반장전 전용.
 *
 * 52차 개편: "후반부터 획득 점수 3배"라는 보이지 않는 정산 배율을 **규칙 두 개**로 바꿨다.
 * 남4국(서입 연장 포함)에 들어서는 순간 만개해서, 그 이후로는
 *   - 후리텐을 무시하고 론할 수 있고(`win.furiten.enabled` = false)
 *   - 역이 없어도 화료할 수 있다(`win.requiresYaku` = false)
 * 즉 철벽과 무형화료를 한꺼번에 얻는다. 점수 배율은 1도 없다 — 규칙이 보상이다.
 *
 * 구현:
 * - 두 규칙 모두 `rules.addModifier`로 **state를 보고 동적으로** 켠다.
 *   (setHolderRule은 상시 고정이라 후반 조건을 표현할 수 없다.)
 *   rctx.state는 undefined일 수 있으므로 반드시 방어한다.
 * - 만개하는 순간이 보이도록 ROUND_STARTED 리액션에서 전원 공개 뷰 채널에 실는다.
 * - 게임 전체를 버텨야 의미가 있으므로 게임 시작 드래프트 전용·반장전 전용은 유지.
 */

import { ROUND_STARTED, augmentDataSet, defineAugment } from "@majak/core";
import type { AugmentDef, GameState } from "@majak/core";
import { stringOf, viewKey } from "../util.js";

const ID = "late_bloomer";

/** 지금이 만개 구간인가 — 남4국 이후 또는 서입(장≥3) */
function inBloom(state: GameState | undefined): boolean {
  if (state === undefined) return false;
  const r = state.round;
  return (r.prevalentWind === 2 && r.roundNumber >= 4) || r.prevalentWind >= 3;
}

export const lateBloomer: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "shape",
  // 동풍전판(late_bloomer_east)과 짝을 이루는 이름 — 도감·통계·티어표에서 구분되도록
  // 만개 시점을 이름에 남긴다(둘 다 "대기만성"이면 어느 쪽 기록인지 알 수 없었다).
  name: "대기만성 (반장전)",
  description:
    "(상시 · 반장전 전용 · 게임 시작 드래프트에서만 등장) 남4국(서입 연장 포함)에 들어서면 만개한다 — 그 이후로는 후리텐을 무시하고 론할 수 있고, 역이 없어도 화료할 수 있다.",
  draftStages: ["gameStart"],
  // 남4국 템포는 반장전 전용 — 동풍전에는 동4국판(late_bloomer_east)이 대신 나온다.
  modes: ["hanchan"],
  detail:
    "(상시 · 반장전 전용 · 게임 시작 드래프트에서만 등장) 남4국(서입 연장 포함)에 들어서는 순간 만개해, 그 이후의 모든 국에서 후리텐이 적용되지 않고 역 없이도 화료할 수 있다. 점수 배율은 붙지 않으며 만개 사실은 전원에게 공개된다. 만개 전까지는 아무 효과도 없다.",
  install(ctx) {
    const { holder } = ctx;
    const vKey = viewKey("*", `${ID}:${holder}`);

    // 만개 구간에서만 후리텐 해제 (보유자 한정)
    ctx.engine.rules.addModifier<boolean>("win.furiten.enabled", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        return inBloom(rctx.state as GameState | undefined) ? false : cur;
      },
    });

    // 만개 구간에서만 무형화료 (보유자 한정)
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
      if (stringOf(rc.state, vKey) === "만개") return; // 이미 켜져 있으면 조용히
      rc.emit(augmentDataSet(vKey, "만개"));
    });
  },
});
