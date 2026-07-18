/**
 * 유국역만 (nagashi_yakuman, prism).
 * 유국(황패평국) 시, 자신의 버림패가 전부 요구패(1·9·자패)이고 그중 하나도
 * 상대에게 울리지 않았다면 — 본래 "유국만관(流し満貫)"인 이 손을 역만으로 처리한다.
 * 쯔모 역만과 같은 지불(오야 48000 / 자 32000)을 판이 아니라 실제 상대에게서 받는다.
 *
 * 유효 판정 = (이번 국에 내 버림을 아무도 울지 않음) AND (지금 강에 남은 내 버림이
 * 전부 요구패) AND (버림이 하나 이상). 울린 패는 강에서 빠지므로 "강이 깨끗해 보이는"
 * 함정이 생기는데, 울린 순간 called 플래그가 서서 그 경우를 배제한다.
 *
 * 구현:
 * - CALL_MADE / KAN_DECLARED(kan_open) 리액션: 내 버림이 울리면 called=roundKey 기록.
 *   (roundKey가 국마다 달라지므로 국 시작 리셋 없이도 국 단위로 스스로 만료된다.)
 * - ROUND_SETTLED(outcome=draw) 인터셉터: 유효하면 쯔모 역만 지불을 deltas에 더한다.
 *   노텐 벌점 정산 위에 얹으므로(둘 다 적용) 여러 명이 동시에 유국역만이어도 안전하다.
 */

import {
  CALL_MADE,
  KAN_DECLARED,
  ROUND_SETTLED,
  augmentDataSet,
  defineAugment,
  discardsZone,
  isTerminalOrHonor,
  kindOf,
  playerOf,
} from "@majak/core";
import type {
  AugmentDef,
  CallMadePayload,
  GameState,
  KanDeclaredPayload,
  PlayerId,
  RoundSettledPayload,
} from "@majak/core";
import { roundKey, stringOf } from "../util.js";

const ID = "nagashi_yakuman";
/** 내 버림이 이번 국에 울렸는가 (값 = 울린 국의 roundKey) */
const calledKey = (h: PlayerId): string => `${ID}:called:${h}`;

/** 이번 국에 내 버림이 울렸다면 true */
function calledThisRound(state: GameState, holder: PlayerId): boolean {
  return stringOf(state, calledKey(holder)) === roundKey(state);
}

/** 유국역만 성립 여부 — 강의 내 버림이 전부 요구패이고 하나 이상, 울림 없음 */
function nagashiValid(state: GameState, holder: PlayerId): boolean {
  if (calledThisRound(state, holder)) return false;
  const discards = state.zones[discardsZone(holder)]?.tileIds ?? [];
  if (discards.length === 0) return false;
  return discards.every((id) => isTerminalOrHonor(kindOf(state, id)));
}

export const nagashiYakuman: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  name: "유국역만",
  description:
    "유국 시, 자신의 버림패가 전부 요구패(1·9·자패)이고 하나도 울리지 않았다면 유국만관을 역만으로 처리한다. 쯔모 역만과 같은 점수를 상대에게서 받는다.",
  install(ctx) {
    const { holder } = ctx;

    // 내 버림이 울리면(펑·치·명깡) 이번 국 유국역만은 불성립
    ctx.reaction(CALL_MADE, (event, rc) => {
      const p = event.payload as CallMadePayload;
      if (p.from !== holder) return;
      if (!calledThisRound(rc.state, holder)) {
        rc.emit(augmentDataSet(calledKey(holder), roundKey(rc.state)));
      }
    });
    ctx.reaction(KAN_DECLARED, (event, rc) => {
      const p = event.payload as KanDeclaredPayload;
      if (p.kanKind !== "kan_open" || p.calledFrom !== holder) return;
      if (!calledThisRound(rc.state, holder)) {
        rc.emit(augmentDataSet(calledKey(holder), roundKey(rc.state)));
      }
    });

    // 유국 정산: 성립 시 쯔모 역만 지불을 얹는다
    ctx.interceptor(ROUND_SETTLED, (event, ic) => {
      const p = event.payload as RoundSettledPayload;
      if (p.outcome !== "draw") return event;
      if (!nagashiValid(ic.state, holder)) return event;

      const dealerSeat = ic.state.round.dealerSeat;
      const holderIsDealer = playerOf(ic.state, holder).seat === dealerSeat;
      const deltas = { ...p.deltas };
      for (const pl of ic.state.players) {
        if (pl.id === holder) continue;
        // 쯔모 역만: 오야 화료 = 전원 16000 / 자 화료 = 오야 16000·자 8000
        const pay = holderIsDealer ? 16000 : pl.seat === dealerSeat ? 16000 : 8000;
        deltas[pl.id] = (deltas[pl.id] ?? 0) - pay;
        deltas[holder] = (deltas[holder] ?? 0) + pay;
      }
      return { type: event.type, payload: { ...p, deltas } };
    });
  },
});
