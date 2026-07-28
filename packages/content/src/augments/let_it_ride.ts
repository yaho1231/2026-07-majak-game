/**
 * 판돈 굴리기 (let_it_ride, gold) — 연승 배수.
 *
 * 설계: docs/16_AUGMENT_REDESIGN.md §1b F (52차 전면 재설계)
 * 이전엔 예치 → 금고 → 다음 화료 때 2배 수령이라는 **지연 환급 + 금고 숫자** 구조였다
 * (유저 반려 취향 정면). 금고·예치·지연 수령을 전부 삭제하고 연승 배수로 바꿨다.
 *
 * - 연속 화료할 때마다 내 획득 배수가 오른다: 1번째 화료 **2배**, 2연속 **3배**,
 *   3연속 이상 **4배**(상한).
 * - 내가 방총하거나 유국이면 연승이 초기화되어 다음 화료는 다시 2배부터 시작한다
 *   (스택 소멸은 페널티가 아니라 자연 초기화다 — 잃는 점수는 하나도 없다).
 * - 현재 연승 단계와 **다음 화료의 배수**를 전원 공개 뷰 채널에 싣는다 —
 *   "쟤 지금 3배다"가 그대로 테이블의 긴장이 된다.
 *
 * 구현: ROUND_SETTLED 인터셉터(양수 delta만 곱한다 — 무페널티, 증가분은 뱅크 발행)
 * + ROUND_SETTLED 리액션(연승 갱신·공개 뷰) + ROUND_STARTED 리액션(뷰 초기 노출).
 * 발동 버튼은 없다 — 매 화료가 그 자체로 눈에 보이는 사건이다.
 */

import {
  augmentDataSet,
  defineAugment,
  ROUND_SETTLED,
  ROUND_STARTED,
  SETTLE_STAGE,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  PlayerId,
  RoundSettledPayload,
} from "@majak/core";
import {
  counterOf,
  settleInterceptor,
  viewKey,
} from "../util.js";

const ID = "let_it_ride";
/** 게임 단위 연승 수 (roundKey를 섞지 않는다 — 게임 내내 이어진다) */
const streakKey = (h: PlayerId): string => `${ID}:streak:${h}`;
/** 전원 공개: 현재 연승과 다음 화료 배수 */
const rideViewKey = (h: PlayerId): string => viewKey("*", `${ID}:${h}`);

/** 연승 n일 때 다음 화료에 적용될 배수 (1번째 2배 → 2연속 3배 → 3연속 이상 4배) */
function multiplierFor(streak: number): number {
  return Math.min(2 + Math.max(0, streak), 4);
}

/** 전원 공개 뷰에 실을 값 */
function viewValue(streak: number): { streak: number; multiplier: number } {
  return { streak, multiplier: multiplierFor(streak) };
}

/** 지금 뷰에 실린 값이 최신인가 (같으면 이벤트를 내지 않는다) */
function viewIsCurrent(state: GameState, h: PlayerId, streak: number): boolean {
  const v = state.augmentData[rideViewKey(h)] as
    | { streak?: unknown; multiplier?: unknown }
    | undefined;
  if (v === undefined || typeof v !== "object") return false;
  return v.streak === streak && v.multiplier === multiplierFor(streak);
}

export const letItRide: AugmentDef = defineAugment({
  id: ID,
  tier: "gold",
  category: "scoring",
  name: "판돈 굴리기",
  description:
    "(상시) 연속으로 화료할수록 내가 얻는 점수의 배수가 오른다 — 1번째 화료 2배, 2연속 3배, 3연속 이상 4배. 방총하거나 유국이면 다시 2배부터 시작한다.",
  detail:
    "(상시) 화료해서 점수를 얻을 때 그 획득분에 배수가 곱해진다. 첫 화료는 2배, 연속 두 번째 화료는 3배, 세 번째부터는 4배가 상한이다. 내가 방총하거나 유국으로 국이 끝나면 연승이 초기화되어 다음 화료는 다시 2배로 돌아가지만, 잃는 점수는 하나도 없다. 늘어난 몫은 뱅크가 지급하며 지금 몇 배인지는 전원에게 공개된다.",
  install(ctx) {
    const { holder } = ctx;

    // 획득분에 연승 배수를 곱한다 (양수 delta만 — 무페널티, 증가분은 뱅크 발행)
    // 정산 단계: Multiply — 연속 화료 배수. 같은 배수 단계.
    settleInterceptor(ctx, SETTLE_STAGE.Multiply, (event, ic) => {
      const p = event.payload as RoundSettledPayload;
      if (p.outcome !== "win") return event;
      if (!(p.winInfos ?? []).some((w) => w.winner === holder)) return event;
      const d = p.deltas[holder] ?? 0;
      if (d <= 0) return event;
      const mult = multiplierFor(counterOf(ic.state, streakKey(holder)));
      return {
        type: event.type,
        payload: { ...p, deltas: { ...p.deltas, [holder]: d * mult } },
      };
    });

    // 연승 갱신 + 전원 공개
    ctx.reaction(ROUND_SETTLED, (event, rc) => {
      const p = event.payload as RoundSettledPayload;
      const streak = counterOf(rc.state, streakKey(holder));
      const won = (p.winInfos ?? []).some((w) => w.winner === holder);
      const dealtIn = (p.winInfos ?? []).some((w) => w.from === holder);
      let next = streak;
      if (p.outcome === "win" && won) next = streak + 1;
      else if (p.outcome === "draw" || dealtIn) next = 0;
      if (next !== streak) rc.emit(augmentDataSet(streakKey(holder), next));
      if (!viewIsCurrent(rc.state, holder, next)) {
        rc.emit(augmentDataSet(rideViewKey(holder), viewValue(next)));
      }
    });

    // 국이 시작될 때 현재 배수를 전원에게 보여 둔다 (첫 국부터 "2배"가 보인다)
    ctx.reaction(ROUND_STARTED, (_event, rc) => {
      const streak = counterOf(rc.state, streakKey(holder));
      if (viewIsCurrent(rc.state, holder, streak)) return;
      rc.emit(augmentDataSet(rideViewKey(holder), viewValue(streak)));
    });
  },
});
