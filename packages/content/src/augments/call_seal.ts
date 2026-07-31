/**
 * 함구령 (call_seal, prism) — "6순 동안 우는 소리를 끊는다".
 *
 * 동풍전 1·반장전 2회, 자기 턴에 선언하면 **6순 동안 상대 셋의 후로(치·펑·깡)가 전부 봉인**된다.
 * 상대는 내가 위험패를 던져도 펑·치·대명깡을 할 수 없다 — 그동안 나 혼자 자유롭게
 * 판을 돌린다. 안깡·가깡(내 손 안에서 완결되는 깡)은 남의 버림을 먹는 게 아니라 막지 않는다.
 *
 * 구현: 액티브 선언 + 코어 규칙 `call.blocked`(playerId = 울려는 사람) Modifier.
 * - 선언 시 turnCount를 게임 단위 키에 기록(동풍전 1·반장전 2회). 봉인은 turnCount − 기록 < 6 동안 유효.
 * - 봉인은 **보유자가 아닌 사람에게만** 건다(보유자는 정상적으로 후로 가능).
 * - 각 콜 validate가 `call.blocked`를 보고 거부하며, FlowController 후보 생성도 validate로
 *   걸러 봉인 중엔 콜 버튼 자체가 뜨지 않는다(봉인술사 `discard_lock`의 대상 지정 계열).
 */

import { augmentDataSet, defineAugment, playerAtSeat } from "@majak/core";
import type { ActionDef, AugmentDef, GameState, PlayerId } from "@majak/core";
import { counterOf, matchUses, roundKey, roundViewKey } from "../util.js";

const ID = "call_seal";
const ACTION = "call_seal_use";
/** 봉인 지속 순 수 */
const SEAL_TURNS = 6;

/** 매치당 사용 횟수 카운터 (게임 단위 — roundKey 없음). 동풍전 1·반장전 2회. */
const usesKey = (holder: PlayerId): string => `${ID}:uses:${holder}`;
const hasUsesLeft = (state: GameState, holder: PlayerId): boolean =>
  counterOf(state, usesKey(holder)) < matchUses(state);
/**
 * 발동한 순(turnCount) — 봉인 만료 계산용 (마지막 선언 기준).
 *
 * ⚠ **국 스코프여야 한다.** `round.turnCount`는 국이 바뀔 때 0으로 리셋되는데, 기준점을
 * 게임 스코프 키에 두면 다음 국에서 `0 - 6 < 6`이 영원히 참이 되어 6순 봉인이
 * **매치가 끝날 때까지 풀리지 않는다**(2026-07-29 감사). 국 스코프로 두면 키가
 * 저절로 만료되어 다음 국은 깨끗하게 시작한다. 사용 횟수(usesKey)는 게임 스코프 유지.
 */
const turnKey = (state: GameState, holder: PlayerId): string =>
  `${ID}:turn:${roundKey(state)}:${holder}`;

/** 지금 상대 후로가 봉인돼 있는가 — 마지막 선언 후 6순 이내 */
function sealActive(state: GameState, holder: PlayerId): boolean {
  if (counterOf(state, usesKey(holder)) === 0) return false;
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
    if (!hasUsesLeft(state, req.player)) return "no uses left this game";
    if (sealActive(state, req.player)) return "seal still active";
    return null;
  },
  toEvents: (req, { state }) => [
    augmentDataSet(usesKey(req.player), counterOf(state, usesKey(req.player)) + 1),
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
  name: "함구령",
  description:
    "(동풍전 1회 · 반장전 2회) 자기 순에 선언하면 6순 동안 상대 셋의 후로(치·펑·대명깡)가 전부 봉인되어 아무도 울지 못한다. 안깡·가깡은 막지 않는다.",
  detail:
    "(동풍전 1회 · 반장전 2회) 자기 순에 선언하면 그 순간부터 6순 동안 상대 세 명이 치·펑·대명깡을 할 수 없다. 자기 손 안에서 완결되는 안깡·가깡은 막지 못하며, 6순이 지나면 봉인이 풀린다. 발동은 전원에게 공개된다.",
  // 봇: 자해 위험이 없다 — 옵션이 뜨면 곧바로 선언한다.
  bot: {
    choose({ options }) {
      return options.find((o) => o.type === ACTION) ?? null;
    },
  },
  install(ctx) {
    const { engine, holder } = ctx;

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

    // 사용 횟수가 남았고 봉인이 활성 중이 아니면 보유자 턴에 선언 후보를 낸다
    ctx.holderTurnOptions((state) =>
      hasUsesLeft(state, holder) && !sealActive(state, holder)
        ? [{ type: ACTION, payload: {} }]
        : [],
    );
  },
});
