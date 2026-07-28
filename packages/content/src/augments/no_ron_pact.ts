/**
 * 불가침 조약 (no_ron_pact, prism) — "초반 6순, 나에게만 총알이 튕겨 나간다".
 *
 * 매 국 **첫 6순 동안 보유자는 론당하지 않는다**. 위험패를 콧노래로 던져도 방총이 없다.
 * 단, **내가 리치를 걸거나 후로(치·펑·깡)하는 순간 조약은 즉시 파기**된다 —
 * 그 뒤로는 평범하게 론당한다.
 *
 * 구현: 순수 패시브. 액티브 버튼·클라 배선 없음.
 * - 코어 규칙 `win.ronImmune`(playerId = '쏘일 사람', 천하무적이 쓰는 것) Modifier.
 *   `turnCount <= 6`(turnCount는 오야가 뽑을 때만 +1 = 진짜 순 단위) & 보유자 리치 없음
 *   & 후로 없음일 때만 true.
 * - 쯔모·유국엔 무력. 막는 것은 오직 "내 버림패로 쏘이는 것"뿐.
 * - 조약 파기(리치·후로)는 상태에서 결정적으로 읽으므로 별도 플래그가 필요 없다.
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef, GameState, PlayerId } from "@majak/core";

const ID = "no_ron_pact";
/** 조약이 유효한 마지막 순 (turnCount ≤ PACT_TURNS) */
const PACT_TURNS = 6;

/** 지금 조약이 보유자를 보호하는가 */
function pactActive(state: GameState, holder: PlayerId): boolean {
  if (state.round.turnCount > PACT_TURNS) return false;
  const rs = state.round.byPlayer[holder];
  if (rs === undefined) return false;
  // 내가 리치를 걸었으면 파기
  if (rs.riichi !== null && rs.riichi !== undefined) return false;
  // 내가 후로했으면 파기 (멘쯔가 하나라도 있으면 운 것)
  if (rs.melds.length > 0) return false;
  return true;
}

export const noRonPact: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "defense",
  name: "불가침 조약",
  description:
    "(상시) 매 국 첫 6순 동안 당신은 론당하지 않는다 — 위험패를 던져도 방총이 없다. 단, 당신이 리치하거나 후로하는 순간 조약은 즉시 파기된다.",
  detail:
    "(상시) 매 국 첫 6순 동안 무엇을 버려도 타가는 당신을 론할 수 없다. 다만 당신이 리치를 걸거나 치·펑·깡으로 후로하는 순간 조약이 즉시 파기되어 그 뒤로는 평범하게 론당한다. 상대의 쯔모 화료나 유국 노텐 벌점은 막지 못하며, 7순부터는 효과가 사라진다.",
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
  },
  // 봇 정책 없음 — 패시브라 발동 판단이 없다.
});
