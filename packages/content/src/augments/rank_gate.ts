/**
 * 격(格) (rank_gate, prism) — "격이 다른 상대에게는 싼 손으로 이길 수 없다".
 *
 * 국이 시작되는 첫 순에 상대 한 명을 지목한다. 그 사람은 이번 국에 **4판 이하로는
 * 화료할 수 없다**(win.minHan = 5). 국당 1회, 지목 1명, 내 리스크는 0이다.
 *
 * 설계 결정:
 * - 지목당한 쪽은 손을 키우는 수밖에 없다 — 값싼 속공을 봉인하는 것이지 화료 자체를
 *   막는 것이 아니다. **역만은 코어가 자동으로 면제**한다(막고 싶은 것은 싼 손이다).
 * - 코어의 `win.minHan` 게이트는 `score.extraHan`까지 합쳐 세므로, 판을 얹어 주는
 *   다른 증강과 모순되지 않는다.
 * - **지목형 공통 연출 규칙**: 지목 관계는 전원 공개 뷰 채널(`view:*:`)에 싣는다 —
 *   클라이언트가 피격자 전면 컷인 + 상시 뱃지 + 지목 관계 표식을 그린다.
 * - 발동 시점은 **국 첫 순**으로 못 박는다(아무도 아직 울지 않았고 내가 아직 버리지도
 *   않은 상태). 국이 진행된 뒤 상황을 보고 찍는 증강이 아니라, 국 시작에 거는 선언이다.
 * - 지목은 자해 위험이 전혀 없으므로 봇도 발동한다(옵션이 있으면 아무 상대나 지목).
 */

import { ROUND_STARTED, augmentDataSet, defineAugment, playerAtSeat } from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
} from "@majak/core";
import { roundKey, stringOf, viewKey } from "../util.js";

const ID = "rank_gate";
const ACTION = "rank_gate_mark";
/** 지목당한 사람의 이번 국 최소 화료 판 */
const MIN_HAN = 5;

/** 이번 국의 지목 대상 — roundKey가 섞여 국이 바뀌면 자동 만료 */
const markKey = (state: GameState, h: PlayerId): string =>
  `${ID}:mark:${roundKey(state)}:${h}`;
/** 전원 공개 채널 (지목 관계 연출용) */
const publicKey = (h: PlayerId): string => viewKey("*", `${ID}:${h}`);

/** 이번 국에 이 보유자가 지목한 상대 (없으면 null) */
function markedBy(state: GameState, holder: PlayerId): PlayerId | null {
  return stringOf(state, markKey(state, holder));
}

/** 아직 국 첫 순인가 (아무 후로·깡도 없고 보유자가 아직 버리지 않았다) */
function atFirstTurn(state: GameState, holder: PlayerId): boolean {
  if (!state.round.firstTurn) return false;
  return (state.round.byPlayer[holder]?.discardCount ?? 0) === 0;
}

const markAction: ActionDef<{ target: PlayerId }> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no rank_gate augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (!atFirstTurn(state, req.player)) return "not the first turn of the round";
    if (markedBy(state, req.player) !== null) return "already marked this round";
    const target = req.payload.target;
    if (target === req.player) return "cannot mark yourself";
    if (!state.players.some((p) => p.id === target)) return "unknown target";
    return null;
  },
  toEvents: (req, { state }) => [
    augmentDataSet(markKey(state, req.player), req.payload.target),
    // 지목 관계는 전원 공개 — 피격자 컷인·뱃지·관계 표식의 근거
    augmentDataSet(publicKey(req.player), {
      round: roundKey(state),
      by: req.player,
      target: req.payload.target,
      minHan: MIN_HAN,
    }),
  ],
};

export const rankGate: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "disrupt",
  name: "격(格)",
  description:
    "(매 국 1회) 국의 첫 순에 상대 한 명을 지목하면, 그 사람은 이번 국에 4판 이하로는 화료할 수 없다.",
  detail:
    "(매 국 1회) 아직 아무도 울지 않고 내가 버리지도 않은 국의 첫 순에 상대 한 명을 지목한다. 그 사람은 이번 국 동안 5판 이상이 아니면 화료할 수 없어 값싼 속공이 통째로 봉인된다. 판 계산에는 다른 증강이 얹어 주는 추가 판도 함께 세며, 역만 손은 이 제한에서 자동으로 면제된다. 지목은 전원에게 공개되고 국이 끝나면 풀린다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(markAction);
    }

    // 지목당한 사람은 이번 국에 4판 이하로 화료할 수 없다
    ctx.engine.rules.addModifier<number>("win.minHan", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return cur;
        if (rctx.playerId !== markedBy(state, holder)) return cur;
        return Math.max(cur, MIN_HAN);
      },
    });

    // 국 첫 순의 상대 3명이 후보 (합법성 최종 판정은 validate)
    ctx.holderTurnOptions((state) => {
      if (state.round.phase !== "turn.act") return [];
      if (playerAtSeat(state, state.round.turnSeat).id !== holder) return [];
      if (!atFirstTurn(state, holder)) return [];
      if (markedBy(state, holder) !== null) return [];
      return state.players
        .filter((p) => p.id !== holder)
        .map((p) => ({ type: ACTION, payload: { target: p.id } }));
    });

    // 새 국이 시작되면 지목 표식을 지운다 (뱃지가 다음 국으로 새지 않게)
    ctx.reaction(ROUND_STARTED, (_event, rc) => {
      rc.emit(augmentDataSet(publicKey(holder), null));
    });
  },
  // 봇: 지목은 자해 위험이 없다 — 기회가 열리면 언제나 첫 후보를 찍는다.
  bot: {
    choose({ options }) {
      return options.find((o) => o.type === ACTION) ?? null;
    },
  },
});
