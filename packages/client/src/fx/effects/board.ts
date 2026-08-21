/**
 * 판 전체에 걸리는 연출 — 흔들림·섬광·파문.
 *
 * 전부 **장식**이다(정보를 나르지 않는다). 설정을 끄면 그리지 않는다.
 * 대신 강도를 세밀하게 나눠 둔다 — 같은 흔들림이라도 폰 한 번과 역만은 다른 사건이고,
 * 그 차이가 안 나면 모든 사건이 똑같이 시끄러워진다.
 */
import { gsap } from "../setup";
import { SHAKE, type ShakeLevel } from "../motion";
import { canDecorate, alive, spawnFx } from "../core";

/**
 * 화면 흔들림.
 *
 * 예전에는 `data-shake` 속성을 켜고 CSS 키프레임 4벌이 `.table` 을 흔들었다. 옮긴 이유는
 * 두 가지다 — ① 세기를 표 한 줄로 다루게 되고 ② **다른 transform 과 겹칠 수 있다.**
 * CSS 방식은 `.table` 의 `transform` 을 통째로 잡아서, 흔드는 동안 줌·틸트를 못 얹었다.
 *
 * @param anticipate 한 번 뒤로 당겼다가 터진다. 론·역만처럼 "맞았다"인 사건에만.
 */
export function shakeBoard(
  el: Element | null,
  level: ShakeLevel,
  opts: { anticipate?: boolean } = {},
): void {
  if (!canDecorate() || !alive(el)) return;
  const cfg = SHAKE[level];
  const ease = opts.anticipate === true ? "mjShakeAntic" : `mjShake${level}`;
  // x 만 흔든다. 예전 키프레임은 x·y 를 같이 움직였는데, 세로로 흔들면 판 위의 글자가
  // 읽기 어려워진다(가로 진동은 눈이 따라가지만 세로는 못 따라간다).
  gsap.fromTo(
    el,
    { x: -cfg.amp },
    { x: 0, duration: cfg.dur, ease, clearProps: "x", overwrite: "auto" },
  );
}

/**
 * 섬광 불투명도 **상한**. 호출부가 더 큰 값을 줘도 여기서 잘린다.
 *
 * 흰 화면을 덮는 것은 광과민 위험이 있다. 24_FX_LAB 의 `flash()` 는 0.9까지 갔는데
 * 그건 실험실이라 가능했던 값이다.
 *
 * ⚠ 예전에는 기본값 0.24 · 상한 0.35 였는데 주석은 "상한 0.24"라고 적고 있었다.
 *   광과민 안전을 말하는 문장의 숫자가 틀리면, 다음 사람이 0.35 를 넣고도 "상한
 *   안"이라고 믿는다. 기본과 상한을 **같은 값 하나**로 합쳐 어긋날 자리를 없앤다.
 */
const FLASH_PEAK = 0.24;

/** 화면 섬광 — 아주 짧게 밝아진다. 불투명도는 `FLASH_PEAK` 로 잘린다. */
export function flashBoard(
  host: Element | null,
  opts: { color?: string; peak?: number; duration?: number } = {},
): void {
  if (!canDecorate() || !alive(host)) return;
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = `position:absolute; inset:0; pointer-events:none; z-index:60;
    background:${opts.color ?? "#fff"}; opacity:0; border-radius:inherit;`;
  const kill = spawnFx(host, el, 2000);
  gsap
    .timeline({ onComplete: kill })
    .to(el, { opacity: Math.min(opts.peak ?? FLASH_PEAK, FLASH_PEAK), duration: 0.06, ease: "power2.out" })
    .to(el, { opacity: 0, duration: (opts.duration ?? 0.34) - 0.06, ease: "power2.in" });
}

/**
 * 파문 — 한 점에서 원이 퍼진다. "여기서 일어났다"를 가리킨다.
 *
 * 컷인처럼 판을 덮지 않고 **자리를 지목**하므로, 판을 계속 보면서도 읽힌다.
 * 증강 발동·후로 대상 표시처럼 위치가 뜻을 갖는 사건에 쓴다.
 */
export function ringAt(
  host: Element | null,
  x: number,
  y: number,
  opts: { color?: string; size?: number; duration?: number } = {},
): void {
  if (!canDecorate() || !alive(host)) return;
  const size = opts.size ?? 120;
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = `position:absolute; left:${x}px; top:${y}px; width:${size}px; height:${size}px;
    margin:${-size / 2}px 0 0 ${-size / 2}px; border-radius:50%; pointer-events:none; z-index:55;
    border:2px solid ${opts.color ?? "rgba(200,162,74,.9)"};`;
  const dur = opts.duration ?? 0.62;
  // 제거 보험은 애니메이션 길이에서 유도한다 — 고정값(3초)이면 긴 파문이 도중에 지워진다
  const kill = spawnFx(host, el, dur * 1000 + 500);
  gsap.fromTo(
    el,
    { scale: 0.25, opacity: 0.9 },
    { scale: 1, opacity: 0, duration: dur, ease: "power2.out", onComplete: kill },
  );
}

/**
 * 주목 — 요소 하나가 한 번 크게 숨 쉰다.
 *
 * 맥동을 **반복하지 않는** 것이 요점이다. 상시 반복하는 강조는 몇 순만 지나면 배경이
 * 되어 아무도 안 보고, 그때부터는 그냥 시끄러운 것이다. 한 번만 하고 조용해진다.
 */
export function attention(el: Element | null, opts: { scale?: number } = {}): void {
  if (!canDecorate() || !alive(el)) return;
  gsap.fromTo(
    el,
    { scale: 1 },
    {
      scale: opts.scale ?? 1.06,
      duration: 0.14,
      ease: "power2.out",
      yoyo: true,
      repeat: 1,
      clearProps: "scale",
      overwrite: "auto",
    },
  );
}
