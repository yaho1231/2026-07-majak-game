/**
 * fx-bakeoff — anime.js vs GSAP 0단계 비교 (docs/38 §10-7).
 *
 * 목적은 "예쁜 연출"이 아니라 **숫자로 갈리는 세 가지**다.
 *  ① 조상·중첩 transform 아래에서 좌표가 맞는가 (uiScale.ts 문제)
 *  ② FLIP 이 우리 레이아웃에서 도는가
 *  ③ 번들이 얼마나 느는가
 *
 * 결과는 화면에도 찍고 `window.__results` 에도 남긴다 (자동 확인용).
 */
import { animate, createLayout, utils, engine } from "/vendor/anime.esm.js?v=1";
import { gsap, Flip, MotionPathPlugin, CustomWiggle } from "/vendor/gsap.esm.js?v=1";

const $ = (s) => document.querySelector(s);
const stage = $("#stage");
const hand = $("#hand");
const meldSlot = $("#meldSlot");

window.__results = { coord: {}, flip: {}, shake: {}, bundle: {} };

// ─────────────────────────── 무대 ───────────────────────────

/** 게임과 같은 방식으로 무대를 축소한다 (fx-core.js `fitStage` 와 동일). */
function fitStage() {
  const w = $("#stageWrap");
  const k = Math.min((w.clientWidth - 24) / 1000, (w.clientHeight - 24) / 625, 1.35);
  stage.style.transform = `translate(-50%, -50%) scale(${Math.max(0.12, k)})`;
}
new ResizeObserver(fitStage).observe($("#stageWrap"));
fitStage();

const CODES = ["1m","2m","3m","4m","5m","6m","7m","8m","9m","1p","2p","3p","5z"];
function tileEl(code) {
  const d = document.createElement("div");
  d.className = "tf";
  d.dataset.code = code;
  d.dataset.flipId = code;      // GSAP Flip 용
  d.dataset.layoutId = code;    // anime.js Layout 용
  const im = new Image();
  im.src = `/tiles/${code}.png`;
  im.draggable = false;
  d.appendChild(im);
  return d;
}
function buildHand(order = CODES) {
  hand.textContent = "";
  for (const c of order) hand.appendChild(tileEl(c));
}
buildHand();

/** 화면 좌표 중심 */
const centerOf = (el) => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const fmt = (n) => (Math.round(n * 100) / 100).toFixed(2);

function reset(el) {
  el.style.transform = "";
  gsap.set(el, { clearProps: "all" });
  el.style.transform = "";
}

/**
 * **테스트 사이 초기화** — 이게 없으면 앞 테스트가 남긴 인라인 스타일이 다음 측정을 오염시킨다.
 *
 * 실제로 겪었다: anime.js AutoLayout 이 남긴 `translate` / `position: fixed` 잔재 때문에
 * 그 다음에 잰 GSAP 수치가 4~27px 씩 흔들렸다. 통제하고 다시 재니 GSAP 은 소수점 둘째
 * 자리까지 정확했다. **연출은 되돌림까지가 연출이다**(24_FX_LAB) 는 측정에도 그대로 적용된다.
 */
function resetHand() {
  gsap.killTweensOf([hand, ...hand.children]);
  gsap.set([hand, ...hand.children], { clearProps: "all" });
  hand.removeAttribute("style");
  for (const el of hand.children) el.removeAttribute("style");
}

// ─────────────────────── ① 좌표 정확도 ───────────────────────
//
// 손패 첫 패를 멜드 칸에 정확히 얹는다. 세 방법의 **착지 오차**를 잰다.
//
// ⚠ 측정은 **재생이 아니라 seek** 으로 한다. 브라우저 탭이 숨겨져 있으면 rAF 가 조여지고,
//    anime.js 는 `engine.pauseOnDocumentHidden` 이 기본 true 라 아예 멈춘다 — 그러면
//    "언제 끝나는지"에 기대는 측정이 영영 안 끝난다. 끝 상태로 감아서 재면 결정적이다.

/**
 * 현행 방식 — `fx-core.js` 의 `sRect()` / `App.tsx` 의 `toLayoutPx()` 와 같은 계산.
 * 무대 배율만 나눈다. **중첩 transform(손패 .92/-1.2° · 멜드 1.08/2.5°)은 모른다.**
 */
function manualDelta(from, to) {
  const st = stage.getBoundingClientRect();
  const k = st.width / 1000 || 1;      // 무대 배율만 본다
  const a = centerOf(from);
  const b = centerOf(to);
  return { x: (b.x - a.x) / k, y: (b.y - a.y) / k };
}

function coordManual() {
  const tile = hand.children[0];
  reset(tile);
  const d = manualDelta(tile, meldSlot);
  tile.style.transform = `translate(${d.x}px, ${d.y}px)`;
  const err = dist(centerOf(tile), centerOf(meldSlot));
  return { err, replay: () => {
    reset(tile);
    tile.style.transition = "transform .5s cubic-bezier(.16,1,.3,1)";
    requestAnimationFrame(() => { tile.style.transform = `translate(${d.x}px, ${d.y}px)`; });
    setTimeout(() => { tile.style.transition = ""; reset(tile); }, 900);
  } };
}

function coordAnime() {
  const tile = hand.children[0];
  reset(tile);
  // anime.js 에는 좌표 변환 헬퍼가 없다 — 같은 손수 계산을 쓸 수밖에 없다.
  const d = manualDelta(tile, meldSlot);
  const a = animate(tile, { x: d.x, y: d.y, duration: 500, ease: "out(3)", autoplay: false });
  a.seek(a.duration);
  const err = dist(centerOf(tile), centerOf(meldSlot));
  return { err, replay: () => { a.seek(0); a.play(); setTimeout(() => reset(tile), 900); } };
}

function coordGsap() {
  const tile = hand.children[0];
  reset(tile);
  // GSAP: 중첩 transform 을 가로질러 두 요소 사이 거리를 계산한다.
  const d = MotionPathPlugin.getRelativePosition(tile, meldSlot, [0.5, 0.5], [0.5, 0.5]);
  const t = gsap.to(tile, { x: d.x, y: d.y, duration: 0.5, ease: "power3.out", paused: true });
  t.progress(1);
  const err = dist(centerOf(tile), centerOf(meldSlot));
  return { err, replay: () => { t.restart(); setTimeout(() => reset(tile), 900); } };
}

const COORD = {
  "coord-manual": ["현행(손수 계산)", coordManual],
  "coord-anime": ["anime.js", coordAnime],
  "coord-gsap": ["GSAP", coordGsap],
};

function runCoord(keys) {
  resetHand();
  const out = $("#coordOut");
  const lines = ["착지 오차 (화면 px · 0 에 가까울수록 옳다)", ""];
  let last = null;
  for (const k of keys) {
    const [label, fn] = COORD[k];
    const { err, replay } = fn();
    last = replay;
    window.__results.coord[label] = err;
    lines.push(`${label.padEnd(16)} ${fmt(err)} px  ${err < 1.5 ? "✅ 맞다" : "❌ 어긋난다"}`);
  }
  reset(hand.children[0]);
  out.textContent = lines.join("\n");
  if (keys.length === 1 && last) last();   // 하나만 눌렀으면 눈으로도 보여준다
}

// ─────────────────────────── ② FLIP ───────────────────────────

let sorted = true;
function nextOrder() {
  sorted = !sorted;
  return sorted ? CODES : utils.shuffle([...CODES]);
}

function applyOrder(order) {
  const byCode = {};
  for (const el of [...hand.children]) byCode[el.dataset.code] = el;
  for (const c of order) hand.appendChild(byCode[c]);
}

/** 연출 없이 그냥 재배치했을 때의 위치 = 정답 */
function groundTruth(order) {
  const prev = [...hand.children].map((el) => el.dataset.code);
  applyOrder(order);
  const truth = {};
  for (const el of hand.children) truth[el.dataset.code] = centerOf(el);
  applyOrder(prev);
  return truth;
}

function measureAgainst(truth) {
  let max = 0;
  for (const el of hand.children) {
    const d = dist(centerOf(el), truth[el.dataset.code]);
    if (d > max) max = d;
  }
  return max;
}

/**
 * **비행 이탈 오차** — 중간 지점에서 패가 "출발점→도착점 직선"에서 얼마나 벗어나는가.
 *
 * 처음에는 `getComputedStyle(el).transform` 이 identity 가 아닌지로 "움직였나"를 봤는데
 * 그건 **불공정한 판정**이었다 — anime.js 의 AutoLayout 은 `transform` 이 아니라 CSS
 * `translate` 속성을 쓰므로 계산된 `transform` 은 계속 `none` 이다(그래서 "순간이동"으로
 * 잘못 읽혔다). 라이브러리가 무엇을 쓰든 상관없는 기준으로 바꾼다: **화면 좌표**.
 *
 * FLIP 은 출발점에서 도착점으로 **곧게** 옮기는 기법이라, 이징이 무엇이든 중간 위치는
 * 그 직선 위에 있어야 한다. 직선에서 크게 벗어나면 비행 중 좌표계가 어긋난 것이다.
 */
function segDeviation(p, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, { x: a.x + vx * t, y: a.y + vy * t });
}

function report(label, maxErr, midDev, note = "") {
  window.__results.flip[label] = { maxErr, midDev };
  $("#flipOut").textContent =
    `${label}\n` +
    `  최종 위치 최대 오차 : ${fmt(maxErr)} px  ${maxErr < 1.5 ? "✅" : "❌"}\n` +
    `  비행 이탈(50%) 최대 : ${midDev === null ? "— (연출 없음)" : fmt(midDev) + " px  " + (midDev < 4 ? "✅ 곧게 난다" : "❌ 궤도를 벗어난다")}\n` +
    (note ? `  ${note}\n` : "");
}

/** 각 패의 현재 화면 중심 */
function centersByCode() {
  const o = {};
  for (const el of hand.children) o[el.dataset.code] = centerOf(el);
  return o;
}

function flipNone() {
  resetHand();
  const order = nextOrder();
  const truth = groundTruth(order);
  applyOrder(order);
  report("현행 (연출 없음)", measureAgainst(truth), null,
    "→ 순간이동한다. 무엇이 어디로 갔는지 안 보인다");
}

/** 공통 절차 — 시작 좌표를 잡고, 50%에서 이탈을 재고, 끝에서 착지를 잰다. */
function runFlip(label, make, note = "") {
  resetHand();
  const order = nextOrder();
  const start = centersByCode();
  const truth = groundTruth(order);
  const tl = make(order);
  tl.seekTo(0.5);
  const mid = centersByCode();
  let midDev = 0;
  for (const code of Object.keys(truth)) {
    // 이동 거리가 짧은 패는 수직 편차가 과장된다 — 30px 이상 움직이는 패만 본다
    if (dist(start[code], truth[code]) < 30) continue;
    const d = segDeviation(mid[code], start[code], truth[code]);
    if (d > midDev) midDev = d;
  }
  tl.seekTo(1);
  report(label, measureAgainst(truth), midDev, note);
  tl.replay();
}

function flipAnime() {
  runFlip("anime.js createLayout", (order) => {
    const layout = createLayout(hand, { duration: 620, ease: "out(3)" });
    const tl = layout.update(() => applyOrder(order));
    tl.pause();
    return {
      seekTo: (p) => tl.seek(tl.duration * p),
      replay: () => { tl.seek(0); tl.play(); },
    };
  });
}

/**
 * **대조군 — 조상에 transform 이 하나도 없는 곳에서 같은 것을 한다.**
 *
 * anime.js 의 AutoLayout 이 우리 무대에서 궤도를 벗어나는 것이 *라이브러리가 못 해서*인지
 * *우리 구조(조상 transform) 때문*인지를 가른다. 이 대조군이 0 px 로 나오면 원인은 구조다 —
 * 그러면 결론은 "anime.js 는 안 된다"가 아니라 **"anime.js 의 Layout 은 `uiScale` 과 같이
 * 못 쓴다"** 가 된다. 둘은 다른 말이고, 후자만 사실이다.
 */
function flipControl() {
  const box = document.createElement("div");
  box.style.cssText = "position:fixed; left:-9999px; top:0; display:flex; gap:6px;";
  const KEYS = ["a", "b", "c", "d", "e"];
  for (const k of KEYS) {
    const d = document.createElement("div");
    d.dataset.code = k;
    d.style.cssText = "width:52px;height:72px;";
    box.appendChild(d);
  }
  document.body.appendChild(box);
  const cen = () => Object.fromEntries([...box.children].map((e) => [e.dataset.code, centerOf(e)]));
  const put = (o) => {
    const by = {};
    for (const e of [...box.children]) by[e.dataset.code] = e;
    for (const k of o) box.appendChild(by[k]);
  };
  const order = [...KEYS].reverse();
  const start = cen();
  put(order); const truth = cen(); put(KEYS);
  const tl = createLayout(box, { duration: 600 }).update(() => put(order));
  tl.pause();
  tl.seek(300);
  const mid = cen();
  let midDev = 0;
  for (const k of KEYS) {
    if (dist(start[k], truth[k]) < 30) continue;
    midDev = Math.max(midDev, segDeviation(mid[k], start[k], truth[k]));
  }
  tl.seek(600);
  let landErr = 0;
  for (const k of KEYS) landErr = Math.max(landErr, dist(cen()[k], truth[k]));
  box.remove();
  report("대조군 · anime.js (조상 transform 없음)", landErr, midDev,
    "→ 여기서 0 이면 원인은 라이브러리가 아니라 우리 구조다");
}

function flipGsap() {
  runFlip("GSAP Flip", (order) => {
    const state = Flip.getState(hand.children);
    applyOrder(order);
    const tl = Flip.from(state, { duration: 0.62, ease: "power3.out", paused: true });
    return { seekTo: (p) => tl.progress(p), replay: () => tl.restart() };
  });
}

// ─────────────────────────── ③ 흔들림 ───────────────────────────
//
// 지금 styles.css 에 있는 shake-1~4 를 그대로 옮겨 왔다 (키프레임 4벌).
const SHAKE_CSS = {
  1: [{ x: 0, y: 0 }, { x: 2, y: -2 }, { x: -2, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 0 }],
  2: [{ x: 0, y: 0 }, { x: -4, y: 3 }, { x: 4, y: -3 }, { x: -3, y: -2 }, { x: 3, y: 2 }, { x: 0, y: 0 }],
  3: [{ x: 0, y: 0 }, { x: -7, y: 5 }, { x: 7, y: -5 }, { x: -6, y: -4 }, { x: 5, y: 4 }, { x: -3, y: 2 }, { x: 0, y: 0 }],
  4: [{ x: 0, y: 0 }, { x: -11, y: 8 }, { x: 11, y: -8 }, { x: -9, y: -7 }, { x: 8, y: 6 }, { x: -5, y: 4 }, { x: 3, y: -2 }, { x: 0, y: 0 }],
};
const SHAKE_DUR = { 1: 180, 2: 300, 3: 420, 4: 620 };
const SHAKE_AMP = { 1: 2, 2: 5, 3: 9, 4: 14 };

CustomWiggle.create("mjShake", { wiggles: 8, type: "easeOut" });
CustomWiggle.create("mjShakeAntic", { wiggles: 7, type: "anticipate" });

function shakeCss(lv) {
  const kf = SHAKE_CSS[lv].map((p) => ({ transform: `translate(${p.x}px, ${p.y}px)` }));
  stage.animate(kf, { duration: SHAKE_DUR[lv], easing: "linear" });
  $("#shakeOut").textContent =
    `현행 CSS keyframes · 세기 ${lv}\n` +
    `  키프레임을 세기마다 손으로 적어 둔다 (styles.css 에 4벌 · 약 40줄)\n` +
    `  세기를 바꾸려면 좌표 ${SHAKE_CSS[lv].length}개를 다시 적어야 한다`;
}
function shakeWiggle(lv, ease = "mjShake", name = "CustomWiggle") {
  gsap.fromTo(stage, { x: -SHAKE_AMP[lv] }, { x: 0, duration: SHAKE_DUR[lv] / 1000, ease, clearProps: "x" });
  $("#shakeOut").textContent =
    `${name} · 세기 ${lv}\n` +
    `  이징 1벌 + 세기 숫자 하나 (amp=${SHAKE_AMP[lv]}) — 4단이 표 한 줄이 된다\n` +
    (ease === "mjShakeAntic"
      ? `  anticipate = 한 번 뒤로 당겼다가 터진다 → 론·역만용. 지금 키프레임으로는 못 만드는 결`
      : `  easeOut = 지금 keyframes 와 같은 결`);
}

// ─────────────────────────── ④ 번들 ───────────────────────────

const BUNDLE = [
  ["anime.js  waapi+utils", 8.0],
  ["anime.js  코어 한 벌", 18.3],
  ["anime.js  전부(+layout)", 36.9],
  ["react-spring web", 18.7],
  ["GSAP  코어만", 27.0],
  ["GSAP  최소 세트*", 55.3],
  ["GSAP  우리 세트**", 72.6],
];
const BASELINE = 191.1;
$("#bundleOut").textContent =
  `esbuild --bundle --minify + gzip -9 실측 (KB, gzip)\n` +
  `지금 클라이언트 메인 청크: ${BASELINE} KB gz\n\n` +
  BUNDLE.map(([n, kb]) =>
    `  ${n.padEnd(24)} ${String(kb).padStart(5)} KB   (+${((kb / BASELINE) * 100).toFixed(0)}%)`,
  ).join("\n") +
  `\n\n  * Flip·Draggable·MotionPath·CustomEase·CustomWiggle\n` +
  `  ** + Inertia·SplitText·ScrambleText·DrawSVG·MorphSVG·Physics2D·CustomBounce\n\n` +
  `  조합: anime전부+react-spring = 55.3 KB  /  GSAP 우리 세트 = 72.6 KB`;
window.__results.bundle = { baseline: BASELINE, rows: BUNDLE };

// ─────────────────────────── 배선 ───────────────────────────

document.addEventListener("click", (e) => {
  const act = e.target?.dataset?.act;
  if (!act) return;
  const lv = Number($("#shakeLv").value);
  if (act === "coord-all") return runCoord(["coord-manual", "coord-anime", "coord-gsap"]);
  if (act.startsWith("coord-")) return runCoord([act]);
  if (act === "flip-none") return flipNone();
  if (act === "flip-anime") return flipAnime();
  if (act === "flip-gsap") return flipGsap();
  if (act === "flip-control") return flipControl();
  if (act === "shake-css") return shakeCss(lv);
  if (act === "shake-wiggle") return shakeWiggle(lv);
  if (act === "shake-antic") return shakeWiggle(lv, "mjShakeAntic", "CustomWiggle · anticipate");
});

/** 자동 확인용 — 콘솔/드라이버에서 한 번에 돌린다 */
window.__runAll = () => {
  resetHand();
  runCoord(["coord-manual", "coord-anime", "coord-gsap"]);
  flipNone();
  flipAnime();
  flipGsap();
  flipControl();
  window.__results.env = {
    visibility: document.visibilityState,
    animeEnginePaused: engine.paused,
    note: "측정은 seek 기반이라 탭이 숨겨져 있어도 값이 같다",
  };
  resetHand();
  return window.__results;
};
