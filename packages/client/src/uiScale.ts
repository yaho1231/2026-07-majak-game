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
 *
 * ── 수동 손잡이 (2026-08-11 도입 → 2026-08-12 다시 만듦) ──
 * 자동 맞춤은 "창"만 본다. 사람 눈·모니터 거리·시력은 못 본다 — 같은 1440×900에서도
 * 누구는 크게, 누구는 작게 보고 싶어 한다. 그래서 −/+ 손잡이를 연다.
 *
 * ⚠ 처음엔 이 배수를 `scale`에 곱해 transform 에 얹었는데, **그건 두 가지로 틀렸다**:
 *
 *  ① 아무것도 안 커졌다. 판·손패는 전부 `k·cqw` 꼴인데 cqw 는 가상 뷰포트 기준
 *     (= 실제폭/scale)이라, 렌더에서 다시 ×scale 되면 실제 px = `k·실제폭` 이다 —
 *     scale 과 **무관**하다. + 를 눌러도 패는 1px도 안 커졌다.
 *  ② 커지는 건 고정 px(이름표·액션 바)뿐인데, 그건 컴포지터가 확대한 비트맵이라
 *     글자·테두리가 뭉개졌다. 사용자가 본 "엄청 흐려진다"가 정확히 이것이다.
 *
 * 그래서 지금은 **두 손잡이를 완전히 갈라 놓는다**:
 *
 *   --ui-scale (자동, ≤1) : body 를 통째로 축소하는 transform. 좁은 창에서 고정 px를
 *                           구제하는 장치다. 축소는 뭉개지지 않는다.
 *   --ui-mag   (수동)      : transform 이 아니라 **크기 토큰을 곱하는 수**.
 *                           styles.css 의 --board·--hand-pref·--mt-w·--back-cap 등이
 *                           이 값을 곱해 커진다 → 레이아웃이 실제로 다시 풀리고,
 *                           렌더는 1:1이라 글자·테두리가 네이티브 해상도로 선명하다.
 *
 * 즉 확대는 "화면을 늘리는" 것이 아니라 **"디자인 크기를 키우는"** 것이다. 커진 판이
 * 위·아래 띠에 닿으면 --board-fit-v 가 받아 내고 레이아웃이 알아서 양보한다.
 *
 * `scale` 은 이제 자동값 하나뿐이다 — toLayoutPx()·layoutViewport() 가 보는 것도 그것
 * 하나다. 수동 배수는 transform 에 없으므로 드래그 좌표에 끼어들지 않는다.
 */

/** 이 크기 이상이면 배율 1 — 배치가 여유 있게 풀리는 기준 창.
 *  흔한 노트북(1280×720)은 그대로 두고, 그보다 좁아질 때부터 줄인다. */
const BASE_W = 1100;
const BASE_H = 680;
/** 자동 축소의 바닥. 더 줄이면 글자가 안 읽힌다 —
 *  여기서 걸리면 대신 Ctrl +/− 안내를 띄운다. **자동 전용** 하한이다:
 *  수동 배수는 transform 에 없으므로 이 값과 곱해질 일이 없다. */
const MIN_SCALE = 0.6;
/** 이보다 좁은 "디자인 공간"은 데스크톱 배치가 어차피 깨진다 → 안내 대상.
 *  디자인 공간 = 가상 뷰포트 ÷ 수동 배수다 (isLayoutCramped 주석 참고). */
const CRAMPED_W = 900;
const CRAMPED_H = 620;

/**
 * 예전에 설정 패널에 있던 "화면 크기" 수동 배율이 남긴 localStorage 키.
 * 설정이 사라졌으므로(2026-08-07 사용자 지시) 부팅할 때 지워 준다 —
 * 안 지우면 예전에 배율을 못 박아 둔 사람이 그 값에 갇힌 채 손잡이가 없다.
 */
const LEGACY_OVERRIDE_KEY = "majak.uiScale";

/**
 * 지금 쓰는 수동 배수 키. **옛 키를 재활용하지 않는다** — 위 removeItem은 그대로 남아
 * 있어야 하고(옛 값에 갇힌 사람 구제), 같은 키를 다시 쓰면 부팅할 때마다 지워진다.
 * (2026-08-12에 의미가 transform 배율 → 크기 배수로 바뀌었지만 값의 범위가 겹치고
 *  뜻도 "크게/작게"로 같아 키는 그대로 쓴다. 사다리에 없는 옛 값은 스냅된다.)
 */
const ZOOM_KEY = "majak.uiZoom";

/**
 * 수동 배수 사다리. 10%p 등간격 — 한 번 눌러서 눈에 띄되 두 번 눌러도 안 망가지는 폭이다.
 *
 * 범위가 예전(0.7~1.5, transform 기준)과 달라진 이유:
 *  · 위끝 1.6 — 이제 배수는 **디자인 토큰**을 곱한다. 손패 상한 84px×1.6 = 134px 인데,
 *    2560폭 모니터에서 14장이 들어가는 물리적 한계(--hand-fit)가 약 153px 이라 아직
 *    한 줄에 들어간다. 그보다 키우면 --hand-fit 이 이겨서 눌러도 아무 일이 안 일어난다.
 *  · 아래끝 0.8 — 작은 화면·많은 것을 한눈에 보고 싶은 사람 몫. 20% 줄이면 손패 상한이
 *    67px, 판은 그만큼 여유가 생긴다. 더 내리면 고정 px(이름표·액션 바)는 그대로인데
 *    판만 작아져 화면이 텅 빈다 — 그쪽은 자동 축소(--ui-scale)가 할 일이다.
 */
const ZOOM_STEPS = [0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6] as const;
const DEFAULT_ZOOM = 1;

/** 자동 배율 (transform). 항상 ≤ 1. */
let scale = 1;
/** 수동 크기 배수 (--ui-mag). transform 이 아니다. */
let zoom: number = DEFAULT_ZOOM;
const listeners = new Set<() => void>();

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

/** 창만 보고 정하는 자동 배율. 수동 배수는 여기 끼어들지 않는다. */
function computeAutoScale(): number {
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
  scale = computeAutoScale();
  // 값이 그대로여도 매번 쓴다 — 첫 적용(scale이 초기값 1과 같은 경우)에도 변수가 서야 한다.
  document.body.style.setProperty("--ui-scale", String(scale));
  // 크기 토큰을 곱하는 수. transform 과 완전히 별개다 (파일 머리 주석 참고).
  document.body.style.setProperty("--ui-mag", String(zoom));
  // 배율이 그대로여도(하한에 걸린 채 창만 조금 바뀐 경우) 안내 조건은 달라질 수 있다.
  listeners.forEach((fn) => fn());
}

/**
 * 현재 **transform 배율** (1 = 축소 없음). 자동값 하나뿐이다 —
 * 수동 배수는 여기 곱해지지 않는다. 좌표 변환이 보는 값이 정확히 이것이다.
 */
export function getUiScale(): number {
  return scale;
}

// ── 수동 크기 배수 (화면의 −/+ 버튼) ──

/**
 * 지금 걸린 크기 배수 (= --ui-mag). 창과 무관하다 —
 * 크기 토큰을 곱할 뿐이라 어느 창에서든 모든 칸을 고를 수 있고, 넘치는 몫은
 * CSS 쪽 한계(--board-fit-v·--hand-fit)가 받아 낸다.
 */
export function getUiZoom(): number {
  return zoom;
}

/** 사다리에서 가장 가까운 칸으로 맞춘 값 (범위 밖은 잘라 낸다). */
function snapZoom(v: number): number {
  let best = ZOOM_STEPS[0] as number;
  for (const s of ZOOM_STEPS) if (Math.abs(s - v) < Math.abs(best - v)) best = s;
  return best;
}

function persistZoom(): void {
  try {
    if (zoom === DEFAULT_ZOOM) window.localStorage.removeItem(ZOOM_KEY);
    else window.localStorage.setItem(ZOOM_KEY, String(zoom));
  } catch {
    /* 저장을 못 해도 이번 세션에서는 동작한다 */
  }
}

/** 배수를 직접 지정 (사다리 칸으로 스냅). 값이 바뀌었으면 true. */
export function setUiZoom(v: number): boolean {
  const before = zoom;
  zoom = snapZoom(v);
  persistZoom();
  apply();
  return zoom !== before;
}

/** 배수를 사다리에서 dir칸(+1 확대 / −1 축소) 옮긴다. 바뀌었으면 true. */
export function stepUiZoom(dir: 1 | -1): boolean {
  const next = ZOOM_STEPS[ZOOM_STEPS.indexOf(zoom as (typeof ZOOM_STEPS)[number]) + dir];
  return next === undefined ? false : setUiZoom(next);
}

/** 기본값(자동에 맡기기)으로 되돌린다. */
export function resetUiZoom(): boolean {
  return setUiZoom(DEFAULT_ZOOM);
}

/**
 * 그 방향으로 아직 갈 데가 있는가 — 버튼을 끌 때 쓴다.
 * 사다리의 끝이면 false. 창 크기와 무관하다 — 예전에는 최종 배율이 [MIN,MAX]에
 * 잘려서 "눌러도 아무 일이 없는 칸"이 생겼고 그래서 창별로 칸을 걸러야 했지만,
 * 지금은 배수가 크기 토큰을 곱할 뿐이라 자를 이유가 없다.
 */
export function canStepUiZoom(dir: 1 | -1): boolean {
  return ZOOM_STEPS[ZOOM_STEPS.indexOf(zoom as (typeof ZOOM_STEPS)[number]) + dir] !== undefined;
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
 * 여기 걸리면 화면 구석에 안내를 띄운다 (자동으로는 더 못 해 준다).
 *
 * 재는 것은 가상 뷰포트가 아니라 **디자인 공간** = 가상 뷰포트 ÷ 수동 배수다.
 * 크기 토큰이 전부 배수만큼 커지므로, 배수 1.6에서 1440px 창은 디자인이 보기에
 * 900px 창과 같다. 예전 모델(배수가 transform)에서는 가상 뷰포트 자체가 줄어
 * 이 나눗셈이 필요 없었다 — 그 자리를 여기가 이어받는다.
 *
 * 가로·세로가 **둘 다** 모자랄 때만이다. 한쪽만 좁은 창(세로로 긴 창)은
 * 좁은 화면 전용 배치가 제대로 받아 주므로 안내할 게 없다 —
 * 배율을 정할 때의 조건(둘 중 하나라도 모자라면 줄이지 않는다)과 방향이 반대다.
 */
export function isLayoutCramped(): boolean {
  if (!isPointerFine() || !hasSize()) return false;
  const v = layoutViewport();
  return v.w / zoom < CRAMPED_W && v.h / zoom < CRAMPED_H;
}

/** 배율이 바뀔 때 알림 (창 크기 변경·수동 −/+). 해제 함수를 돌려준다. */
export function subscribeUiScale(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 입력 중인가 — 단축키가 글자를 먹으면 안 된다. */
function typingInField(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * 단축키는 **Alt(Option) + − / + / 0**.
 *
 * Ctrl/⌘ + − 를 쓰지 않는 이유: 그건 브라우저 확대다. 가로채면 사용자가 늘 쓰던
 * 손잡이를 뺏는 것이고(WCAG 1.4.4), 가로채지 않고 겹쳐 두면 한 번의 키로 두 배율이
 * 동시에 움직인다. 게다가 브라우저 확대는 devicePixelRatio를 흔들어 userZoomedIn()을
 * 켜고 **자동 축소를 접게** 되어 있으므로, 겹쳐 두면 "왜 두 배로 커지지"가 된다.
 * 그래서 완전히 다른 조합을 쓰고 브라우저 쪽은 그대로 둔다 — 둘은 곱해져 공존한다.
 */
function onKey(e: KeyboardEvent): void {
  if (!e.altKey || e.ctrlKey || e.metaKey) return;
  if (typingInField(e.target)) return;
  if (e.code === "Minus" || e.code === "NumpadSubtract") stepUiZoom(-1);
  else if (e.code === "Equal" || e.code === "NumpadAdd") stepUiZoom(1);
  else if (e.code === "Digit0" || e.code === "Numpad0") resetUiZoom();
  else return;
  e.preventDefault();
}

/** 앱 부팅 시 1회. 첫 페인트 전에 배율을 걸고, 이후 창 크기를 따라간다. */
export function startUiScale(): void {
  try {
    window.localStorage.removeItem(LEGACY_OVERRIDE_KEY);
  } catch {
    /* 저장소를 못 건드려도 배율은 어차피 자동이다 */
  }
  try {
    const raw = window.localStorage.getItem(ZOOM_KEY);
    const v = raw === null ? NaN : Number(raw);
    if (Number.isFinite(v) && v > 0) zoom = snapZoom(v);
  } catch {
    /* 못 읽으면 자동값 그대로 */
  }
  baseDpr = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
  apply();
  window.addEventListener("keydown", onKey);
  window.addEventListener("resize", apply);
  window.addEventListener("orientationchange", apply);
  // resize 이벤트가 안 오는 변화(브라우저 확대율 변경 등)까지 잡는다 —
  // 사용자가 Ctrl +/− 를 직접 눌러 CSS 픽셀 창이 넓어지면 배율도 같이 풀려야 한다.
  new ResizeObserver(apply).observe(document.documentElement);
}
