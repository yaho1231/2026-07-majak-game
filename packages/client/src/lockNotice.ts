/**
 * 잠금 통보 — 증강에 막혀 **고를 것이 아무것도 없는** 프롬프트를 어떻게 다룰 것인가.
 *
 * 격(格)에 지목당한 채 텐파이면, 상대가 그 패를 버릴 때마다 코어가 잠긴 론을 실은
 * 프롬프트를 보낸다(`DecisionPrompt.locked`). 예전처럼 조용히 건너뛰면 왜 화료가
 * 안 되는지 알 수 없고, 그렇다고 매번 패스를 누르게 하면 알림이 아니라 노동이 된다.
 * 그래서 **잠깐 보여 주고 스스로 넘어간다**(2026-08-17 사용자 요청).
 *
 * 가르는 기준은 하나다: **사람이 정할 몫이 남아 있는가.**
 *  - 패스밖에 없다 → 통보다. 띄웠다가 자동으로 넘긴다.
 *  - 퐁·치·깡이 함께 왔다 → 결정이다. 자동으로 넘기면 그 선택지를 뺏는다.
 *  - 내 턴(쯔모가 잠긴 경우) → 어차피 버릴 패를 골라야 한다. 자물쇠만 옆에 선다.
 */

import type { DecisionPrompt } from "@majak/core";

/**
 * 통보를 띄워 두는 시간(ms). 읽고("🔒 론 · 5판 이상") 무슨 일이 있었는지 알아챌
 * 만큼은 되고, 남의 순을 눈에 띄게 잡아먹지는 않는 길이다.
 *
 * ⚠ 버튼 아래 띠가 이 시간에 맞춰 빠진다 — 바꾸면 styles.css의
 * `lock-notice-drain` 애니메이션 길이도 함께 맞춘다 (winLockNotice.test.ts가 강제).
 */
export const LOCK_NOTICE_MS = 1800;

/** 잠금 통보만 있는 프롬프트인가 — 잠긴 선언이 있고, 고를 수 있는 것은 패스뿐이다. */
export function isLockNoticeOnly(prompt: DecisionPrompt): boolean {
  return (
    (prompt.locked ?? []).length > 0 &&
    prompt.options.length === 1 &&
    prompt.options[0]?.type === "pass"
  );
}
