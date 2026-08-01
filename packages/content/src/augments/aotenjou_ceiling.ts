/**
 * 뚫린 천장 (aotenjou_ceiling, prism).
 * 자신의 화료에서 만관·하네만·배만 같은 **단계 상한이 사라진다**. 판이 하나 오를 때마다
 * 점수가 그만큼 더 붙고, 늘어난 몫은 **타가가 낸다**.
 *
 * # 2026-08-02 개편 (사용자 지시)
 *
 * 두 가지가 문제였다.
 *
 * 1. **점수가 자릿수를 잃었다.** 정통 청천정(부수 × 2^(판+2))은 판당 2배라, 역만 한 방이
 *    5,923,300점이 됐다(사용자 실측). 25,000점으로 시작하는 판에서 이 숫자는 의미를 잃는다.
 *    → 지수 성장을 **선형**으로 바꿨다: **만관 위로는 판 하나당 만관 하나씩** 더 붙는다.
 *      (5판=만관, 6판=만관×2, 7판=만관×3 … 역만(13판 환산)=만관×9.)
 *      상한이 없다는 정체성은 그대로다 — 판을 쌓을수록 끝없이 커지되 자릿수가 유지된다.
 *    만관 미만 구간은 표준 계산(부수 × 2^(판+2))을 **상한 없이** 그대로 쓴다.
 *    4판 40부(2560)가 만관(2000)으로 깎이지 않는 것이 이 구간의 '천장 뚫기'다.
 *
 * 2. **초과분을 뱅크가 전액 지급해 상대는 한 푼도 안 냈다.** "천장을 뚫었는데 아무도
 *    아파하지 않는" 상태였다. → 늘어난 몫을 **지불자에게서 가져온다**(addWinPointTransfer).
 *    무페널티 원칙(10_AUGMENT_SYSTEM §0)의 명시적 예외이며, 사용자가 지정한 것이다.
 *
 * 결과 화면에는 `augPoints` 한 줄로 "뚫린 천장 +N점"이 남는다 — 예전엔 deltas만 바뀌어
 * 이 증강이 무슨 일을 했는지 화면 어디에도 안 보였다.
 */

import { calculateScore, defineAugment, playerAtSeat } from "@majak/core";
import type { AugmentDef, GameState, WinInfo } from "@majak/core";
import { addWinPointTransfer } from "../util.js";

const roundUp100 = (n: number): number => Math.ceil(n / 100) * 100;

/** 만관의 기본점 — 이 값 하나가 "판 하나 = 만관 하나"의 단위다 */
const MANGAN_BASE = 2000;

/**
 * 상한 없는 기본점(base).
 *
 * - 5판 미만: 표준과 같은 부수 × 2^(2+판). 다만 **2000점 상한을 씌우지 않는다.**
 * - 5판 이상: 만관 기본점 × (판 − 4). 판이 하나 오를 때마다 만관 하나씩.
 *
 * 역만은 코어가 판·부를 세지 않으므로(han=0·fu=0) 13판으로 환산해 같은 자에 얹는다.
 */
function aotenjouBase(info: WinInfo): number {
  const effHan = info.han + 13 * info.yakumanCount;
  if (effHan < 5) return info.fu * 2 ** (2 + effHan);
  return MANGAN_BASE * (effHan - 4);
}

/** 기본점 → 화료자 총 획득점 (표준과 같은 지불 구조·100점 올림) */
function totalOf(base: number, isDealer: boolean, winType: "tsumo" | "ron"): number {
  if (winType === "ron") return roundUp100(base * (isDealer ? 6 : 4));
  if (isDealer) return roundUp100(base * 2) * 3;
  return roundUp100(base * 2) + roundUp100(base) * 2;
}

export const aotenjouCeiling: AugmentDef = defineAugment({
  id: "aotenjou_ceiling",
  tier: "prism",
  category: "scoring",
  name: "뚫린 천장",
  description:
    "(상시) 내 화료에서 만관·하네만·배만 같은 단계 상한이 사라진다 — 만관 위로는 판이 하나 오를 때마다 만관 하나씩 더 붙고, 늘어난 몫은 타가가 낸다.",
  detail:
    "(상시) 내가 화료할 때 점수 단계 상한이 적용되지 않는다. 만관(5판)부터는 판이 하나 오를 때마다 만관 한 개분이 더 붙어 6판이면 만관 2개, 7판이면 3개…처럼 끝없이 늘어나며, 역만은 13판으로 환산한다. 만관 미만에서도 상한이 없어 4판 40부처럼 만관으로 깎이던 손이 제 값을 받는다. 늘어난 점수는 뱅크가 아니라 지불자에게서 가져온다 — 론이면 방총자가, 쯔모면 표준 비율대로 셋이 나눠 낸다.",
  install(ctx) {
    const { holder } = ctx;
    addWinPointTransfer(ctx, (state: GameState, info) => {
      const isDealer = playerAtSeat(state, state.round.dealerSeat).id === holder;
      const uncapped = totalOf(aotenjouBase(info), isDealer, info.winType);
      // 기준선은 '증강이 없었다면 받았을 점수' — info.points를 그대로 쓰면 다른 증강이
      // 배수를 걸어 둔 국에서 그 배수까지 되빼게 된다.
      const standard = calculateScore({
        han: info.han,
        fu: info.fu,
        yakumanCount: info.yakumanCount,
        isDealer,
        winType: info.winType,
      }).total;
      return uncapped - standard;
    });
  },
});
