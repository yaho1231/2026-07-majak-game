/**
 * 선봉 (vanguard, gold).
 * 동장(장풍=동)에 화료하면 얻는 점수가 1.5배가 된다. 그 대신 동장이 아닌
 * 다른 장(남·서…)에 화료하면 0.75배만 얻는다 — 초반 러시를 보상하는 본인 전용 배율.
 *
 * 구현: jackpot·late_bloomer와 같은 ROUND_SETTLED 인터셉터. 다른 증강 보너스까지
 * 모두 반영된 최종 delta[holder]에 배율을 곱한다. "지금 정산되는 국"의 장은
 * 리듀서 적용 전 상태(ic.state.round.prevalentWind)로 판정한다 — payload의 장 정보는
 * 다음 국 설정값이므로 쓰지 않는다 (late_bloomer와 동일한 이유).
 * 화료(자신이 winInfos에 포함)했고 그 국에서 얻는 점수가 양수일 때만 적용하며,
 * 늘어난/줄어든 점수는 판(뱅크)에서 오간다 (상대 delta는 건드리지 않는다).
 */

import { ROUND_SETTLED, defineAugment } from "@majak/core";
import type { AugmentDef, RoundSettledPayload } from "@majak/core";

export const vanguard: AugmentDef = defineAugment({
  id: "vanguard",
  tier: "gold",
  name: "선봉",
  description:
    "동장에 화료하면 얻는 점수가 1.5배. 그 대신 동장이 아닌 다른 장에 화료하면 0.75배만 얻는다. 선봉에 서는 자, 초반에 승부를 건다.",
  install(ctx) {
    const { holder } = ctx;
    ctx.interceptor(ROUND_SETTLED, (event, ic) => {
      const p = event.payload as RoundSettledPayload;
      if (p.outcome !== "win") return event;
      // 화료자 본인일 때만 (방총·지불은 그대로)
      const won = (p.winInfos ?? []).some((w) => w.winner === holder);
      if (!won) return event;
      const d = p.deltas[holder] ?? 0;
      if (d <= 0) return event;
      // 적용 전 상태 = 지금 정산되는 국. prevalentWind 1 = 동장(East)
      const east = ic.state.round.prevalentWind === 1;
      const mult = east ? 1.5 : 0.75;
      // 점수는 100점 단위로 유지 (마작 점수 관례)
      const scaled = Math.round((d * mult) / 100) * 100;
      if (scaled === d) return event;
      return {
        type: event.type,
        payload: { ...p, deltas: { ...p.deltas, [holder]: scaled } },
      };
    });
  },
});
