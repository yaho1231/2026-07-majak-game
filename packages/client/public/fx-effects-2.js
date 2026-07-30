/* MAJAK 증강 연출 랩 — 2차 배치 A · 정보 · 감시 계열
 *
 * 투시·스파이가 마음에 들었다는 피드백에서 출발한 배치다. 그 둘의 공통점은 화려함이
 * 아니라 "무엇을 알게 됐는지"가 화면에 남는다는 것 — HUD·레티클·마스크로 정보를
 * 다루고, 그 정보가 나만의 것이라는 비대칭까지 그린다. 여기 6종은 전부 그 축에 있다.
 */

import {
  ALL_CODES,
  EASE,
  EASE_IMPACT,
  NUM_CODES,
  S,
  alive,
  anim,
  banner,
  clamp,
  drawHooks,
  flash,
  handTiles,
  later,
  mk,
  mkSvg,
  pick,
  plausibleHand,
  ring,
  rnd,
  sRect,
  sTone,
  sfx,
  shake,
  sleep,
  svgEl,
  tileEl,
  veil,
} from "/fx-core.js?v=9";
import { def } from "/fx-registry.js?v=9";

/** 패 종류 표기 — HUD 라벨용 */
const label = (code) => {
  const r = code[0];
  const s = code[1];
  if (s === "z") return ["동", "남", "서", "북", "백", "발", "중"][+r - 1] ?? code;
  return `${r}${{ m: "만", p: "통", s: "삭" }[s]}`;
};

/* ══════════════════ 지뢰 탐지 ══════════════════ */

def({
  id: "danger_sense",
  name: "지뢰 탐지",
  tier: "prism",
  fam: "마스크 · 스캔",
  tag: "손패마다 위험도가 뜬다 — 어느 걸 버리면 죽는지 보인다",
  tech:
    "연출이 아니라 <b>데이터 오버레이</b>다. 패마다 위험도 막대·수치를 띄우고 위험/안전을 색으로 " +
    "가른다. 스펙터클 없이 정보만으로 긴장을 만드는 쪽 — <b>판단을 바꾸는 연출</b>이라 " +
    "실제 게임에서 가장 오래 쓰이는 종류다.",
  async run(tok) {
    const tiles = handTiles().slice(0, 13);
    const dark = veil("brightness(.62) saturate(.7)", 340);

    // 위험도 — 몇 장은 확실히 위험하게 만들어 그림이 심심하지 않게 한다
    const risks = tiles.map(() => rnd(0.04, 0.55));
    risks[(Math.random() * 13) | 0] = rnd(0.86, 0.97);
    risks[(Math.random() * 13) | 0] = rnd(0.7, 0.84);

    const col = (r) =>
      r > 0.68 ? "255,90,106" : r > 0.4 ? "224,168,74" : "126,214,140";

    // 상대 리치 표시 — 위험의 출처를 보여준다
    const orr = sRect(S.oppTop);
    const src = mk(null, {
      position: "absolute",
      left: `${orr.cx - 52}px`,
      top: `${orr.y + orr.h + 8}px`,
      padding: "3px 9px",
      borderRadius: "5px",
      background: "rgba(120,20,32,.9)",
      border: "1px solid rgba(255,90,106,.9)",
      font: "800 11px/1 ui-monospace, monospace",
      letterSpacing: "2px",
      color: "#ffd0d4",
      whiteSpace: "nowrap",
    });
    src.textContent = "리치 · 위험원";
    anim(src, [{ opacity: 0, transform: "translateY(-8px)" }, { opacity: 1, transform: "none" }], {
      duration: 260,
      easing: EASE,
    });
    sfx.ping(700);
    await sleep(360);
    if (!alive(tok)) return;

    // 좌 → 우 스캔. 패마다 막대 + 수치가 올라온다
    const cols = [];
    for (const [i, el] of tiles.entries()) {
      const r = sRect(el);
      const risk = risks[i];
      const c = col(risk);
      const H = 46;

      const box = mk(null, {
        position: "absolute",
        left: `${r.cx - 15}px`,
        top: `${r.y - H - 20}px`,
        width: "30px",
        height: `${H + 16}px`,
        opacity: "0",
      });
      // 막대 트랙
      const track = mk(null, {
        position: "absolute",
        left: "11px",
        top: "14px",
        width: "8px",
        height: `${H}px`,
        borderRadius: "4px",
        background: "rgba(236,228,210,.08)",
        border: "1px solid rgba(236,228,210,.14)",
        overflow: "hidden",
      }, box);
      const fill = mk(null, {
        position: "absolute",
        left: "0",
        bottom: "0",
        width: "100%",
        height: "0%",
        background: `linear-gradient(0deg, rgba(${c},.45), rgba(${c},1))`,
        boxShadow: `0 0 8px rgba(${c},.8)`,
      }, track);
      // 수치
      const num = mk(null, {
        position: "absolute",
        left: "50%",
        top: "0",
        transform: "translateX(-50%)",
        font: "800 9.5px/1 ui-monospace, monospace",
        color: `rgb(${c})`,
        whiteSpace: "nowrap",
      }, box);
      num.textContent = "--";

      cols.push({ box, fill, num, risk, c, el });

      later(() => {
        if (!alive(tok)) return;
        anim(box, [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], {
          duration: 220,
          easing: EASE,
        });
        anim(fill, [{ height: "0%" }, { height: `${Math.round(risk * 100)}%` }], {
          duration: 420,
          easing: EASE,
        });
        // 수치 카운트업
        const t0 = performance.now();
        const tick = () => {
          if (!alive(tok)) return;
          const p = clamp((performance.now() - t0) / 420, 0, 1);
          num.textContent = `${Math.round(risk * 100 * p)}%`;
          if (p < 1) requestAnimationFrame(tick);
        };
        tick();
        // 패 자체에도 테두리로 판정을 남긴다
        el.style.outline = `1.5px solid rgba(${c},.85)`;
        el.style.outlineOffset = "1px";
        sTone({ f: 900 + risk * 1400, dur: 0.05, gain: 0.05, type: "sine" });
      }, i * 85);
    }
    await sleep(13 * 85 + 500);
    if (!alive(tok)) return;

    // 최고 위험패 — 크게 표시하고 위험원까지 선을 잇는다
    let wi = 0;
    for (let i = 1; i < risks.length; i++) if (risks[i] > risks[wi]) wi = i;
    const wr = sRect(tiles[wi]);
    sfx.impact();
    shake(300, 7);
    flash(140, "#ff5a6a", 0.2);
    ring(wr.cx, wr.cy, 16, 110, 520, "rgba(255,90,106,.9)", 2);

    const mine = mk(null, {
      position: "absolute",
      left: `${wr.cx}px`,
      top: `${wr.y - 96}px`,
      transform: "translateX(-50%)",
      font: "900 24px/1 serif",
      color: "#ff5a6a",
      textShadow: "0 0 16px rgba(255,90,106,.8)",
    });
    mine.textContent = "危";
    anim(mine, [
      { opacity: 0, transform: "translateX(-50%) scale(2.6)" },
      { opacity: 1, transform: "translateX(-50%) scale(1)" },
    ], { duration: 300, easing: EASE });

    // 위험원 → 위험패 연결선
    const sv = mkSvg({ zIndex: "4" });
    const line = svgEl("path", {
      d: `M${orr.cx} ${orr.y + orr.h + 22} Q${(orr.cx + wr.cx) / 2 + 90} ${(orr.cy + wr.cy) / 2} ${wr.cx} ${wr.y - 78}`,
      fill: "none",
      stroke: "rgba(255,90,106,.75)",
      "stroke-width": 1.6,
      "stroke-dasharray": "6 6",
    }, sv);
    const L = line.getTotalLength();
    line.setAttribute("stroke-dasharray", `${L}`);
    line.setAttribute("stroke-dashoffset", `${L}`);
    anim(line, [{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 420, easing: EASE });

    // 권고: 가장 안전한 패
    let si = 0;
    for (let i = 1; i < risks.length; i++) if (risks[i] < risks[si]) si = i;
    const rec = mk(null, {
      position: "absolute",
      left: "50%",
      top: "76px",
      transform: "translateX(-50%)",
      padding: "6px 16px",
      borderRadius: "999px",
      background: "rgba(14,23,18,.92)",
      border: "1px solid rgba(126,214,140,.6)",
      font: "800 12px/1 ui-monospace, monospace",
      letterSpacing: "3px",
      color: "#7ed68c",
      whiteSpace: "nowrap",
    });
    rec.textContent = `안전패 ${label(tiles[si].dataset.code || "")} · ${Math.round(risks[si] * 100)}%`;
    anim(rec, [
      { opacity: 0, transform: "translateX(-50%) translateY(-10px)" },
      { opacity: 1, transform: "translateX(-50%) translateY(0)" },
    ], { duration: 300, delay: 220, easing: EASE });
    sfx.ping(1800);
    // 안전패를 살짝 들어 올려 시선을 준다
    anim(tiles[si], [
      { transform: "translateY(0)" },
      { transform: "translateY(-10px)" },
    ], { duration: 280, delay: 260, easing: EASE });

    await sleep(2400);
    if (!alive(tok)) return;
    for (const c of cols) {
      anim(c.box, [{ opacity: 1 }, { opacity: 0 }], { duration: 400 });
      c.el.style.outline = "";
    }
    for (const el of [sv, mine, rec, src, dark]) anim(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 400 });
    await sleep(500);
  },
});

/* ══════════════════ 선언 간파 ══════════════════ */

def({
  id: "peek_riichi_waits",
  name: "선언 간파",
  tier: "gold",
  fam: "마스크 · 스캔",
  tag: "리치한 상대의 대기패가 홀로그램으로 떠오른다",
  tech:
    "주사선 + 시안 틴트 + screen 합성으로 만든 <b>홀로그램 재질</b>과, 캔버스 additive 로 그린 " +
    "<b>볼류메트릭 광주</b>. 상대 좌석에서 정보가 '솟아오른다'는 방향을 만들어 누구의 정보인지 " +
    "헷갈리지 않게 한다.",
  async run(tok) {
    const dark = veil("brightness(.5) saturate(.6)", 380);
    const orr = sRect(S.oppTop);

    // 리치 선언 표시
    const tag = mk(null, {
      position: "absolute",
      left: `${orr.cx - 34}px`,
      top: `${orr.y + orr.h + 8}px`,
      padding: "3px 10px",
      borderRadius: "5px",
      background: "rgba(120,20,32,.92)",
      border: "1px solid rgba(255,90,106,.9)",
      font: "800 12px/1 ui-monospace, monospace",
      letterSpacing: "3px",
      color: "#ffd0d4",
    });
    tag.textContent = "리치";
    anim(tag, [{ opacity: 0, transform: "scale(.7)" }, { opacity: 1, transform: "scale(1)" }], {
      duration: 240,
      easing: EASE,
    });
    sfx.riser(0.7);
    await sleep(420);
    if (!alive(tok)) return;

    // 볼류메트릭 광주 — 좌석에서 위로 솟는다
    let ct = 0;
    drawHooks.add((dt, c) => {
      ct += dt;
      const p = clamp(ct / 26, 0, 1);
      const w = 120 * p;
      c.save();
      c.globalCompositeOperation = "lighter";
      const g = c.createLinearGradient(orr.cx - w, 0, orr.cx + w, 0);
      g.addColorStop(0, "rgba(110,225,255,0)");
      g.addColorStop(0.5, `rgba(110,225,255,${0.3 * p})`);
      g.addColorStop(1, "rgba(110,225,255,0)");
      c.fillStyle = g;
      c.fillRect(orr.cx - w, 0, w * 2, orr.cy + 40);
      c.restore();
      return true;
    });
    sfx.ping(2100);
    await sleep(360);
    if (!alive(tok)) return;

    // 대기패 3종이 좌석 위로 떠오른다 — 홀로그램
    const waits = [pick(NUM_CODES), pick(NUM_CODES), pick(NUM_CODES)];
    const holos = [];
    for (const [i, code] of waits.entries()) {
      const wrap = mk(null, {
        position: "absolute",
        left: `${orr.cx + (i - 1) * 70 - 27}px`,
        top: `${orr.y + orr.h + 44}px`,
        width: "54px",
        height: "72px",
      });
      const t = tileEl(code);
      Object.assign(t.style, {
        position: "absolute",
        inset: "0",
        filter: "hue-rotate(150deg) saturate(2.6) brightness(1.25)",
        opacity: "0.86",
        boxShadow: "0 0 22px rgba(110,225,255,.75)",
        border: "1px solid rgba(110,225,255,.8)",
      });
      t.style.setProperty("--tile-w", "54px");
      t.style.setProperty("--tile-h", "72px");
      wrap.appendChild(t);
      // 주사선
      mk(null, {
        position: "absolute",
        inset: "0",
        borderRadius: "5px",
        background: "repeating-linear-gradient(0deg, rgba(110,225,255,.3) 0 1px, transparent 1px 4px)",
        mixBlendMode: "screen",
      }, wrap);
      // 라벨
      const lb = mk(null, {
        position: "absolute",
        left: "50%",
        bottom: "-19px",
        transform: "translateX(-50%)",
        font: "800 10px/1 ui-monospace, monospace",
        color: "#8fd8ea",
        whiteSpace: "nowrap",
      }, wrap);
      lb.textContent = label(code);

      holos.push(wrap);
      later(() => {
        if (!alive(tok)) return;
        anim(wrap, [
          { opacity: 0, transform: "translateY(30px) scale(.6)" },
          { opacity: 1, transform: "translateY(0) scale(1)" },
        ], { duration: 460, easing: EASE });
        // 떠 있는 동안 천천히 흔들린다 — 실체가 아니라는 신호
        anim(wrap, [
          { translate: "0 0" },
          { translate: "0 -5px" },
          { translate: "0 0" },
        ], { duration: 2600, delay: 460, iterations: Infinity, easing: "ease-in-out" });
        sTone({ f: 1200 + i * 300, dur: 0.22, gain: 0.07, type: "sine" });
      }, i * 160);
    }

    await sleep(900);
    if (!alive(tok)) return;
    banner("선언 간파", `WAITS READ · ${waits.length}종`, 1600);
    await sleep(1700);
    if (!alive(tok)) return;
    for (const el of [...holos, tag, dark]) anim(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 460 });
    await sleep(560);
  },
});

/* ══════════════════ 이면투시 ══════════════════ */

def({
  id: "ura_peek",
  name: "이면투시",
  tier: "silver",
  fam: "3D · 물리",
  tag: "도라 표시패를 들어 이면을 확인하고 되돌려 놓는다",
  tech:
    "<b>backface-visibility</b> 로 앞·뒤 두 면을 가진 진짜 카드를 만들어 rotateY 로 뒤집는다 " +
    "(가짜 플립은 중간에 정체가 드러난다). 마지막에 <b>원위치로 되돌리는</b> 것이 요점 — " +
    "몰래 봤다는 사실 자체가 연출이다.",
  async run(tok) {
    // 도라 표시패 — 패산 위에 한 장 눕혀 놓는다
    const walls = [...S.wallTop.querySelectorAll(".tf")];
    const anchor = sRect(walls[4]);
    const dark = veil(
      "brightness(.5) saturate(.7)",
      340,
      `radial-gradient(circle at ${anchor.cx}px ${anchor.cy}px, transparent 0 70px, black 160px)`,
    );

    const W = 52;
    const H = 70;
    const card = mk(null, {
      position: "absolute",
      left: `${anchor.cx - W / 2}px`,
      top: `${anchor.cy - H / 2}px`,
      width: `${W}px`,
      height: `${H}px`,
      transformStyle: "preserve-3d",
    });
    // 앞면 = 도라 표시패
    const front = tileEl(pick(NUM_CODES));
    Object.assign(front.style, { position: "absolute", inset: "0", backfaceVisibility: "hidden" });
    front.style.setProperty("--tile-w", `${W}px`);
    front.style.setProperty("--tile-h", `${H}px`);
    card.appendChild(front);
    // 뒷면 = 이면 도라 (미리 180° 돌려 붙여둔다)
    const uraCode = pick(NUM_CODES);
    const back = tileEl(uraCode);
    Object.assign(back.style, {
      position: "absolute",
      inset: "0",
      backfaceVisibility: "hidden",
      transform: "rotateY(180deg)",
      boxShadow: "0 0 22px rgba(194,160,104,.8)",
    });
    back.style.setProperty("--tile-w", `${W}px`);
    back.style.setProperty("--tile-h", `${H}px`);
    card.appendChild(back);

    const lb = mk(null, {
      position: "absolute",
      left: `${anchor.cx}px`,
      top: `${anchor.cy - H / 2 - 22}px`,
      transform: "translateX(-50%)",
      font: "700 10px/1 ui-monospace, monospace",
      letterSpacing: "2px",
      color: "#a8bcaf",
      whiteSpace: "nowrap",
    });
    lb.textContent = "도라 표시패";
    anim(lb, [{ opacity: 0 }, { opacity: 1 }], { duration: 260 });
    sfx.ping(1100);
    await sleep(420);
    if (!alive(tok)) return;

    // 살짝 들어 올리고 뒤집는다
    sfx.clack(1300);
    anim(card, [
      { transform: "perspective(700px) translateZ(0) rotateY(0deg) translateY(0)" },
      { transform: "perspective(700px) translateZ(60px) rotateY(90deg) translateY(-26px)", offset: 0.5 },
      { transform: "perspective(700px) translateZ(60px) rotateY(180deg) translateY(-26px)" },
    ], { duration: 720, easing: EASE });
    // 뒤집히는 면을 훑는 광택
    const gl = mk(null, {
      position: "absolute",
      left: `${anchor.cx - 60}px`,
      top: `${anchor.cy - 70}px`,
      width: "120px",
      height: "120px",
      background: "linear-gradient(105deg, transparent 40%, rgba(236,228,210,.6) 50%, transparent 60%)",
      mixBlendMode: "screen",
    });
    anim(gl, [{ transform: "translateX(-90%)" }, { transform: "translateX(90%)" }], {
      duration: 520,
      delay: 260,
      easing: EASE,
    }).finished.then(() => gl.remove()).catch(() => gl.remove());
    await sleep(760);
    if (!alive(tok)) return;

    // 이면 공개
    lb.textContent = `이면 도라 · ${label(uraCode)}`;
    lb.style.color = "#c2a068";
    ring(anchor.cx, anchor.cy - 26, 14, 120, 560, "rgba(194,160,104,.85)", 2);
    sfx.chime();
    const wm = mk(null, {
      position: "absolute",
      left: "50%",
      top: "70px",
      transform: "translateX(-50%)",
      padding: "6px 16px",
      borderRadius: "999px",
      border: "1px dashed rgba(194,160,104,.6)",
      background: "rgba(14,23,18,.85)",
      font: "800 12px/1 ui-monospace, monospace",
      letterSpacing: "4px",
      color: "#c2a068",
    });
    wm.textContent = "裏 · 나에게만 보임";
    anim(wm, [
      { opacity: 0, transform: "translateX(-50%) translateY(-10px)" },
      { opacity: 1, transform: "translateX(-50%) translateY(0)" },
    ], { duration: 300, easing: EASE });
    await sleep(1500);
    if (!alive(tok)) return;

    // 되돌려 놓는다 — 아무 일도 없었던 것처럼
    sfx.clack(900);
    anim(card, [
      { transform: "perspective(700px) translateZ(60px) rotateY(180deg) translateY(-26px)" },
      { transform: "perspective(700px) translateZ(0) rotateY(360deg) translateY(0)" },
    ], { duration: 620, easing: EASE });
    anim(wm, [{ opacity: 1 }, { opacity: 0 }], { duration: 320 });
    anim(lb, [{ opacity: 1 }, { opacity: 0 }], { duration: 320 });
    await sleep(680);
    if (!alive(tok)) return;
    anim(dark, [{ opacity: 1 }, { opacity: 0 }], { duration: 420 });
    anim(card, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay: 120 });
    await sleep(520);
  },
});

/* ══════════════════ 예지 ══════════════════ */

def({
  id: "foresight",
  name: "예지",
  tier: "prism",
  fam: "시간 · 궤적",
  tag: "앞으로 뽑을 패 다섯 장이 시간 레일에 늘어선다",
  tech:
    "CSS <b>offset-path</b> 로 패산에서 레일까지 곡선을 태워 보낸다(키프레임으로 궤적을 " +
    "샘플링하지 않아도 된다). 미래의 패는 <b>서리유리</b>(backdrop-filter)로 그려 " +
    "지금 존재하는 패와 재질부터 구분한다.",
  async run(tok) {
    const dark = veil("brightness(.6) saturate(.75)", 340);
    const walls = [...S.wallTop.querySelectorAll(".tf")];
    const from = sRect(walls[walls.length - 1]);

    // 시간 레일
    const RY = 168;  // 상대 손패(y 14..55)와 겹치지 않는 높이
    const rail = mk(null, {
      position: "absolute",
      left: "230px",
      top: `${RY}px`,
      width: "540px",
      height: "1px",
      background: "linear-gradient(90deg, transparent, rgba(194,160,104,.7) 12%, rgba(194,160,104,.7) 88%, transparent)",
      transformOrigin: "left center",
    });
    anim(rail, [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 420, easing: EASE });
    const rlb = mk(null, {
      position: "absolute",
      left: "230px",
      top: `${RY - 22}px`,
      font: "700 10px/1 ui-monospace, monospace",
      letterSpacing: "3px",
      color: "#9a7b42",
    });
    rlb.textContent = "앞으로 뽑을 패";
    anim(rlb, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 200 });
    sfx.riser(0.8);
    await sleep(520);
    if (!alive(tok)) return;

    // 다섯 장이 곡선을 타고 레일로
    const N = 5;
    const codes = plausibleHand().slice(0, N);
    const ghosts = [];
    for (let i = 0; i < N; i++) {
      const tx = 300 + i * 100;
      const ty = RY;
      // 눈금
      const tick = mk(null, {
        position: "absolute",
        left: `${tx}px`,
        top: `${RY - 5}px`,
        width: "1px",
        height: "10px",
        background: "rgba(194,160,104,.7)",
      });
      const tno = mk(null, {
        position: "absolute",
        left: `${tx}px`,
        top: `${RY + 10}px`,
        transform: "translateX(-50%)",
        font: "700 9px/1 ui-monospace, monospace",
        color: "#7b9084",
      });
      tno.textContent = `+${i + 1}`;

      // 서리유리 고스트 패
      const g = mk(null, {
        position: "absolute",
        left: "0",
        top: "0",
        width: "46px",
        height: "62px",
        borderRadius: "5px",
        border: "1px solid rgba(194,160,104,.55)",
        background: "rgba(236,228,210,.07)",
        backdropFilter: "blur(3px) brightness(1.15)",
        webkitBackdropFilter: "blur(3px) brightness(1.15)",
        boxShadow: "0 0 18px rgba(194,160,104,.28)",
        // offset-path 는 요소의 좌표계 기준이라 fx 레이어 원점(무대 원점)에서 그린다
        offsetPath: `path("M ${from.cx - 23} ${from.cy - 31} C ${from.cx + 40} ${from.cy - 120}, ${tx - 70} ${RY - 130}, ${tx - 23} ${ty - 76}")`,
        offsetDistance: "0%",
        opacity: "0",
      });
      const img = document.createElement("img");
      img.src = `/tiles/${codes[i]}.png`;
      Object.assign(img.style, {
        width: "100%",
        height: "100%",
        objectFit: "contain",
        opacity: "0.62",
        filter: "brightness(1.5) saturate(.5)",
      });
      g.appendChild(img);
      ghosts.push({ g, tick, tno });

      later(() => {
        if (!alive(tok)) return;
        anim(g, [
          { offsetDistance: "0%", opacity: 0, scale: "0.5" },
          { offsetDistance: "100%", opacity: 1, scale: "1" },
        ], { duration: 620, easing: EASE });
        anim(tick, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: 420 });
        anim(tno, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: 460 });
        sTone({ f: 1000 + i * 220, dur: 0.16, gain: 0.06, type: "sine" });
      }, i * 150);
    }
    await sleep(N * 150 + 700);
    if (!alive(tok)) return;

    banner("예 지", `FORESIGHT · +${N}`, 1500);
    await sleep(1600);
    if (!alive(tok)) return;

    // 레일이 접히고 미래가 닫힌다
    for (const [i, o] of ghosts.entries()) {
      anim(o.g, [{ opacity: 1, scale: "1" }, { opacity: 0, scale: "0.7" }], { duration: 360, delay: i * 60 });
      anim(o.tick, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay: i * 60 });
      anim(o.tno, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay: i * 60 });
    }
    anim(rail, [{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }], { duration: 420, delay: 260, easing: EASE });
    anim(rlb, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
    anim(dark, [{ opacity: 1 }, { opacity: 0 }], { duration: 500, delay: 200 });
    await sleep(900);
  },
});

/* ══════════════════ 밑장빼기 ══════════════════ */

def({
  id: "bottom_deal",
  name: "밑장빼기",
  tier: "prism",
  fam: "시간 · 궤적",
  tag: "패산 밑에서 한 장을 빼내 손에 숨긴다",
  tech:
    "<b>고스트 잔상 모션블러</b> — 궤적 위에 반투명 사본을 여러 장 깔고 시차를 두고 지운다. " +
    "캔버스 트레일과 달리 <b>패 모양이 그대로 번지므로</b> '빠른 손'으로 읽힌다. " +
    "끝나면 아무 일도 없던 화면으로 돌아가는 게 이 연출의 핵심이다.",
  async run(tok) {
    const walls = [...S.wallTop.querySelectorAll(".tf")];
    const srcEl = walls[2];
    const wr = sRect(srcEl);
    const dest = handTiles()[0];
    const dr = sRect(dest);

    // 시간이 늘어진다 — 속임수가 일어나는 틈
    const dark = veil("brightness(.66) saturate(.55) contrast(1.05)", 420);
    sfx.riser(0.5);

    // 손 그림자가 패산 위를 지나간다
    const shadow = mk(null, {
      position: "absolute",
      left: `${wr.cx - 130}px`,
      top: `${wr.y - 40}px`,
      width: "260px",
      height: "110px",
      borderRadius: "50%",
      background: "radial-gradient(ellipse, rgba(3,7,5,.75), transparent 70%)",
    });
    anim(shadow, [
      { transform: "translateX(-220px)", opacity: 0 },
      { transform: "translateX(0)", opacity: 1, offset: 0.5 },
      { transform: "translateX(200px)", opacity: 0 },
    ], { duration: 900, easing: "ease-in-out" }).finished
      .then(() => shadow.remove()).catch(() => shadow.remove());
    await sleep(560);
    if (!alive(tok)) return;

    // 밑장 — 패산 아래로 쑥 빠진다
    const code = pick(NUM_CODES);
    const card = tileEl(code);
    Object.assign(card.style, {
      position: "absolute",
      left: `${wr.x}px`,
      top: `${wr.y}px`,
      zIndex: "12",
    });
    card.style.setProperty("--tile-w", `${wr.w}px`);
    card.style.setProperty("--tile-h", `${wr.h}px`);
    S.fx.appendChild(card);
    sfx.clack(1500);
    anim(card, [
      { transform: "translateY(0) scale(1)", opacity: 0 },
      { transform: `translateY(${wr.h * 0.9}px) scale(1)`, opacity: 1 },
    ], { duration: 220, easing: EASE });
    await sleep(240);
    if (!alive(tok)) return;

    // 고스트 잔상 — 궤적 위에 사본을 깔고 시차로 지운다
    const p0 = { x: wr.x, y: wr.y + wr.h * 0.9 };
    const p2 = { x: dr.x, y: dr.y };
    const p1 = { x: (p0.x + p2.x) / 2 - 120, y: p0.y + 150 };
    const at = (t) => {
      const u = 1 - t;
      return {
        x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
        y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
      };
    };
    const GH = 9;
    for (let i = 1; i <= GH; i++) {
      const t = i / (GH + 1);
      const q = at(t);
      const gh = tileEl(code);
      Object.assign(gh.style, {
        position: "absolute",
        left: `${q.x}px`,
        top: `${q.y}px`,
        zIndex: "11",
        opacity: `${0.5 - (i / GH) * 0.32}`,
        filter: "blur(1.4px) brightness(1.1)",
        transform: `rotate(${t * 200}deg) scale(${1 - t * 0.15})`,
      });
      gh.style.setProperty("--tile-w", `${wr.w}px`);
      gh.style.setProperty("--tile-h", `${wr.h}px`);
      S.fx.appendChild(gh);
      // 앞쪽 잔상이 먼저 사라져 방향이 읽힌다
      anim(gh, [{ opacity: Number(gh.style.opacity) }, { opacity: 0 }], {
        duration: 260,
        delay: 60 + i * 26,
      }).finished.then(() => gh.remove()).catch(() => gh.remove());
    }
    // 본체
    const steps = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const q = at(t);
      steps.push({
        transform: `translate(${(q.x - p0.x).toFixed(1)}px, ${(q.y - p0.y).toFixed(1)}px) rotate(${(t * 200).toFixed(0)}deg) scale(${(1 - t * 0.15).toFixed(2)})`,
        offset: t,
      });
    }
    sfx.whoosh(0.35);
    anim(card, [
      { transform: `translateY(${wr.h * 0.9}px)` },
      ...steps.slice(1),
    ], { duration: 380, easing: "cubic-bezier(.4,0,.5,1)" });
    await sleep(400);
    if (!alive(tok)) return;

    // 손에 들어간다 — 나만 아는 표식
    card.remove();
    dest.dataset.code = code;
    const im = dest.querySelector("img");
    if (im) im.src = `/tiles/${code}.png`;
    sfx.clack(800);
    anim(dest, [
      { transform: "scale(1.35) rotate(-12deg)", opacity: 0.5 },
      { transform: "scale(1) rotate(0)", opacity: 1 },
    ], { duration: 340, easing: EASE_IMPACT });

    const stamp = mk(null, {
      position: "absolute",
      left: `${dr.cx}px`,
      top: `${dr.y - 34}px`,
      transform: "translateX(-50%)",
      padding: "4px 10px",
      borderRadius: "4px",
      border: "1px dashed rgba(194,160,104,.7)",
      background: "rgba(14,23,18,.9)",
      font: "800 10px/1 ui-monospace, monospace",
      letterSpacing: "2px",
      color: "#c2a068",
      whiteSpace: "nowrap",
    });
    stamp.textContent = `밑장 ${label(code)} · 나만 아는 패`;
    anim(stamp, [
      { opacity: 0, transform: "translateX(-50%) translateY(6px)" },
      { opacity: 1, transform: "translateX(-50%) translateY(0)" },
    ], { duration: 260, easing: EASE });

    await sleep(1500);
    if (!alive(tok)) return;
    // 아무 일도 없었던 화면으로
    anim(stamp, [{ opacity: 1 }, { opacity: 0 }], { duration: 420 });
    anim(dark, [{ opacity: 1 }, { opacity: 0 }], { duration: 520 });
    await sleep(620);
  },
});

/* ══════════════════ 무르기 ══════════════════ */

def({
  id: "take_back",
  name: "무르기",
  tier: "silver",
  fam: "시간 · 궤적",
  tag: "버린 패가 되감겨 손으로 돌아온다",
  tech:
    "타패를 한 번 <b>정방향으로 재생한 뒤 같은 애니메이션 객체의 playbackRate 를 음수로</b> " +
    "돌려 진짜로 되감는다 — 역방향 키프레임을 따로 쓰지 않으니 궤적이 정확히 일치하고, " +
    "그래서 '되돌렸다'로 읽힌다. 필름 저더와 채도 감소로 시간축을 건드렸다는 걸 알린다.",
  async run(tok) {
    const hand = handTiles();
    const giver = hand[hand.length - 1];
    const gr = sRect(giver);
    const pond = S.pondMe;
    const slot = pond.appendChild(tileEl(giver.dataset.code || "1m"));
    slot.style.visibility = "hidden";
    const pr = sRect(slot);

    // 1) 먼저 버린다 — 무엇을 무르는지 보여준다
    const flying = tileEl(giver.dataset.code || "1m");
    Object.assign(flying.style, { position: "absolute", left: `${gr.x}px`, top: `${gr.y}px`, zIndex: "12" });
    flying.style.setProperty("--tile-w", `${gr.w}px`);
    flying.style.setProperty("--tile-h", `${gr.h}px`);
    S.fx.appendChild(flying);
    giver.style.visibility = "hidden";

    sfx.clack(950);
    const discard = anim(flying, [
      { transform: "translate(0,0) scale(1) rotate(0deg)" },
      { transform: `translate(${pr.cx - gr.cx}px, ${pr.cy - gr.cy}px) scale(${pr.w / gr.w}) rotate(0deg)` },
    ], { duration: 420, easing: "cubic-bezier(.4,0,.6,1)" });
    await sleep(460);
    if (!alive(tok)) return;
    sfx.clack(700);
    ring(pr.cx, pr.cy, 8, 60, 320, "rgba(236,228,210,.5)", 2);
    await sleep(420);
    if (!alive(tok)) return;

    // 2) 시간축을 건드린다 — 채도 빠지고 필름이 떨린다
    const grade = veil("saturate(.25) brightness(.8) contrast(1.12)", 260);
    const lines = mk(null, {
      position: "absolute",
      inset: "0",
      background: "repeating-linear-gradient(0deg, rgba(236,228,210,.06) 0 2px, transparent 2px 5px)",
      mixBlendMode: "screen",
    });
    anim(lines, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    // 저더 — 프레임이 걸리는 느낌
    const jud = [];
    for (let i = 0; i <= 14; i++) {
      jud.push({ transform: i % 2 ? `translateY(${rnd(-4, 4)}px)` : "translateY(0px)" });
    }
    anim(S.board, jud, { duration: 520, easing: "steps(1, end)", composite: "add" });
    sfx.scratch(0.5);
    sTone({ f: 220, f2: 90, dur: 0.35, gain: 0.12, type: "sawtooth" });
    await sleep(300);
    if (!alive(tok)) return;

    // 3) 되감기 — 같은 애니메이션을 음의 재생속도로 돌린다
    sfx.whoosh(0.5);
    discard.playbackRate = -1.4;
    void discard.play();
    // 되감기 잔상 — 뒤로 끌리는 고스트
    let tt = 0;
    const trail = [];
    drawHooks.add((dt, c) => {
      tt += dt;
      const r = sRect(flying);
      trail.push({ x: r.cx, y: r.cy });
      if (trail.length > 20) trail.shift();
      c.save();
      for (const [i, p] of trail.entries()) {
        c.globalAlpha = (1 - i / trail.length) * 0.28;
        c.fillStyle = "#ece4d2";
        c.fillRect(p.x - gr.w / 2, p.y - gr.h / 2, gr.w, gr.h);
      }
      c.restore();
      return tt < 40;
    });
    await sleep(360);
    if (!alive(tok)) return;

    // 4) 손으로 복귀 — 버림패도 한 장 줄어든다
    flying.remove();
    slot.remove();
    giver.style.visibility = "";
    sfx.chime();
    anim(giver, [
      { transform: "scale(1.3)", opacity: 0.4, filter: "brightness(2)" },
      { transform: "scale(1)", opacity: 1, filter: "brightness(1)" },
    ], { duration: 380, easing: EASE_IMPACT });
    ring(gr.cx, gr.cy, 10, 90, 460, "rgba(194,160,104,.8)", 2);
    anim(lines, [{ opacity: 1 }, { opacity: 0 }], { duration: 340 });
    anim(grade, [{ opacity: 1 }, { opacity: 0 }], { duration: 480 });
    banner("무 르 기", "TAKE BACK", 1400);
    await sleep(1500);
  },
});
