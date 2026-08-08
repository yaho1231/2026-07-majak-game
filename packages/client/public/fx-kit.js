/* 이능마작 증강 연출 랩 — 연출 키트
 *
 * 4차 배치(남은 증강 69종)를 위한 공용 조각 모음. 앞선 배치들에서 같은 코드를 반복해
 * 쓰고 있던 것들(상태 칩·큰 글자·미터·연결선·낙관·번쩍임·입자)을 한 곳에 모았다.
 *
 * 목적은 줄 수 줄이기가 아니라 **일관성**이다. 69종이 제각각 다른 방식으로 상태를 표시하면
 * 연출이 아니라 소음이 된다 — 표시 방법은 공유하고, 각 연출은 자기만의 '한 장면'에 집중한다.
 *
 * fx-core 의 것들도 여기서 재수출한다. 연출 모듈이 import 를 한 군데서만 가져오게 하려는 것.
 */

export {
  ALL_CODES,
  EASE,
  EASE_IMPACT,
  EASE_QUART,
  HONOR_CODES,
  NUM_CODES,
  S,
  alive,
  anim,
  arcPath,
  banner,
  buildStage,
  clamp,
  drawHooks,
  drawTile,
  flash,
  handTiles,
  imgs,
  later,
  mk,
  mkSvg,
  pick,
  plausibleHand,
  ring,
  rnd,
  sNoise,
  sRect,
  sTone,
  sfx,
  shake,
  sleep,
  svgEl,
  tileEl,
  veil,
} from "/fx-core.js?v=9";

import {
  EASE,
  S,
  alive,
  anim,
  clamp,
  drawHooks,
  later,
  mk,
  mkSvg,
  rnd,
  sRect,
  sTone,
  svgEl,
  tileEl,
  token,
} from "/fx-core.js?v=9";

/* ─────────────── 색 ─────────────── */

export const C = {
  brass: "#c2a068",
  brassDim: "#9a7b42",
  ink: "#ece4d2",
  sage: "#a8bcaf",
  sageDim: "#7b9084",
  aug: "#7c5cff",
  augLite: "#b6a3ff",
  red: "#e0555f",
  redLite: "#ffd0d4",
  green: "#7ed68c",
  cyan: "#6ee1ff",
  amber: "#e0a84a",
};

/* ─────────────── 상태 표시 ─────────────── */

/**
 * 좌상단 상태 칩. 중앙·하단은 상대 손패(x 293~707)·패산(x 339~661)·내 손패(x 151~848)가
 * 차지해서 못 쓴다 — 3차 배치에서 칩이 패산을 덮는 걸 겪고 자리를 여기로 굳혔다.
 */
export function chip(text, col = C.brass) {
  const el = mk(null, {
    position: "absolute",
    left: "18px",
    top: "38px",
    maxWidth: "262px",
    padding: "6px 14px",
    borderRadius: "999px",
    background: "rgba(14,23,18,.92)",
    border: `1px solid ${col}`,
    font: "800 12px/1 ui-monospace, monospace",
    letterSpacing: "2px",
    color: col,
    whiteSpace: "nowrap",
  });
  el.textContent = text;
  anim(el, [{ opacity: 0, transform: "translateX(-12px)" }, { opacity: 1, transform: "translateX(0)" }], {
    duration: 240,
    easing: EASE,
  });
  return el;
}

/** 큰 한자/기호 한 방 — 판 중앙에 의미를 새긴다 */
export function bigGlyph(text, { x = 500, y = 300, col = C.brass, size = 92, ms = 1400 } = {}) {
  const el = mk(null, {
    position: "absolute",
    left: `${x}px`,
    top: `${y}px`,
    transform: "translate(-50%,-50%)",
    font: `900 ${size}px/1 serif`,
    color: col,
    textShadow: `0 0 34px ${col}`,
    whiteSpace: "nowrap",
    pointerEvents: "none",
  });
  el.textContent = text;
  anim(el, [
    { opacity: 0, transform: "translate(-50%,-50%) scale(2.2)", filter: "blur(8px)" },
    { opacity: 1, transform: "translate(-50%,-50%) scale(1)", filter: "blur(0px)", offset: 0.3 },
    { opacity: 1, transform: "translate(-50%,-50%) scale(1)", offset: 0.75 },
    { opacity: 0, transform: "translate(-50%,-50%) scale(1.15)" },
  ], { duration: ms, easing: EASE }).finished.then(() => el.remove()).catch(() => el.remove());
  return el;
}

/** 가로 미터 — 승수·체력·잔여 횟수처럼 '얼마나 남았나'를 보여줄 때 */
export function meter(x, y, w, text, col = C.brass) {
  const box = mk(null, { position: "absolute", left: `${x}px`, top: `${y}px`, width: `${w}px` });
  const lb = mk(null, {
    position: "absolute", left: "0", top: "-16px",
    font: "700 10px/1 ui-monospace, monospace", letterSpacing: "2px", color: col, whiteSpace: "nowrap",
  }, box);
  lb.textContent = text;
  const track = mk(null, {
    position: "absolute", left: "0", top: "0", width: "100%", height: "9px",
    borderRadius: "5px", background: "rgba(236,228,210,.08)",
    border: "1px solid rgba(236,228,210,.16)", overflow: "hidden",
  }, box);
  const fill = mk(null, {
    position: "absolute", left: "0", top: "0", height: "100%", width: "0%",
    background: `linear-gradient(90deg, ${col}66, ${col})`, boxShadow: `0 0 10px ${col}`,
  }, track);
  anim(box, [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], {
    duration: 240, easing: EASE,
  });
  return {
    el: box,
    label: lb,
    set(p, ms = 420) {
      anim(fill, [{ width: fill.style.width || "0%" }, { width: `${clamp(p, 0, 1) * 100}%` }], {
        duration: ms, easing: EASE,
      });
      fill.style.width = `${clamp(p, 0, 1) * 100}%`;
    },
    tint(c) {
      fill.style.background = `linear-gradient(90deg, ${c}66, ${c})`;
      fill.style.boxShadow = `0 0 10px ${c}`;
      lb.style.color = c;
    },
  };
}

/** 숫자 롤업 — 점수·본장·판수 */
export function countUp(el, from, to, ms = 1000, fmt = (n) => String(Math.round(n))) {
  // 연출이 바뀌면 즉시 멈춘다. 이 검사가 없으면 rAF 루프가 살아남아 다음 연출의
  // 초기화된 점수를 계속 덮어쓴다(실제로 카르마 → 다른 연출로 넘어갈 때 겪었다).
  const mine = token();
  const t0 = performance.now();
  const tick = () => {
    if (mine !== token()) return;
    const p = clamp((performance.now() - t0) / ms, 0, 1);
    el.textContent = fmt(from + (to - from) * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(tick);
  };
  tick();
}

/* ─────────────── 연결 · 지시 ─────────────── */

/** 두 지점을 잇는 곡선 — 무엇이 무엇에게 가는지 */
export function linkTo(fromR, toR, { col = C.brass, bow = 70, ms = 340, dash = null, width = 2 } = {}) {
  const sv = mkSvg({ zIndex: "6" });
  const p = svgEl("path", {
    d: `M${fromR.cx} ${fromR.cy} Q${(fromR.cx + toR.cx) / 2 + bow} ${(fromR.cy + toR.cy) / 2} ${toR.cx} ${toR.cy}`,
    fill: "none", stroke: col, "stroke-width": width, "stroke-linecap": "round",
  }, sv);
  const L = p.getTotalLength();
  if (dash) {
    p.setAttribute("stroke-dasharray", dash);
    anim(p, [{ strokeDashoffset: 0 }, { strokeDashoffset: -200 }], {
      duration: 1600, iterations: Infinity, easing: "linear",
    });
    anim(sv, [{ opacity: 0 }, { opacity: 1 }], { duration: ms });
  } else {
    p.setAttribute("stroke-dasharray", `${L}`);
    p.setAttribute("stroke-dashoffset", `${L}`);
    anim(p, [{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: ms, easing: EASE });
  }
  return { sv, path: p };
}

/** 좌석 위 배지 — 누구에게 일어난 일인지 */
export function seatMark(el, text, col = C.brass, dy = 0) {
  const r = sRect(el);
  const b = mk(null, {
    position: "absolute",
    left: `${clamp(r.cx - 52, 6, 890)}px`,
    top: `${r.cy + dy}px`,
    padding: "3px 9px",
    borderRadius: "5px",
    background: "rgba(14,23,18,.92)",
    border: `1px solid ${col}`,
    font: "800 11px/1 ui-monospace, monospace",
    letterSpacing: "2px",
    color: col,
    whiteSpace: "nowrap",
  });
  b.textContent = text;
  anim(b, [{ opacity: 0, scale: "0.7" }, { opacity: 1, scale: "1" }], { duration: 240, easing: EASE });
  return b;
}

/** 낙관 — 규칙이 '찍히는' 순간 */
export function stamp(text, { x = 500, y = 300, col = C.red, size = 76, rot = -8 } = {}) {
  const el = mk(null, {
    position: "absolute",
    left: `${x - size / 2}px`,
    top: `${y - size / 2}px`,
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: "8px",
    border: `4px solid ${col}`,
    color: col,
    display: "grid",
    placeItems: "center",
    font: `900 ${Math.round(size * 0.42)}px/1 serif`,
    background: "rgba(20,8,10,.35)",
  });
  el.textContent = text;
  anim(el, [
    { transform: `rotate(${rot}deg) scale(4)`, opacity: 0 },
    { transform: `rotate(${rot}deg) scale(1)`, opacity: 1, offset: 0.55 },
    { transform: `rotate(${rot}deg) scale(1.12)`, offset: 0.72 },
    { transform: `rotate(${rot}deg) scale(1)` },
  ], { duration: 420, easing: "cubic-bezier(.6,0,.2,1)" });
  return el;
}

/* ─────────────── 패 강조 ─────────────── */

/** 패 묶음에 테두리 + 글로우. 원래 스타일로 되돌리는 함수를 반환한다 */
export function glowTiles(els, col = C.brass, { lift = 0, ms = 260, stagger = 30 } = {}) {
  for (const [i, el] of els.entries()) {
    later(() => {
      el.style.outline = `1.5px solid ${col}`;
      el.style.outlineOffset = "1px";
      el.style.boxShadow = `0 0 16px ${col}`;
      if (lift) {
        anim(el, [{ transform: "translateY(0)" }, { transform: `translateY(${-lift}px)` }], {
          duration: ms, easing: EASE,
        });
      }
      sTone({ f: 1000 + i * 60, dur: 0.04, gain: 0.04, type: "sine" });
    }, i * stagger);
  }
  return () => {
    for (const el of els) {
      el.style.outline = "";
      el.style.boxShadow = "";
      if (lift) anim(el, [{ transform: `translateY(${-lift}px)` }, { transform: "translateY(0)" }], { duration: ms, easing: EASE });
    }
  };
}

/** 패 이미지 교체 + 반짝 */
export function setTile(el, code, { ms = 320, col = C.brass } = {}) {
  el.dataset.code = code;
  const im = el.querySelector("img");
  if (im) im.src = `/tiles/${code}.png`;
  anim(el, [
    { transform: "scale(1)", filter: "brightness(1)" },
    { transform: "scale(1.18)", filter: "brightness(1.9)", offset: 0.4 },
    { transform: "scale(1)", filter: "brightness(1)" },
  ], { duration: ms, easing: EASE });
  return el;
}

/** 패 하나를 다른 자리로 날린다 (베지에) */
export function flyTile(code, fromR, toR, { bow = 0, ms = 500, spin = 0, back = false, z = 14 } = {}) {
  const t = back ? tileEl(null, { back: true }) : tileEl(code);
  Object.assign(t.style, { position: "absolute", left: `${fromR.x}px`, top: `${fromR.y}px`, zIndex: String(z) });
  t.style.setProperty("--tile-w", `${fromR.w}px`);
  t.style.setProperty("--tile-h", `${fromR.h}px`);
  S.fx.appendChild(t);
  const steps = [];
  for (let k = 0; k <= 9; k++) {
    const p = k / 9;
    const u = 1 - p;
    const mx = (fromR.cx + toR.cx) / 2 + bow;
    const my = (fromR.cy + toR.cy) / 2;
    const x = u * u * fromR.cx + 2 * u * p * mx + p * p * toR.cx;
    const y = u * u * fromR.cy + 2 * u * p * my + p * p * toR.cy;
    steps.push({
      transform: `translate(${(x - fromR.cx).toFixed(1)}px, ${(y - fromR.cy).toFixed(1)}px) scale(${(1 + (toR.w / fromR.w - 1) * p).toFixed(2)}) rotate(${(spin * p).toFixed(0)}deg)`,
      offset: p,
    });
  }
  anim(t, steps, { duration: ms, easing: EASE });
  later(() => t.remove(), ms);
  return t;
}

/* ─────────────── 도형 · 결계 ─────────────── */

/** 육각 결계 — 방어 계열 공용 */
export function hexShield(x, y, r, { col = C.cyan, ms = 700, ring = true } = {}) {
  const sv = mkSvg({ zIndex: "5" });
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    pts.push(`${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`);
  }
  const poly = svgEl("polygon", {
    points: pts.join(" "), fill: `${col}18`, stroke: col, "stroke-width": 2.5,
  }, sv);
  poly.style.filter = `drop-shadow(0 0 18px ${col})`;
  sv.style.transformOrigin = `${x}px ${y}px`;
  anim(sv, [
    { opacity: 0, transform: "scale(1.6) rotate(-20deg)" },
    { opacity: 1, transform: "scale(1) rotate(0deg)" },
  ], { duration: ms, easing: EASE });
  if (ring) {
    const inner = svgEl("polygon", {
      points: pts.join(" "), fill: "none", stroke: col, "stroke-width": 1, opacity: 0.5,
    }, sv);
    inner.style.transformOrigin = `${x}px ${y}px`;
    anim(inner, [{ transform: "scale(.82)" }, { transform: "scale(.9)" }, { transform: "scale(.82)" }], {
      duration: 1800, iterations: Infinity, easing: "ease-in-out",
    });
  }
  return { sv, poly };
}

/** 회전 파선 링 — '작동 중' 표시 */
export function orbitRing(cx, cy, r, { col = C.brass, ms = 4000, dash = "12 9", width = 2 } = {}) {
  const sv = mkSvg({ zIndex: "2" });
  const c = svgEl("circle", {
    cx, cy, r, fill: "none", stroke: col, "stroke-width": width, "stroke-dasharray": dash,
  }, sv);
  c.style.transformOrigin = `${cx}px ${cy}px`;
  anim(sv, [{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
  anim(c, [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], {
    duration: ms, iterations: Infinity, easing: "linear",
  });
  return sv;
}

/* ─────────────── 입자 ─────────────── */

/** 한 점에서 터지는 불꽃 */
export function sparkBurst(x, y, { n = 18, col = "236,228,210", spread = 110, ms = 620 } = {}) {
  for (let i = 0; i < n; i++) {
    const a = rnd(0, 6.283);
    const d = rnd(spread * 0.35, spread);
    const s = mk(null, {
      position: "absolute", left: `${x}px`, top: `${y}px`,
      width: "3px", height: "3px", borderRadius: "50%",
      background: `rgb(${col})`, boxShadow: `0 0 8px rgb(${col})`,
    });
    anim(s, [
      { transform: "translate(-50%,-50%) scale(1)", opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(0)`, opacity: 0 },
    ], { duration: rnd(ms * 0.6, ms) }).finished.then(() => s.remove()).catch(() => s.remove());
  }
}

/** 위에서 내려오는 입자 (재·꽃잎·눈·돈) — draw 훅을 등록하고 정지 함수를 반환 */
export function fallParticles({ n = 60, col = "220,205,180", size = [1, 3], vy = [0.4, 1.4], life = 220, shape = "rect" } = {}) {
  const ps = [];
  for (let i = 0; i < n; i++) {
    ps.push({
      x: rnd(0, 1000), y: rnd(-300, 625),
      s: rnd(size[0], size[1]), vy: rnd(vy[0], vy[1]),
      ph: rnd(0, 6.3), rot: rnd(0, 6.3), vr: rnd(-0.04, 0.04),
    });
  }
  let t = 0;
  const hook = (dt, c) => {
    t += dt;
    for (const p of ps) {
      p.y += p.vy * dt;
      p.x += Math.sin(t * 0.02 + p.ph) * 0.4 * dt;
      p.rot += p.vr * dt;
      if (p.y > 640) {
        p.y = -10;
        p.x = rnd(0, 1000);
      }
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      c.fillStyle = `rgba(${col},${0.2 + p.s * 0.12})`;
      if (shape === "ellipse") {
        c.beginPath();
        c.ellipse(0, 0, p.s * 2, p.s, 0, 0, 6.284);
        c.fill();
      } else {
        c.fillRect(0, 0, p.s, p.s);
      }
      c.restore();
    }
    return t < life;
  };
  drawHooks.add(hook);
  return () => drawHooks.delete(hook);
}

/** 캔버스 세로 광주 — 빔·기둥 */
export function beamColumn(x, { w = 90, ms = 70, col = "255,238,196", top = 0, bottom = 625 } = {}) {
  let t = 0;
  const hook = (dt, c) => {
    t += dt;
    const p = t / ms;
    const width = w * (p < 0.12 ? p / 0.12 : 1 - Math.pow(clamp((p - 0.12) / 0.88, 0, 1), 2));
    const ww = Math.max(0, width) * rnd(0.95, 1.05);
    c.save();
    c.globalCompositeOperation = "lighter";
    const g = c.createLinearGradient(x - ww, 0, x + ww, 0);
    g.addColorStop(0, `rgba(${col},0)`);
    g.addColorStop(0.5, `rgba(${col},.85)`);
    g.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = g;
    c.fillRect(x - ww, top, ww * 2, bottom - top);
    c.restore();
    return t < ms;
  };
  drawHooks.add(hook);
}

/** DOM 요소를 조각내 흩뿌린다 (삼각 팬) */
export function shatterEl(el, { n = 12, dist = [90, 220], ms = [600, 900] } = {}) {
  const r = sRect(el);
  const cx = r.w / 2;
  const cy = r.h / 2;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.283 - 1.57;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const t = Math.min(
      Math.abs(dx) < 1e-6 ? 1e9 : (dx > 0 ? r.w + 30 - cx : -cx - 30) / dx,
      Math.abs(dy) < 1e-6 ? 1e9 : (dy > 0 ? r.h + 30 - cy : -cy - 30) / dy,
    );
    pts.push([cx + dx * t, cy + dy * t]);
  }
  el.style.visibility = "hidden";
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const sh = el.cloneNode(true);
    sh.style.visibility = "";
    Object.assign(sh.style, {
      position: "absolute", left: `${r.x}px`, top: `${r.y}px`,
      width: `${r.w}px`, height: `${r.h}px`, margin: "0", zIndex: "15",
      clipPath: `polygon(${cx}px ${cy}px, ${a[0]}px ${a[1]}px, ${b[0]}px ${b[1]}px)`,
    });
    S.fx.appendChild(sh);
    const ang = ((i + 0.5) / n) * 6.283 - 1.57;
    const d = rnd(dist[0], dist[1]);
    anim(sh, [
      { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
      { transform: `translate(${Math.cos(ang) * d}px, ${Math.sin(ang) * d - 30}px) rotate(${rnd(-70, 70)}deg) scale(.7)`, opacity: 0 },
    ], { duration: rnd(ms[0], ms[1]), easing: "cubic-bezier(.2,.5,.3,1)" })
      .finished.then(() => sh.remove()).catch(() => sh.remove());
  }
}

/** 여러 요소를 한 번에 페이드아웃 */
export const fade = (els, ms = 420) => {
  for (const e of els) {
    if (!e) continue;
    const node = e.el ?? e.sv ?? e;
    if (node && node.animate) anim(node, [{ opacity: 1 }, { opacity: 0 }], { duration: ms });
  }
};

/** 상대 세 좌석 */
export const opps = () => [S.oppTop, S.oppLeft, S.oppRight];

/** 네 바닥 */
export const ponds = () => [S.pondMe, S.pondTop, S.pondLeft, S.pondRight];
