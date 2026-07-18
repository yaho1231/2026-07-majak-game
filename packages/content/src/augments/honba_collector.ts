/**
 * honba_collector — 본장 수집가 (silver).
 * 본장이 쌓인 국에서 자신이 화료하면 본장 1개당 +200점을 추가로 얻는다.
 */

import { ROUND_SETTLED, defineAugment } from "@majak/core";
import type { AugmentDef, RoundSettledPayload } from "@majak/core";

export const honbaCollector: AugmentDef = defineAugment({
  id: "honba_collector",
  tier: "silver",
  name: "본장 수집가",
  description: "본장이 쌓인 국에서 화료하면 본장 1개당 +200점을 추가로 얻는다.",
  install(ctx) {
    ctx.interceptor(ROUND_SETTLED, (event, ic) => {
      const p = event.payload as RoundSettledPayload;
      if (p.outcome !== "win") return event;
      // ic.state는 정산 적용 전 상태 — 이번 국이 시작될 때 쌓여 있던 본장 수
      // (payload.honba는 다음 국의 본장이라 쓰면 안 된다)
      const honba = ic.state.round.honba;
      if (honba <= 0) return event;
      const won = (p.winInfos ?? []).some((w) => w.winner === ctx.holder);
      if (!won) return event;
      const deltas = {
        ...p.deltas,
        [ctx.holder]: (p.deltas[ctx.holder] ?? 0) + honba * 200,
      };
      return { type: event.type, payload: { ...p, deltas } };
    });
  },
});
