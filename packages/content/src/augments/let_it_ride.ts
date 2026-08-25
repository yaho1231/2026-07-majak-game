/**
 * 판돈 굴리기 (let_it_ride, gold) — 연승 배수.
 *
 * 설계: docs/16_AUGMENT_REDESIGN.md §1b F (52차 전면 재설계)
 * 이전엔 예치 → 금고 → 다음 화료 때 2배 수령이라는 **지연 환급 + 금고 숫자** 구조였다
 * (유저 반려 취향 정면). 금고·예치·지연 수령을 전부 삭제하고 연승 배수로 바꿨다.
 *
 * - 연속 화료할 때마다 내 획득 배수가 오른다: 1번째 화료 **1배**, 2연속 **2배**,
 *   3연속 **3배**, 4연속 이상 **4배**(상한).
 * - 내가 방총하거나, 유국이거나, **상대가 론으로 화료하면** 연승이 초기화되어 다음
 *   화료는 다시 1배부터 시작한다. 상대의 **쯔모는 연승을 끊지 않는다**.
 *   (스택 소멸은 페널티가 아니라 자연 초기화다 — 잃는 점수는 하나도 없다.)
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
  withAugPoint,
} from "../util.js";

const ID = "let_it_ride";
/** 게임 단위 연승 수 (roundKey를 섞지 않는다 — 게임 내내 이어진다) */
const streakKey = (h: PlayerId): string => `${ID}:streak:${h}`;
/** 전원 공개: 현재 연승과 다음 화료 배수 */
const rideViewKey = (h: PlayerId): string => viewKey("*", `${ID}:${h}`);

/** 연승 n일 때 다음 화료에 적용될 배수 (1번째 1배 → 2연속 2배 → 3연속 3배 → 4연속 이상 4배) */
function multiplierFor(streak: number): number {
  return Math.min(1 + Math.max(0, streak), 4);
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
  complexity: 2,
  name: "판돈 굴리기",
  description:
    "(상시) 연속으로 화료할수록 **손의 점수**에 붙는 배수가 오른다 — 1배·2배·3배, 4연속 이상은 4배. 본장·공탁은 대상이 아니다.",
  detail:
    "(상시) 본장 보너스(1본당 300)와 회수하는 리치봉(공탁)은 배수 없이 원래 액수 그대로 들어온다. 내가 방총하거나, 유국이거나, **상대가 론으로 화료하면** 연승이 초기화되지만 잃는 점수는 없다. 상대의 **쯔모는 연승을 끊지 않는다**. 지금 몇 배인지는 전원에게 공개된다.",
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
      if (mult <= 1) return event;
      /*
       * 배수는 **순수 화료 점수에만** 건다.
       *
       * deltas에는 본장 보너스와 공탁(리치봉) 회수까지 섞여 있다. 예전에는 그 합계를
       * 통째로 곱해, 3본장·공탁 3000점이 쌓인 국에서 2900점 화료가 27,200점이 됐다
       * (정상 15,500점, 2026-07-29 감사). 화료분만 곱하고 본장·공탁은 원본 그대로 둔다.
       */
      const winPoints = (p.winInfos ?? [])
        .filter((w) => w.winner === holder)
        .reduce((sum, w) => sum + w.points, 0);
      if (winPoints <= 0) return event;
      const bonus = Math.min(winPoints, d) * (mult - 1);
      return {
        type: event.type,
        payload: {
          ...p,
          deltas: { ...p.deltas, [holder]: d + bonus },
          augPoints: withAugPoint(p, ctx, bonus),
        },
      };
    });

    // 연승 갱신 + 전원 공개
    ctx.reaction(ROUND_SETTLED, (event, rc) => {
      const p = event.payload as RoundSettledPayload;
      const streak = counterOf(rc.state, streakKey(holder));
      const won = (p.winInfos ?? []).some((w) => w.winner === holder);
      /*
       * **연승을 끊는 것** (2026-08-25 사용자 지시):
       *  - 내가 방총했다 (`from === holder`)
       *  - 유국·도중유국 — 화료로 끝나지 않은 국은 전부
       *  - **상대가 나보다 먼저 론으로 화료했다** — 내가 쏘지 않았어도 남의 론은 끊는다.
       *
       * 끊지 않는 것: **상대의 쯔모**. 아무도 손대지 않은 채 상대가 스스로 완성한 국은
       * 내 연승과 무관하다(사용자 확정).
       *
       * 예전에는 "내가 방총 || 화료 없음"만 봤다. 그래서 옆에서 남이 남을 쏴 국이
       * 끝나도 4배 스택이 그대로 살아남았고, 그 부분이 카드가 광고하는 「연속 화료」와
       * 어긋났다. 도중유국(abort)만 빠져나가던 더 이른 버그는 2026-07-29에 고쳤다.
       */
      const dealtIn = (p.winInfos ?? []).some((w) => w.from === holder);
      const opponentRon = (p.winInfos ?? []).some(
        (w) => w.winner !== holder && w.winType === "ron",
      );
      let next = streak;
      if (p.outcome === "win" && won) next = streak + 1;
      else if (p.outcome !== "win" || dealtIn || opponentRon) next = 0;
      if (next !== streak) rc.emit(augmentDataSet(streakKey(holder), next));
      if (!viewIsCurrent(rc.state, holder, next)) {
        rc.emit(augmentDataSet(rideViewKey(holder), viewValue(next)));
      }
    });

    // 국이 시작될 때 현재 배수를 전원에게 보여 둔다 (연승이 붙기 전에는 1배)
    ctx.reaction(ROUND_STARTED, (_event, rc) => {
      const streak = counterOf(rc.state, streakKey(holder));
      if (viewIsCurrent(rc.state, holder, streak)) return;
      rc.emit(augmentDataSet(rideViewKey(holder), viewValue(streak)));
    });
  },
});
