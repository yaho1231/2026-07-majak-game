/**
 * 일확천금 (jackpot, prism).
 * 본인 전용, 고위험 고수익: 국 정산에서 자신의 점수 증감이 항상 2배가 된다.
 * 대박(화료·쯔모)도 두 배, 쪽박(방총·지불)도 두 배 — 판이 크게 요동친다.
 *
 * 구현: ROUND_SETTLED를 Prism 계층에서 가로채, 다른 증강 보너스까지 모두 반영된
 * 최종 delta[holder]를 두 배로 만든다. 상대 delta는 건드리지 않으므로
 * 늘어난/줄어든 점수는 판(뱅크)에서 오간다 (scoreChanged·보너스와 같은 방식).
 */

import { ROUND_SETTLED, defineAugment } from "@majak/core";
import type { AugmentDef, RoundSettledPayload } from "@majak/core";

export const jackpot: AugmentDef = defineAugment({
  id: "jackpot",
  tier: "prism",
  name: "일확천금",
  description:
    "국 정산에서 당신의 점수 증감이 항상 2배가 된다. 대박도, 쪽박도 두 배 — 인생 한 방.",
  install(ctx) {
    const { holder } = ctx;
    ctx.interceptor(ROUND_SETTLED, (event) => {
      const p = event.payload as RoundSettledPayload;
      const d = p.deltas[holder] ?? 0;
      if (d === 0) return event;
      return {
        type: event.type,
        payload: { ...p, deltas: { ...p.deltas, [holder]: d * 2 } },
      };
    });
  },
});
