/**
 * 자리 바꿈 (seat_swap, prism) — 게임당 1회 자기 턴에 상대를 지정하면,
 * 이번 국이 끝난 뒤(다음 국부터) 그 상대와 자리를 맞바꾼다.
 *
 * 구현 메모:
 * - 선언은 augmentData "seat_swap:{holder}"에 대상만 예약해 둔다 (즉시 효과 없음).
 * - ROUND_SETTLED 반응에서 커스텀 이벤트 SeatsSwapped를 방출해 두 명의 seat 값을
 *   교환하고, 예약을 해제한다. 다음 국의 배패·오야 판정은 새 자리를 따른다.
 */

import {
  ROUND_SETTLED,
  augmentDataSet,
  defineAugment,
  playerAtSeat,
} from "@majak/core";
import type { ActionDef, AugmentDef, PlayerId } from "@majak/core";

/** 자리 교환 확정 이벤트 (증강 id에서 파생한 이름 — 다른 증강과 충돌 방지) */
const SEATS_SWAPPED = "SeatsSwapped";

interface SeatsSwappedPayload {
  a: PlayerId;
  b: PlayerId;
}

/** 예약 키: 대기 중이면 대상 PlayerId, 아니면 null/부재 */
const pendingKey = (player: PlayerId): string => `seat_swap:${player}`;
/** 게임당 1회 사용 플래그 */
const usedKey = (player: PlayerId): string => `seat_swap:used:${player}`;

const seatSwapAction: ActionDef<{ target: PlayerId }> = {
  type: "seat_swap",
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes("seat_swap")) return "no seat_swap augment";
    if (state.augmentData[usedKey(req.player)] === true) {
      return "seat_swap already used";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (req.payload.target === req.player) return "cannot swap with yourself";
    if (!state.players.some((p) => p.id === req.payload.target)) {
      return "unknown target";
    }
    return null;
  },
  toEvents: (req) => [
    augmentDataSet(pendingKey(req.player), req.payload.target),
    augmentDataSet(usedKey(req.player), true),
  ],
};

export const seatSwap: AugmentDef = defineAugment({
  id: "seat_swap",
  tier: "prism",
  name: "자리 바꿈",
  description: "게임당 1회, 상대 한 명을 지정하면 다음 국부터 그 상대와 자리를 맞바꾼다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 이벤트·액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.reducers.has(SEATS_SWAPPED)) {
      engine.reducers.register(SEATS_SWAPPED, (state, event) => {
        const p = event.payload as SeatsSwappedPayload;
        const a = state.players.find((x) => x.id === p.a);
        const b = state.players.find((x) => x.id === p.b);
        if (a === undefined || b === undefined) {
          throw new Error(`SeatsSwapped: unknown player ${p.a}/${p.b}`);
        }
        return {
          ...state,
          players: state.players.map((pl) =>
            pl.id === p.a
              ? { ...pl, seat: b.seat }
              : pl.id === p.b
                ? { ...pl, seat: a.seat }
                : pl,
          ),
        };
      });
    }
    if (!engine.actions.has("seat_swap")) {
      engine.actions.register(seatSwapAction);
    }

    // 국 종료 시 대기 중인 교환을 실행하고 예약을 해제한다 → 다음 국부터 새 자리
    ctx.reaction(ROUND_SETTLED, (_event, rc) => {
      const target = rc.state.augmentData[pendingKey(holder)];
      if (typeof target !== "string") return;
      if (!rc.state.players.some((p) => p.id === target)) return;
      rc.emit({
        type: SEATS_SWAPPED,
        payload: { a: holder, b: target } satisfies SeatsSwappedPayload,
      });
      rc.emit(augmentDataSet(pendingKey(holder), null));
    });

    // 보유자 턴 프롬프트에 상대별 교환 후보 노출 (validate가 최종 판정)
    ctx.holderTurnOptions((state) =>
      state.players
        .filter((p) => p.id !== holder)
        .map((p) => ({ type: "seat_swap", payload: { target: p.id } })),
    );
  },
});
