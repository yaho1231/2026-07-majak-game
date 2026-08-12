/* 이능마작 증강 연출 랩 — 4차 배치 D · 후로 7종 + 교란 8종
 *
 * 후로 계열은 "남의 패를 가져온다"이다 — 손이 뻗어 나가는 방향이 늘 있다. 그래서 공통
 * 문장은 **누구에게서 → 나에게로** 이고, 각자는 그 손이 어떻게 이상한지를 보여준다.
 *
 * 교란 계열은 반대로 "남에게 뭔가를 건다"이다. 방향이 나 → 상대로 뒤집히고, 걸린 것이
 * 상대 쪽에 **남아 있어야** 한다. 교란은 순간이 아니라 상태다.
 */

import {
  C, EASE, EASE_IMPACT, HONOR_CODES, NUM_CODES, S, alive, anim, banner, bigGlyph, chip, clamp,
  countUp, drawHooks, fade, fallParticles, flash, flyTile, glowTiles, handTiles, hexShield, later,
  linkTo, meter, mk, mkSvg, opps, orbitRing, pick, ponds, ring, rnd, sRect, sTone, seatMark,
  setTile, sfx, shake, sleep, sparkBurst, stamp, svgEl, tileEl, veil,
} from "/fx-kit.js?v=10";
import { def } from "/fx-registry.js?v=10";

const CALL = "후로 · 손길";
const DISRUPT = "교란 · 낙인";

/** 상대 바닥에서 패 한 장이 내 손으로 — 후로 계열 공용 */
function takeFrom(pondEl, code, destEl, { bow = 80, ms = 520, col = C.brass } = {}) {
  const tiles = [...pondEl.querySelectorAll(".tf")];
  const src = tiles[tiles.length - 1] ?? pondEl;
  const sr = sRect(src);
  const dr = sRect(destEl);
  anim(src, [{ opacity: 1 }, { opacity: 0 }], { duration: 200 });
  flyTile(code, sr, dr, { bow, ms });
  later(() => {
    setTile(destEl, code, { ms: 300 });
    destEl.style.outline = `1.5px solid ${col}`;
    destEl.style.outlineOffset = "1px";
    sfx.clack(rnd(800, 1200));
    ring(dr.cx, dr.cy, 8, 70, 420, `${col}cc`, 2);
  }, ms);
  return { sr, dr };
}

/* ══════════════════════ 후로 · 손길 ══════════════════════ */

def({
  id: "bluff_pretense", name: "허장성세", tier: "prism", fam: CALL,
  tag: "1장뿐인데 펑을 부른다 — 잡패가 그 패로 변신해 채운다",
  tech: "속임수라 <b>변신하는 순간이 나에게만 보인다</b>. 잡패가 대상 패로 바뀌는 걸 " +
        "내 화면에서만 <b>글리치</b>로 보여주고, 완성된 커쯔는 멀쩡하게 남는다 — 흔적이 없어야 허장성세다.",
  async run(tok) {
    const dark = veil("brightness(.52)", 330);
    const h = chip("펑 — 손에 1장뿐", C.red);
    const tiles = handTiles();
    const code = pick(NUM_CODES);
    const real = tiles[3];
    const fake = tiles[4];
    setTile(real, code, { ms: 1 });
    setTile(fake, pick(HONOR_CODES), { ms: 1 });
    glowTiles([real], C.brass, { lift: 10 });
    sfx.impact();
    await sleep(620);
    if (!alive(tok)) return;

    // 상대 버림패를 가져온다
    h.textContent = "상대 버림패 · 세 번째 장이 없다";
    const { dr } = takeFrom(S.pondLeft, code, tiles[2], { bow: -110, ms: 520 });
    await sleep(640);
    if (!alive(tok)) return;

    // 잡패가 변신 — 글리치
    sfx.riser(0.6);
    h.textContent = "잡패가 변신해 채운다";
    const fr = sRect(fake);
    for (let i = 0; i < 5; i++) {
      later(() => {
        if (!alive(tok)) return;
        setTile(fake, i === 4 ? code : pick(NUM_CODES), { ms: 90 });
        fake.style.filter = i === 4 ? "" : `hue-rotate(${rnd(-90, 90)}deg) saturate(2)`;
        sTone({ f: rnd(1400, 2600), dur: 0.04, gain: 0.05, type: "square" });
      }, i * 90);
    }
    later(() => {
      if (!alive(tok)) return;
      fake.style.filter = "";
      glowTiles([fake], C.aug, { lift: 10 });
      const mk2 = mk(null, {
        position: "absolute", left: `${fr.cx}px`, top: `${fr.y - 26}px`,
        transform: "translateX(-50%)", font: "800 10px/1 ui-monospace, monospace",
        letterSpacing: "1px", color: C.augLite, whiteSpace: "nowrap",
      });
      mk2.textContent = "변신 · 나만 안다";
      anim(mk2, [{ opacity: 0 }, { opacity: 1 }], { duration: 240 });
    }, 480);
    await sleep(760);
    if (!alive(tok)) return;
    sfx.impact();
    flash(160, "#b6a3ff", 0.28);
    bigGlyph("虚", { y: 270, col: C.augLite, size: 78, ms: 1300 });
    banner("허장성세", "BLUFF PON", 1600);
    await sleep(1700);
    for (const el of tiles) el.style.outline = "";
    fade([h, dark]);
    await sleep(520);
  },
});

def({
  id: "meld_dissolve", name: "파혼", tier: "prism", fam: CALL,
  tag: "후로 하나를 해체해 손으로 되돌린다 — 멘젠이 복구된다",
  tech: "후로는 <b>공개된 약속</b>이라 판 옆에 눕혀져 있다. 그걸 <b>일으켜 세워 손으로</b> " +
        "돌려보내면 '되돌렸다'가 된다. 멘젠 복구는 리치봉이 <b>다시 놓일 수 있게</b> 되는 것으로 알린다.",
  async run(tok) {
    const dark = veil("brightness(.52)", 330);
    const h = chip("후로 — 멘젠 깨짐", C.red);
    const hr = sRect(S.myhand);
    // 후로 3장 (눕혀서)
    const meld = [];
    const code = pick(NUM_CODES);
    for (let i = 0; i < 3; i++) {
      const t = tileEl(code);
      Object.assign(t.style, {
        position: "absolute", left: `${hr.x + hr.w + 16 + i * 34}px`, top: `${hr.y + 10}px`,
        zIndex: "9", transform: i === 0 ? "rotate(-90deg)" : "none",
      });
      t.style.setProperty("--tile-w", "32px");
      t.style.setProperty("--tile-h", "43px");
      S.fx.appendChild(t);
      meld.push(t);
      anim(t, [{ opacity: 0, scale: "1.2" }, { opacity: 1, scale: "1" }], { duration: 220, delay: i * 70, easing: EASE });
    }
    sfx.riser(0.7);
    await sleep(700);
    if (!alive(tok)) return;

    // 해체 — 손으로 돌아간다
    sfx.impact();
    h.textContent = "해체 — 손으로 복귀";
    h.style.borderColor = C.brass;
    h.style.color = C.brass;
    const tiles = handTiles();
    for (const [i, t] of meld.entries()) {
      const from = sRect(t);
      const to = sRect(tiles[i]);
      flyTile(code, from, to, { bow: 60, ms: 480, spin: 90 });
      anim(t, [{ opacity: 1 }, { opacity: 0 }], { duration: 160 });
      later(() => {
        if (!alive(tok)) return;
        setTile(tiles[i], code, { ms: 280 });
        sfx.clack(rnd(900, 1300));
      }, 480);
    }
    await sleep(680);
    if (!alive(tok)) return;

    // 멘젠 복구 — 리치가 다시 가능해진다
    h.textContent = "멘젠 복구 · 리치 가능";
    const stick = mk(null, {
      position: "absolute", left: "444px", top: "398px", width: "112px", height: "12px",
      borderRadius: "6px", background: "linear-gradient(180deg,#fff,#d8d2c2)", opacity: "0.5",
      outline: `1px dashed ${C.brass}`, outlineOffset: "4px",
    });
    anim(stick, [{ opacity: 0 }, { opacity: 0.55 }], { duration: 340 });
    sfx.chime();
    bigGlyph("解", { y: 280, col: C.brass, size: 80, ms: 1300 });
    banner("파 혼", "MELD DISSOLVED", 1600);
    await sleep(1700);
    fade([h, dark, stick]);
    await sleep(520);
  },
});

def({
  id: "omni_chi", name: "사방치기", tier: "gold", fam: CALL,
  tag: "상가뿐 아니라 누구의 버림패로도 치를 한다",
  tech: "원래는 <b>한 방향</b>만 가능하다. 그래서 허용된 방향을 화살표로 먼저 그리고, " +
        "나머지 <b>세 방향이 차례로 열린다</b> — 방향의 개수가 이 증강의 전부라 화살표로 센다.",
  async run(tok) {
    const dark = veil("brightness(.5)", 330);
    const h = chip("치 — 상가만 가능", C.red);
    const me = { cx: sRect(S.myhand).cx, cy: sRect(S.myhand).y - 24 };
    const links = [];
    // 상가(왼쪽)만 허용
    links.push(linkTo(sRect(S.pondLeft), me, { col: C.brass, bow: -70, ms: 420, width: 3 }));
    for (const [i, o] of [S.pondTop, S.pondRight].entries()) {
      const r = sRect(o);
      const x = mk(null, {
        position: "absolute", left: `${r.cx}px`, top: `${r.cy}px`,
        transform: "translate(-50%,-50%)", font: "900 30px/1 ui-monospace, monospace", color: C.red,
      });
      x.textContent = "✕";
      links.push(x);
      anim(x, [{ opacity: 0, scale: "2" }, { opacity: 1, scale: "1" }], { duration: 240, delay: i * 120, easing: EASE });
    }
    sfx.riser(0.8);
    await sleep(880);
    if (!alive(tok)) return;

    // 세 방향이 열린다
    sfx.impact();
    flash(160, "#dcc79a", 0.3);
    h.textContent = "사방 — 누구에게서든 치";
    h.style.borderColor = C.brass;
    h.style.color = C.brass;
    for (const l of links.slice(1)) anim(l, [{ opacity: 1 }, { opacity: 0 }], { duration: 240 });
    for (const [i, o] of [S.pondTop, S.pondRight].entries()) {
      later(() => {
        if (!alive(tok)) return;
        links.push(linkTo(sRect(o), me, { col: C.brass, bow: i ? 90 : 0, ms: 420, width: 3 }));
        sfx.clack(900 + i * 300);
      }, i * 200);
    }
    await sleep(700);
    if (!alive(tok)) return;
    takeFrom(S.pondRight, pick(NUM_CODES), handTiles()[6], { bow: 90, ms: 480 });
    bigGlyph("四方", { y: 250, col: C.brass, size: 66, ms: 1400 });
    banner("사방치기", "CHI FROM ANY", 1600);
    await sleep(1700);
    for (const el of handTiles()) el.style.outline = "";
    fade([h, dark, ...links]);
    await sleep(520);
  },
});

def({
  id: "open_kokushi", name: "우는 국사무쌍", tier: "prism", fam: CALL,
  tag: "요구패 3장을 퐁해서 국사를 완성한다",
  tech: "국사인데 <b>후로가 섞인다</b>는 모순이 핵심이라, 손패 쪽 슬롯과 후로 쪽 슬롯을 " +
        "<b>나란히 두고</b> 둘이 합쳐져 하나의 역만이 되는 그림으로 만든다.",
  async run(tok) {
    const dark = veil("brightness(.46) saturate(.85)", 360);
    const h = chip("요구패 3장 퐁");
    const trio = ["1m", "1p", "1s"];
    const meld = [];
    for (const [i, c] of trio.entries()) {
      const t = tileEl(c);
      Object.assign(t.style, {
        position: "absolute", left: `${560 + i * 54}px`, top: "300px", zIndex: "10",
      });
      t.style.setProperty("--tile-w", "48px");
      t.style.setProperty("--tile-h", "64px");
      S.fx.appendChild(t);
      meld.push(t);
      anim(t, [{ opacity: 0, translate: "0 26px", scale: "1.2" }, { opacity: 1, translate: "0 0", scale: "1" }], {
        duration: 300, delay: i * 130, easing: EASE_IMPACT,
      });
      later(() => alive(tok) && sfx.clack(rnd(900, 1300)), i * 130);
    }
    const lb1 = mk(null, {
      position: "absolute", left: "560px", top: "272px",
      font: "700 10px/1 ui-monospace, monospace", letterSpacing: "2px", color: C.brass,
    });
    lb1.textContent = "후로 (공개)";
    sfx.riser(1.1);
    await sleep(700);
    if (!alive(tok)) return;

    // 손패 쪽
    const hidden = [];
    for (let i = 0; i < 3; i++) {
      const t = tileEl(null, { back: true });
      Object.assign(t.style, { position: "absolute", left: `${330 + i * 54}px`, top: "300px", zIndex: "10" });
      t.style.setProperty("--tile-w", "48px");
      t.style.setProperty("--tile-h", "64px");
      S.fx.appendChild(t);
      hidden.push(t);
      anim(t, [{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: i * 90 });
    }
    const lb2 = mk(null, {
      position: "absolute", left: "330px", top: "272px",
      font: "700 10px/1 ui-monospace, monospace", letterSpacing: "2px", color: C.sageDim,
    });
    lb2.textContent = "손패 (비공개)";
    await sleep(560);
    if (!alive(tok)) return;

    // 합쳐진다
    sfx.impact();
    sfx.chime();
    flash(240, "#dcc79a", 0.5);
    shake(520, 11);
    const sv = mkSvg({ zIndex: "6" });
    const p = svgEl("path", {
      d: "M354 380 Q500 424 632 380", fill: "none", stroke: C.brass, "stroke-width": 3, "stroke-linecap": "round",
    }, sv);
    const L = p.getTotalLength();
    p.setAttribute("stroke-dasharray", `${L}`);
    p.setAttribute("stroke-dashoffset", `${L}`);
    anim(p, [{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 480, easing: EASE });
    h.textContent = "국사무쌍 · 정식 역만 13판";
    bigGlyph("国士無双", { y: 200, col: C.brass, size: 56, ms: 1700 });
    banner("우는 국사무쌍", "OPEN KOKUSHI · 역만", 1800);
    await sleep(1900);
    fade([h, dark, sv, lb1, lb2, ...meld, ...hidden]);
    await sleep(520);
  },
});

def({
  id: "silent_pact", name: "묵계", tier: "prism", fam: CALL,
  tag: "멘젠이 깨지지 않는 퐁을 한다",
  tech: "'울었는데 안 운 것'이라 <b>후로가 반투명</b>하다. 실체는 있는데 " +
        "멘젠 판정에는 안 잡힌다는 걸 <b>불투명도 하나</b>로 말한다 — 규칙 예외에 딱 맞는 표현.",
  async run(tok) {
    const dark = veil("brightness(.52)", 330);
    const h = chip("퐁 — 보통은 멘젠이 깨진다", C.red);
    const hr = sRect(S.myhand);
    const code = pick(NUM_CODES);
    const meld = [];
    for (let i = 0; i < 3; i++) {
      const t = tileEl(code);
      Object.assign(t.style, {
        position: "absolute", left: `${hr.x + hr.w + 16 + i * 34}px`, top: `${hr.y + 10}px`, zIndex: "9",
      });
      t.style.setProperty("--tile-w", "32px");
      t.style.setProperty("--tile-h", "43px");
      S.fx.appendChild(t);
      meld.push(t);
      anim(t, [{ opacity: 0, translate: "0 16px" }, { opacity: 1, translate: "0 0" }], {
        duration: 240, delay: i * 80, easing: EASE,
      });
      later(() => alive(tok) && sfx.clack(rnd(900, 1300)), i * 80);
    }
    sfx.riser(0.7);
    await sleep(700);
    if (!alive(tok)) return;

    // 후로가 반투명해진다 — 있지만 세지 않는다
    sfx.whoosh(0.6);
    h.textContent = "묵계 — 멘젠 유지";
    h.style.borderColor = C.brass;
    h.style.color = C.brass;
    for (const [i, t] of meld.entries()) {
      anim(t, [{ opacity: 1, filter: "none" }, { opacity: 0.42, filter: "saturate(.6)" }], {
        duration: 420, delay: i * 70, easing: EASE,
      });
      t.style.outline = `1px dashed ${C.brass}`;
      t.style.outlineOffset = "2px";
    }
    const lb = mk(null, {
      position: "absolute", left: `${hr.x + hr.w + 16}px`, top: `${hr.y - 14}px`,
      font: "700 10px/1 ui-monospace, monospace", letterSpacing: "1px", color: C.brass, whiteSpace: "nowrap",
    });
    lb.textContent = "멘젠 판정 제외";
    anim(lb, [{ opacity: 0 }, { opacity: 1 }], { duration: 280 });
    // 리치가 여전히 가능하다
    const stick = mk(null, {
      position: "absolute", left: "444px", top: "398px", width: "112px", height: "12px",
      borderRadius: "6px", background: "linear-gradient(180deg,#fff,#d8d2c2)",
    });
    anim(stick, [{ opacity: 0, translate: "0 -24px" }, { opacity: 1, translate: "0 0" }], { duration: 340, delay: 300, easing: EASE });
    later(() => alive(tok) && sfx.clack(1400), 320);
    bigGlyph("黙", { y: 270, col: C.brass, size: 80, ms: 1400 });
    banner("묵 계", "SILENT PON", 1600);
    await sleep(1800);
    fade([h, dark, lb, stick, ...meld]);
    await sleep(520);
  },
});

def({
  id: "snake_kan", name: "장사진", tier: "prism", fam: CALL,
  tag: "같은 무늬 연속 4장을 깡으로 낸다",
  tech: "깡은 보통 <b>같은 패 4장</b>이라 세로로 쌓인다. 장사진은 <b>가로로 늘어선</b> 4장이므로 " +
        "쌓지 않고 <b>줄지어 미끄러지게</b> 한다 — 같은 '깡'이라도 형태가 다르면 움직임도 달라야 한다.",
  async run(tok) {
    const dark = veil("brightness(.5)", 330);
    const h = chip("연속 4장");
    const suit = pick(["m", "p", "s"]);
    const base = 3;
    const tiles = handTiles();
    const els = [];
    for (let i = 0; i < 4; i++) {
      const el = tiles[i + 3];
      setTile(el, `${base + i}${suit}`, { ms: 1 });
      els.push(el);
    }
    glowTiles(els, C.brass, { lift: 12, stagger: 70 });
    sfx.riser(0.9);
    await sleep(700);
    if (!alive(tok)) return;

    // 뱀처럼 미끄러진다
    sfx.whoosh(0.8);
    h.textContent = "장사진 — 깡 성립";
    const hr = sRect(S.myhand);
    for (const [i, el] of els.entries()) {
      const r = sRect(el);
      const tx = hr.x + hr.w + 20 + i * 34;
      flyTile(el.dataset.code, r, { x: tx, y: hr.y + 10, w: 32, h: 43, cx: tx + 16, cy: hr.y + 32 }, { bow: -30 - i * 8, ms: 520 });
      anim(el, [{ opacity: 1 }, { opacity: 0.12 }], { duration: 240, delay: i * 60 });
      later(() => alive(tok) && sfx.clack(900 + i * 180), 520 + i * 60);
    }
    await sleep(760);
    if (!alive(tok)) return;
    // 늘어선 4장 + 새 도라
    const laid = [];
    for (let i = 0; i < 4; i++) {
      const t = tileEl(`${base + i}${suit}`);
      Object.assign(t.style, {
        position: "absolute", left: `${hr.x + hr.w + 20 + i * 34}px`, top: `${hr.y + 10}px`, zIndex: "9",
        boxShadow: `0 0 12px ${C.brass}`,
      });
      t.style.setProperty("--tile-w", "32px");
      t.style.setProperty("--tile-h", "43px");
      S.fx.appendChild(t);
      laid.push(t);
    }
    sfx.impact();
    flash(160, "#dcc79a", 0.3);
    const wr = sRect(S.wallTop);
    seatMark(S.wallTop, "새 도라 공개", C.brass, 42);
    bigGlyph("長蛇", { y: 260, col: C.brass, size: 68, ms: 1400 });
    banner("장 사 진", "SNAKE KAN", 1600);
    await sleep(1700);
    for (const el of els) el.style.outline = "";
    fade([h, dark, ...laid]);
    await sleep(520);
  },
});

def({
  id: "void_kan", name: "성립하지 않는 깡", tier: "prism", fam: CALL,
  tag: "상대가 깡을 선언하는 순간 창깡으로 가로챈다",
  tech: "상대의 <b>성공 연출을 중간에 끊는</b> 것이 전부다. 깡 배너가 뜨다 말고 " +
        "깨지고 그 자리를 내 화료가 차지한다 — 가로채기는 타이밍이 내용이다.",
  async run(tok) {
    const dark = veil("brightness(.5) saturate(.85)", 340);
    const h = chip("상대 깡 선언", C.red);
    const or = sRect(S.oppTop);
    seatMark(S.oppTop, "깡!", C.red, 76);
    sfx.impact();
    // 상대 깡 배너가 뜨려다가
    const b = mk(null, {
      position: "absolute", left: "0", right: "0", top: "246px", height: "76px",
      display: "grid", placeItems: "center",
      background: "linear-gradient(90deg, transparent, rgba(60,14,18,.92) 12%, rgba(60,14,18,.92) 88%, transparent)",
      borderTop: `1px solid ${C.red}`, borderBottom: `1px solid ${C.red}`,
      font: "900 40px/1 serif", letterSpacing: "14px", color: C.redLite,
    });
    b.textContent = "槓";
    anim(b, [{ opacity: 0, transform: "scaleY(0)" }, { opacity: 1, transform: "scaleY(1)" }], { duration: 300, easing: EASE });
    await sleep(560);
    if (!alive(tok)) return;

    // 끊는다
    sfx.shatter();
    sfx.impact();
    shake(520, 12);
    flash(220, "#fff", 0.5);
    anim(b, [
      { opacity: 1, transform: "scaleY(1) skewX(0deg)" },
      { opacity: 0, transform: "scaleY(.2) skewX(24deg)" },
    ], { duration: 320, easing: "cubic-bezier(.5,0,.9,.5)" });
    // 깡패를 가로챈다
    const code = pick(NUM_CODES);
    flyTile(code, { x: or.cx - 23, y: or.cy, w: 46, h: 62, cx: or.cx, cy: or.cy }, sRect(handTiles()[6]), { bow: -90, ms: 560 });
    await sleep(600);
    if (!alive(tok)) return;
    setTile(handTiles()[6], code, { ms: 300 });
    h.textContent = "창깡 — 깡 무효, 내 화료";
    h.style.borderColor = C.brass;
    h.style.color = C.brass;
    bigGlyph("槍槓", { y: 280, col: C.brass, size: 74, ms: 1500 });
    banner("성립하지 않는 깡", "CHANKAN", 1700);
    await sleep(1800);
    fade([h, dark, b]);
    await sleep(520);
  },
});

/* ══════════════════════ 교란 · 낙인 ══════════════════════ */

def({
  id: "call_seal", name: "함구령", tier: "prism", fam: DISRUPT,
  tag: "6순 동안 상대 셋이 아무도 울지 못한다",
  tech: "지속형이라 <b>남은 순수 카운터</b>가 필요하다. 세 좌석에 봉인이 붙고 " +
        "가운데에 <b>6 → 5 → 4</b> 로 줄어드는 숫자가 남는다 — 지속은 남은 양으로만 체감된다.",
  async run(tok) {
    const dark = veil("brightness(.5) saturate(.8)", 340);
    const h = chip("함구령 발동");
    sfx.riser(1.0);
    const seals = [];
    for (const [i, o] of opps().entries()) {
      later(() => {
        if (!alive(tok)) return;
        const r = sRect(o);
        const s = mk(null, {
          position: "absolute", left: `${r.cx - 22}px`, top: `${r.cy - 22}px`,
          width: "44px", height: "44px", borderRadius: "var(--r-sm)",
          background: "rgba(60,14,18,.9)", border: `2px solid ${C.red}`,
          display: "grid", placeItems: "center", font: "900 20px/1 serif", color: C.redLite,
          boxShadow: `0 0 20px ${C.red}88`,
        });
        s.textContent = "封";
        seals.push(s);
        anim(s, [{ opacity: 0, transform: "scale(2.4) rotate(-20deg)" }, { opacity: 1, transform: "scale(1) rotate(0deg)" }], {
          duration: 320, easing: EASE,
        });
        sfx.clack(500 - i * 80);
        ring(r.cx, r.cy, 12, 120, 480, "rgba(224,85,95,.8)", 2);
      }, i * 190);
    }
    await sleep(900);
    if (!alive(tok)) return;

    // 순수 카운터
    sfx.impact();
    const cnt = mk(null, {
      position: "absolute", left: "500px", top: "300px", transform: "translate(-50%,-50%)",
      font: "900 76px/1 ui-monospace, monospace", color: C.brass, textShadow: `0 0 26px ${C.brass}`,
    });
    cnt.textContent = "6";
    anim(cnt, [{ opacity: 0, scale: "2" }, { opacity: 1, scale: "1" }], { duration: 300, easing: EASE });
    for (let n = 5; n >= 4; n--) {
      await sleep(560);
      if (!alive(tok)) return;
      cnt.textContent = String(n);
      anim(cnt, [{ scale: "1.35", opacity: 0.5 }, { scale: "1", opacity: 1 }], { duration: 300, easing: EASE });
      sTone({ f: 700 + n * 90, dur: 0.08, gain: 0.06, type: "sine" });
    }
    h.textContent = "6순 동안 후로 봉인 (안깡 제외)";
    banner("함 구 령", "NO CALLS · 6", 1700);
    await sleep(1700);
    fade([h, dark, cnt, ...seals]);
    await sleep(520);
  },
});

def({
  id: "discard_lock", name: "봉인술사", tier: "prism", fam: DISRUPT,
  tag: "상대마다 무작위 2종이 버릴 수 없게 잠긴다",
  tech: "상대 <b>손패 안</b>에서 벌어지는 일이라 보이지 않는다. 그래서 좌석마다 " +
        "<b>잠긴 패 2장의 그림자</b>를 띄워 무엇이 묶였는지 알려준다 — 안 보이는 제약은 표시해야 존재한다.",
  async run(tok) {
    const dark = veil("brightness(.5) saturate(.8)", 340);
    const h = chip("국 시작 — 봉인");
    sfx.riser(1.1);
    const shown = [];
    for (const [i, o] of opps().entries()) {
      later(() => {
        if (!alive(tok)) return;
        const r = sRect(o);
        const isTop = o === S.oppTop;
        for (let k = 0; k < 2; k++) {
          const t = tileEl(pick(NUM_CODES));
          const x = isTop ? r.cx - 40 + k * 42 : r.cx - 20;
          const y = isTop ? r.cy + 44 : r.cy - 40 + k * 46;
          Object.assign(t.style, {
            position: "absolute", left: `${x}px`, top: `${y}px`, zIndex: "10",
            filter: "grayscale(1) brightness(.6)", outline: `1.5px solid ${C.red}`, outlineOffset: "1px",
          });
          t.style.setProperty("--tile-w", "38px");
          t.style.setProperty("--tile-h", "50px");
          S.fx.appendChild(t);
          shown.push(t);
          anim(t, [{ opacity: 0, scale: "1.4" }, { opacity: 1, scale: "1" }], { duration: 260, delay: k * 90, easing: EASE });
          const lock = mk(null, {
            position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
            font: "800 17px/1 serif", color: C.red, textShadow: `0 0 10px ${C.red}`,
          }, t);
          lock.textContent = "禁";
        }
        sfx.clack(600 - i * 80);
        seatMark(o, "2종 봉인", C.red, isTop ? 100 : 0);
      }, i * 240);
    }
    await sleep(1200);
    if (!alive(tok)) return;
    sfx.impact();
    flash(160, "#e0555f", 0.24);
    h.textContent = "그 패는 버릴 수 없다";
    bigGlyph("封", { y: 300, col: C.red, size: 88, ms: 1400 });
    banner("봉인술사", "DISCARD LOCKED", 1700);
    await sleep(1700);
    fade([h, dark, ...shown]);
    await sleep(520);
  },
});

def({
  id: "frame_up", name: "누명", tier: "prism", fam: DISRUPT,
  tag: "내가 버릴 패를 상대 바닥에 놓아 후리텐을 씌운다",
  tech: "<b>내 바닥에는 남지 않는다</b>가 핵심이라, 패가 내 바닥으로 가려다가 " +
        "<b>방향을 틀어</b> 상대 바닥에 앉는다. 궤적이 꺾이는 순간이 곧 '누명'이다.",
  async run(tok) {
    const dark = veil("brightness(.5) saturate(.85)", 340);
    const h = chip("타패 — 원래는 내 바닥으로");
    const src = handTiles()[8];
    const sr = sRect(src);
    const mine = sRect(S.pondMe);
    const target = sRect(S.pondRight);
    const code = src.dataset.code || "1m";
    sfx.riser(0.7);
    await sleep(420);
    if (!alive(tok)) return;

    // 내 바닥으로 가다가 꺾인다
    const t = tileEl(code);
    Object.assign(t.style, { position: "absolute", left: `${sr.x}px`, top: `${sr.y}px`, zIndex: "14" });
    t.style.setProperty("--tile-w", `${sr.w}px`);
    t.style.setProperty("--tile-h", `${sr.h}px`);
    S.fx.appendChild(t);
    anim(src, [{ opacity: 1 }, { opacity: 0.12 }], { duration: 200 });
    sfx.whoosh(0.4);
    anim(t, [
      { transform: "translate(0,0)" },
      { transform: `translate(${mine.cx - sr.cx}px, ${(mine.cy - sr.cy) * 0.55}px)` },
    ], { duration: 340, easing: EASE });
    await sleep(360);
    if (!alive(tok)) return;

    // 꺾임
    sfx.impact();
    flash(150, "#e0555f", 0.26);
    h.textContent = "상대 바닥에 놓는다";
    h.style.borderColor = C.red;
    h.style.color = C.red;
    const bend = sRect(t);
    const steps = [];
    for (let k = 0; k <= 8; k++) {
      const p = k / 8;
      const u = 1 - p;
      const mx = (bend.cx + target.cx) / 2 + 60;
      const my = (bend.cy + target.cy) / 2 - 80;
      steps.push({
        transform: `translate(${(u * u * bend.cx + 2 * u * p * mx + p * p * target.cx - sr.cx).toFixed(1)}px, ${(u * u * bend.cy + 2 * u * p * my + p * p * target.cy - sr.cy).toFixed(1)}px) scale(${(1 - p * 0.35).toFixed(2)})`,
        offset: p,
      });
    }
    anim(t, steps, { duration: 560, easing: EASE });
    await sleep(600);
    if (!alive(tok)) return;
    t.remove();
    sfx.clack(700);
    ring(target.cx, target.cy, 10, 110, 520, "rgba(224,85,95,.85)", 2);
    seatMark(S.oppRight, "후리텐", C.red, -10);
    // 내 바닥은 깨끗하다
    const clean = mk(null, {
      position: "absolute", left: `${mine.cx}px`, top: `${mine.y - 18}px`,
      transform: "translateX(-50%)", font: "700 10px/1 ui-monospace, monospace",
      letterSpacing: "1px", color: C.brass, whiteSpace: "nowrap",
    });
    clean.textContent = "내 바닥엔 없다 · 후리텐 회피";
    anim(clean, [{ opacity: 0 }, { opacity: 1 }], { duration: 280 });
    stamp("濡", { x: 500, y: 250, col: C.red, size: 70 });
    banner("누 명", "FRAMED", 1700);
    await sleep(1800);
    fade([h, dark, clean]);
    await sleep(520);
  },
});

def({
  id: "hidden_river", name: "안개 덮인 바닥", tier: "prism", fam: DISRUPT,
  tag: "네 사람의 바닥이 전부 가려지고 나만 본다",
  tech: "박무(brief_fog)와 같은 안개지만 <b>범위와 지속이 다르다</b> — 네 바닥 전부, " +
        "게임 끝까지. 그래서 안개를 <b>내 바닥에서만 걷어</b> 정보 비대칭을 한 화면에 담는다.",
  async run(tok) {
    const dark = veil("brightness(.5)", 340);
    const h = chip("게임 종료까지 — 전원 바닥");
    sfx.whoosh(1.4);
    const fogs = [];
    for (const [i, p] of ponds().entries()) {
      const r = sRect(p);
      const f = mk(null, {
        position: "absolute", left: `${r.x - 26}px`, top: `${r.y - 26}px`,
        width: `${r.w + 52}px`, height: `${r.h + 52}px`,
        background: "rgba(255,255,255,.9)", filter: "url(#fFog)", mixBlendMode: "screen", opacity: "0",
      });
      fogs.push({ el: f, pond: p });
      anim(f, [{ opacity: 0 }, { opacity: 0.62 }], { duration: 900, delay: i * 140, easing: EASE });
      const b = mk(null, {
        position: "absolute", left: `${r.x - 6}px`, top: `${r.y - 6}px`,
        width: `${r.w + 12}px`, height: `${r.h + 12}px`,
        backdropFilter: "blur(0px)", webkitBackdropFilter: "blur(0px)", borderRadius: "8px",
      });
      anim(b, [{ backdropFilter: "blur(0px)" }, { backdropFilter: "blur(6px)" }], { duration: 900, delay: i * 140 });
      fogs.push({ el: b });
    }
    await sleep(1400);
    if (!alive(tok)) return;

    // 내 바닥만 걷힌다
    sfx.impact();
    h.textContent = "나만 전부 본다";
    h.style.borderColor = C.cyan;
    h.style.color = C.cyan;
    for (const f of fogs) {
      if (f.pond === S.pondMe) anim(f.el, [{ opacity: 0.62 }, { opacity: 0 }], { duration: 620, easing: EASE });
    }
    const mr = sRect(S.pondMe);
    const lens = mk(null, {
      position: "absolute", left: `${mr.x - 10}px`, top: `${mr.y - 10}px`,
      width: `${mr.w + 20}px`, height: `${mr.h + 20}px`, borderRadius: "10px",
      border: `1px solid ${C.cyan}`, boxShadow: `0 0 24px ${C.cyan}55, inset 0 0 24px ${C.cyan}33`,
    });
    anim(lens, [{ opacity: 0 }, { opacity: 1 }], { duration: 400 });
    for (const [i, o] of opps().entries()) {
      later(() => alive(tok) && seatMark(o, "바닥 안 보임", C.sageDim, o === S.oppTop ? 76 : 0), i * 140);
    }
    banner("안개 덮인 바닥", "RIVERS HIDDEN", 1700);
    await sleep(1800);
    fade([h, dark, lens, ...fogs.map((f) => f.el)]);
    await sleep(560);
  },
});

def({
  id: "pseudo_dealer", name: "찬탈자", tier: "gold", fam: DISRUPT,
  tag: "그 자리에서 오야를 빼앗아 온다",
  tech: "만년 오야가 '유지'라면 이쪽은 <b>탈취</b>다. 같은 오야 표식을 쓰되 " +
        "<b>남의 자리에서 뜯어내</b> 내 자리로 끌고 온다 — 같은 소품, 반대 방향.",
  async run(tok) {
    const dark = veil("brightness(.5) saturate(.85)", 340);
    const h = chip("현재 오야 — 대면", C.sageDim);
    const CX = 500;
    const CY = 312;
    const R = 214;
    const badge = mk(null, {
      position: "absolute", left: `${CX - 25}px`, top: `${CY - R - 25}px`,
      width: "50px", height: "50px", borderRadius: "50%", display: "grid", placeItems: "center",
      background: "rgba(14,23,18,.94)", border: `2px solid ${C.sage}`,
      font: "800 22px/1 serif", color: C.sage,
    });
    badge.textContent = "親";
    anim(badge, [{ opacity: 0, scale: "0.4" }, { opacity: 1, scale: "1" }], { duration: 300, easing: EASE });
    sfx.riser(1.0);
    await sleep(660);
    if (!alive(tok)) return;

    // 뜯어낸다
    sfx.impact();
    shake(520, 12);
    flash(180, "#dcc79a", 0.34);
    h.textContent = "탈취";
    h.style.borderColor = C.brass;
    h.style.color = C.brass;
    const link = linkTo({ cx: CX, cy: CY - R }, { cx: CX, cy: CY + R }, { col: C.brass, bow: 130, ms: 300, width: 3 });
    anim(badge, [
      { transform: "translate(0,0) scale(1)", borderColor: C.sage, color: C.sage },
      { transform: `translate(90px, ${R}px) scale(1.3)`, offset: 0.6 },
      { transform: `translate(0, ${R * 2}px) scale(1)`, borderColor: C.brass, color: C.brass },
    ], { duration: 820, easing: EASE });
    later(() => {
      if (!alive(tok)) return;
      badge.style.boxShadow = `0 0 26px ${C.brass}`;
      sfx.clack(500);
      ring(CX, CY + R, 16, 150, 580, "rgba(194,160,104,.85)", 2);
    }, 830);
    await sleep(900);
    if (!alive(tok)) return;
    h.textContent = "오야 · 자풍 재설정";
    bigGlyph("簒", { y: 280, col: C.brass, size: 84, ms: 1400 });
    banner("찬 탈 자", "DEALER STOLEN", 1700);
    await sleep(1700);
    fade([h, dark, badge, link]);
    await sleep(520);
  },
});

def({
  id: "push_riichi", name: "등 떠밀기", tier: "prism", fam: DISRUPT,
  tag: "낙인 찍힌 상대의 타패가 강제 리치가 된다",
  tech: "<b>낙인 → 대기 → 발동</b> 세 박자다. 낙인이 상대 좌석에 남아 있다가, " +
        "그가 패를 버리는 순간 <b>본인 의사와 무관하게</b> 리치봉이 밀려 나간다.",
  async run(tok) {
    const dark = veil("brightness(.5) saturate(.85)", 340);
    const h = chip("낙인 지목", C.red);
    const foe = S.oppRight;
    const fr = sRect(foe);
    sfx.impact();
    stamp("印", { x: fr.cx - 96, y: fr.cy, col: C.red, size: 64 });
    const m = seatMark(foe, "낙인", C.red, -10);
    for (const [i, o] of [S.oppTop, S.oppLeft].entries()) {
      later(() => alive(tok) && seatMark(o, "공개", C.sageDim, o === S.oppTop ? 76 : 0), 260 + i * 130);
    }
    await sleep(900);
    if (!alive(tok)) return;

    // 그가 버린다
    h.textContent = "그가 패를 버린다";
    const code = pick(NUM_CODES);
    const pr = sRect(S.pondRight);
    flyTile(code, { x: fr.cx - 20, y: fr.cy, w: 40, h: 54, cx: fr.cx, cy: fr.cy }, pr, { bow: 30, ms: 420 });
    sfx.clack(900);
    await sleep(480);
    if (!alive(tok)) return;

    // 강제 리치
    sfx.impact();
    shake(460, 11);
    flash(180, "#e0555f", 0.3);
    h.textContent = "강제 리치 — 본인 의사 무관";
    const stick = mk(null, {
      position: "absolute", left: `${fr.cx - 56}px`, top: `${fr.cy + 40}px`,
      width: "112px", height: "12px", borderRadius: "6px",
      background: "linear-gradient(180deg,#fff,#d8d2c2)",
    });
    anim(stick, [
      { transform: "translateX(-120px) rotate(-30deg)", opacity: 0 },
      { transform: "translateX(0) rotate(0deg)", opacity: 1 },
    ], { duration: 420, easing: EASE_IMPACT });
    sfx.clack(1400);
    ring(fr.cx, fr.cy + 46, 14, 160, 600, "rgba(224,85,95,.85)", 2);
    bigGlyph("押", { y: 280, col: C.red, size: 84, ms: 1400 });
    banner("등 떠밀기", "FORCED RIICHI", 1700);
    await sleep(1800);
    fade([h, dark, m, stick]);
    await sleep(520);
  },
});

def({
  id: "rank_gate", name: "격(格)", tier: "prism", fam: DISRUPT,
  tag: "지목한 상대는 이번 국에 4판 이하로 화료할 수 없다",
  tech: "'문턱'이 그대로 그림이 된다 — 상대 앞에 <b>4판 높이의 문</b>이 서고, " +
        "낮은 손이 <b>문에 막혀 튕긴다</b>. 조건부 금지는 통과 실패를 보여줘야 이해된다.",
  async run(tok) {
    const dark = veil("brightness(.5) saturate(.85)", 340);
    const h = chip("격 지정 — 4판 이하 불가");
    const foe = S.oppTop;
    const fr = sRect(foe);
    const m = seatMark(foe, "격 4판", C.brass, 76);
    // 문
    const gate = mk(null, {
      position: "absolute", left: `${fr.cx - 110}px`, top: `${fr.cy + 108}px`,
      width: "220px", height: "10px", borderRadius: "5px",
      background: `linear-gradient(180deg, ${C.brass}, ${C.brassDim})`,
      boxShadow: `0 0 20px ${C.brass}88`,
    });
    anim(gate, [{ opacity: 0, transform: "scaleX(0)" }, { opacity: 1, transform: "scaleX(1)" }], { duration: 420, easing: EASE });
    const lb = mk(null, {
      position: "absolute", left: `${fr.cx}px`, top: `${fr.cy + 122}px`, transform: "translateX(-50%)",
      font: "800 11px/1 ui-monospace, monospace", letterSpacing: "2px", color: C.brass, whiteSpace: "nowrap",
    });
    lb.textContent = "4판 선";
    anim(lb, [{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: 200 });
    sfx.riser(0.9);
    await sleep(900);
    if (!alive(tok)) return;

    // 낮은 손이 튕긴다
    h.textContent = "2판 화료 시도";
    const low = mk(null, {
      position: "absolute", left: `${fr.cx - 30}px`, top: `${fr.cy + 210}px`,
      width: "60px", height: "34px", borderRadius: "var(--r-sm)",
      background: "rgba(60,14,18,.9)", border: `1px solid ${C.red}`,
      display: "grid", placeItems: "center", font: "800 14px/1 ui-monospace, monospace", color: C.redLite,
    });
    low.textContent = "2판";
    anim(low, [
      { transform: "translateY(0)", opacity: 0 },
      { transform: "translateY(-72px)", opacity: 1, offset: 0.55 },
      { transform: "translateY(-56px)", offset: 0.7 },
      { transform: "translateY(40px)", opacity: 0 },
    ], { duration: 900, easing: EASE });
    later(() => {
      if (!alive(tok)) return;
      sfx.clack(320);
      sfx.impact();
      flash(140, "#e0555f", 0.22);
      ring(fr.cx, fr.cy + 112, 12, 140, 520, "rgba(224,85,95,.8)", 2);
      anim(gate, [{ transform: "scaleX(1) translateY(0)" }, { transform: "scaleX(1) translateY(-5px)" }, { transform: "scaleX(1) translateY(0)" }], { duration: 260 });
    }, 520);
    await sleep(1000);
    if (!alive(tok)) return;
    h.textContent = "화료 불가 — 격에 미달";
    h.style.borderColor = C.red;
    h.style.color = C.red;
    bigGlyph("格", { y: 300, col: C.brass, size: 86, ms: 1400 });
    banner("격 (格)", "RANK GATE · 4", 1700);
    await sleep(1700);
    fade([h, dark, gate, lb, m]);
    await sleep(520);
  },
});

def({
  id: "scapegoat", name: "덤터기", tier: "gold", fam: DISRUPT,
  tag: "내 쯔모 지불을 지목한 상대가 전액 부담한다",
  tech: "책임전가의 <b>반대</b>다 — 저쪽은 셋으로 갈라지고 이쪽은 <b>셋이 하나로 모인다</b>. " +
        "같은 계열에 반대 문장을 두면 둘 다 무슨 증강인지 한 번에 이해된다.",
  async run(tok) {
    const dark = veil("brightness(.5) saturate(.85)", 340);
    const h = chip("쯔모 — 원래는 셋이 분담");
    const me = { cx: sRect(S.myhand).cx, cy: sRect(S.myhand).y - 30 };
    // 셋이 조금씩
    const first = [];
    for (const [i, o] of opps().entries()) {
      first.push(linkTo(sRect(o), me, { col: `${C.sageDim}99`, bow: i === 0 ? 0 : i === 1 ? 90 : -90, ms: 340 }));
    }
    sfx.riser(0.8);
    await sleep(760);
    if (!alive(tok)) return;

    // 하나로 모인다
    sfx.impact();
    h.textContent = "덤터기 — 한 명이 전액";
    h.style.borderColor = C.red;
    h.style.color = C.red;
    for (const l of first) anim(l.path, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
    const victim = S.oppLeft;
    stamp("責", { x: sRect(victim).cx + 92, y: sRect(victim).cy, col: C.red, size: 66 });
    const m = seatMark(victim, "전액 부담", C.red, -96);
    for (const [i, o] of [S.oppTop, S.oppRight].entries()) {
      later(() => alive(tok) && seatMark(o, "면제", C.sageDim, o === S.oppTop ? 76 : 0), 200 + i * 130);
    }
    await sleep(420);
    if (!alive(tok)) return;
    const link = linkTo(sRect(victim), me, { col: C.red, bow: 90, ms: 360, width: 5 });
    for (let i = 0; i < 7; i++) {
      later(() => {
        if (!alive(tok)) return;
        const vr = sRect(victim);
        const c = mk(null, {
          position: "absolute", left: `${vr.cx}px`, top: `${vr.cy}px`,
          width: "15px", height: "15px", borderRadius: "50%", marginLeft: "-7px", marginTop: "-7px",
          background: `radial-gradient(circle at 35% 35%, #fff0c8, ${C.brass} 60%, #6f5526)`,
          boxShadow: `0 0 12px ${C.brass}`,
        });
        anim(c, [
          { transform: "translate(0,0)", opacity: 1 },
          { transform: `translate(${me.cx - vr.cx}px, ${me.cy - vr.cy}px)`, opacity: 0 },
        ], { duration: 620, easing: EASE }).finished.then(() => c.remove()).catch(() => c.remove());
        sTone({ f: 800 + i * 90, dur: 0.06, gain: 0.045, type: "sine" });
      }, i * 110);
    }
    countUp(S.csBottom, 25000, 33000, 1000);
    banner("덤 터 기", "SCAPEGOAT", 1700);
    await sleep(1800);
    fade([h, dark, m, link, ...first]);
    await sleep(520);
  },
});
