/**
 * 함구령 (call_seal, prism) — "6순 동안 우는 소리를 끊는다".
 *
 * 동풍전 2국에 1회·반장전 3국에 1회, 자기 턴에 선언하면 **6순 동안 상대 셋의 후로(치·펑·깡)가 전부 봉인**된다.
 * 상대는 내가 위험패를 던져도 펑·치·대명깡을 할 수 없다 — 그동안 나 혼자 자유롭게
 * 판을 돌린다. 안깡·가깡(내 손 안에서 완결되는 깡)은 남의 버림을 먹는 게 아니라 막지 않는다.
 *
 * 구현: 액티브 선언 + 코어 규칙 `call.blocked`(playerId = 울려는 사람) Modifier.
 * - 선언 시 turnCount를 국 스코프 키에 기록. 봉인은 turnCount − 기록 < 6 동안 유효.
 * - 재사용은 **국 단위 쿨다운**(동풍전 2국 · 반장전 3국, 2026-08-27 사용자 지시).
 * - 봉인은 **보유자가 아닌 사람에게만** 건다(보유자는 정상적으로 후로 가능).
 * - 각 콜 validate가 `call.blocked`를 보고 거부하며, FlowController 후보 생성도 validate로
 *   걸러 봉인 중엔 콜 버튼 자체가 뜨지 않는다(봉인술사 `discard_lock`의 대상 지정 계열).
 */

import { augmentDataSet, defineAugment, playerAtSeat } from "@majak/core";
import type { ActionDef, AugmentDef, GameState, PlayerId } from "@majak/core";
import {
  cooldownReady,
  cooldownUse,
  roundViewKey,
  scaledCooldown,
  trackRoundSeq,
} from "../util.js";
import { clearViewOnDisarm } from "./disarmBanner.js";
import { roundScopedKey } from "./roundScope.js";
import { plan } from "./botPlan.js";

const ID = "call_seal";
const ACTION = "call_seal_use";
/** 봉인 지속 순 수 */
const SEAL_TURNS = 6;

/**
 * 다시 열릴 때까지의 국 수 — **동풍전 2국 / 반장전 3국** (2026-08-27 사용자 지시).
 *
 * 예전에는 매치당 사용 횟수(`matchUses`, 동풍전 1·반장전 2회)였다. 매치 예산이라
 * 언제 태우든 자유였고, 실제로는 승부처 두 국에 몰아서 나갔다 — "한 국에 6순"이라는
 * 짧고 굵은 설계와 달리 **매치의 특정 구간만 통째로 봉인**되는 카드였다. 국 단위
 * 쿨다운으로 바꾸면 같은 총량이 매치 전체에 고르게 퍼지고, 상대도 "다음 두세 국은
 * 안 나온다"를 셀 수 있다.
 */
const cooldownRounds = (state: GameState): number => scaledCooldown(state, 2);
const cooldownOpen = (state: GameState, holder: PlayerId): boolean =>
  cooldownReady(state, ID, holder, cooldownRounds(state));
/**
 * 발동한 순(turnCount) — 봉인 만료 계산용 (마지막 선언 기준).
 *
 * ⚠ **국 스코프여야 한다.** `round.turnCount`는 국이 바뀔 때 0으로 리셋되는데, 기준점을
 * 게임 스코프 키에 두면 다음 국에서 `0 - 6 < 6`이 영원히 참이 되어 6순 봉인이
 * **매치가 끝날 때까지 풀리지 않는다**(2026-07-29 감사). 국 스코프로 두면 키가
 * 저절로 만료되어 다음 국은 깨끗하게 시작한다. 재사용 가능 여부는 국 단위 쿨다운이 본다.
 */
const turnKey = (state: GameState, holder: PlayerId): string =>
  roundScopedKey(ID, "turn", state, holder);

/**
 * 지금 상대 후로가 봉인돼 있는가 — 마지막 선언 후 6순 이내.
 *
 * ⚠ **재사용 게이트를 보지 않는다.** 예전에는 `counterOf(usesKey) === 0`을 앞에 뒀는데,
 * 그러면 활성 판정이 사용 카운터를 겸용하게 된다 — 재장전이 그 카운터를 1 되돌리는
 * 순간(0이 된다) **6순 중 0순만 지났어도 봉인이 그 자리에서 걷혔다**(QA disrupt-b 확정 2).
 * 카운터가 쿨다운으로 바뀐 지금도 같다 — 활성 판정과 재사용 판정은 끝까지 남남이다.
 * 걷히는 조건은 detail이 적은 대로 **6순 경과** 또는 **국 종료** 둘뿐이고, 그 둘은
 * 아래 turnKey(국 스코프 + 6순 창)만으로 정확히 판정된다.
 */
function sealActive(state: GameState, holder: PlayerId): boolean {
  const declared = state.augmentData[turnKey(state, holder)];
  if (typeof declared !== "number") return false;
  return state.round.turnCount - declared < SEAL_TURNS;
}

const sealAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes(ID)) return "no call_seal augment";
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (!cooldownOpen(state, req.player)) return "on cooldown";
    if (sealActive(state, req.player)) return "seal still active";
    return null;
  },
  toEvents: (req, { state }) => [
    ...cooldownUse(state, ID, req.player, cooldownRounds(state)),
    augmentDataSet(turnKey(state, req.player), state.round.turnCount),
    // 발동 사실을 전원에게 알린다 (상대는 왜 못 우는지 알아야 대응한다)
    augmentDataSet(roundViewKey("*", `${ID}:${req.player}`), {
      turnCount: state.round.turnCount,
      until: state.round.turnCount + SEAL_TURNS,
    }),
  ],
};

export const callSeal: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "disrupt",
  complexity: 2,
  name: "함구령",
  description:
    "(동풍전 2국에 1회 · 반장전 3국에 1회) 자기 순에 선언하면 6순 동안 상대 셋의 후로(치·퐁·대명깡)가 전부 봉인된다. 안깡·가깡은 막지 않는다.",
  detail:
    "자기 순에 선언하면 6순 동안 상대 셋은 남의 버림을 먹을 수 없다 — 치·퐁·대명깡이 전부 막힌다. 자기 손 안에서 완결되는 안깡·가깡은 봉인되지 않는다.\n\n봉인이 풀리기 전에는 다시 선언할 수 없고, 6순이 지나면 풀린다. 6순이 다 가기 전에 국이 끝나면 함께 걷힌다(쿨다운은 그대로 돈다). 발동은 전원에게 공개된다.",
  // 봇: 자해 위험이 없다 — 옵션이 뜨면 곧바로 선언한다.
  bot: plan({
    intent: "disrupt",
    oneShot: true,
    pick: ({ options }) => options.find((o) => o.type === ACTION) ?? null,
  }),
  install(ctx) {
    const { engine, holder } = ctx;

    // 쿨다운 기준 — 국이 시작될 때마다 +1, 잔량은 보유자 pill에 그려진다
    trackRoundSeq(ctx, ID, cooldownRounds);

    if (!engine.actions.has(ACTION)) engine.actions.register(sealAction);

    // 봉인 중에는 보유자가 아닌 사람의 후로를 막는다 (call.blocked playerId = 울려는 사람).
    engine.rules.addModifier<boolean>("call.blocked", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId === holder) return cur; // 보유자 본인은 정상 후로
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return cur;
        return sealActive(state, holder) ? true : cur;
      },
    });


    /*
     * 무장해제로 잠기면 «6순 동안 못 운다» 배너도 함께 내린다 (2026-08-23 QA synergy3 disrupt 확정 4).
     * 효과는 게이트가 막는데 배너만 남아 있으면 화면이 정확히 반대를 말한다 —
     * 눈먼 총알·초읽기와 같은 규약이다(disarmBanner.ts).
     */
    clearViewOnDisarm(ctx, () => [roundViewKey("*", `${ID}:${holder}`)]);

    // 쿨다운이 풀렸고 봉인이 활성 중이 아니면 보유자 턴에 선언 후보를 낸다
    ctx.holderTurnOptions((state) =>
      cooldownOpen(state, holder) && !sealActive(state, holder)
        ? [{ type: ACTION, payload: {} }]
        : [],
    );
  },
});
