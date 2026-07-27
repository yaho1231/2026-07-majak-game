/**
 * 뚫린 천장 (aotenjou_ceiling, prism).
 * 자신의 화료는 만관·하네만·배만 등 점수 상한 없이 부수×2^(판+2)로 끝까지 계산된다
 * (청천정). 역만은 13판으로 환산해 합산. 판과 부수를 쌓을수록 점수가 폭발한다.
 *
 * 구현: addWinPointBonus로 '상한 없는 총점 − 실제(상한 적용) 총점'을 뱅크에서 전액 얹는다.
 * 보전에는 한도가 없으므로 판·부수를 쌓을수록 꼬리가 그대로 길어진다.
 * WinInfo에 han·fu·yakumanCount·points가 모두 있어 콘텐츠 내에서 재계산 가능하다.
 */

import { defineAugment, playerAtSeat } from "@majak/core";
import type { AugmentDef, GameState, WinInfo } from "@majak/core";
import { addWinPointBonus } from "../util.js";

const roundUp100 = (n: number): number => Math.ceil(n / 100) * 100;

/** 상한 없는 청천정 총점 (화료자 기준, 본장·공탁 제외) */
function aotenjouTotal(info: WinInfo, isDealer: boolean): number {
  const effHan = info.han + 13 * info.yakumanCount;
  const base = info.fu * 2 ** (2 + effHan);
  if (info.winType === "ron") {
    return roundUp100(base * (isDealer ? 6 : 4));
  }
  if (isDealer) {
    return roundUp100(base * 2) * 3;
  }
  return roundUp100(base * 2) + roundUp100(base) * 2;
}

export const aotenjouCeiling: AugmentDef = defineAugment({
  id: "aotenjou_ceiling",
  tier: "prism",
  category: "scoring",
  name: "뚫린 천장",
  description:
    "(상시) 자신의 화료에서 만관·하네만·배만 같은 단계 상한이 사라져, 판·부수가 높을수록 점수가 지수적으로 폭발한다(청천정). 역만은 13판으로 환산한다.",
  detail:
    "(상시) 자신이 화료할 때마다 점수 단계 상한이 적용되지 않고 부수와 판수에 따라 끝까지 계산된다(청천정). 역만은 13판으로 쳐서 합산한다. 상한이 사라져 늘어난 몫은 한도 없이 전액 뱅크가 지급하므로 상대가 더 내지는 않는다.",
  install(ctx) {
    const { holder } = ctx;
    addWinPointBonus(ctx, (state: GameState, info) => {
      const isDealer = playerAtSeat(state, state.round.dealerSeat).id === holder;
      const uncapped = aotenjouTotal(info, isDealer);
      // 48차 무페널티: 보전 캡(32000) 삭제 — 청천정에 천장을 다시 씌우지 않는다
      return uncapped - info.points;
    });
  },
});
