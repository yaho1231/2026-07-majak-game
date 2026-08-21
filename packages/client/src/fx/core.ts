/**
 * 연출을 만드는 공통 입구 — 여기를 지나면 설정·되돌림·속도가 저절로 걸린다.
 *
 * 개별 연출이 `screenFx` 나 `prefers-reduced-motion` 을 직접 볼 일이 없게 하는 것이 목적이다.
 * 서른 개짜리 연출 모음에서 그 검사를 각자 하게 두면 반드시 하나는 빠진다.
 *
 * ── 연출을 두 종류로 나눈다 ──
 *
 * **장식(decorative)** — 흔들림·번쩍임·파티클·잔상. 없어도 무슨 일이 일어났는지는 안다.
 *   → 설정을 끄면 **아예 안 그린다.**
 *
 * **전달(essential)** — 패가 손에서 바닥으로 간다, 점수가 이 사람에게서 저 사람에게 간다.
 *   → 설정을 꺼도 **끝 상태는 반드시 만든다.** 다만 즉시 끝낸다.
 *   움직임을 뺀다는 것이 "무슨 일이 있었는지 모르게 한다"는 뜻은 아니다.
 */
import { gsap } from "./setup";
import { fxEnabled, prodTimeScale } from "./settings";

export interface FxTimelineOpts {
  /**
   * 연출 큐에 서는 것인가(컷인·배너). true 면 `prodSpeed` 재생 배수가 걸린다.
   * 판 위의 일상 동작(타패·정렬)에는 걸지 않는다 — 게임 전체가 조급해진다.
   */
  prod?: boolean;
  /**
   * 정보를 나르는 연출인가. true 면 설정을 꺼도 **끝 상태까지 간다**(즉시).
   * false(기본)면 설정을 껐을 때 아무것도 안 만든다.
   */
  essential?: boolean;
  onComplete?: () => void;
}

/**
 * 연출용 타임라인.
 *
 * 반환값은 항상 타임라인이다 — 설정이 꺼져 있어도 `null` 을 돌려주지 않는다.
 * 호출부가 `?.` 로 도배되는 것을 막으려는 것이고, 더 중요하게는 **`onComplete` 에 걸어 둔
 * 상태 변경이 설정과 무관하게 반드시 실행되게** 하려는 것이다.
 */
export function fxTimeline(opts: FxTimelineOpts = {}): gsap.core.Timeline {
  const tl = gsap.timeline({
    ...(opts.onComplete !== undefined ? { onComplete: opts.onComplete } : {}),
  });
  if (opts.prod === true) tl.timeScale(prodTimeScale());
  if (!fxEnabled()) {
    // 정보를 나르는 것은 끝까지 간다. 장식은 여기서 사실상 없던 일이 된다.
    // (둘 다 타임라인은 살아 있으므로 onComplete 는 정상적으로 불린다.)
    tl.timeScale(opts.essential === true ? 1000 : 100000);
  }
  return tl;
}

/**
 * 장식 연출을 그릴 수 있는가 — 그릴 수 없으면 호출부가 **일찍 반환**한다.
 *
 * `fxTimeline` 으로도 되지만, 파티클 수십 개를 DOM 에 만드는 것 같은 **준비 비용이 큰**
 * 연출은 만들기 전에 멈추는 편이 낫다.
 */
export function canDecorate(): boolean {
  return fxEnabled();
}

/**
 * 요소가 아직 화면에 있는가 — 연출 도중 국이 바뀌어 사라질 수 있다.
 *
 * GSAP 은 사라진 요소를 애니메이션해도 조용하지만, 우리 연출은 좌표를 실측하므로
 * 떨어져 나간 요소를 재면 0 이 나와 엉뚱한 곳으로 날아간다.
 */
export function alive(el: Element | null | undefined): el is Element {
  return el != null && el.isConnected;
}

/** 요소의 화면 중심 */
export function centerOf(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/**
 * 연출용 임시 요소를 붙이고 **반드시 지운다.**
 *
 * ── 왜 보험이 필요한가 ──
 *
 * 파티클·고스트·파문은 애니메이션이 끝날 때 `onComplete` 에서 지우게 만든다. 그런데
 * 탭이 숨겨지면 rAF 가 조여져 애니메이션이 **멈춘 채로 남는다** — 실제로 점검 페이지에서
 * 탭을 숨긴 채 연출을 돌렸더니 `position: fixed` 고스트 하나와 파문 둘이 화면에 남아
 * 있었다. 돌아오면 이어서 끝나긴 하지만, 그동안 떠 있는 것도 문제고 국이 바뀌어
 * 부모가 사라지면 영영 안 지워질 수도 있다.
 *
 * 그래서 시간 기반 backstop 을 함께 건다. `onComplete` 가 먼저 오면 타이머는 무의미해지고,
 * 안 오면 타이머가 치운다. **둘 중 하나는 반드시 온다.**
 *
 * @param ttl 이 시간이 지나면 애니메이션과 무관하게 지운다 (기본 6초)
 */
export function spawnFx(host: Element, el: HTMLElement, ttl = 6000): () => void {
  host.appendChild(el);
  let done = false;
  const kill = (): void => {
    if (done) return;
    done = true;
    window.clearTimeout(timer);
    el.remove();
  };
  const timer = window.setTimeout(kill, ttl);
  return kill;
}
