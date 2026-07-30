/* MAJAK 증강 연출 랩 — 4차 배치 A · 리치 10종 + 수비 6종
 *
 * 리치 계열은 전부 "선언"이다 — 되돌릴 수 없는 약속을 하는 순간. 그래서 공통 언어는
 * 리치봉과 띠이고, 각 증강은 그 약속이 **어떻게 비틀리는지**만 자기 장면으로 갖는다.
 *
 * 수비 계열은 전부 "막았다"이다. 막는 그림은 결계 하나로 통일하고, 무엇을 어떻게
 * 막았는지(한 번만·1점 남기고·아예 계약으로)를 각자 다르게 보여준다.
 */

import {
  C, EASE, EASE_IMPACT, NUM_CODES, S, alive, anim, banner, bigGlyph, chip, clamp, countUp,
  drawHooks, fade, flash, flyTile, glowTiles, handTiles, hexShield, later, linkTo, meter, mk,
  mkSvg, opps, orbitRing, pick, ring, rnd, sRect, sTone, seatMark, setTile, sfx, shake, sleep,
  sparkBurst, stamp, svgEl, tileEl, veil,
} from "/fx-kit.js?v=9";
import { def } from "/fx-registry.js?v=9";

const RIICHI = "리치 · 선언";
const DEFENSE = "수비 · 결계";

/** 리치봉 하나 — 이 배치의 공용 소품 */
function riichiStick(x, y, { ms = 340, col = "#fff" } = {}) {
  const s = mk(null, {
    position: "absolute", left: `${x - 56}px`, top: `${y - 6}px`,
    width: "112px", height: "12px", borderRadius: "6px",
    background: `linear-gradient(180deg,${col},#d8d2c2)`,
    boxShadow: "0 2px 10px rgba(4,9,7,.6)",
  });
  mk(null, {
    position: "absolute", left: "50%", top: "50%", width: "8px", height: "8px",
    margin: "-4px 0 0 -4px", borderRadius: "50%", background: "#e0393e",
  }, s);
  anim(s, [
    { transform: "translateY(-36px) rotate(-16deg)", opacity: 0 },
    { transform: "translateY(0) rotate(0deg)", opacity: 1 },
  ], { duration: ms, easing: EASE });
  return s;
}

/* ══════════════════════ 리치 · 선언 ══════════════════════ */

def({
  id: "all_or_nothing", name: "모 아니면 도", tier: "prism", fam: RIICHI,
  tag: "동전이 돌아 대박이냐 파산이냐가 갈린다",
  tech: "<b>3D 동전 회전</b> + 갈라지는 두 갈래 길. 결과가 나오기 전에 <b>양쪽 결말을 다 보여주고</b> " +
        "하나가 꺼진다 — 무엇을 걸었는지 알아야 결과가 무게를 갖는다.",
  async run(tok) {
    const dark = veil("brightness(.5) saturate(.8)", 340);
    const h = chip("전부 아니면 전무");
    // 두 결말을 미리 보여준다
    const paths = [];
    for (const [i, o] of [["대박 ×2", C.brass, -180], ["파산 0점", C.red, 180]].entries()) {
      const p = mk(null, {
        position: "absolute", left: `${500 + o[2] - 76}px`, top: "398px",
        width: "152px", padding: "8px 0", textAlign: "center", borderRadius: "var(--r-md)",
        border: `1px solid ${o[1]}`, background: "rgba(14,23,18,.9)",
        font: "800 14px/1 ui-monospace, monospace", letterSpacing: "2px", color: o[1],
      });
      p.textContent = o[0];
      paths.push(p);
      anim(p, [{ opacity: 0, translate: `${o[2] > 0 ? 20 : -20}px 0` }, { opacity: 1, translate: "0 0" }], {
        duration: 300, delay: i * 120, easing: EASE,
      });
    }
    sfx.riser(0.9);
    await sleep(620);
    if (!alive(tok)) return;

    // 동전 — Y축으로 계속 돈다
    const coin = mk(null, {
      position: "absolute", left: "468px", top: "228px", width: "64px", height: "64px",
      borderRadius: "50%", background: "linear-gradient(140deg,#e6d5ae,#c2a068 45%,#6f5526)",
      boxShadow: "0 0 26px rgba(194,160,104,.7)", display: "grid", placeItems: "center",
      font: "900 26px/1 serif", color: "#3a2c12",
    });
    coin.textContent = "賭";
    anim(coin, [
      { transform: "translateY(-140px) rotateY(0deg) scale(.6)", opacity: 0 },
      { transform: "translateY(0) rotateY(1440deg) scale(1)", opacity: 1 },
    ], { duration: 1500, easing: "cubic-bezier(.2,.7,.3,1)" });
    sfx.whoosh(1.2);
    await sleep(1500);
    if (!alive(tok)) return;

    // 결과 — 한쪽이 꺼진다
    sfx.impact();
    shake(420, 10);
    flash(200, "#dcc79a", 0.4);
    coin.textContent = "大";
    anim(coin, [{ scale: "1" }, { scale: "1.5" }, { scale: "1.2" }], { duration: 380, easing: EASE });
    anim(paths[1], [{ opacity: 1 }, { opacity: 0.12 }], { duration: 420 });
    paths[0].style.boxShadow = `0 0 24px ${C.brass}`;
    anim(paths[0], [{ scale: "1" }, { scale: "1.14" }, { scale: "1.06" }], { duration: 420, easing: EASE });
    sparkBurst(500, 260, { n: 26, col: "220,199,154", spread: 160 });
    banner("모 아니면 도", "ALL IN — WON", 1600);
    await sleep(1700);
    fade([h, dark, coin, ...paths]);
    await sleep(520);
  },
});

def({
  id: "free_riichi_discard", name: "자유 선언", tier: "gold", fam: RIICHI,
  tag: "리치를 걸고도 손패가 묶이지 않는다 — 사슬이 끊어진다",
  tech: "리치의 대가는 <b>손이 묶이는 것</b>이다. 그래서 먼저 손패에 <b>사슬</b>을 걸어 " +
        "제약을 눈에 보이게 만든 뒤 끊는다 — 없어진 것을 보여주려면 있는 것을 먼저 보여야 한다.",
  async run(tok) {
    const dark = veil("brightness(.55)", 320);
    const tiles = handTiles().slice(0, 13);
    const h = chip("리치 — 손패 고정");
    const hr = sRect(S.myhand);
    riichiStick(500, 400);
    sfx.clack(1400);

    // 사슬 — 제약을 먼저 보여준다
    const sv = mkSvg({ zIndex: "6" });
    const chain = svgEl("path", {
      d: `M${hr.x - 14} ${hr.cy} L${hr.x + hr.w + 14} ${hr.cy}`,
      fill: "none", stroke: "#8a92a0", "stroke-width": 7,
      "stroke-linecap": "round", "stroke-dasharray": "13 7",
    }, sv);
    chain.style.filter = "drop-shadow(0 2px 4px rgba(4,9,7,.7))";
    anim(chain, [{ opacity: 0, strokeWidth: 1 }, { opacity: 1, strokeWidth: 7 }], { duration: 380, easing: EASE });
    for (const el of tiles) el.style.filter = "brightness(.72) saturate(.6)";
    sfx.riser(0.7);
    await sleep(760);
    if (!alive(tok)) return;

    // 끊는다
    sfx.impact();
    sfx.shatter();
    shake(380, 9);
    flash(160, "#dcc79a", 0.32);
    anim(chain, [{ opacity: 1 }, { opacity: 0 }], { duration: 200 });
    // 끊긴 조각이 튄다
    for (let i = 0; i < 12; i++) {
      const x = hr.x + (hr.w / 11) * i;
      const p = mk(null, {
        position: "absolute", left: `${x}px`, top: `${hr.cy - 4}px`,
        width: "11px", height: "7px", borderRadius: "3px", background: "#8a92a0",
      });
      anim(p, [
        { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
        { transform: `translate(${rnd(-70, 70)}px, ${rnd(40, 130)}px) rotate(${rnd(-200, 200)}deg)`, opacity: 0 },
      ], { duration: rnd(500, 800), easing: "cubic-bezier(.2,.5,.3,1)" })
        .finished.then(() => p.remove()).catch(() => p.remove());
    }
    for (const [i, el] of tiles.entries()) {
      later(() => {
        el.style.filter = "";
        anim(el, [{ transform: "translateY(0)" }, { transform: "translateY(-9px)" }, { transform: "translateY(0)" }], {
          duration: 320, easing: EASE,
        });
      }, i * 34);
    }
    h.textContent = "리치 후에도 자유 타패";
    banner("자유 선언", "FREE DISCARD", 1500);
    await sleep(1700);
    fade([h, dark, sv]);
    await sleep(520);
  },
});

def({
  id: "late_double", name: "뒤늦은 출진", tier: "prism", fam: RIICHI,
  tag: "늦게 출발했는데 더블 리치로 인정된다",
  tech: "<b>시계가 거꾸로 감겼다가</b> 제자리를 찾는다. 규칙 예외(늦었는데 더블)를 " +
        "말로 쓰면 한 줄이지만, 시간을 되돌리는 그림으로 보여주면 설명이 필요 없다.",
  async run(tok) {
    const dark = veil("brightness(.5) saturate(.7)", 340);
    const h = chip("6순 — 이미 늦었다");
    // 순번 눈금
    const sv = mkSvg({ zIndex: "4" });
    const Y = 200;
    for (let i = 0; i < 8; i++) {
      const x = 300 + i * 58;
      svgEl("line", { x1: x, y1: Y - 8, x2: x, y2: Y + 8, stroke: i === 0 ? C.brass : "rgba(236,228,210,.3)", "stroke-width": i === 0 ? 3 : 1.5 }, sv);
    }
    svgEl("line", { x1: 300, y1: Y, x2: 706, y2: Y, stroke: "rgba(236,228,210,.25)", "stroke-width": 1.5 }, sv);
    const marker = mk(null, {
      position: "absolute", left: `${300 + 5 * 58 - 9}px`, top: `${Y - 9}px`,
      width: "18px", height: "18px", borderRadius: "50%", background: C.brass,
      boxShadow: `0 0 16px ${C.brass}`,
    });
    anim(marker, [{ opacity: 0, scale: "0.3" }, { opacity: 1, scale: "1" }], { duration: 300, easing: EASE });
    sfx.riser(0.8);
    await sleep(700);
    if (!alive(tok)) return;

    // 되감기 — 1순으로
    sfx.whoosh(0.8);
    h.textContent = "시간을 되감는다";
    anim(marker, [
      { transform: "translateX(0)" },
      { transform: `translateX(${-5 * 58}px)` },
    ], { duration: 820, easing: EASE });
    const lines = mk(null, {
      position: "absolute", inset: "0",
      background: "repeating-linear-gradient(0deg, rgba(236,228,210,.06) 0 2px, transparent 2px 5px)",
      mixBlendMode: "screen",
    });
    anim(lines, [{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], { duration: 900 });
    await sleep(880);
    if (!alive(tok)) return;

    sfx.impact();
    flash(180, "#dcc79a", 0.35);
    ring(300, Y, 12, 130, 560, "rgba(194,160,104,.85)", 2);
    riichiStick(500, 400);
    sfx.clack(1400);
    h.textContent = "1순 · 더블 리치 성립";
    bigGlyph("W", { y: 300, col: C.brass, size: 96, ms: 1300 });
    banner("뒤늦은 출진", "DOUBLE RIICHI", 1600);
    await sleep(1700);
    fade([h, dark, sv, marker]);
    await sleep(520);
  },
});

def({
  id: "no_retreat", name: "물러설 수 없는 선언", tier: "prism", fam: RIICHI,
  tag: "선언과 동시에 뒤가 불탄다 — 물러설 길이 없다",
  tech: "리치는 원래 <b>돌아갈 수 없는 선택</b>이다. 그걸 '뒤에 있던 길이 실제로 사라지는' " +
        "그림으로 만든다 — 페널티 문구 대신 <b>없어진 공간</b>을 보여주는 쪽.",
  async run(tok) {
    const dark = veil("brightness(.5) saturate(.9)", 340);
    const h = chip("선언 — 취소 불가", C.red);
    riichiStick(500, 400);
    sfx.clack(1400);
    await sleep(300);
    if (!alive(tok)) return;

    // 뒤쪽(내 아래)이 무너진다
    sfx.impact();
    shake(560, 12);
    const sv = mkSvg({ zIndex: "3" });
    const edge = svgEl("path", {
      d: "M120 618 L880 618", fill: "none", stroke: C.red, "stroke-width": 3, "stroke-linecap": "round",
    }, sv);
    anim(edge, [{ opacity: 0 }, { opacity: 1 }], { duration: 240 });
    // 불꽃
    let t = 0;
    drawHooks.add((dt, c) => {
      t += dt;
      for (let i = 0; i < 8; i++) {
        const x = rnd(120, 880);
        const hgt = rnd(14, 52) * clamp(1 - t / 150, 0, 1);
        const g = c.createLinearGradient(0, 620, 0, 620 - hgt);
        g.addColorStop(0, "rgba(255,180,80,.85)");
        g.addColorStop(1, "rgba(224,85,95,0)");
        c.fillStyle = g;
        c.fillRect(x, 620 - hgt, rnd(4, 14), hgt);
      }
      return t < 160;
    });
    const scorch = mk(null, {
      position: "absolute", left: "0", bottom: "0", width: "100%", height: "120px",
      background: "linear-gradient(0deg, rgba(60,14,10,.85), transparent)",
    });
    anim(scorch, [{ opacity: 0 }, { opacity: 1 }], { duration: 600 });
    stamp("退", { x: 500, y: 300, col: C.red, size: 88 });
    h.textContent = "퇴로 소멸 · 화료 아니면 벌점";
    banner("물러설 수 없는", "NO RETREAT", 1600);
    await sleep(1900);
    fade([h, dark, sv, scorch]);
    await sleep(520);
  },
});

def({
  id: "off_by_one", name: "한 끗 차이", tier: "prism", fam: RIICHI,
  tag: "±1 만큼 어긋난 패도 오름패가 된다",
  tech: "숫자 관계를 다루는 증강이라 <b>눈금자</b>를 쓴다. 대기패 양옆으로 눈금이 " +
        "한 칸씩 확장되고 그 자리의 패가 실제로 켜진다 — 규칙을 <b>거리</b>로 번역했다.",
  async run(tok) {
    const dark = veil("brightness(.55) saturate(.85)", 320);
    const h = chip("대기 ±1 확장");
    const hr = sRect(S.myhand);
    const CY = 236;
    const base = 5;
    // 1~9 눈금
    const cells = [];
    for (let n = 1; n <= 9; n++) {
      const x = 500 + (n - 5) * 62;
      const c = mk(null, {
        position: "absolute", left: `${x - 24}px`, top: `${CY - 32}px`,
        width: "48px", height: "64px", borderRadius: "var(--r-sm)",
        border: "1px solid rgba(236,228,210,.18)", background: "rgba(10,18,16,.8)",
        display: "grid", placeItems: "center",
        font: "800 20px/1 ui-monospace, monospace", color: C.sageDim,
      });
      c.textContent = String(n);
      cells.push(c);
      anim(c, [{ opacity: 0, translate: "0 8px" }, { opacity: 1, translate: "0 0" }], {
        duration: 200, delay: n * 26, easing: EASE,
      });
    }
    sfx.riser(0.7);
    await sleep(560);
    if (!alive(tok)) return;

    // 원래 대기 한 칸
    const lightUp = (i, col, big) => {
      const c = cells[i];
      c.style.borderColor = col;
      c.style.color = col;
      c.style.boxShadow = `0 0 18px ${col}`;
      anim(c, [{ scale: "1" }, { scale: big ? "1.28" : "1.16" }, { scale: big ? "1.12" : "1" }], {
        duration: 300, easing: EASE,
      });
      sTone({ f: 900 + i * 120, dur: 0.09, gain: 0.06, type: "sine" });
    };
    lightUp(base - 1, C.brass, true);
    h.textContent = "원래 대기 · 1종";
    await sleep(700);
    if (!alive(tok)) return;

    // ±1 로 번진다
    sfx.impact();
    h.textContent = "±1 — 대기 3종";
    lightUp(base - 2, C.green, false);
    lightUp(base, C.green, false);
    const sv = mkSvg({ zIndex: "5" });
    for (const d of [-1, 1]) {
      const x0 = 500 + (base - 5) * 62;
      const x1 = x0 + d * 62;
      const p = svgEl("path", {
        d: `M${x0} ${CY + 44} Q${(x0 + x1) / 2} ${CY + 70} ${x1} ${CY + 44}`,
        fill: "none", stroke: C.green, "stroke-width": 2, "stroke-linecap": "round",
      }, sv);
      const L = p.getTotalLength();
      p.setAttribute("stroke-dasharray", `${L}`);
      p.setAttribute("stroke-dashoffset", `${L}`);
      anim(p, [{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 340, easing: EASE });
    }
    ring(500 + (base - 5) * 62, CY, 20, 180, 620, "rgba(126,214,140,.7)", 2);
    banner("한 끗 차이", "OFF BY ONE", 1500);
    await sleep(1700);
    fade([h, dark, sv, ...cells]);
    await sleep(520);
  },
});

def({
  id: "palm_flip", name: "손바닥 뒤집기", tier: "prism", fam: RIICHI,
  tag: "리치 후 손패를 통째로 뒤집어 다른 손으로 바꾼다",
  tech: "손패 전체를 <b>한 장의 판처럼</b> rotateX 로 뒤집는다 — 13장을 따로 뒤집으면 " +
        "'각각 바뀌었다'로 보이지만, 한 덩어리로 뒤집으면 <b>손 자체가 바뀌었다</b>로 읽힌다.",
  async run(tok) {
    const dark = veil("brightness(.52)", 320);
    const h = chip("리치 중 — 손을 뒤집는다");
    const tiles = handTiles();
    riichiStick(500, 400);
    sfx.clack(1300);
    await sleep(360);
    if (!alive(tok)) return;

    // 손패 전체를 한 판으로 묶어 뒤집는다
    S.myhand.style.transformStyle = "preserve-3d";
    sfx.riser(0.6);
    sfx.whoosh(0.7);
    anim(S.myhand, [
      { transform: "translateX(-50%) perspective(900px) rotateX(0deg)" },
      { transform: "translateX(-50%) perspective(900px) rotateX(-90deg)", offset: 0.5 },
      { transform: "translateX(-50%) perspective(900px) rotateX(-180deg)", offset: 0.52 },
      { transform: "translateX(-50%) perspective(900px) rotateX(-360deg)" },
    ], { duration: 900, easing: EASE });
    // 손바닥 실루엣
    const palm = mk(null, {
      position: "absolute", left: "500px", top: "470px", transform: "translate(-50%,-50%)",
      font: "900 120px/1 serif", color: "rgba(236,228,210,.16)",
    });
    palm.textContent = "掌";
    anim(palm, [
      { opacity: 0, transform: "translate(-50%,-50%) scale(.6) rotate(-20deg)" },
      { opacity: 1, transform: "translate(-50%,-50%) scale(1) rotate(0deg)", offset: 0.5 },
      { opacity: 0, transform: "translate(-50%,-50%) scale(1.3) rotate(20deg)" },
    ], { duration: 900 }).finished.then(() => palm.remove()).catch(() => palm.remove());
    // 중간에 패를 갈아끼운다 (뒤집힌 순간)
    later(() => {
      if (!alive(tok)) return;
      for (const el of tiles) setTile(el, pick(NUM_CODES), { ms: 1 });
      sfx.impact();
      flash(160, "#dcc79a", 0.3);
    }, 460);
    await sleep(960);
    if (!alive(tok)) return;
    h.textContent = "새 손 · 리치 유지";
    banner("손바닥 뒤집기", "PALM FLIP", 1500);
    await sleep(1600);
    fade([h, dark]);
    await sleep(520);
  },
});

def({
  id: "riichi_seal", name: "리치 봉인", tier: "prism", fam: RIICHI,
  tag: "상대의 리치를 부적으로 봉인한다",
  tech: "남의 선언을 지우는 연출이라 <b>부적(封)</b>이 리치봉 위에 내려앉는다. " +
        "리치봉을 없애지 않고 <b>덮는</b> 것이 핵심 — 봉인은 삭제가 아니라 잠금이다.",
  async run(tok) {
    const dark = veil("brightness(.5) saturate(.7)", 340);
    const h = chip("상대 리치 감지", C.red);
    const or = sRect(S.oppTop);
    const stick = riichiStick(or.cx, or.cy + 66, { col: "#fff" });
    seatMark(S.oppTop, "리치", C.red, 84);
    sfx.clack(1300);
    await sleep(560);
    if (!alive(tok)) return;

    // 부적이 내려앉는다
    sfx.riser(0.9);
    const talis = mk(null, {
      position: "absolute", left: `${or.cx - 26}px`, top: `${or.cy + 30}px`,
      width: "52px", height: "104px", borderRadius: "3px",
      background: "linear-gradient(170deg,#efe6d0,#ddd0b4)",
      border: "1px solid rgba(120,95,60,.4)",
      boxShadow: "0 8px 22px rgba(4,9,7,.6)",
      display: "grid", placeItems: "center",
      font: "900 30px/1 serif", color: "#8a1420",
    });
    talis.textContent = "封";
    anim(talis, [
      { transform: "translateY(-150px) rotate(-24deg) scale(1.3)", opacity: 0 },
      { transform: "translateY(0) rotate(0deg) scale(1)", opacity: 1 },
    ], { duration: 520, easing: EASE });
    await sleep(540);
    if (!alive(tok)) return;

    sfx.impact();
    shake(360, 8);
    flash(150, "#e0555f", 0.24);
    ring(or.cx, or.cy + 66, 14, 150, 600, "rgba(224,85,95,.85)", 2);
    // 봉인된 리치봉은 회색으로
    anim(stick, [{ filter: "saturate(1) brightness(1)" }, { filter: "saturate(0) brightness(.5)" }], { duration: 400 });
    h.textContent = "리치 무효 · 봉 반환 없음";
    banner("리치 봉인", "RIICHI SEALED", 1600);
    await sleep(1700);
    fade([h, dark, talis, stick]);
    await sleep(520);
  },
});

def({
  id: "riichi_upgrade", name: "이중 선언", tier: "gold", fam: RIICHI,
  tag: "리치 위에 리치를 겹쳐 건다",
  tech: "리치봉을 <b>물리적으로 한 개 더 쌓고</b> 띠도 두 겹이 된다. 수치(판수)가 아니라 " +
        "<b>쌓인 개수</b>로 강해짐을 보여주는 쪽 — 세는 연출은 숫자보다 몸에 남는다.",
  async run(tok) {
    const dark = veil("brightness(.55)", 320);
    const h = chip("리치 선언");
    riichiStick(500, 404);
    sfx.clack(1400);
    await sleep(520);
    if (!alive(tok)) return;

    // 두 번째 봉이 위에 쌓인다
    h.textContent = "이중 선언 — 봉 2개";
    sfx.riser(0.8);
    riichiStick(500, 386, { ms: 380 });
    sfx.clack(1700);
    sfx.impact();
    shake(300, 7);
    flash(170, "#dcc79a", 0.34);
    // 두 겹 띠
    for (const [i, y] of [286, 316].entries()) {
      const band = mk(null, {
        position: "absolute", left: "0", right: "0", top: `${y}px`, height: "26px",
        background: `linear-gradient(90deg, transparent, rgba(194,160,104,${0.45 - i * 0.14}) 20%, rgba(194,160,104,${0.45 - i * 0.14}) 80%, transparent)`,
        borderTop: `1px solid ${C.brass}`, borderBottom: `1px solid ${C.brass}`,
      });
      anim(band, [
        { transform: "scaleX(0)", opacity: 0 },
        { transform: "scaleX(1)", opacity: 1 },
      ], { duration: 420, delay: i * 120, easing: EASE });
      later(() => fade([band], 400), 1500 + i * 100);
    }
    bigGlyph("双", { y: 302, col: C.brass, size: 88, ms: 1400 });
    banner("이중 선언", "DOUBLE DECLARE", 1600);
    await sleep(1800);
    fade([h, dark]);
    await sleep(520);
  },
});

def({
  id: "siege_riichi", name: "공성계", tier: "prism", fam: RIICHI,
  tag: "리치를 걸면 세 상대를 포위망이 조여온다",
  tech: "내가 아니라 <b>상대 쪽에서</b> 벌어지는 일이라 세 좌석을 각각 조인다. " +
        "포위는 한 점이 아니라 <b>둘러싸는 선</b>이므로 좌석마다 벽을 세우고 안쪽으로 민다.",
  async run(tok) {
    const dark = veil("brightness(.5) saturate(.75)", 340);
    const h = chip("리치 — 포위 개시", C.red);
    riichiStick(500, 400);
    sfx.clack(1400);
    sfx.riser(1.1);
    await sleep(420);
    if (!alive(tok)) return;

    // 세 좌석에 벽이 세워지고 조인다
    const walls = [];
    for (const [i, o] of opps().entries()) {
      const r = sRect(o);
      const vertical = o !== S.oppTop;
      const w = mk(null, {
        position: "absolute",
        left: `${vertical ? r.cx - 7 : r.x - 20}px`,
        top: `${vertical ? r.y - 20 : r.cy - 7}px`,
        width: `${vertical ? 14 : r.w + 40}px`,
        height: `${vertical ? r.h + 40 : 14}px`,
        borderRadius: "7px",
        background: `linear-gradient(${vertical ? "90deg" : "180deg"}, ${C.red}, #7a1420)`,
        boxShadow: `0 0 20px ${C.red}99`,
      });
      walls.push(w);
      anim(w, [
        { opacity: 0, transform: `scale${vertical ? "Y" : "X"}(0.2)` },
        { opacity: 1, transform: "scale(1)" },
      ], { duration: 420, delay: i * 130, easing: EASE });
      later(() => {
        if (!alive(tok)) return;
        // 안쪽으로 민다
        const dx = o === S.oppLeft ? 42 : o === S.oppRight ? -42 : 0;
        const dy = o === S.oppTop ? 40 : 0;
        anim(w, [{ translate: "0 0" }, { translate: `${dx}px ${dy}px` }], { duration: 620, easing: EASE });
        anim(o, [{ transform: getComputedStyle(o).transform }], { duration: 1 });
        seatMark(o, "압박", C.red, o === S.oppTop ? 74 : 0);
        sfx.clack(360);
      }, i * 130 + 460);
    }
    await sleep(1500);
    if (!alive(tok)) return;
    sfx.impact();
    shake(420, 9);
    h.textContent = "세 상대 · 방어 강제";
    banner("공 성 계", "SIEGE", 1600);
    await sleep(1700);
    fade([h, dark, ...walls]);
    await sleep(520);
  },
});

def({
  id: "stealth_riichi", name: "스텔스 리치", tier: "prism", fam: RIICHI,
  tag: "리치를 걸었는데 상대에게는 보이지 않는다",
  tech: "<b>내 화면과 상대 화면을 한 장면에 겹친다</b> — 리치봉이 놓인 뒤 상대 시야에서만 " +
        "사라진다. 정보 비대칭을 '나에게만 보인다' 문구가 아니라 <b>같은 소품의 두 상태</b>로 보여준다.",
  async run(tok) {
    const dark = veil("brightness(.55)", 320);
    const h = chip("리치 선언");
    const stick = riichiStick(500, 400);
    sfx.clack(1400);
    await sleep(520);
    if (!alive(tok)) return;

    // 상대 시야 라벨 — 같은 소품이 저쪽에선 사라진다
    h.textContent = "상대 시야에서 지운다";
    sfx.whoosh(0.7);
    const ghost = mk(null, {
      position: "absolute", left: `${sRect(S.oppTop).cx - 56}px`, top: `${sRect(S.oppTop).cy + 60}px`,
      width: "112px", height: "12px", borderRadius: "6px",
      background: "linear-gradient(180deg,#fff,#d8d2c2)", opacity: "0.9",
    });
    const lb = seatMark(S.oppTop, "상대가 보는 화면", C.sageDim, 92);
    await sleep(420);
    if (!alive(tok)) return;
    anim(ghost, [
      { opacity: 0.9, filter: "blur(0px)" },
      { opacity: 0, filter: "blur(6px)" },
    ], { duration: 700, easing: EASE });
    sTone({ f: 1400, f2: 400, dur: 0.5, gain: 0.07, type: "sine" });
    // 내 쪽 봉은 그대로 — 대신 은신 표시
    anim(stick, [{ opacity: 1 }, { opacity: 0.55 }], { duration: 500 });
    const mark = mk(null, {
      position: "absolute", left: "500px", top: "434px", transform: "translateX(-50%)",
      font: "800 11px/1 ui-monospace, monospace", letterSpacing: "3px", color: C.aug, whiteSpace: "nowrap",
    });
    mark.textContent = "隱 · 나만 아는 리치";
    anim(mark, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 300 });
    await sleep(900);
    if (!alive(tok)) return;
    banner("스텔스 리치", "HIDDEN RIICHI", 1600);
    await sleep(1700);
    fade([h, dark, stick, ghost, lb, mark]);
    await sleep(520);
  },
});

/* ══════════════════════ 수비 · 결계 ══════════════════════ */

def({
  id: "always_tenpai", name: "승승장구", tier: "prism", fam: DEFENSE,
  tag: "유국마다 텐파이가 쌓여 게이지가 오른다",
  tech: "누적형 증강이라 <b>게이지</b>가 맞다. 한 번의 화려한 순간보다 " +
        "<b>칸이 하나씩 차는 것</b>이 '계속 쌓이고 있다'를 전달한다 — 성장은 사건이 아니라 축적이다.",
  async run(tok) {
    const dark = veil("brightness(.6)", 300);
    const h = chip("연속 텐파이");
    const m = meter(360, 250, 280, "연승", C.brass);
    sfx.riser(0.6);
    await sleep(420);
    if (!alive(tok)) return;

    const marks = [];
    for (let i = 1; i <= 4; i++) {
      if (!alive(tok)) return;
      m.set(i / 4, 380);
      h.textContent = `${i}연속 텐파이`;
      const dot = mk(null, {
        position: "absolute", left: `${360 + (i - 1) * 72 + 26}px`, top: "282px",
        width: "22px", height: "22px", borderRadius: "50%",
        border: `2px solid ${C.brass}`, background: "rgba(194,160,104,.2)",
        display: "grid", placeItems: "center", font: "800 11px/1 serif", color: C.brass,
      });
      dot.textContent = "聴";
      marks.push(dot);
      anim(dot, [{ opacity: 0, scale: "0.4" }, { opacity: 1, scale: "1" }], { duration: 240, easing: EASE });
      sTone({ f: 800 + i * 180, dur: 0.1, gain: 0.07, type: "sine" });
      await sleep(560);
    }
    if (!alive(tok)) return;
    sfx.impact();
    sfx.chime();
    flash(180, "#dcc79a", 0.36);
    m.tint(C.green);
    h.textContent = "최대 — 상시 텐파이";
    sparkBurst(500, 254, { n: 24, col: "220,199,154", spread: 170 });
    banner("승승장구", "WINNING STREAK", 1600);
    await sleep(1700);
    fade([h, dark, m, ...marks]);
    await sleep(520);
  },
});

def({
  id: "die_hard", name: "죽기살기", tier: "gold", fam: DEFENSE,
  tag: "0점이 되어도 1점 남기고 버틴다",
  tech: "점수 바가 <b>0 직전에 멈추는</b> 것이 전부다. 멈추는 순간이 보여야 하므로 " +
        "일부러 <b>지나칠 뻔하다가</b> 되돌아온다 — 아슬아슬함은 여유 있게 멈추면 안 생긴다.",
  async run(tok) {
    const dark = veil("brightness(.45) saturate(.7)", 340);
    const h = chip("치명타 — 점수 소진", C.red);
    const m = meter(340, 260, 320, "점수", C.red);
    m.set(1, 1);
    const num = mk(null, {
      position: "absolute", left: "500px", top: "296px", transform: "translateX(-50%)",
      font: "800 26px/1 ui-monospace, monospace", color: C.redLite, whiteSpace: "nowrap",
    });
    num.textContent = "25000";
    sfx.riser(0.7);
    await sleep(460);
    if (!alive(tok)) return;

    // 급락 — 0을 지나칠 듯이
    sfx.impact();
    shake(620, 14);
    m.set(0.02, 900);
    countUp(num, 25000, 1, 900);
    anim(num, [{ color: C.redLite }, { color: "#fff" }, { color: C.redLite }], { duration: 900 });
    await sleep(940);
    if (!alive(tok)) return;

    // 1에서 멈춘다
    sfx.clack(300);
    sfx.chime();
    flash(200, "#fff", 0.4);
    num.textContent = "1";
    anim(num, [{ scale: "1" }, { scale: "1.8" }, { scale: "1.3" }], { duration: 420, easing: EASE });
    m.tint(C.brass);
    m.set(0.02, 1);
    hexShield(500, 292, 120, { col: C.brass, ms: 560 });
    h.textContent = "1점 생존 — 탈락 없음";
    bigGlyph("生", { y: 300, col: C.brass, size: 84, ms: 1400 });
    banner("죽기살기", "SURVIVE AT 1", 1700);
    await sleep(1800);
    fade([h, dark, m, num]);
    await sleep(520);
  },
});

def({
  id: "invincible", name: "천하무적", tier: "gold", fam: DEFENSE,
  tag: "론 한 번을 결계가 튕겨낸다",
  tech: "막는 연출은 <b>충돌 → 정지 → 반사</b> 세 박자가 다 있어야 막았다고 느껴진다. " +
        "날아오는 것을 먼저 보여주고, 결계에 닿는 순간 <b>화면을 한 프레임 멈춘</b> 뒤 되돌린다.",
  async run(tok) {
    const dark = veil("brightness(.5) saturate(.8)", 320);
    const h = chip("상대 론 선언", C.red);
    const or = sRect(S.oppTop);
    const hr = sRect(S.myhand);
    seatMark(S.oppTop, "론!", C.red, 76);
    sfx.impact();
    await sleep(380);
    if (!alive(tok)) return;

    // 날아온다
    const shot = mk(null, {
      position: "absolute", left: `${or.cx - 13}px`, top: `${or.cy}px`,
      width: "26px", height: "26px", borderRadius: "50%",
      background: "radial-gradient(circle at 35% 35%, #fff, #e0555f 60%, #7a1420)",
      boxShadow: `0 0 22px ${C.red}`,
    });
    sfx.whoosh(0.5);
    anim(shot, [
      { transform: "translate(0,0) scale(.6)" },
      { transform: `translate(${hr.cx - or.cx}px, ${hr.y - 90 - or.cy}px) scale(1.2)` },
    ], { duration: 520, easing: "cubic-bezier(.4,0,.7,1)" });
    await sleep(520);
    if (!alive(tok)) return;

    // 결계 — 닿는 순간 멈춘다
    const shield = hexShield(hr.cx, hr.y - 80, 130, { col: C.brass, ms: 200 });
    sfx.clack(240);
    sfx.impact();
    flash(220, "#fff", 0.62);
    shake(500, 13);
    anim(shot, [{ transform: `translate(${hr.cx - or.cx}px, ${hr.y - 90 - or.cy}px) scale(1.2)` }], { duration: 160 });
    await sleep(200);
    if (!alive(tok)) return;

    // 반사
    sfx.whoosh(0.6);
    anim(shot, [
      { transform: `translate(${hr.cx - or.cx}px, ${hr.y - 90 - or.cy}px) scale(1.2)`, opacity: 1 },
      { transform: `translate(${rnd(-260, 260)}px, ${-or.cy - 120}px) scale(.5)`, opacity: 0 },
    ], { duration: 620, easing: EASE });
    ring(hr.cx, hr.y - 80, 30, 420, 760, "rgba(194,160,104,.8)", 3);
    h.textContent = "무효 — 이번 국 1회 소진";
    bigGlyph("無", { y: 280, col: C.brass, size: 92, ms: 1500 });
    banner("천하무적", "RON NULLIFIED", 1700);
    await sleep(1800);
    fade([h, dark, shield, shot]);
    await sleep(520);
  },
});

def({
  id: "last_stand", name: "승부수", tier: "gold", fam: DEFENSE,
  tag: "남은 점수를 전부 앞으로 밀어넣는다",
  tech: "'전부 건다'를 <b>점수가 물리적으로 판 가운데로 밀려나가는</b> 것으로 만든다. " +
        "숫자가 0이 되는 것보다 <b>내 앞이 비는 것</b>이 더 무섭다.",
  async run(tok) {
    const dark = veil("brightness(.48) saturate(.85)", 340);
    const h = chip("남은 점수 전부");
    const from = sRect(S.csBottom);
    sfx.riser(1.0);
    await sleep(360);
    if (!alive(tok)) return;

    // 칩 더미가 앞으로 밀린다
    const chips = [];
    for (let i = 0; i < 16; i++) {
      const c = mk(null, {
        position: "absolute", left: `${from.cx + rnd(-40, 40)}px`, top: `${from.cy + rnd(-6, 6)}px`,
        width: "26px", height: "8px", borderRadius: "4px",
        background: `linear-gradient(180deg,#e6d5ae,${C.brassDim})`,
        boxShadow: "0 2px 6px rgba(4,9,7,.6)",
      });
      chips.push(c);
      anim(c, [
        { transform: "translate(0,0)", opacity: 0 },
        { transform: `translate(${rnd(-60, 60)}px, ${-120 + rnd(-16, 16)}px)`, opacity: 1 },
      ], { duration: 620, delay: i * 32, easing: EASE });
    }
    countUp(S.csBottom, 25000, 0, 1100);
    await sleep(1100);
    if (!alive(tok)) return;

    sfx.impact();
    shake(560, 13);
    flash(200, "#dcc79a", 0.42);
    S.csBottom.textContent = "0";
    S.csBottom.style.color = C.red;
    h.textContent = "0점 — 이 국에 전부 건다";
    stamp("賭", { x: 500, y: 300, col: C.brass, size: 86, rot: -6 });
    banner("승 부 수", "LAST STAND", 1700);
    await sleep(1800);
    fade([h, dark, ...chips]);
    await sleep(520);
  },
});

def({
  id: "no_ron_pact", name: "불가침 조약", tier: "prism", fam: DEFENSE,
  tag: "지정한 상대와 서로 론하지 않기로 맺는다",
  tech: "두 사람 사이에만 성립하는 규칙이라 <b>두 좌석을 잇는 선</b>이 곧 조약이다. " +
        "선 위에 도장이 찍히고, 이후 그 선을 넘는 공격이 <b>선에서 멈춘다</b>.",
  async run(tok) {
    const dark = veil("brightness(.5) saturate(.8)", 340);
    const h = chip("조약 대상 지정");
    const me = sRect(S.myhand);
    const other = sRect(S.oppRight);
    const a = seatMark(S.oppRight, "조약 상대", C.brass, -10);
    sfx.ping(1000);
    await sleep(460);
    if (!alive(tok)) return;

    const link = linkTo({ cx: me.cx, cy: me.y - 20 }, other, { col: C.brass, bow: -90, ms: 520, width: 3 });
    sfx.whoosh(0.5);
    await sleep(560);
    if (!alive(tok)) return;

    sfx.impact();
    const mid = { x: (me.cx + other.cx) / 2 - 40, y: (me.y - 20 + other.cy) / 2 };
    stamp("盟", { x: mid.x, y: mid.y, col: C.brass, size: 66, rot: -10 });
    flash(150, "#dcc79a", 0.28);
    await sleep(620);
    if (!alive(tok)) return;

    // 공격이 선에서 멈춘다
    h.textContent = "서로 론 불가";
    const shot = mk(null, {
      position: "absolute", left: `${other.cx}px`, top: `${other.cy}px`,
      width: "20px", height: "20px", borderRadius: "50%",
      background: "radial-gradient(circle,#fff,#e0555f)", boxShadow: `0 0 16px ${C.red}`,
    });
    anim(shot, [
      { transform: "translate(0,0)", opacity: 1 },
      { transform: `translate(${mid.x - other.cx}px, ${mid.y - other.cy}px)`, opacity: 1 },
    ], { duration: 420, easing: EASE });
    later(() => {
      if (!alive(tok)) return;
      sfx.clack(300);
      anim(shot, [{ opacity: 1, scale: "1" }, { opacity: 0, scale: "2.2" }], { duration: 320 });
      ring(mid.x, mid.y, 12, 130, 520, "rgba(194,160,104,.85)", 2);
    }, 430);
    banner("불가침 조약", "NON-AGGRESSION", 1600);
    await sleep(1800);
    fade([h, dark, link, a, shot]);
    await sleep(520);
  },
});

def({
  id: "yakuman_shield", name: "역만 방어술", tier: "gold", fam: DEFENSE,
  tag: "역만급 타격을 결계가 통째로 흡수한다",
  tech: "천하무적과 같은 '막기'지만 <b>규모가 다르다</b>. 같은 결계를 쓰되 충격을 " +
        "화면 전체로 키우고 결계에 <b>금이 갔다가 버틴다</b> — 등급 차이는 크기가 아니라 대가로 보여준다.",
  async run(tok) {
    const dark = veil("brightness(.4) saturate(.85)", 380);
    const h = chip("역만 — 32000점", C.red);
    const hr = sRect(S.myhand);
    seatMark(S.oppTop, "역만 화료", C.red, 76);
    sfx.riser(1.4);
    bigGlyph("役満", { y: 210, col: C.red, size: 74, ms: 1200 });
    await sleep(900);
    if (!alive(tok)) return;

    // 거대한 충격
    sfx.beam();
    const shield = hexShield(hr.cx, hr.y - 76, 175, { col: C.brass, ms: 300 });
    flash(300, "#fff", 0.8);
    shake(1000, 22);
    for (let i = 0; i < 3; i++) {
      later(() => alive(tok) && ring(hr.cx, hr.y - 76, 40, 700, 900, "rgba(255,255,255,.5)", 4), i * 180);
    }
    await sleep(500);
    if (!alive(tok)) return;

    // 결계에 금이 간다 — 버티되 공짜는 아니다
    const sv = mkSvg({ zIndex: "6" });
    for (let i = 0; i < 7; i++) {
      const a = rnd(0, 6.283);
      let x = hr.cx;
      let y = hr.y - 76;
      let d = `M${x} ${y}`;
      for (let k = 0; k < 3; k++) {
        x += Math.cos(a + rnd(-0.5, 0.5)) * rnd(30, 62);
        y += Math.sin(a + rnd(-0.5, 0.5)) * rnd(30, 62);
        d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      const p = svgEl("path", { d, fill: "none", stroke: "rgba(255,255,255,.85)", "stroke-width": 1.6, "stroke-dasharray": 150, "stroke-dashoffset": 150 }, sv);
      anim(p, [{ strokeDashoffset: 150 }, { strokeDashoffset: 0 }], { duration: 260, delay: i * 24 });
    }
    sfx.shatter();
    await sleep(700);
    if (!alive(tok)) return;
    h.textContent = "흡수 — 결계 소모";
    anim(shield.poly, [{ opacity: 1 }, { opacity: 0.25 }], { duration: 620 });
    banner("역만 방어술", "YAKUMAN BLOCKED", 1800);
    await sleep(1800);
    fade([h, dark, shield, sv]);
    await sleep(520);
  },
});
