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
import { flagOf } from "../util.js";

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
    const refund = rules.resolve<number>("riichi.cost", {
      playerId: req.player,
      state,
    });
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
  name: "승부수",
  description:
    "(매 국 1회) 리치 중이라면 자기 순에 언제든 자신의 리치를 취소할 수 있다. 취소하면 냈던 리치봉을 돌려받고 다시 자유롭게 버릴 수 있다.",
  detail:
    "(매 국 1회) 리치를 건 뒤 아무 때나, 자기 순이면 자신의 리치를 취소한다. 냈던 리치봉을 돌려받고 리치 후리텐도 풀려 다시 자유롭게 버릴 수 있다. 패산이 얼마나 남았든 상관없으며, 사용 횟수는 매 국 시작 시 초기화된다.",
  install(ctx) {
    const { engine, holder } = ctx;

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
  // 봇 정책 없음 — 리치 취소는 순전히 폴드(방총 회피) 수단인데, 봇은 위험을 읽어
  // 접지 않는다. 확정 가치인 리치를 언제 물릴지는 단순 규칙으로 판단할 수 없다.
});
