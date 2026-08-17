/**
 * 진동 — 폰에서 "지금 그게 먹혔다"를 손끝으로 알린다.
 *
 * **왜** (감사 2026-08-17 §5-3): 저장소 전체에 `navigator.vibrate` 가 **0건**이었다.
 * WebAudio로 타악 음색까지 손수 합성한 프로젝트에서 눈에 띄는 공백이고, 무엇보다
 * 폰에서는 소리를 끄고 하는 사람이 많다 — 그 사람에게는 타패가 나갔는지 알려 주는
 * 신호가 화면 말고는 하나도 없었다.
 *
 * ── 지키는 선 ──
 *
 * 1. **짧게, 드물게.** 긴 진동은 알림이 아니라 방해다. 여기 있는 것 중 가장 긴 것이
 *    화료의 24ms 두 번이다. 매 순 일어나는 일(타패)은 8ms 한 번.
 * 2. **소리와 짝이 아니라 별개다.** 소리를 끈 사람에게 진동까지 사라지면 그건
 *    "조용히 하고 싶다"를 "아무 신호도 필요 없다"로 잘못 읽는 것이다.
 * 3. **터치 기기에서만 기본으로 켠다.** 노트북에는 진동 장치가 없고, 있어도
 *    `vibrate` 가 조용히 무시된다 — 설정에 죽은 스위치를 보여 주지 않는다.
 * 4. **`prefers-reduced-motion` 을 존중한다.** 전정기관 문제로 움직임을 줄여 둔
 *    사람에게 기기를 흔드는 것은 정확히 그 사람이 피하려는 자극이다.
 */

/** 이 기기가 진동을 실제로 지원하는가 (데스크톱은 대개 false). */
export function hapticsSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.vibrate === "function" &&
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

let enabled = false;

/** 설정에서 켜고 끈다. 지원하지 않는 기기에서는 켜도 아무 일이 없다. */
export function setHapticsEnabled(v: boolean): void {
  enabled = v;
}

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function buzz(pattern: number | number[]): void {
  if (!enabled || reducedMotion()) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // 일부 브라우저는 사용자 제스처 밖에서 부르면 던진다 — 신호 하나 못 준다고
    // 게임을 멈출 이유는 없다.
  }
}

export const haptics = {
  /** 패를 버렸다 — 매 순 일어나므로 가장 짧다. */
  discard: (): void => buzz(8),
  /** 후로·리치처럼 판을 바꾸는 선언. */
  declare: (): void => buzz(18),
  /** 화료 — 한 판에 한 번이라 유일하게 두 번 울린다. */
  win: (): void => buzz([24, 40, 24]),
  /** 내 차례가 왔다 (초읽기 국에서 특히 — 화면을 안 보고 있을 수 있다). */
  turn: (): void => buzz(12),
  /** 하면 안 되는 것을 눌렀다. */
  reject: (): void => buzz([10, 30, 10]),
};
