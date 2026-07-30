/* MAJAK 증강 연출 랩 — 연출 정의 + UI
 *
 * 증강 하나하나에 어울리는 "웹에서 실제로 되는" 연출을 기법군별로 모아놓은 프로토타입.
 * 각 연출의 tech 필드에 어떤 기법을 왜 썼는지 적어둔다 — 고를 때 그게 판단 근거다.
 */

import {
  EASE,
  EASE_IMPACT,
  EASE_QUART,
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
  fitCanvas,
  fitStage,
  flash,
  handTiles,
  imgs,
  later,
  mk,
  mkSvg,
  pick,
  plausibleHand,
  resetStage,
  ring,
  rnd,
  sRect,
  setSpeed,
  sfx,
  shake,
  sleep,
  svgEl,
  tileEl,
  token,
  veil,
} from "/fx-core.js";

const EFFECTS = [];
const def = (o) => EFFECTS.push(o);

/* ══════════════════ 기법군 A · 3D 변환 + 물리 ══════════════════ */

def({
  id: "table_flip",
  name: "밥상 뒤엎기",
  tier: "prism",
  fam: "3D · 물리",
  tag: "손패 13장이 상과 함께 날아가고 새 손이 깔린다",
  tech:
    "<b>CSS 3D perspective</b> 로 판을 기울이고, DOM 패를 <b>캔버스 스프라이트</b>로 인계해 중력·회전 물리로 날린다. " +
    "이 DOM→캔버스 인계가 핵심 — 수십 장을 개별 DOM 트랜스폼으로 굴리면 60fps 가 안 나온다.",
  async run(tok) {
    const tiles = handTiles();
    const sprites = tiles.map((el) => {
      const r = sRect(el);
      return {
        x: r.cx, y: r.cy, w: r.w, h: r.h,
        img: imgs.get(el.dataset.code),
        rot: 0, vx: 0, vy: 0, vr: 0, a: 1,
      };
    });

    // 1) 예비동작 — 손을 움켜쥐듯 살짝 들린다
    sfx.riser(0.5);
    for (const [i, el] of tiles.entries()) {
      anim(el, [
        { transform: "translateY(0)" },
        { transform: `translateY(-7px) rotate(${rnd(-4, 4)}deg)` },
      ], { duration: 300, delay: i * 8, easing: "ease-out" });
    }
    await sleep(360);
    if (!alive(tok)) return;

    // 2) 뒤엎기 — 판이 기울고 패가 튀어오른다
    // 순서 주의: 기울기를 먼저 만들고 shake 를 나중에 걸어야 한다. WAAPI 는 나중에 만든
    // 애니메이션이 합성 순서상 위에 오므로, replace 인 기울기를 뒤에 걸면 shake 가 지워진다.
    sfx.impact();
    anim(S.board, [
      { transform: "perspective(1200px) rotateX(0deg) translateY(0px)" },
      { transform: "perspective(1200px) rotateX(-17deg) translateY(-26px)", offset: 0.18 },
      { transform: "perspective(1200px) rotateX(6deg) translateY(9px)", offset: 0.55 },
      { transform: "perspective(1200px) rotateX(0deg) translateY(0px)" },
    ], { duration: 900, easing: "cubic-bezier(.2,.9,.3,1)" });
    shake(620, 16);

    for (const el of tiles) el.style.visibility = "hidden";
    for (const sp of sprites) {
      sp.vx = rnd(-7, 7);
      sp.vy = rnd(-21, -13);
      sp.vr = rnd(-0.42, 0.42);
    }
    flash(180, "#dcc79a", 0.35);
    ring(500, 560, 30, 420, 700, "rgba(194,160,104,.5)", 4);

    let t = 0;
    drawHooks.add((dt, c) => {
      t += dt;
      for (const sp of sprites) {
        sp.vy += 0.95 * dt; // 중력
        sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;
        sp.rot += sp.vr * dt;
        if (sp.y > 700) sp.a = 0;
        if (sp.a > 0) drawTile(c, sp);
      }
      return t < 200;
    });

    // 3) 새 손 배분 — 위에서 내리꽂히는 스태거
    await sleep(620);
    if (!alive(tok)) return;
    const fresh = plausibleHand();
    for (const [i, el] of tiles.entries()) {
      el.style.visibility = "";
      if (i >= 13) continue;
      const im = el.querySelector("img");
      el.dataset.code = fresh[i];
      if (im) im.src = `/tiles/${fresh[i]}.png`;
      anim(el, [
        { transform: "translateY(-64px) scale(1.5)", opacity: 0 },
        { transform: "translateY(0) scale(1)", opacity: 1, offset: 0.5 },
        { transform: "scale(1.1,.88)", offset: 0.68 },
        { transform: "scale(.97,1.04)", offset: 0.84 },
        { transform: "scale(1,1)" },
      ], { duration: 420, delay: i * 42, easing: EASE_IMPACT });
      later(() => alive(tok) && sfx.clack(rnd(700, 1100)), i * 42);
    }
    await sleep(900);
  },
});

def({
  id: "hourglass",
  name: "뒤집힌 모래시계",
  tier: "prism",
  fam: "3D · 물리",
  tag: "모래가 거꾸로 흐르고 진행 순서가 반전된다",
  tech:
    "<b>3D 뒤집기(오버슈트 이징)</b> + <b>중력이 반대인 캔버스 입자</b>. 순서 반전은 테이블을 둘러싼 " +
    "SVG 호살표의 <b>stroke-dashoffset 방향</b>을 뒤집어 보여준다 — 규칙 변화를 화살표 하나로 설명하는 방식.",
  async run(tok) {
    // 진행 순서 화살표 (시계방향)
    const sv = mkSvg({ zIndex: "2" });
    const arcs = [];
    for (let i = 0; i < 4; i++) {
      const a0 = -135 + i * 90;
      const p = svgEl("path", {
        d: arcPath(500, 312, 246, a0 + 12, a0 + 78),
        fill: "none", stroke: "rgba(168,188,175,.75)", "stroke-width": 3,
        "stroke-linecap": "round", "stroke-dasharray": 220, "stroke-dashoffset": 220,
      }, sv);
      arcs.push(p);
      anim(p, [{ strokeDashoffset: 220 }, { strokeDashoffset: 0 }], { duration: 520, delay: i * 110 });
    }
    sfx.whoosh(0.5);
    await sleep(720);
    if (!alive(tok)) return;

    // 모래시계 등장
    const box = mk(null, {
      position: "absolute", left: "500px", top: "300px",
      width: "120px", height: "170px", margin: "-85px 0 0 -60px",
    });
    const hs = mkSvg({ width: "120px", height: "170px" }, box);
    hs.setAttribute("viewBox", "0 0 120 170");
    svgEl("path", {
      d: "M18 10 H102 L66 85 L102 160 H18 L54 85 Z",
      fill: "rgba(12,26,42,.85)", stroke: "#9a7b42", "stroke-width": 3,
    }, hs);
    // 위/아래 캡의 폭을 다르게 둔다 — 좌우대칭 도형은 180° 돌려도 안 돌아간 것처럼 보인다
    svgEl("rect", { x: 22, y: 2, width: 76, height: 9, rx: 4, fill: "#c9a24e" }, hs);
    svgEl("rect", { x: 4, y: 156, width: 112, height: 13, rx: 5, fill: "#c2a068" }, hs);
    // 시작은 '흐르는 중' — 위 벌브에 모래가 차 있다.
    // 아래 벌브(svg 기준)는 뒤집힌 뒤 화면 위로 올라가므로, 그때 채우면 모래가 올라가 보인다.
    const sandUp = svgEl("path", { d: "M18 14 H102 L66 82 H54 Z", fill: "#c2a068" }, hs);
    const sandLo = svgEl("path", { d: "M54 96 H66 L66 96 H54 Z", fill: "#c2a068" }, hs);
    anim(box, [
      { transform: "scale(.3) rotate(-30deg)", opacity: 0 },
      { transform: "scale(1) rotate(0deg)", opacity: 1 },
    ], { duration: 380, easing: EASE });
    sfx.ping(900);
    await sleep(460);
    if (!alive(tok)) return;

    // 뒤집기 — 오버슈트로 무게감을 준다
    sfx.impact();
    shake(340, 8);
    anim(box, [
      { transform: "perspective(700px) rotate(0deg) rotateY(0deg)" },
      { transform: "perspective(700px) rotate(196deg) rotateY(180deg)", offset: 0.78 },
      { transform: "perspective(700px) rotate(180deg) rotateY(180deg)" },
    ], { duration: 760, easing: "cubic-bezier(.3,.8,.2,1)" });
    await sleep(780);
    if (!alive(tok)) return;

    // 모래가 위로 — 뒤집힌 뒤엔 svg 의 위 벌브가 화면 아래에 있다. 그 쪽을 비우고
    // 아래 벌브(화면 위)를 채우면 모래가 거슬러 올라가는 것으로 보인다.
    // d 는 CSS 기하 프로퍼티라 path() 로 감싸야 하고, 명령 구성이 같아야 보간된다.
    anim(sandUp, [
      { d: 'path("M18 14 H102 L66 82 H54 Z")' },
      { d: 'path("M54 82 H66 L66 82 H54 Z")' },
    ], { duration: 1500, easing: "linear" });
    anim(sandLo, [
      { d: 'path("M54 96 H66 L66 96 H54 Z")' },
      { d: 'path("M30 152 H90 L66 96 H54 Z")' },
    ], { duration: 1500, easing: "linear" });

    const grains = [];
    let t = 0;
    drawHooks.add((dt, c) => {
      t += dt;
      if (t < 90) {
        for (let i = 0; i < 3; i++) {
          grains.push({ x: 500 + rnd(-4, 4), y: 300, vx: rnd(-0.5, 0.5), vy: rnd(-1.6, -0.7), life: rnd(40, 80), age: 0 });
        }
      }
      for (const g of grains) {
        g.age += dt;
        g.vy -= 0.035 * dt; // 역중력
        g.x += g.vx * dt;
        g.y += g.vy * dt;
        c.fillStyle = `rgba(231,196,112,${clamp(1 - g.age / g.life, 0, 1)})`;
        c.fillRect(g.x, g.y, 2.2, 2.2);
      }
      for (let i = grains.length - 1; i >= 0; i--) if (grains[i].age > grains[i].life) grains.splice(i, 1);
      return t < 190;
    });
    sfx.whoosh(1.2);

    // 화살표 반전
    await sleep(320);
    if (!alive(tok)) return;
    for (const [i, p] of arcs.entries()) {
      anim(p, [
        { strokeDashoffset: 0, stroke: "rgba(168,188,175,.75)" },
        { strokeDashoffset: -220, stroke: "rgba(255,120,130,.95)" },
      ], { duration: 560, delay: i * 90 });
    }
    sfx.chime();
    banner("順 반 전", "TURN ORDER REVERSED", 1400);
    await sleep(1500);
  },
});

def({
  id: "open_riichi",
  name: "오픈 리치",
  tier: "gold",
  fam: "3D · 물리",
  tag: "손패를 눕혀 공개하고 사본이 세 상대에게 날아간다",
  tech:
    "<b>rotateX 스태거 플립</b> + 금빛 <b>글레어 스윕</b>. 공개를 '정보가 상대에게 전달된다'로 보이게 하려고 " +
    "손패 <b>고스트 사본</b>을 각 좌석으로 날린다 — 규칙 텍스트를 읽지 않아도 뭘 잃었는지 안다.",
  async run(tok) {
    const tiles = handTiles();
    sfx.riser(0.7);
    const vig = veil("brightness(.72) saturate(1.15)", 420);

    // 리치봉
    const stick = mk(null, {
      position: "absolute", left: "500px", top: "398px",
      width: "112px", height: "12px", margin: "0 0 0 -56px", borderRadius: "6px",
      background: "linear-gradient(180deg,#fff,#d8d2c2)",
      boxShadow: "0 2px 10px rgba(0,0,0,.5)",
    });
    mk(null, {
      position: "absolute", left: "50%", top: "50%", width: "8px", height: "8px",
      margin: "-4px 0 0 -4px", borderRadius: "50%", background: "#e0393e",
    }, stick);
    anim(stick, [
      { transform: "translateY(-40px) rotate(-18deg)", opacity: 0 },
      { transform: "translateY(0) rotate(0deg)", opacity: 1 },
    ], { duration: 340, easing: EASE });
    sfx.clack(1400);
    await sleep(300);
    if (!alive(tok)) return;

    // 손패를 앞으로 눕힌다 (공개)
    for (const [i, el] of tiles.entries()) {
      anim(el, [
        { transform: "perspective(600px) rotateX(0deg) translateY(0)" },
        { transform: "perspective(600px) rotateX(-58deg) translateY(-13px)", offset: 0.62 },
        { transform: "perspective(600px) rotateX(-46deg) translateY(-10px)" },
      ], { duration: 520, delay: i * 26, easing: "cubic-bezier(.25,1.1,.35,1)" });
      later(() => alive(tok) && sfx.clack(rnd(1000, 1500)), i * 26);
    }
    await sleep(540);
    if (!alive(tok)) return;

    // 금빛 글레어가 13장을 한 번에 훑는다
    const hr = sRect(S.myhand);
    const glare = mk(null, {
      position: "absolute", left: `${hr.x - 60}px`, top: `${hr.y - 30}px`,
      width: `${hr.w + 120}px`, height: `${hr.h + 60}px`,
      background: "linear-gradient(100deg, transparent 42%, rgba(214,186,138,.95) 50%, transparent 58%)",
      mixBlendMode: "screen", filter: "blur(1px)",
    });
    anim(glare, [{ transform: "translateX(-120%)" }, { transform: "translateX(120%)" }], {
      duration: 620, easing: "cubic-bezier(.4,0,.6,1)",
    }).finished.then(() => glare.remove()).catch(() => glare.remove());
    sfx.whoosh(0.6);
    banner("오 픈 리 치", "HAND REVEALED", 1500);
    await sleep(360);
    if (!alive(tok)) return;

    // 고스트 사본 3장이 각 상대 좌석으로
    for (const [i, el] of [S.oppTop, S.oppLeft, S.oppRight].entries()) {
      const d = sRect(el);
      const ghost = mk(null, {
        position: "absolute", left: `${hr.x}px`, top: `${hr.y}px`,
        width: `${hr.w}px`, height: `${hr.h}px`,
        border: "1px solid rgba(194,160,104,.9)", borderRadius: "6px",
        background: "linear-gradient(180deg, rgba(194,160,104,.22), rgba(194,160,104,.05))",
        boxShadow: "0 0 24px rgba(194,160,104,.5)",
      });
      anim(ghost, [
        { transform: "translate(0,0) scale(1)", opacity: 0.95 },
        { transform: `translate(${d.cx - hr.cx}px, ${d.cy - hr.cy}px) scale(.36)`, opacity: 0 },
      ], { duration: 700, delay: i * 90, easing: "cubic-bezier(.3,.1,.2,1)" })
        .finished.then(() => ghost.remove()).catch(() => ghost.remove());
      later(() => alive(tok) && sfx.ping(1200 + i * 260), i * 90);
    }
    await sleep(1100);
    anim(vig, [{ opacity: 1 }, { opacity: 0 }], { duration: 400 });
    await sleep(500);
  },
});

/* ══════════════════ 기법군 B · 캔버스 입자 ══════════════════ */

def({
  id: "genesis",
  name: "개벽",
  tier: "prism",
  fam: "캔버스 입자",
  tag: "판이 빛으로 흩어져 중앙으로 모이고 새 세계가 열린다",
  tech:
    "판 위 <b>모든 패의 위치를 실측</b>해 수백 개 입자로 치환 → 가속 내폭 → 백색 섬광 → 재배치. " +
    "DOM 수백 개를 애니메이션하는 대신 <b>단일 캔버스에 lighter 합성</b>으로 그린다.",
  async run(tok) {
    const all = [...S.stage.querySelectorAll(".tf")];
    const ps = [];
    for (const el of all) {
      const r = sRect(el);
      const back = el.classList.contains("back");
      for (let i = 0; i < 4; i++) {
        ps.push({
          x: r.x + rnd(0, r.w), y: r.y + rnd(0, r.h),
          hx: 0, hy: 0, size: rnd(1.6, 3.4),
          col: back ? "47,111,79" : "248,245,236",
        });
      }
    }
    for (const el of all) {
      anim(el, [
        { opacity: 1, filter: "brightness(1)" },
        { opacity: 0, filter: "brightness(2.4)" },
      ], { duration: 460, delay: rnd(0, 180) });
    }
    sfx.riser(1.0);

    const CX = 500;
    const CY = 300;
    const phase = { v: "in" };
    let t = 0;
    drawHooks.add((dt, c) => {
      t += dt;
      c.save();
      c.globalCompositeOperation = "lighter";
      for (const p of ps) {
        if (phase.v === "in") {
          const dx = CX - p.x;
          const dy = CY - p.y;
          const d = Math.hypot(dx, dy) || 1;
          const pull = 0.09 + 26 / d; // 가까울수록 급가속 — 블랙홀 느낌
          p.hx += (dx / d) * pull * dt;
          p.hy += (dy / d) * pull * dt;
        } else {
          p.hx *= 1 + 0.02 * dt;
          p.hy *= 1 + 0.02 * dt;
        }
        p.x += p.hx * dt;
        p.y += p.hy * dt;
        const near = phase.v === "in" ? clamp(1 - Math.hypot(CX - p.x, CY - p.y) / 420, 0.15, 1) : 0.8;
        c.fillStyle = `rgba(${p.col},${near})`;
        c.fillRect(p.x, p.y, p.size, p.size);
      }
      c.restore();
      return t < 260;
    });

    await sleep(780);
    if (!alive(tok)) return;

    // 폭발 — 반전
    sfx.impact();
    sfx.chime();
    flash(560, "#fff", 1);
    shake(560, 14);
    ring(CX, CY, 20, 700, 900, "rgba(255,255,255,.85)", 6);
    ring(CX, CY, 20, 460, 700, "rgba(194,160,104,.8)", 3);
    for (const p of ps) {
      const a = Math.atan2(p.y - CY, p.x - CX) + rnd(-0.3, 0.3);
      const sp = rnd(4, 15);
      p.hx = Math.cos(a) * sp;
      p.hy = Math.sin(a) * sp;
    }
    phase.v = "out";
    banner("개 벽", "GENESIS", 1600);

    // 새 판 배분
    await sleep(420);
    if (!alive(tok)) return;
    buildStage();
    for (const [i, el] of [...S.stage.querySelectorAll(".tf")].entries()) {
      anim(el, [
        { opacity: 0, transform: "scale(.2)", filter: "brightness(3)" },
        { opacity: 1, transform: "scale(1)", filter: "brightness(1)" },
      ], { duration: 420, delay: i * 6, easing: EASE });
    }
    await sleep(1500);
  },
});

def({
  id: "giant_god",
  name: "마작의 거신병",
  tier: "prism",
  fam: "캔버스 입자",
  tag: "거신이 일어서고 빛의 기둥이 판을 관통한다",
  tech:
    "<b>SVG 실루엣 + drop-shadow 발광</b>, 눈으로 <b>수렴하는 입자</b>, additive 그라디언트로 그린 <b>빔 기둥</b>. " +
    "예고(재) → 등장 → 충전 → 발사 → 여운의 5단 구성 — 강한 연출은 길이가 아니라 <b>단계</b>로 무게를 만든다.",
  async run(tok) {
    const dark = veil("brightness(.42) saturate(.6) contrast(1.1)", 620);
    sfx.riser(1.6);

    // 예고 — 재가 먼저 흩날린다
    const ash = [];
    for (let i = 0; i < 90; i++) {
      ash.push({ x: rnd(0, 1000), y: rnd(-300, 625), s: rnd(0.7, 2.1), vy: rnd(0.25, 0.8), ph: rnd(0, 6.3) });
    }
    let at = 0;
    drawHooks.add((dt, c) => {
      at += dt;
      for (const p of ash) {
        p.y += p.vy * dt;
        p.x += Math.sin(at * 0.02 + p.ph) * 0.35 * dt;
        if (p.y > 640) {
          p.y = -10;
          p.x = rnd(0, 1000);
        }
        c.fillStyle = `rgba(220,205,180,${0.16 + p.s * 0.1})`;
        c.fillRect(p.x, p.y, p.s, p.s);
      }
      return true;
    });

    // 거신 실루엣 — 어깨가 크고 머리가 작은 거체
    const sv = mkSvg({ zIndex: "1" });
    const g = svgEl("g", {}, sv);
    svgEl("path", {
      d: "M500 40 C452 40 430 74 430 112 C398 122 372 150 358 196 C340 254 336 320 340 400 L300 470 L368 452 L392 560 L430 470 L500 500 L570 470 L608 560 L632 452 L700 470 L660 400 C664 320 660 254 642 196 C628 150 602 122 570 112 C570 74 548 40 500 40 Z",
      fill: "#050b12",
    }, g);
    const eye = svgEl("ellipse", { cx: 500, cy: 104, rx: 32, ry: 5, fill: "#ff5a3c" }, g);
    g.style.filter = "drop-shadow(0 0 26px rgba(255,90,60,.55))";
    anim(g, [
      { transform: "translateY(300px) scale(.9)", opacity: 0 },
      { transform: "translateY(0px) scale(1)", opacity: 0.94 },
    ], { duration: 1500, easing: "cubic-bezier(.25,.8,.2,1)" });
    anim(eye, [{ opacity: 0.25, rx: 20 }, { opacity: 1, rx: 34 }], { duration: 1400, easing: "ease-in" });
    await sleep(1300);
    if (!alive(tok)) return;

    // 충전 — 입자가 눈으로 수렴
    const chg = [];
    for (let i = 0; i < 140; i++) {
      const a = rnd(0, 6.283);
      const d = rnd(160, 520);
      chg.push({ x: 500 + Math.cos(a) * d, y: 104 + Math.sin(a) * d * 0.7, k: rnd(0.02, 0.06) });
    }
    let ct = 0;
    drawHooks.add((dt, c) => {
      ct += dt;
      c.save();
      c.globalCompositeOperation = "lighter";
      for (const p of chg) {
        p.x += (500 - p.x) * p.k * dt;
        p.y += (104 - p.y) * p.k * dt;
        c.fillStyle = "rgba(255,150,90,.8)";
        c.fillRect(p.x, p.y, 2.4, 2.4);
      }
      c.restore();
      return ct < 70;
    });
    sfx.riser(0.9);
    await sleep(820);
    if (!alive(tok)) return;

    // 발사
    sfx.beam();
    flash(240, "#fff", 1);
    shake(1200, 22);
    const beam = { life: 0 };
    drawHooks.add((dt, c) => {
      beam.life += dt;
      const p = beam.life / 78;
      // 순간 확장 후 서서히 수축
      const base = p < 0.1 ? p * 10 * 150 : 150 * (1 - Math.pow(clamp((p - 0.1) / 0.9, 0, 1), 2.2));
      const w = Math.max(0, base) * rnd(0.94, 1.06); // 지글거림
      c.save();
      c.globalCompositeOperation = "lighter";
      const grd = c.createLinearGradient(500 - w, 0, 500 + w, 0);
      grd.addColorStop(0, "rgba(255,120,60,0)");
      grd.addColorStop(0.34, "rgba(255,150,80,.55)");
      grd.addColorStop(0.5, "rgba(255,255,255,.95)");
      grd.addColorStop(0.66, "rgba(255,150,80,.55)");
      grd.addColorStop(1, "rgba(255,120,60,0)");
      c.fillStyle = grd;
      c.fillRect(500 - w, 60, w * 2, 620);
      // 착탄 블룸
      const b = c.createRadialGradient(500, 560, 0, 500, 560, Math.max(1, w * 2.4));
      b.addColorStop(0, "rgba(255,240,210,.85)");
      b.addColorStop(1, "rgba(255,120,60,0)");
      c.fillStyle = b;
      c.fillRect(0, 380, 1000, 245);
      c.restore();
      return beam.life < 82;
    });
    banner("거 신 병", "COLOSSUS", 1700);

    await sleep(300);
    if (!alive(tok)) return;
    const scorch = mk(null, {
      position: "absolute", left: "500px", top: "560px",
      width: "460px", height: "150px", margin: "-75px 0 0 -230px", borderRadius: "50%",
      background: "radial-gradient(ellipse, rgba(20,8,4,.75), rgba(20,8,4,0) 70%)",
    });
    anim(scorch, [{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
    await sleep(900);
    if (!alive(tok)) return;
    anim(g, [{ opacity: 0.94 }, { opacity: 0 }], { duration: 900 });
    anim(dark, [{ opacity: 1 }, { opacity: 0 }], { duration: 1000 });
    await sleep(1100);
  },
});

def({
  id: "jackpot",
  name: "일확천금",
  tier: "prism",
  fam: "캔버스 입자",
  tag: "슬롯 릴이 돌고 동전이 쏟아진다",
  tech:
    "<b>릴 감속 이징</b>(각 릴을 다른 길이로 멈춰 긴장을 계단식으로 쌓는다) + <b>동전 물리</b>(중력·바닥 반발·마찰) + " +
    "<b>숫자 롤업</b>. 점수가 실제로 올라가야 '땄다'가 몸에 남는다.",
  async run(tok) {
    const panel = mk(null, {
      position: "absolute", left: "500px", top: "268px",
      width: "300px", height: "132px", margin: "-66px 0 0 -150px", borderRadius: "12px",
      background: "linear-gradient(165deg,#152119,#0d1712)",
      border: "2px solid #9a7b42", boxShadow: "0 14px 40px rgba(0,0,0,.6)",
      display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
      overflow: "hidden",
    });
    anim(panel, [
      { transform: "scale(.5) rotate(-6deg)", opacity: 0 },
      { transform: "scale(1) rotate(0)", opacity: 1 },
    ], { duration: 340, easing: EASE });
    sfx.ping(700);
    await sleep(340);
    if (!alive(tok)) return;

    // 릴 3개 — 마지막 칸이 당첨패
    const winner = pick(NUM_CODES);
    const spins = [];
    for (let r = 0; r < 3; r++) {
      const win = mk(null, {
        position: "relative", width: "62px", height: "84px", borderRadius: "7px",
        background: "#0a1210", border: "1px solid rgba(154,123,66,.5)", overflow: "hidden",
      }, panel);
      const strip = mk(null, {
        position: "absolute", left: "0", top: "0", width: "100%",
        display: "flex", flexDirection: "column", alignItems: "center",
      }, win);
      const seq = [];
      for (let i = 0; i < 16; i++) seq.push(pick(NUM_CODES));
      seq.push(winner);
      for (const code of seq) {
        const cell = mk(null, { width: "62px", height: "84px", display: "grid", placeItems: "center", flex: "none" }, strip);
        const t = tileEl(code);
        t.style.setProperty("--tile-w", "48px");
        t.style.setProperty("--tile-h", "64px");
        cell.appendChild(t);
      }
      const ms = 900 + r * 420;
      anim(strip, [
        { filter: "blur(0px)" },
        { filter: "blur(3.5px)", offset: 0.1 },
        { filter: "blur(3.5px)", offset: 0.8 },
        { filter: "blur(0px)" },
      ], { duration: ms });
      spins.push(anim(strip, [
        { transform: "translateY(0px)" },
        { transform: `translateY(${-(seq.length - 1) * 84}px)` },
      ], { duration: ms, easing: "cubic-bezier(.12,.62,.16,1)" }));
    }
    sfx.whoosh(1.6);
    for (const [i, sp] of spins.entries()) {
      sp.finished.then(() => {
        if (!alive(tok)) return;
        sfx.clack(600 + i * 300);
        flash(120, "#dcc79a", 0.2);
      }).catch(() => {});
    }
    await sleep(1900);
    if (!alive(tok)) return;

    // 당첨
    sfx.impact();
    sfx.chime();
    shake(500, 10);
    flash(300, "#dcc79a", 0.75);
    ring(500, 300, 40, 620, 900, "rgba(194,160,104,.85)", 5);
    anim(panel, [
      { transform: "scale(1)", boxShadow: "0 14px 40px rgba(0,0,0,.6)" },
      { transform: "scale(1.12)", boxShadow: "0 0 60px rgba(194,160,104,.9)", offset: 0.3 },
      { transform: "scale(1)", boxShadow: "0 0 30px rgba(194,160,104,.5)" },
    ], { duration: 700 });
    banner("일확천금", "JACKPOT", 1800);

    // 동전 — 중력 + 바닥 반발
    const coins = [];
    for (let i = 0; i < 130; i++) {
      coins.push({
        x: 500 + rnd(-140, 140), y: 300 + rnd(-40, 20),
        vx: rnd(-6, 6), vy: rnd(-13, -3),
        r: rnd(5, 10), rot: rnd(0, 6.3), vr: rnd(-0.3, 0.3), born: rnd(0, 40),
      });
    }
    let t = 0;
    drawHooks.add((dt, c) => {
      t += dt;
      for (const o of coins) {
        if (t < o.born) continue;
        o.vy += 0.72 * dt;
        o.x += o.vx * dt;
        o.y += o.vy * dt;
        o.rot += o.vr * dt;
        if (o.y > 600 - o.r) {
          o.y = 600 - o.r;
          if (Math.abs(o.vy) > 1.2) {
            o.vy *= -0.42;
            sfx.coin();
          } else {
            o.vy = 0;
          }
          o.vx *= 0.86;
          o.vr *= 0.7;
        }
        c.save();
        c.translate(o.x, o.y);
        c.rotate(o.rot);
        // 회전하는 원판처럼 — 세로를 눌러 두께감을 만든다
        c.scale(1, Math.abs(Math.cos(o.rot * 0.6)) * 0.6 + 0.4);
        const grd = c.createLinearGradient(-o.r, -o.r, o.r, o.r);
        grd.addColorStop(0, "#e6d5ae");
        grd.addColorStop(0.5, "#c2a068");
        grd.addColorStop(1, "#6f5526");
        c.fillStyle = grd;
        c.beginPath();
        c.arc(0, 0, o.r, 0, 6.284);
        c.fill();
        c.strokeStyle = "rgba(255,248,214,.8)";
        c.lineWidth = 1;
        c.stroke();
        c.restore();
      }
      return t < 240;
    });

    // 점수 롤업
    const from = 25000;
    const to = 96700;
    const t0 = performance.now();
    const roll = () => {
      if (!alive(tok)) return;
      const p = clamp((performance.now() - t0) / 1400, 0, 1);
      S.csBottom.textContent = String(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(roll);
    };
    roll();
    anim(S.csBottom, [
      { transform: "translateX(-50%) scale(1)", color: "#c2a068" },
      { transform: "translateX(-50%) scale(1.5)", color: "#fff", offset: 0.5 },
      { transform: "translateX(-50%) scale(1)", color: "#c2a068" },
    ], { duration: 1500 });
    await sleep(2200);
    if (!alive(tok)) return;
    anim(panel, [
      { opacity: 1, transform: "scale(1)" },
      { opacity: 0, transform: "scale(.7)" },
    ], { duration: 400 });
    await sleep(500);
  },
});

/* ══════════════════ 기법군 C · 마스크 · 스캔 ══════════════════ */

def({
  id: "xray_hand",
  name: "투시",
  tier: "gold",
  fam: "마스크 · 스캔",
  tag: "스캔 바가 지나간 자리에 상대 손패가 드러난다",
  tech:
    "상대 손패 위에 <b>네거티브 필터를 씌운 사본 레이어</b>를 만들고 <b>clip-path inset</b>을 밀어 지나간 자리만 남긴다. " +
    "타일마다 mask 를 애니메이션하는 것보다 안정적이고 합성이 한 번에 끝난다.",
  async run(tok) {
    const backs = [...S.oppTop.querySelectorAll(".tf")];
    const hidden = plausibleHand();
    const tr = sRect(S.oppTop);
    const pad = 12;

    // HUD 프레임 + 코너 브래킷
    const frame = mk(null, {
      position: "absolute", left: `${tr.x - pad}px`, top: `${tr.y - pad}px`,
      width: `${tr.w + pad * 2}px`, height: `${tr.h + pad * 2}px`,
      border: "1px solid rgba(110,225,255,.55)", borderRadius: "4px",
      boxShadow: "0 0 24px rgba(110,225,255,.25), inset 0 0 24px rgba(110,225,255,.12)",
    });
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      mk(null, {
        position: "absolute",
        left: dx ? "auto" : "-1px", right: dx ? "-1px" : "auto",
        top: dy ? "auto" : "-1px", bottom: dy ? "-1px" : "auto",
        width: "14px", height: "14px",
        borderTop: dy ? "none" : "2px solid #6ee1ff",
        borderBottom: dy ? "2px solid #6ee1ff" : "none",
        borderLeft: dx ? "none" : "2px solid #6ee1ff",
        borderRight: dx ? "2px solid #6ee1ff" : "none",
      }, frame);
    }
    const label = mk(null, {
      position: "absolute", left: `${tr.x - pad}px`, top: `${tr.y + tr.h + pad + 6}px`,
      font: "700 11px/1 ui-monospace, monospace", letterSpacing: "3px", color: "#6ee1ff",
    });
    label.textContent = "透視 · SCANNING";
    anim(frame, [{ opacity: 0, transform: "scale(1.15)" }, { opacity: 1, transform: "scale(1)" }], { duration: 300 });
    anim(label, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 120 });
    sfx.ping(1900);
    await sleep(400);
    if (!alive(tok)) return;

    // 네거티브 사본 레이어 — 상대 손패와 같은 좌표에 배치
    const xr = mk(null, { position: "absolute", inset: "0", clipPath: "inset(0% 100% 0% 0%)" });
    for (const [i, b] of backs.entries()) {
      const r = sRect(b);
      const t = tileEl(hidden[i % hidden.length]);
      Object.assign(t.style, {
        position: "absolute", left: `${r.x}px`, top: `${r.y}px`,
        filter: "invert(1) sepia(1) hue-rotate(150deg) saturate(5) brightness(1.15)",
        transform: "rotate(180deg)",
        boxShadow: "0 0 12px rgba(110,225,255,.7)",
      });
      t.style.setProperty("--tile-w", `${r.w}px`);
      t.style.setProperty("--tile-h", `${r.h}px`);
      xr.appendChild(t);
    }
    // 주사선 텍스처
    mk(null, {
      position: "absolute", left: `${tr.x}px`, top: `${tr.y}px`,
      width: `${tr.w}px`, height: `${tr.h}px`,
      background: "repeating-linear-gradient(0deg, rgba(110,225,255,.22) 0 1px, transparent 1px 3px)",
      mixBlendMode: "screen",
    }, xr);

    // 진행하는 밝은 스캔 바
    const bar = mk(null, {
      position: "absolute", left: `${tr.x}px`, top: `${tr.y - pad}px`,
      width: "5px", height: `${tr.h + pad * 2}px`,
      background: "linear-gradient(180deg, transparent, #cffaff 20%, #fff 50%, #cffaff 80%, transparent)",
      boxShadow: "0 0 20px 6px rgba(110,225,255,.8)",
    });

    anim(xr, [{ clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)" }], {
      duration: 900, easing: "linear",
    });
    anim(bar, [{ transform: "translateX(0)" }, { transform: `translateX(${tr.w}px)` }], { duration: 900, easing: "linear" });
    sfx.whoosh(0.9);
    for (let i = 0; i < backs.length; i++) {
      later(() => alive(tok) && sfx.ping(2200 + i * 40), (i * 900) / backs.length);
    }
    await sleep(980);
    if (!alive(tok)) return;

    label.textContent = "透視 · 13 TILES READ";
    anim(label, [{ color: "#6ee1ff" }, { color: "#fff" }, { color: "#6ee1ff" }], { duration: 400, iterations: 2 });
    anim(bar, [{ opacity: 1 }, { opacity: 0 }], { duration: 200 });
    await sleep(1300);
    if (!alive(tok)) return;
    for (const el of [xr, frame, label]) anim(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 600 });
    await sleep(700);
  },
});

def({
  id: "tenpai_scan",
  name: "천리안",
  tier: "prism",
  fam: "마스크 · 스캔",
  tag: "레이더가 회전하며 텐파이한 상대에 핑을 띄운다",
  tech:
    "<b>conic-gradient 회전</b> 스윕 + 좌석별 <b>핑 링</b>. 스윕 각도와 좌석 각도를 맞춰 " +
    "'지나갈 때 감지된다'는 인과를 만드는 게 요령 — 동시에 다 뜨면 정보가 아니라 장식이 된다.",
  async run(tok) {
    const dark = veil("brightness(.6) saturate(.5)", 300);
    const R = 250;
    const radar = mk(null, {
      position: "absolute", left: "500px", top: "312px",
      width: `${R * 2}px`, height: `${R * 2}px`, margin: `${-R}px 0 0 ${-R}px`,
      borderRadius: "50%", border: "1px solid rgba(110,225,255,.35)",
      background: "radial-gradient(circle, rgba(110,225,255,.05) 0%, transparent 70%)",
    });
    for (const f of [0.34, 0.67, 1]) {
      mk(null, {
        position: "absolute", left: "50%", top: "50%",
        width: `${R * 2 * f}px`, height: `${R * 2 * f}px`, margin: `${-R * f}px 0 0 ${-R * f}px`,
        border: "1px solid rgba(110,225,255,.18)", borderRadius: "50%",
      }, radar);
    }
    for (const rot of [0, 90]) {
      mk(null, {
        position: "absolute", left: "50%", top: "50%", width: `${R * 2}px`, height: "1px",
        margin: `0 0 0 ${-R}px`, background: "rgba(110,225,255,.16)", transform: `rotate(${rot}deg)`,
      }, radar);
    }
    const sweep = mk(null, {
      position: "absolute", inset: "0", borderRadius: "50%",
      background:
        "conic-gradient(from 0deg, rgba(110,225,255,.42) 0deg, rgba(110,225,255,.12) 26deg, transparent 60deg)",
    }, radar);
    anim(radar, [
      { opacity: 0, transform: "scale(.7)" },
      { opacity: 1, transform: "scale(1)" },
    ], { duration: 340, easing: EASE });
    anim(sweep, [{ transform: "rotate(0deg)" }, { transform: "rotate(720deg)" }], { duration: 3000, easing: "linear" });
    sfx.ping(1200);

    const readout = mk(null, {
      position: "absolute", left: "20px", top: "150px", width: "218px",
      font: "600 11px/1.7 ui-monospace, monospace", color: "#6ee1ff", letterSpacing: "1px",
    });

    // 스윕이 좌석 각도를 지나가는 순간에 감지된다
    const seats = [
      { el: S.oppRight, deg: 45, tenpai: true, wait: "대기 3종 · 456p" },
      { el: S.oppTop, deg: 135, tenpai: false, wait: "" },
      { el: S.oppLeft, deg: 225, tenpai: true, wait: "대기 1종 · 7s 단기" },
    ];
    for (const s of seats) {
      later(() => {
        if (!alive(tok)) return;
        const r = sRect(s.el);
        const col = s.tenpai ? "rgba(255,120,130,.95)" : "rgba(110,225,255,.7)";
        ring(r.cx, r.cy, 16, s.tenpai ? 130 : 70, s.tenpai ? 720 : 460, col, s.tenpai ? 3 : 2);
        if (s.tenpai) ring(r.cx, r.cy, 16, 96, 900, col, 2);
        sfx.ping(s.tenpai ? 2400 : 900);

        const tag = mk(null, {
          position: "absolute",
          left: `${clamp(r.cx - 60, 6, 880)}px`,
          top: `${r.cy + (s.el === S.oppTop ? 42 : -34)}px`,
          padding: "3px 8px", borderRadius: "5px",
          background: s.tenpai ? "rgba(120,20,32,.9)" : "rgba(8,26,40,.9)",
          border: `1px solid ${col}`,
          font: "800 11px/1 ui-monospace, monospace", letterSpacing: "2px",
          color: s.tenpai ? "#ffd0d4" : "#8fd8ea", whiteSpace: "nowrap",
        });
        tag.textContent = s.tenpai ? "텐파이" : "노텐";
        anim(tag, [
          { opacity: 0, transform: "scale(.6)" },
          { opacity: 1, transform: "scale(1)" },
        ], { duration: 240, easing: EASE });

        const line = document.createElement("div");
        line.textContent = s.tenpai ? `▸ 좌석 감지 · ${s.wait}` : "▸ 좌석 무반응 · 노텐";
        line.style.color = s.tenpai ? "#ff9aa4" : "#4d7d92";
        readout.appendChild(line);
        anim(line, [
          { opacity: 0, transform: "translateX(-10px)" },
          { opacity: 1, transform: "translateX(0)" },
        ], { duration: 220 });
      }, (s.deg / 720) * 3000 + 60);
    }

    await sleep(3200);
    if (!alive(tok)) return;
    banner("천 리 안", "TENPAI SCAN · 2 DETECTED", 1500);
    await sleep(1400);
    anim(radar, [{ opacity: 1 }, { opacity: 0 }], { duration: 400 });
    anim(dark, [{ opacity: 1 }, { opacity: 0 }], { duration: 400 });
    await sleep(500);
  },
});

def({
  id: "spy",
  name: "스파이",
  tier: "prism",
  fam: "마스크 · 스캔",
  tag: "패 1종을 몰래 찍는다 — 나만 보이는 표식",
  tech:
    "<b>SVG 레티클</b>이 좁혀 들어오며 락온. 비밀 정보라는 걸 <b>구멍 뚫린 마스크 비네트</b>와 " +
    "'나에게만 보임' 워터마크로 표현 — <b>정보 비대칭</b>을 화면 언어로 옮기는 예.",
  async run(tok) {
    const tiles = handTiles();
    const target = tiles[(Math.random() * 13) | 0];
    const r = sRect(target);

    const dark = veil(
      "brightness(.5) saturate(.7)",
      320,
      `radial-gradient(circle at ${r.cx}px ${r.cy}px, transparent 0 44px, black 120px)`,
    );
    sfx.whoosh(0.4);

    // 레티클 — 넓게 시작해서 조인다
    const sv = mkSvg({ zIndex: "5" });
    const g = svgEl("g", {}, sv);
    const c1 = svgEl("circle", { cx: r.cx, cy: r.cy, r: 130, fill: "none", stroke: "#ff5a6a", "stroke-width": 1.5, "stroke-dasharray": "10 8" }, sv);
    svgEl("circle", { cx: r.cx, cy: r.cy, r: 96, fill: "none", stroke: "#ff5a6a", "stroke-width": 1, opacity: 0.5 }, g);
    for (const [x1, y1, x2, y2] of [[-150, 0, -34, 0], [150, 0, 34, 0], [0, -150, 0, -40], [0, 150, 0, 40]]) {
      svgEl("line", {
        x1: r.cx + x1, y1: r.cy + y1, x2: r.cx + x2, y2: r.cy + y2,
        stroke: "#ff5a6a", "stroke-width": 1.5, opacity: 0.85,
      }, g);
    }
    c1.style.transformOrigin = `${r.cx}px ${r.cy}px`;
    sv.style.transformOrigin = `${r.cx}px ${r.cy}px`;
    anim(sv, [
      { transform: "scale(2.4) rotate(-40deg)", opacity: 0 },
      { transform: "scale(1) rotate(0deg)", opacity: 1 },
    ], { duration: 620, easing: "cubic-bezier(.15,.85,.2,1)" });
    anim(c1, [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], {
      duration: 4000, iterations: Infinity, easing: "linear",
    });
    for (let i = 0; i < 3; i++) later(() => alive(tok) && sfx.ping(700 + i * 220), i * 170);
    await sleep(700);
    if (!alive(tok)) return;

    // 락온
    sfx.clack(420);
    flash(140, "#ff5a6a", 0.22);
    ring(r.cx, r.cy, 20, 90, 420, "rgba(255,90,106,.95)", 2);
    target.style.zIndex = "20";
    target.style.boxShadow = "0 0 26px rgba(255,90,106,.9)";
    anim(target, [
      { transform: "scale(1)" },
      { transform: "scale(1.34) translateY(-10px)", offset: 0.4 },
      { transform: "scale(1.24) translateY(-8px)" },
    ], { duration: 500, easing: EASE });

    // 표식 낙인
    const mark = mk(null, {
      position: "absolute", left: `${r.cx}px`, top: `${r.cy - 46}px`,
      transform: "translate(-50%,-50%)",
      font: "900 26px/1 ui-monospace, monospace", color: "#ff5a6a",
      textShadow: "0 0 18px rgba(255,90,106,.8)",
    });
    mark.textContent = "✕";
    anim(mark, [
      { transform: "translate(-50%,-50%) scale(3.4) rotate(-30deg)", opacity: 0 },
      { transform: "translate(-50%,-50%) scale(1) rotate(0deg)", opacity: 1 },
    ], { duration: 260, easing: EASE });

    // "나만 보인다" 워터마크
    const wm = mk(null, {
      position: "absolute", left: "50%", top: "78px", transform: "translateX(-50%)",
      padding: "6px 16px", borderRadius: "999px",
      border: "1px dashed rgba(255,90,106,.6)", background: "rgba(40,8,14,.7)",
      font: "800 12px/1 ui-monospace, monospace", letterSpacing: "4px", color: "#ff9aa4",
    });
    wm.textContent = "SECRET · 나에게만 보임";
    anim(wm, [
      { opacity: 0, transform: "translateX(-50%) translateY(-12px)" },
      { opacity: 1, transform: "translateX(-50%) translateY(0)" },
    ], { duration: 340, delay: 120 });
    banner("스 파 이", "MARK PLACED", 1500);
    await sleep(1900);
    if (!alive(tok)) return;
    for (const el of [sv, wm, mark, dark]) anim(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 420 });
    anim(target, [
      { transform: "scale(1.24) translateY(-8px)" },
      { transform: "scale(1) translateY(0)" },
    ], { duration: 400 });
    await sleep(520);
  },
});

/* ══════════════════ 기법군 D · SVG 필터 · 텍스처 ══════════════════ */

def({
  id: "tile_dyeing",
  name: "염색",
  tier: "gold",
  fam: "SVG 필터",
  tag: "잉크가 떨어져 손패 색이 번져 물든다",
  tech:
    "<b>feTurbulence + feDisplacementMap</b>으로 경계를 찢은 <b>clip-path circle 번짐</b>. " +
    "번짐이 도착한 타일은 <b>실제로 이미지가 교체된다</b> — 연출과 상태 변화가 같은 타임라인에 붙어야 납득이 된다.",
  async run(tok) {
    const tiles = handTiles().slice(0, 13);
    const ir = sRect(tiles[4]);

    // 1) 잉크 방울 낙하
    const drop = mk(null, {
      position: "absolute", left: `${ir.cx}px`, top: "-30px",
      width: "20px", height: "26px", margin: "0 0 0 -10px",
      borderRadius: "50% 50% 46% 46%",
      background: "radial-gradient(circle at 35% 30%, #7fd4ff, #1d7fd6 60%, #10508c)",
      boxShadow: "0 0 14px rgba(60,160,240,.7)",
    });
    anim(drop, [
      { transform: "translateY(0) scaleY(.8)", opacity: 0 },
      { transform: `translateY(${ir.cy - 20}px) scaleY(1.5)`, opacity: 1, offset: 0.85 },
      { transform: `translateY(${ir.cy}px) scale(1.6,.4)`, opacity: 1 },
    ], { duration: 480, easing: "cubic-bezier(.5,0,.9,.6)" });
    sfx.whoosh(0.45);
    await sleep(490);
    if (!alive(tok)) return;

    // 착탄 스플래시
    drop.remove();
    sfx.drip();
    ring(ir.cx, ir.cy, 8, 76, 520, "rgba(90,180,250,.8)", 3);
    flash(140, "#3aa0f0", 0.18);
    for (let i = 0; i < 12; i++) {
      const a = rnd(0, 6.283);
      const d = rnd(20, 66);
      const sp = mk(null, {
        position: "absolute", left: `${ir.cx}px`, top: `${ir.cy}px`,
        width: `${rnd(3, 7)}px`, height: `${rnd(3, 7)}px`, borderRadius: "50%",
        background: "#2f8fd8", filter: "url(#fInk)",
      });
      anim(sp, [
        { transform: "translate(-50%,-50%) scale(1)", opacity: 0.9 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(.3)`, opacity: 0 },
      ], { duration: rnd(380, 640) }).finished.then(() => sp.remove()).catch(() => sp.remove());
    }

    // 2) 번짐 — 착탄 지점에서 좌우로 퍼진다
    for (const [i, el] of tiles.entries()) {
      const r = sRect(el);
      const delay = Math.abs(i - 4) * 110;
      const wash = mk(null, {
        position: "absolute", left: `${r.x - 6}px`, top: `${r.y - 6}px`,
        width: `${r.w + 12}px`, height: `${r.h + 12}px`,
        background: "#2f8fd8", borderRadius: "6px",
        filter: "url(#fInk)", mixBlendMode: "multiply",
        clipPath: "circle(0% at 50% 50%)",
      });
      // 번짐이 지나간 뒤에는 옅은 물든 자취만 남긴다 — 진하게 덮어두면 손패가 안 읽힌다
      anim(wash, [
        { clipPath: "circle(0% at 50% 50%)", opacity: 0.95, offset: 0 },
        { clipPath: "circle(85% at 50% 50%)", opacity: 0.62, offset: 0.55 },
        { clipPath: "circle(85% at 50% 50%)", opacity: 0.16, offset: 1 },
      ], { duration: 900, delay, easing: "cubic-bezier(.3,.7,.4,1)" });
      // 번짐이 도착하면 실제 패를 갈아끼운다 (같은 숫자, 통수패로)
      later(() => {
        if (!alive(tok)) return;
        const code = el.dataset.code || "";
        const rank = /^[1-9]/.test(code) ? code[0] : String(1 + ((Math.random() * 9) | 0));
        const next = `${rank}p`;
        el.dataset.code = next;
        const im = el.querySelector("img");
        if (im) im.src = `/tiles/${next}.png`;
        anim(el, [
          { transform: "scale(1)" },
          { transform: "scale(1.16) rotate(2deg)", offset: 0.4 },
          { transform: "scale(1)" },
        ], { duration: 320 });
        sfx.clack(rnd(1200, 1800));
      }, delay + 380);
    }
    sfx.riser(1.1);
    await sleep(1250);
    if (!alive(tok)) return;

    // 3) 젖은 광택 스윕
    const hr = sRect(S.myhand);
    const sheen = mk(null, {
      position: "absolute", left: `${hr.x - 40}px`, top: `${hr.y - 10}px`,
      width: `${hr.w + 80}px`, height: `${hr.h + 20}px`,
      background: "linear-gradient(100deg, transparent 44%, rgba(200,240,255,.75) 50%, transparent 56%)",
      mixBlendMode: "screen",
    });
    anim(sheen, [{ transform: "translateX(-110%)" }, { transform: "translateX(110%)" }], {
      duration: 700, easing: "ease-in-out",
    }).finished.then(() => sheen.remove()).catch(() => sheen.remove());
    banner("염 색", "SUIT DYED · 筒子", 1500);
    await sleep(1600);
  },
});

def({
  id: "tile_split",
  name: "분열",
  tier: "prism",
  fam: "SVG 필터",
  tag: "패 한 장이 세포분열해 두 장이 된다",
  tech:
    "<b>gooey 필터</b>(feGaussianBlur → feColorMatrix 알파 임계)로 두 덩어리 사이에 '목'을 만든다. " +
    "붙어 있다가 끊기는 이 유기적 분리는 CSS만으로는 만들 수 없다.",
  async run(tok) {
    const src = handTiles()[6];
    const r = sRect(src);
    const code = src.dataset.code || "1m";

    // 구물 레이어 — 실제 패 뒤에서 '점액'을 담당
    const sv = mkSvg({ zIndex: "3" });
    const gg = svgEl("g", { filter: "url(#fGoo)" }, sv);
    const bl = svgEl("rect", { x: r.x, y: r.y, width: r.w, height: r.h, rx: 8, fill: "#f8f5ec" }, gg);
    const br = svgEl("rect", { x: r.x, y: r.y, width: r.w, height: r.h, rx: 8, fill: "#f8f5ec" }, gg);

    src.style.opacity = "0";
    const mkCopy = () => {
      const t = tileEl(code);
      Object.assign(t.style, { position: "absolute", left: `${r.x}px`, top: `${r.y}px`, zIndex: "4" });
      t.style.setProperty("--tile-w", `${r.w}px`);
      t.style.setProperty("--tile-h", `${r.h}px`);
      S.fx.appendChild(t);
      return t;
    };
    const cl = mkCopy();
    const cr = mkCopy();
    cr.style.opacity = "0";

    // 1) 부풀고 진동 — 분열 예비
    sfx.riser(0.7);
    anim(cl, [
      { transform: "scale(1,1)" },
      { transform: "scale(1.18,.94)", offset: 0.5 },
      { transform: "scale(1.06,1.02)" },
    ], { duration: 460 });
    await sleep(520);
    if (!alive(tok)) return;

    // 2) 늘어나며 갈라진다 — 구물이 목을 만든다
    const SEP = 30;
    const EASE = "cubic-bezier(.35,.05,.3,1)";
    sfx.whoosh(0.6);
    // SVG 기하 속성(x) 대신 transform 으로 옮긴다 — 엔진별 지원 차이를 피한다
    anim(bl, [{ transform: "translateX(0)" }, { transform: `translateX(${-SEP}px)` }], { duration: 700, easing: EASE });
    anim(br, [{ transform: "translateX(0)" }, { transform: `translateX(${SEP}px)` }], { duration: 700, easing: EASE });
    cr.style.opacity = "1";
    anim(cl, [
      { transform: "translateX(0) scale(1.06,1.02)" },
      { transform: `translateX(${-SEP}px) scale(.98,1.03)`, offset: 0.7 },
      { transform: `translateX(${-SEP}px) scale(1,1)` },
    ], { duration: 700, easing: EASE });
    anim(cr, [
      { transform: "translateX(0) scale(1.06,1.02)", opacity: 0.2 },
      { transform: `translateX(${SEP}px) scale(.98,1.03)`, opacity: 1, offset: 0.7 },
      { transform: `translateX(${SEP}px) scale(1,1)`, opacity: 1 },
    ], { duration: 700, easing: EASE });
    await sleep(680);
    if (!alive(tok)) return;

    // 3) 끊어짐 — 스냅 + 반짝
    sfx.clack(1700);
    sfx.ping(2400);
    flash(120, "#fff", 0.3);
    ring(r.cx, r.cy, 10, 90, 420, "rgba(255,255,255,.7)", 2);
    anim(sv, [{ opacity: 1 }, { opacity: 0 }], { duration: 340 })
      .finished.then(() => sv.remove()).catch(() => sv.remove());
    for (const [i, el] of [cl, cr].entries()) {
      const dx = i ? SEP : -SEP;
      anim(el, [
        { transform: `translateX(${dx}px) scale(1)` },
        { transform: `translateX(${dx}px) scale(1.2,.86)`, offset: 0.3 },
        { transform: `translateX(${dx}px) scale(1)` },
      ], { duration: 420, easing: EASE });
    }
    for (let i = 0; i < 16; i++) {
      const a = rnd(0, 6.283);
      const d = rnd(30, 100);
      const s = mk(null, {
        position: "absolute", left: `${r.cx}px`, top: `${r.cy}px`,
        width: "3px", height: "3px", borderRadius: "50%",
        background: "#fff", boxShadow: "0 0 8px #fff",
      });
      anim(s, [
        { transform: "translate(-50%,-50%) scale(1)", opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(0)`, opacity: 0 },
      ], { duration: rnd(400, 700) }).finished.then(() => s.remove()).catch(() => s.remove());
    }
    banner("분 열", "TILE SPLIT · 14 TILES", 1500);

    // 4) 손패를 실제로 14장으로 되돌린다 — 갈라진 결과가 상태로 남아야 납득이 된다.
    //    flex 행이라 새 패를 끼우면 알아서 재배치된다.
    await sleep(620);
    if (!alive(tok)) return;
    const twin = tileEl(code);
    src.style.opacity = "1";
    src.after(twin);
    for (const el of [cl, cr]) {
      anim(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 220 })
        .finished.then(() => el.remove()).catch(() => el.remove());
    }
    // 새로 끼워진 두 장만 살짝 튕겨 어느 게 갈라진 패인지 알려준다
    for (const el of [src, twin]) {
      anim(el, [
        { transform: "translateY(0) scale(1)" },
        { transform: "translateY(-8px) scale(1.12)", offset: 0.4 },
        { transform: "translateY(0) scale(1)" },
      ], { duration: 380, easing: EASE_IMPACT });
    }
    sfx.clack(1500);
    await sleep(1000);
  },
});

def({
  id: "brief_fog",
  name: "박무",
  tier: "prism",
  fam: "SVG 필터",
  tag: "안개가 바닥을 덮어 버림패를 가린다",
  tech:
    "<b>애니메이션되는 feTurbulence</b> 3겹을 서로 다른 속도로 드리프트시키고, <b>backdrop-filter blur</b>로 " +
    "실제로 아래 패를 흐린다. 정적 텍스처와 달리 안개가 '살아 있게' 보인다.",
  async run(tok) {
    sfx.whoosh(1.4);
    const blur = mk(null, {
      position: "absolute", left: "50%", top: "50%",
      width: "520px", height: "300px", margin: "-150px 0 0 -260px", borderRadius: "16px",
      backdropFilter: "blur(0px) brightness(1)", webkitBackdropFilter: "blur(0px) brightness(1)",
      maskImage: "radial-gradient(ellipse at 50% 50%, black 40%, transparent 78%)",
      webkitMaskImage: "radial-gradient(ellipse at 50% 50%, black 40%, transparent 78%)",
    });
    anim(blur, [
      { backdropFilter: "blur(0px) brightness(1)" },
      { backdropFilter: "blur(7px) brightness(1.12)" },
    ], { duration: 1600 });

    // 안개 3겹 — 속도·크기를 다르게 해서 깊이를 만든다
    const layers = [];
    for (let i = 0; i < 3; i++) {
      const f = mk(null, {
        position: "absolute", left: "-30%", top: `${28 + i * 8}%`,
        width: "160%", height: `${34 + i * 10}%`,
        // 필터가 SourceGraphic 을 참조하므로 채울 내용이 필요하다
        background: "rgba(255,255,255,.9)",
        filter: "url(#fFog)", mixBlendMode: "screen", opacity: "0",
      });
      layers.push(f);
      anim(f, [{ opacity: 0 }, { opacity: 0.5 - i * 0.1 }], { duration: 1400, delay: i * 180 });
      anim(f, [
        { transform: `translateX(${-6 - i * 4}%) scale(${1 + i * 0.15})` },
        { transform: `translateX(${6 + i * 4}%) scale(${1 + i * 0.15})` },
      ], { duration: 9000 + i * 3000, direction: "alternate", iterations: Infinity, easing: "ease-in-out" });
    }
    banner("박 무", "RIVER OBSCURED", 1600);
    await sleep(2400);
    if (!alive(tok)) return;

    // 걷힌다
    sfx.whoosh(1.2);
    for (const [i, f] of layers.entries()) {
      anim(f, [{ opacity: 0.5 - i * 0.1 }, { opacity: 0 }], { duration: 1200, delay: i * 120 });
    }
    anim(blur, [
      { backdropFilter: "blur(7px) brightness(1.12)" },
      { backdropFilter: "blur(0px) brightness(1)" },
    ], { duration: 1200 });
    await sleep(1400);
  },
});

/* ══════════════════ 기법군 E · 파괴 · 임팩트 ══════════════════ */

def({
  id: "disarm",
  name: "무장해제",
  tier: "prism",
  fam: "파괴 · 임팩트",
  tag: "상대 증강 카드가 금이 가고 부서져 잠긴다",
  tech:
    "카드를 <b>N개 복제</b>해 사본마다 <b>clip-path polygon 파편</b>을 물린다(충돌점에서 방사하는 삼각 팬). " +
    "균열은 <b>stroke-dashoffset</b>으로 그린다 — DOM만으로 유리 파괴를 만드는 방법.",
  async run(tok) {
    const card = S.augSlot.querySelector(".augcard.prism") || S.augSlot.querySelector(".augcard");
    const r = sRect(card);
    const cx = r.w * 0.44;
    const cy = r.h * 0.36;

    // 조준
    const dark = veil(
      "brightness(.55) saturate(.6)",
      300,
      `radial-gradient(ellipse at ${r.cx}px ${r.cy}px, transparent 0 90px, black 190px)`,
    );
    const box = mk(null, {
      position: "absolute", left: `${r.x - 8}px`, top: `${r.y - 8}px`,
      width: `${r.w + 16}px`, height: `${r.h + 16}px`,
      border: "2px solid rgba(255,90,106,.9)", borderRadius: "10px",
    });
    anim(box, [{ opacity: 0, transform: "scale(1.5)" }, { opacity: 1, transform: "scale(1)" }], { duration: 300 });
    for (let i = 0; i < 3; i++) later(() => alive(tok) && sfx.ping(1400 - i * 300), i * 130);
    await sleep(540);
    if (!alive(tok)) return;

    // 타격 — 색이 빠지고 균열이 그려진다
    sfx.impact();
    shake(420, 12);
    flash(120, "#fff", 0.5);
    anim(card, [
      { filter: "saturate(1) brightness(1)" },
      { filter: "saturate(0) brightness(.7)" },
    ], { duration: 260 });

    const sv = mkSvg({ zIndex: "6" });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * 6.283 + rnd(-0.2, 0.2);
      let x = r.x + cx;
      let y = r.y + cy;
      let d = `M${x.toFixed(1)} ${y.toFixed(1)}`;
      for (let k = 0; k < 3; k++) {
        x += Math.cos(a + rnd(-0.5, 0.5)) * rnd(14, 30);
        y += Math.sin(a + rnd(-0.5, 0.5)) * rnd(14, 30);
        d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      const p = svgEl("path", {
        d, fill: "none", stroke: "rgba(255,255,255,.95)", "stroke-width": 1.4,
        "stroke-dasharray": 140, "stroke-dashoffset": 140,
      }, sv);
      anim(p, [{ strokeDashoffset: 140 }, { strokeDashoffset: 0 }], { duration: 220, delay: i * 14 });
    }
    sfx.shatter();
    await sleep(440);
    if (!alive(tok)) return;

    // 파편화 — 충돌점에서 방사하는 삼각 팬으로 카드를 조각낸다
    const N = 14;
    const pts = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * 6.283 - 1.57;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      // 카드 경계(여유 30px)와 만나는 지점까지 레이캐스트
      const t = Math.min(
        Math.abs(dx) < 1e-6 ? 1e9 : (dx > 0 ? r.w + 30 - cx : -cx - 30) / dx,
        Math.abs(dy) < 1e-6 ? 1e9 : (dy > 0 ? r.h + 30 - cy : -cy - 30) / dy,
      );
      pts.push([cx + dx * t, cy + dy * t]);
    }
    sv.remove();
    card.style.visibility = "hidden";
    for (let i = 0; i < N; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % N];
      const shard = card.cloneNode(true);
      shard.style.visibility = "";
      Object.assign(shard.style, {
        position: "absolute", left: `${r.x}px`, top: `${r.y}px`,
        width: `${r.w}px`, height: `${r.h}px`, margin: "0",
        filter: "saturate(0) brightness(.75)",
        clipPath: `polygon(${cx}px ${cy}px, ${a[0]}px ${a[1]}px, ${b[0]}px ${b[1]}px)`,
      });
      S.fx.appendChild(shard);
      const ang = ((i + 0.5) / N) * 6.283 - 1.57;
      const dist = rnd(90, 230);
      anim(shard, [
        { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
        {
          transform: `translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist - 30}px) rotate(${rnd(-70, 70)}deg) scale(.7)`,
          opacity: 0,
        },
      ], { duration: rnd(620, 900), easing: "cubic-bezier(.2,.5,.3,1)" })
        .finished.then(() => shard.remove()).catch(() => shard.remove());
    }
    anim(box, [{ opacity: 1 }, { opacity: 0 }], { duration: 200 });
    ring(r.cx, r.cy, 14, 240, 620, "rgba(255,255,255,.7)", 3);
    await sleep(480);
    if (!alive(tok)) return;

    // 잠김 플레이트
    const lock = mk(null, {
      position: "absolute", left: `${r.x}px`, top: `${r.y}px`,
      width: `${r.w}px`, height: `${r.h}px`, borderRadius: "9px",
      background: "linear-gradient(165deg,#2a3038,#171b21)",
      border: "1px solid #4a5460", display: "grid", placeItems: "center",
      boxShadow: "0 8px 22px rgba(0,0,0,.6)",
    });
    lock.innerHTML =
      '<div style="font:800 30px/1 system-ui;color:#6b7684">🔒</div>' +
      '<div style="position:absolute;bottom:12px;font:800 10px/1 system-ui;letter-spacing:3px;color:#7f8a96">잠 김</div>';
    anim(lock, [
      { transform: "translateY(-40px) scale(1.3)", opacity: 0 },
      { transform: "translateY(0) scale(1)", opacity: 1, offset: 0.7 },
      { transform: "scale(1.06,.94)", offset: 0.85 },
      { transform: "scale(1)" },
    ], { duration: 460, easing: EASE });
    sfx.clack(300);
    shake(220, 6);
    banner("무 장 해 제", "AUGMENT DISARMED", 1600);
    await sleep(1700);
    anim(dark, [{ opacity: 1 }, { opacity: 0 }], { duration: 400 });
    await sleep(500);
  },
});

def({
  id: "blood_contract",
  name: "핏빛 계약",
  tier: "prism",
  fam: "파괴 · 임팩트",
  tag: "계약서에 낙관이 찍히고 피가 흘러내린다",
  tech:
    "<b>stroke-dashoffset 서명 필기</b> + 하드 이징 <b>낙관 슬램</b> + 높이가 자라는 <b>흘러내리는 핏방울</b>. " +
    "mix-blend-mode: multiply 로 종이에 스민 느낌을 낸다 — 덧대는 게 아니라 <b>배어드는</b> 게 포인트.",
  async run(tok) {
    const dark = veil("brightness(.45) saturate(.75) contrast(1.05)", 400);

    // 계약서
    const doc = mk(null, {
      position: "absolute", left: "500px", top: "300px",
      width: "270px", height: "330px", margin: "-165px 0 0 -135px", borderRadius: "3px",
      background: "linear-gradient(170deg,#efe6d0,#ddd0b4)",
      boxShadow: "0 20px 50px rgba(0,0,0,.65)", overflow: "hidden",
    });
    mk(null, {
      position: "absolute", inset: "0",
      background: "repeating-linear-gradient(0deg, rgba(120,95,60,.06) 0 1px, transparent 1px 4px)",
    }, doc);
    const title = mk(null, {
      position: "absolute", left: "0", right: "0", top: "26px", textAlign: "center",
      font: "900 24px/1 serif", letterSpacing: "12px", color: "#5a2020",
    }, doc);
    title.textContent = "契 約";
    for (let i = 0; i < 7; i++) {
      mk(null, {
        position: "absolute", left: "28px", top: `${78 + i * 19}px`,
        width: `${rnd(120, 210)}px`, height: "4px", borderRadius: "2px",
        background: "rgba(70,50,34,.32)",
      }, doc);
    }
    anim(doc, [
      { transform: "translateY(80px) rotate(-3deg) scale(.9)", opacity: 0 },
      { transform: "translateY(0) rotate(0) scale(1)", opacity: 1 },
    ], { duration: 480, easing: EASE });
    sfx.whoosh(0.5);
    await sleep(540);
    if (!alive(tok)) return;

    // 서명 필기
    const sv = mkSvg({ width: "270px", height: "330px" }, doc);
    sv.setAttribute("viewBox", "0 0 270 330");
    const sig = svgEl("path", {
      d: "M40 250 C64 216 76 268 98 238 C118 210 126 266 150 236 C172 208 182 262 208 232 C218 220 226 232 234 246",
      fill: "none", stroke: "#8a1420", "stroke-width": 3.4, "stroke-linecap": "round",
      "stroke-dasharray": 420, "stroke-dashoffset": 420,
    }, sv);
    anim(sig, [{ strokeDashoffset: 420 }, { strokeDashoffset: 0 }], {
      duration: 900, easing: "cubic-bezier(.4,0,.6,1)",
    });
    sfx.scratch(0.85);
    await sleep(1000);
    if (!alive(tok)) return;

    // 낙관 슬램
    const seal = mk(null, {
      position: "absolute", left: "196px", top: "254px", width: "62px", height: "62px",
      borderRadius: "6px", border: "4px solid #b21226", color: "#b21226",
      display: "grid", placeItems: "center", font: "900 26px/1 serif",
      background: "rgba(178,18,38,.1)", mixBlendMode: "multiply",
    }, doc);
    seal.textContent = "血";
    anim(seal, [
      { transform: "rotate(-8deg) scale(4.2)", opacity: 0 },
      { transform: "rotate(-8deg) scale(1)", opacity: 1, offset: 0.55 },
      { transform: "rotate(-8deg) scale(1.14)", offset: 0.7 },
      { transform: "rotate(-8deg) scale(1)" },
    ], { duration: 420, easing: "cubic-bezier(.6,0,.2,1)" });
    sfx.impact();
    shake(460, 13);
    flash(180, "#ff2233", 0.32);
    ring(500, 300, 30, 480, 760, "rgba(220,30,50,.7)", 4);
    await sleep(370);
    if (!alive(tok)) return;

    // 피가 흘러내린다 — 높이가 자라는 줄기 + 끝의 방울
    for (let i = 0; i < 7; i++) {
      const x = 200 + rnd(0, 58);
      const w = rnd(2.5, 6);
      const dur = rnd(700, 1500);
      const dist = rnd(30, 90);
      const run = mk(null, {
        position: "absolute", left: `${x}px`, top: "300px",
        width: `${w}px`, height: "0px", borderRadius: `${w}px`,
        background: "linear-gradient(180deg,#8a1420,#c0182c)", mixBlendMode: "multiply",
      }, doc);
      const bead = mk(null, {
        position: "absolute", left: `${x - w * 0.4}px`, top: "300px",
        width: `${w * 1.9}px`, height: `${w * 2.3}px`, borderRadius: "50%",
        background: "#c0182c", mixBlendMode: "multiply",
      }, doc);
      anim(run, [{ height: "0px" }, { height: `${dist}px` }], {
        duration: dur, delay: i * 90, easing: "cubic-bezier(.5,0,.9,.5)",
      });
      anim(bead, [{ transform: "translateY(0)" }, { transform: `translateY(${dist}px)` }], {
        duration: dur, delay: i * 90, easing: "cubic-bezier(.5,0,.9,.5)",
      });
      later(() => alive(tok) && sfx.drip(), i * 90 + dur * 0.8);
    }
    const vig = mk(null, {
      position: "absolute", inset: "0",
      background: "radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(120,8,20,.55) 100%)",
      opacity: "0",
    });
    anim(vig, [{ opacity: 0 }, { opacity: 1 }], { duration: 900 });
    banner("핏빛 계약", "CONTRACT SEALED", 1800);
    await sleep(2100);
    if (!alive(tok)) return;
    anim(doc, [
      { opacity: 1, transform: "scale(1)" },
      { opacity: 0, transform: "scale(.94) translateY(20px)" },
    ], { duration: 500 });
    anim(dark, [{ opacity: 1 }, { opacity: 0 }], { duration: 600 });
    anim(vig, [{ opacity: 1 }, { opacity: 0 }], { duration: 600 });
    await sleep(700);
  },
});

def({
  id: "time_stop",
  name: "시간 정지",
  tier: "prism",
  fam: "파괴 · 임팩트",
  tag: "내 좌석만 색이 남고 판 전체가 멈춘다",
  tech:
    "<b>backdrop-filter grayscale</b> 베일에 <b>radial-gradient mask</b>로 내 좌석만 구멍을 뚫는다 — " +
    "'나만 움직인다'를 색으로 전달. 부유 먼지가 속도 0으로 급정지해 <b>정지 자체를 눈에 보이게</b> 만든다.",
  async run(tok) {
    // 멈추는 걸 보여주려면 먼저 움직이는 게 있어야 한다
    const dust = [];
    for (let i = 0; i < 70; i++) {
      dust.push({ x: rnd(0, 1000), y: rnd(0, 625), vx: rnd(-0.5, 0.5), vy: rnd(-0.35, 0.35), s: rnd(1, 2.6) });
    }
    const st = { frozen: false };
    drawHooks.add((dt, c) => {
      for (const p of dust) {
        if (!st.frozen) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          if (p.x < 0) p.x = 1000;
          if (p.x > 1000) p.x = 0;
          if (p.y < 0) p.y = 625;
          if (p.y > 625) p.y = 0;
        }
        c.fillStyle = st.frozen ? "rgba(190,215,235,.75)" : "rgba(190,215,235,.35)";
        c.fillRect(p.x, p.y, p.s, p.s);
      }
      return true;
    });
    sfx.riser(0.6);
    await sleep(580);
    if (!alive(tok)) return;

    // 정지
    st.frozen = true;
    sfx.impact();
    sfx.tinnitus();
    const hr = sRect(S.myhand);
    const v = veil(
      "grayscale(1) brightness(.5) contrast(1.15)",
      240,
      `radial-gradient(ellipse ${hr.w * 0.62}px 150px at ${hr.cx}px ${hr.cy}px, transparent 55%, black 100%)`,
    );
    ring(hr.cx, hr.cy, 40, 1300, 900, "rgba(255,255,255,.55)", 4);
    ring(hr.cx, hr.cy, 40, 900, 700, "rgba(130,200,255,.6)", 2);
    flash(180, "#cfe8ff", 0.4);

    // 상대 패에 정지 잔상 — 미세하게 어긋난 채 굳는다
    for (const el of S.stage.querySelectorAll(".opp .tf, .pond .tf")) {
      anim(el, [
        { transform: "translate(0,0) rotate(0)" },
        { transform: `translate(${rnd(-1.5, 1.5)}px,${rnd(-1.5, 1.5)}px) rotate(${rnd(-1.6, 1.6)}deg)` },
      ], { duration: 90 });
    }

    // 시계 — 초침이 다음 칸으로 못 넘어가고 떤다
    const cl = mkSvg({ zIndex: "5" });
    const g = svgEl("g", {}, cl);
    svgEl("circle", { cx: 500, cy: 300, r: 62, fill: "rgba(6,14,24,.82)", stroke: "#cfe8ff", "stroke-width": 2 }, g);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * 6.283;
      svgEl("line", {
        x1: 500 + Math.cos(a) * 50, y1: 300 + Math.sin(a) * 50,
        x2: 500 + Math.cos(a) * 57, y2: 300 + Math.sin(a) * 57,
        stroke: "rgba(207,232,255,.7)", "stroke-width": i % 3 === 0 ? 3 : 1.5,
      }, g);
    }
    svgEl("line", { x1: 500, y1: 300, x2: 500, y2: 266, stroke: "#cfe8ff", "stroke-width": 4, "stroke-linecap": "round" }, g);
    const sec = svgEl("line", { x1: 500, y1: 308, x2: 500, y2: 250, stroke: "#ff5a6a", "stroke-width": 2, "stroke-linecap": "round" }, g);
    sec.style.transformOrigin = "500px 300px";
    g.style.filter = "drop-shadow(0 0 20px rgba(160,215,255,.5))";
    cl.style.transformOrigin = "500px 300px";
    anim(cl, [
      { opacity: 0, transform: "scale(.4)" },
      { opacity: 1, transform: "scale(1)" },
    ], { duration: 340, easing: EASE });
    anim(sec, [
      { transform: "rotate(0deg)" },
      { transform: "rotate(5.4deg)", offset: 0.3 },
      { transform: "rotate(2.6deg)", offset: 0.45 },
      { transform: "rotate(5.6deg)", offset: 0.62 },
      { transform: "rotate(3.4deg)", offset: 0.74 },
      { transform: "rotate(4.6deg)" },
    ], { duration: 1400, easing: "cubic-bezier(.6,0,.4,1)" });
    banner("시 간 정 지", "TIME STOP", 1900);
    await sleep(2300);
    if (!alive(tok)) return;

    // 해제 — 다시 흐른다
    sfx.chime();
    st.frozen = false;
    anim(v, [{ opacity: 1 }, { opacity: 0 }], { duration: 520 });
    anim(cl, [
      { opacity: 1, transform: "scale(1)" },
      { opacity: 0, transform: "scale(1.4)" },
    ], { duration: 520 });
    anim(sec, [{ transform: "rotate(4.6deg)" }, { transform: "rotate(150deg)" }], {
      duration: 500, easing: "cubic-bezier(.3,1,.4,1)",
    });
    await sleep(700);
  },
});

def({
  id: "grave_rob",
  name: "무덤 도굴",
  tier: "prism",
  fam: "파괴 · 임팩트",
  tag: "왕패에서 패를 파내 손으로 끌어온다",
  tech:
    "<b>3D 상승 + 흙먼지 입자</b>, 그리고 패산→손패까지 <b>베지에 궤적</b>으로 날려 '가져왔다'는 인과를 만든다. " +
    "궤적은 양쪽 좌표를 <b>실측</b>해 계산한다 — 하드코딩하면 레이아웃 바뀔 때 조용히 깨진다.",
  async run(tok) {
    const walls = [...S.wallTop.querySelectorAll(".tf")];
    const wr = sRect(walls[walls.length - 3]);
    const dest = handTiles()[12];
    const dr = sRect(dest);

    const dark = veil("brightness(.6) saturate(.7)", 340);
    sfx.riser(0.8);

    // 균열이 왕패 아래에서 번진다
    const sv = mkSvg({ zIndex: "2" });
    for (let i = 0; i < 6; i++) {
      const a = rnd(-0.5, 0.5) + (i % 2 ? 0.6 : -0.6);
      let x = wr.cx;
      let y = wr.cy + 16;
      let d = `M${x.toFixed(1)} ${y.toFixed(1)}`;
      for (let k = 0; k < 3; k++) {
        x += Math.cos(a + rnd(-0.6, 0.6)) * rnd(16, 34);
        y += Math.abs(Math.sin(a + rnd(-0.4, 0.4))) * rnd(6, 16);
        d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      const p = svgEl("path", {
        d, fill: "none", stroke: "rgba(255,150,60,.8)", "stroke-width": 1.6,
        "stroke-dasharray": 120, "stroke-dashoffset": 120,
      }, sv);
      anim(p, [{ strokeDashoffset: 120 }, { strokeDashoffset: 0 }], { duration: 420, delay: i * 40 });
      anim(p, [{ opacity: 1 }, { opacity: 0 }], { duration: 700, delay: 700 });
    }
    shake(600, 5);
    await sleep(640);
    if (!alive(tok)) return;

    // 패가 흙을 뚫고 솟는다
    sfx.impact();
    const code = pick(NUM_CODES);
    const tile = tileEl(code);
    Object.assign(tile.style, {
      position: "absolute", left: `${wr.x}px`, top: `${wr.y}px`, zIndex: "10",
      boxShadow: "0 0 22px rgba(255,170,80,.8)",
    });
    tile.style.setProperty("--tile-w", `${wr.w}px`);
    tile.style.setProperty("--tile-h", `${wr.h}px`);
    S.fx.appendChild(tile);
    anim(tile, [
      { transform: "translateY(16px) scale(.7) rotateX(70deg)", opacity: 0 },
      { transform: "translateY(-26px) scale(1.5) rotateX(0deg)", opacity: 1 },
    ], { duration: 520, easing: EASE_IMPACT });
    ring(wr.cx, wr.cy, 10, 130, 560, "rgba(255,170,80,.8)", 3);

    // 흙먼지
    const dirt = [];
    for (let i = 0; i < 60; i++) {
      dirt.push({
        x: wr.cx + rnd(-16, 16), y: wr.cy + rnd(-4, 8),
        vx: rnd(-3, 3), vy: rnd(-6, -1), s: rnd(1.4, 4), age: 0, life: rnd(40, 90),
      });
    }
    drawHooks.add((dt, c) => {
      let live = 0;
      for (const p of dirt) {
        p.age += dt;
        if (p.age > p.life) continue;
        live++;
        p.vy += 0.34 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        c.fillStyle = `rgba(${120 + p.s * 12},${86 + p.s * 8},52,${clamp(1 - p.age / p.life, 0, 1) * 0.8})`;
        c.fillRect(p.x, p.y, p.s, p.s);
      }
      return live > 0;
    });
    await sleep(560);
    if (!alive(tok)) return;

    // 손으로 끌어온다 — 2차 베지에 궤적을 키프레임으로 샘플링
    const p0 = { x: wr.x, y: wr.y - 26 };
    const p2 = { x: dr.x, y: dr.y };
    const p1 = { x: (p0.x + p2.x) / 2 + 120, y: Math.min(p0.y, p2.y) - 90 };
    const steps = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const u = 1 - t;
      const x = u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x - p0.x;
      const y = u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y - p0.y;
      steps.push({
        transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${(1.5 - 0.5 * t).toFixed(2)}) rotate(${(t * 360).toFixed(0)}deg)`,
        offset: t,
      });
    }
    sfx.whoosh(0.6);
    anim(tile, steps, { duration: 620, easing: "cubic-bezier(.4,0,.5,1)" });

    // 잔광 트레일 — 매 프레임 실제 위치를 읽어 궤적을 따라간다
    let tt = 0;
    const trail = [];
    drawHooks.add((dt, c) => {
      tt += dt;
      const cur = sRect(tile);
      trail.push({ x: cur.cx, y: cur.cy });
      if (trail.length > 26) trail.shift();
      c.save();
      c.globalCompositeOperation = "lighter";
      for (const [i, p] of trail.entries()) {
        c.fillStyle = `rgba(255,180,90,${(i / trail.length) * 0.55})`;
        c.beginPath();
        c.arc(p.x, p.y, 3 + i * 0.5, 0, 6.284);
        c.fill();
      }
      c.restore();
      return tt < 60;
    });
    await sleep(650);
    if (!alive(tok)) return;

    // 손패에 안착
    sfx.clack(700);
    flash(120, "#ffcf90", 0.25);
    tile.remove();
    dest.dataset.code = code;
    const im = dest.querySelector("img");
    if (im) im.src = `/tiles/${code}.png`;
    anim(dest, [
      { transform: "scale(1.6) rotate(20deg)", opacity: 0.4, filter: "brightness(2.4)" },
      { transform: "scale(1) rotate(0)", opacity: 1, filter: "brightness(1)" },
    ], { duration: 420, easing: EASE });
    ring(dr.cx, dr.cy, 10, 100, 460, "rgba(255,190,110,.85)", 2);
    banner("무덤 도굴", "GRAVE ROBBED", 1500);
    await sleep(1500);
    anim(dark, [{ opacity: 1 }, { opacity: 0 }], { duration: 400 });
    await sleep(500);
  },
});

// ─────────────────────────── UI 배선 ───────────────────────────

const FAM_ORDER = ["3D · 물리", "캔버스 입자", "마스크 · 스캔", "SVG 필터", "파괴 · 임팩트"];
const $ = (id) => document.getElementById(id);
let current = null;

function buildList() {
  const list = $("fxList");
  list.textContent = "";
  for (const fam of FAM_ORDER) {
    const h = document.createElement("div");
    h.className = "fam";
    h.textContent = fam;
    list.appendChild(h);
    for (const e of EFFECTS.filter((x) => x.fam === fam)) {
      const b = document.createElement("button");
      b.className = "fx-item";
      b.dataset.id = e.id;
      b.innerHTML =
        `<div class="n"><span class="tier tier-${e.tier}">${e.tier}</span>${e.name}</div>` +
        `<div class="t">${e.tag}</div>`;
      b.addEventListener("click", () => void play(e));
      list.appendChild(b);
    }
  }
  $("fxCount").textContent = `${EFFECTS.length}개 연출 · ${FAM_ORDER.length}개 기법군`;
}

async function play(e) {
  current = e;
  resetStage();
  const tok = token();
  for (const b of document.querySelectorAll(".fx-item")) b.classList.toggle("on", b.dataset.id === e.id);
  $("note").innerHTML = `<b>${e.name}</b> — ${e.tech}`;
  S.hud.textContent = `${e.name} · ${e.id}`;
  anim(S.hud, [{ opacity: 0 }, { opacity: 1 }], { duration: 300 });

  $("btnPlay").disabled = true;
  try {
    await e.run(tok);
  } catch (err) {
    console.error("[fx-lab]", e.id, err);
  }
  if (alive(tok)) $("btnPlay").disabled = false;
}

$("btnPlay").addEventListener("click", () => {
  if (current) void play(current);
});

for (const b of $("speed").querySelectorAll("button")) {
  b.addEventListener("click", () => {
    for (const o of $("speed").querySelectorAll("button")) o.classList.remove("on");
    b.classList.add("on");
    setSpeed(Number(b.dataset.s));
  });
}

addEventListener("keydown", (ev) => {
  if (ev.key === " ") {
    ev.preventDefault();
    if (current) void play(current);
    return;
  }
  if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
    ev.preventDefault();
    const i = EFFECTS.indexOf(current);
    const step = ev.key === "ArrowDown" ? 1 : EFFECTS.length - 1;
    void play(EFFECTS[(Math.max(0, i) + step) % EFFECTS.length]);
  }
});

// 부팅
fitCanvas();
buildStage();
fitStage();
buildList();
$("note").innerHTML = "왼쪽에서 연출을 고르세요. <b>Space</b> 다시 재생 · <b>↑↓</b> 이전/다음 · 속도를 낮추면 기법이 보입니다.";
