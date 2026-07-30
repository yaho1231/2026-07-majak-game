/* MAJAK 증강 연출 랩 — 2차 배치 B · 물리 · 변환 계열
 *
 * 밥상 뒤엎기·개벽이 마음에 들었다는 피드백에서 출발한 배치다. 그 둘의 공통점은
 * 판 위의 실물이 실제로 움직이거나 형태가 바뀐다는 것 — 장식을 얹는 게 아니라
 * 판을 건드린다. 여기 6종은 전부 판 자체를 움직이거나 손패 장수를 바꾼다.
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
  sRect,
  sTone,
  sfx,
  shake,
  sleep,
  svgEl,
  tileEl,
  veil,
} from "/fx-core.js";
import { def } from "/fx-registry.js";

/* ══════════════════ 자리 바꿈 ══════════════════ */

def({
  id: "seat_swap",
  name: "자리 바꿈",
  tier: "prism",
  fam: "3D · 물리",
  tag: "네 자리가 통째로 한 칸 돌아 내 바람이 바뀐다",
  tech:
    "좌석 배지를 중심 기준 <b>원호로 샘플링해</b> 한 칸 돌리고, 판 전체에 3D 러치와 모션블러를 " +
    "준다. 방이 돌았다는 걸 보여주려면 <b>움직이는 기준점</b>이 필요하다 — 손패를 돌리면 " +
    "안 읽히므로 좌석 표식만 돌린다.",
  async run(tok) {
    const CX = 500;
    const CY = 312;
    const R = 214;
    const dark = veil("brightness(.62) saturate(.7)", 320);

    // 좌석 배지 — 아래(나)부터 시계방향
    const seats = [
      { deg: 90, wind: "東", me: true },
      { deg: 180, wind: "南" },
      { deg: 270, wind: "西" },
      { deg: 0, wind: "北" },
    ];
    const made = seats.map((s) => {
      const x = CX + R * Math.cos((s.deg * Math.PI) / 180);
      const y = CY + R * Math.sin((s.deg * Math.PI) / 180);
      const b = mk(null, {
        position: "absolute",
        left: `${x - 25}px`,
        top: `${y - 25}px`,
        width: "50px",
        height: "50px",
        borderRadius: "50%",
        display: "grid",
        placeItems: "center",
        background: "rgba(14,23,18,.94)",
        border: `2px solid ${s.me ? "#c2a068" : "rgba(236,228,210,.22)"}`,
        boxShadow: s.me ? "0 0 22px rgba(194,160,104,.6)" : "0 4px 14px rgba(4,9,7,.5)",
        font: "800 22px/1 serif",
        color: s.me ? "#c2a068" : "#a8bcaf",
      });
      b.textContent = s.wind;
      anim(b, [{ opacity: 0, scale: "0.4" }, { opacity: 1, scale: "1" }], { duration: 320, easing: EASE });
      return { el: b, ...s };
    });
    sfx.riser(0.8);
    await sleep(520);
    if (!alive(tok)) return;

    // 한 칸 회전 — 원호를 키프레임으로 샘플링한다 (배지는 세워둔 채로)
    sfx.impact();
    shake(760, 12);
    anim(S.board, [
      { transform: "perspective(1200px) rotateX(0deg) scale(1)" },
      { transform: "perspective(1200px) rotateX(-7deg) scale(.955)", offset: 0.35 },
      { transform: "perspective(1200px) rotateX(2deg) scale(1.01)", offset: 0.75 },
      { transform: "perspective(1200px) rotateX(0deg) scale(1)" },
    ], { duration: 1100, easing: EASE });
    // 판이 도는 동안만 살짝 흐려진다 — 회전을 눈이 따라가게
    anim(S.board, [
      { filter: "blur(0px)" },
      { filter: "blur(2.4px)", offset: 0.4 },
      { filter: "blur(0px)" },
    ], { duration: 1100 });

    for (const s of made) {
      const steps = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        const a = ((s.deg + 90 * t) * Math.PI) / 180;
        steps.push({
          transform: `translate(${(R * Math.cos(a) - R * Math.cos((s.deg * Math.PI) / 180)).toFixed(1)}px, ${(R * Math.sin(a) - R * Math.sin((s.deg * Math.PI) / 180)).toFixed(1)}px)`,
          offset: t,
        });
      }
      anim(s.el, steps, { duration: 1000, easing: EASE });
      anim(s.el, [
        { filter: "blur(0px)" },
        { filter: "blur(3px)", offset: 0.4 },
        { filter: "blur(0px)" },
      ], { duration: 1000 });
    }
    // 회전 방향을 알려주는 궤도 링
    const sv = mkSvg({ zIndex: "2" });
    const orb = svgEl("circle", {
      cx: CX, cy: CY, r: R, fill: "none",
      stroke: "rgba(194,160,104,.35)", "stroke-width": 2,
      "stroke-dasharray": "14 10",
    }, sv);
    anim(orb, [
      { opacity: 0, transform: "rotate(0deg)" },
      { opacity: 1, transform: "rotate(70deg)", offset: 0.5 },
      { opacity: 0, transform: "rotate(90deg)" },
    ], { duration: 1000, easing: EASE });
    orb.style.transformOrigin = `${CX}px ${CY}px`;
    sfx.whoosh(1.0);
    await sleep(1080);
    if (!alive(tok)) return;

    // 착지 — 내 자리에 온 바람을 강조한다
    sfx.impact();
    shake(280, 6);
    flash(160, "#dcc79a", 0.22);
    // 시계방향 한 칸 → 내 자리(deg 90)에 오는 건 원래 deg 0 에 있던 北
    const arrived = made.find((s) => s.deg === 0);
    if (arrived) {
      arrived.el.style.borderColor = "#c2a068";
      arrived.el.style.color = "#c2a068";
      arrived.el.style.boxShadow = "0 0 26px rgba(194,160,104,.7)";
      anim(arrived.el, [{ scale: "1" }, { scale: "1.3" }, { scale: "1" }], { duration: 420, easing: EASE_IMPACT });
      ring(CX, CY + R, 16, 120, 560, "rgba(194,160,104,.85)", 2);
    }
    const note = mk(null, {
      position: "absolute",
      left: "50%",
      top: "72px",
      transform: "translateX(-50%)",
      padding: "6px 16px",
      borderRadius: "999px",
      background: "rgba(14,23,18,.9)",
      border: "1px solid rgba(194,160,104,.6)",
      font: "800 13px/1 ui-monospace, monospace",
      letterSpacing: "3px",
      color: "#c2a068",
      whiteSpace: "nowrap",
    });
    note.textContent = "내 바람  東 → 北";
    anim(note, [
      { opacity: 0, transform: "translateX(-50%) translateY(-10px)" },
      { opacity: 1, transform: "translateX(-50%) translateY(0)" },
    ], { duration: 300, easing: EASE });
    banner("자리 바꿈", "SEATS ROTATED", 1500);
    await sleep(1700);
    if (!alive(tok)) return;
    for (const s of made) anim(s.el, [{ opacity: 1 }, { opacity: 0 }], { duration: 400 });
    for (const el of [note, sv, dark]) anim(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 400 });
    await sleep(500);
  },
});

/* ══════════════════ 통째로 바꾸기 ══════════════════ */

def({
  id: "full_hand_swap",
  name: "통째로 바꾸기",
  tier: "prism",
  fam: "캔버스 입자",
  tag: "내 손패와 상대 손패가 판을 가로질러 자리를 바꾼다",
  tech:
    "밥상 뒤엎기와 같은 <b>DOM→캔버스 인계</b>지만 안무가 다르다 — 26장이 서로 " +
    "<b>엇갈리는 두 흐름</b>으로 지나간다. 두 뭉치가 같은 경로로 가면 그냥 섞인 것처럼 보이므로, " +
    "베지에를 좌우로 다르게 휘어 흐름이 교차하게 만든다.",
  async run(tok) {
    const mine = handTiles().slice(0, 13);
    const theirs = [...S.oppTop.querySelectorAll(".tf")];
    const dark = veil("brightness(.72)", 300);
    sfx.riser(0.7);

    // 양쪽을 들어 올린다
    for (const [i, el] of mine.entries()) {
      anim(el, [{ transform: "translateY(0)" }, { transform: "translateY(-12px)" }], {
        duration: 280, delay: i * 10, easing: EASE,
      });
    }
    for (const [i, el] of theirs.entries()) {
      anim(el, [{ transform: "translateY(0)" }, { transform: "translateY(10px)" }], {
        duration: 280, delay: i * 10, easing: EASE,
      });
    }
    await sleep(360);
    if (!alive(tok)) return;

    // 캔버스로 인계 — 두 흐름이 반대로 휜다
    sfx.whoosh(0.9);
    const sprites = [];
    const mk1 = (el, dest, bow, back) => {
      const r = sRect(el);
      const d = sRect(dest);
      const p0 = { x: r.cx, y: r.cy };
      const p2 = { x: d.cx, y: d.cy };
      const p1 = { x: (p0.x + p2.x) / 2 + bow, y: (p0.y + p2.y) / 2 };
      sprites.push({
        p0, p1, p2, t: 0,
        w: r.w, h: r.h, dw: d.w, dh: d.h,
        img: imgs.get(el.dataset.code), back,
        rot: 0, vr: rnd(-0.08, 0.08),
        x: p0.x, y: p0.y,
      });
      el.style.visibility = "hidden";
    };
    for (const [i, el] of mine.entries()) mk1(el, theirs[i] ?? theirs[0], 230, false);
    for (const [i, el] of theirs.entries()) mk1(el, mine[i] ?? mine[0], -230, true);

    let t = 0;
    const DUR = 62; // 프레임
    drawHooks.add((dt, c) => {
      t += dt;
      const p = clamp(t / DUR, 0, 1);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // easeInOutQuad
      for (const s of sprites) {
        const u = 1 - e;
        s.x = u * u * s.p0.x + 2 * u * e * s.p1.x + e * e * s.p2.x;
        s.y = u * u * s.p0.y + 2 * u * e * s.p1.y + e * e * s.p2.y;
        s.rot += s.vr * dt;
        drawTile(c, {
          x: s.x, y: s.y,
          w: s.w + (s.dw - s.w) * e,
          h: s.h + (s.dh - s.h) * e,
          img: s.img, back: s.back, rot: s.rot,
        });
      }
      return t < DUR + 2;
    });
    // 교차 지점 섬광
    later(() => alive(tok) && flash(180, "#dcc79a", 0.18), 480);
    await sleep(1080);
    if (!alive(tok)) return;

    // 착지 — 내 손은 새 패로, 상대는 뒷면으로 복귀
    sfx.impact();
    const fresh = plausibleHand();
    for (const [i, el] of mine.entries()) {
      el.style.visibility = "";
      el.dataset.code = fresh[i];
      const im = el.querySelector("img");
      if (im) im.src = `/tiles/${fresh[i]}.png`;
      anim(el, [
        { transform: "translateY(-12px) scale(1.2)", opacity: 0 },
        { transform: "translateY(0) scale(1)", opacity: 1 },
      ], { duration: 340, delay: i * 26, easing: EASE_IMPACT });
      later(() => alive(tok) && sfx.clack(rnd(700, 1100)), i * 26);
    }
    for (const [i, el] of theirs.entries()) {
      el.style.visibility = "";
      anim(el, [
        { transform: "translateY(10px) scale(1.15)", opacity: 0 },
        { transform: "translateY(0) scale(1)", opacity: 1 },
      ], { duration: 340, delay: i * 22, easing: EASE_IMPACT });
    }
    banner("통째로 바꾸기", "HANDS SWAPPED", 1500);
    await sleep(1600);
    anim(dark, [{ opacity: 1 }, { opacity: 0 }], { duration: 400 });
    await sleep(500);
  },
});

/* ══════════════════ 연금술사 ══════════════════ */

def({
  id: "alchemist",
  name: "연금술사",
  tier: "prism",
  fam: "캔버스 입자",
  tag: "패를 금빛 물질로 녹여 다른 패로 재조합한다",
  tech:
    "SVG 도형을 <b>stroke-dashoffset 으로 순서대로 새기고</b>, 녹은 패를 " +
    "<b>소용돌이 입자</b>(구심력 + 접선력)로 돌린다. 개벽의 내폭과 달리 물질이 " +
    "<b>보존되며 형태만 바뀐다</b>는 걸 보여주는 게 목적이라 입자 수를 유지한다.",
  async run(tok) {
    const tiles = handTiles();
    const targets = [tiles[3], tiles[4], tiles[5]];
    const dark = veil("brightness(.5) saturate(.7)", 400);
    const hr = sRect(S.myhand);
    const CX = hr.cx;
    const CY = hr.cy - 96;

    // 연성진을 새긴다
    const sv = mkSvg({ zIndex: "3" });
    const g = svgEl("g", {}, sv);
    g.style.filter = "drop-shadow(0 0 10px rgba(194,160,104,.6))";
    const strokes = [];
    const addPath = (attrs) => {
      const p = svgEl("path", { fill: "none", stroke: "#c2a068", "stroke-width": 1.6, ...attrs }, g);
      const L = p.getTotalLength();
      p.setAttribute("stroke-dasharray", `${L}`);
      p.setAttribute("stroke-dashoffset", `${L}`);
      strokes.push({ p, L });
      return p;
    };
    const circle = (r) => {
      const d = [];
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        d.push(`${i ? "L" : "M"}${(CX + r * Math.cos(a)).toFixed(1)} ${(CY + r * Math.sin(a)).toFixed(1)}`);
      }
      return addPath({ d: d.join(" ") + " Z" });
    };
    circle(96);
    circle(74);
    // 육각성
    for (const off of [0, 1]) {
      const pts = [];
      for (let i = 0; i < 3; i++) {
        const a = ((i * 120 + off * 60 - 90) * Math.PI) / 180;
        pts.push(`${(CX + 74 * Math.cos(a)).toFixed(1)} ${(CY + 74 * Math.sin(a)).toFixed(1)}`);
      }
      addPath({ d: `M${pts[0]} L${pts[1]} L${pts[2]} Z` });
    }
    // 룬 눈금
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      addPath({
        d: `M${(CX + 84 * Math.cos(a)).toFixed(1)} ${(CY + 84 * Math.sin(a)).toFixed(1)} L${(CX + 96 * Math.cos(a)).toFixed(1)} ${(CY + 96 * Math.sin(a)).toFixed(1)}`,
        "stroke-width": 2.4,
      });
    }
    for (const [i, s] of strokes.entries()) {
      anim(s.p, [{ strokeDashoffset: s.L }, { strokeDashoffset: 0 }], {
        duration: 420, delay: i * 45, easing: EASE,
      });
    }
    sfx.riser(1.3);
    sTone({ f: 380, f2: 760, dur: 1.0, gain: 0.07, type: "triangle" });
    await sleep(1000);
    if (!alive(tok)) return;

    // 대상 패가 금빛 물질로 녹는다
    sfx.whoosh(0.7);
    const ps = [];
    for (const el of targets) {
      const r = sRect(el);
      anim(el, [
        { opacity: 1, filter: "brightness(1)" },
        { opacity: 0, filter: "brightness(3) saturate(2)" },
      ], { duration: 420, easing: EASE });
      for (let i = 0; i < 70; i++) {
        ps.push({
          x: r.x + rnd(0, r.w), y: r.y + rnd(0, r.h),
          vx: 0, vy: 0, s: rnd(1.4, 3),
        });
      }
    }
    ring(CX, CY, 20, 200, 700, "rgba(194,160,104,.6)", 2);

    // 소용돌이 — 구심력 + 접선력. 물질은 사라지지 않는다
    const phase = { v: "swirl" };
    let t = 0;
    drawHooks.add((dt, c) => {
      t += dt;
      c.save();
      c.globalCompositeOperation = "lighter";
      for (const p of ps) {
        const dx = CX - p.x;
        const dy = CY - p.y;
        const d = Math.hypot(dx, dy) || 1;
        if (phase.v === "swirl") {
          // 구심력으로 반경 60 부근에 모으고, 접선력으로 돌린다
          const pull = (d - 58) * 0.012;
          p.vx += (dx / d) * pull * dt - (dy / d) * 0.42 * dt;
          p.vy += (dy / d) * pull * dt + (dx / d) * 0.42 * dt;
          p.vx *= 1 - 0.035 * dt;
          p.vy *= 1 - 0.035 * dt;
        } else {
          // 새 패 자리로 흩어져 응결한다
          const tx = p.tx ?? CX;
          const ty = p.ty ?? CY;
          p.vx += (tx - p.x) * 0.03 * dt;
          p.vy += (ty - p.y) * 0.03 * dt;
          p.vx *= 1 - 0.12 * dt;
          p.vy *= 1 - 0.12 * dt;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        c.fillStyle = "rgba(214,186,138,.85)";
        c.fillRect(p.x, p.y, p.s, p.s);
      }
      c.restore();
      return t < 200;
    });
    await sleep(1500);
    if (!alive(tok)) return;

    // 재조합 — 물질이 손패 자리로 돌아가 새 패가 된다
    sfx.chime();
    const newCodes = [pick(NUM_CODES), pick(NUM_CODES), pick(NUM_CODES)];
    for (const [i, el] of targets.entries()) {
      const r = sRect(el);
      for (const p of ps.filter((_, k) => k % targets.length === i)) {
        p.tx = r.x + rnd(0, r.w);
        p.ty = r.y + rnd(0, r.h);
      }
    }
    phase.v = "condense";
    await sleep(620);
    if (!alive(tok)) return;
    flash(200, "#dcc79a", 0.5);
    for (const [i, el] of targets.entries()) {
      el.dataset.code = newCodes[i];
      const im = el.querySelector("img");
      if (im) im.src = `/tiles/${newCodes[i]}.png`;
      anim(el, [
        { opacity: 0, filter: "brightness(3.5)", transform: "scale(1.3)" },
        { opacity: 1, filter: "brightness(1)", transform: "scale(1)" },
      ], { duration: 480, delay: i * 90, easing: EASE });
      later(() => alive(tok) && sfx.clack(1200 + i * 260), i * 90);
    }
    banner("연금술사", "TRANSMUTED · 3", 1600);
    await sleep(1500);
    if (!alive(tok)) return;
    for (const s of strokes) anim(s.p, [{ opacity: 1 }, { opacity: 0 }], { duration: 500 });
    anim(dark, [{ opacity: 1 }, { opacity: 0 }], { duration: 520 });
    await sleep(620);
  },
});

/* ══════════════════ 진짜 용 ══════════════════ */

def({
  id: "true_dragon",
  name: "진짜 용",
  tier: "prism",
  fam: "캔버스 입자",
  tag: "빛의 용이 손패를 감고 지나가면 17장이 된다",
  tech:
    "머리 위치 이력을 몸통으로 삼는 <b>분절 트레일</b> — 꼬리로 갈수록 가늘어지는 폴리라인에 " +
    "비늘을 얹어 생물처럼 보이게 한다. 개벽의 무작위 입자와 달리 <b>구조가 있는 궤적</b>이라 " +
    "'무언가가 지나갔다'로 읽힌다. 지나간 뒤 손패가 실제로 늘어난다.",
  async run(tok) {
    const dark = veil("brightness(.46) saturate(.8)", 420);
    const hr = sRect(S.myhand);
    sfx.riser(1.5);

    // 용 — 머리가 손패를 감는 경로를 돌고, 몸통은 이력이다
    const head = { x: -80, y: hr.cy };
    const body = [];
    // 몸통은 '프레임 수'가 아니라 '길이'로 유지한다 — 프레임 기준이면 슬로우모션에서
    // 머리가 프레임당 덜 움직여 몸통이 뭉툭한 토막이 된다.
    const SEG = 9;      // 마디 간격(px)
    const BODY_LEN = 420; // 몸통 총 길이(px)
    let t = 0;
    const DUR = 150;
    drawHooks.add((dt, c) => {
      t += dt;
      const p = clamp(t / DUR, 0, 1);
      // 손패를 좌→우로 훑으며 위아래로 감는다
      head.x = -80 + (1000 + 160) * p;
      head.y = hr.cy - Math.sin(p * Math.PI * 3.2) * 96;
      const last = body[body.length - 1];
      if (!last || Math.hypot(head.x - last.x, head.y - last.y) >= SEG) {
        body.push({ x: head.x, y: head.y });
        while (body.length > Math.round(BODY_LEN / SEG)) body.shift();
      }

      c.save();
      c.globalCompositeOperation = "lighter";
      // 몸통 — 꼬리로 갈수록 가늘게
      c.lineCap = "round";
      for (let i = 1; i < body.length; i++) {
        const f = i / body.length; // 0=꼬리, 1=머리쪽
        c.beginPath();
        c.moveTo(body[i - 1].x, body[i - 1].y);
        c.lineTo(body[i].x, body[i].y);
        // 겉불꽃
        c.lineWidth = 4 + f * 22;
        c.strokeStyle = `rgba(194,160,104,${0.12 + f * 0.5})`;
        c.stroke();
        // 속심 — 흰빛 코어가 있어야 '빛의 몸'으로 보인다
        c.beginPath();
        c.moveTo(body[i - 1].x, body[i - 1].y);
        c.lineTo(body[i].x, body[i].y);
        c.lineWidth = 1 + f * 7;
        c.strokeStyle = `rgba(255,248,226,${0.1 + f * 0.62})`;
        c.stroke();
        // 비늘
        if (i % 3 === 0) {
          c.beginPath();
          c.arc(body[i].x, body[i].y, 2 + f * 7, 0, 6.284);
          c.fillStyle = `rgba(236,228,210,${f * 0.4})`;
          c.fill();
        }
      }
      // 머리 — 넉넉한 광휘
      const hg = c.createRadialGradient(head.x, head.y, 0, head.x, head.y, 46);
      hg.addColorStop(0, "rgba(255,252,238,1)");
      hg.addColorStop(0.28, "rgba(255,238,196,.8)");
      hg.addColorStop(0.6, "rgba(214,186,138,.4)");
      hg.addColorStop(1, "rgba(194,160,104,0)");
      c.fillStyle = hg;
      c.beginPath();
      c.arc(head.x, head.y, 46, 0, 6.284);
      c.fill();
      c.restore();
      return t < DUR + 20;
    });
    sfx.beam();
    await sleep(1600);
    if (!alive(tok)) return;

    // 지나간 자리에 3장이 더 생긴다 — 16장 + 쯔모패 = 17장
    sfx.impact();
    flash(220, "#dcc79a", 0.42);
    shake(420, 9);
    const extra = [];
    const drawn = S.myhand.querySelector(".drawn");
    for (let i = 0; i < 3; i++) {
      const t2 = tileEl(pick(NUM_CODES));
      S.myhand.insertBefore(t2, drawn);
      extra.push(t2);
      anim(t2, [
        { opacity: 0, transform: "scale(2) rotate(20deg)", filter: "brightness(4)" },
        { opacity: 1, transform: "scale(1) rotate(0)", filter: "brightness(1)" },
      ], { duration: 520, delay: i * 140, easing: EASE_IMPACT });
      later(() => {
        if (!alive(tok)) return;
        sfx.clack(900 + i * 300);
        const r = sRect(t2);
        ring(r.cx, r.cy, 10, 90, 460, "rgba(194,160,104,.85)", 2);
      }, i * 140);
    }
    // 손패 장수 표시
    const cnt = mk(null, {
      position: "absolute",
      left: "50%",
      top: "74px",
      transform: "translateX(-50%)",
      padding: "6px 16px",
      borderRadius: "999px",
      background: "rgba(14,23,18,.9)",
      border: "1px solid rgba(194,160,104,.6)",
      font: "800 13px/1 ui-monospace, monospace",
      letterSpacing: "3px",
      color: "#c2a068",
      whiteSpace: "nowrap",
    });
    cnt.textContent = "손패 13 → 16장 · 5멘쯔 1작두";
    anim(cnt, [
      { opacity: 0, transform: "translateX(-50%) translateY(-10px)" },
      { opacity: 1, transform: "translateX(-50%) translateY(0)" },
    ], { duration: 320, delay: 420, easing: EASE });
    banner("진 짜 용", "TRUE DRAGON · 17", 1700);
    await sleep(2000);
    if (!alive(tok)) return;
    anim(cnt, [{ opacity: 1 }, { opacity: 0 }], { duration: 420 });
    anim(dark, [{ opacity: 1 }, { opacity: 0 }], { duration: 520 });
    await sleep(620);
  },
});

/* ══════════════════ 뚫린 천장 ══════════════════ */

def({
  id: "aotenjou_ceiling",
  name: "뚫린 천장",
  tier: "prism",
  fam: "파괴 · 임팩트",
  tag: "점수 상한판이 깨지고 숫자가 달아난다",
  tech:
    "숫자를 <b>자리별 릴(오도미터)</b>로 만들어 각 자리를 다른 속도로 돌린다 — 단순 카운트업은 " +
    "'계산'처럼 보이지만 릴은 '폭주'로 보인다. 상한을 <b>물리적인 판</b>으로 세워두고 위로 " +
    "부숴 없어진 규칙을 눈에 보이게 한다.",
  async run(tok) {
    const dark = veil("brightness(.5) saturate(.7)", 380);
    const CX = 500;
    const PY = 250;

    // 상한판 — 점수 위에 놓인 물리적 천장
    const cap = mk(null, {
      position: "absolute",
      left: `${CX - 160}px`,
      top: `${PY - 46}px`,
      width: "320px",
      height: "30px",
      borderRadius: "var(--r-sm)",
      background: "linear-gradient(180deg,#2a3038,#171b21)",
      border: "1px solid rgba(236,228,210,.2)",
      boxShadow: "0 6px 18px rgba(4,9,7,.6)",
      display: "grid",
      placeItems: "center",
      font: "800 12px/1 ui-monospace, monospace",
      letterSpacing: "4px",
      color: "#7b9084",
    });
    cap.textContent = "上限 32000";
    anim(cap, [{ opacity: 0, transform: "translateY(-16px)" }, { opacity: 1, transform: "none" }], {
      duration: 340, easing: EASE,
    });

    // 오도미터 — 자리별 릴
    const DIGITS = 6;
    const rack = mk(null, {
      position: "absolute",
      left: `${CX - DIGITS * 21}px`,
      top: `${PY}px`,
      display: "flex",
      gap: "2px",
    });
    const reels = [];
    for (let d = 0; d < DIGITS; d++) {
      const win = mk(null, {
        position: "relative",
        width: "40px",
        height: "56px",
        borderRadius: "var(--r-sm)",
        background: "rgba(10,18,16,.92)",
        border: "1px solid rgba(194,160,104,.4)",
        overflow: "hidden",
      }, rack);
      const strip = mk(null, {
        position: "absolute",
        left: "0",
        top: "0",
        width: "100%",
        display: "flex",
        flexDirection: "column",
      }, win);
      // 0..9 를 넉넉히 반복해 길게 돌 수 있게
      for (let k = 0; k < 40; k++) {
        const cell = mk(null, {
          width: "40px",
          height: "56px",
          flex: "none",
          display: "grid",
          placeItems: "center",
          font: "800 30px/1 ui-monospace, monospace",
          color: "#c2a068",
        }, win === null ? rack : strip);
        cell.textContent = String(k % 10);
      }
      reels.push(strip);
    }
    anim(rack, [{ opacity: 0, scale: "0.8" }, { opacity: 1, scale: "1" }], { duration: 320, easing: EASE });

    // 자리 d 가 목표 숫자 g 에 멈추는 칸 위치. 자리마다 회전수를 달리해 계단식으로 멈춘다.
    // (그냥 base+d 로 두면 032000 이 아니라 456789 처럼 순차 숫자가 나와 가짜로 보인다)
    const stopFor = (d, g, base) => {
      const k = base + d * 2;
      return k + ((((g - k) % 10) + 10) % 10);
    };
    const CAP_DIGITS = [0, 3, 2, 0, 0, 0];      // 032000 — 상한
    const RUN_DIGITS = [4, 8, 7, 6, 0, 0];      // 487600 — 상한 없음
    sfx.riser(0.9);
    await sleep(560);
    if (!alive(tok)) return;

    // 1단계: 상한까지 올라가서 판에 부딪힌다
    const capStop = reels.map((_, i) => stopFor(i, CAP_DIGITS[i], 6));
    for (const [i, s] of reels.entries()) {
      anim(s, [{ transform: "translateY(0px)" }, { transform: `translateY(${-56 * capStop[i]}px)` }], {
        duration: 900, easing: EASE,
      });
    }
    await sleep(900);
    if (!alive(tok)) return;
    // 눌린다 — 판이 막고 있다
    sfx.clack(300);
    for (let i = 0; i < 3; i++) {
      anim(cap, [
        { transform: "translateY(0)" },
        { transform: "translateY(-5px)", offset: 0.4 },
        { transform: "translateY(0)" },
      ], { duration: 220, delay: i * 230 });
      anim(rack, [
        { transform: "translateY(0)" },
        { transform: "translateY(-4px)", offset: 0.4 },
        { transform: "translateY(0)" },
      ], { duration: 220, delay: i * 230 });
      later(() => alive(tok) && sfx.clack(360), i * 230);
    }
    await sleep(760);
    if (!alive(tok)) return;

    // 2단계: 판이 위로 부서진다
    sfx.impact();
    sfx.shatter();
    shake(700, 16);
    flash(220, "#dcc79a", 0.5);
    const cr = sRect(cap);
    cap.style.visibility = "hidden";
    const SH = 9;
    for (let i = 0; i < SH; i++) {
      const w = cr.w / SH;
      const piece = mk(null, {
        position: "absolute",
        left: `${cr.x + i * w}px`,
        top: `${cr.y}px`,
        width: `${w}px`,
        height: `${cr.h}px`,
        background: "linear-gradient(180deg,#2a3038,#171b21)",
        border: "1px solid rgba(236,228,210,.2)",
      });
      anim(piece, [
        { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
        {
          transform: `translate(${rnd(-160, 160)}px, ${rnd(-320, -170)}px) rotate(${rnd(-160, 160)}deg)`,
          opacity: 0,
        },
      ], { duration: rnd(700, 1000), easing: "cubic-bezier(.2,.5,.3,1)" })
        .finished.then(() => piece.remove()).catch(() => piece.remove());
    }
    // 뚫린 구멍으로 들어오는 빛
    let lt = 0;
    drawHooks.add((dt, c) => {
      lt += dt;
      const a = clamp(lt / 20, 0, 1) * clamp(2 - lt / 60, 0, 1);
      c.save();
      c.globalCompositeOperation = "lighter";
      const g = c.createLinearGradient(0, 0, 0, PY + 60);
      g.addColorStop(0, `rgba(220,199,154,${0.34 * a})`);
      g.addColorStop(1, "rgba(220,199,154,0)");
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(CX - 60, 0);
      c.lineTo(CX + 60, 0);
      c.lineTo(CX + 200, PY + 60);
      c.lineTo(CX - 200, PY + 60);
      c.closePath();
      c.fill();
      c.restore();
      return lt < 130;
    });

    // 3단계: 숫자가 달아난다 — 자리마다 다른 속도
    const runStop = reels.map((_, i) => stopFor(i, RUN_DIGITS[i], 24));
    for (const [i, s] of reels.entries()) {
      anim(s, [
        { transform: `translateY(${-56 * capStop[i]}px)`, filter: "blur(0px)" },
        { transform: `translateY(${-56 * capStop[i]}px)`, filter: "blur(4px)", offset: 0.12 },
        { transform: `translateY(${-56 * (runStop[i] - 4)}px)`, filter: "blur(4px)", offset: 0.8 },
        { transform: `translateY(${-56 * runStop[i]}px)`, filter: "blur(0px)" },
      ], { duration: 1900 + i * 90, easing: "cubic-bezier(.1,.7,.2,1)" });
    }
    sfx.whoosh(1.8);
    anim(rack, [
      { scale: "1", filter: "brightness(1)" },
      { scale: "1.16", filter: "brightness(1.5)", offset: 0.6 },
      { scale: "1.08", filter: "brightness(1.2)" },
    ], { duration: 2000, easing: EASE });
    banner("뚫린 천장", "NO CEILING", 1800);
    await sleep(2300);
    if (!alive(tok)) return;

    const note = mk(null, {
      position: "absolute",
      left: "50%",
      top: `${PY + 78}px`,
      transform: "translateX(-50%)",
      font: "800 13px/1 ui-monospace, monospace",
      letterSpacing: "3px",
      color: "#c2a068",
      whiteSpace: "nowrap",
    });
    note.textContent = "상한 없음 · 청천정";
    anim(note, [{ opacity: 0 }, { opacity: 1 }], { duration: 340 });
    await sleep(1200);
    if (!alive(tok)) return;
    for (const el of [rack, note, dark]) anim(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 460 });
    await sleep(560);
  },
});

/* ══════════════════ 기생충 ══════════════════ */

def({
  id: "parasite",
  name: "기생충",
  tier: "prism",
  fam: "SVG 필터",
  tag: "상대 손패에 기생해 점수를 빨아온다",
  tech:
    "CSS <b>offset-path + offset-rotate</b> 로 곡선을 기어가게 하고(진행 방향으로 저절로 " +
    "돌아간다), 연결된 혈관은 <b>feMorphology dilate</b> 를 맥동시켜 두께가 살아 있게 만든다. " +
    "빨아오는 방향은 dashoffset 흐름으로 표시한다 — 누가 이득인지 화살표 없이 전달된다.",
  async run(tok) {
    const dark = veil("brightness(.52) saturate(.8)", 400);
    const hr = sRect(S.myhand);
    const victim = [...S.oppTop.querySelectorAll(".tf")][6];
    const vr = sRect(victim);

    const from = { x: hr.cx, y: hr.y - 10 };
    const to = { x: vr.cx, y: vr.cy + 26 };
    const cp1 = { x: from.x - 200, y: (from.y + to.y) / 2 + 40 };
    const cp2 = { x: to.x + 170, y: (from.y + to.y) / 2 - 60 };
    const pathD = `M ${from.x} ${from.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${to.x} ${to.y}`;

    // 기생충 — 진행 방향으로 저절로 돌아간다
    const bug = mk(null, {
      position: "absolute",
      left: "0",
      top: "0",
      width: "26px",
      height: "13px",
      marginLeft: "-13px",
      marginTop: "-6.5px",
      borderRadius: "50% 40% 40% 50%",
      background: "radial-gradient(ellipse at 30% 40%, #b6a3ff, #6a49d8 60%, #3d2680)",
      boxShadow: "0 0 14px rgba(124,92,255,.8)",
      offsetPath: `path("${pathD}")`,
      offsetRotate: "auto",
      offsetDistance: "0%",
    });
    sfx.riser(0.6);
    sTone({ f: 140, f2: 90, dur: 0.9, gain: 0.08, type: "sawtooth" });

    // 꿈틀거리며 기어간다 — 이동과 별개로 몸을 늘였다 줄인다
    anim(bug, [{ offsetDistance: "0%" }, { offsetDistance: "100%" }], {
      duration: 1600,
      easing: "cubic-bezier(.4,.1,.6,.9)",
    });
    anim(bug, [
      { scale: "1 1" },
      { scale: "1.4 0.7" },
      { scale: "0.85 1.25" },
      { scale: "1 1" },
    ], { duration: 320, iterations: 5, easing: "ease-in-out" });
    await sleep(1700);
    if (!alive(tok)) return;

    // 파고든다
    sfx.impact();
    shake(300, 6);
    anim(bug, [{ opacity: 1, scale: "1 1" }, { opacity: 0, scale: "0.3 0.3" }], { duration: 300 });
    ring(to.x, to.y, 10, 90, 520, "rgba(124,92,255,.85)", 2);
    anim(victim, [
      { filter: "brightness(1)" },
      { filter: "brightness(.45) saturate(.4)" },
    ], { duration: 420 });
    await sleep(360);
    if (!alive(tok)) return;

    // 혈관이 자란다 — dilate 맥동으로 두께가 살아 있다
    const sv = mkSvg({ zIndex: "3" });
    const vein = svgEl("path", {
      d: pathD,
      fill: "none",
      stroke: "#7c5cff",
      "stroke-width": 2.2,
      "stroke-linecap": "round",
      filter: "url(#fVein)",
    }, sv);
    const L = vein.getTotalLength();
    vein.setAttribute("stroke-dasharray", `${L}`);
    vein.setAttribute("stroke-dashoffset", `${L}`);
    // 상대 쪽에서 나에게로 자란다
    anim(vein, [{ strokeDashoffset: -L }, { strokeDashoffset: 0 }], { duration: 700, easing: EASE });
    sfx.whoosh(0.7);
    await sleep(760);
    if (!alive(tok)) return;

    // 빨아오는 흐름 — 점선이 나를 향해 흐른다
    const flow = svgEl("path", {
      d: pathD,
      fill: "none",
      stroke: "#d5caff",
      "stroke-width": 3,
      "stroke-linecap": "round",
      "stroke-dasharray": "5 26",
    }, sv);
    anim(flow, [{ strokeDashoffset: 0 }, { strokeDashoffset: 310 }], {
      duration: 1400,
      iterations: Infinity,
      easing: "linear",
    });

    // 점수가 실제로 옮겨간다
    const t0 = performance.now();
    const roll = () => {
      if (!alive(tok)) return;
      const p = clamp((performance.now() - t0) / 2000, 0, 1);
      S.csBottom.textContent = String(Math.round(25000 + 11600 * p));
      if (p < 1) requestAnimationFrame(roll);
    };
    roll();
    anim(S.csBottom, [
      { color: "#c2a068" },
      { color: "#b6a3ff" },
      { color: "#c2a068" },
    ], { duration: 700, iterations: 3 });
    for (let i = 0; i < 5; i++) later(() => alive(tok) && sTone({ f: 700 + i * 90, dur: 0.1, gain: 0.05, type: "sine" }), i * 340);

    banner("기 생 충", "PARASITE ATTACHED", 1700);
    await sleep(2200);
    if (!alive(tok)) return;
    for (const el of [sv, dark]) anim(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 500 });
    await sleep(600);
  },
});
