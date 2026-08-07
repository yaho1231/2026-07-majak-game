/**
 * UI 자동 맞춤 — 진입하자마자 "의도한 크기"의 화면으로 시작하게 한다.
 *
 * 문제: 같은 사이트인데 사람마다 배치가 깨져 보인다. 원인은 대부분 **CSS 픽셀로 잰
 * 창이 작아서**다 — 윈도우 배율 125·150%, 브라우저 확대가 켜진 채인 탭, 반쪽짜리
 * 창. 화면 비례로 잡은 것(보드·손패)은 같이 줄지만 고정 px(이름표·액션바·여백)은
 * 안 줄어서, 좁아질수록 고정 px가 자리를 다 먹고 서로 올라탄다.
 * 사용자는 Ctrl +/− 로 맞춰 쓰고 있었다.
 *
 * 해법: 그 Ctrl +/− 를 자동으로 해 준다. body를 "기준 크기만큼 큰 창"(가상 뷰포트)으로
 * 잡고 통째로 축소한다. 브라우저 확대율은 스크립트로 못 건드리지만, 결과는 같다 —
 * 레이아웃은 넓은 창을 기준으로 풀리고 화면에는 줄여서 그린다.
 *
 * 이게 성립하려면 styles.css의 화면 비례 단위와 크기 미디어쿼리가 **실제 창이 아니라
 * 이 가상 뷰포트**를 봐야 한다. 그래서 거기서는 vw/vh/vmin 대신 cqw/cqh/cqmin을,
 * `@media (max-width: …)` 대신 `@container ui (max-width: …)`를 쓴다 (body가 `container: ui / size`).
 *
 * 좌표를 다루는 코드는 주의해야 한다. `getBoundingClientRect()`·`clientX`는 **화면 좌표**
 * (축소된 값)인데, 인라인 left/top·transform은 **레이아웃 좌표**(축소 전)로 해석된다.
 * 둘을 섞는 자리에서는 toLayoutPx()로 되돌려야 한다.
 */

/** 이 크기 이상이면 배율 1 — 배치가 여유 있게 풀리는 기준 창.
 *  흔한 노트북(1280×720)은 그대로 두고, 그보다 좁아질 때부터 줄인다. */
const BASE_W = 1100;
const BASE_H = 680;
/** 더 줄이면 글자가 안 읽힌다. 여기서 걸리면 대신 Ctrl +/− 안내를 띄운다. */
const MIN_SCALE = 0.6;
/** 이보다 좁은 가상 뷰포트는 데스크톱 배치가 어차피 깨진다 → 안내 대상. */
const CRAMPED_W = 900;
const CRAMPED_H = 620;

/** 사용자가 직접 고른 배율의 허용 범위 — 자동 하한(0.6)보다 넓게, 확대까지 연다. */
export const UI_SCALE_MIN = 0.6;
export const UI_SCALE_MAX = 1.4;
const OVERRIDE_KEY = "majak.uiScale";

let scale = 1;
const listeners = new Set<() => void>();

/**
 * 사용자가 직접 고른 배율 (null = 자동).
 *
 * 자동 배율만 있던 시절의 문제: **Ctrl + 가 먹히지 않았다**. 확대하면 CSS 픽셀로 잰
 * 창이 좁아지고 → 자동 배율이 그만큼 내려가 → 둘이 곱해져 원래 크기로 돌아온다.
 * 저시력 사용자가 쓰는 표준 수단(WCAG 1.4.4)을 UI가 되돌려 버린 셈이다.
 * 그래서 (1) 명시적·영속 배율 설정을 두고, (2) 아래 zoom 감지로 Ctrl + 를 비켜 준다.
 */
let override: number | null = readOverride();

function clampScale(v: number): number {
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, Math.round(v * 100) / 100));
}

function readOverride(): number | null {
  try {
    const raw = window.localStorage.getItem(OVERRIDE_KEY);
    if (raw === null || raw === "auto") return null;
    const v = Number(raw);
    return Number.isFinite(v) ? clampScale(v) : null;
  } catch {
    return null;
  }
}

/**
 * 브라우저 확대율 감지 기준선 — 첫 측정 때의 devicePixelRatio.
 * Ctrl +/− 는 dpr을 그 배율만큼 움직인다(창 크기 변경·모니터 이동으로는 안 움직인다).
 * 페이지를 열 때 이미 확대돼 있었다면 그 상태가 기준선이 된다 — 그건 그대로 두는 게 맞다.
 * 자동 축소는 "지금 창"에 맞추는 일이고, 확대는 이미 반영된 뒤이기 때문이다.
 */
let baseDpr = 0;

/** 사용자가 이 세션에서 Ctrl + 로 확대했는가 — 그렇다면 자동 축소를 접는다. */
function userZoomedIn(): boolean {
  if (baseDpr <= 0) return false;
  // 1.02 여유 — 모니터 전환·소수 오차로 dpr이 미세하게 흔들리는 것을 무시한다.
  return window.devicePixelRatio > baseDpr * 1.02;
}

/** 마우스 쓰는 기기인가 — 폰·태블릿은 좁은 화면 전용 배치가 따로 있어 손대지 않는다. */
function isPointerFine(): boolean {
  return window.matchMedia("(pointer: fine)").matches;
}

/** 창 크기를 잴 수 있나 — 숨은 탭·0×0 프레임에서는 0이 나온다(그땐 아무것도 하지 않는다). */
function hasSize(): boolean {
  return window.innerWidth > 0 && window.innerHeight > 0;
}

function computeScale(): number {
  // 사용자가 고른 배율이 항상 이긴다 — 폰·태블릿에서도(자동은 손대지 않는 기기다).
  if (override !== null) return override;
  if (!isPointerFine() || !hasSize()) return 1;
  // Ctrl + 로 키운 화면을 자동 축소가 도로 줄이지 않는다 (WCAG 1.4.4).
  if (userZoomedIn()) return 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const raw = Math.min(1, w / BASE_W, h / BASE_H);
  if (raw >= 1) return 1;
  // 소수 둘째 자리로 끊는다 — 창을 끌 때마다 1px 단위로 배율이 흔들리면 글자가 떨린다.
  const s = Math.max(MIN_SCALE, Math.floor(raw * 100) / 100);
  // 하한까지 줄여도 배치가 풀릴 창이 안 나오면 아예 줄이지 않는다.
  // 그런 창(아주 작은 창·세로로 긴 창)에는 좁은 화면 전용 배치가 따로 있고,
  // 거기서 더 줄이면 글자만 작아진다. 대신 Ctrl +/− 안내를 띄운다.
  if (w / s < CRAMPED_W || h / s < CRAMPED_H) return 1;
  return s;
}

function apply(): void {
  const next = computeScale();
  if (next !== scale) {
    scale = next;
  }
  // 값이 그대로여도 매번 쓴다 — 첫 적용(scale이 초기값 1과 같은 경우)에도 변수가 서야 한다.
  document.body.style.setProperty("--ui-scale", String(scale));
  // 배율이 그대로여도(하한에 걸린 채 창만 조금 바뀐 경우) 안내 조건은 달라질 수 있다.
  listeners.forEach((fn) => fn());
}

/** 현재 UI 배율 (1 = 축소 없음). */
export function getUiScale(): number {
  return scale;
}

/** 화면(visual) px → 레이아웃 px. 인라인 left/top·transform에 넣기 전에 거친다. */
export function toLayoutPx(v: number): number {
  return v / scale;
}

/** 레이아웃 좌표계에서 본 창 크기 = 가상 뷰포트. */
export function layoutViewport(): { w: number; h: number } {
  return { w: window.innerWidth / scale, h: window.innerHeight / scale };
}

/**
 * 축소를 끝까지 해도 배치가 풀릴 만한 창이 아닌가.
 * 여기 걸리면 화면 구석에 Ctrl +/− 안내를 띄운다 (자동으로는 더 못 해 준다).
 *
 * 가로·세로가 **둘 다** 모자랄 때만이다. 한쪽만 좁은 창(세로로 긴 창)은
 * 좁은 화면 전용 배치가 제대로 받아 주므로 안내할 게 없다 —
 * 배율을 정할 때의 조건(둘 중 하나라도 모자라면 줄이지 않는다)과 방향이 반대다.
 */
export function isLayoutCramped(): boolean {
  // 배율을 직접 고른 사람에게 "Ctrl +/− 를 쓰세요"는 할 말이 아니다 — 이미 손잡이를 쥐고 있다.
  if (override !== null) return false;
  if (!isPointerFine() || !hasSize()) return false;
  const v = layoutViewport();
  return v.w < CRAMPED_W && v.h < CRAMPED_H;
}

/** 배율이 바뀔 때 알림 (창 크기 변경). 해제 함수를 돌려준다. */
export function subscribeUiScale(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * 현재 배율 설정 — 숫자면 사용자가 고른 값, "auto"면 창 크기에 맞춰 자동.
 * 설정 화면이 라디오/슬라이더를 그릴 때 쓴다.
 */
export function getUiScaleSetting(): number | "auto" {
  return override ?? "auto";
}

/** 배율 설정을 바꾸고 즉시 반영한다 ("auto" = 자동). 값은 localStorage에 남는다. */
export function setUiScaleSetting(v: number | "auto"): void {
  override = v === "auto" ? null : clampScale(v);
  try {
    window.localStorage.setItem(OVERRIDE_KEY, override === null ? "auto" : String(override));
  } catch {
    /* 저장 실패는 무시 — 이번 세션 동안은 적용된다 */
  }
  apply();
}

/** 앱 부팅 시 1회. 첫 페인트 전에 배율을 걸고, 이후 창 크기를 따라간다. */
export function startUiScale(): void {
  baseDpr = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
  apply();
  window.addEventListener("resize", apply);
  window.addEventListener("orientationchange", apply);
  // resize 이벤트가 안 오는 변화(브라우저 확대율 변경 등)까지 잡는다 —
  // 사용자가 Ctrl +/− 를 직접 눌러 CSS 픽셀 창이 넓어지면 배율도 같이 풀려야 한다.
  new ResizeObserver(apply).observe(document.documentElement);
}
