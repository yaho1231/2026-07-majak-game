/* 이능마작 증강 연출 랩 — 4차 배치 B · 점수 14종
 *
 * 점수 계열은 전부 "숫자가 움직인다"로 끝나기 쉬워서 제일 지루해지기 쉬운 계열이다.
 * 그래서 여기서는 **숫자가 아니라 돈의 경로**를 그린다 — 어디서 와서 누구를 거쳐 어디로
 * 가는지. 액수는 결과일 뿐이고, 판단을 바꾸는 건 경로다.
 */

import {
  C, EASE, EASE_IMPACT, NUM_CODES, S, alive, anim, banner, bigGlyph, chip, clamp, countUp,
  drawHooks, fade, fallParticles, flash, flyTile, glowTiles, handTiles, hexShield, later, linkTo,
  meter, mk, mkSvg, opps, orbitRing, pick, ponds, ring, rnd, sRect, sTone, seatMark, setTile, sfx,
  shake, sleep, sparkBurst, stamp, svgEl, tileEl, veil,
} from "/fx-kit.js?v=9";
import { def } from "/fx-registry.js?v=9";

const FAM = "점수 · 경로";

/** 좌석 → 나로 흐르는 돈줄. 점수 계열의 공용 문장이다. */
function moneyFlow(fromEl, toR, { col = C.brass, ms = 900, n = 5, bow = 60 } = {}) {
  const fr = sRect(fromEl);
  const link = linkTo(fr, toR, { col: `${col}66`, bow, ms: 300 });
  for (let i = 0; i < n; i++) {
    later(() => {
      const c = mk(null, {
        position: "absolute", left: `${fr.cx}px`, top: `${fr.cy}px`,
        width: "14px", height: "14px", borderRadius: "50%", marginLeft: "-7px", marginTop: "-7px",
        background: `radial-gradient(circle at 35% 35%, #fff0c8, ${col} 60%, #6f5526)`,
        boxShadow: `0 0 12px ${col}`,
      });
      const mx = (fr.cx + toR.cx) / 2 + bow;
      const my = (fr.cy + toR.cy) / 2;
      const steps = [];
      for (let k = 0; k <= 8; k++) {
        const p = k / 8;
        const u = 1 - p;
        steps.push({
          transform: `translate(${(u * u * fr.cx + 2 * u * p * mx + p * p * toR.cx - fr.cx).toFixed(1)}px, ${(u * u * fr.cy + 2 * u * p * my + p * p * toR.cy - fr.cy).toFixed(1)}px)`,
          offset: p,
        });
      }
      anim(c, steps, { duration: ms * 0.6, easing: EASE });
      anim(c, [{ opacity: 1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: ms * 0.6 })
        .finished.then(() => c.remove()).catch(() => c.remove());
      sTone({ f: 900 + i * 120, dur: 0.06, gain: 0.04, type: "sine" });
    }, i * (ms / n / 2));
  }
  return link;
}

/* ══════════════════ 밀실의 도라 ══════════════════ */

def({
  id: "ankan_dora", name: "밀실의 도라", tier: "prism", fam: FAM,
  tag: "안깡한 패 종류가 나만의 도라가 된다",
  tech: "표시패를 뒤집지 않는 게 규칙의 요점이라, <b>표시패 쪽은 일부러 조용히 두고</b> " +
        "내 손패에서만 도라 표시가 켜진다. '남들은 모른다'를 표시패의 <b>무반응</b>으로 말한다.",
  async run(tok) {
    const dark = veil("brightness(.52)", 330);
    const h = chip("안깡 — 밀실");
    const tiles = handTiles();
    const kanCode = pick(NUM_CODES);
    // 안깡 4장 — 양끝은 뒷면
    const kan = tiles.slice(0, 4);
    for (const [i, el] of kan.entries()) {
      later(() => {
        if (!alive(tok)) return;
        if (i === 0 || i === 3) {
          el.classList.add("back");
          el.textContent = "";
        } else setTile(el, kanCode, { ms: 200 });
        anim(el, [{ transform: "translateY(-10px)" }, { transform: "translateY(0)" }], { duration: 240, easing: EASE_IMPACT });
        sfx.clack(rnd(900, 1300));
      }, i * 90);
    }
    sfx.riser(0.8);
    await sleep(700);
    if (!alive(tok)) return;

    // 표시패는 반응하지 않는다 — 그게 핵심
    const wr = sRect(S.wallTop);
    const quiet = mk(null, {
      position: "absolute", left: `${wr.cx - 74}px`, top: `${wr.y + wr.h + 8}px`,
      padding: "3px 9px", borderRadius: "5px", border: `1px dashed ${C.sageDim}`,
      background: "rgba(14,23,18,.85)", font: "700 10px/1 ui-monospace, monospace",
      letterSpacing: "2px", color: C.sageDim, whiteSpace: "nowrap",
    });
    quiet.textContent = "표시패 그대로 · 아무도 모른다";
    anim(quiet, [{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
    await sleep(500);
    if (!alive(tok)) return;

    // 내 손패에서만 도라가 켜진다
    sfx.impact();
    h.textContent = `${kanCode} 가 나만의 도라`;
    const hits = tiles.filter((el) => el.dataset.code === kanCode);
    const off = glowTiles(hits.length ? hits : kan, C.brass, { lift: 8, stagger: 70 });
    for (const [i, el] of (hits.length ? hits : kan).entries()) {
      const r = sRect(el);
      later(() => alive(tok) && ring(r.cx, r.cy, 8, 70, 440, "rgba(194,160,104,.8)", 2), i * 70);
    }
    bigGlyph("密", { y: 280, col: C.brass, size: 80, ms: 1300 });
    banner("밀실의 도라", "SECRET DORA", 1600);
    await sleep(1700);
    off();
    fade([h, dark, quiet]);
    await sleep(520);
  },
});

/* ══════════════════ 큰손 ══════════════════ */

def({
  id: "big_hand", name: "큰손", tier: "prism", fam: FAM,
  tag: "선언하면 그 국의 화료가 최소 만관이 된다",
  tech: "값싼 손이 <b>바닥에서 끌어올려지는</b> 그림. 점수 눈금을 세로로 세우고 " +
        "손의 값이 <b>만관 선까지 끌려 올라간다</b> — 하한선이 있다는 건 '올라간다'로 보여야 한다.",
  async run(tok) {
    const dark = veil("brightness(.5)", 330);
    const h = chip("선언 — 최소 만관 보장");
    // 세로 점수 눈금
    const X = 300;
    const sv = mkSvg({ zIndex: "4" });
    const marks = [["1000", 470], ["3900", 400], ["7700", 330], ["만관 8000", 262]];
    for (const [lb, y] of marks) {
      svgEl("line", { x1: X - 12, y1: y, x2: X + 12, y2: y, stroke: lb.startsWith("만") ? C.brass : "rgba(236,228,210,.3)", "stroke-width": lb.startsWith("만") ? 3 : 1.5 }, sv);
      const t = mk(null, {
        position: "absolute", left: `${X + 22}px`, top: `${y - 7}px`,
        font: "700 11px/1 ui-monospace, monospace", color: lb.startsWith("만") ? C.brass : C.sageDim, whiteSpace: "nowrap",
      });
      t.textContent = lb;
    }
    svgEl("line", { x1: X, y1: 250, x2: X, y2: 486, stroke: "rgba(236,228,210,.25)", "stroke-width": 1.5 }, sv);
    const bar = mk(null, {
      position: "absolute", left: `${X - 9}px`, top: "470px", width: "18px", height: "18px",
      borderRadius: "50%", background: C.sage, boxShadow: `0 0 12px ${C.sage}`, marginTop: "-9px",
    });
    anim(bar, [{ opacity: 0, scale: "0.3" }, { opacity: 1, scale: "1" }], { duration: 280, easing: EASE });
    sfx.riser(0.9);
    await sleep(660);
    if (!alive(tok)) return;

    // 끌어올린다
    sfx.whoosh(0.9);
    h.textContent = "1000점 → 만관";
    anim(bar, [{ transform: "translateY(0)" }, { transform: `translateY(${262 - 470}px)` }], { duration: 900, easing: EASE });
    anim(bar, [{ background: C.sage, boxShadow: `0 0 12px ${C.sage}` }, { background: C.brass, boxShadow: `0 0 22px ${C.brass}` }], { duration: 900 });
    await sleep(920);
    if (!alive(tok)) return;
    sfx.impact();
    flash(180, "#dcc79a", 0.36);
    ring(X, 262, 14, 200, 640, "rgba(194,160,104,.8)", 3);
    sparkBurst(X, 262, { n: 22, col: "220,199,154", spread: 150 });
    bigGlyph("満貫", { x: 620, y: 300, col: C.brass, size: 66, ms: 1400 });
    banner("큰 손", "MANGAN FLOOR", 1600);
    await sleep(1700);
    fade([h, dark, sv, bar]);
    await sleep(520);
  },
});

/* ══════════════════ 책임전가 ══════════════════ */

def({
  id: "blame_shift", name: "책임전가", tier: "prism", fam: FAM,
  tag: "론의 지불이 쏜 사람 혼자가 아니라 셋에게 분담된다",
  tech: "이 증강의 전부는 <b>화살표의 개수가 1에서 3으로 바뀌는 것</b>이다. 액수는 그대로이므로 " +
        "숫자를 키우면 거짓말이 된다 — <b>같은 총량이 갈라지는</b> 그림으로만 말한다.",
  async run(tok) {
    const dark = veil("brightness(.5) saturate(.8)", 340);
    const h = chip("론 — 방총자 단독 지불", C.red);
    const me = { cx: sRect(S.myhand).cx, cy: sRect(S.myhand).y - 30 };
    const dealer = S.oppTop;
    seatMark(dealer, "방총", C.red, 76);
    // 원래: 한 명이 전부
    const one = linkTo(sRect(dealer), me, { col: C.red, bow: 0, ms: 420, width: 5 });
    sfx.impact();
    await sleep(760);
    if (!alive(tok)) return;

    // 갈라진다
    sfx.whoosh(0.7);
    h.textContent = "지불 분담 — 총액 동일";
    anim(one.path, [{ opacity: 1, strokeWidth: 5 }, { opacity: 0, strokeWidth: 1 }], { duration: 340 });
    const links = [];
    for (const [i, o] of opps().entries()) {
      later(() => {
        if (!alive(tok)) return;
        links.push(moneyFlow(o, me, { col: C.brass, n: 3, bow: i === 0 ? 0 : i === 1 ? 90 : -90, ms: 900 }));
        seatMark(o, "1/3", C.brass, o === S.oppTop ? 100 : 22);
      }, i * 160);
    }
    await sleep(1200);
    if (!alive(tok)) return;
    countUp(S.csBottom, 25000, 33000, 900);
    anim(S.csBottom, [{ scale: "1" }, { scale: "1.4" }, { scale: "1" }], { duration: 700 });
    bigGlyph("転嫁", { y: 260, col: C.brass, size: 62, ms: 1300 });
    banner("책임전가", "BLAME SHIFTED", 1600);
    await sleep(1700);
    fade([h, dark, one, ...links]);
    await sleep(520);
  },
});

/* ══════════════════ 카운터 ══════════════════ */

def({
  id: "counter", name: "카운터", tier: "silver", fam: FAM,
  tag: "상대 리치에 추격 리치로 받아친다 — 일발이 사라진다",
  tech: "반격이므로 <b>상대의 것이 꺼지는</b> 것이 먼저다. 상대 일발 표시가 깨지고 " +
        "내 공탁을 상대가 대납한다 — 두 사건을 같은 선 위에서 <b>역방향으로</b> 그린다.",
  async run(tok) {
    const dark = veil("brightness(.5) saturate(.85)", 340);
    const h = chip("상대 리치 · 일발 유효", C.red);
    const or = sRect(S.oppTop);
    const ippatsu = seatMark(S.oppTop, "일발", C.red, 76);
    sfx.clack(1300);
    await sleep(560);
    if (!alive(tok)) return;

    // 추격 리치
    h.textContent = "추격 리치";
    const stick = mk(null, {
      position: "absolute", left: "444px", top: "398px", width: "112px", height: "12px",
      borderRadius: "6px", background: "linear-gradient(180deg,#fff,#d8d2c2)",
    });
    anim(stick, [{ opacity: 0, transform: "translateY(-30px)" }, { opacity: 1, transform: "none" }], { duration: 300, easing: EASE });
    sfx.clack(1500);
    sfx.impact();
    shake(400, 10);
    await sleep(420);
    if (!alive(tok)) return;

    // 일발이 깨진다
    sfx.shatter();
    anim(ippatsu, [
      { opacity: 1, transform: "scale(1)" },
      { opacity: 0, transform: "scale(1.6) rotate(14deg)" },
    ], { duration: 380, easing: EASE });
    ring(or.cx, or.cy + 76, 10, 120, 520, "rgba(224,85,95,.85)", 2);
    await sleep(380);
    if (!alive(tok)) return;

    // 공탁 대납 — 내 봉이 상대에게서 온다
    h.textContent = "공탁 1000 대납 · 일발 소멸";
    moneyFlow(S.oppTop, { cx: 500, cy: 404 }, { col: C.brass, n: 4, bow: 60, ms: 800 });
    bigGlyph("返", { y: 280, col: C.brass, size: 84, ms: 1300 });
    banner("카 운 터", "COUNTER", 1600);
    await sleep(1700);
    fade([h, dark, stick]);
    await sleep(520);
  },
});

/* ══════════════════ 가불 인생 ══════════════════ */

def({
  id: "devils_advance", name: "가불 인생", tier: "prism", fam: FAM,
  tag: "10,000점을 미리 받고 빚이 전원에게 공개된다",
  tech: "빚은 <b>계속 보이는 표식</b>이어야 무섭다. 받는 순간은 짧게, 그 뒤 <b>빚 도장이 " +
        "내 점수 옆에 남는다</b> — 사라지지 않는 것이 이 증강의 실체다.",
  async run(tok) {
    const dark = veil("brightness(.5) saturate(.85)", 340);
    const h = chip("뱅크에서 선지급");
    const me = { cx: sRect(S.myhand).cx, cy: sRect(S.myhand).y - 40 };
    // 돈이 위에서 쏟아진다
    sfx.riser(1.0);
    const stopRain = fallParticles({ n: 40, col: "220,199,154", size: [2, 5], vy: [2.4, 5], life: 60, shape: "ellipse" });
    countUp(S.csBottom, 25000, 35000, 1000);
    anim(S.csBottom, [{ scale: "1" }, { scale: "1.5" }, { scale: "1" }], { duration: 900 });
    await sleep(1050);
    if (!alive(tok)) return;
    stopRain();
    sfx.impact();

    // 빚 도장 — 남는다
    h.textContent = "빚 10,000 · 전원 공개";
    const cr = sRect(S.csBottom);
    const debt = mk(null, {
      position: "absolute", left: `${cr.cx - 44}px`, top: `${cr.cy + 16}px`,
      padding: "3px 9px", borderRadius: "5px",
      background: "rgba(60,10,16,.92)", border: `1px solid ${C.red}`,
      font: "800 11px/1 ui-monospace, monospace", letterSpacing: "1px", color: C.redLite, whiteSpace: "nowrap",
    });
    debt.textContent = "− 10,000 빚";
    anim(debt, [{ opacity: 0, scale: "1.6" }, { opacity: 1, scale: "1" }], { duration: 320, easing: EASE });
    // 전원이 본다
    for (const [i, o] of opps().entries()) {
      later(() => alive(tok) && seatMark(o, "빚 확인", C.sageDim, o === S.oppTop ? 76 : 0), 300 + i * 130);
    }
    stamp("借", { x: 500, y: 280, col: C.red, size: 80 });
    banner("가불 인생", "ADVANCE TAKEN", 1700);
    await sleep(1900);
    fade([h, dark]);
    await sleep(520);
  },
});

/* ══════════════════ 만년 오야 ══════════════════ */

def({
  id: "eternal_dealer", name: "만년 오야", tier: "prism", fam: FAM,
  tag: "언제나 오야로 계산되고 오야 자리가 넘어가지 않는다",
  tech: "'자리가 안 넘어간다'를 보여주려면 <b>넘어가려다 되돌아와야</b> 한다. " +
        "오야 표식이 옆자리로 갔다가 <b>끌려 돌아온다</b> — 유지는 정지가 아니라 저항이다.",
  async run(tok) {
    const dark = veil("brightness(.55)", 320);
    const h = chip("오야 자리 이동 시도");
    const CX = 500;
    const CY = 312;
    const R = 214;
    const badge = mk(null, {
      position: "absolute", left: `${CX - 25}px`, top: `${CY + R - 25}px`,
      width: "50px", height: "50px", borderRadius: "50%", display: "grid", placeItems: "center",
      background: "rgba(14,23,18,.94)", border: `2px solid ${C.brass}`,
      boxShadow: `0 0 22px ${C.brass}99`, font: "800 22px/1 serif", color: C.brass,
    });
    badge.textContent = "親";
    anim(badge, [{ opacity: 0, scale: "0.4" }, { opacity: 1, scale: "1" }], { duration: 300, easing: EASE });
    sfx.riser(0.8);
    await sleep(600);
    if (!alive(tok)) return;

    // 옆으로 가려다가
    sfx.whoosh(0.6);
    const steps = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const a = ((90 + 62 * t) * Math.PI) / 180;
      steps.push({ transform: `translate(${(R * Math.cos(a)).toFixed(1)}px, ${(R * Math.sin(a) - R).toFixed(1)}px)`, offset: t });
    }
    anim(badge, steps, { duration: 620, easing: EASE });
    await sleep(640);
    if (!alive(tok)) return;

    // 끌려 돌아온다
    sfx.impact();
    shake(420, 9);
    h.textContent = "오야 유지 — 자리 고정";
    const back = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const a = ((152 - 62 * t) * Math.PI) / 180;
      back.push({ transform: `translate(${(R * Math.cos(a)).toFixed(1)}px, ${(R * Math.sin(a) - R).toFixed(1)}px)`, offset: t });
    }
    anim(badge, back, { duration: 520, easing: EASE_IMPACT });
    orbitRing(CX, CY, R, { col: `${C.brass}66`, ms: 6000 });
    later(() => {
      if (!alive(tok)) return;
      sfx.clack(500);
      ring(CX, CY + R, 16, 130, 560, "rgba(194,160,104,.85)", 2);
      anim(badge, [{ scale: "1" }, { scale: "1.35" }, { scale: "1" }], { duration: 380, easing: EASE });
    }, 540);
    bigGlyph("永", { y: 300, col: C.brass, size: 86, ms: 1400 });
    banner("만년 오야", "ETERNAL DEALER", 1600);
    await sleep(1800);
    fade([h, dark, badge]);
    await sleep(520);
  },
});

/* ══════════════════ 숨은 칼날 ══════════════════ */

def({
  id: "hidden_blade", name: "숨은 칼날", tier: "gold", fam: FAM,
  tag: "리치를 안 걸어도 리치 2판 + 뒷도라가 붙는다",
  tech: "'안 걸었는데 걸린 것처럼'이라 <b>없던 리치봉이 뒤늦게 나타난다</b>. " +
        "칼은 뽑을 때가 아니라 <b>이미 박힌 뒤에</b> 보여야 무섭다 — 화료 순간에 역산해서 등장한다.",
  async run(tok) {
    const dark = veil("brightness(.5) saturate(.85)", 340);
    const h = chip("멘젠 론 — 리치 없음", C.sageDim);
    const hr = sRect(S.myhand);
    sfx.impact();
    await sleep(420);
    if (!alive(tok)) return;

    // 칼날이 손패 아래에서 뽑힌다
    sfx.riser(0.7);
    const sv = mkSvg({ zIndex: "6" });
    const blade = svgEl("path", {
      d: `M${hr.x - 40} ${hr.cy} L${hr.x + hr.w + 40} ${hr.cy}`,
      fill: "none", stroke: "#eef3f6", "stroke-width": 3, "stroke-linecap": "round",
    }, sv);
    blade.style.filter = "drop-shadow(0 0 12px rgba(238,243,246,.9))";
    const L = blade.getTotalLength();
    blade.setAttribute("stroke-dasharray", `${L}`);
    blade.setAttribute("stroke-dashoffset", `${L}`);
    anim(blade, [{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 380, easing: EASE });
    sTone({ f: 2600, f2: 1400, dur: 0.22, gain: 0.07, type: "sine" });
    await sleep(460);
    if (!alive(tok)) return;

    // 뒤늦은 리치봉 + 뒷도라
    sfx.impact();
    flash(170, "#fff", 0.34);
    h.textContent = "리치 2판 · 뒷도라 적용";
    const stick = mk(null, {
      position: "absolute", left: "444px", top: "398px", width: "112px", height: "12px",
      borderRadius: "6px", background: "linear-gradient(180deg,#fff,#d8d2c2)",
    });
    anim(stick, [
      { opacity: 0, transform: "scaleX(0)" },
      { opacity: 1, transform: "scaleX(1)" },
    ], { duration: 360, easing: EASE });
    const tags = [];
    for (const [i, t] of ["리치 ×2", "뒷도라"].entries()) {
      const g = mk(null, {
        position: "absolute", left: `${420 + i * 110}px`, top: "268px",
        padding: "5px 12px", borderRadius: "999px",
        background: "rgba(14,23,18,.92)", border: `1px solid ${C.brass}`,
        font: "800 12px/1 ui-monospace, monospace", color: C.brass, whiteSpace: "nowrap",
      });
      g.textContent = t;
      tags.push(g);
      anim(g, [{ opacity: 0, translate: "0 10px" }, { opacity: 1, translate: "0 0" }], { duration: 280, delay: i * 140, easing: EASE });
    }
    bigGlyph("刃", { y: 200, col: "#eef3f6", size: 78, ms: 1300 });
    banner("숨은 칼날", "HIDDEN BLADE", 1600);
    await sleep(1800);
    fade([h, dark, sv, stick, ...tags]);
    await sleep(520);
  },
});

/* ══════════════════ 본장 사냥꾼 ══════════════════ */

def({
  id: "honba_hunter", name: "본장 사냥꾼", tier: "prism", fam: FAM,
  tag: "본장 1개가 300점이 아니라 1500점이 된다",
  tech: "배율 증강은 <b>같은 것을 두 줄로 나란히</b> 놓아야 체감된다. 본장 막대를 " +
        "쌓아 올리고 그 옆에 원래 값과 내 값을 <b>동시에</b> 굴린다 — 비교 없이 배율은 안 보인다.",
  async run(tok) {
    const dark = veil("brightness(.52)", 330);
    const h = chip("5본장");
    const sticks = [];
    for (let i = 0; i < 5; i++) {
      const s = mk(null, {
        position: "absolute", left: "430px", top: `${420 - i * 16}px`,
        width: "140px", height: "11px", borderRadius: "5px",
        background: "linear-gradient(180deg,#e0555f,#8a1420)",
        boxShadow: "0 2px 6px rgba(4,9,7,.6)",
      });
      sticks.push(s);
      anim(s, [{ opacity: 0, transform: "translateY(-30px) rotate(-8deg)" }, { opacity: 1, transform: "none" }], {
        duration: 280, delay: i * 130, easing: EASE_IMPACT,
      });
      later(() => alive(tok) && sfx.clack(rnd(700, 1000)), i * 130);
    }
    sfx.riser(0.9);
    await sleep(5 * 130 + 380);
    if (!alive(tok)) return;

    // 두 줄 비교
    const rows = [];
    for (const [i, r] of [["일반", 1500, C.sageDim], ["나", 7500, C.brass]].entries()) {
      const box = mk(null, {
        position: "absolute", left: "356px", top: `${250 + i * 42}px`, width: "288px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "7px 14px", borderRadius: "var(--r-md)",
        background: "rgba(14,23,18,.9)", border: `1px solid ${r[2]}`,
        font: "800 14px/1 ui-monospace, monospace", color: r[2],
      });
      const lb = mk(null, {}, box);
      lb.textContent = r[0];
      const val = mk(null, {}, box);
      val.textContent = "0";
      rows.push(box);
      anim(box, [{ opacity: 0, translate: "-14px 0" }, { opacity: 1, translate: "0 0" }], {
        duration: 280, delay: i * 160, easing: EASE,
      });
      later(() => alive(tok) && countUp(val, 0, r[1], 900, (n) => `+${Math.round(n).toLocaleString()}`), i * 160 + 220);
    }
    await sleep(1400);
    if (!alive(tok)) return;
    sfx.impact();
    flash(160, "#dcc79a", 0.3);
    anim(rows[1], [{ scale: "1" }, { scale: "1.1" }, { scale: "1.04" }], { duration: 420, easing: EASE });
    banner("본장 사냥꾼", "HONBA ×5", 1600);
    await sleep(1700);
    fade([h, dark, ...sticks, ...rows]);
    await sleep(520);
  },
});

/* ══════════════════ 카르마 ══════════════════ */

def({
  id: "karma", name: "카르마", tier: "prism", fam: FAM,
  tag: "잃은 만큼 업보가 쌓이고 태워서 되찾는다",
  tech: "적립 → 방출 두 국면이라 <b>같은 게이지가 채워졌다가 비워진다</b>. " +
        "채울 때는 붉게, 태울 때는 금빛으로 바뀐다 — 같은 그릇의 색만 바꿔 성격을 뒤집는다.",
  async run(tok) {
    const dark = veil("brightness(.5) saturate(.85)", 340);
    const h = chip("실점 — 업보 적립", C.red);
    const m = meter(350, 262, 300, "업보", C.red);
    const wheel = orbitRing(500, 300, 150, { col: `${C.red}55`, ms: 7000, dash: "18 12" });
    sfx.riser(0.8);
    await sleep(420);
    if (!alive(tok)) return;

    // 적립 — 세 번 잃는다
    for (const [i, v] of [0.34, 0.66, 1].entries()) {
      if (!alive(tok)) return;
      m.set(v, 420);
      h.textContent = `업보 ${Math.round(v * 8000).toLocaleString()}`;
      sfx.clack(400);
      shake(220, 5);
      await sleep(520);
    }
    if (!alive(tok)) return;

    // 태운다
    sfx.impact();
    h.textContent = "업보 소각 — 강탈";
    h.style.borderColor = C.brass;
    h.style.color = C.brass;
    m.tint(C.brass);
    flash(190, "#dcc79a", 0.4);
    const me = { cx: sRect(S.myhand).cx, cy: sRect(S.myhand).y - 30 };
    for (const [i, o] of opps().entries()) {
      later(() => alive(tok) && moneyFlow(o, me, { col: C.brass, n: 4, bow: i === 0 ? 0 : i === 1 ? 90 : -90, ms: 900 }), i * 150);
    }
    m.set(0, 900);
    countUp(S.csBottom, 25000, 33000, 1100);
    bigGlyph("業", { y: 300, col: C.brass, size: 90, ms: 1500 });
    banner("카 르 마", "KARMA BURNED", 1700);
    await sleep(1800);
    fade([h, dark, m, wheel]);
    await sleep(520);
  },
});

/* ══════════════════ 판돈 굴리기 ══════════════════ */

def({
  id: "let_it_ride", name: "판돈 굴리기", tier: "gold", fam: FAM,
  tag: "연속 화료할수록 배수가 2 → 3 → 4배로 오른다",
  tech: "배수는 <b>계단</b>이다. 한 칸씩 올라가는 것을 보여주고, 방총하면 " +
        "<b>맨 아래로 떨어지는</b> 것까지 같은 계단에서 보여준다 — 위험을 같은 그림에 담아야 도박이 된다.",
  async run(tok) {
    const dark = veil("brightness(.52)", 330);
    const h = chip("연속 화료");
    // 계단 3칸
    const steps = [];
    for (let i = 0; i < 3; i++) {
      const s = mk(null, {
        position: "absolute", left: `${370 + i * 90}px`, top: `${360 - i * 44}px`,
        width: "82px", height: `${44 * (i + 1)}px`, borderRadius: "var(--r-sm)",
        background: "rgba(14,23,18,.9)", border: `1px solid ${C.brassDim}`,
        display: "grid", placeItems: "start center", paddingTop: "8px",
        font: "800 16px/1 ui-monospace, monospace", color: C.sageDim,
      });
      s.textContent = `×${i + 2}`;
      steps.push(s);
      anim(s, [{ opacity: 0, translate: "0 14px" }, { opacity: 1, translate: "0 0" }], {
        duration: 260, delay: i * 110, easing: EASE,
      });
    }
    const mark = mk(null, {
      position: "absolute", left: "398px", top: "334px", width: "26px", height: "26px",
      borderRadius: "50%", background: C.brass, boxShadow: `0 0 16px ${C.brass}`,
    });
    sfx.riser(0.8);
    await sleep(620);
    if (!alive(tok)) return;

    // 한 칸씩 오른다
    for (let i = 0; i < 3; i++) {
      if (!alive(tok)) return;
      steps[i].style.color = C.brass;
      steps[i].style.borderColor = C.brass;
      anim(mark, [{ transform: `translate(${i === 0 ? 0 : (i - 1) * 90}px, ${i === 0 ? 0 : -(i - 1) * 44}px)` }, { transform: `translate(${i * 90}px, ${-i * 44}px)` }], {
        duration: 380, easing: EASE,
      });
      h.textContent = `${i + 1}연속 · ×${i + 2}`;
      sfx.clack(700 + i * 250);
      sparkBurst(411 + i * 90, 347 - i * 44, { n: 12, col: "220,199,154", spread: 70 });
      await sleep(560);
    }
    if (!alive(tok)) return;

    // 방총 — 맨 아래로
    sfx.impact();
    shake(460, 11);
    h.textContent = "방총 — ×2 로 초기화";
    h.style.borderColor = C.red;
    h.style.color = C.red;
    anim(mark, [{ transform: "translate(180px,-88px)" }, { transform: "translate(0,0)" }], { duration: 520, easing: "cubic-bezier(.5,0,.9,.6)" });
    for (const s of steps.slice(1)) {
      s.style.color = C.sageDim;
      s.style.borderColor = C.brassDim;
    }
    banner("판돈 굴리기", "LET IT RIDE", 1600);
    await sleep(1700);
    fade([h, dark, mark, ...steps]);
    await sleep(520);
  },
});

/* ══════════════════ 유국역만 ══════════════════ */

def({
  id: "nagashi_yakuman", name: "유국역만", tier: "prism", fam: FAM,
  tag: "내 버림패가 전부 요구패면 유국이 역만이 된다",
  tech: "조건이 <b>이미 쌓여 있던 버림패</b>에 있으므로, 새 연출을 얹는 대신 " +
        "<b>바닥을 검사하는</b> 그림을 쓴다. 한 장씩 확인되며 켜지고 마지막에 전체가 승격된다.",
  async run(tok) {
    const dark = veil("brightness(.5) saturate(.8)", 340);
    const h = chip("유국 — 버림패 검사");
    const river = [...S.pondMe.querySelectorAll(".tf")];
    // 전부 요구패로 바꿔놓는다
    const yaochu = ["1m", "9m", "1p", "9p", "1s", "9s", "1z", "2z", "3z", "5z", "6z", "7z"];
    sfx.riser(1.0);
    for (const [i, el] of river.entries()) {
      later(() => {
        if (!alive(tok)) return;
        setTile(el, pick(yaochu), { ms: 200 });
        el.style.outline = `1.5px solid ${C.brass}`;
        el.style.outlineOffset = "1px";
        const r = sRect(el);
        ring(r.cx, r.cy, 6, 44, 340, "rgba(194,160,104,.7)", 1.5);
        sTone({ f: 1100 + i * 70, dur: 0.05, gain: 0.05, type: "sine" });
      }, i * 130);
    }
    await sleep(river.length * 130 + 420);
    if (!alive(tok)) return;

    // 전체 승격
    sfx.impact();
    sfx.chime();
    flash(260, "#dcc79a", 0.55);
    shake(560, 12);
    const pr = sRect(S.pondMe);
    ring(pr.cx, pr.cy, 30, 520, 900, "rgba(194,160,104,.85)", 4);
    h.textContent = "전부 요구패 · 역만 격상";
    bigGlyph("流し役満", { y: 250, col: C.brass, size: 54, ms: 1700 });
    countUp(S.csBottom, 25000, 57000, 1400);
    anim(S.csBottom, [{ scale: "1" }, { scale: "1.6" }, { scale: "1.1" }], { duration: 1000 });
    banner("유국역만", "NAGASHI YAKUMAN", 1900);
    await sleep(2000);
    for (const el of river) el.style.outline = "";
    fade([h, dark]);
    await sleep(520);
  },
});

/* ══════════════════ 북풍 상인 ══════════════════ */

def({
  id: "north_trader", name: "북풍 상인", tier: "prism", fam: FAM,
  tag: "北을 빼놓으면 한 장당 도라 1판이 된다",
  tech: "빼놓는 자리(<b>손패 밖의 새 영역</b>)를 만드는 게 핵심이다. 손에서 빠져나온 北이 " +
        "옆에 <b>쌓이고</b>, 쌓인 개수가 곧 판수다 — 세는 연출은 계산을 대신한다.",
  async run(tok) {
    const dark = veil("brightness(.52)", 330);
    const h = chip("北 빼기");
    const tiles = handTiles();
    const hr = sRect(S.myhand);
    const parked = [];
    sfx.riser(0.8);

    for (let k = 0; k < 3; k++) {
      if (!alive(tok)) return;
      const el = tiles[k + 2];
      setTile(el, "4z", { ms: 180 });
      await sleep(220);
      if (!alive(tok)) return;
      const r = sRect(el);
      const px = hr.x + hr.w + 26 + k * 30;
      const py = hr.y - 6;
      flyTile("4z", r, { x: px, y: py, w: r.w, h: r.h, cx: px + r.w / 2, cy: py + r.h / 2 }, { bow: 40, ms: 420 });
      anim(el, [{ opacity: 1 }, { opacity: 0.12 }], { duration: 240 });
      later(() => {
        if (!alive(tok)) return;
        const p = tileEl("4z");
        Object.assign(p.style, { position: "absolute", left: `${px}px`, top: `${py}px`, zIndex: "10", boxShadow: `0 0 14px ${C.brass}` });
        p.style.setProperty("--tile-w", `${r.w}px`);
        p.style.setProperty("--tile-h", `${r.h}px`);
        S.fx.appendChild(p);
        parked.push(p);
        anim(p, [{ opacity: 0, scale: "1.2" }, { opacity: 1, scale: "1" }], { duration: 240, easing: EASE_IMPACT });
        sfx.clack(rnd(900, 1300));
        h.textContent = `北 ${parked.length}장 · 도라 ${parked.length}판`;
      }, 420);
      // 영상패로 보충
      later(() => {
        if (!alive(tok)) return;
        el.style.opacity = "1";
        setTile(el, pick(NUM_CODES), { ms: 260 });
      }, 520);
      await sleep(640);
    }
    if (!alive(tok)) return;
    sfx.impact();
    flash(160, "#dcc79a", 0.3);
    const lb = mk(null, {
      position: "absolute", left: `${hr.x + hr.w + 26}px`, top: `${hr.y - 30}px`,
      font: "800 12px/1 ui-monospace, monospace", letterSpacing: "2px", color: C.brass, whiteSpace: "nowrap",
    });
    lb.textContent = "빼놓은 北 · +3판";
    anim(lb, [{ opacity: 0 }, { opacity: 1 }], { duration: 280 });
    banner("북풍 상인", "NORTH TRADER +3", 1600);
    await sleep(1700);
    fade([h, dark, lb, ...parked]);
    await sleep(520);
  },
});

/* ══════════════════ 혼 사냥 ══════════════════ */

def({
  id: "soul_hunt", name: "혼 사냥", tier: "prism", fam: FAM,
  tag: "리치한 상대를 론하면 그 리치를 통째로 빼앗는다",
  tech: "빼앗는 연출이라 <b>상대에게서 무언가가 빠져나와 나에게 붙는다</b>. " +
        "리치봉이 그대로 날아와 내 앞에 놓이는 것 — 복제가 아니라 <b>이동</b>이라 상대 쪽은 비어야 한다.",
  async run(tok) {
    const dark = veil("brightness(.44) saturate(.8)", 360);
    const h = chip("리치 상대 론", C.aug);
    const or = sRect(S.oppTop);
    const oStick = mk(null, {
      position: "absolute", left: `${or.cx - 56}px`, top: `${or.cy + 60}px`,
      width: "112px", height: "12px", borderRadius: "6px",
      background: "linear-gradient(180deg,#fff,#d8d2c2)",
    });
    seatMark(S.oppTop, "리치", C.red, 84);
    sfx.impact();
    await sleep(520);
    if (!alive(tok)) return;

    // 혼이 빠져나온다
    sfx.riser(1.1);
    sTone({ f: 200, f2: 90, dur: 0.9, gain: 0.09, type: "sawtooth" });
    const soul = mk(null, {
      position: "absolute", left: `${or.cx - 14}px`, top: `${or.cy + 58}px`,
      width: "28px", height: "28px", borderRadius: "50%",
      background: `radial-gradient(circle at 40% 35%, #fff, ${C.augLite} 45%, ${C.aug} 80%)`,
      boxShadow: `0 0 26px ${C.aug}`,
    });
    anim(oStick, [{ opacity: 1, filter: "brightness(1)" }, { opacity: 0.15, filter: "brightness(.3)" }], { duration: 700 });
    const steps = [];
    for (let k = 0; k <= 9; k++) {
      const p = k / 9;
      const u = 1 - p;
      const mx = 500 + 150;
      const my = (or.cy + 58 + 400) / 2;
      steps.push({
        transform: `translate(${(u * u * or.cx + 2 * u * p * mx + p * p * 500 - or.cx).toFixed(1)}px, ${(u * u * (or.cy + 58) + 2 * u * p * my + p * p * 400 - (or.cy + 58)).toFixed(1)}px) scale(${(1 + p * 0.5).toFixed(2)})`,
        offset: p,
      });
    }
    anim(soul, steps, { duration: 900, easing: EASE });
    await sleep(940);
    if (!alive(tok)) return;

    sfx.impact();
    flash(200, "#b6a3ff", 0.4);
    anim(soul, [{ opacity: 1, scale: "1.5" }, { opacity: 0, scale: "3" }], { duration: 400 });
    ring(500, 400, 18, 220, 640, "rgba(124,92,255,.85)", 3);
    const mine = mk(null, {
      position: "absolute", left: "444px", top: "394px", width: "112px", height: "12px",
      borderRadius: "6px", background: "linear-gradient(180deg,#fff,#d8d2c2)",
      boxShadow: `0 0 20px ${C.aug}`,
    });
    anim(mine, [{ opacity: 0, scale: "0.4" }, { opacity: 1, scale: "1" }], { duration: 340, delay: 200, easing: EASE_IMPACT });
    h.textContent = "리치 강탈 · 뒷도라 적용";
    bigGlyph("魂", { y: 280, col: C.augLite, size: 88, ms: 1400 });
    banner("혼 사냥", "SOUL TAKEN", 1700);
    await sleep(1800);
    fade([h, dark, oStick, soul, mine]);
    await sleep(520);
  },
});

/* ══════════════════ 천하통일 ══════════════════ */

def({
  id: "unification", name: "천하통일", tier: "prism", fam: FAM,
  tag: "50,000점에 닿는 순간 남은 국을 무시하고 즉시 우승",
  tech: "게임 자체를 끝내는 증강이라 <b>판이 닫히는</b> 연출이 맞다. 점수가 선을 넘는 순간 " +
        "국 표시가 지워지고 <b>판 전체가 하나의 인장으로 덮인다</b> — 남은 시간이 사라졌다는 뜻이다.",
  async run(tok) {
    const dark = veil("brightness(.5) saturate(.85)", 340);
    const h = chip("목표 50,000");
    const m = meter(310, 250, 380, "우승선까지", C.brass);
    m.set(0.5, 1);
    const num = mk(null, {
      position: "absolute", left: "500px", top: "286px", transform: "translateX(-50%)",
      font: "800 30px/1 ui-monospace, monospace", color: C.brass, whiteSpace: "nowrap",
    });
    num.textContent = "25,000";
    sfx.riser(1.2);
    await sleep(500);
    if (!alive(tok)) return;

    // 선을 넘는다
    m.set(1, 1300);
    countUp(num, 25000, 50000, 1300, (n) => Math.round(n).toLocaleString());
    anim(num, [{ scale: "1" }, { scale: "1.35" }], { duration: 1300, easing: EASE });
    await sleep(1350);
    if (!alive(tok)) return;

    sfx.impact();
    sfx.chime();
    flash(320, "#fff", 0.7);
    shake(720, 15);
    m.tint(C.green);
    // 국 표시가 지워진다
    const centerSub = S.stage.querySelector(".center-sub");
    if (centerSub) {
      anim(centerSub, [{ opacity: 1 }, { opacity: 0 }], { duration: 500 });
    }
    h.textContent = "남은 국 무시 · 즉시 종료";
    // 판 전체를 덮는 인장
    const seal = mk(null, {
      position: "absolute", left: "500px", top: "312px", transform: "translate(-50%,-50%)",
      width: "260px", height: "260px", borderRadius: "14px",
      border: `6px solid ${C.brass}`, display: "grid", placeItems: "center",
      font: "900 92px/1 serif", color: C.brass, background: "rgba(14,23,18,.55)",
      boxShadow: `0 0 60px ${C.brass}77`,
    });
    seal.textContent = "統";
    anim(seal, [
      { opacity: 0, transform: "translate(-50%,-50%) scale(3) rotate(-14deg)" },
      { opacity: 1, transform: "translate(-50%,-50%) scale(1) rotate(0deg)", offset: 0.6 },
      { opacity: 1, transform: "translate(-50%,-50%) scale(1.06) rotate(0deg)", offset: 0.75 },
      { opacity: 1, transform: "translate(-50%,-50%) scale(1) rotate(0deg)" },
    ], { duration: 700, easing: "cubic-bezier(.5,0,.2,1)" });
    ring(500, 312, 40, 900, 1100, "rgba(194,160,104,.7)", 5);
    fallParticles({ n: 70, col: "220,199,154", size: [2, 5], vy: [1, 3], life: 200, shape: "ellipse" });
    banner("천하통일", "GAME OVER — WIN", 2000);
    await sleep(2200);
    fade([h, dark, m, num, seal]);
    await sleep(560);
  },
});
