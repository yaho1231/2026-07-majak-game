/**
 * 역만 방어술 (yakuman_shield) — 역만에 면역.
 *
 * ROUND_SETTLED를 가로채, 역만(yakumanCount>0) 화료로 보유자가 잃을
 * 점수를 그 화료 점수 한도 내에서 돌려받고, 같은 만큼 화료자의 이득을
 * 줄여 제로섬을 유지한다 (vengeance 패턴). payload는 새 객체로 반환.
 */

import { ROUND_SETTLED, defineAugment } from "@majak/core";
import type { AugmentDef, RoundSettledPayload } from "@majak/core";

export const yakumanShield: AugmentDef = defineAugment({
  id: "yakuman_shield",
  tier: "gold",
  name: "역만 방어술",
  description:
    "역만에 면역이 된다: 역만 화료로 잃을 점수를 돌려받고, 그만큼 화료자의 이득이 줄어든다.",
  install(ctx) {
    const { holder } = ctx;
    ctx.interceptor(ROUND_SETTLED, (event) => {
      const p = event.payload as RoundSettledPayload;
      if (p.outcome !== "win" || p.winInfos === undefined) return event;
      const loss = p.deltas[holder] ?? 0;
      if (loss >= 0) return event;

      // 역만 화료 건 찾기 (자기 화료는 제외 — 잃는 쪽일 때만 발동)
      const yakumanWin = p.winInfos.find(
        (w) => w.yakumanCount > 0 && w.winner !== holder,
      );
      if (yakumanWin === undefined) return event;

      // 환급액: 실제 잃는 점수와 그 역만의 화료 점수 중 작은 쪽
      const refund = Math.min(-loss, yakumanWin.points);
      if (refund <= 0) return event;

      const deltas = { ...p.deltas };
      deltas[holder] = (deltas[holder] ?? 0) + refund;
      deltas[yakumanWin.winner] = (deltas[yakumanWin.winner] ?? 0) - refund;
      return { type: event.type, payload: { ...p, deltas } };
    });
  },
});
