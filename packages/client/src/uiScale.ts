/**
 * UI 자동 맞춤 — 진입하자마자 "의도한 크기"의 화면으로 시작하게 한다.
 *
 * 문제: 같은 사이트인데 사람마다 배치가 깨져 보인다. 원인은 대부분 **CSS 픽셀로 잰
 * 창이 작아서**다 — 윈도우 배율 125·150%, 브라우저 확대가 켜진 채인 탭, 반쪽짜리
 * 창. 화면 비례로 잡은 것(보드·손패)은 같이 줄지만 고정 px(이름표·액션바·여백)은
 * 안 줄어서, 좁아질수록 고정 px가 자리를 다 먹고 서로 올라탄다.
 * 사용자는 Ctrl +/− 로 맞춰 쓰고 있었다.
 *
 * 해법: 그 Ctrl +/− 를 자동으로 해 준다. body에 CSS `zoom`을 걸어 "기준 크기만큼 큰
 * 창"(가상 뷰포트 = 캔버스)으로 잡는다. 브라우저 확대율은 스크립트로 못 건드리지만,
 * `zoom`은 진짜 브라우저 확대와 같은 물건이다 — 레이아웃을 다시 풀고 글자를 최종
 * 크기로 다시 래스터화하므로 키워도 뭉개지지 않는다(transform: scale 과 다른 점).
 *
 * ── 하나의 배율이 화면 전체에 걸린다 ──
 *
 * 자동 × 수동을 곱한 **최종값 하나**가 `--ui-scale` → body의 `zoom` 이다. 크기 토큰을
 * 골라 곱하는 짓은 하지 않는다 (PR #239가 그랬고 2026-08-12에 되돌렸다: 손패·보드를
 * 키우려고 상대 뒷패를 44→29px로 줄였다 → "상대 패들은 왜 이렇게 작아진거야").
 *
 * ⚠ 다만 **`zoom`은 브라우저 Ctrl +/− 와 똑같아서, 화면이 꽉 찬 상태에서는 "전부 같이
 * 커지기"가 물리적으로 불가능하다.** 창 넓이는 고정인데 무엇이든 커지면 그만큼 다른
 * 것이 자리를 잃는다. 실측(2026-08-12, 화면 px):
 *
 *   1920×1080  60% → 100%   손패 50→84 · 바닥패 29.6→43 · 뒷패 30→50 · 글자 10.2→17
 *                           · 보드 510→742     ← **다섯이 전부 같은 비율로 커진다**
 *   1920×1080 100% → 150%   손패 84→98 · 뒷패 50→57 · 글자 17→25.5 (커짐)
 *                           바닥패 43→29.8 · 보드 742→513 (**작아짐**)
 *
 * 갈림길은 "가상 뷰포트가 px 상한보다 넓은가"다. 넓으면(축소 쪽) 보드는 `850px`,
 * 손패는 `--hand-pref` 같은 **고정 px 상한**에 걸려 있어 배율이 그대로 곱해진다.
 * 좁아지면(확대 쪽) 보드가 `--board-fit-v`(= 남는 세로 ÷ 0.9)에 걸리는데, 그 "남는
 * 세로"에서 빠지는 위·아래 띠(--top-band 76px, --own-band 안의 고정분 157px)는
 * 고정 px라 화면에서 배율만큼 두꺼워진다 → 보드와 바닥패가 밀린다.
 *
 * 이걸 없애려면 띠도 화면 비례로 바꿔야 하는데, 그러면 이번엔 이름표·글자가 확대에
 * 반응하지 않는다. 꽉 찬 화면에서는 어느 쪽이든 제로섬이다 — 지금은 브라우저 확대와
 * 같은 쪽(고정 px 것들이 커지고 보드가 양보)을 고른다. 사용자가 원래 쓰던 손잡이가
 * 그것이다("완전 예전처럼 컨트롤 +- 로").
 *
 * 이게 성립하려면 styles.css의 화면 비례 단위와 크기 미디어쿼리가 **실제 창이 아니라
 * 이 가상 뷰포트**를 봐야 한다. 그래서 거기서는 vw/vh/vmin 대신 cqw/cqh/cqmin을,
 * `@media (max-width: …)` 대신 `@container ui (max-width: …)`를 쓴다 (body가 `container: ui / size`).
 *
 * 좌표를 다루는 코드는 주의해야 한다. `getBoundingClientRect()`·`clientX`는 **화면 좌표**
 * (배율이 곱해진 값)인데, 인라인 left/top·transform은 **레이아웃 좌표**(곱하기 전)로
 * 해석된다. 둘을 섞는 자리에서는 toLayoutPx()로 되돌려야 한다.
 *
 * `zoom`으로 바꾼 뒤에도 이 관계는 그대로다 — 2026-08-12에 크롬에서 실측했다:
 * body zoom 2, left:100px 인 상자의 `getBoundingClientRect().left` = 200,
 * `offsetLeft` = 100, 그 상자를 화면 (250,220)에서 클릭하면 `clientX` = 250.
 * 즉 rect·clientX 는 화면 px, offset·인라인 스타일은 레이아웃 px다.
 *
 * ── 수동 손잡이 (2026-08-11) ──
 * 자동 맞춤은 "창"만 본다. 사람 눈·모니터 거리·시력은 못 본다 — 같은 1440×900에서도
 * 누구는 크게, 누구는 작게 보고 싶어 한다. 그래서 자동값 **위에 곱하는** 배수를
 * 화면의 −/+ 버튼으로 열어 둔다. 자동 로직(computeAutoScale)은 손대지 않는다:
 *
 *     effective = clamp(auto × zoom, MIN_SCALE, MAX_SCALE)
 *
 * 그리고 이 effective 하나만 `scale`·`--ui-scale`이 된다. toLayoutPx()·layoutViewport()
 * 가 전부 `scale`을 보므로 드래그 좌표도 자동으로 따라온다 — 여기 갈래를 늘리면 안 된다.
 */

import { safeStorage } from "./storage.js";

/** 이 크기 이상이면 배율 1 — 배치가 여유 있게 풀리는 기준 창.
 *  흔한 노트북(1280×720)은 그대로 두고, 그보다 좁아질 때부터 줄인다. */
const BASE_W = 1100;
const BASE_H = 680;
/** 더 줄이면 글자가 안 읽힌다. 여기서 걸리면 대신 Ctrl +/− 안내를 띄운다.
 *  수동 배수(−)도 이 아래로는 못 내려간다 — 자동 0.6 × 수동 0.6 = 0.36으로
 *  글자가 사라지는 조합은 애초에 사다리에서 빠진다(allowedSteps 참고). */
const MIN_SCALE = 0.6;
/** 최종 배율 상한. 자동은 1을 넘지 않으므로 이건 수동 확대 전용 뚜껑이다.
 *
 *  2.0으로 잡은 근거(2026-08-12 실측): 확대는 가상 뷰포트를 그만큼 좁히는 일이라
 *  (= 브라우저 Ctrl+) 잘리는 것은 없지만 배치가 좁은 화면 쪽으로 넘어간다.
 *  1920×1080에서 2.0은 가상 960×540 — 데스크톱 배치의 마지막 칸이고, 손패 14장은
 *  여전히 한 줄에 들어온다(실측: 손패 타일 88.3px, 레일이 화면 폭 안). 1280×800에서
 *  2.0은 가상 640×400이라 세로 배치로 떨어진다. 그건 막지 않는다 — 크게 보는 대가로
 *  좁은 배치를 받는 건 사용자가 고를 만한 거래고, 그 상태가 되면 LayoutHint가
 *  "−로 줄여 보라"고 알려 준다. 200%는 WCAG 1.4.4가 요구하는 확대 폭이기도 하다. */
const MAX_SCALE = 2;
/** 이보다 좁은 가상 뷰포트는 데스크톱 배치가 어차피 깨진다 → 안내 대상. */
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
 */
const ZOOM_KEY = "majak.uiZoom";

/**
 * 수동 배수 사다리. "해상도에 맞게끔 원하는 대로"가 요구라 양쪽을 다 넉넉히 연다.
 *
 * 가운데(0.8~1.5)는 10%p 등간격 — 한 번 눌러서 눈에 띄되 두 번 눌러도 안 망가지는 폭.
 * 양끝은 한 칸이 크다: 거기까지 가는 사람은 "훨씬 작게/훨씬 크게"를 원하는 것이라
 * 10%p씩 여섯 번 누르게 하는 건 손잡이가 아니라 고문이다.
 *
 * 아래끝 0.6 = MIN_SCALE. 4K·27인치에서 판을 통째로 담고 싶을 때 쓴다.
 * 위끝 2.0 = MAX_SCALE. 브라우저 확대 200%와 같은 크기다(WCAG 1.4.4가 요구하는 선).
 */
const ZOOM_STEPS = [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 2] as const;
const DEFAULT_ZOOM = 1;

let scale = 1;
let zoom: number = DEFAULT_ZOOM;
const listeners = new Set<() => void>();

/**
 * 브라우저 확대율 감지 기준선 — 첫 측정 때의 devicePixelRatio.
 * Ctrl +/− 는 dpr을 그 배율만큼 움직인다(창 크기 변경·모니터 이동으로는 안 움직인다).
 * 페이지를 열 때 이미 확대돼 있었다면 그 상태가 기준선이 된다 — 그건 그대로 두는 게 맞다.
 * 자동 축소는 "지금 창"에 맞추는 일이고, 확대는 이미 반영된 뒤이기 때문이다.
 */
let baseDpr = 0;

/**
 * "이 사람은 브라우저 확대를 쓴다"는 기억 (세션을 넘어간다).
 * 자세한 이유는 아래 `userZoomedIn()` 주석 참고.
 */
const ZOOMED_KEY = "majak.browserZoomed";
let zoomedInSticky = false;

/**
 * 사용자가 확대해 두었는가 — 그렇다면 자동 축소를 접는다.
 *
 * **이 세션의 dpr 변화만으로는 부족하다** (감사 2026-08-17 §6-4, WCAG 1.4.4).
 * `baseDpr`은 **부팅 시점** 값이라, 브라우저 확대를 200%로 켜 **둔 채** 페이지를 열면
 * 그 200%가 그대로 기준선이 된다 → `userZoomedIn()`이 false → 자동 축소가 걸린다.
 * 1280×800 @200% 실측: scale 0.6이 곱해져 **요구한 200%가 실질 120%로 깎였다.**
 * 확대를 켜 둔 사람은 대개 그게 필요해서 켜 둔 것이고, 새로고침 한 번에 그걸
 * 되돌리는 것은 접근성 도구를 무력화하는 일이다.
 *
 * 그래서 **기억한다**: 한 번이라도 확대한 것을 보면 그 사실을 저장해 두고, 다음
 * 세션에서는 부팅 시점 dpr이 무엇이든 자동 축소를 걸지 않는다. Ctrl+0 으로 확대를
 * 원래대로 되돌리면(= 기준선 아래로 내려오면) 표식을 지워 자동 축소가 돌아온다 —
 * 한 번 켜면 영영 못 돌아가는 상태를 만들지 않는다.
 */
function userZoomedIn(): boolean {
  if (baseDpr <= 0) return zoomedInSticky;
  // 1.02 여유 — 모니터 전환·소수 오차로 dpr이 미세하게 흔들리는 것을 무시한다.
  const nowZoomed = window.devicePixelRatio > baseDpr * 1.02;
  if (nowZoomed && !zoomedInSticky) {
    zoomedInSticky = true;
    safeStorage.setItem(ZOOMED_KEY, "1");
  } else if (zoomedInSticky && window.devicePixelRatio < baseDpr * 0.99) {
    // 기준선 **아래**로 내려왔다 = Ctrl− 또는 Ctrl+0 으로 확대를 접었다.
    zoomedInSticky = false;
    safeStorage.removeItem(ZOOMED_KEY);
  }
  return nowZoomed || zoomedInSticky;
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

/**
 * 지금 창에서 **고를 수 있는** 사다리 칸들.
 *
 * [MIN_SCALE, MAX_SCALE]는 최종 배율이 아니라 **사다리 쪽에서** 잘라 낸다.
 * 최종값을 자르면 사다리는 움직이는데 화면은 안 움직이는 구간이 생기고, 거기서
 * "−도 +도 아무 일이 안 일어나는" 막다른 칸이 만들어진다(작은 창에서 실제로 나왔다).
 * 여기서 자르면 눌리는 칸은 전부 눈에 보이는 변화를 만든다.
 *
 * 1은 언제나 들어 있다 — auto 자체가 [MIN_SCALE, 1] 안이므로.
 */
function allowedSteps(auto: number): number[] {
  const ok = ZOOM_STEPS.filter((s) => auto * s >= MIN_SCALE - 1e-9 && auto * s <= MAX_SCALE + 1e-9);
  return ok.length > 0 ? [...ok] : [DEFAULT_ZOOM];
}

/**
 * 실제로 걸리는 배수 — 저장된 취향을 지금 창에서 고를 수 있는 범위로 당긴 값.
 * 저장값 자체는 건드리지 않는다: 작은 창에 잠깐 들렀다고 큰 모니터의 취향을 잃으면 안 된다.
 */
function activeZoom(auto: number): number {
  const steps = allowedSteps(auto);
  return Math.min(steps[steps.length - 1] as number, Math.max(steps[0] as number, zoom));
}

/** 화면에 실제로 걸리는 배율 = 자동 × 수동. */
function computeScale(): number {
  const auto = computeAutoScale();
  const z = activeZoom(auto);
  if (z === 1) return auto;
  return Math.round(auto * z * 1000) / 1000;
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

/** 현재 UI 배율 (1 = 축소 없음). 자동 × 수동을 이미 반영한 최종값이다. */
export function getUiScale(): number {
  return scale;
}

// ── 수동 배수 (화면의 −/+ 버튼) ──

/**
 * 화면에 보여 줄 배수 — 지금 창에서 실제로 걸리는 값이다.
 * 저장된 취향이 이 창에서 못 고르는 칸이면 당겨진 값이 나온다(그래야 표시가 거짓말을 안 한다).
 */
export function getUiZoom(): number {
  return activeZoom(computeAutoScale());
}

/** 사다리에서 가장 가까운 칸으로 맞춘 값 (범위 밖은 잘라 낸다). */
function snapZoom(v: number): number {
  let best = ZOOM_STEPS[0] as number;
  for (const s of ZOOM_STEPS) if (Math.abs(s - v) < Math.abs(best - v)) best = s;
  return best;
}

function persistZoom(): void {
  try {
    if (zoom === DEFAULT_ZOOM) safeStorage.removeItem(ZOOM_KEY);
    else safeStorage.setItem(ZOOM_KEY, String(zoom));
  } catch {
    /* 저장을 못 해도 이번 세션에서는 동작한다 */
  }
}

/** 배수를 직접 지정 (사다리 칸으로 스냅). 화면이 바뀌었으면 true. */
export function setUiZoom(v: number): boolean {
  const before = scale;
  zoom = snapZoom(v);
  persistZoom();
  apply();
  return scale !== before;
}

/** 배수를 사다리에서 dir칸(+1 확대 / −1 축소) 옮긴다. 바뀌었으면 true. */
export function stepUiZoom(dir: 1 | -1): boolean {
  if (!canStepUiZoom(dir)) return false;
  const steps = allowedSteps(computeAutoScale());
  const next = steps[steps.indexOf(getUiZoom()) + dir];
  return next === undefined ? false : setUiZoom(next);
}

/** 기본값(자동에 맡기기)으로 되돌린다. */
export function resetUiZoom(): boolean {
  return setUiZoom(DEFAULT_ZOOM);
}

/**
 * 그 방향으로 아직 갈 데가 있는가 — 버튼을 끌 때 쓴다.
 * 고를 수 있는 사다리(allowedSteps)의 끝이면 false. 눌리는 칸은 전부 화면을 움직인다.
 */
export function canStepUiZoom(dir: 1 | -1): boolean {
  const steps = allowedSteps(computeAutoScale());
  return steps[steps.indexOf(getUiZoom()) + dir] !== undefined;
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
  if (!isPointerFine() || !hasSize()) return false;
  const v = layoutViewport();
  return v.w < CRAMPED_W && v.h < CRAMPED_H;
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
    safeStorage.removeItem(LEGACY_OVERRIDE_KEY);
  } catch {
    /* 저장소를 못 건드려도 배율은 어차피 자동이다 */
  }
  try {
    const raw = safeStorage.getItem(ZOOM_KEY);
    const v = raw === null ? NaN : Number(raw);
    if (Number.isFinite(v) && v > 0) zoom = snapZoom(v);
  } catch {
    /* 못 읽으면 자동값 그대로 */
  }
  baseDpr = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
  // 지난 세션에서 확대를 쓰던 사람이면 부팅 시점 dpr과 무관하게 자동 축소를 접는다.
  zoomedInSticky = safeStorage.getItem(ZOOMED_KEY) === "1";
  apply();
  window.addEventListener("keydown", onKey);
  window.addEventListener("resize", apply);
  window.addEventListener("orientationchange", apply);
  // resize 이벤트가 안 오는 변화(브라우저 확대율 변경 등)까지 잡는다 —
  // 사용자가 Ctrl +/− 를 직접 눌러 CSS 픽셀 창이 넓어지면 배율도 같이 풀려야 한다.
  new ResizeObserver(apply).observe(document.documentElement);
}
