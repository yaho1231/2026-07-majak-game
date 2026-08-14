/**
 * 승부수 (last_stand, gold).
 * 이번 국 1회, 리치 중이라면 자기 턴에 **언제든** 리치를 취소할 수 있다.
 * 취소하면 리치봉(공탁 낸 점수)을 돌려받는다. 매 국 시작 시 사용 횟수가 초기화된다.
 *
 * 설계: docs/16_AUGMENT_REDESIGN.md §1b D (52차 버프)
 * 이전엔 "패산 10장 이하 + 리치 중"이라는 이중 조건이라 대부분의 국에 아무 일도
 * 일어나지 않았다. 패산 조건을 삭제해 리치를 건 순간부터 언제든 물러설 수 있게 했다 —
 * 억제는 "국당 1회"라는 횟수뿐이다.
 *
 * 구현:
 * - 커스텀 이벤트 RiichiCanceled + 리듀서(리치 해제·리치봉 환급)를 게임당 1회 등록.
 * - 액션 cancel_riichi(자기 턴·리치 중·미사용) → RiichiCanceled + 사용 플래그.
 * - holderTurnOptions로 취소 선택지를 노출, ROUND_STARTED에서 사용 플래그 초기화.
 */

import {
  ROUND_STARTED,
  augmentDataSet,
  defineAugment,
  playerAtSeat,
} from "@majak/core";
import type { ActionDef, AugmentDef, PlayerId } from "@majak/core";
import { flagOf, publishUsesLeft } from "../util.js";
import { waitTilesLeft } from "./botHelpers.js";
import { plan } from "./botPlan.js";

const RIICHI_CANCELED = "RiichiCanceled";
const usedKey = (h: PlayerId): string => `last_stand:used:${h}`;

interface RiichiCanceledPayload {
  player: PlayerId;
  refund: number;
}

const cancelRiichiAction: ActionDef<Record<string, never>> = {
  type: "cancel_riichi",
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes("last_stand")) {
      return "no last_stand augment";
    }
    if (state.augmentData[usedKey(req.player)] === true) {
      return "already used this round";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (state.round.byPlayer[req.player]?.riichi == null) return "not in riichi";
    return null;
  },
  toEvents: (req, { state, rules }) => {
    // 실제로 낸 만큼만, 그리고 공탁에 남아 있는 만큼만 돌려받는다.
    // 공탁을 내지 않는 리치(스텔스 리치)가 규칙 상수를 받아 가면 없던 점수가
    // 생기고 riichiPot이 음수가 되어, 그 국 화료자가 되레 점수를 뺏겼다
    // (docs/25 최우선#2). 손으로 조립한 구 상태에만 규칙값 폴백.
    const paid =
      state.round.byPlayer[req.player]?.riichi?.cost ??
      rules.resolve<number>("riichi.cost", { playerId: req.player, state });
    const refund = Math.max(0, Math.min(paid, state.round.riichiPot));
    return [
      {
        type: RIICHI_CANCELED,
        payload: { player: req.player, refund } satisfies RiichiCanceledPayload,
      },
      augmentDataSet(usedKey(req.player), true),
    ];
  },
};

export const lastStand: AugmentDef = defineAugment({
  id: "last_stand",
  tier: "gold",
  category: "defense",
  complexity: 2,
  name: "승부수",
  description:
    "(매 국 1회) 리치 중이라면 자기 순에 언제든 자신의 리치를 취소할 수 있다. 취소하면 냈던 리치봉을 돌려받고 다시 자유롭게 버릴 수 있다.",
  detail:
    "(매 국 1회) 리치를 건 뒤 아무 때나, 자기 순이면 자신의 리치를 취소한다. 냈던 리치봉을 돌려받고 리치 후리텐도 풀려 다시 자유롭게 버릴 수 있다. 패산이 얼마나 남았든 상관없으며, 사용 횟수는 매 국 시작 시 초기화된다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 남은 사용 횟수를 이름표 pill에 상시 노출한다 (횟수형 증강 공용 규약).
    // 매 국 초기화되는 1회라 "이번 국에 이미 썼나"가 판단의 전부다.
    publishUsesLeft(
      ctx,
      (state) => ({ left: flagOf(state, usedKey(holder)) ? 0 : 1, total: 1 }),
      "round",
    );

    if (!engine.reducers.has(RIICHI_CANCELED)) {
      engine.reducers.register(RIICHI_CANCELED, (state, event) => {
        const p = event.payload as RiichiCanceledPayload;
        const rs = state.round.byPlayer[p.player];
        if (rs === undefined) throw new Error(`RiichiCanceled: unknown ${p.player}`);
        return {
          ...state,
          players: state.players.map((pl) =>
            pl.id === p.player ? { ...pl, score: pl.score + p.refund } : pl,
          ),
          round: {
            ...state.round,
            riichiPot: state.round.riichiPot - p.refund,
            byPlayer: {
              ...state.round.byPlayer,
              [p.player]: { ...rs, riichi: null, riichiFuriten: false },
            },
          },
        };
      });
    }
    if (!engine.actions.has("cancel_riichi")) {
      engine.actions.register(cancelRiichiAction);
    }

    // 매 국 시작 시 사용 플래그 초기화
    ctx.reaction(ROUND_STARTED, (_event, rc) => {
      if (flagOf(rc.state, usedKey(holder))) {
        rc.emit(augmentDataSet(usedKey(holder), false));
      }
    });

    // 리치 중이면 취소 선택지 노출 (validate가 패산·미사용 등 최종 판정)
    ctx.holderTurnOptions((state) =>
      state.round.byPlayer[holder]?.riichi != null
        ? [{ type: "cancel_riichi", payload: {} }]
        : [],
    );
  },
  /**
   * 리치 취소는 폴드 수단이다 — **이길 가망이 사라졌는데 계속 쏘일 위험만 남았을 때**
   * 쓴다. 사람이 실제로 물러서는 두 장면을 그대로 옮겼다.
   *
   *  · 남이 리치를 걸었는데 내 대기가 죽었다(오름패가 세상에 거의 안 남았다).
   *  · 패산이 얼마 안 남아 화료는 어려운데 상대는 아직 위험하다.
   *
   * 취소하면 리치봉도 돌아오고 그 뒤로는 안전패를 골라 낼 수 있다(봇의 버림 판단이
   * 위협을 보고 알아서 접는다). 위협이 없으면 리치는 그대로 두는 것이 항상 낫다.
   */
  bot: plan({
    intent: "defend",
    // 타이밍은 이 정책이 직접 본다 — planner의 일반 적기와 성질이 다르다
    fleeting: true,
    pick: (ctx) => {
      const opt = ctx.options.find((o) => o.type === "cancel_riichi");
      if (opt === undefined) return null;
      if (ctx.threat < 0.9) return null; // 위협이 없으면 물러설 이유가 없다
      const left = waitTilesLeft(ctx);
      const hopeless = left <= 1 || (ctx.wallLeft <= 12 && left <= 3);
      // 여기까지 왔으면 "지금 접지 않으면 방총한다"는 상황이다. 그 급함은 이제
      // 의도(`defend`)가 강도로 옮겨 주므로 정책이 숫자를 직접 쓰지 않는다.
      return hopeless ? opt : null;
    },
  }),
});
