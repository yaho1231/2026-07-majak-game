/* MAJAK 증강 연출 랩 — 런타임 코어
 *
 * 무대는 1000×625 고정 좌표계다. 화면 맞춤은 .stage 의 scale() 로만 하고, 이펙트는 전부
 * 이 좌표계에서 계산한다 — 캔버스 입자 물리와 CSS 위치가 같은 단위를 쓰게 하려는 것.
 *
 * 슬로우모션: 모든 애니메이션을 Web Animations API 로 만들고 살아있는 애니메이션 집합에
 * playbackRate 를 일괄 적용한다. CSS @keyframes 로는 이게 안 된다 — 그래서 WAAPI 를 쓴다.
 */

// ─────────────────────────── 패 데이터 ───────────────────────────

export const NUM_CODES = [];
for (const s of ["m", "p", "s"]) for (let r = 1; r <= 9; r++) NUM_CODES.push(`${r}${s}`);
export const HONOR_CODES = ["1z", "2z", "3z", "4z", "5z", "6z", "7z"];
export const ALL_CODES = [...NUM_CODES, ...HONOR_CODES];

export const imgs = new Map();
for (const c of [...ALL_CODES, "0m", "0p", "0s"]) {
  const im = new Image();
  im.src = `/tiles/${c}.png`;
  imgs.set(c, im);
}

export const rnd = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** 손패처럼 보이는 13장 — 완전 무작위는 어색해서 대충 색이 뭉친 그림을 만든다 */
export function plausibleHand() {
  const h = [];
  const suit = pick(["m", "p", "s"]);
  const other = pick(["m", "p", "s"].filter((s) => s !== suit));
  for (let i = 0; i < 6; i++) h.push(`${clamp(Math.round(rnd(1, 9)), 1, 9)}${suit}`);
  for (let i = 0; i < 4; i++) h.push(`${clamp(Math.round(rnd(1, 9)), 1, 9)}${other}`);
  for (let i = 0; i < 3; i++) h.push(pick(HONOR_CODES));
  const ord = { m: 0, p: 1, s: 2, z: 3 };
  return h.sort((a, b) => ord[a[1]] - ord[b[1]] || +a[0] - +b[0]);
}

// ─────────────────────────── 무대 참조 ───────────────────────────

const $ = (id) => document.getElementById(id);

export const S = {
  stage: $("stage"),
  board: $("board"),
  fx: $("fx"),
  cv: $("cv"),
  hud: $("hud"),
  myhand: $("myhand"),
  oppTop: $("oppTop"),
  oppLeft: $("oppLeft"),
  oppRight: $("oppRight"),
  pondMe: $("pondMe"),
  pondTop: $("pondTop"),
  pondLeft: $("pondLeft"),
  pondRight: $("pondRight"),
  wallTop: $("wallTop"),
  augSlot: $("augSlot"),
  csBottom: $("csBottom"),
};

/** 화면 크기에 맞춰 무대를 축소한다. .stage 의 transform 은 여기서만 건드린다. */
export function fitStage() {
  const wrap = $("stageWrap");
  const k = Math.min((wrap.clientWidth - 28) / 1000, (wrap.clientHeight - 28) / 625, 1.35);
  S.stage.style.transform = `scale(${Math.max(0.3, k)})`;
}
addEventListener("resize", fitStage);

/** 요소의 무대 좌표계 사각형 (스케일 보정) */
export function sRect(el) {
  const st = S.stage.getBoundingClientRect();
  const k = st.width / 1000 || 1;
  const r = el.getBoundingClientRect();
  const o = { x: (r.left - st.left) / k, y: (r.top - st.top) / k, w: r.width / k, h: r.height / k };
  o.cx = o.x + o.w / 2;
  o.cy = o.y + o.h / 2;
  return o;
}

// ─────────────────────────── 타이밍 · 애니메이션 ───────────────────────────

let speed = 1;
const liveAnims = new Set();

/** WAAPI 래퍼 — 살아있는 애니메이션을 모아두고 슬로우모션을 일괄 적용한다 */
export function anim(el, kf, opt = {}) {
  const a = el.animate(kf, { easing: "ease", fill: "both", ...opt });
  a.playbackRate = speed;
  liveAnims.add(a);
  const drop = () => liveAnims.delete(a);
  a.finished.then(drop).catch(drop);
  return a;
}

export function setSpeed(s) {
  speed = s;
  for (const a of liveAnims) a.playbackRate = s;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms / speed));
/** 슬로우모션 배율이 반영된 setTimeout */
export const later = (fn, ms) => setTimeout(fn, ms / speed);

/** 취소 토큰 — 다른 연출로 넘어가면 진행 중 연출이 조용히 빠져나온다 */
let runToken = 0;
export const token = () => runToken;
export const alive = (tok) => tok === runToken;
export function bumpToken() {
  runToken++;
  return runToken;
}

// ─────────────────────────── 캔버스 입자 루프 ───────────────────────────

export const ctx = S.cv.getContext("2d");
export const drawHooks = new Set();

export function fitCanvas() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  S.cv.width = 1000 * dpr;
  S.cv.height = 625 * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

let lastT = 0;
function frame(t) {
  const raw = lastT ? t - lastT : 16.7;
  lastT = t;
  // dt 단위 = "60fps 프레임 1개". 물리 수치를 프레임 기준으로 잡을 수 있어 튜닝이 쉽다.
  const dt = Math.min(3, (raw / 16.7) * speed);
  ctx.clearRect(0, 0, 1000, 625);
  for (const h of [...drawHooks]) {
    try {
      if (h(dt, ctx) === false) drawHooks.delete(h);
    } catch (err) {
      console.error("[fx-lab] draw hook", err);
      drawHooks.delete(h);
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

export function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** 캔버스에 패 스프라이트 하나 — DOM 패를 물리로 넘길 때 쓴다 */
export function drawTile(c, sp) {
  c.save();
  c.globalAlpha = sp.a ?? 1;
  c.translate(sp.x, sp.y);
  c.rotate(sp.rot || 0);
  const w = sp.w;
  const h = sp.h;
  roundRect(c, -w / 2, -h / 2, w, h, 4);
  c.fillStyle = sp.back ? "#1f5138" : "#f8f5ec";
  c.fill();
  c.lineWidth = 1;
  c.strokeStyle = sp.back ? "#123122" : "#b9b09b";
  c.stroke();
  if (!sp.back && sp.img && sp.img.complete && sp.img.naturalWidth > 0) {
    c.drawImage(sp.img, -w / 2 + 1, -h / 2 + 1, w - 2, h - 2);
  }
  c.restore();
}

// ─────────────────────────── 오디오 (간단 신스) ───────────────────────────
// 게임 클라이언트도 합성음을 쓴다(src/sfx.ts) — 랩도 같은 방식으로 최소한만 만든다.

let ac = null;
function audio() {
  if (ac === null) {
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      ac = new Ctor();
    } catch {
      return null;
    }
  }
  if (ac.state === "suspended") void ac.resume();
  return ac;
}

let noiseBuf = null;
function noise(a) {
  if (noiseBuf === null) {
    noiseBuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/** 노이즈 버스트 — 충격·파괴·쉬익 계열 */
export function sNoise({ dur = 0.2, gain = 0.25, hp = 200, lp = 6000, sweep = 0 } = {}) {
  const a = audio();
  if (a === null) return;
  const src = a.createBufferSource();
  src.buffer = noise(a);
  const hpf = a.createBiquadFilter();
  hpf.type = "highpass";
  hpf.frequency.value = hp;
  const lpf = a.createBiquadFilter();
  lpf.type = "lowpass";
  lpf.frequency.value = lp;
  if (sweep !== 0) {
    lpf.frequency.linearRampToValueAtTime(clamp(lp + sweep, 120, 18000), a.currentTime + dur);
  }
  const g = a.createGain();
  g.gain.setValueAtTime(gain, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  src.connect(hpf).connect(lpf).connect(g).connect(a.destination);
  src.start();
  src.stop(a.currentTime + dur + 0.02);
}

/** 톤 — 삐/둥/차임 계열 */
export function sTone({ f = 440, f2 = null, dur = 0.18, gain = 0.14, type = "sine", delay = 0 } = {}) {
  const a = audio();
  if (a === null) return;
  const t0 = a.currentTime + delay;
  const o = a.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (f2 !== null) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}

let lastCoin = 0;
export const sfx = {
  impact() {
    sNoise({ dur: 0.3, gain: 0.3, hp: 60, lp: 2400, sweep: -1800 });
    sTone({ f: 90, f2: 40, dur: 0.28, gain: 0.3, type: "sine" });
  },
  clack(f = 900) {
    sNoise({ dur: 0.05, gain: 0.16, hp: 1200, lp: 9000 });
    sTone({ f, f2: f * 0.7, dur: 0.05, gain: 0.08, type: "triangle" });
  },
  whoosh(d = 0.4) {
    sNoise({ dur: d, gain: 0.16, hp: 300, lp: 1800, sweep: 3500 });
  },
  riser(d = 0.9) {
    sTone({ f: 120, f2: 1400, dur: d, gain: 0.1, type: "sawtooth" });
    sNoise({ dur: d, gain: 0.1, hp: 400, lp: 900, sweep: 6000 });
  },
  shatter() {
    sNoise({ dur: 0.5, gain: 0.22, hp: 2200, lp: 14000, sweep: -6000 });
    for (let i = 0; i < 7; i++) {
      sTone({ f: rnd(1600, 4200), dur: 0.09, gain: 0.05, type: "triangle", delay: i * 0.035 });
    }
  },
  ping(f = 1500) {
    sTone({ f, f2: f, dur: 0.13, gain: 0.09, type: "sine" });
  },
  coin() {
    const n = performance.now();
    if (n - lastCoin < 55) return;
    lastCoin = n;
    sTone({ f: rnd(1100, 2000), dur: 0.07, gain: 0.05, type: "square" });
  },
  drip() {
    sTone({ f: rnd(500, 800), f2: 180, dur: 0.14, gain: 0.09, type: "sine" });
  },
  beam() {
    sNoise({ dur: 1.1, gain: 0.3, hp: 80, lp: 5200, sweep: -3000 });
    sTone({ f: 60, f2: 45, dur: 1.1, gain: 0.28, type: "sawtooth" });
  },
  chime() {
    for (const [i, f] of [523, 659, 784, 1046].entries()) {
      sTone({ f, dur: 0.55, gain: 0.07, type: "sine", delay: i * 0.06 });
    }
  },
  tinnitus() {
    sTone({ f: 1400, f2: 1400, dur: 1.6, gain: 0.05, type: "sine" });
  },
  scratch(d = 0.85) {
    sNoise({ dur: d, gain: 0.08, hp: 2600, lp: 9000 });
  },
};

// ─────────────────────────── 무대 조립 ───────────────────────────

export function tileEl(code, opts = {}) {
  const d = document.createElement("div");
  d.className = "tf" + (opts.back === true ? " back" : "") + (opts.cls ? ` ${opts.cls}` : "");
  if (opts.back !== true) {
    const im = document.createElement("img");
    im.src = `/tiles/${code}.png`;
    im.draggable = false;
    d.appendChild(im);
    d.dataset.code = code;
  }
  return d;
}

function fill(el, n, fn) {
  el.textContent = "";
  for (let i = 0; i < n; i++) el.appendChild(fn(i));
}

const AUG_CARDS = [
  { glyph: "天", name: "천하무적", desc: "론을 한 번 무효로 만든다", cls: "" },
  { glyph: "眼", name: "투시", desc: "상대 손패를 본다", cls: "prism" },
];

export function buildStage() {
  const hand = plausibleHand();
  fill(S.myhand, 13, (i) => tileEl(hand[i]));
  S.myhand.appendChild(tileEl(pick(NUM_CODES), { cls: "drawn" }));

  for (const o of [S.oppTop, S.oppLeft, S.oppRight]) fill(o, 13, () => tileEl(null, { back: true }));
  for (const p of [S.pondMe, S.pondTop, S.pondLeft, S.pondRight]) {
    fill(p, 6 + ((Math.random() * 5) | 0), () => tileEl(pick(ALL_CODES)));
  }
  fill(S.wallTop, 14, () => tileEl(null, { back: true }));

  S.augSlot.textContent = "";
  for (const c of AUG_CARDS) {
    const card = document.createElement("div");
    card.className = `augcard ${c.cls}`;
    card.innerHTML =
      `<div class="ac-glyph">${c.glyph}</div>` +
      `<div class="ac-name">${c.name}</div>` +
      `<div class="ac-desc">${c.desc}</div>`;
    S.augSlot.appendChild(card);
  }
  S.csBottom.textContent = "25000";
}

/** 연출 사이의 완전 초기화 — 정리 버그를 원천 차단하려고 무대를 다시 세운다 */
export function resetStage() {
  bumpToken();
  for (const a of liveAnims) {
    try {
      a.cancel();
    } catch {
      /* 이미 끝난 애니메이션 */
    }
  }
  liveAnims.clear();
  drawHooks.clear();
  ctx.clearRect(0, 0, 1000, 625);
  S.fx.textContent = "";
  S.board.style.cssText = "";
  S.myhand.style.cssText = "";
  buildStage();
  fitStage();
}

// ─────────────────────────── 이펙트 공용 조각 ───────────────────────────

export function mk(cls, css, parent = S.fx) {
  const d = document.createElement("div");
  if (cls) d.className = cls;
  if (css) Object.assign(d.style, css);
  parent.appendChild(d);
  return d;
}

export function mkSvg(css, parent = S.fx) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 1000 625");
  Object.assign(s.style, {
    position: "absolute",
    left: "0",
    top: "0",
    width: "1000px",
    height: "625px",
    overflow: "visible",
    ...css,
  });
  parent.appendChild(s);
  return s;
}

export function svgEl(tag, attrs, parent) {
  const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (parent) parent.appendChild(e);
  return e;
}

/** 화면 흔들기 — composite:'add' 라서 보드에 걸린 다른 transform 을 덮지 않는다 */
export function shake(ms = 400, amp = 9) {
  const n = Math.max(5, Math.round(ms / 38));
  const kf = [];
  for (let i = 0; i <= n; i++) {
    const d = amp * Math.pow(1 - i / n, 1.6);
    const at = i === 0 || i === n ? "translate(0px, 0px)" : `translate(${rnd(-d, d)}px, ${rnd(-d, d)}px)`;
    kf.push({ transform: at });
  }
  return anim(S.board, kf, { duration: ms, easing: "linear", composite: "add" });
}

export function flash(ms = 220, color = "#fff", peak = 0.9) {
  const f = mk(null, {
    position: "absolute",
    inset: "0",
    background: color,
    opacity: "0",
    mixBlendMode: "screen",
  });
  const a = anim(f, [{ opacity: 0 }, { opacity: peak, offset: 0.12 }, { opacity: 0 }], { duration: ms });
  a.finished.then(() => f.remove()).catch(() => f.remove());
  return f;
}

/** 확장하는 충격 링 */
export function ring(cx, cy, r0, r1, ms, color = "rgba(255,215,106,.9)", w = 3) {
  const d = mk(null, {
    position: "absolute",
    left: `${cx}px`,
    top: `${cy}px`,
    width: `${r0 * 2}px`,
    height: `${r0 * 2}px`,
    margin: `${-r0}px 0 0 ${-r0}px`,
    borderRadius: "50%",
    border: `${w}px solid ${color}`,
    boxSizing: "border-box",
  });
  const a = anim(
    d,
    [
      { transform: "scale(1)", opacity: 0.95 },
      { transform: `scale(${r1 / r0})`, opacity: 0 },
    ],
    { duration: ms, easing: "cubic-bezier(.15,.7,.3,1)" },
  );
  a.finished.then(() => d.remove()).catch(() => d.remove());
  return d;
}

/** 컷인 배너 (제목 + 부제) */
export function banner(title, sub, ms = 1300) {
  const b = mk("band");
  const bg = mk("band-bg", null, b);
  const t = mk("band-txt", null, b);
  t.textContent = title;
  const s = mk("band-sub", null, b);
  s.textContent = sub || "";

  anim(
    bg,
    [
      { transform: "scaleY(0)", opacity: 0 },
      { transform: "scaleY(1)", opacity: 1, offset: 0.14 },
      { transform: "scaleY(1)", opacity: 1, offset: 0.8 },
      { transform: "scaleY(0)", opacity: 0 },
    ],
    { duration: ms },
  );
  anim(
    t,
    [
      { transform: "translateX(-26px)", letterSpacing: "44px", opacity: 0 },
      { transform: "translateX(0)", letterSpacing: "14px", opacity: 1, offset: 0.28 },
      { transform: "translateX(0)", letterSpacing: "14px", opacity: 1, offset: 0.78 },
      { transform: "translateX(18px)", opacity: 0 },
    ],
    { duration: ms, easing: "cubic-bezier(.15,.9,.2,1)" },
  );
  anim(s, [{ opacity: 0 }, { opacity: 1, offset: 0.35 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], {
    duration: ms,
  });

  const sw = mk(
    null,
    {
      position: "absolute",
      inset: "0",
      background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,.5) 50%, transparent 60%)",
    },
    b,
  );
  anim(sw, [{ transform: "translateX(-100%)" }, { transform: "translateX(100%)" }], {
    duration: ms * 0.5,
    delay: ms * 0.16,
    easing: "cubic-bezier(.3,0,.7,1)",
  });

  const a = anim(b, [{ opacity: 1 }, { opacity: 1, offset: 0.9 }, { opacity: 0 }], { duration: ms });
  a.finished.then(() => b.remove()).catch(() => b.remove());
  return b;
}

/** 화면 전체 그레이딩 베일 — backdrop-filter 로 아래 보드를 실제로 필터링한다 */
export function veil(filterCss, ms = 400, maskCss = null) {
  const v = mk(null, {
    position: "absolute",
    inset: "0",
    backdropFilter: filterCss,
    webkitBackdropFilter: filterCss,
    opacity: "0",
  });
  if (maskCss) {
    v.style.maskImage = maskCss;
    v.style.webkitMaskImage = maskCss;
  }
  anim(v, [{ opacity: 0 }, { opacity: 1 }], { duration: ms });
  return v;
}

/** 내 손패 타일 목록 */
export const handTiles = () => [...S.myhand.querySelectorAll(".tf")];

/** 원호 path — 좌석 순서 화살표용 */
export function arcPath(cx, cy, r, a0, a1) {
  const p = (a) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}
