/**
 * 연출 재생 속도 — **CSS 애니메이션까지 실제로 빠르게 만든다.**
 *
 * ── 무엇이 문제였나 ──
 *
 * 설정의 "연출 속도"(1× / 0.6× / 0.35×)는 지금까지 **체류 시간(TTL)만** 줄였다
 * (`effectiveProdTtl`). 그런데 컷인의 실제 모션은 CSS 에 고정 길이로 박혀 있다 —
 * `.cutin-band` 0.34s, `.cutin-slam` 0.42s. 그래서 "최소(0.35×)"를 고르면 연출이
 * 빨라지는 게 아니라 **밴드가 다 들어오기도 전에 통째로 사라졌다.** 빠르게 보고
 * 싶었던 사람이 얻은 것은 "잘린 연출"이었다(38_ANIMATION_LIBS §1-1).
 *
 * ── 왜 이렇게 고치나 ──
 *
 * CSS `animation-duration` 은 나중에 배수로 곱할 방법이 없다. 컷인 규칙 수십 개의
 * 길이를 전부 CSS 변수로 바꾸는 방법도 있지만, 규칙이 늘 때마다 빠뜨리기 쉽다.
 *
 * 대신 **Web Animations API 로 이미 돌고 있는 애니메이션의 재생 속도를 바꾼다.**
 * 브라우저는 CSS 애니메이션도 `Animation` 객체로 노출하므로(`getAnimations`),
 * `playbackRate` 한 줄이 그 요소 아래 **모든** CSS 애니메이션에 한꺼번에 걸린다.
 * 새 컷인 규칙을 추가해도 자동으로 따라온다 — 빠뜨릴 자리가 없다.
 *
 * (`fx-lab` 의 `setSpeed()` 가 쓰던 것과 같은 원리다. 거기서 이미 검증됐다.)
 */

/**
 * 이 요소와 그 아래 모든 애니메이션의 재생 속도를 맞춘다.
 *
 * @param speed 설정값(1 = 그대로 · 0.6 = 빠르게 · 0.35 = 최소). 작을수록 빨리 지나간다.
 * @returns 실제로 속도를 바꾼 애니메이션 수 (검증·점검용)
 */
export function applyProdSpeed(el: Element | null, speed: number): number {
  if (el === null || speed <= 0 || speed === 1) return 0;
  // 브라우저가 `getAnimations` 를 모르면 조용히 넘어간다 — 연출이 조금 느린 것뿐이다.
  if (typeof (el as HTMLElement).getAnimations !== "function") return 0;
  const rate = 1 / speed;
  let n = 0;
  for (const anim of (el as HTMLElement).getAnimations({ subtree: true })) {
    try {
      anim.playbackRate = rate;
      n++;
    } catch {
      // 이미 끝났거나 취소된 애니메이션 — 건드릴 것이 없다
    }
  }
  return n;
}
