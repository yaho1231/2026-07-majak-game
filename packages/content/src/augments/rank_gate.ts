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
 * - 발동 시점은 **내 첫 순**으로 못 박는다(내가 아직 버리지도 울지도 않은 상태 —
 *   앞자리가 울어 내 순이 밀려도 창은 닫히지 않는다). 국이 진행된 뒤 상황을 보고 찍는 증강이 아니라, 국 시작에 거는 선언이다.
 * - 지목은 자해 위험이 전혀 없으므로 봇도 발동한다(옵션이 있으면 아무 상대나 지목).
 */

import {
  ROUND_SETTLED,
  ROUND_STARTED,
  augmentDataSet,
  defineAugment,
  meldCountOf,
  playerAtSeat,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
} from "@majak/core";
import { roundKey, stringOf, viewKey } from "../util.js";
import { plan } from "./botPlan.js";
import { threatWeightOf } from "./botHelpers.js";
import { roundScopedKey } from "./roundScope.js";

const ID = "rank_gate";
const ACTION = "rank_gate_mark";
/** 지목당한 사람의 이번 국 최소 화료 판 */
const MIN_HAN = 5;

/** 이번 국의 지목 대상 — roundKey가 섞여 국이 바뀌면 자동 만료 */
const markKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "mark", state, h);
/** 전원 공개 채널 (지목 관계 연출용) */
const publicKey = (h: PlayerId): string => viewKey("*", `${ID}:${h}`);

/** 이번 국에 이 보유자가 지목한 상대 (없으면 null) */
function markedBy(state: GameState, holder: PlayerId): PlayerId | null {
  return stringOf(state, markKey(state, holder));
}

/**
 * 지금이 **보유자 자신의 첫 순**인가 (아직 아무것도 버리지도 울지도 않았다).
 *
 * ⚠ `round.firstTurn`(첫 바퀴)은 보지 않는다 — 그 플래그는 **누구든** 울거나 깡을 하면
 * 그 자리에서 내려간다. 그래서 내 순이 오기도 전에 앞자리가 한 번 퐁하면, 내가 이 국에
 * 한 장도 버리지 않았는데 발동 창이 이미 닫혀 있었다(2026-08-25 사용자 보고).
 * 국당 1회짜리 선언 증강이 상대의 후로 한 번으로 통째로 사라지는 셈이다.
 *
 * 큰손·일확천금·왕패 지배자와 같은 규약으로 맞춘다 — 판정은 **내 이력**만 본다.
 */
function atFirstTurn(state: GameState, holder: PlayerId): boolean {
  if ((state.round.byPlayer[holder]?.discardCount ?? 0) > 0) return false;
  return meldCountOf(state, holder) === 0;
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
  complexity: 3,
  name: "격(格)",
  description:
    "(매 국 1회) 내 첫 순에 상대 한 명을 지목하면, 그 사람은 이번 국에 4판 이하로는 화료할 수 없다.",
  detail:
    "내 첫 순에 상대 한 명을 지목하면 그 사람은 이번 국에 4판 이하로 화료할 수 없다.\n\n다른 증강이 얹는 판도 센다. 역만은 면제된다. 앞자리가 울어 순이 밀려도 첫 순 창은 닫히지 않는다.",
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

    // 지목 표식을 지운다 — detail이 "국이 끝나면 풀린다"고 약속하므로 **정산에서** 내린다.
    // ROUND_STARTED만 듣던 예전에는 제한이 이미 끝난 뒤에도 정산 화면과 증강 드래프트
    // 내내 배지가 걸려 있는 것처럼 보였다(2026-08-20 QA 문구 감사 §27). 다음 국 시작에도
    // 한 번 더 내리는 것은 유국·중단 등 정산을 타지 않는 경로를 위한 그물이다.
    ctx.reaction(ROUND_SETTLED, (_event, rc) => {
      rc.emit(augmentDataSet(publicKey(holder), null));
    });
    ctx.reaction(ROUND_STARTED, (_event, rc) => {
      rc.emit(augmentDataSet(publicKey(holder), null));
    });
  },
  // 봇: 지목은 자해 위험이 없다 — 기회가 열리면 언제나 첫 후보를 찍는다.
  /**
   * 봇 — 표적을 **좌석 순서로 고르던 것**을 고친다.
   *
   * 예전 정책은 `options.find(...)` 한 줄이라 언제나 후보 목록의 첫 번째, 즉
   * **자리 순서로 정해진 상대**를 찍었다. 지목은 국의 첫 순이라 판에서 읽을 것이 없지만,
   * 그때도 보이는 것이 둘 있다 — **상대가 든 증강**과 **점수**다.
   *
   * 격(格)은 상대의 싼 화료를 막는 물건이니, 원래도 크게 칠 사람에게 걸어 봐야 값이 적다.
   * 그래서 위협이 **가장 큰** 쪽이 아니라, 위협 배수로 정렬해 값이 나는 쪽부터 고른다 —
   * 여기서는 "제일 무서운 상대를 묶는다"를 택했다(선두를 묶는 것과 같은 방향이다).
   */
  bot: plan({
    intent: "disrupt",
    fleeting: true, // 국의 첫 순에만 열린다 — 미룰 수가 없다
    oneShot: true,
    pick: (ctx) => {
      const { options, view } = ctx;
      const mine = options.filter((o) => o.type === ACTION);
      if (mine.length === 0) return null;
      const info = new Map(view.players.map((p) => [p.id, p]));
      let best = mine[0] ?? null;
      let bestScore = -Infinity;
      for (const o of mine) {
        const target = (o.payload as { target?: string }).target;
        const p = target === undefined ? undefined : info.get(target);
        if (p === undefined) continue;
        // 증강이 만드는 위협이 먼저, 같으면 점수가 높은 쪽
        const score = threatWeightOf(ctx, p.augments) * 100000 + p.score;
        if (score > bestScore) {
          bestScore = score;
          best = o;
        }
      }
      return best;
    },
  }),
});
