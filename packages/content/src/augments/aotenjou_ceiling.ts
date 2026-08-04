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
 *    → 지수 성장을 **선형**으로 바꿨다: **만관 위로는 2판당 만관 하나씩** 더 붙는다.
 *      (5·6판=만관, 8판=만관 2.5개, 역만(13판 환산)=만관 5개.)
 *      상한이 없다는 정체성은 그대로다 — 판을 쌓을수록 끝없이 커지되 자릿수가 유지된다.
 *    만관 미만 구간은 표준 계산(부수 × 2^(판+2))을 **상한 없이** 그대로 쓴다.
 *    4판 40부(2560)가 만관(2000)으로 깎이지 않는 것이 이 구간의 '천장 뚫기'다.
 *
 *    ⚠ 기울기는 2026-08-02 같은 날 **판당 만관 1개 → 2판당 만관 1개**로 한 번 더 낮췄다.
 *    판당 1개는 8판 이상에서 조건 없이 2~3배가 나와, 조건이 붙는 배수형 증강
 *    (핏빛 계약 1.5배 · 일확천금 기댓값 1.35배 · 판돈 굴리기 연승 2배)보다 강했다.
 *    지금 곡선의 실효 배율은 6판 1.0 · 8판 1.25 · 10판 1.75 · 역만 1.25배다.
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

/** 만관의 기본점 */
const MANGAN_BASE = 2000;
/** 만관 위로 판 하나가 더해 주는 기본점 — 만관의 절반(= 2판당 만관 하나) */
const PER_HAN_BASE = MANGAN_BASE / 2;
/** 이 판수부터 상한이 걸리기 시작한다 (표준 만관) */
const MANGAN_HAN = 5;

/** 화료형의 실효 판수 — 역만은 판·부를 세지 않으므로(han=0·fu=0) 13판으로 환산한다 */
function effectiveHan(info: WinInfo): number {
  return info.han + 13 * info.yakumanCount;
}

/**
 * 상한 없는 기본점(base).
 *
 * - 5판 미만: 표준과 같은 부수 × 2^(2+판). 다만 **2000점 상한을 씌우지 않는다.**
 * - 5판 이상: 만관 + (판 − 5) × 만관/2. 두 판이 오를 때마다 만관 하나씩.
 */
function aotenjouBase(info: WinInfo): number {
  const effHan = effectiveHan(info);
  if (effHan < MANGAN_HAN) return info.fu * 2 ** (2 + effHan);
  return MANGAN_BASE + (effHan - MANGAN_HAN) * PER_HAN_BASE;
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
    "(상시) 내 화료에는 점수 상한이 없다. 보통은 아무리 판이 높아도 만관·하네만·배만에서 점수가 묶이지만, 나는 판이 오르는 만큼 점수가 계속 커진다 — 2판마다 만관이 하나씩 더 붙는다. 늘어난 점수는 진 사람이 낸다.",
  detail:
    "(상시) 보통 마작은 판이 높아져도 만관·하네만·배만 같은 '계단'에서 점수가 묶인다. 이 증강은 내 화료에서 그 계단을 통째로 없앤다. 만관(5판)을 넘으면 2판이 오를 때마다 만관 한 개분이 더 붙어 8판이면 만관 2.5개, 11판이면 만관 4개, 13판이면 만관 5개가 되고 그 위로도 끝없이 늘어난다. 만관 아래에서도 상한이 없어 4판 40부처럼 원래 만관으로 깎이던 손이 계산 그대로의 값을 받는다. 늘어난 점수는 공짜로 생기지 않고 진 사람이 낸다 — 론이면 쏜 사람이 전부, 쯔모면 나머지 셋이 평소 비율대로 나눠 낸다.",
  install(ctx) {
    const { holder } = ctx;
    addWinPointTransfer(ctx, (state: GameState, info) => {
      /*
       * 오야 배율은 **자리만으로 정하지 않는다** — 정산(`sysSettleWin`)이
       * `isDealer || win.treatAsDealer`로 정하므로 여기서도 같은 기준을 써야 한다.
       * 예전에는 자리만 봐서, 만년 오야·찬탈자가 오야 취급을 켠 국에 상한 해제분만
       * 자 기준으로 깎여 얹혔다(docs/25 역/점수 #15). 큰손이 먼저 고친 것과 같은 문제다.
       */
      const isDealer =
        playerAtSeat(state, state.round.dealerSeat).id === holder ||
        ctx.engine.rules.resolve<boolean>("win.treatAsDealer", {
          playerId: holder,
          state,
        });
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
      return {
        points: uncapped - standard,
        // 결과 화면에는 **만관 위로 살아남은 판수**로 적는다 — 이 증강이 한 일이
        // 곧 "상한에 잘려나갈 판을 그대로 세어 준 것"이라, 역 목록의 다른 줄과
        // 같은 '판' 단위로 읽힌다(2026-08-02 사용자 확정).
        han: Math.max(0, effectiveHan(info) - MANGAN_HAN),
      };
    });
  },
});
