/* MAJAK 증강 연출 랩 — 4차 배치 C · 화료형 14종
 *
 * 화료형 증강은 전부 "원래 성립하지 않는 조합을 성립시킨다"이다. 그래서 공통 문장은
 * **성립하지 않던 것 → 규칙이 휘는 순간 → 묶임(成)** 세 박자다.
 *
 * 중요한 건 첫 박자다. 곧바로 묶어버리면 그냥 예쁜 테두리지만, 안 되는 걸 먼저 보여주면
 * 같은 테두리가 '규칙이 바뀌었다'가 된다. 그래서 여기 14종은 전부 X 를 먼저 보여준다.
 */

import {
  C, EASE, EASE_IMPACT, HONOR_CODES, NUM_CODES, S, alive, anim, banner, bigGlyph, chip, clamp,
  countUp, drawHooks, fade, fallParticles, flash, flyTile, glowTiles, handTiles, later, linkTo,
  meter, mk, mkSvg, pick, ponds, ring, rnd, sRect, sTone, seatMark, setTile, sfx, shake, sleep,
  sparkBurst, stamp, svgEl, tileEl, veil,
} from "/fx-kit.js?v=9";
import { def } from "/fx-registry.js?v=9";

const FAM = "화료형 · 성립";

/** 여러 패 아래에 브래킷을 그어 '한 몸통'으로 묶는다 */
function bindSet(els, { col = C.brass, label = "", ms = 420 } = {}) {
  const rs = els.map(sRect);
  const x0 = Math.min(...rs.map((r) => r.x)) - 5;
  const x1 = Math.max(...rs.map((r) => r.x + r.w)) + 5;
  const y = Math.max(...rs.map((r) => r.y + r.h)) + 7;
  const sv = mkSvg({ zIndex: "6" });
  const p = svgEl("path", {
    d: `M${x0} ${y - 9} L${x0} ${y} L${x1} ${y} L${x1} ${y - 9}`,
    fill: "none", stroke: col, "stroke-width": 2.5, "stroke-linecap": "round", "stroke-linejoin": "round",
  }, sv);
  const L = p.getTotalLength();
  p.setAttribute("stroke-dasharray", `${L}`);
  p.setAttribute("stroke-dashoffset", `${L}`);
  anim(p, [{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: ms, easing: EASE });
  if (label) {
    const t = mk(null, {
      position: "absolute", left: `${(x0 + x1) / 2}px`, top: `${y + 6}px`,
      transform: "translateX(-50%)", font: "800 11px/1 ui-monospace, monospace",
      letterSpacing: "2px", color: col, whiteSpace: "nowrap",
    });
    t.textContent = label;
    anim(t, [{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: ms * 0.6 });
  }
  for (const el of els) {
    el.style.outline = `1.5px solid ${col}`;
    el.style.outlineOffset = "1px";
  }
  return sv;
}

/** '안 된다' 표시 — 첫 박자 전용 */
function denyMark(els, ms = 700) {
  const marks = [];
  for (const el of els) {
    const r = sRect(el);
    const x = mk(null, {
      position: "absolute", left: `${r.cx}px`, top: `${r.cy}px`,
      transform: "translate(-50%,-50%)", font: "900 30px/1 ui-monospace, monospace",
      color: C.red, textShadow: `0 0 12px ${C.red}`,
    });
    x.textContent = "✕";
    marks.push(x);
    anim(x, [{ opacity: 0, transform: "translate(-50%,-50%) scale(2)" }, { opacity: 1, transform: "translate(-50%,-50%) scale(1)" }], {
      duration: 220, easing: EASE,
    });
    el.style.filter = "saturate(.4) brightness(.7)";
  }
  later(() => {
    for (const [i, x] of marks.entries()) {
      anim(x, [{ opacity: 1, scale: "1" }, { opacity: 0, scale: "1.5" }], { duration: 260, delay: i * 40 });
      later(() => x.remove(), 300 + i * 40);
    }
    for (const el of els) el.style.filter = "";
  }, ms);
  return marks;
}

/** 손패 앞쪽 n장을 특정 코드로 세팅하고 그 엘리먼트를 돌려준다 */
function stage(codes, from = 0) {
  const tiles = handTiles();
  const out = [];
  for (const [i, c] of codes.entries()) {
    const el = tiles[from + i];
    if (!el) continue;
    setTile(el, c, { ms: 1 });
    out.push(el);
  }
  return out;
}

/** 규칙이 휘는 순간 — 공통 임팩트 */
function bendRule(x = 500, y = 300, col = C.brass) {
  sfx.impact();
  flash(170, "#dcc79a", 0.32);
  shake(340, 8);
  ring(x, y, 16, 260, 640, `${col}cc`, 3);
}

/* ══════════════════ 비대칭 치또이 ══════════════════ */

def({
  id: "async_chiitoi", name: "비대칭 치또이", tier: "prism", fam: FAM,
  tag: "무늬가 달라도 숫자가 같으면 한 쌍이다",
  tech: "쌍을 잇는 <b>아치 7개</b>가 동시에 그어진다. 치또이는 '7쌍'이라는 <b>수</b>가 정체성이라 " +
        "하나씩 보여주면 안 된다 — 한꺼번에 그어져야 '치또이가 섰다'로 읽힌다.",
  async run(tok) {
    const dark = veil("brightness(.55)", 320);
    const h = chip("무늬가 다르다 — 원래는 불성립", C.red);
    const pairs = [["1m", "1p"], ["3p", "3s"], ["5s", "5m"], ["7m", "7p"], ["9p", "9s"], ["2s", "2m"], ["4m", "4p"]];
    const els = stage(pairs.flat());
    denyMark([els[0], els[1]], 760);
    sfx.riser(0.8);
    await sleep(880);
    if (!alive(tok)) return;

    bendRule(500, 430);
    h.textContent = "숫자만 같으면 쌍 · 7쌍 성립";
    h.style.borderColor = C.brass;
    h.style.color = C.brass;
    const svs = [];
    const sv = mkSvg({ zIndex: "6" });
    svs.push(sv);
    for (let i = 0; i < 7; i++) {
      const a = sRect(els[i * 2]);
      const b = sRect(els[i * 2 + 1]);
      const p = svgEl("path", {
        d: `M${a.cx} ${a.y - 4} Q${(a.cx + b.cx) / 2} ${a.y - 34} ${b.cx} ${b.y - 4}`,
        fill: "none", stroke: C.brass, "stroke-width": 2, "stroke-linecap": "round",
      }, sv);
      const L = p.getTotalLength();
      p.setAttribute("stroke-dasharray", `${L}`);
      p.setAttribute("stroke-dashoffset", `${L}`);
      anim(p, [{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 460, easing: EASE });
      for (const el of [els[i * 2], els[i * 2 + 1]]) {
        el.style.outline = `1.5px solid ${C.brass}`;
        el.style.outlineOffset = "1px";
      }
    }
    sfx.chime();
    bigGlyph("七対", { y: 270, col: C.brass, size: 68, ms: 1400 });
    banner("비대칭 치또이", "7 PAIRS", 1600);
    await sleep(1700);
    for (const el of els) el.style.outline = "";
    fade([h, dark, ...svs]);
    await sleep(520);
  },
});

/* ══════════════════ 복수자 ══════════════════ */

def({
  id: "avenger", name: "복수자", tier: "silver", fam: FAM,
  tag: "방총당한 상대가 '원수'가 되고 그에게만 규칙이 풀린다",
  tech: "대상이 <b>사람</b>인 증강이라 좌석에 낙인을 찍고 <b>그 사람의 바닥만</b> 붉게 만든다. " +
        "규칙 완화(후리텐·무역 무시)를 문구가 아니라 <b>그 사람 쪽만 색이 다른 것</b>으로 보여준다.",
  async run(tok) {
    const dark = veil("brightness(.48) saturate(.85)", 340);
    const h = chip("방총 — 원수 지정", C.red);
    const foe = S.oppLeft;
    const fr = sRect(foe);
    sfx.impact();
    shake(400, 9);
    stamp("仇", { x: fr.cx + 90, y: fr.cy, col: C.red, size: 72 });
    const m = seatMark(foe, "원 수", C.red, -96);
    for (const [i, o] of [S.oppTop, S.oppRight].entries()) {
      later(() => alive(tok) && seatMark(o, "공개됨", C.sageDim, o === S.oppTop ? 76 : 0), 300 + i * 130);
    }
    await sleep(820);
    if (!alive(tok)) return;

    // 원수의 바닥만 사냥터가 된다
    h.textContent = "원수 바닥 — 후리텐·무역 무시";
    const river = [...S.pondLeft.querySelectorAll(".tf")];
    for (const [i, el] of river.entries()) {
      later(() => {
        if (!alive(tok)) return;
        el.style.outline = `1.5px solid ${C.red}`;
        el.style.outlineOffset = "1px";
        el.style.boxShadow = `0 0 14px ${C.red}`;
        const r = sRect(el);
        ring(r.cx, r.cy, 6, 46, 340, "rgba(224,85,95,.8)", 1.5);
        sTone({ f: 700 + i * 60, dur: 0.05, gain: 0.05, type: "sine" });
      }, i * 90);
    }
    await sleep(river.length * 90 + 400);
    if (!alive(tok)) return;
    sfx.impact();
    flash(150, "#e0555f", 0.24);
    bigGlyph("復讐", { y: 260, col: C.red, size: 66, ms: 1400 });
    banner("복 수 자", "AVENGER", 1600);
    await sleep(1700);
    for (const el of river) { el.style.outline = ""; el.style.boxShadow = ""; }
    fade([h, dark, m]);
    await sleep(520);
  },
});

/* ══════════════════ 바닥의 족보 ══════════════════ */

def({
  id: "bottom_yaku", name: "바닥의 족보", tier: "prism", fam: FAM,
  tag: "버림패가 역을 대신 만들어 준다",
  tech: "역이 <b>손패가 아니라 바닥에서</b> 나온다는 게 전부다. 그래서 시선을 손패에서 " +
        "떼어 바닥으로 옮기고, 역 이름이 <b>바닥에서 떠오른다</b> — 위치가 곧 설명이다.",
  async run(tok) {
    const dark = veil("brightness(.5)", 330);
    const h = chip("화료 — 손패에 역 없음", C.red);
    const hand = handTiles();
    glowTiles(hand.slice(0, 5), C.sageDim, { stagger: 20 });
    await sleep(560);
    if (!alive(tok)) return;

    // 시선이 바닥으로
    h.textContent = "바닥을 본다";
    const river = [...S.pondMe.querySelectorAll(".tf")];
    const pr = sRect(S.pondMe);
    anim(S.myhand, [{ filter: "brightness(1)" }, { filter: "brightness(.55)" }], { duration: 420 });
    sfx.riser(0.9);
    // 1~9 가 순서대로 켜진다
    for (const [i, el] of river.entries()) {
      later(() => {
        if (!alive(tok)) return;
        setTile(el, `${(i % 9) + 1}p`, { ms: 180 });
        el.style.outline = `1.5px solid ${C.brass}`;
        el.style.outlineOffset = "1px";
        sTone({ f: 900 + i * 90, dur: 0.05, gain: 0.05, type: "sine" });
      }, i * 110);
    }
    await sleep(river.length * 110 + 380);
    if (!alive(tok)) return;

    bendRule(pr.cx, pr.cy);
    h.textContent = "역류 통관 2판 — 바닥이 역이 된다";
    const t = mk(null, {
      position: "absolute", left: `${pr.cx}px`, top: `${pr.y - 6}px`,
      transform: "translateX(-50%)", padding: "6px 16px", borderRadius: "999px",
      background: "rgba(14,23,18,.94)", border: `1px solid ${C.brass}`,
      font: "800 13px/1 ui-monospace, monospace", letterSpacing: "2px", color: C.brass, whiteSpace: "nowrap",
    });
    t.textContent = "역류 통관 · 2판";
    anim(t, [
      { opacity: 0, transform: "translateX(-50%) translateY(24px) scale(.7)" },
      { opacity: 1, transform: "translateX(-50%) translateY(-14px) scale(1)" },
    ], { duration: 620, easing: EASE });
    banner("바닥의 족보", "RIVER YAKU", 1600);
    await sleep(1800);
    for (const el of river) el.style.outline = "";
    fade([h, dark, t]);
    await sleep(520);
  },
});

/* ══════════════════ 무너진 국경 ══════════════════ */

def({
  id: "broken_border", name: "무너진 국경", tier: "prism", fam: FAM,
  tag: "슌쯔의 무늬 제한이 사라진다 — 2만·3통·4삭도 몸통",
  tech: "'경계가 없어진다'는 <b>경계를 먼저 세워야</b> 성립한다. 만·통·삭 사이에 벽을 " +
        "긋고 그 벽이 <b>무너져 내리는</b> 것을 보여준 뒤 세 무늬가 한 줄로 붙는다.",
  async run(tok) {
    const dark = veil("brightness(.52)", 330);
    const h = chip("무늬가 다르다 — 슌쯔 불성립", C.red);
    const els = stage(["2m", "3p", "4s"]);
    denyMark(els, 760);
    // 무늬 사이 벽
    const sv = mkSvg({ zIndex: "6" });
    const walls = [];
    for (let i = 0; i < 2; i++) {
      const a = sRect(els[i]);
      const b = sRect(els[i + 1]);
      const x = (a.x + a.w + b.x) / 2;
      const w = svgEl("line", {
        x1: x, y1: a.y - 16, x2: x, y2: a.y + a.h + 16,
        stroke: C.red, "stroke-width": 4, "stroke-linecap": "round",
      }, sv);
      walls.push(w);
      anim(w, [{ opacity: 0, transform: "scaleY(0)" }, { opacity: 1, transform: "scaleY(1)" }], {
        duration: 300, delay: i * 110, easing: EASE,
      });
    }
    sfx.riser(0.8);
    await sleep(900);
    if (!alive(tok)) return;

    // 벽이 무너진다
    sfx.impact();
    sfx.shatter();
    shake(420, 10);
    for (const [i, w] of walls.entries()) {
      anim(w, [
        { opacity: 1, transform: "rotate(0deg) translateY(0)" },
        { opacity: 0, transform: `rotate(${i ? 70 : -70}deg) translateY(60px)` },
      ], { duration: 520, delay: i * 90, easing: "cubic-bezier(.4,0,.8,.6)" });
    }
    await sleep(420);
    if (!alive(tok)) return;
    h.textContent = "무늬 무관 · 몸통 성립";
    h.style.borderColor = C.brass;
    h.style.color = C.brass;
    bindSet(els, { col: C.brass, label: "슌쯔 성립" });
    sfx.chime();
    bigGlyph("越境", { y: 270, col: C.brass, size: 64, ms: 1400 });
    banner("무너진 국경", "NO BORDERS", 1600);
    await sleep(1700);
    for (const el of els) el.style.outline = "";
    fade([h, dark, sv]);
    await sleep(520);
  },
});

/* ══════════════════ 끝없는 윤회 ══════════════════ */

def({
  id: "broken_wall", name: "끝없는 윤회", tier: "prism", fam: FAM,
  tag: "8-9-1, 9-1-2 도 몸통이 된다 — 숫자가 원을 그린다",
  tech: "직선이던 1~9 를 <b>실제로 원으로 재배치</b>한다. '순환한다'를 말로 쓰면 " +
        "한 줄이지만, 9 와 1 이 <b>이웃이 되는 것을 눈으로 보면</b> 설명이 끝난다.",
  async run(tok) {
    const dark = veil("brightness(.5)", 340);
    const h = chip("9 다음은 없다", C.red);
    // 직선 1~9
    const CX = 500;
    const CY = 300;
    const cells = [];
    for (let n = 1; n <= 9; n++) {
      const c = mk(null, {
        position: "absolute", left: `${CX + (n - 5) * 58 - 20}px`, top: `${CY - 24}px`,
        width: "40px", height: "48px", borderRadius: "var(--r-sm)",
        display: "grid", placeItems: "center", background: "rgba(14,23,18,.9)",
        border: `1px solid ${C.brassDim}`, font: "800 19px/1 ui-monospace, monospace", color: C.sage,
      });
      c.textContent = String(n);
      cells.push(c);
      anim(c, [{ opacity: 0, translate: "0 10px" }, { opacity: 1, translate: "0 0" }], {
        duration: 200, delay: n * 30, easing: EASE,
      });
    }
    sfx.riser(0.8);
    await sleep(560);
    if (!alive(tok)) return;
    // 9 다음이 없다
    const gap = mk(null, {
      position: "absolute", left: `${CX + 4 * 58 + 28}px`, top: `${CY - 8}px`,
      font: "900 26px/1 ui-monospace, monospace", color: C.red,
    });
    gap.textContent = "✕";
    anim(gap, [{ opacity: 0, scale: "2" }, { opacity: 1, scale: "1" }], { duration: 240, easing: EASE });
    await sleep(620);
    if (!alive(tok)) return;

    // 원으로 재배치
    sfx.whoosh(0.9);
    h.textContent = "숫자가 원을 그린다";
    h.style.borderColor = C.brass;
    h.style.color = C.brass;
    anim(gap, [{ opacity: 1 }, { opacity: 0 }], { duration: 220 });
    const R = 118;
    for (const [i, c] of cells.entries()) {
      const a = ((i / 9) * 360 - 90) * (Math.PI / 180);
      const tx = CX + R * Math.cos(a) - 20;
      const ty = CY + R * Math.sin(a) - 24;
      anim(c, [
        { transform: "translate(0,0)" },
        { transform: `translate(${tx - (CX + (i + 1 - 5) * 58 - 20)}px, ${ty - (CY - 24)}px)` },
      ], { duration: 760, delay: i * 40, easing: EASE });
    }
    await sleep(1100);
    if (!alive(tok)) return;

    bendRule(CX, CY);
    // 9-1 이 이웃이 된 것을 표시
    const sv = mkSvg({ zIndex: "6" });
    // 9(index 8)와 1(index 0) 사이를 바깥으로 부풀린 호로 잇는다.
    // 각도는 전부 라디안으로 통일한다 — 도(度)와 섞으면 엉뚱한 곳으로 휜다.
    const rad = (i) => ((i / 9) * 360 - 90) * (Math.PI / 180);
    const a9 = rad(8);
    const a1 = rad(0);
    const am = (a9 + a1) / 2 + Math.PI; // 바깥쪽으로 돌아가는 중간각
    const p = svgEl("path", {
      d: `M${(CX + R * Math.cos(a9)).toFixed(1)} ${(CY + R * Math.sin(a9)).toFixed(1)}`
        + ` Q${(CX + R * 1.6 * Math.cos(am)).toFixed(1)} ${(CY + R * 1.6 * Math.sin(am)).toFixed(1)}`
        + ` ${(CX + R * Math.cos(a1)).toFixed(1)} ${(CY + R * Math.sin(a1)).toFixed(1)}`,
      fill: "none", stroke: C.brass, "stroke-width": 3, "stroke-linecap": "round",
    }, sv);
    const L = p.getTotalLength();
    p.setAttribute("stroke-dasharray", `${L}`);
    p.setAttribute("stroke-dashoffset", `${L}`);
    anim(p, [{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 420, easing: EASE });
    for (const i of [7, 8, 0]) {
      cells[i].style.borderColor = C.brass;
      cells[i].style.color = C.brass;
      cells[i].style.boxShadow = `0 0 14px ${C.brass}`;
    }
    sfx.chime();
    bigGlyph("輪", { y: CY, col: C.brass, size: 70, ms: 1300 });
    banner("끝없는 윤회", "8-9-1 VALID", 1600);
    await sleep(1700);
    fade([h, dark, sv, ...cells]);
    await sleep(520);
  },
});

/* ══════════════════ 해저의 지배자 ══════════════════ */

def({
  id: "haitei_lord", name: "해저의 지배자", tier: "prism", fam: FAM,
  tag: "패산 마지막 패가 무조건 내 오름패가 된다",
  tech: "'마지막'을 <b>깊이</b>로 번역했다. 패산이 줄어드는 걸 보여준 뒤 마지막 한 장이 " +
        "<b>바닥에서 떠오른다</b> — 해저(海底)라는 이름이 그대로 그림이 된다.",
  async run(tok) {
    const dark = veil("brightness(.4) saturate(.8)", 380);
    const h = chip("패산 잔여 1장");
    const walls = [...S.wallTop.querySelectorAll(".tf")];
    // 패산이 줄어든다
    sfx.riser(1.1);
    for (const [i, w] of walls.slice(0, 13).entries()) {
      later(() => {
        if (!alive(tok)) return;
        anim(w, [{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(-16px)" }], { duration: 200 });
        sTone({ f: 500 - i * 20, dur: 0.04, gain: 0.035, type: "sine" });
      }, i * 62);
    }
    // 물빛 커튼
    let t = 0;
    drawHooks.add((dt, c) => {
      t += dt;
      const a = clamp(t / 40, 0, 1) * 0.5;
      const g = c.createLinearGradient(0, 625, 0, 180);
      g.addColorStop(0, `rgba(20,60,86,${a})`);
      g.addColorStop(1, "rgba(20,60,86,0)");
      c.fillStyle = g;
      c.fillRect(0, 180, 1000, 445);
      return t < 220;
    });
    await sleep(13 * 62 + 400);
    if (!alive(tok)) return;

    // 마지막 한 장이 떠오른다
    const last = walls[walls.length - 1];
    const lr = sRect(last);
    h.textContent = "해저패 — 무조건 오름패";
    sfx.impact();
    const code = pick(NUM_CODES);
    const risen = tileEl(code);
    Object.assign(risen.style, {
      position: "absolute", left: `${lr.x}px`, top: `${lr.y}px`, zIndex: "13",
      boxShadow: `0 0 30px ${C.cyan}`,
    });
    risen.style.setProperty("--tile-w", `${lr.w}px`);
    risen.style.setProperty("--tile-h", `${lr.h}px`);
    S.fx.appendChild(risen);
    anim(last, [{ opacity: 1 }, { opacity: 0 }], { duration: 200 });
    anim(risen, [
      { transform: "translate(0, 220px) scale(.7)", opacity: 0 },
      { transform: "translate(0, 130px) scale(2.1)", opacity: 1 },
    ], { duration: 900, easing: EASE });
    ring(lr.cx, lr.cy + 130, 20, 240, 900, "rgba(110,225,255,.7)", 3);
    await sleep(950);
    if (!alive(tok)) return;
    bendRule(lr.cx, lr.cy + 130, C.cyan);
    bigGlyph("海底撈月", { y: 400, col: C.cyan, size: 52, ms: 1500 });
    banner("해저의 지배자", "HAITEI +3", 1700);
    await sleep(1800);
    fade([h, dark, risen]);
    await sleep(520);
  },
});

/* ══════════════════ 대기만성 (반장 · 동풍) ══════════════════ */

function lateBloom({ id, name, target, col }) {
  def({
    id, name, tier: "prism", fam: FAM,
    tag: `${target}에 들어서면 만개한다 — 후리텐·무역 무시`,
    tech: "조건이 <b>시간</b>이라 국 표시가 한 칸씩 넘어가는 것이 연출의 본체다. " +
          "만개는 마지막 한 박자면 충분하다 — <b>기다린 시간이 길수록</b> 짧은 개화가 크게 느껴진다.",
    async run(tok) {
      const dark = veil("brightness(.5)", 330);
      const h = chip("아직 이르다", C.sageDim);
      const rounds = target === "남4국"
        ? ["동1국", "동4국", "남1국", "남4국"]
        : ["동1국", "동2국", "동3국", "동4국"];
      const sub = S.stage.querySelector(".center-sub");
      const wind = S.stage.querySelector(".center-wind");
      sfx.riser(1.0);
      for (const [i, r] of rounds.entries()) {
        if (!alive(tok)) return;
        if (sub) sub.textContent = `${r} 0본장`;
        if (wind) wind.textContent = r[0];
        const last = i === rounds.length - 1;
        anim(S.stage.querySelector(".center"), [{ scale: "1" }, { scale: last ? "1.14" : "1.05" }, { scale: "1" }], {
          duration: 300, easing: EASE,
        });
        sTone({ f: 600 + i * 140, dur: 0.09, gain: 0.06, type: "sine" });
        h.textContent = last ? "만개" : `${r} — 대기`;
        await sleep(last ? 200 : 620);
      }
      if (!alive(tok)) return;

      // 만개
      sfx.impact();
      sfx.chime();
      flash(260, "#f4d9e4", 0.5);
      shake(560, 12);
      h.style.borderColor = col;
      h.style.color = col;
      const hand = handTiles();
      for (const [i, el] of hand.entries()) {
        later(() => {
          if (!alive(tok)) return;
          anim(el, [
            { transform: "translateY(0) scale(1)", filter: "brightness(1)" },
            { transform: "translateY(-16px) scale(1.12)", filter: "brightness(1.7)", offset: 0.45 },
            { transform: "translateY(0) scale(1)", filter: "brightness(1)" },
          ], { duration: 600, easing: EASE });
          const r = sRect(el);
          ring(r.cx, r.cy - 8, 6, 66, 600, `${col}cc`, 2);
        }, i * 40);
      }
      fallParticles({ n: 60, col: "238,170,196", size: [3, 6], vy: [0.9, 2.2], life: 190, shape: "ellipse" });
      const tags = [];
      for (const [i, t] of ["후리텐 무시", "무역 화료"].entries()) {
        const g = mk(null, {
          position: "absolute", left: `${408 + i * 118}px`, top: "252px",
          padding: "5px 12px", borderRadius: "999px",
          background: "rgba(14,23,18,.92)", border: `1px solid ${col}`,
          font: "800 12px/1 ui-monospace, monospace", color: col, whiteSpace: "nowrap",
        });
        g.textContent = t;
        tags.push(g);
        anim(g, [{ opacity: 0, translate: "0 12px" }, { opacity: 1, translate: "0 0" }], { duration: 280, delay: i * 150, easing: EASE });
      }
      bigGlyph("満開", { y: 190, col, size: 68, ms: 1600 });
      banner(name, "LATE BLOOM", 1700);
      await sleep(1900);
      fade([h, dark, ...tags]);
      await sleep(520);
    },
  });
}
lateBloom({ id: "late_bloomer", name: "대기만성 (반장전)", target: "남4국", col: "#eeaac4" });
lateBloom({ id: "late_bloomer_east", name: "대기만성 (동풍전)", target: "동4국", col: C.brass });

/* ══════════════════ 뒤섞인 아홉 개의 연꽃 ══════════════════ */

def({
  id: "mixed_nine_gates", name: "뒤섞인 아홉 개의 연꽃", tier: "prism", fam: FAM,
  tag: "구련보등이 무늬를 가리지 않는다",
  tech: "구련보등의 형태(1112345678999)는 <b>줄 세우면 그 자체로 그림</b>이다. " +
        "13장을 정렬해 보여주고 <b>문 아홉 개가 차례로 열리는</b> 것으로 이름값을 한다.",
  async run(tok) {
    const dark = veil("brightness(.44) saturate(.85)", 360);
    const h = chip("무늬가 섞여 있다 — 원래는 불성립", C.red);
    const shape = ["1m", "1p", "1s", "2m", "3p", "4s", "5m", "6p", "7s", "8m", "9p", "9s", "9m"];
    const els = stage(shape);
    denyMark(els.slice(0, 3), 800);
    sfx.riser(1.3);
    await sleep(920);
    if (!alive(tok)) return;

    bendRule(500, 430);
    h.textContent = "무늬 무관 · 구련보등";
    h.style.borderColor = C.brass;
    h.style.color = C.brass;
    // 문 아홉 개가 열린다
    const sv = mkSvg({ zIndex: "5" });
    for (let i = 0; i < 9; i++) {
      const x = 500 + (i - 4) * 78;
      const g = svgEl("path", {
        d: `M${x - 30} 340 L${x - 30} 250 Q${x} 214 ${x + 30} 250 L${x + 30} 340`,
        fill: "none", stroke: C.brass, "stroke-width": 2,
      }, sv);
      const L = g.getTotalLength();
      g.setAttribute("stroke-dasharray", `${L}`);
      g.setAttribute("stroke-dashoffset", `${L}`);
      anim(g, [{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 320, delay: i * 90, easing: EASE });
      later(() => {
        if (!alive(tok)) return;
        sparkBurst(x, 260, { n: 8, col: "220,199,154", spread: 60 });
        sTone({ f: 700 + i * 130, dur: 0.1, gain: 0.06, type: "sine" });
      }, i * 90 + 280);
    }
    for (const el of els) {
      el.style.outline = `1.5px solid ${C.brass}`;
      el.style.outlineOffset = "1px";
    }
    await sleep(9 * 90 + 500);
    if (!alive(tok)) return;
    sfx.chime();
    flash(240, "#dcc79a", 0.5);
    bigGlyph("九蓮宝燈", { y: 300, col: C.brass, size: 54, ms: 1700 });
    banner("아홉 개의 연꽃", "NINE GATES · 역만", 1800);
    await sleep(1900);
    for (const el of els) el.style.outline = "";
    fade([h, dark, sv]);
    await sleep(520);
  },
});

/* ══════════════════ 동수의 결속 ══════════════════ */

def({
  id: "mixed_triplet", name: "동수의 결속", tier: "prism", fam: FAM,
  tag: "1만·1통·1삭도 하나의 커쯔다",
  tech: "세 무늬가 <b>가운데로 끌려와 겹치는</b> 순간이 전부다. 브래킷으로 묶기 전에 " +
        "물리적으로 <b>모이게</b> 해야 '같은 것이 되었다'로 읽힌다 — 결속은 배치가 아니라 이동이다.",
  async run(tok) {
    const dark = veil("brightness(.52)", 330);
    const h = chip("무늬가 다르다 — 커쯔 불성립", C.red);
    const n = 1 + ((Math.random() * 9) | 0);
    const els = stage([`${n}m`, `${n}p`, `${n}s`], 4);
    denyMark(els, 720);
    sfx.riser(0.8);
    await sleep(860);
    if (!alive(tok)) return;

    // 가운데로 끌어당긴다
    sfx.whoosh(0.6);
    h.textContent = "같은 숫자 — 결속";
    h.style.borderColor = C.brass;
    h.style.color = C.brass;
    const rs = els.map(sRect);
    const cx = (rs[0].cx + rs[2].cx) / 2;
    for (const [i, el] of els.entries()) {
      anim(el, [
        { transform: "translate(0,0)" },
        { transform: `translate(${(cx - rs[i].cx) * 0.62}px, -12px)` },
      ], { duration: 520, easing: EASE });
    }
    await sleep(560);
    if (!alive(tok)) return;
    bendRule(cx, rs[0].cy);
    bindSet(els, { col: C.brass, label: `${n} 커쯔 성립` });
    sfx.chime();
    sparkBurst(cx, rs[0].cy, { n: 20, col: "220,199,154", spread: 120 });
    bigGlyph("結束", { y: 280, col: C.brass, size: 64, ms: 1400 });
    banner("동수의 결속", "MIXED TRIPLET", 1600);
    await sleep(1700);
    for (const el of els) el.style.outline = "";
    fade([h, dark]);
    await sleep(520);
  },
});

/* ══════════════════ 양극 ══════════════════ */

def({
  id: "polar_ends", name: "양극", tier: "prism", fam: FAM,
  tag: "같은 무늬의 1과 9를 같은 패로 취급한다",
  tech: "1 과 9 는 수열의 <b>양끝</b>이다. 그래서 자석 두 극을 세우고 " +
        "<b>양끝이 서로를 당겨</b> 붙는 그림을 쓴다 — 가장 먼 둘이 붙는다는 게 이 증강의 감각이다.",
  async run(tok) {
    const dark = veil("brightness(.5)", 330);
    const h = chip("1 과 9 — 가장 먼 두 패", C.sageDim);
    const suit = pick(["m", "p", "s"]);
    const els = stage([`1${suit}`, `9${suit}`, `1${suit}`], 3);
    // 극 표시
    const sv = mkSvg({ zIndex: "5" });
    const rs = els.map(sRect);
    for (const [i, lab] of [["＋", rs[0]], ["－", rs[1]]].entries()) {
      const t = mk(null, {
        position: "absolute", left: `${lab[1].cx}px`, top: `${lab[1].y - 26}px`,
        transform: "translateX(-50%)", font: "900 22px/1 ui-monospace, monospace",
        color: i ? C.cyan : C.red,
      });
      t.textContent = lab[0];
      anim(t, [{ opacity: 0, scale: "2" }, { opacity: 1, scale: "1" }], { duration: 240, delay: i * 120, easing: EASE });
    }
    sfx.riser(0.8);
    await sleep(760);
    if (!alive(tok)) return;

    // 서로 당긴다
    sfx.whoosh(0.7);
    h.textContent = "양극이 같은 패가 된다";
    h.style.borderColor = C.brass;
    h.style.color = C.brass;
    const arc = svgEl("path", {
      d: `M${rs[0].cx} ${rs[0].y - 34} Q${(rs[0].cx + rs[1].cx) / 2} ${rs[0].y - 78} ${rs[1].cx} ${rs[1].y - 34}`,
      fill: "none", stroke: C.brass, "stroke-width": 2.5, "stroke-linecap": "round", "stroke-dasharray": "6 5",
    }, sv);
    anim(arc, [{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
    anim(arc, [{ strokeDashoffset: 0 }, { strokeDashoffset: -110 }], { duration: 1200, iterations: Infinity, easing: "linear" });
    for (const [i, el] of els.slice(0, 2).entries()) {
      anim(el, [{ transform: "translate(0,0)" }, { transform: `translate(${i ? -14 : 14}px, -10px)` }], {
        duration: 520, easing: EASE,
      });
    }
    await sleep(600);
    if (!alive(tok)) return;
    bendRule((rs[0].cx + rs[1].cx) / 2, rs[0].cy);
    bindSet(els, { col: C.brass, label: "1·9 커쯔 성립" });
    sfx.chime();
    bigGlyph("両極", { y: 270, col: C.brass, size: 64, ms: 1400 });
    banner("양 극", "POLAR ENDS", 1600);
    await sleep(1700);
    for (const el of els) el.style.outline = "";
    fade([h, dark, sv]);
    await sleep(520);
  },
});

/* ══════════════════ 왕의 징표 ══════════════════ */

def({
  id: "royal_kokushi", name: "왕의 징표", tier: "prism", fam: FAM,
  tag: "국사무쌍에 중복이 허용된다 — 빠진 한 종을 중복으로 메운다",
  tech: "국사는 <b>13칸을 다 채우는</b> 것이라 빈 칸이 곧 긴장이다. 슬롯 13개를 세우고 " +
        "<b>딱 한 칸만 비워둔 뒤</b> 중복 패가 그 자리에 앉는다 — 빈 칸이 있어야 채움이 사건이 된다.",
  async run(tok) {
    const dark = veil("brightness(.46) saturate(.85)", 360);
    const h = chip("국사 — 1종 부족", C.red);
    const yao = ["1m", "9m", "1p", "9p", "1s", "9s", "1z", "2z", "3z", "4z", "5z", "6z", "7z"];
    const slots = [];
    for (let i = 0; i < 13; i++) {
      const x = 500 + (i - 6) * 62;
      const s = mk(null, {
        position: "absolute", left: `${x - 26}px`, top: "246px",
        width: "52px", height: "68px", borderRadius: "var(--r-sm)",
        border: `1px ${i === 9 ? "dashed" : "solid"} ${i === 9 ? C.red : C.brassDim}`,
        background: "rgba(10,18,16,.7)", display: "grid", placeItems: "center", overflow: "hidden",
      });
      slots.push(s);
      if (i !== 9) {
        const t = tileEl(yao[i]);
        t.style.setProperty("--tile-w", "46px");
        t.style.setProperty("--tile-h", "62px");
        s.appendChild(t);
      }
      anim(s, [{ opacity: 0, translate: "0 10px" }, { opacity: 1, translate: "0 0" }], {
        duration: 200, delay: i * 34, easing: EASE,
      });
    }
    sfx.riser(1.1);
    await sleep(13 * 34 + 420);
    if (!alive(tok)) return;
    // 빈 칸 강조
    anim(slots[9], [{ boxShadow: "none" }, { boxShadow: `0 0 20px ${C.red}` }, { boxShadow: "none" }], {
      duration: 700, iterations: 2,
    });
    await sleep(700);
    if (!alive(tok)) return;

    // 중복으로 메운다
    bendRule(500, 280);
    h.textContent = "중복 허용 — 빈 칸을 메운다";
    h.style.borderColor = C.brass;
    h.style.color = C.brass;
    const src = sRect(slots[0]);
    const dst = sRect(slots[9]);
    flyTile(yao[0], src, dst, { bow: -90, ms: 620 });
    later(() => {
      if (!alive(tok)) return;
      const t = tileEl(yao[0]);
      t.style.setProperty("--tile-w", "46px");
      t.style.setProperty("--tile-h", "62px");
      slots[9].appendChild(t);
      slots[9].style.borderStyle = "solid";
      slots[9].style.borderColor = C.brass;
      slots[9].style.boxShadow = `0 0 22px ${C.brass}`;
      anim(t, [{ opacity: 0, scale: "1.4" }, { opacity: 1, scale: "1" }], { duration: 300, easing: EASE_IMPACT });
      sfx.chime();
      sparkBurst(dst.cx, dst.cy, { n: 22, col: "220,199,154", spread: 130 });
    }, 630);
    await sleep(900);
    if (!alive(tok)) return;
    stamp("王", { x: 500, y: 180, col: C.brass, size: 74, rot: 0 });
    banner("왕의 징표", "KOKUSHI · 역만", 1800);
    await sleep(1800);
    fade([h, dark, ...slots]);
    await sleep(520);
  },
});

/* ══════════════════ 탕야오 해방 ══════════════════ */

def({
  id: "tanyao_break", name: "탕야오 해방", tier: "prism", fam: FAM,
  tag: "1·9가 섞여도 탕야오로 인정되고 2판이 된다",
  tech: "탕야오의 정체성은 <b>금지</b>다. 그래서 1·9 에 금지 표식을 붙여두고 그 표식이 " +
        "<b>깨져 떨어지는</b> 그림을 쓴다 — 해방은 새로 얻는 게 아니라 <b>족쇄가 사라지는</b> 것이다.",
  async run(tok) {
    const dark = veil("brightness(.52)", 330);
    const h = chip("1·9 포함 — 탕야오 불성립", C.red);
    const els = stage(["1m", "5p", "9s", "3m", "9p"]);
    const ends = [els[0], els[2], els[4]];
    // 금지 표식
    const locks = [];
    for (const el of ends) {
      const r = sRect(el);
      const l = mk(null, {
        position: "absolute", left: `${r.cx}px`, top: `${r.y - 20}px`,
        transform: "translateX(-50%)", font: "800 17px/1 serif", color: C.red,
        textShadow: `0 0 10px ${C.red}`,
      });
      l.textContent = "禁";
      locks.push(l);
      anim(l, [{ opacity: 0, scale: "1.8" }, { opacity: 1, scale: "1" }], { duration: 220, easing: EASE });
      el.style.filter = "saturate(.5) brightness(.7)";
    }
    sfx.riser(0.8);
    await sleep(860);
    if (!alive(tok)) return;

    // 족쇄가 깨진다
    sfx.impact();
    sfx.shatter();
    shake(400, 9);
    for (const [i, l] of locks.entries()) {
      anim(l, [
        { opacity: 1, transform: "translateX(-50%) rotate(0deg) translateY(0)" },
        { opacity: 0, transform: `translateX(-50%) rotate(${rnd(-90, 90)}deg) translateY(70px)` },
      ], { duration: 560, delay: i * 80, easing: "cubic-bezier(.4,0,.8,.6)" });
      later(() => { ends[i].style.filter = ""; }, i * 80 + 150);
    }
    await sleep(520);
    if (!alive(tok)) return;
    h.textContent = "탕야오 · 2판";
    h.style.borderColor = C.brass;
    h.style.color = C.brass;
    bindSet(els, { col: C.brass, label: "断幺九 ×2" });
    sfx.chime();
    bigGlyph("解放", { y: 270, col: C.brass, size: 66, ms: 1400 });
    banner("탕야오 해방", "TANYAO ×2", 1600);
    await sleep(1700);
    for (const el of els) el.style.outline = "";
    fade([h, dark]);
    await sleep(520);
  },
});

/* ══════════════════ 바람의 계보 ══════════════════ */

def({
  id: "wind_lineage", name: "바람의 계보", tier: "prism", fam: FAM,
  tag: "동→남→서→북이 이어져 자패로 슌쯔를 만든다",
  tech: "자패에는 원래 <b>순서가 없다</b>. 그래서 순서를 새로 부여하는 그림 — " +
        "계보도처럼 <b>화살표로 이어진 사슬</b>을 그린다. 없던 관계를 만드는 증강엔 관계선이 맞다.",
  async run(tok) {
    const dark = veil("brightness(.5)", 340);
    const h = chip("자패에는 순서가 없다", C.red);
    const els = stage(["1z", "2z", "3z"], 2);
    denyMark(els, 760);
    sfx.riser(0.9);
    await sleep(880);
    if (!alive(tok)) return;

    // 계보 — 화살표로 잇는다
    bendRule(500, 430);
    h.textContent = "東 → 南 → 西 · 슌쯔 성립";
    h.style.borderColor = C.brass;
    h.style.color = C.brass;
    const sv = mkSvg({ zIndex: "6" });
    const rs = els.map(sRect);
    for (let i = 0; i < 2; i++) {
      const a = rs[i];
      const b = rs[i + 1];
      const p = svgEl("path", {
        d: `M${a.cx + 8} ${a.y - 14} L${b.cx - 8} ${b.y - 14}`,
        fill: "none", stroke: C.brass, "stroke-width": 2.5, "stroke-linecap": "round",
      }, sv);
      const L = p.getTotalLength();
      p.setAttribute("stroke-dasharray", `${L}`);
      p.setAttribute("stroke-dashoffset", `${L}`);
      anim(p, [{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 300, delay: i * 200, easing: EASE });
      // 화살촉
      const head = svgEl("path", {
        d: `M${b.cx - 8} ${b.y - 14} l-8 -5 l0 10 z`, fill: C.brass,
      }, sv);
      anim(head, [{ opacity: 0 }, { opacity: 1 }], { duration: 160, delay: i * 200 + 280 });
      later(() => alive(tok) && sfx.clack(1100 + i * 250), i * 200 + 280);
    }
    await sleep(700);
    if (!alive(tok)) return;
    bindSet(els, { col: C.brass, label: "東南西" });
    sfx.chime();
    // 네 바람이 모이면 깡
    const note = mk(null, {
      position: "absolute", left: "500px", top: "268px", transform: "translateX(-50%)",
      padding: "5px 14px", borderRadius: "999px", background: "rgba(14,23,18,.92)",
      border: `1px solid ${C.brass}`, font: "800 12px/1 ui-monospace, monospace",
      color: C.brass, whiteSpace: "nowrap",
    });
    note.textContent = "東南西北 4장 → 깡으로도 낼 수 있다";
    anim(note, [{ opacity: 0, translate: "0 10px" }, { opacity: 1, translate: "0 0" }], { duration: 300, easing: EASE });
    bigGlyph("系譜", { y: 200, col: C.brass, size: 62, ms: 1400 });
    banner("바람의 계보", "WIND LINEAGE", 1600);
    await sleep(1800);
    for (const el of els) el.style.outline = "";
    fade([h, dark, sv, note]);
    await sleep(520);
  },
});
