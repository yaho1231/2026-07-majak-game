/**
 * UI 자동 맞춤 — 창이 무엇이든 "의도한 배치"가 그대로 서게 한다.
 *
 * ── 2026-09-03: 고정 무대 ──
 *
 * 화면은 **어느 창에서든 1920×1080 비율로 고정**된다(사용자 지시). 창이 그보다
 * 옆으로 길면 양옆이, 위아래로 길면 위아래가 검게 남는다(레터박스). 창이 작아지면
 * 무대가 비율 그대로 통째로 작아지고, 커지면 통째로 커진다 — 상한·하한이 없다.
 *
 *     scale = min(창너비 / 1920, 창높이 / 1080)
 *
 * body 는 여전히 창 전체(`창 / scale`, 즉 무대보다 크거나 같다)를 덮는 zoom 표면이고,
 * 그 안에서 `#root` 가 정확히 1920×1080 으로 서서 가운데 놓인다(styles.css
 * `html[data-ui-stage="fixed"]`). 그래서 `#root` 안의 cq 단위와 `@container ui` 는
 * 언제나 1920×1080 을 본다 — 브레이크포인트는 마우스 기기에서 더는 안 걸린다.
 * body 포털(툴팁·드래프트 창)은 body 를 컨테이너로 보므로 예전과 같은 좌표계다:
 * fixed 는 창 기준, 창과 무대는 중심이 같아 가운데 정렬은 그대로 맞는다.
 *
 * 폰·태블릿(pointer: coarse)은 손대지 않는다 — 좁은 화면 전용 배치가 따로 있다.
 *
 * ── 예전 이야기 ──
 *
 * ── 무엇이 문제였나 ──
 *
 * 예전에는 자동 축소(작은 창일 때만) 위에 **사람이 누르는 −/+ 배수**가 곱해졌다.
 * 그 손잡이가 필요했던 이유는 하나다: 세로가 짧은 창(예: 1850×860)에서 위·아래 띠가
 * 전부 **고정 px**라 화면이 짧아질수록 띠가 자리를 다 먹고, 중앙 보드가 그만큼 쪼그라들어
 * 패널 안 점수판·국 표시·도라가 서로 올라탔다. 사람이 −를 눌러 화면을 통째로 줄이면
 * 띠도 같이 줄어 보드가 살아났다 — 즉 **사용자가 손으로 반응형을 하고 있었다.**
 *
 * ── 지금 ──
 *
 * 사람이 하던 그 일을 **창 크기에서 바로 뽑는다.** 이 배치의 원판(1920×1080)에
 * 창을 맞추는 배율 하나다:
 *
 *     scale = min(창너비 / 1920, 창높이 / 1080)   (지금은 상·하한 없음)
 *
 * min() 이므로 **가상 뷰포트(= 창 / scale)는 어느 쪽도 기준 판보다 좁아지지 않는다.**
 * 흔한 16:9·16:10 창은 늘 세로 쪽이 먼저 걸려 가상 세로가 정확히 960으로 고정된다 —
 * 곧 1366×768이든 4K든 **같은 그림이 크기만 다르게** 선다. 큰 모니터에서는 배율이
 * 1을 넘어 판·글자가 화면을 따라 커지고(예전에는 4K에서도 850px 보드에 15px 글자였다),
 * 짧은 창에서는 1 아래로 내려가 고정 px 띠가 화면을 덜 먹는다. 누를 것이 없다.
 *
 * 브라우저 확대(Ctrl/⌘ +/−)는 **상쇄하지 않고 그 위에 곱한다** — 자세한 것은
 * `browserZoomFactor()` 주석. 예전에는 "확대를 쓰는 사람"이라는 표식을 저장해 두고
 * 자동 맞춤을 통째로 껐는데, 그 표식이 한 번 붙으면 영영 안 떨어져 **배율이 1로 굳었다**
 * (2026-08-24 사용자 보고 화면이 정확히 그 상태였다).
 *
 * 배율로 다 못 푸는 구간(하한 0.5에 걸리는 아주 작은 창)은 styles.css 의
 * `@container ui (max-height: …)` 안전망이 띠를 함께 줄여 받는다.
 *
 * ⚠ 이 파일이 하는 일은 **딱 하나**다: 최종 배율 하나를 정해 body의 `zoom`(또는
 * transform)에 건다. 크기 토큰을 골라 곱하는 짓은 하지 않는다 (PR #239가 그랬고
 * 2026-08-12에 되돌렸다: 손패·보드를 키우려고 상대 뒷패를 44→29px로 줄였다 →
 * "상대 패들은 왜 이렇게 작아진거야").
 *
 * 이게 성립하려면 styles.css의 화면 비례 단위와 크기 미디어쿼리가 **실제 창이 아니라
 * 이 가상 뷰포트**를 봐야 한다. 그래서 거기서는 vw/vh/vmin 대신 cqw/cqh/cqmin을,
 * `@media (max-width: …)` 대신 `@container ui (max-width: …)`를 쓴다 (body가 `container: ui / size`).
 *
 * 그리고 그 전제가 성립하지 않는 엔진이 있다 — 아래 detectScaleMode() 주석 참고.
 * 배율을 zoom으로 걸지 transform으로 걸지는 **이 파일이 정해서** `<html>`의
 * `data-ui-scale-mode`로 알린다. styles.css는 그 표식만 보고 갈래를 고른다.
 *
 * 좌표를 다루는 코드는 주의해야 한다. `getBoundingClientRect()`·`clientX`는 **화면 좌표**
 * (배율이 곱해진 값)인데, 인라인 left/top·transform은 **레이아웃 좌표**(곱하기 전)로
 * 해석된다. 둘을 섞는 자리에서는 toLayoutPx()로 되돌려야 한다.
 *
 * `zoom`으로 바꾼 뒤에도 이 관계는 그대로다 — 2026-08-12에 크롬에서 실측했다:
 * body zoom 2, left:100px 인 상자의 `getBoundingClientRect().left` = 200,
 * `offsetLeft` = 100, 그 상자를 화면 (250,220)에서 클릭하면 `clientX` = 250.
 * 즉 rect·clientX 는 화면 px, offset·인라인 스타일은 레이아웃 px다.
 */

import { safeStorage } from "./storage.js";

/**
 * 원판 — "이 크기의 창에서 보이는 그림"이 배율 1이다. 1080p 를 원판으로 잡았다.
 *
 * 세로가 곧 중앙 보드의 크기다. 위·아래로 늘 빠지는 몫이 고정 px 이기 때문이다
 * (2026-08-24 실측, 레이아웃 px):
 *
 *     위 띠 76 + 숨통 24 + 아래 띠 267(= 손패 162 + 오름패 줄 75 + 줄 간격·여백 30)
 *     → 남는 세로 H − 367 = 보드 세로(= --board × 0.9)
 *     → 중앙 패널 = --board × 0.348
 *
 * 패널이 **180 아래로 내려가면** 국 표시·도라·네 방향 점수판이 서로 올라탄다
 * (실측: 152에서 "東3국" 위로 위쪽 점수판이 얹혔다 — 사용자가 보고한 그 화면이다).
 * 1080에서는 패널이 276 이라 넉넉하고, 손패도 상한(84px = 6cqw)까지 자란다.
 *
 * 배율이 min()이라 **가상 뷰포트는 어느 쪽도 원판보다 좁아지지 않는다.** 그래서
 * 16:9 창은 — 1366×768이든 4K든 — 가상 1920×1080으로 수렴해 **같은 그림이 크기만
 * 다르게** 선다. 16:10·21:9 처럼 비율이 다른 창은 남는 쪽이 여백으로 붙을 뿐이다.
 *
 * (예전엔 하한에 걸리는 창만 예외였다 — 그쪽은 styles.css 의
 *  `@container ui (max-height: …)` 안전망이 띠를 함께 줄여 받는다.)
 */
const REF_W = 1920;
const REF_H = 1080;

/* (예전의 MIN_SCALE 0.75→0.5 / MAX_SCALE 2 는 없앴다 — 무대는 창에 딱 맞는 배율 하나다.) */

/** 이보다 좁은 가상 뷰포트는 데스크톱 배치가 어차피 깨진다 → 안내 대상. */
const CRAMPED_W = 900;
const CRAMPED_H = 560;

/**
 * 예전에 설정 패널에 있던 "화면 크기" 수동 배율이 남긴 localStorage 키.
 * 설정이 사라졌으므로(2026-08-07 사용자 지시) 부팅할 때 지워 준다 —
 * 안 지우면 예전에 배율을 못 박아 둔 사람이 그 값에 갇힌 채 손잡이가 없다.
 */
const LEGACY_OVERRIDE_KEY = "majak.uiScale";

/**
 * 화면의 −/+ 버튼이 쓰던 수동 배수 키. 버튼을 없앴으므로(2026-08-24 사용자 지시:
 * "+- 버튼도 없애서 … 플레이어가 브라우저 크기를 억지로 맞추는 형태가 아니면 좋겠어")
 * **같이 지운다.** 안 지우면 0.6을 저장해 둔 사람이 손잡이 없이 그 값에 갇힌다.
 */
const LEGACY_ZOOM_KEY = "majak.uiZoom";

/**
 * "이 사람은 브라우저 확대를 쓴다"를 적어 두던 키. **자동 맞춤을 통째로 끄는 표식**
 * 이라, 한 번 붙으면 창이 무엇이든 배율이 1로 굳었다(위 `browserZoomFactor()` 주석).
 * 붙어 있는 사람이 이미 있으므로 부팅 때 지운다 — 안 지우면 그 사람만 계속 깨진 판을 본다.
 */
const LEGACY_ZOOMED_KEY = "majak.browserZoomed";

let scale = 1;
const listeners = new Set<() => void>();

/**
 * 브라우저 확대의 기준선 — **부팅 시점의** devicePixelRatio.
 *
 * Ctrl/⌘ +/− 는 dpr을 그 배율만큼 움직인다(창 크기 변경으로는 안 움직인다).
 * 그래서 «지금 dpr ÷ 부팅 때 dpr» 이 곧 «이 세션에서 사람이 누른 확대»다.
 */
let baseDpr = 0;

/** 기준선을 잡을 때의 **기기 픽셀** 폭(= CSS 폭 × dpr). 확대와 모니터 이동을 가른다. */
let baseDeviceW = 0;

/** 사람이 누른 확대를 얹는 폭. 밖은 잘라 낸다 — 모니터를 옮겨 dpr이 튀어도 판이 안 깨진다. */
const MIN_ZOOM_FACTOR = 0.5;
const MAX_ZOOM_FACTOR = 2;

/**
 * 이 세션에서 사람이 브라우저 확대를 얼마나 눌렀는가 (1 = 부팅 때 그대로).
 *
 * ── 왜 «곱하는» 값인가 ──
 *
 * 브라우저 확대 Z는 CSS 픽셀 창을 정확히 1/Z로 줄인다. 자동 맞춤은 그 줄어든 창을
 * 보고 배율을 1/Z 배로 낮추므로, 그대로 두면 **사람이 요구한 확대가 정확히 상쇄된다**
 * (Ctrl+ 를 눌러도 아무 일도 안 일어난다 = WCAG 1.4.4 위반).
 * 여기서 Z를 도로 곱해 주면 상쇄가 풀린다 — 화면에 보이는 크기는 Z배가 되고,
 * 대신 가상 뷰포트가 그만큼 좁아진다. 확대란 원래 «크게 보는 대신 덜 담는» 거래다.
 *
 * ── 왜 아무것도 저장하지 않는가 ──
 *
 * 예전에는 "이 사람은 확대를 쓴다"를 localStorage(`majak.browserZoomed`)에 적어 두고
 * 그 표식이 있으면 **자동 맞춤을 통째로 껐다.** 그게 덫이었다: 한 번이라도 Ctrl+ 를
 * 누르거나(또는 창을 Retina 모니터로 옮기거나, 축소해 둔 채 연 페이지에서 Ctrl+0 을
 * 누르거나) 하면 표식이 남아 **그 뒤로 영원히 배율이 1로 굳는다.** 2026-08-24 사용자
 * 보고가 정확히 이 상태였다 — 1827×852에서 배율이 0.75가 아니라 1이었다
 * (재현: `localStorage.setItem("majak.browserZoomed","1")` 후 새로고침).
 *
 * 그래서 **세션을 넘기는 상태를 두지 않는다.** 부팅하면 언제나 배수 1 = 순수 자동
 * 맞춤이고, 그 자리에서 누른 확대만 얹힌다. 어떤 경로로도 «배율이 굳는» 상태가 없다.
 * 대가: 확대를 켜 **둔 채** 페이지를 열면 그 확대는 자동 맞춤에 상쇄된다(부팅 시점이
 * 기준선이므로 눌린 것을 볼 수가 없다). 판이 깨진 채 굳는 것보다는 이쪽이 낫다 —
 * 크게 보고 싶으면 판을 연 뒤 한 번 더 누르면 그대로 듣는다.
 */
/** (배율에는 더 이상 곱하지 않는다 — 무대가 창을 넘치면 안 된다. 잰 값은 참고용.) */
export function browserZoomFactor(): number {
  if (baseDpr <= 0 || baseDeviceW <= 0) return 1;
  const dpr = window.devicePixelRatio > 0 ? window.devicePixelRatio : baseDpr;
  const raw = dpr / baseDpr;
  // 2% 여유 — 소수 오차로 dpr이 미세하게 흔들리는 것을 확대로 읽지 않는다.
  if (raw > 0.98 && raw < 1.02) return 1;
  /*
   * dpr 이 움직이는 이유는 둘이다: **브라우저 확대**와 **모니터 이동**(배율이 다른
   * 디스플레이로 창을 끌었다). 앞의 것만 배율에 얹어야 한다 — 뒤의 것까지 얹으면
   * 창을 옮겼을 뿐인데 판이 절반으로 줄어든 채 굳는다.
   *
   * 가르는 법: 확대는 CSS 픽셀 창을 정확히 1/z 로 줄이므로 **`innerWidth × dpr`
   * (= 기기 픽셀 폭)이 그대로**다. 모니터를 옮기면 dpr 만 바뀌고 CSS 폭은 거의
   * 그대로라 그 곱이 dpr 배만큼 달라진다. 10% 넘게 어긋나면 확대가 아니라고 보고
   * 기준선을 새 모니터에 맞춰 다시 잡는다.
   */
  const deviceW = window.innerWidth * dpr;
  if (Math.abs(deviceW / baseDeviceW - 1) > 0.1) {
    baseDpr = dpr;
    baseDeviceW = deviceW;
    return 1;
  }
  return Math.min(MAX_ZOOM_FACTOR, Math.max(MIN_ZOOM_FACTOR, raw));
}

// ── 배율을 무엇으로 거는가 (zoom vs transform) ──

/** styles.css가 보는 표식. `<html data-ui-scale-mode="zoom|transform">`. */
const MODE_ATTR = "data-ui-scale-mode";

/** styles.css가 보는 무대 표식. `<html data-ui-stage="fixed">` 이면 #root 가 1920×1080 무대다. */
const STAGE_ATTR = "data-ui-stage";

export type ScaleMode = "zoom" | "transform";

/**
 * cq 단위가 zoom을 무시하는 엔진인가.
 *
 * 컨테이너 질의 단위(cqw/cqh)는 **컨테이너의 레이아웃 크기**로 풀려야 한다. 크로뮴은
 * 그렇게 하는데 **WebKit(사파리)은 화면 크기로 푼다** — zoom이 걸린 아래에서 둘은
 * `--ui-scale` 배만큼 다르다. styles.css는 화면 비례 길이를 전부 cq로 쓰므로
 * 그 차이가 그대로 판 전체에 걸린다: 배율 0.7에서 `.game-root`의 `height: 100cqh`가
 * 창 높이의 70%가 되어 판이 위쪽에 붙고 아래가 통째로 빈다
 * (2026-08-19 사용자 보고 "마이너스 버튼을 눌렀는데 게임 전체가 위로 가버려").
 *
 * zoom 2를 건 100px 상자를 컨테이너로 세우고 그 안에서 `100cqw`를 잰다.
 * 아는 엔진이면 100(= 컨테이너의 레이아웃 px), 모르는 엔진이면 200(= 화면 px)이 나온다.
 */
function cqUnitsIgnoreZoom(): boolean {
  const host = document.createElement("div");
  host.setAttribute(
    "style",
    "position:absolute;top:0;left:0;width:100px;height:100px;" +
      "visibility:hidden;pointer-events:none;zoom:2;container:uiprobe / size",
  );
  const inner = document.createElement("div");
  inner.setAttribute("style", "width:100cqw;height:1px");
  host.appendChild(inner);
  document.body.appendChild(host);
  const w = inner.offsetWidth;
  host.remove();
  return w > 150;
}

/**
 * 배율을 걸 방식.
 *
 * `zoom`이 기본이다 — 진짜 브라우저 확대와 같아서 키워도 글자가 뭉개지지 않는다.
 * 다만 **`zoom`을 지원한다는 것만으로는 부족하다**: 위 cqUnitsIgnoreZoom()이 참인
 * 엔진에서는 zoom과 cq 단위가 서로 어긋나 배치가 깨진다. 그런 엔진은 transform으로
 * 받는다 — body에 zoom이 없으면 cq 단위가 레이아웃 크기 그대로라 전부 맞는다.
 *
 * 잴 수 없으면(DOM이 없는 환경) transform으로 둔다. 어느 엔진에서든 배치는 맞고
 * 잃는 것은 글자 선명도뿐이라, 판이 깨지는 쪽보다 안전한 기본값이다.
 */
function detectScaleMode(): ScaleMode {
  try {
    if (typeof CSS === "undefined" || !CSS.supports("zoom", "2")) return "transform";
    return cqUnitsIgnoreZoom() ? "transform" : "zoom";
  } catch {
    return "transform";
  }
}

/** 마우스 쓰는 기기인가 — 폰·태블릿은 좁은 화면 전용 배치가 따로 있어 손대지 않는다. */
function isPointerFine(): boolean {
  return window.matchMedia("(pointer: fine)").matches;
}

/** 창 크기를 잴 수 있나 — 숨은 탭·0×0 프레임에서는 0이 나온다(그땐 아무것도 하지 않는다). */
function hasSize(): boolean {
  return window.innerWidth > 0 && window.innerHeight > 0;
}

/**
 * 창 하나만 보고 정하는 배율. 사람이 끼어드는 자리는 없다.
 *
 * 소수 둘째 자리로 **버린다** — 창을 끌 때마다 1px 단위로 배율이 흔들리면 글자가
 * 떨리기 때문인데, 반올림이 아니라 내림인 이유는 «가상 뷰포트가 원판보다 좁아지지
 * 않는다»는 약속을 지키기 위해서다(올림 쪽으로 끊으면 1512×982에서 가상 폭이
 * 1913px 로 6px 모자란다).
 */
function computeScale(): number {
  if (!isPointerFine() || !hasSize()) return 1;
  const fit = Math.min(window.innerWidth / REF_W, window.innerHeight / REF_H);
  /*
   * 상한·하한이 없다 — 무대(1920×1080)가 창에 **정확히 들어가는** 배율 하나다.
   * 창이 작으면 무대도 그만큼 작아지고(비율은 그대로), 크면 그만큼 커진다.
   *
   * 브라우저 확대(Ctrl/⌘ +/−)도 곱하지 않는다. 곱하면 무대가 창보다 커져 가장자리가
   * 잘린다 — 무대가 늘 창 안에 통째로 보인다는 약속이 먼저다. 확대를 누르면 CSS 픽셀
   * 창이 1/z 로 줄고 배율이 그만큼 내려가 화면에서는 아무것도 안 바뀐다(=상쇄).
   * (0.5 안전 하한은 없다 — 0 이 되는 것만 막는다.)
   */
  const safe = Math.max(0.05, fit);
  return Math.floor(safe * 100) / 100;
}

function apply(): void {
  const next = computeScale();
  if (next !== scale) {
    scale = next;
  }
  // 값이 그대로여도 매번 쓴다 — 첫 적용(scale이 초기값 1과 같은 경우)에도 변수가 서야 한다.
  document.body.style.setProperty("--ui-scale", String(scale));
  // 무대를 쓰는지 알린다 — styles.css 는 이 표식이 있을 때만 #root 를 1920×1080 으로
  // 못 박고 남는 자리를 검게 칠한다. 폰·태블릿(pointer: coarse)은 표식이 없어 예전
  // 배치(창 = 뷰포트) 그대로다.
  try {
    if (isPointerFine() && hasSize()) document.documentElement.setAttribute(STAGE_ATTR, "fixed");
    else document.documentElement.removeAttribute(STAGE_ATTR);
  } catch {
    /* DOM 이 없으면 무대도 없다 */
  }
  // 배율이 그대로여도(하한에 걸린 채 창만 조금 바뀐 경우) 안내 조건은 달라질 수 있다.
  listeners.forEach((fn) => fn());
}

/** 현재 UI 배율 (1 = 기준 판과 같은 크기). */
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

/** 무대(1920×1080)를 쓰는 화면인가 — 마우스 기기에서 창 크기를 잴 수 있을 때. */
export function isFixedStage(): boolean {
  return isPointerFine() && hasSize();
}

/**
 * 하한까지 줄여도 배치가 풀릴 만한 창이 아닌가.
 * 여기 걸리면 화면 구석에 Ctrl +/− 안내를 띄운다 (자동으로는 더 못 해 준다).
 *
 * 가로·세로가 **둘 다** 모자랄 때만이다. 한쪽만 좁은 창(세로로 긴 창)은
 * 좁은 화면 전용 배치가 제대로 받아 준다.
 */
export function isLayoutCramped(): boolean {
  if (!isPointerFine() || !hasSize()) return false;
  const v = layoutViewport();
  return v.w < CRAMPED_W && v.h < CRAMPED_H;
}

/** 배율이 바뀔 때 알림 (창 크기 변경·브라우저 확대). 해제 함수를 돌려준다. */
export function subscribeUiScale(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 앱 부팅 시 1회. 첫 페인트 전에 배율을 걸고, 이후 창 크기를 따라간다. */
export function startUiScale(): void {
  // 배율을 **걸기 전에** 방식을 정한다 — 표식이 없으면 styles.css의 두 갈래가 전부
  // 안 걸려 배율이 통째로 무시된다(첫 프레임에 원래 크기가 번쩍인다).
  try {
    document.documentElement.setAttribute(MODE_ATTR, detectScaleMode());
  } catch {
    /* DOM을 못 건드리는 환경이면 배율 자체가 의미 없다 */
  }
  // 손잡이가 사라진 지금, 예전 저장값은 갇히는 자리일 뿐이다 — 둘 다 지운다.
  for (const key of [LEGACY_OVERRIDE_KEY, LEGACY_ZOOM_KEY, LEGACY_ZOOMED_KEY]) {
    try {
      safeStorage.removeItem(key);
    } catch {
      /* 저장소를 못 건드려도 배율은 어차피 자동이다 */
    }
  }
  baseDpr = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
  baseDeviceW = window.innerWidth * baseDpr;
  apply();
  window.addEventListener("resize", apply);
  window.addEventListener("orientationchange", apply);
  // resize 이벤트가 안 오는 변화(브라우저 확대율 변경 등)까지 잡는다 —
  // 사용자가 Ctrl +/− 를 직접 눌러 CSS 픽셀 창이 넓어지면 배율도 같이 풀려야 한다.
  new ResizeObserver(apply).observe(document.documentElement);
}
