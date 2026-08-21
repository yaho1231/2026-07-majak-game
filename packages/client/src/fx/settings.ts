/**
 * 연출 설정 배선 — `screenFx` · `prodSpeed` · `prefers-reduced-motion` 을 **한 곳에서** 받는다.
 *
 * ── 왜 한 곳인가 ──
 *
 * 지금 이 세 가지는 CSS 미디어쿼리 11곳과 JSX 조건부 렌더 20여 곳에 흩어져 있다.
 * 새 연출을 만들 때마다 두 군데를 같이 고쳐야 하고, 빠뜨리면 조용히 새어 나간다 —
 * "화면 효과 끄기"를 켠 사람에게 새로 만든 연출만 계속 보이는 식이다.
 *
 * 여기를 지나가면 그런 일이 구조적으로 안 생긴다. **새 연출은 이 파일을 몰라도 된다** —
 * `fxEnabled()` 를 보거나, 아예 `timeline()` 헬퍼를 쓰면 알아서 걸린다.
 *
 * ── 무엇을 끄고 무엇을 남기는가 ──
 *
 * `haptics.ts` 가 세워 둔 원칙을 그대로 잇는다: **"조용히 하고 싶다"를 "아무 신호도
 * 필요 없다"로 잘못 읽지 않는다.** 그래서 여기서 끄는 것은 **움직임뿐**이다.
 * 소리·진동·상태 표시·글자는 그대로 나간다. 연출이 꺼져도 무슨 일이 일어났는지는
 * 여전히 알 수 있어야 한다.
 */
import { gsap } from "./setup";

export interface FxSettings {
  /** 화면 효과 — 흔들림·번쩍임·파티클 */
  screenFx: boolean;
  /** 연출 속도 배수 (1 = 그대로 · 0.6 = 빠르게 · 0.35 = 최소) */
  prodSpeed: number;
}

let current: FxSettings = { screenFx: true, prodSpeed: 1 };
let reduced = false;

function readReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * 지금 연출을 그려도 되는가.
 *
 * 두 가지를 곱한다 — 설정에서 끈 것과 OS 수준에서 줄여 둔 것. 후자는 전정기관 문제로
 * 움직임 자체가 증상이 되는 사람이라, **설정을 켜 두었어도 이쪽이 이긴다.**
 */
export function fxEnabled(): boolean {
  return current.screenFx && !reduced;
}

/** 지금 연출 속도 배수 (재생 속도로 쓴다 — 길이를 자르는 게 아니다) */
export function fxSpeed(): number {
  return current.prodSpeed > 0 ? current.prodSpeed : 1;
}

/**
 * 설정을 반영한다. App 의 설정 변경에서 부른다.
 *
 * ⚠ **`prodSpeed` 로 전역 타임라인을 건드리지 않는다.** 그러면 손패가 움직이는 속도까지
 * 같이 빨라져서, "컷인을 빨리 넘기고 싶다"는 요구가 "게임 전체가 조급해진다"로 번진다.
 * 배수는 **연출 큐에 서는 타임라인에만** 건다(`prodTimeScale()` 을 쓰는 쪽).
 */
export function applyFxSettings(next: FxSettings): void {
  current = next;
  reduced = readReducedMotion();
}

/**
 * 연출(컷인·배너)에 걸 재생 배수.
 *
 * `prodSpeed` 0.35 = "최소" 이므로 **더 빨리** 지나가야 한다 → timeScale 은 그 역수다.
 * 길이를 자르는 게 아니라 재생을 빠르게 하는 것이라, 처음부터 끝까지 다 보이되 짧게 끝난다 —
 * 예전에는 체류 시간만 줄여서 `.cutin-band`(0.34s 고정)가 **중간에 잘렸다**
 * (38_ANIMATION_LIBS §1-1).
 */
export function prodTimeScale(): number {
  return 1 / fxSpeed();
}

/**
 * OS 설정 변화를 따라간다 (사용자가 게임 도중 "동작 줄이기"를 켤 수 있다).
 * 반환값은 정리 함수 — App 의 `useEffect` 에서 그대로 돌려준다.
 */
export function watchReducedMotion(onChange?: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  const handler = (): void => {
    reduced = mq.matches;
    onChange?.();
  };
  handler();
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}
