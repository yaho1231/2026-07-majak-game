/* MAJAK 증강 연출 랩 — 3차 배치 · 모달을 없애는 연출 9종
 *
 * 지금 클라이언트에서 이 9종은 전부 **전체화면 선택창(createPortal 모달)** 을 띄운다.
 * App.tsx 의 MODAL_PICK_TYPES + 전용 UI 로 빠진 것들이 그 목록이고, 발동하면 판이
 * 사라지고 팝업이 뜬다 — 마작을 하다가 대화상자를 만나는 셈이다.
 *
 * 이 배치의 주제는 하나다: **판 위에서 고르게 한다.** 고르는 대상이 패라면 실제 그 패를
 * 짚게 하고, 고른 결과를 같은 화면에서 바로 보여준다. 그래서 9종이 서로 다른 연출이면서도
 * 같은 선택 언어(pickSweep)를 공유한다 — 새 인터랙션을 9개 배우게 하면 안 된다.
 *
 * 랩에서는 클릭 대신 후보를 훑다가 하나에 내려앉는 것으로 '고르는 동작'을 재생한다.
 * 실제 클라이언트에 옮길 때는 이 자리에 사용자 클릭이 들어간다.
 */

import {
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

const FAM = "선택 · 인터랙션";

/** 패산 앞 4장이 누구의 쯔모가 되는지 — App.tsx 의 DRAW_ORDER_LABELS 와 같은 순서 */
const DRAW_ORDER = ["하가", "대면", "상가", "나"];

const SUITS = { m: "萬", p: "筒", s: "索" };

/**
 * 지시 칩 — "지금 무엇을 고르는 중인지"를 모달 없이 알린다.
 *
 * 좌상단 HUD 라벨 바로 아래에 둔다. 상단 '중앙'은 상대 손패(x 293~707)와 패산(x 339~661)이
 * 차지하지만 좌측 x 18~280 은 비어 있다 — 중앙에 두면 이 배치의 절반(왕패·영상패·예지처럼
 * 패산을 쓰는 연출)에서 칩이 패를 덮는다. 하단도 손패(x 151~848)와 겹쳐 못 쓴다.
 * 게다가 '고르는 중' 은 배너가 아니라 상태 표시라 모서리가 더 맞다.
 */
function hint(text, col = "#c2a068") {
  const h = mk(null, {
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
  h.textContent = text;
  anim(h, [
    { opacity: 0, transform: "translateX(-12px)" },
    { opacity: 1, transform: "translateX(0)" },
  ], { duration: 260, easing: EASE });
  return h;
}

/** 후보 테두리 하나 */
function frameOf(r, { pad = 3, col = "rgba(194,160,104,.55)", dash = "5 4", radius = 7 } = {}) {
  return mk(null, {
    position: "absolute",
    left: `${r.x - pad}px`,
    top: `${r.y - pad}px`,
    width: `${r.w + pad * 2}px`,
    height: `${r.h + pad * 2}px`,
    border: `1.5px dashed ${col}`,
    borderRadius: `${radius}px`,
    boxSizing: "border-box",
  });
}

/**
 * 이 배치의 공용 선택 언어 — 후보에 테두리를 두르고, 하나씩 훑다가 chosen 에 내려앉는다.
 * 모달을 없애는 대신 "지금 고를 수 있는 것"과 "고른 것"을 판 위에서 구분해 보여준다.
 * rects: 후보들의 무대 좌표 사각형. 반환: { frames, dispose }
 */
async function pickSweep(tok, rects, chosen, opts = {}) {
  const { step = 130, col = "#c2a068", tone = 1500, pad = 3, radius = 7 } = opts;
  const frames = rects.map((r) => frameOf(r, { pad, radius, col: "rgba(194,160,104,.4)" }));
  for (const [i, f] of frames.entries()) {
    anim(f, [{ opacity: 0, scale: "1.14" }, { opacity: 1, scale: "1" }], {
      duration: 200, delay: i * 26, easing: EASE,
    });
  }
  await sleep(rects.length * 26 + 220);
  if (!alive(tok)) return { frames };

  // 훑기 — 커서 없이도 '고르는 중'으로 읽히게 후보를 순서대로 밝힌다
  const order = [];
  for (let i = 0; i < rects.length; i++) order.push(i);
  const path = order.filter((i) => i !== chosen).slice(0, Math.min(4, rects.length - 1));
  path.push(chosen);
  for (const [n, i] of path.entries()) {
    if (!alive(tok)) return { frames };
    const f = frames[i];
    const last = n === path.length - 1;
    anim(f, [
      { borderColor: "rgba(194,160,104,.4)", boxShadow: "0 0 0 rgba(0,0,0,0)" },
      { borderColor: col, boxShadow: `0 0 14px ${col}` },
    ], { duration: 140, easing: EASE });
    if (!last) {
      anim(f, [{ borderColor: col }, { borderColor: "rgba(194,160,104,.4)" }], {
        duration: 140, delay: 150, easing: EASE,
      });
    }
    sTone({ f: last ? tone : 780, dur: last ? 0.14 : 0.045, gain: last ? 0.09 : 0.045, type: "sine" });
    await sleep(last ? 0 : step);
  }
  // 확정 — 점선이 실선이 된다
  const f = frames[chosen];
  f.style.borderStyle = "solid";
  f.style.borderWidth = "2px";
  anim(f, [{ scale: "1" }, { scale: "1.12" }, { scale: "1" }], { duration: 260, easing: EASE });
  return { frames };
}

const fade = (els, ms = 400) => {
  for (const e of els) if (e) anim(e, [{ opacity: 1 }, { opacity: 0 }], { duration: ms });
};

/* ══════════════════ 단색 세계 ══════════════════ */

def({
  id: "suit_unify",
  name: "단색 세계",
  tier: "prism",
  fam: FAM,
  tag: "만·통·삭 중 하나를 판 위에서 골라 손패를 통째로 물들인다",
  tech:
    "지금은 <b>색 3지선다 모달</b>이 뜬다. 대신 손패 위에 <b>물감 단지 3개</b>를 띄우고, 고르는 " +
    "동안 손패에 <b>미리보기 틴트</b>를 얹어 결과를 먼저 보여준다 — 되돌릴 수 없는 선택은 " +
    "누르기 전에 결과가 보여야 한다.",
  async run(tok) {
    const tiles = handTiles().slice(0, 13);
    const dark = veil("brightness(.6) saturate(.8)", 340);
    const hr = sRect(S.myhand);
    const h = hint("색을 고르세요 · 수패 전부 바뀝니다");

    // 물감 단지 3개 — 손패 바로 위에 둔다(모달이 아니라 판의 일부로)
    const COLS = { m: "#c0503a", p: "#2f8fd8", s: "#3f9a5c" };
    const pots = [];
    const keys = ["m", "p", "s"];
    for (const [i, k] of keys.entries()) {
      const x = hr.cx + (i - 1) * 112;
      const y = hr.y - 84;
      const pot = mk(null, {
        position: "absolute",
        left: `${x - 34}px`,
        top: `${y - 34}px`,
        width: "68px",
        height: "68px",
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        background: `radial-gradient(circle at 40% 34%, ${COLS[k]}, rgba(6,12,9,.92) 78%)`,
        border: "2px solid rgba(236,228,210,.22)",
        font: "800 26px/1 serif",
        color: "#f2ece0",
        boxShadow: "0 6px 18px rgba(4,9,7,.55)",
      });
      pot.textContent = SUITS[k];
      pots.push({ el: pot, k, r: { x: x - 34, y: y - 34, w: 68, h: 68 } });
      anim(pot, [{ opacity: 0, scale: "0.4", translate: "0 18px" }, { opacity: 1, scale: "1", translate: "0 0" }], {
        duration: 320, delay: i * 90, easing: EASE,
      });
    }
    sfx.riser(0.8);
    await sleep(620);
    if (!alive(tok)) return;

    // 훑는 동안 손패에 미리보기 틴트 — 결과를 먼저 보여준다
    const chosen = 1; // 통
    const preview = tiles.map((el) => {
      const r = sRect(el);
      return mk(null, {
        position: "absolute",
        left: `${r.x}px`,
        top: `${r.y}px`,
        width: `${r.w}px`,
        height: `${r.h}px`,
        borderRadius: "5px",
        mixBlendMode: "multiply",
        opacity: "0",
      });
    });
    for (const [i, k] of keys.entries()) {
      later(() => {
        if (!alive(tok)) return;
        for (const p of preview) {
          p.style.background = COLS[k];
          anim(p, [{ opacity: Number(getComputedStyle(p).opacity) }, { opacity: 0.3 }], { duration: 120 });
        }
        anim(pots[i].el, [{ scale: "1" }, { scale: "1.14" }, { scale: "1" }], { duration: 280, easing: EASE });
        sTone({ f: 700 + i * 160, dur: 0.06, gain: 0.05, type: "sine" });
      }, i * 380);
    }
    await sleep(3 * 380 + 120);
    if (!alive(tok)) return;

    // 확정
    for (const p of preview) {
      p.style.background = COLS[keys[chosen]];
      anim(p, [{ opacity: 0.3 }, { opacity: 0.5 }], { duration: 160 });
    }
    for (const [i, p] of pots.entries()) {
      if (i === chosen) {
        p.el.style.borderColor = "#f2ece0";
        p.el.style.boxShadow = `0 0 26px ${COLS[p.k]}`;
        anim(p.el, [{ scale: "1" }, { scale: "1.28" }, { scale: "1.12" }], { duration: 320, easing: EASE });
      } else {
        anim(p.el, [{ opacity: 1, scale: "1" }, { opacity: 0, scale: "0.7" }], { duration: 300 });
      }
    }
    h.textContent = "筒子 로 통일";
    sfx.impact();
    shake(320, 7);
    await sleep(360);
    if (!alive(tok)) return;

    // 색이 좌 → 우로 밀려가며 실제로 바뀐다
    sfx.whoosh(1.0);
    for (const [i, el] of tiles.entries()) {
      later(() => {
        if (!alive(tok)) return;
        const code = el.dataset.code || "";
        const rank = /^[1-9]/.test(code) ? code[0] : String(1 + ((Math.random() * 9) | 0));
        const next = `${rank}p`;
        el.dataset.code = next;
        const im = el.querySelector("img");
        if (im) im.src = `/tiles/${next}.png`;
        anim(el, [
          { transform: "scale(1)", filter: "brightness(1)" },
          { transform: "scale(1.16)", filter: "brightness(1.9)", offset: 0.4 },
          { transform: "scale(1)", filter: "brightness(1)" },
        ], { duration: 300, easing: EASE });
        anim(preview[i], [{ opacity: 0.5 }, { opacity: 0.12 }], { duration: 300 });
        sfx.clack(rnd(1100, 1700));
      }, i * 55);
    }
    await sleep(13 * 55 + 500);
    if (!alive(tok)) return;
    banner("단색 세계", "MONO WORLD · 筒子", 1500);
    await sleep(1500);
    fade([h, dark, ...preview, pots[chosen].el], 460);
    await sleep(560);
  },
});

/* ══════════════════ 붉은 손길 ══════════════════ */

def({
  id: "red_five_touch",
  name: "붉은 손길",
  tier: "gold",
  fam: FAM,
  tag: "숫자를 짚으면 손패의 그 숫자가 전부 적도라가 된다",
  tech:
    "지금은 <b>1~9 숫자 모달</b>이다. 대신 손패 아래에 <b>숫자 다이얼</b>을 깔고, 짚는 숫자에 " +
    "해당하는 패가 <b>미리 떠오르게</b> 한다 — 몇 장이 적도라가 되는지 세어보지 않아도 보인다. " +
    "이게 모달로는 절대 안 되는 부분이다.",
  async run(tok) {
    const tiles = handTiles().slice(0, 13);
    const dark = veil("brightness(.62) saturate(.85)", 320);
    const hr = sRect(S.myhand);
    const h = hint("숫자를 고르세요 · 그 숫자가 전부 적도라", "#e0555f");

    // 손패에 특정 숫자를 몇 장 심어 그림이 비지 않게 한다
    const target = String(1 + ((Math.random() * 9) | 0));
    const suits = ["m", "p", "s"];
    for (const i of [1, 4, 5, 9].filter((n) => n < tiles.length)) {
      const code = `${target}${pick(suits)}`;
      tiles[i].dataset.code = code;
      const im = tiles[i].querySelector("img");
      if (im) im.src = `/tiles/${code}.png`;
    }

    // 숫자 다이얼 — 손패 아래, 판 위에
    const dial = [];
    for (let n = 1; n <= 9; n++) {
      const x = hr.cx + (n - 5) * 46;
      const d = mk(null, {
        position: "absolute",
        left: `${x - 17}px`,
        top: `${hr.y - 56}px`,
        width: "34px",
        height: "34px",
        borderRadius: "var(--r-sm)",
        display: "grid",
        placeItems: "center",
        background: "rgba(14,23,18,.9)",
        border: "1px solid rgba(236,228,210,.18)",
        font: "800 15px/1 ui-monospace, monospace",
        color: "#a8bcaf",
      });
      d.textContent = String(n);
      dial.push(d);
      anim(d, [{ opacity: 0, translate: "0 10px" }, { opacity: 1, translate: "0 0" }], {
        duration: 200, delay: n * 26, easing: EASE,
      });
    }
    sfx.riser(0.7);
    await sleep(520);
    if (!alive(tok)) return;

    // 훑기 — 짚는 숫자에 맞는 패가 떠오른다 (결과 미리보기)
    const seq = [3, 7, Number(target)];
    for (const [k, n] of seq.entries()) {
      if (!alive(tok)) return;
      const last = k === seq.length - 1;
      const d = dial[n - 1];
      d.style.borderColor = last ? "#e0555f" : "rgba(224,85,95,.6)";
      d.style.color = last ? "#ffd0d4" : "#e8e0d0";
      anim(d, [{ scale: "1" }, { scale: last ? "1.3" : "1.16" }, { scale: last ? "1.2" : "1" }], {
        duration: 240, easing: EASE,
      });
      // 해당 숫자 패를 들어 올린다
      const hits = tiles.filter((el) => (el.dataset.code || "").startsWith(String(n)));
      for (const [i, el] of hits.entries()) {
        anim(el, [{ transform: "translateY(0)" }, { transform: "translateY(-14px)" }], {
          duration: 220, delay: i * 30, easing: EASE,
        });
      }
      sTone({ f: last ? 1500 : 820, dur: last ? 0.14 : 0.05, gain: last ? 0.09 : 0.045, type: "sine" });
      const cnt = mk(null, {
        position: "absolute",
        left: `${hr.cx}px`,
        top: `${hr.y - 92}px`,
        transform: "translateX(-50%)",
        font: "800 11px/1 ui-monospace, monospace",
        letterSpacing: "2px",
        color: last ? "#ffd0d4" : "#7b9084",
        whiteSpace: "nowrap",
      });
      cnt.textContent = `${n} → ${hits.length}장`;
      anim(cnt, [{ opacity: 0 }, { opacity: 1 }], { duration: 160 });
      if (!last) {
        later(() => {
          d.style.borderColor = "rgba(236,228,210,.18)";
          d.style.color = "#a8bcaf";
          for (const el of hits) anim(el, [{ transform: "translateY(-14px)" }, { transform: "translateY(0)" }], { duration: 200, easing: EASE });
          anim(cnt, [{ opacity: 1 }, { opacity: 0 }], { duration: 160 }).finished.then(() => cnt.remove()).catch(() => cnt.remove());
        }, 520);
        await sleep(700);
      }
    }
    await sleep(320);
    if (!alive(tok)) return;

    // 확정 — 붉은 잉크가 그 패들에만 스민다
    sfx.impact();
    flash(160, "#e0555f", 0.24);
    const hits = tiles.filter((el) => (el.dataset.code || "").startsWith(target));
    h.textContent = `${target} · ${hits.length}장이 적도라`;
    h.style.borderColor = "#e0555f";
    h.style.color = "#ffd0d4";
    for (const [i, el] of hits.entries()) {
      const r = sRect(el);
      later(() => {
        if (!alive(tok)) return;
        // 적도라 표기로 실제 교체 (0m/0p/0s 는 적5) — 숫자가 5가 아니면 붉은 오버레이로 표현
        const code = el.dataset.code || "";
        if (code[0] === "5") {
          const red = `0${code[1]}`;
          el.dataset.code = red;
          const im = el.querySelector("img");
          if (im) im.src = `/tiles/${red}.png`;
        } else {
          mk(null, {
            position: "absolute",
            left: `${r.x}px`,
            top: `${r.y}px`,
            width: `${r.w}px`,
            height: `${r.h}px`,
            borderRadius: "5px",
            background: "radial-gradient(ellipse at 50% 60%, rgba(224,85,95,.5), rgba(224,85,95,.16) 70%)",
            mixBlendMode: "multiply",
          });
        }
        el.style.boxShadow = "0 0 18px rgba(224,85,95,.85)";
        anim(el, [
          { transform: "translateY(-14px) scale(1)", filter: "brightness(1)" },
          { transform: "translateY(-14px) scale(1.2)", filter: "brightness(1.6)", offset: 0.4 },
          { transform: "translateY(0) scale(1)", filter: "brightness(1)" },
        ], { duration: 420, easing: EASE_IMPACT });
        ring(r.cx, r.cy, 8, 74, 460, "rgba(224,85,95,.85)", 2);
        sfx.clack(rnd(900, 1400));
      }, i * 130);
    }
    await sleep(hits.length * 130 + 700);
    if (!alive(tok)) return;
    banner("붉은 손길", `RED DORA · ${hits.length}`, 1500);
    await sleep(1500);
    fade([h, dark, ...dial], 460);
    await sleep(560);
  },
});

/* ══════════════════ 왕패의 주인 ══════════════════ */

def({
  id: "dead_wall_master",
  name: "왕패의 주인",
  tier: "prism",
  fam: FAM,
  tag: "왕패 14장이 열리고 손패와 1:1로 두 번 맞바꾼다",
  tech:
    "지금은 <b>왕패 14 × 손패 13 격자 모달</b>이다(조합이 수백 개라 모달로 밀려난 대표 사례). " +
    "대신 왕패를 <b>그 자리에서 앞면으로 열고</b> 고른 두 장을 연결선으로 묶어 <b>실제로 교차</b>시킨다 " +
    "— 격자에서 좌표를 고르는 게 아니라 패를 짚는 일이 된다.",
  async run(tok) {
    const dark = veil("brightness(.58) saturate(.8)", 340);
    const walls = [...S.wallTop.querySelectorAll(".tf")];
    const hand = handTiles();
    const h = hint("왕패 ↔ 손패 · 2회 교환 가능");

    // 금고가 열린다 — 왕패 14장이 앞면으로
    sfx.riser(1.1);
    const faces = plausibleHand();
    for (const [i, w] of walls.entries()) {
      later(() => {
        if (!alive(tok)) return;
        const code = faces[i % faces.length];
        w.classList.remove("back");
        const im = document.createElement("img");
        im.src = `/tiles/${code}.png`;
        im.draggable = false;
        w.textContent = "";
        w.appendChild(im);
        w.dataset.code = code;
        anim(w, [
          { transform: "perspective(400px) rotateX(-80deg)", opacity: 0.3 },
          { transform: "perspective(400px) rotateX(0deg)", opacity: 1 },
        ], { duration: 300, easing: EASE });
        sfx.clack(rnd(1200, 1800));
      }, i * 45);
    }
    await sleep(14 * 45 + 420);
    if (!alive(tok)) return;

    // 2회 교환 — 왕패 후보를 훑고, 손패 후보를 훑고, 잇고, 바꾼다
    const sv = mkSvg({ zIndex: "4" });
    for (let pass = 0; pass < 2; pass++) {
      if (!alive(tok)) return;
      h.textContent = `교환 ${pass + 1}/2 — 왕패에서 고르세요`;
      const wi = 3 + pass * 5;
      const wpick = await pickSweep(tok, walls.map(sRect), wi, { step: 90, pad: 2, radius: 5 });
      if (!alive(tok)) return;
      await sleep(200);

      h.textContent = `교환 ${pass + 1}/2 — 손패에서 고르세요`;
      const hi = 2 + pass * 6;
      const hpick = await pickSweep(tok, hand.slice(0, 13).map(sRect), hi, { step: 90 });
      if (!alive(tok)) return;

      // 연결선 — 무엇과 무엇이 바뀌는지
      const wr = sRect(walls[wi]);
      const hrr = sRect(hand[hi]);
      const link = svgEl("path", {
        d: `M${wr.cx} ${wr.cy} Q${(wr.cx + hrr.cx) / 2 + 70} ${(wr.cy + hrr.cy) / 2} ${hrr.cx} ${hrr.cy}`,
        fill: "none", stroke: "rgba(194,160,104,.9)", "stroke-width": 2, "stroke-linecap": "round",
      }, sv);
      const L = link.getTotalLength();
      link.setAttribute("stroke-dasharray", `${L}`);
      link.setAttribute("stroke-dashoffset", `${L}`);
      anim(link, [{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 280, easing: EASE });
      sfx.whoosh(0.4);
      await sleep(340);
      if (!alive(tok)) return;

      // 교차 — 서로의 자리로 호를 그려 지나간다
      sfx.impact();
      const wCode = walls[wi].dataset.code;
      const hCode = hand[hi].dataset.code;
      const fly = (fromR, toR, code, bow) => {
        const t = tileEl(code);
        Object.assign(t.style, { position: "absolute", left: `${fromR.x}px`, top: `${fromR.y}px`, zIndex: "14" });
        t.style.setProperty("--tile-w", `${fromR.w}px`);
        t.style.setProperty("--tile-h", `${fromR.h}px`);
        S.fx.appendChild(t);
        const steps = [];
        for (let k = 0; k <= 8; k++) {
          const p = k / 8;
          const u = 1 - p;
          const mx = (fromR.cx + toR.cx) / 2 + bow;
          const my = (fromR.cy + toR.cy) / 2;
          const x = u * u * fromR.cx + 2 * u * p * mx + p * p * toR.cx;
          const y = u * u * fromR.cy + 2 * u * p * my + p * p * toR.cy;
          steps.push({
            transform: `translate(${(x - fromR.cx).toFixed(1)}px, ${(y - fromR.cy).toFixed(1)}px) scale(${(1 + (toR.w / fromR.w - 1) * p).toFixed(2)})`,
            offset: p,
          });
        }
        anim(t, steps, { duration: 480, easing: EASE });
        later(() => t.remove(), 480);
      };
      fly(wr, hrr, wCode, 80);
      fly(hrr, wr, hCode, -80);
      anim(walls[wi], [{ opacity: 1 }, { opacity: 0 }], { duration: 120 });
      anim(hand[hi], [{ opacity: 1 }, { opacity: 0 }], { duration: 120 });
      await sleep(500);
      if (!alive(tok)) return;

      // 실제 교체
      const swap = (el, code) => {
        el.dataset.code = code;
        const im = el.querySelector("img");
        if (im) im.src = `/tiles/${code}.png`;
        anim(el, [{ opacity: 0, transform: "scale(1.25)" }, { opacity: 1, transform: "scale(1)" }], {
          duration: 300, easing: EASE_IMPACT,
        });
      };
      swap(walls[wi], hCode);
      swap(hand[hi], wCode);
      sfx.clack(700);
      ring(hrr.cx, hrr.cy, 10, 86, 420, "rgba(194,160,104,.8)", 2);
      fade([...wpick.frames, ...hpick.frames, link], 300);
      await sleep(520);
    }
    if (!alive(tok)) return;
    banner("왕패의 주인", "DEAD WALL · 2 SWAPS", 1600);
    await sleep(1600);
    fade([h, dark, sv], 460);
    await sleep(560);
  },
});

/* ══════════════════ 정적의 손 ══════════════════ */

def({
  id: "silent_swap",
  name: "정적의 손",
  tier: "prism",
  fam: FAM,
  tag: "네 사람 바닥에서 한 장을 소리 없이 집어 온다",
  tech:
    "지금은 <b>바닥패 목록 모달</b>이었다(2026-07-25 에 실제 바닥패 클릭으로 이미 전환됨 — " +
    "이 배치가 노리는 방향의 선례다). 연출의 핵심은 <b>소리의 부재</b> — 발동 순간 " +
    "효과음을 전부 끊고 집는 순간에만 아주 작은 소리를 낸다. 없는 것으로 만드는 연출.",
  async run(tok) {
    // 시끄러운 판 → 갑작스러운 정적. 대비가 있어야 '무음'이 들린다
    sfx.riser(0.6);
    sfx.clack(900);
    await sleep(360);
    if (!alive(tok)) return;

    const dark = veil("brightness(.42) saturate(.35) contrast(1.08)", 420);
    const h = hint("바닥에서 한 장 · 무음", "#a8bcaf");
    // 무음 표식
    const mute = mk(null, {
      position: "absolute",
      left: "50%",
      top: "104px",
      transform: "translateX(-50%)",
      font: "900 30px/1 serif",
      letterSpacing: "8px",
      color: "rgba(168,188,175,.75)",
    });
    mute.textContent = "無 音";
    anim(mute, [
      { opacity: 0, letterSpacing: "26px" },
      { opacity: 1, letterSpacing: "8px" },
    ], { duration: 620, easing: EASE });
    // 여기서부터 의도적으로 소리를 내지 않는다
    await sleep(700);
    if (!alive(tok)) return;

    // 네 바닥이 전부 후보로 들린다
    const ponds = [S.pondMe, S.pondTop, S.pondLeft, S.pondRight];
    const cands = [];
    for (const p of ponds) {
      const ts = [...p.querySelectorAll(".tf")];
      for (const t of ts.slice(0, 4)) cands.push(t);
      anim(p, [{ filter: "brightness(1)" }, { filter: "brightness(1.5)" }], { duration: 420, easing: EASE });
    }
    const rects = cands.map(sRect);
    const chosen = (Math.random() * cands.length) | 0;
    // 소리 없는 훑기 — tone 을 0 gain 으로 두는 대신 아예 호출하지 않는다
    const frames = rects.map((r) => frameOf(r, { pad: 2, radius: 5, col: "rgba(168,188,175,.45)" }));
    for (const [i, f] of frames.entries()) {
      anim(f, [{ opacity: 0 }, { opacity: 1 }], { duration: 180, delay: i * 18, easing: EASE });
    }
    await sleep(cands.length * 18 + 300);
    if (!alive(tok)) return;
    for (const i of [1, 5, 9, chosen].filter((n) => n < frames.length)) {
      const last = i === chosen;
      anim(frames[i], [
        { borderColor: "rgba(168,188,175,.45)", boxShadow: "none" },
        { borderColor: "#ece4d2", boxShadow: "0 0 14px rgba(236,228,210,.7)" },
      ], { duration: 150, easing: EASE });
      if (!last) anim(frames[i], [{ borderColor: "#ece4d2" }, { borderColor: "rgba(168,188,175,.45)" }], { duration: 150, delay: 170 });
      await sleep(last ? 0 : 300);
      if (!alive(tok)) return;
    }
    frames[chosen].style.borderStyle = "solid";

    // 집어 온다 — 궤적도 조용하게, 잔상 없이 매끄럽게
    const cr = rects[chosen];
    const dest = handTiles()[6];
    const dr = sRect(dest);
    const code = cands[chosen].dataset.code || "1m";
    const t = tileEl(code);
    Object.assign(t.style, { position: "absolute", left: `${cr.x}px`, top: `${cr.y}px`, zIndex: "14" });
    t.style.setProperty("--tile-w", `${cr.w}px`);
    t.style.setProperty("--tile-h", `${cr.h}px`);
    S.fx.appendChild(t);
    anim(cands[chosen], [{ opacity: 1 }, { opacity: 0 }], { duration: 220 });
    anim(t, [
      { transform: "translate(0,0) scale(1)" },
      { transform: `translate(${dr.cx - cr.cx}px, ${dr.cy - cr.cy}px) scale(${dr.w / cr.w})` },
    ], { duration: 900, easing: EASE });
    await sleep(920);
    if (!alive(tok)) return;

    // 집는 순간 — 이 연출의 유일한 소리
    sTone({ f: 1300, f2: 900, dur: 0.07, gain: 0.05, type: "sine" });
    t.remove();
    dest.dataset.code = code;
    const im = dest.querySelector("img");
    if (im) im.src = `/tiles/${code}.png`;
    anim(dest, [{ transform: "scale(1.2)", opacity: 0.6 }, { transform: "scale(1)", opacity: 1 }], {
      duration: 320, easing: EASE,
    });
    anim(mute, [{ opacity: 1 }, { opacity: 0 }], { duration: 500 });
    await sleep(700);
    if (!alive(tok)) return;
    banner("정적의 손", "SILENT HAND", 1400);
    await sleep(1400);
    fade([h, dark, ...frames], 460);
    await sleep(560);
  },
});

/* ══════════════════ 예지 · 순서 재배열 ══════════════════ */

def({
  id: "foresight_order",
  name: "예지 · 순서 바꾸기",
  tier: "prism",
  fam: FAM,
  tag: "패산 앞 4장을 누구에게 갈지 보고 순서를 바꾼다",
  tech:
    "지금은 <b>드래그 재배열 모달</b>이다. 대신 4장을 패산에서 <b>그 자리에서 들어올려</b> " +
    "하가·대면·상가·나 좌석 라벨이 붙은 슬롯에 얹는다 — 누구의 쯔모가 되는지가 " +
    "라벨이 아니라 <b>위치</b>로 읽히고, 끝나면 패산으로 다시 가라앉는다.",
  async run(tok) {
    const dark = veil("brightness(.55) saturate(.8)", 340);
    const walls = [...S.wallTop.querySelectorAll(".tf")];
    const front = walls.slice(0, 4);
    const h = hint("다음 4장 · 순서를 바꾸세요");
    const SY = 170;
    const codes = plausibleHand().slice(0, 4);

    // 좌석 슬롯 4개 — 위치가 곧 '누구의 쯔모'
    const slots = [];
    for (let i = 0; i < 4; i++) {
      const x = 500 + (i - 1.5) * 104;
      const slot = mk(null, {
        position: "absolute",
        left: `${x - 30}px`,
        top: `${SY - 40}px`,
        width: "60px",
        height: "80px",
        borderRadius: "var(--r-md)",
        border: "1px dashed rgba(194,160,104,.45)",
        background: "rgba(10,18,16,.55)",
      });
      const lb = mk(null, {
        position: "absolute",
        left: "50%",
        top: "84px",
        transform: "translateX(-50%)",
        font: "800 10px/1 ui-monospace, monospace",
        letterSpacing: "2px",
        color: i === 3 ? "#c2a068" : "#7b9084",
        whiteSpace: "nowrap",
      }, slot);
      lb.textContent = DRAW_ORDER[i];
      slots.push({ el: slot, x, lb });
      anim(slot, [{ opacity: 0, translate: "0 -10px" }, { opacity: 1, translate: "0 0" }], {
        duration: 240, delay: i * 70, easing: EASE,
      });
    }
    sfx.riser(0.9);
    await sleep(560);
    if (!alive(tok)) return;

    // 패산에서 들어올린다
    const risen = [];
    for (const [i, w] of front.entries()) {
      const wr = sRect(w);
      const t = tileEl(codes[i]);
      Object.assign(t.style, { position: "absolute", left: `${wr.x}px`, top: `${wr.y}px`, zIndex: "12" });
      t.style.setProperty("--tile-w", "54px");
      t.style.setProperty("--tile-h", "72px");
      S.fx.appendChild(t);
      risen.push({ el: t, from: wr, slot: i });
      anim(w, [{ opacity: 1 }, { opacity: 0.25 }], { duration: 240 });
      anim(t, [
        { transform: "translate(0,0) scale(.55)", opacity: 0 },
        { transform: `translate(${slots[i].x - wr.cx}px, ${SY - wr.cy}px) scale(1)`, opacity: 1 },
      ], { duration: 460, delay: i * 90, easing: EASE });
      later(() => alive(tok) && sfx.clack(rnd(1200, 1700)), i * 90 + 300);
    }
    await sleep(4 * 90 + 560);
    if (!alive(tok)) return;

    // 재배열 — 1번과 4번을 바꾼다 (내 쯔모로 좋은 패를 끌어온다)
    h.textContent = "1번 ↔ 4번 — 좋은 패를 내 쯔모로";
    const A = 0;
    const B = 3;
    sfx.whoosh(0.5);
    const lift = (o, toX, up) =>
      anim(o.el, [
        { transform: `translate(${slots[o.slot].x - o.from.cx}px, ${SY - o.from.cy}px) scale(1)` },
        { transform: `translate(${(slots[o.slot].x + toX) / 1 - o.from.cx}px, ${SY - o.from.cy + up}px) scale(1.06)`, offset: 0.5 },
        { transform: `translate(${toX - o.from.cx}px, ${SY - o.from.cy}px) scale(1)` },
      ], { duration: 620, easing: EASE });
    lift(risen[A], slots[B].x, -46);
    lift(risen[B], slots[A].x, 46);
    for (const s of [slots[A], slots[B]]) {
      anim(s.el, [{ borderColor: "rgba(194,160,104,.45)" }, { borderColor: "#c2a068" }, { borderColor: "rgba(194,160,104,.45)" }], { duration: 620 });
    }
    await sleep(680);
    if (!alive(tok)) return;
    [risen[A].slot, risen[B].slot] = [risen[B].slot, risen[A].slot];
    sfx.clack(900);
    ring(slots[B].x, SY, 12, 90, 420, "rgba(194,160,104,.8)", 2);
    // 내 자리 강조 — 이 설계의 목적
    anim(slots[3].el, [{ background: "rgba(10,18,16,.55)" }, { background: "rgba(194,160,104,.18)" }], { duration: 400 });
    slots[3].lb.textContent = "나 ← 확보";
    await sleep(900);
    if (!alive(tok)) return;

    // 패산으로 가라앉는다 — 새 순서 그대로
    h.textContent = "순서 확정 · 패산으로";
    sfx.whoosh(0.7);
    for (const [i, o] of risen.entries()) {
      anim(o.el, [
        { transform: `translate(${slots[o.slot].x - o.from.cx}px, ${SY - o.from.cy}px) scale(1)`, opacity: 1 },
        { transform: "translate(0,0) scale(.55)", opacity: 0 },
      ], { duration: 420, delay: i * 70, easing: EASE });
      later(() => {
        if (!alive(tok)) return;
        anim(front[i], [{ opacity: 0.25 }, { opacity: 1 }], { duration: 240 });
        sfx.clack(rnd(1000, 1500));
      }, i * 70 + 340);
    }
    banner("예 지", "DRAW ORDER SET", 1500);
    await sleep(1600);
    fade([h, dark, ...slots.map((s) => s.el), ...risen.map((r) => r.el)], 460);
    await sleep(560);
  },
});

/* ══════════════════ 이면투시 · 바꿔치기 ══════════════════ */

def({
  id: "ura_swap",
  name: "이면 바꿔치기",
  tier: "gold",
  fam: FAM,
  tag: "뒷도라 표시패를 왕패의 다른 자리와 몰래 맞바꾼다",
  tech:
    "지금은 <b>왕패 자리 선택 모달</b>이다. 대신 왕패가 부채처럼 살짝 벌어져 자리들이 " +
    "드러나고, 고른 자리와 표시패가 <b>호를 그려 자리를 맞바꾼</b> 뒤 왕패가 닫힌다. " +
    "몰래 하는 일이므로 <b>내 시야만 밝히는 마스크</b>를 씌워 비밀임을 표시한다.",
  async run(tok) {
    const walls = [...S.wallTop.querySelectorAll(".tf")];
    const indicator = walls[4];
    const ir = sRect(indicator);
    const dark = veil(
      "brightness(.46) saturate(.7)",
      360,
      `radial-gradient(ellipse 340px 120px at ${sRect(S.wallTop).cx}px ${ir.cy}px, transparent 45%, black 100%)`,
    );
    const h = hint("바꿀 왕패 자리를 고르세요");

    // 표시패를 앞면으로 세워 무엇을 바꾸는지 알린다
    indicator.classList.remove("back");
    const iCode = pick(NUM_CODES);
    indicator.textContent = "";
    const iim = document.createElement("img");
    iim.src = `/tiles/${iCode}.png`;
    indicator.appendChild(iim);
    indicator.dataset.code = iCode;
    indicator.style.boxShadow = "0 0 20px rgba(194,160,104,.9)";
    anim(indicator, [
      { transform: "perspective(400px) rotateX(-70deg) scale(1)" },
      { transform: "perspective(400px) rotateX(0deg) scale(1.25)" },
    ], { duration: 380, easing: EASE });
    const ilb = mk(null, {
      position: "absolute",
      left: `${ir.cx}px`,
      top: `${ir.y - 24}px`,
      transform: "translateX(-50%)",
      font: "700 10px/1 ui-monospace, monospace",
      color: "#c2a068",
      whiteSpace: "nowrap",
    });
    ilb.textContent = "뒷도라 표시패";
    anim(ilb, [{ opacity: 0 }, { opacity: 1 }], { duration: 240 });
    sfx.ping(1200);
    await sleep(560);
    if (!alive(tok)) return;

    // 왕패가 부채처럼 벌어진다 — 자리들이 후보로 드러난다
    sfx.whoosh(0.6);
    for (const [i, w] of walls.entries()) {
      if (w === indicator) continue;
      const d = i - 4;
      anim(w, [
        { transform: "translate(0,0) rotate(0deg)" },
        { transform: `translate(${d * 3.4}px, ${-Math.abs(d) * 1.6}px) rotate(${d * 1.2}deg)` },
      ], { duration: 420, easing: EASE });
    }
    await sleep(460);
    if (!alive(tok)) return;

    const cands = walls.filter((w) => w !== indicator);
    const chosen = 9;
    const { frames } = await pickSweep(tok, cands.map(sRect), chosen, { step: 95, pad: 2, radius: 5 });
    if (!alive(tok)) return;
    await sleep(220);

    // 맞바꾸기 — 두 장이 호를 그려 자리를 교환한다
    sfx.impact();
    const tgt = cands[chosen];
    const tr = sRect(tgt);
    const arc = (fromR, toR, code, back, bow) => {
      const t = back ? tileEl(null, { back: true }) : tileEl(code);
      Object.assign(t.style, { position: "absolute", left: `${fromR.x}px`, top: `${fromR.y}px`, zIndex: "14" });
      t.style.setProperty("--tile-w", `${fromR.w}px`);
      t.style.setProperty("--tile-h", `${fromR.h}px`);
      S.fx.appendChild(t);
      const steps = [];
      for (let k = 0; k <= 8; k++) {
        const p = k / 8;
        const u = 1 - p;
        const mx = (fromR.cx + toR.cx) / 2;
        const my = (fromR.cy + toR.cy) / 2 + bow;
        const x = u * u * fromR.cx + 2 * u * p * mx + p * p * toR.cx;
        const y = u * u * fromR.cy + 2 * u * p * my + p * p * toR.cy;
        steps.push({ transform: `translate(${(x - fromR.cx).toFixed(1)}px, ${(y - fromR.cy).toFixed(1)}px)`, offset: p });
      }
      anim(t, steps, { duration: 520, easing: EASE });
      later(() => t.remove(), 520);
    };
    arc(ir, tr, iCode, false, -54);
    arc(tr, ir, null, true, 54);
    anim(indicator, [{ opacity: 1 }, { opacity: 0 }], { duration: 140 });
    anim(tgt, [{ opacity: 1 }, { opacity: 0 }], { duration: 140 });
    await sleep(540);
    if (!alive(tok)) return;

    // 새 표시패는 뒷면 — 무엇으로 바뀌었는지는 나도 지금은 모른다
    indicator.textContent = "";
    indicator.classList.add("back");
    delete indicator.dataset.code;
    anim(indicator, [{ opacity: 0, transform: "scale(1.2)" }, { opacity: 1, transform: "scale(1.25)" }], {
      duration: 300, easing: EASE_IMPACT,
    });
    tgt.textContent = "";
    const tim = document.createElement("img");
    tim.src = `/tiles/${iCode}.png`;
    tgt.appendChild(tim);
    tgt.classList.remove("back");
    anim(tgt, [{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
    sfx.clack(800);
    ilb.textContent = "표시패 교체됨";
    h.textContent = "바꿔치기 완료 · 상대는 모른다";
    ring(ir.cx, ir.cy, 10, 88, 460, "rgba(194,160,104,.85)", 2);
    await sleep(400);
    if (!alive(tok)) return;

    // 왕패가 닫힌다
    sfx.whoosh(0.5);
    for (const w of walls) {
      if (w === indicator) continue;
      anim(w, [{ transform: getComputedStyle(w).transform }, { transform: "translate(0,0) rotate(0deg)" }], {
        duration: 380, easing: EASE,
      });
    }
    fade(frames, 300);
    banner("이면 바꿔치기", "URA SWAPPED", 1500);
    await sleep(1600);
    fade([h, dark, ilb], 460);
    await sleep(560);
  },
});

/* ══════════════════ 등가교환 ══════════════════ */

def({
  id: "hand_swap3",
  name: "등가교환",
  tier: "prism",
  fam: FAM,
  tag: "상대 손패를 열어 보고 3장씩 맞바꾼다",
  tech:
    "지금은 <b>주고받을 3+3 을 고르는 모달</b>이다. 대신 상대 손패를 <b>내 쪽으로 펼쳐 보여주고</b> " +
    "양쪽에서 3장씩 짚게 한 뒤, 중앙의 <b>저울</b>이 균형을 잡으면 6장이 교차한다 — " +
    "'등가'가 규칙 설명이 아니라 화면의 구조가 된다.",
  async run(tok) {
    const dark = veil("brightness(.5) saturate(.8)", 360);
    const mine = handTiles().slice(0, 13);
    const theirBacks = [...S.oppTop.querySelectorAll(".tf")];
    const h = hint("상대 3장 ↔ 내 3장");

    // 상대 손패가 나에게만 열린다 — 뒷면 위에 앞면 사본을 얹는다
    const theirCodes = plausibleHand();
    const opened = [];
    for (const [i, b] of theirBacks.entries()) {
      const r = sRect(b);
      const t = tileEl(theirCodes[i % theirCodes.length]);
      Object.assign(t.style, {
        position: "absolute", left: `${r.x}px`, top: `${r.y}px`, zIndex: "8",
        transform: "rotate(180deg)", boxShadow: "0 0 12px rgba(194,160,104,.45)",
      });
      t.style.setProperty("--tile-w", `${r.w}px`);
      t.style.setProperty("--tile-h", `${r.h}px`);
      S.fx.appendChild(t);
      opened.push(t);
      anim(t, [
        { opacity: 0, transform: "rotate(180deg) rotateX(70deg)" },
        { opacity: 1, transform: "rotate(180deg) rotateX(0deg)" },
      ], { duration: 300, delay: i * 34, easing: EASE });
      later(() => alive(tok) && sfx.clack(rnd(1300, 1800)), i * 34);
    }
    sfx.riser(1.0);
    await sleep(13 * 34 + 400);
    if (!alive(tok)) return;

    // 저울 — 중앙에 균형 구조를 세운다
    const sv = mkSvg({ zIndex: "5" });
    const g = svgEl("g", {}, sv);
    svgEl("line", { x1: 500, y1: 250, x2: 500, y2: 330, stroke: "#9a7b42", "stroke-width": 3 }, g);
    const beam = svgEl("line", { x1: 400, y1: 250, x2: 600, y2: 250, stroke: "#c2a068", "stroke-width": 4, "stroke-linecap": "round" }, g);
    const panL = svgEl("circle", { cx: 400, cy: 250, r: 9, fill: "none", stroke: "#c2a068", "stroke-width": 2.5 }, g);
    const panR = svgEl("circle", { cx: 600, cy: 250, r: 9, fill: "none", stroke: "#c2a068", "stroke-width": 2.5 }, g);
    beam.style.transformOrigin = "500px 250px";
    anim(g, [{ opacity: 0, scale: "0.7" }, { opacity: 1, scale: "1" }], { duration: 320, easing: EASE });
    sfx.ping(900);
    await sleep(400);
    if (!alive(tok)) return;

    // 상대에서 3장 — 고를 때마다 저울이 기운다
    h.textContent = "상대에서 3장";
    const theirPick = [2, 6, 10];
    const tFrames = [];
    for (const [n, i] of theirPick.entries()) {
      if (!alive(tok)) return;
      const r = sRect(theirBacks[i]);
      const f = frameOf(r, { pad: 2, radius: 5, col: "#c2a068" });
      f.style.borderStyle = "solid";
      tFrames.push(f);
      anim(f, [{ opacity: 0, scale: "1.3" }, { opacity: 1, scale: "1" }], { duration: 200, easing: EASE });
      anim(opened[i], [{ transform: "rotate(180deg) translateY(0)" }, { transform: "rotate(180deg) translateY(-10px)" }], {
        duration: 220, easing: EASE,
      });
      anim(beam, [{ transform: `rotate(${n * 2}deg)` }, { transform: `rotate(${(n + 1) * 4}deg)` }], { duration: 220, easing: EASE });
      sTone({ f: 1100 + n * 180, dur: 0.09, gain: 0.06, type: "sine" });
      await sleep(320);
    }
    await sleep(240);
    if (!alive(tok)) return;

    // 내 쪽 3장 — 저울이 균형으로 돌아온다
    h.textContent = "내 손패에서 3장";
    const myPick = [1, 5, 9];
    const mFrames = [];
    for (const [n, i] of myPick.entries()) {
      if (!alive(tok)) return;
      const f = frameOf(sRect(mine[i]), { col: "#c2a068" });
      f.style.borderStyle = "solid";
      mFrames.push(f);
      anim(f, [{ opacity: 0, scale: "1.3" }, { opacity: 1, scale: "1" }], { duration: 200, easing: EASE });
      anim(mine[i], [{ transform: "translateY(0)" }, { transform: "translateY(-12px)" }], { duration: 220, easing: EASE });
      anim(beam, [{ transform: `rotate(${12 - n * 4}deg)` }, { transform: `rotate(${12 - (n + 1) * 4}deg)` }], { duration: 220, easing: EASE });
      sTone({ f: 1100 + n * 180, dur: 0.09, gain: 0.06, type: "sine" });
      await sleep(320);
    }
    if (!alive(tok)) return;
    // 균형
    anim(beam, [{ transform: "rotate(0deg)" }], { duration: 300, easing: EASE });
    for (const p of [panL, panR]) anim(p, [{ r: 9 }, { r: 14 }, { r: 9 }], { duration: 420, easing: EASE });
    sfx.chime();
    h.textContent = "등가 — 3 ↔ 3";
    await sleep(520);
    if (!alive(tok)) return;

    // 교차 — 6장이 저울을 지나 서로의 자리로
    sfx.impact();
    shake(360, 8);
    for (let k = 0; k < 3; k++) {
      const from = sRect(mine[myPick[k]]);
      const to = sRect(theirBacks[theirPick[k]]);
      const codeMine = mine[myPick[k]].dataset.code;
      const codeTheirs = opened[theirPick[k]].dataset.code;
      const shoot = (a, b, code, bow, delay) => {
        const t = tileEl(code);
        Object.assign(t.style, { position: "absolute", left: `${a.x}px`, top: `${a.y}px`, zIndex: "16" });
        t.style.setProperty("--tile-w", `${a.w}px`);
        t.style.setProperty("--tile-h", `${a.h}px`);
        S.fx.appendChild(t);
        const steps = [];
        for (let n = 0; n <= 8; n++) {
          const p = n / 8;
          const u = 1 - p;
          const mx = 500 + bow;
          const my = 250;
          const x = u * u * a.cx + 2 * u * p * mx + p * p * b.cx;
          const y = u * u * a.cy + 2 * u * p * my + p * p * b.cy;
          steps.push({
            transform: `translate(${(x - a.cx).toFixed(1)}px, ${(y - a.cy).toFixed(1)}px) scale(${(1 + (b.w / a.w - 1) * p).toFixed(2)}) rotate(${(p * 180).toFixed(0)}deg)`,
            offset: p,
          });
        }
        anim(t, steps, { duration: 620, delay, easing: EASE });
        later(() => t.remove(), 620 + delay);
      };
      shoot(from, to, codeMine, -60, k * 90);
      shoot(to, from, codeTheirs, 60, k * 90);
      anim(mine[myPick[k]], [{ opacity: 1 }, { opacity: 0 }], { duration: 120, delay: k * 90 });
      anim(opened[theirPick[k]], [{ opacity: 1 }, { opacity: 0 }], { duration: 120, delay: k * 90 });
      later(() => {
        if (!alive(tok)) return;
        mine[myPick[k]].dataset.code = codeTheirs;
        const im = mine[myPick[k]].querySelector("img");
        if (im) im.src = `/tiles/${codeTheirs}.png`;
        anim(mine[myPick[k]], [
          { opacity: 0, transform: "translateY(-12px) scale(1.2)" },
          { opacity: 1, transform: "translateY(0) scale(1)" },
        ], { duration: 300, easing: EASE_IMPACT });
        sfx.clack(rnd(800, 1200));
      }, k * 90 + 640);
    }
    await sleep(1200);
    if (!alive(tok)) return;
    banner("등가교환", "EQUIVALENT EXCHANGE · 3↔3", 1600);
    await sleep(1600);
    fade([h, dark, sv, ...opened, ...tFrames, ...mFrames], 460);
    await sleep(560);
  },
});

/* ══════════════════ 미래를 보는 자 ══════════════════ */

def({
  id: "future_sight",
  name: "미래를 보는 자",
  tier: "prism",
  fam: FAM,
  tag: "무작위 3장이 뽑혀 나가고 그중 버릴 1장만 내가 고른다",
  tech:
    "지금은 <b>3장 중 버릴 것을 고르는 모달</b>이다. 이 증강의 맛은 <b>강제(무작위 3장) 뒤에 " +
    "오는 좁은 선택</b>이라, 3장이 손에서 <b>뜯겨 나가는</b> 것을 먼저 보여주고 그 다음에 " +
    "고르게 한다. 모달은 이 순서를 지울 수밖에 없다.",
  async run(tok) {
    const dark = veil("brightness(.52) saturate(.8)", 340);
    const tiles = handTiles().slice(0, 13);
    const hr = sRect(S.myhand);
    const h = hint("무작위 3장 — 선택권 없음", "#a8bcaf");
    sfx.riser(0.9);

    // 무작위 3장이 뜯겨 나간다 — 내가 고른 게 아니라는 걸 보여준다
    const idx = [];
    while (idx.length < 3) {
      const n = (Math.random() * 13) | 0;
      if (!idx.includes(n)) idx.push(n);
    }
    const SY = 250;
    const seized = [];
    for (const [k, i] of idx.entries()) {
      const el = tiles[i];
      const r = sRect(el);
      const code = el.dataset.code || "1m";
      const t = tileEl(code);
      Object.assign(t.style, { position: "absolute", left: `${r.x}px`, top: `${r.y}px`, zIndex: "13" });
      t.style.setProperty("--tile-w", "54px");
      t.style.setProperty("--tile-h", "72px");
      S.fx.appendChild(t);
      const tx = 500 + (k - 1) * 108;
      seized.push({ el: t, from: r, x: tx, code, src: el });
      anim(el, [{ opacity: 1 }, { opacity: 0.12 }], { duration: 240, delay: k * 120 });
      anim(t, [
        { transform: "translate(0,0) scale(.85) rotate(0deg)", opacity: 0 },
        { transform: `translate(${(tx - r.cx) * 0.4}px, ${(SY - r.cy) * 0.5}px) scale(1.1) rotate(${rnd(-16, 16)}deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${tx - r.cx}px, ${SY - r.cy}px) scale(1) rotate(0deg)`, opacity: 1 },
      ], { duration: 620, delay: k * 120, easing: EASE });
      later(() => {
        if (!alive(tok)) return;
        sfx.clack(rnd(600, 900));
        ring(r.cx, r.cy, 8, 66, 380, "rgba(168,188,175,.6)", 2);
      }, k * 120 + 120);
    }
    await sleep(3 * 120 + 700);
    if (!alive(tok)) return;

    // 이제서야 선택 — 셋 중 버릴 하나
    h.textContent = "이 중 버릴 1장을 고르세요";
    h.style.borderColor = "#c2a068";
    h.style.color = "#c2a068";
    const rects = seized.map((s) => sRect(s.el));
    const chosen = (Math.random() * 3) | 0;
    const { frames } = await pickSweep(tok, rects, chosen, { step: 260, pad: 4, radius: 8 });
    if (!alive(tok)) return;
    await sleep(280);

    // 고른 1장은 바닥으로, 나머지 2장은 패산 맨 밑으로
    sfx.impact();
    const pr = sRect(S.pondMe);
    const drop = seized[chosen];
    anim(drop.el, [
      { transform: `translate(${drop.x - drop.from.cx}px, ${SY - drop.from.cy}px) scale(1)` },
      { transform: `translate(${pr.cx - drop.from.cx}px, ${pr.cy - drop.from.cy}px) scale(.5)` },
    ], { duration: 460, easing: EASE });
    later(() => {
      if (!alive(tok)) return;
      drop.el.remove();
      sfx.clack(700);
      ring(pr.cx, pr.cy, 8, 60, 320, "rgba(236,228,210,.5)", 2);
    }, 470);

    const wr = sRect(S.wallTop);
    for (const [k, s] of seized.entries()) {
      if (k === chosen) continue;
      anim(s.el, [
        { transform: `translate(${s.x - s.from.cx}px, ${SY - s.from.cy}px) scale(1)`, opacity: 1 },
        { transform: `translate(${wr.cx - s.from.cx}px, ${wr.cy + 26 - s.from.cy}px) scale(.4)`, opacity: 0 },
      ], { duration: 560, delay: 140, easing: EASE });
      later(() => s.el.remove(), 720);
    }
    sfx.whoosh(0.7);
    const note = mk(null, {
      position: "absolute",
      left: `${wr.cx}px`,
      top: `${wr.y + 40}px`,
      transform: "translateX(-50%)",
      font: "700 10px/1 ui-monospace, monospace",
      letterSpacing: "2px",
      color: "#7b9084",
      whiteSpace: "nowrap",
    });
    note.textContent = "나머지 2장 → 패산 맨 밑";
    anim(note, [{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: 300 });
    await sleep(900);
    if (!alive(tok)) return;

    // 패산 위에서 3장을 받는다
    h.textContent = "패산 위에서 3장";
    for (const [k, i] of idx.entries()) {
      const el = tiles[i];
      const r = sRect(el);
      const code = pick(NUM_CODES);
      later(() => {
        if (!alive(tok)) return;
        el.dataset.code = code;
        const im = el.querySelector("img");
        if (im) im.src = `/tiles/${code}.png`;
        anim(el, [
          { opacity: 0, transform: "translateY(-40px) scale(1.4)", filter: "brightness(2.4)" },
          { opacity: 1, transform: "translateY(0) scale(1)", filter: "brightness(1)" },
        ], { duration: 420, easing: EASE_IMPACT });
        sfx.clack(rnd(900, 1300));
        ring(r.cx, r.cy, 8, 70, 400, "rgba(194,160,104,.75)", 2);
      }, k * 150);
    }
    await sleep(3 * 150 + 500);
    if (!alive(tok)) return;
    banner("미래를 보는 자", "FUTURE SIGHT · 3 DRAWN", 1600);
    await sleep(1600);
    fade([h, dark, note, ...frames], 460);
    await sleep(560);
  },
});

/* ══════════════════ 절벽 위에 피어난 꽃 ══════════════════ */

def({
  id: "cliff_bloom",
  name: "절벽 위에 피어난 꽃",
  tier: "prism",
  fam: FAM,
  tag: "깡의 영상패를 앞 4장에서 직접 고르고, 두 번째 깡에 만개한다",
  tech:
    "지금은 <b>영상패 4지선다 모달</b>이다. 대신 앞 4장이 <b>꽃잎처럼 벌어져</b> 후보가 되고, " +
    "두 번째 깡에서는 그 자리에서 손패 전체가 <b>만개</b>한다. 선택과 보상이 같은 화면에서 " +
    "이어지므로 '왜 두 번 깡했는지'가 몸에 남는다.",
  async run(tok) {
    const dark = veil("brightness(.5) saturate(.85)", 340);
    const walls = [...S.wallTop.querySelectorAll(".tf")];
    const four = walls.slice(0, 4);
    const h = hint("영상패를 고르세요 · 앞 4장");
    sfx.riser(0.8);

    // 앞 4장이 꽃잎처럼 벌어진다
    const codes = plausibleHand().slice(0, 4);
    const petals = [];
    for (const [i, w] of four.entries()) {
      const wr = sRect(w);
      const t = tileEl(codes[i]);
      Object.assign(t.style, { position: "absolute", left: `${wr.x}px`, top: `${wr.y}px`, zIndex: "12" });
      t.style.setProperty("--tile-w", "48px");
      t.style.setProperty("--tile-h", "64px");
      S.fx.appendChild(t);
      petals.push(t);
      const a = (-52 + i * 34) * (Math.PI / 180);
      const R = 92;
      anim(w, [{ opacity: 1 }, { opacity: 0.2 }], { duration: 240 });
      anim(t, [
        { transform: "translate(0,0) scale(.5) rotate(0deg)", opacity: 0 },
        {
          transform: `translate(${(Math.sin(a) * R).toFixed(1)}px, ${(-Math.cos(a) * R + 34).toFixed(1)}px) scale(1) rotate(${(-52 + i * 34).toFixed(0)}deg)`,
          opacity: 1,
        },
      ], { duration: 480, delay: i * 90, easing: EASE });
      later(() => alive(tok) && sfx.clack(rnd(1300, 1800)), i * 90 + 300);
    }
    await sleep(4 * 90 + 560);
    if (!alive(tok)) return;

    const chosen = 2;
    const { frames } = await pickSweep(tok, petals.map(sRect), chosen, { step: 230, pad: 4, radius: 8 });
    if (!alive(tok)) return;

    // 영상패가 손으로
    sfx.impact();
    const cr = sRect(petals[chosen]);
    const dest = handTiles()[7];
    const dr = sRect(dest);
    anim(petals[chosen], [
      { transform: getComputedStyle(petals[chosen]).transform },
      { transform: `translate(${dr.cx - cr.cx}px, ${dr.cy - cr.cy}px) scale(.85) rotate(0deg)` },
    ], { duration: 480, easing: EASE });
    for (const [i, p] of petals.entries()) {
      if (i !== chosen) anim(p, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
    }
    fade(frames, 300);
    await sleep(500);
    if (!alive(tok)) return;
    petals[chosen].remove();
    dest.dataset.code = codes[chosen];
    const dim = dest.querySelector("img");
    if (dim) dim.src = `/tiles/${codes[chosen]}.png`;
    anim(dest, [{ opacity: 0, transform: "scale(1.3)" }, { opacity: 1, transform: "scale(1)" }], {
      duration: 320, easing: EASE_IMPACT,
    });
    sfx.clack(800);
    h.textContent = "두 번째 깡 — 만개";
    await sleep(500);
    if (!alive(tok)) return;

    // 만개 — 손패 전체에서 꽃이 피어오른다
    sfx.impact();
    sfx.chime();
    shake(620, 12);
    flash(300, "#f4d9e4", 0.5);
    const hand = handTiles();
    for (const [i, el] of hand.entries()) {
      const r = sRect(el);
      later(() => {
        if (!alive(tok)) return;
        anim(el, [
          { transform: "translateY(0) scale(1)", filter: "brightness(1)" },
          { transform: "translateY(-18px) scale(1.14)", filter: "brightness(1.7)", offset: 0.45 },
          { transform: "translateY(0) scale(1)", filter: "brightness(1)" },
        ], { duration: 620, easing: EASE });
        ring(r.cx, r.cy - 10, 6, 70, 620, "rgba(238,170,196,.8)", 2);
      }, i * 42);
    }
    // 꽃잎 낙하
    const petalsFall = [];
    for (let i = 0; i < 70; i++) {
      petalsFall.push({
        x: rnd(0, 1000), y: rnd(-200, 0), vy: rnd(0.8, 2.2), vx: rnd(-0.6, 0.6),
        s: rnd(3, 7), rot: rnd(0, 6.3), vr: rnd(-0.05, 0.05),
      });
    }
    let t = 0;
    drawHooks.add((dt, c) => {
      t += dt;
      for (const p of petalsFall) {
        p.y += p.vy * dt;
        p.x += (p.vx + Math.sin(t * 0.03 + p.rot) * 0.4) * dt;
        p.rot += p.vr * dt;
        if (p.y > 640) p.y = -10;
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.rot);
        c.fillStyle = `rgba(238,170,196,${0.5 + p.s * 0.05})`;
        c.beginPath();
        c.ellipse(0, 0, p.s, p.s * 0.55, 0, 0, 6.284);
        c.fill();
        c.restore();
      }
      return t < 220;
    });
    banner("만 개", "BLOOM · 영상개화", 1900);
    await sleep(2200);
    if (!alive(tok)) return;
    fade([h, dark], 500);
    await sleep(620);
  },
});

/* ══════════════════ 정적의 손과 짝 — 왕패 열람 (상시) ══════════════════ */

def({
  id: "dw_reveal",
  name: "왕패 열람",
  tier: "gold",
  fam: FAM,
  tag: "왕패 14장이 처음부터 계속 보인다 — 상시 정보를 어떻게 놓을까",
  tech:
    "모달이 아니라 <b>상시 표시</b> 문제다. 발동 연출은 한 번뿐이고 그 뒤로는 국이 끝날 때까지 " +
    "계속 보여야 하니, 화려하면 방해가 된다. <b>한 번 열고 조용해지는</b> 연출 — 강한 연출이 " +
    "늘 답은 아니라는 걸 보여주는 대조 사례로 넣었다.",
  async run(tok) {
    const walls = [...S.wallTop.querySelectorAll(".tf")];
    const h = hint("왕패 상시 열람", "#9a7b42");

    // 한 번만 훑고 지나간다 — 베일도 얕게
    const dark = veil("brightness(.82)", 300);
    sfx.ping(900);
    const codes = plausibleHand();
    for (const [i, w] of walls.entries()) {
      later(() => {
        if (!alive(tok)) return;
        const code = codes[i % codes.length];
        w.classList.remove("back");
        w.textContent = "";
        const im = document.createElement("img");
        im.src = `/tiles/${code}.png`;
        im.draggable = false;
        w.appendChild(im);
        w.dataset.code = code;
        anim(w, [
          { transform: "perspective(400px) rotateX(-70deg)", opacity: 0.4 },
          { transform: "perspective(400px) rotateX(0deg)", opacity: 1 },
        ], { duration: 260, easing: EASE });
        sTone({ f: 1400 + i * 30, dur: 0.04, gain: 0.035, type: "sine" });
      }, i * 38);
    }
    // 훑고 지나가는 얇은 빛 — 딱 한 번
    const wr = sRect(S.wallTop);
    const sweep = mk(null, {
      position: "absolute",
      left: `${wr.x - 30}px`,
      top: `${wr.y - 8}px`,
      width: `${wr.w + 60}px`,
      height: `${wr.h + 16}px`,
      background: "linear-gradient(100deg, transparent 44%, rgba(220,199,154,.6) 50%, transparent 56%)",
      mixBlendMode: "screen",
    });
    anim(sweep, [{ transform: "translateX(-110%)" }, { transform: "translateX(110%)" }], {
      duration: 700, easing: EASE,
    }).finished.then(() => sweep.remove()).catch(() => sweep.remove());
    await sleep(14 * 38 + 500);
    if (!alive(tok)) return;

    // 그리고 조용해진다 — 테두리만 아주 옅게 남긴다
    const keep = mk(null, {
      position: "absolute",
      left: `${wr.x - 5}px`,
      top: `${wr.y - 5}px`,
      width: `${wr.w + 10}px`,
      height: `${wr.h + 10}px`,
      border: "1px solid rgba(154,123,66,.4)",
      borderRadius: "var(--r-sm)",
    });
    anim(keep, [{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
    anim(dark, [{ opacity: 1 }, { opacity: 0 }], { duration: 500 });
    h.textContent = "이후 국 끝까지 계속 보인다";
    await sleep(1400);
    if (!alive(tok)) return;
    fade([h], 500);
    await sleep(700);
  },
});
