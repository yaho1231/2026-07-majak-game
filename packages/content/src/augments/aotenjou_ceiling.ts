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

/** 이 판수부터 표준 상한이 걸리기 시작한다 (표시용 판수 계산에만 쓴다) */
const MANGAN_HAN = 5;

/** 화료형의 실효 판수 — 역만은 판·부를 세지 않으므로(han=0·fu=0) 13판으로 환산한다 */
function effectiveHan(info: WinInfo): number {
  return info.han + 13 * info.yakumanCount;
}

export const aotenjouCeiling: AugmentDef = defineAugment({
  id: "aotenjou_ceiling",
  tier: "prism",
  category: "scoring",
  complexity: 3,
  name: "뚫린 천장",
  description:
    "(상시) 내 화료에는 점수 상한이 없다 — 만관·하네만·배만에 묶이지 않고 판이 오르는 만큼 점수가 계속 커진다.",
  detail:
    "만관(5판)을 넘으면 2판마다 만관 한 개분이 더 붙어 8판이면 2.5개, 11판이면 4개가 되고 그 위로도 끝없이 늘어난다. 만관 아래에서도 상한이 없다. 늘어난 몫은 론이면 쏜 사람이 전부, 쯔모면 나머지 셋이 평소 비율대로 낸다.",
  install(ctx) {
    const { holder } = ctx;

    // 보유자에게만 상한 해제를 켠다 — "+N판"을 점수로 환산하는 헬퍼가 이걸 읽고
    // 같은 곡선을 쓴다(`winPointsWithExtraHan`). 그래야 어느 증강이 판을 줬느냐로
    // 상한이 살았다 죽었다 하지 않는다.
    ctx.engine.rules.addModifier<boolean>("score.uncapped", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => (rctx.playerId === holder ? true : cur),
    });

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
      /*
       * 곡선은 **코어의 `calculateScore({ uncapped: true })`가 유일한 구현**이다.
       * 예전에는 이 파일이 곡선을 따로 들고 있어서, 다른 증강이 얹어 주는 "+N판"은
       * 상한 해제를 못 보고 표준 계단에 다시 잘렸다 — 같은 "+3판"인데 실판 계열은
       * 48,000, 뱅크 환산 계열은 42,000이 되고, 계수역만 구간에서는 통째로 0이었다
       * (2026-08-23 QA synergy3 score 확정 6). 지금은 `score.uncapped` 규칙 하나로
       * 그 계열들도 같은 곡선을 본다(`winPointsWithExtraHan`).
       */
      const uncapped = calculateScore({
        han: info.han,
        fu: info.fu,
        yakumanCount: info.yakumanCount,
        isDealer,
        winType: info.winType,
        uncapped: true,
      }).total;
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
