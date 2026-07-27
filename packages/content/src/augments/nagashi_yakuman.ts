/**
 * 유국역만 (nagashi_yakuman, prism).
 * 유국(황패평국) 시, 자신의 버림패가 전부 요구패(1·9 수패)나 자패라면 —
 * 본래 "유국만관(流し満貫)"인 이 손을 역만으로 처리한다.
 * 쯔모 역만과 같은 지불(오야 48000 / 자 32000)을 판이 아니라 실제 상대에게서 받는다.
 *
 * 설계: docs/16_AUGMENT_REDESIGN.md §1b D (52차 버프)
 * 이전엔 "무울림"까지 요구해 사실상 장식이었다. 이제 **울려도 성립한다** —
 * 상대가 내 요구패를 울어 가도 유국역만은 살아 있다. 인정 범위는 요구패 또는 자패
 * (isTerminalOrHonor = 1·9 수패 + 풍패·삼원패)로, 발동 빈도를 실제로 올린다.
 *
 * 유효 판정 = (지금 바닥에 남은 내 버림이 전부 요구패·자패) AND (버림이 하나 이상).
 * 울린 패는 바닥에서 빠지지만 남은 버림이 전부 요구패·자패면 그대로 성립한다.
 *
 * 구현:
 * - ROUND_SETTLED(outcome=draw) 인터셉터: 유효하면 쯔모 역만 지불을 deltas에 더한다.
 *   노텐 벌점 정산 위에 얹으므로(둘 다 적용) 여러 명이 동시에 유국역만이어도 안전하다.
 * - 역만 방어술(yakuman_shield) 보유자는 이 지불에서 면제된다(완전 면역 연동).
 *   유국은 outcome=draw라 방어술 인터셉터가 잡지 못하므로 여기서 연동한다.
 */

import {
  defineAugment,
  discardsZone,
  isTerminalOrHonor,
  kindOf,
  playerOf,
  ROUND_SETTLED,
  SETTLE_STAGE,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  PlayerId,
  RoundSettledPayload,
} from "@majak/core";
import { settleInterceptor } from "../util.js";

const ID = "nagashi_yakuman";

/** 유국역만 성립 여부 — 바닥의 내 버림이 전부 요구패·자패이고 하나 이상 */
function nagashiValid(state: GameState, holder: PlayerId): boolean {
  const discards = state.zones[discardsZone(holder)]?.tileIds ?? [];
  if (discards.length === 0) return false;
  return discards.every((id) => isTerminalOrHonor(kindOf(state, id)));
}

export const nagashiYakuman: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "scoring",
  name: "유국역만",
  description:
    "(상시) 유국 시 자신의 버림패가 전부 요구패(1·9)나 자패라면 유국만관이 역만으로 격상된다. 울려도 성립하며, 쯔모 역만과 같은 점수를 상대에게서 받는다.",
  detail:
    "(상시) 황패유국 시 자신의 버림패가 전부 요구패(1·9 수패)나 자패이면 유국만관이 역만이 된다. 상대가 내 버림을 울어 가도 남은 버림이 전부 요구패·자패면 그대로 성립한다. 지불은 쯔모 역만과 동일해 오야면 각 16000점, 자면 오야 16000점·자 8000점씩 받는다. 버림패가 하나도 없으면 성립하지 않는다.",
  install(ctx) {
    const { holder } = ctx;

    // 유국 정산: 성립 시 쯔모 역만 지불을 얹는다
    // 정산 단계: DrawPatch — 유국 전용 재정산.
    settleInterceptor(ctx, SETTLE_STAGE.DrawPatch, (event, ic) => {
      const p = event.payload as RoundSettledPayload;
      if (p.outcome !== "draw") return event;
      if (!nagashiValid(ic.state, holder)) return event;

      const dealerSeat = ic.state.round.dealerSeat;
      const holderIsDealer = playerOf(ic.state, holder).seat === dealerSeat;
      const deltas = { ...p.deltas };
      for (const pl of ic.state.players) {
        if (pl.id === holder) continue;
        // 역만 방어술 보유자는 유국역만 지불에서 면제된다 (완전 면역 연동)
        if (pl.augments.includes("yakuman_shield")) continue;
        // 쯔모 역만: 오야 화료 = 전원 16000 / 자 화료 = 오야 16000·자 8000
        const pay = holderIsDealer ? 16000 : pl.seat === dealerSeat ? 16000 : 8000;
        deltas[pl.id] = (deltas[pl.id] ?? 0) - pay;
        deltas[holder] = (deltas[holder] ?? 0) + pay;
      }
      return { type: event.type, payload: { ...p, deltas } };
    });
  },
});
