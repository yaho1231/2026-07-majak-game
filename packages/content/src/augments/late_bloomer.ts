/**
 * 대기만성 (late_bloomer, prism) — 반장전 전용.
 *
 * 52차 개편: "후반부터 획득 점수 3배"라는 보이지 않는 정산 배율을 **규칙 두 개**로 바꿨다.
 * 남3국(서입 연장 포함)에 들어서는 순간 만개해서, 그 이후로는
 *   - 후리텐을 무시하고 론할 수 있고(`win.furiten.enabled` = false)
 *   - 역이 없어도 화료할 수 있다(`win.requiresYaku` = false)
 *   - 만개 구간의 화료에 +3판이 붙는다
 * 즉 철벽과 무형화료를 한꺼번에 얻는다. 정산 배율은 없다 — 규칙이 본체고 판수는 덤이다.
 *
 * 구현:
 * - 두 규칙 모두 `rules.addModifier`로 **state를 보고 동적으로** 켠다.
 *   (setHolderRule은 상시 고정이라 후반 조건을 표현할 수 없다.)
 *   rctx.state는 undefined일 수 있으므로 반드시 방어한다.
 * - 만개하는 순간이 보이도록 ROUND_STARTED 리액션에서 전원 공개 뷰 채널에 실는다.
 * - 게임 전체를 버텨야 의미가 있으므로 게임 시작 드래프트 전용·반장전 전용은 유지.
 *
 * ## 만개 시점을 남4국 → 남3국으로 앞당긴다 (반장전 QA 2026-08-25)
 *
 * 동풍전판(late_bloomer_east)은 동4국에 만개한다 — 4국 중 1국, 판의 **25%**가 만개 구간이다.
 * 반장전판이 남4국이면 8국 중 1국, **12.5%** 밖에 안 된다. 버티는 대가는 두 배인데 구간
 * 비중은 절반이고, `draftStages: ["gameStart"]` 전용이라 중간에 갈아탈 수도 없었다.
 * 남3국으로 앞당기면 남3·남4 두 국 = 8국 중 2국으로 **동풍전과 같은 25%**가 된다.
 * +3판(동풍전판 +2판)은 그대로 둔다 — 비중을 맞추는 것이 먼저다.
 */

import { ROUND_STARTED, augmentDataSet, defineAugment } from "@majak/core";
import type { AugmentDef, GameState } from "@majak/core";
import { addWinHanBonus, stringOf, viewKey } from "../util.js";

const ID = "late_bloomer";
/** 만개 구간의 화료에 얹는 판수 (동풍전판은 국이 적어 +2판) */
const BLOOM_HAN = 3;

/**
 * 지금이 만개 구간인가 — 남3국 이후 또는 서입(장≥3).
 * (동풍전판이 "동4국 이후 또는 남입(장≥2)"으로 판의 25%인 것과 비중을 맞춘 시점.)
 */
function inBloom(state: GameState | undefined): boolean {
  if (state === undefined) return false;
  const r = state.round;
  return (r.prevalentWind === 2 && r.roundNumber >= 3) || r.prevalentWind >= 3;
}

export const lateBloomer: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "shape",
  complexity: 2,
  // 동풍전판(late_bloomer_east)과 짝을 이루는 이름 — 도감·통계·티어표에서 구분되도록
  // 만개 시점을 이름에 남긴다(둘 다 "대기만성"이면 어느 쪽 기록인지 알 수 없었다).
  name: "대기만성 (반장전)",
  description:
    "(상시 · 반장전 전용 · 게임 시작 드래프트에서만 등장) 남3국(서입 연장 포함)에 들어서면 만개한다 — 그 뒤로는 후리텐을 무시하고 론할 수 있고, 화료에 +3판이 붙는다.",
  draftStages: ["gameStart"],
  // 남3국 템포는 반장전 전용 — 동풍전에는 동4국판(late_bloomer_east)이 대신 나온다.
  modes: ["hanchan"],
  detail:
    "남3국(서입 연장 포함)부터 만개한다 — 그 뒤로는 후리텐을 무시하고 론할 수 있고, 역이 하나도 없어도 화료할 수 있으며(머리 1+몸통 4 형태는 갖춰야 한다), 화료에 +3판이 붙는다.\n\n+3판은 역만에는 붙지 않는다. 만개 전까지는 아무 효과도 없다.",
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

    // 만개 구간의 화료 보상 — 규칙 두 개만으로는 "그래서 뭐가 커졌나"가 정산에 안 보였다.
    // 만개 전 화료에는 0판이므로 전반의 손에는 아무것도 얹히지 않는다.
    addWinHanBonus(ctx, (state) => (inBloom(state) ? BLOOM_HAN : 0));

    // 후반에 들어서는 그 순간이 테이블에 보이게 — 전원 공개
    ctx.reaction(ROUND_STARTED, (_event, rc) => {
      if (!inBloom(rc.state)) return;
      if (stringOf(rc.state, vKey) === "만개") return; // 이미 켜져 있으면 조용히
      rc.emit(augmentDataSet(vKey, "만개"));
    });
  },
});
