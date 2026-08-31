/**
 * **증강 정책은 표준 마작 액션을 돌려줄 수 없다.**
 *
 * `BotDecisionContext.options`에는 이번 순의 **전체 후보**가 실린다(버림·치·펑·리치…).
 * 정책이 자기 액션 타입으로 거르는 것을 잊으면 `options[0]`(대개 `discard`)이 그대로
 * 반환되는데, BotAgent 입장에서는 «제시된 옵션»이라 정상 입찰로 받는다. 그 입찰이
 * 1층(턴을 소비하지 않는 추가 행동)에서 이기면 **2층 전체 — 버림·리치·후로 평가가
 * 통째로 건너뛰어진다.** 봇은 그 순에 아무 판단 없이 첫 후보를 낸다.
 *
 * 같은 실수가 세 번 났다:
 *  - 2026-08-28 `hand_swap3` 지정 단계 (실전 검증에서 발견)
 *  - 2026-08-31 `frame_up` (QA synergy4 A-0 — 들고만 있어도 반장 −17,483점, t=−10.6)
 *
 * 그래서 개별 카드가 아니라 **여기**서 막는다. 정책이 표준 액션을 돌려주면 그 입찰만
 * 버린다(판단은 2층으로 정상 진행). 새로 추가되는 증강도 자동으로 보호된다.
 */

/**
 * 표준 마작 액션 — 이 밖의 타입은 전부 액티브 증강이 등록한 자기 액션이다.
 * (`BotAgent`의 증강 금지 제약이 쓰는 목록과 같은 규칙 — 여기 한 벌만 두고 공유한다.)
 */
export const STANDARD_ACTION_TYPES: ReadonlySet<string> = new Set([
  "discard",
  "riichi",
  "win",
  "pon",
  "chi",
  "ankan",
  "minkan",
  "shouminkan",
  "kyushuKyuhai",
  "pass",
]);

/** 이 액션 타입이 증강 자신의 것인가 (표준 마작 액션이 아닌가) */
export function isAugmentActionType(type: string): boolean {
  return !STANDARD_ACTION_TYPES.has(type);
}
