/**
 * 큰손 (big_hand, prism).
 * 본인 전용: 당신의 모든 화료는 최소 만관(오야 12000 / 자 8000)이 보장된다.
 * 값이 그에 못 미치면 판(뱅크)에서 차액을 채워 준다.
 *
 * 값싼 손도 항상 크게 터지므로, 판·부를 신경 쓰지 않고 속공으로 몰아쳐도 된다
 * (플레이스타일이 크게 바뀌는 도파민 증강).
 *
 * 구현: addWinPointBonus로 (만관 하한 − 실제 화료점)만큼 보너스를 얹는다.
 * info.points는 "본장·공탁 제외 화료 획득점"이라 하한 비교에 그대로 쓴다.
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef } from "@majak/core";
import { addWinPointBonus } from "../util.js";

/** 만관 하한 — 자(子) 8000 / 오야(親) 12000 */
const MANGAN_NONDEALER = 8000;
const MANGAN_DEALER = 12000;

export const bigHand: AugmentDef = defineAugment({
  id: "big_hand",
  tier: "prism",
  name: "큰손",
  description:
    "당신의 모든 화료는 최소 만관(오야 12000 · 자 8000)이 보장된다. 값싼 손도 항상 크게 터진다.",
  install(ctx) {
    addWinPointBonus(ctx, (state, info) => {
      const me = state.players.find((p) => p.id === ctx.holder);
      const isDealer = me !== undefined && me.seat === state.round.dealerSeat;
      const floor = isDealer ? MANGAN_DEALER : MANGAN_NONDEALER;
      return Math.max(0, floor - info.points);
    });
  },
});
