/**
 * 음양 반전 (sign_flip, prism) — "이 국만은, 잃을수록 번다".
 *
 * 뽑는 순간 자동으로 발동해 **그 국 하나 동안** 내 점수의 부호가 통째로 뒤집힌다.
 * 8000점을 쏘이면 잃는 대신 **뱅크에서 8000점을 받고**, 화료해서 1000점을 벌면
 * 그 1000점을 뱅크에 빼앗긴다. 리치 공탁 1000점도, 유국 텐파이료도, 본장도 예외가 없다.
 *
 * **상대의 점수는 정상이다** — 내가 쏘인 8000점은 화료자에게 그대로 가고, 내가 받는
 * 8000점은 뱅크가 따로 발행한다. 그 국만 테이블 합계가 맞지 않는다(사용자 확정).
 *
 * 그래서 이 국의 최적 플레이는 리치마작의 상식을 정면으로 뒤집는다 — 위험패를 골라
 * 버리고, 상대의 큰 손에 일부러 쏘이고, 화료는 피한다. 전원 공개라 상대는 "저 사람에게는
 * 쏘지 않는다(=화료를 미룬다)"로 맞설 수 있다.
 *
 * 구현:
 * - `ROUND_SETTLED` 인터셉터(`SignFlip` 단계 — 돈이 움직이는 모든 단계 뒤, 방어 앞)에서
 *   보유자의 최종 delta에 -1을 곱한다. 차액은 뱅크가 발행하며 남의 delta는 손대지 않는다.
 * - 리치 공탁 1000점은 정산이 아니라 **버림 리듀서**에서 즉시 빠져나간다. 그래서
 *   보유자의 리치 선언 직후 `ScoreChanged(+2×공탁)`을 얹어 "낸 1000점 환원 + 1000점 획득"을
 *   만든다. 공탁 자체는 그대로 쌓이므로 리치봉의 흐름은 정상이다.
 * - 증강이 국 중에 직접 옮기는 점수(`ScoreChanged`)도 같은 국이면 부호를 뒤집는다.
 */

import {
  SCORE_CHANGED,
  SETTLE_STAGE,
  TILE_DISCARDED,
  augmentDataSet,
  defineAugment,
  scoreChanged,
} from "@majak/core";
import type {
  AugmentDef,
  RoundSettledPayload,
  ScoreChangedPayload,
  TileDiscardedPayload,
} from "@majak/core";
import {
  armOnNextRound,
  armedNow,
  roundViewKey,
  settleInterceptor,
  withAugPoint,
} from "../util.js";

const ID = "sign_flip";

export const signFlip: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "scoring",
  complexity: 1,
  name: "반전",
  description:
    "뽑는 순간 자동 발동. 이번 국 동안 내 점수의 부호가 뒤집힌다 — 8000점을 쏘이면 뱅크에서 8000점을 받고, 1000점을 벌면 1000점을 빼앗긴다.",
  detail:
    "획득한 직후의 국 하나 동안 보유자의 점수 증감에 부호가 반대로 적용된다. 방총, 쯔모 지불, 리치 공탁, 본장, 유국 텐파이료가 모두 포함된다.\n\n상대의 점수는 정상적으로 움직이며 차액은 뱅크가 발행한다. 발동은 전원에게 공개된다.",
  install(ctx) {
    const { holder } = ctx;

    // 획득 뒤 처음 시작되는 국 하나에만 켜진다.
    // 켜지는 순간 전원 공개 — 상대가 "저 사람에게는 쏘지 않는다"로 맞설 수 있어야 한다.
    armOnNextRound(ctx, ID, () => [
      augmentDataSet(roundViewKey("*", `${ID}:${holder}`), true),
    ]);

    // 리치 공탁 — 정산이 아니라 버림 리듀서가 즉시 깎는다.
    // 낸 만큼 되돌리고(+cost) 부호를 뒤집은 만큼 더 준다(+cost) = +2×cost.
    ctx.reaction(TILE_DISCARDED, (event, rc) => {
      const p = event.payload as TileDiscardedPayload;
      if (p.player !== holder || !p.riichi || p.riichiCost <= 0) return;
      if (!armedNow(rc.state, ID, holder)) return;
      rc.emit(scoreChanged(holder, p.riichiCost * 2, ID));
    });

    // 국 중에 증강이 직접 옮기는 점수도 같은 국이면 뒤집는다.
    // (내가 스스로 낸 보정은 제외 — 뒤집으면 위 공탁 보정이 도로 사라진다.)
    ctx.interceptor(SCORE_CHANGED, (event, ic) => {
      const p = event.payload as ScoreChangedPayload;
      if (p.player !== holder || p.reason === ID) return event;
      if (!armedNow(ic.state, ID, holder)) return event;
      return { type: event.type, payload: { ...p, delta: -p.delta } };
    });

    // 정산 단계: SignFlip — 돈이 움직이는 모든 단계 뒤, 방어 앞.
    settleInterceptor(ctx, SETTLE_STAGE.SignFlip, (event, ic) => {
      const p = event.payload as RoundSettledPayload;
      if (!armedNow(ic.state, ID, holder)) return event;
      const before = p.deltas[holder] ?? 0;
      if (before === 0) return event;
      const deltas = { ...p.deltas, [holder]: -before };
      return {
        type: event.type,
        payload: {
          ...p,
          deltas,
          // 결과 화면에 "부호 반전으로 이만큼 움직였다" 한 줄
          augPoints: withAugPoint(p, ctx, -before * 2),
        },
      };
    });
  },
  // 봇 정책 없음 — 자동 발동이라 선택 지점이 없다.
});
