/**
 * 뒤늦은 출진 (late_double, prism) — "첫 6순을 없던 것으로 친다".
 *
 * 더블리치는 원래 첫 순 텐파이의 특권이지만, 보유자는 **7순까지 더블리치를 걸 수 있다**.
 * 6순을 평범하게 흘려보낸 뒤 7순에 조용히 리치 막대를 놓아도 정산에서 더블리치(2판)가 붙고,
 * 그렇게 더블리치가 된 리치에는 **+1판**이 더 얹힌다(2026-08-02 상향 — 합계 3판).
 *
 * 구현: 순수 콘텐츠. `riichi_upgrade`와 동일한 TILE_DISCARDED 인터셉터 패턴으로,
 * 보유자의 리치 버림이 **turnCount ≤ 7**(turnCount는 오야가 뽑을 때만 +1 = 진짜 순 단위)이면
 * `riichiDouble: true`를 강제한다. 그 이후(8순~)는 표준 판정(첫 버림만 더블)에 맡긴다.
 * 일발·천화 등 다른 첫순 특전은 건드리지 않는다 — 더블 승격만 확장한다.
 *
 * ⚠ 천화 밸런스: 더블 판정에만 개입하므로 천화 성립 순번(첫 자쯔모)에는 영향이 없다.
 *
 * ## 확정된 설계 — 버그로 재보고하지 말 것 (2026-08-04 사용자 확정)
 *
 * 감사에서 "+1판이 **표준 더블리치**(첫 버림 리치)에도 붙는다"가 결함으로 올라왔다
 * (docs/25 역/점수 #18). 사용자 확정 사양은 그대로다 —
 * **7순 안에 선언한 리치는 모두 더블리치로 값하고, 그렇게 취급된 리치에 +1판**이다.
 * 첫 순 리치도 "7순 안에 선언한 리치"이므로 +1판이 붙는 것이 정상이며, 8순 이후
 * 리치만 표준 판정으로 돌아가 보너스도 없다.
 */

import { TILE_DISCARDED, defineAugment } from "@majak/core";
import type { AugmentDef, TileDiscardedPayload } from "@majak/core";
import { addHanBonus } from "../util.js";

const ID = "late_double";
/** 이 순(turnCount)까지의 리치는 더블로 승격된다 */
const DOUBLE_UNTIL_TURN = 7;

export const lateDouble: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "riichi",
  complexity: 2,
  name: "뒤늦은 출진",
  description:
    "(상시) 7순까지 건 리치는 더블리치(2판)로 취급되며, 이렇게 취급된 더블리치에는 +1판이 붙는다.",
  detail:
    "(상시) 7순 안에 선언한 리치는 모두 더블리치 2판으로 값하고, 그렇게 더블리치로 취급된 리치에는 화료 시 **+1판**이 더 붙는다(합계 3판). 앞서 몇 장을 버렸거나 후로로 순서가 흐트러졌어도 상관없다. 8순 이후의 리치는 표준 판정 그대로라 보너스도 붙지 않는다. 일발·천화 같은 다른 첫순 특전은 표준 그대로다.",
  install(ctx) {
    const { holder } = ctx;

    // 보유자의 리치 버림이 7순 이내면 더블리치로 강제 승격.
    ctx.interceptor(TILE_DISCARDED, (event, ic) => {
      const p = event.payload as TileDiscardedPayload;
      if (!p.riichi || p.player !== holder) return event;
      if (ic.state.round.turnCount > DOUBLE_UNTIL_TURN) return event;
      return { type: event.type, payload: { ...p, riichiDouble: true } };
    });

    // 2026-08-02 상향: 이렇게 더블리치가 된 리치에는 **+1판**이 더 붙는다.
    // 승격 여부는 리듀서가 확정한 `riichi.double`로 본다 — 8순 이후 리치는 표준
    // 판정대로 double=false라 보너스도 따라오지 않는다. (승격 시점을 따로 기록하지
    // 않아도 되고, 리치 취소·재선언 같은 경로에서도 상태 하나만 보면 된다.)
    addHanBonus(ctx, (state) =>
      state.round.byPlayer[holder]?.riichi?.double === true ? 1 : 0,
    );
  },
  // 봇 정책 없음 — 리치 자체는 표준 경로로 판단된다(더블 승격은 자동).
});
