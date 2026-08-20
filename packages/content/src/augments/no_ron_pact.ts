/**
 * 불가침 조약 (no_ron_pact, prism) — "초반 6순, 나에게만 총알이 튕겨 나간다".
 *
 * 매 국 **첫 6순 동안 보유자는 론당하지 않는다**. 위험패를 콧노래로 던져도 방총이 없다.
 * 단, **내가 리치를 걸거나 후로(치·펑·깡)하는 순간 조약은 즉시 파기**된다 —
 * 그 뒤로는 평범하게 론당한다.
 *
 * 구현: 규칙 하나 + 전원 공개 채널.
 * - 코어 규칙 `win.ronImmune`(playerId = '쏘일 사람', 천하무적이 쓰는 것) Modifier.
 *   `turnCount <= 6`(turnCount는 오야가 뽑을 때만 +1 = 진짜 순 단위) & 보유자 리치 없음
 *   & 멘쯔 없음일 때만 true.
 * - 쯔모·유국엔 무력. 막는 것은 오직 "내 버림패로 쏘이는 것"뿐.
 * - 조약 파기(리치·멘쯔)는 상태에서 결정적으로 읽으므로 별도 플래그가 필요 없다
 *   (docs/10 §7.4 — 잠금은 상태에서 파생한다).
 *
 * ## 공개 채널 (2026-08-07, Rule #2)
 *
 * 예전엔 규칙 모디파이어 하나가 전부라 **아무 데도 안 보였다.** 상대는 론이 왜 안 뜨는지
 * 모른 채 "이 사람한텐 안 맞네" 하고 넘어갔고, 보유자조차 조약이 아직 살아 있는지
 * 확인할 방법이 없었다 — 발동이 테이블에서 안 보이면 증강이 아니다.
 *
 * 그래서 국 스코프 전원 공개 채널(`view:*:no_ron_pact:{holder}`)에 지금 상태를 싣고,
 * 조약이 바뀔 수 있는 **모든 지점**에서 다시 계산해 동기화한다 — 순이 넘어가는
 * 쯔모(TILE_DRAWN), 리치가 서는 버림(TILE_DISCARDED), 멘쯔가 생기는 후로·깡
 * (CALL_MADE·KAN_DECLARED). 파기·만료도 함께 알린다: 풀렸는데 배너가 남으면
 * 상대가 쏠 수 있는데도 안 쏘는 잘못된 대응을 한다(docs/10 §7.4, Rule #4).
 */

import {
  CALL_MADE,
  KAN_DECLARED,
  ROUND_STARTED,
  TILE_DISCARDED,
  TILE_DRAWN,
  augmentDataSet,
  defineAugment,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  PlayerId,
  TileDiscardedPayload,
} from "@majak/core";
import { flagOf, roundViewKey } from "../util.js";
import { roundScopedKey } from "./roundScope.js";

const ID = "no_ron_pact";
/** 조약이 유효한 마지막 순 (보유자 자신의 버림 횟수 ≤ PACT_TURNS) */
const PACT_TURNS = 6;
/**
 * 이 국에 보유자가 **리치를 선언한 적이 있는가** — 파기는 되돌릴 수 없는 사건이다.
 *
 * 현재 상태(`rs.riichi`)만 보면 승부수(last_stand)로 리치를 물리는 순간 조약이
 * 되살아나, "리치로 압박하고 물러나 다시 무적"이라는 무한 방패가 됐다
 * (2026-08-20 QA 문구 확정 9). 선언 이력으로 판정한다(`hidden_blade`와 같은 방식).
 */
const declaredKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "declared", state, h);
/** 전원 공개: 지금 조약이 살아 있는가 (국 스코프 — 국이 끝나면 엔진이 지운다) */
const pactViewKey = (h: PlayerId): string => roundViewKey("*", `${ID}:${h}`);
/**
 * 같은 사실의 **기계가 읽는 판**(전원 공개) — 봇의 수비 계산이 이걸 본다.
 *
 * 위 채널은 사람이 읽는 한 줄이라 문구가 언제든 다듬어진다. 봇이 그 문구를 조건으로
 * 삼으면 문구를 고치는 순간 **조용히** 틀린다(면역이 아닌데 밀거나, 면역인데 접는다).
 * 두 채널이 같은 리액션에서 함께 나가므로 서로 어긋날 수 없다.
 */
const pactActiveKey = (h: PlayerId): string => roundViewKey("*", `${ID}:active:${h}`);

/** 지금 조약이 보유자를 보호하는가 */
function pactActive(state: GameState, holder: PlayerId): boolean {
  const rs = state.round.byPlayer[holder];
  if (rs === undefined) return false;
  /*
   * '순'은 **내가 몇 번 버렸는가**다 — `turnCount`가 아니다.
   *
   * `turnCount`는 오야가 뽑을 때마다 오르는 전역 카운터라, 남의 영혼의 일격
   * (soul_strike)이 연속으로 6번 뽑으면 **내가 한 장도 더 버리지 않았는데** 조약이
   * 만료됐다(2026-08-20 QA 문구 확정 10). 버림 횟수는 누명(creditTo)에도 흔들리지
   * 않는 실제 순 계수다(docs/25 P5).
   */
  if (rs.discardCount > PACT_TURNS) return false;
  // 이 국에 리치를 선언한 적이 있으면 파기 (물려도 돌아오지 않는다)
  if (rs.riichi !== null && rs.riichi !== undefined) return false;
  if (flagOf(state, declaredKey(state, holder))) return false;
  // 멘쯔가 하나라도 있으면 파기.
  // ⚠ 치·펑·대명깡뿐 아니라 **안깡**과 멘젠이 유지되는 **묵계 퐁**도 여기 걸린다 —
  //    설명이 "후로"라고만 적혀 있어 안깡으로 조약을 스스로 깨는 사고가 났다.
  //    코드를 좁히지 않고(수비 증강이 안깡으로 6순을 더 버티는 것은 다른 밸런스다)
  //    설명을 "멘쯔가 하나라도 생기면"으로 정확히 고쳤다.
  if (rs.melds.length > 0) return false;
  return true;
}

/** 지금 조약 상태를 사람이 읽는 한 줄로 (전원 공개 채널의 값) */
function pactLabel(state: GameState, holder: PlayerId): string {
  if (pactActive(state, holder)) return `조약 유효 — ${PACT_TURNS}순까지 론 불가`;
  const spent = (state.round.byPlayer[holder]?.discardCount ?? 0) > PACT_TURNS;
  return spent ? "조약 만료 — 론 가능" : "조약 파기 — 론 가능";
}

export const noRonPact: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "defense",
  complexity: 3,
  name: "불가침 조약",
  description:
    "(상시) 매 국 첫 6순은 론당하지 않는다. 단 리치·후로(안깡 포함)를 하면 조약이 사라진다.",
  detail:
    "(상시) 매 국 첫 6순 동안 무엇을 버려도 타가는 당신을 론할 수 없다.\n\n파기 조건은 둘이다 — 리치를 걸거나, **손에 멘쯔가 하나라도 생기는 것**. 치·퐁·대명깡은 물론 **안깡도 파기 사유이고, 멘젠이 유지되는 묵계 퐁도 마찬가지다**. 파기되면 그 뒤로는 평범하게 론당한다.\n\n상대의 쯔모 화료나 유국 노텐 벌점은 막지 못하며, 7순부터는 효과가 사라진다. 조약이 지금 유효한지 파기·만료됐는지는 국 내내 전원에게 공개된다.",
  install(ctx) {
    const { holder } = ctx;

    ctx.engine.rules.addModifier<boolean>("win.ronImmune", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return cur;
        return pactActive(state, holder) ? true : cur;
      },
    });

    // 리치 선언 이력 — 한 번 서면 그 국 내내 남는다 (승부수로 물려도 지우지 않는다).
    ctx.reaction(TILE_DISCARDED, (event, rc) => {
      const p = event.payload as TileDiscardedPayload;
      if (!p.riichi || p.player !== holder) return;
      if (flagOf(rc.state, declaredKey(rc.state, holder))) return;
      rc.emit(augmentDataSet(declaredKey(rc.state, holder), true));
    });

    // 조약 상태를 전원 공개 채널에 동기화한다 (값이 그대로면 아무것도 내지 않는다).
    // 조약이 바뀔 수 있는 지점 전부에 같은 리액션을 건다 — 순 진행·리치·후로·깡.
    for (const on of [ROUND_STARTED, TILE_DRAWN, TILE_DISCARDED, CALL_MADE, KAN_DECLARED]) {
      ctx.reaction(on, (_event, rc) => {
        const label = pactLabel(rc.state, holder);
        const active = pactActive(rc.state, holder);
        if (rc.state.augmentData[pactActiveKey(holder)] !== active) {
          rc.emit(augmentDataSet(pactActiveKey(holder), active));
        }
        if (rc.state.augmentData[pactViewKey(holder)] === label) return;
        rc.emit(augmentDataSet(pactViewKey(holder), label));
      });
    }
  },
  // 봇 정책 없음 — 패시브라 발동 판단이 없다.
});
