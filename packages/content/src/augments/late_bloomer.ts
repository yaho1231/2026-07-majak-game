/**
 * 대기만성 (late_bloomer, prism).
 * 남4국부터(서입 연장 포함) 국 정산에서 자신이 얻는 점수가 3배가 된다.
 * 잃는 점수(방총·지불)는 그대로 — 종반에만 만개하는 본인 전용 부스터.
 * 게임 전체에 걸쳐 버텨야 의미가 있으므로 게임 시작 드래프트에서만 등장한다.
 *
 * 구현: jackpot과 같은 ROUND_SETTLED 인터셉터로, 다른 증강 보너스까지 모두
 * 반영된 최종 delta[holder]가 양수일 때만 3배로 만든다. "지금 정산되는 국"은
 * 리듀서 적용 전 상태(ic.state.round)로 판정한다 — payload의 국 정보는
 * 다음 국 설정값이므로 쓰지 않는다. 상대 delta는 건드리지 않으므로
 * 늘어난 점수는 판(뱅크)에서 온다 (jackpot·보너스 계열과 같은 방식).
 */

import { ROUND_SETTLED, defineAugment } from "@majak/core";
import type { AugmentDef, RoundSettledPayload } from "@majak/core";

export const lateBloomer: AugmentDef = defineAugment({
  id: "late_bloomer",
  tier: "prism",
  name: "대기만성",
  description:
    "남4국부터 정산에서 당신이 얻는 점수가 3배가 된다. 끝까지 버텨라 — 마지막에 가장 강해진다. (게임 시작 드래프트에서만 등장)",
  draftStages: ["gameStart"],
  install(ctx) {
    const { holder } = ctx;
    ctx.interceptor(ROUND_SETTLED, (event, ic) => {
      // 적용 전 상태 = 지금 정산되는 국. 남4국 이후 또는 서입(연장)이면 발동
      const r = ic.state.round;
      const lateGame =
        (r.prevalentWind === 2 && r.roundNumber >= 4) || r.prevalentWind >= 3;
      if (!lateGame) return event;
      const p = event.payload as RoundSettledPayload;
      const d = p.deltas[holder] ?? 0;
      if (d <= 0) return event; // 잃는 점수는 3배가 되지 않는다
      return {
        type: event.type,
        payload: { ...p, deltas: { ...p.deltas, [holder]: d * 3 } },
      };
    });
  },
});
