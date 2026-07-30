/* MAJAK 증강 연출 랩 — 4차 배치 E · 손패 조작 6종 + 정보 3종 + 기타 1종
 *
 * 손패 조작은 전부 "내 손이 실제로 바뀐다"이다 — 이 랩에서 반복해 확인한 원칙(연출과 상태
 * 변화를 같은 타임라인에 붙인다)이 가장 곧이곧대로 적용되는 계열이라, 10종 전부 끝나면
 * 손패가 정말 달라져 있다.
 *
 * 정보 계열은 이미 투시·스파이·지뢰탐지에서 언어를 세웠으므로 그 어휘를 재사용한다.
 * 새 언어를 만들 이유가 없을 때 만들지 않는 것도 설계다.
 */

import {
  C, EASE, EASE_IMPACT, HONOR_CODES, NUM_CODES, S, alive, anim, banner, bigGlyph, chip, clamp,
  countUp, drawHooks, fade, fallParticles, flash, flyTile, glowTiles, handTiles, later, linkTo,
  meter, mk, mkSvg, opps, orbitRing, pick, plausibleHand, ponds, ring, rnd, sRect, sTone, seatMark,
  setTile, sfx, shake, sleep, sparkBurst, stamp, svgEl, tileEl, veil,
} from "/fx-kit.js?v=9";
import { def } from "/fx-registry.js?v=9";

const HAND = "손패 · 조작";
const INFO = "정보 · 열람";

/* ══════════════════════ 손패 · 조작 ══════════════════════ */

def({
  id: "conjure_draw", name: "소환", tier: "prism", fam: HAND,
  tag: "지목한 패의 복제가 다음 쯔모로 허공에서 온다",
  tech: "쯔모는 원래 <b>패산에서</b> 온다. 그래서 이 연출은 패산을 <b>지나치는</b> 것이 핵심 — " +
        "손패에서 뽑힌 원본이 허공에 소환진을 그리고 거기서 복제가 나온다. 출처가 다르면 경로도 달라야 한다.",
  async run(tok) {
    const dark = veil("brightness(.48) saturate(.85)", 340);
    const h = chip("손패 1장 지목");
    const src = handTiles()[5];
    const sr = sRect(src);
    const code = src.dataset.code || "1m";
    glowTiles([src], C.aug, { lift: 12 });
    sfx.ping(1200);
    await sleep(520);
    if (!alive(tok)) return;

    // 허공에 소환진
    h.textContent = "허공에서 복제를 부른다";
    const CX = 500;
    const CY = 250;
    const sv = mkSvg({ zIndex: "5" });
    const g = svgEl("g", {}, sv);
    g.style.filter = `drop-shadow(0 0 12px ${C.aug})`;
    const circles = [];
    for (const r of [76, 54]) {
      const d = [];
      for (let i = 0; i <= 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        d.push(`${i ? "L" : "M"}${(CX + r * Math.cos(a)).toFixed(1)} ${(CY + r * Math.sin(a)).toFixed(1)}`);
      }
      const p = svgEl("path", { d: d.join(" ") + " Z", fill: "none", stroke: C.aug, "stroke-width": 1.8 }, g);
      const L = p.getTotalLength();
      p.setAttribute("stroke-dasharray", `${L}`);
      p.setAttribute("stroke-dashoffset", `${L}`);
      anim(p, [{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 460, easing: EASE });
      circles.push(p);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      svgEl("line", {
        x1: CX + 54 * Math.cos(a), y1: CY + 54 * Math.sin(a),
        x2: CX + 76 * Math.cos(a), y2: CY + 76 * Math.sin(a),
        stroke: C.aug, "stroke-width": 2.4,
      }, g);
    }
    sfx.riser(1.0);
    // 원본이 위로 정보를 보낸다
    linkTo(sr, { cx: CX, cy: CY }, { col: `${C.aug}88`, bow: -60, ms: 420 });
    await sleep(760);
    if (!alive(tok)) return;

    // 복제가 나온다
    sfx.impact();
    flash(190, "#b6a3ff", 0.4);
    sparkBurst(CX, CY, { n: 24, col: "182,163,255", spread: 130 });
    const drawn = S.myhand.querySelector(".drawn") ?? handTiles()[13];
    const dr = sRect(drawn);
    flyTile(code, { x: CX - 23, y: CY - 31, w: 46, h: 62, cx: CX, cy: CY }, dr, { bow: 70, ms: 620 });
    later(() => {
      if (!alive(tok)) return;
      setTile(drawn, code, { ms: 320 });
      drawn.style.boxShadow = `0 0 18px ${C.aug}`;
      sfx.clack(900);
      ring(dr.cx, dr.cy, 8, 80, 460, "rgba(124,92,255,.85)", 2);
    }, 630);
    h.textContent = "다음 쯔모 = 부른 패";
    bigGlyph("召", { y: CY, col: C.augLite, size: 74, ms: 1400 });
    banner("소 환", "CONJURED", 1600);
    await sleep(1800);
    fade([h, dark, sv]);
    await sleep(520);
  },
});

def({
  id: "even_world", name: "짝수의 세계", tier: "prism", fam: HAND,
  tag: "손패의 홀수가 전부 한 칸 위 짝수로 다시 태어난다",
  tech: "1→2, 3→4 … 9→8 이라는 <b>규칙이 있는 변환</b>이라, 바뀌는 패마다 " +
        "<b>화살표와 숫자</b>를 띄운다. 무작위 변신과 규칙 변환은 화면에서 구별돼야 한다.",
  async run(tok) {
    const dark = veil("brightness(.52)", 330);
    const h = chip("홀수 → 짝수");
    const tiles = handTiles().slice(0, 13);
    // 홀짝 섞어 심는다
    const suits = ["m", "p", "s"];
    for (const [i, el] of tiles.entries()) {
      setTile(el, `${1 + (i % 9)}${suits[i % 3]}`, { ms: 1 });
    }
    sfx.riser(0.9);
    await sleep(460);
    if (!alive(tok)) return;

    const odd = tiles.filter((el) => {
      const c = el.dataset.code || "";
      return /^[13579]/.test(c);
    });
    for (const [i, el] of odd.entries()) {
      later(() => {
        if (!alive(tok)) return;
        const c = el.dataset.code || "";
        const n = Number(c[0]);
        const next = n === 9 ? 8 : n + 1;
        const r = sRect(el);
        // 변환 표시
        const lb = mk(null, {
          position: "absolute", left: `${r.cx}px`, top: `${r.y - 26}px`,
          transform: "translateX(-50%)", font: "800 11px/1 ui-monospace, monospace",
          color: C.brass, whiteSpace: "nowrap",
        });
        lb.textContent = `${n}→${next}`;
        anim(lb, [{ opacity: 0, translate: "0 8px" }, { opacity: 1, translate: "0 0" }], { duration: 200, easing: EASE });
        anim(lb, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay: 700 });
        setTile(el, `${next}${c[1]}`, { ms: 300 });
        ring(r.cx, r.cy, 7, 60, 400, "rgba(194,160,104,.75)", 1.5);
        sTone({ f: 900 + n * 90, dur: 0.06, gain: 0.05, type: "sine" });
      }, i * 130);
    }
    await sleep(odd.length * 130 + 500);
    if (!alive(tok)) return;
    sfx.impact();
    flash(170, "#dcc79a", 0.32);
    h.textContent = "전부 짝수 — 자패·도라는 그대로";
    bigGlyph("偶", { y: 270, col: C.brass, size: 84, ms: 1400 });
    banner("짝수의 세계", "EVEN WORLD", 1600);
    await sleep(1700);
    fade([h, dark]);
    await sleep(520);
  },
});

def({
  id: "honor_return", name: "귀환", tier: "prism", fam: HAND,
  tag: "이번 국에 버린 자패가 다음 국 배패로 돌아온다",
  tech: "국을 <b>넘어가는</b> 증강이라 국 경계를 화면에 그린다. 바닥의 자패가 " +
        "표시되고, 판이 초기화되는 순간 <b>그 패들만 남아</b> 새 손패에 들어간다.",
  async run(tok) {
    const dark = veil("brightness(.5)", 340);
    const h = chip("이번 국에 버린 자패");
    // 바닥에 자패를 심는다
    const river = [...S.pondMe.querySelectorAll(".tf")];
    const kept = river.slice(0, 4);
    for (const [i, el] of kept.entries()) {
      setTile(el, HONOR_CODES[i], { ms: 1 });
      later(() => {
        if (!alive(tok)) return;
        el.style.outline = `1.5px solid ${C.brass}`;
        el.style.outlineOffset = "1px";
        el.style.boxShadow = `0 0 14px ${C.brass}`;
        const r = sRect(el);
        ring(r.cx, r.cy, 6, 50, 360, "rgba(194,160,104,.8)", 1.5);
        sTone({ f: 900 + i * 130, dur: 0.06, gain: 0.05, type: "sine" });
      }, i * 150);
    }
    sfx.riser(1.0);
    await sleep(4 * 150 + 500);
    if (!alive(tok)) return;

    // 국 경계
    h.textContent = "국 종료 — 판 초기화";
    sfx.impact();
    flash(240, "#dcc79a", 0.45);
    shake(420, 9);
    const codes = kept.map((el) => el.dataset.code || "1z");
    const flying = kept.map((el) => sRect(el));
    for (const el of S.stage.querySelectorAll(".tf")) {
      anim(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 340 });
    }
    await sleep(400);
    if (!alive(tok)) return;

    // 새 국 — 그 자패들만 손패에 들어간다
    const fresh = plausibleHand();
    const tiles = handTiles();
    for (const [i, el] of tiles.entries()) {
      el.style.opacity = "";
      setTile(el, i < 4 ? codes[i] : fresh[i % fresh.length], { ms: 1 });
      anim(el, [{ opacity: 0, transform: "translateY(-30px) scale(1.2)" }, { opacity: 1, transform: "none" }], {
        duration: 320, delay: i * 34, easing: EASE_IMPACT,
      });
    }
    for (const el of S.stage.querySelectorAll(".opp .tf, .pond .tf, .wall .tf")) {
      anim(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: rnd(0, 200) });
    }
    for (const [i, r] of flying.entries()) {
      later(() => alive(tok) && flyTile(codes[i], r, sRect(tiles[i]), { bow: -70, ms: 480 }), i * 60);
    }
    h.textContent = "다음 국 배패에 그대로";
    sfx.chime();
    later(() => {
      if (!alive(tok)) return;
      glowTiles(tiles.slice(0, 4), C.brass, { lift: 8, stagger: 70 });
    }, 520);
    bigGlyph("帰", { y: 270, col: C.brass, size: 80, ms: 1400 });
    banner("귀 환", "HONORS RETURN", 1700);
    await sleep(1900);
    fade([h, dark]);
    await sleep(520);
  },
});

def({
  id: "pond_snatch", name: "날치기", tier: "prism", fam: HAND,
  tag: "쯔모 대신 상대의 최근 버림패를 주워 온다 — 멘젠 유지",
  tech: "후로가 아니라는 게 중요하다. 그래서 <b>후로 자리로 눕히지 않고</b> " +
        "손패 안으로 그대로 들어간다 — 같은 '가져오기'라도 <b>도착지가 다르면</b> 다른 행위다.",
  async run(tok) {
    const dark = veil("brightness(.52)", 330);
    const h = chip("쯔모 포기 — 바닥에서 줍는다");
    const wr = sRect(S.wallTop);
    // 패산을 지나친다
    const skip = mk(null, {
      position: "absolute", left: `${wr.cx}px`, top: `${wr.y + wr.h + 10}px`,
      transform: "translateX(-50%)", font: "800 11px/1 ui-monospace, monospace",
      letterSpacing: "2px", color: C.sageDim, whiteSpace: "nowrap",
    });
    skip.textContent = "쯔모 없음";
    anim(skip, [{ opacity: 0 }, { opacity: 1 }], { duration: 260 });
    sfx.riser(0.7);
    await sleep(560);
    if (!alive(tok)) return;

    // 상대 최근 버림패
    const pondTiles = [...S.pondTop.querySelectorAll(".tf")];
    const src = pondTiles[pondTiles.length - 1];
    const sr = sRect(src);
    const code = src.dataset.code || "1m";
    glowTiles([src], C.brass);
    sfx.ping(1300);
    await sleep(420);
    if (!alive(tok)) return;

    // 손패 안으로 (후로 자리가 아니라)
    sfx.whoosh(0.5);
    h.textContent = "손패로 · 후로 아님";
    const dest = handTiles()[6];
    const dr = sRect(dest);
    anim(src, [{ opacity: 1 }, { opacity: 0 }], { duration: 200 });
    flyTile(code, sr, dr, { bow: -80, ms: 560 });
    await sleep(580);
    if (!alive(tok)) return;
    setTile(dest, code, { ms: 320 });
    sfx.clack(900);
    ring(dr.cx, dr.cy, 8, 80, 440, "rgba(194,160,104,.8)", 2);
    // 멘젠 유지 표시
    const stick = mk(null, {
      position: "absolute", left: "444px", top: "398px", width: "112px", height: "12px",
      borderRadius: "6px", background: "linear-gradient(180deg,#fff,#d8d2c2)", opacity: "0.55",
      outline: `1px dashed ${C.brass}`, outlineOffset: "4px",
    });
    anim(stick, [{ opacity: 0 }, { opacity: 0.55 }], { duration: 320 });
    const lb = mk(null, {
      position: "absolute", left: "500px", top: "424px", transform: "translateX(-50%)",
      font: "700 10px/1 ui-monospace, monospace", letterSpacing: "2px", color: C.brass, whiteSpace: "nowrap",
    });
    lb.textContent = "멘젠 · 리치 가능";
    anim(lb, [{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: 160 });
    bigGlyph("掠", { y: 270, col: C.brass, size: 78, ms: 1300 });
    banner("날 치 기", "SNATCH", 1600);
    await sleep(1700);
    fade([h, dark, skip, stick, lb]);
    await sleep(520);
  },
});

def({
  id: "regret", name: "미련", tier: "prism", fam: HAND,
  tag: "황패유국 시 멘젠 텐파이면 그 손이 다음 국 배패가 된다",
  tech: "손패가 <b>사라지지 않고 그대로 넘어간다</b>는 게 전부다. 판이 걷히는 동안 " +
        "<b>손패만 남아 떠 있다가</b> 새 국에 내려앉는다 — 남는 것을 보여주려면 나머지를 지워야 한다.",
  async run(tok) {
    const dark = veil("brightness(.5)", 340);
    const h = chip("황패유국 — 멘젠 텐파이");
    const tiles = handTiles();
    glowTiles(tiles.slice(0, 13), C.brass, { stagger: 28 });
    sfx.riser(1.0);
    await sleep(760);
    if (!alive(tok)) return;

    // 판이 걷힌다 — 손패만 남는다
    sfx.impact();
    h.textContent = "판은 걷히고 손만 남는다";
    for (const el of S.stage.querySelectorAll(".opp .tf, .pond .tf, .wall .tf")) {
      anim(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 460, delay: rnd(0, 260) });
    }
    anim(S.stage.querySelector(".center"), [{ opacity: 1 }, { opacity: 0.2 }], { duration: 500 });
    anim(S.myhand, [
      { transform: "translateX(-50%) translateY(0)" },
      { transform: "translateX(-50%) translateY(-40px)" },
    ], { duration: 900, easing: EASE });
    await sleep(1000);
    if (!alive(tok)) return;

    // 새 국에 그대로 내려앉는다
    h.textContent = "다음 국 배패 — 그대로";
    sfx.chime();
    for (const el of S.stage.querySelectorAll(".opp .tf, .pond .tf, .wall .tf")) {
      anim(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: rnd(0, 220) });
    }
    anim(S.stage.querySelector(".center"), [{ opacity: 0.2 }, { opacity: 1 }], { duration: 400 });
    anim(S.myhand, [
      { transform: "translateX(-50%) translateY(-40px)" },
      { transform: "translateX(-50%) translateY(0)" },
    ], { duration: 620, easing: EASE_IMPACT });
    later(() => {
      if (!alive(tok)) return;
      sfx.clack(900);
      const stick = mk(null, {
        position: "absolute", left: "444px", top: "398px", width: "112px", height: "12px",
        borderRadius: "6px", background: "linear-gradient(180deg,#fff,#d8d2c2)",
      });
      anim(stick, [{ opacity: 0, translate: "0 -26px" }, { opacity: 1, translate: "0 0" }], { duration: 320, easing: EASE });
      sfx.clack(1400);
    }, 640);
    bigGlyph("未練", { y: 250, col: C.brass, size: 64, ms: 1500 });
    banner("미 련", "HAND CARRIED", 1700);
    await sleep(1900);
    for (const el of tiles) el.style.outline = "";
    fade([h, dark]);
    await sleep(520);
  },
});

def({
  id: "three_dragons_will", name: "삼원의 의지", tier: "prism", fam: HAND,
  tag: "삼원패 한 장이 커쯔로 완성돼 대삼원이 7장에 선다",
  tech: "1장 → 3장으로 <b>불어나는</b> 것이라 분열(tile_split)과 비슷해 보이지만 " +
        "의미가 다르다. 저쪽은 복제, 이쪽은 <b>의지가 응한다</b> — 그래서 나머지 두 커쯔에서 " +
        "빛이 건너와 채운다. 출처가 있는 증가는 출처를 보여줘야 한다.",
  async run(tok) {
    const dark = veil("brightness(.46) saturate(.9)", 360);
    const h = chip("백·발 커쯔 + 중 1장");
    const tiles = handTiles();
    // 백 커쯔, 발 커쯔, 중 1장
    const setA = tiles.slice(0, 3);
    const setB = tiles.slice(3, 6);
    const lone = tiles[6];
    for (const el of setA) setTile(el, "5z", { ms: 1 });
    for (const el of setB) setTile(el, "6z", { ms: 1 });
    setTile(lone, "7z", { ms: 1 });
    glowTiles(setA, C.brass, { stagger: 40 });
    glowTiles(setB, C.brass, { stagger: 40 });
    glowTiles([lone], C.red, { lift: 12 });
    sfx.riser(1.2);
    await sleep(800);
    if (!alive(tok)) return;

    // 두 커쯔에서 빛이 건너온다
    sfx.whoosh(0.8);
    h.textContent = "삼원의 의지가 응한다";
    const lr = sRect(lone);
    for (const [i, s] of [setA, setB].entries()) {
      const from = sRect(s[1]);
      linkTo(from, lr, { col: `${C.brass}cc`, bow: i ? 50 : -50, ms: 420, width: 2.5 });
      later(() => {
        if (!alive(tok)) return;
        sparkBurst(lr.cx, lr.cy, { n: 12, col: "220,199,154", spread: 70 });
        sTone({ f: 900 + i * 220, dur: 0.12, gain: 0.07, type: "sine" });
      }, 420 + i * 140);
    }
    await sleep(820);
    if (!alive(tok)) return;

    // 커쯔로 완성
    sfx.impact();
    flash(220, "#dcc79a", 0.45);
    shake(480, 11);
    const grown = [];
    for (let k = 0; k < 2; k++) {
      const el = tiles[7 + k];
      setTile(el, "7z", { ms: 320 });
      grown.push(el);
      later(() => {
        if (!alive(tok)) return;
        const r = sRect(el);
        ring(r.cx, r.cy, 8, 84, 460, "rgba(194,160,104,.85)", 2);
        sfx.clack(rnd(900, 1300));
      }, k * 160);
    }
    glowTiles([lone, ...grown], C.brass, { lift: 12, stagger: 90 });
    h.textContent = "대삼원 — 삼원패 7장으로";
    bigGlyph("大三元", { y: 250, col: C.brass, size: 62, ms: 1700 });
    banner("삼원의 의지", "BIG THREE · 역만", 1800);
    await sleep(1900);
    for (const el of tiles) el.style.outline = "";
    fade([h, dark]);
    await sleep(520);
  },
});

/* ══════════════════════ 정보 · 열람 ══════════════════════ */

def({
  id: "dora_conceal", name: "가려진 도라", tier: "prism", fam: INFO,
  tag: "도라 표시패가 상대에게만 뒷면으로 덮인다",
  tech: "이면투시와 같은 표시패를 쓰지만 방향이 반대다 — 저쪽은 <b>내가 더 본다</b>, " +
        "이쪽은 <b>남이 덜 본다</b>. 같은 소품으로 반대 문장을 만들어 둘을 나란히 비교하게 했다.",
  async run(tok) {
    const dark = veil("brightness(.5)", 340);
    const h = chip("도라 표시패 공개 중", C.sageDim);
    const walls = [...S.wallTop.querySelectorAll(".tf")];
    const ind = walls[4];
    const code = pick(NUM_CODES);
    ind.classList.remove("back");
    ind.textContent = "";
    const im = document.createElement("img");
    im.src = `/tiles/${code}.png`;
    ind.appendChild(im);
    ind.dataset.code = code;
    anim(ind, [{ scale: "1" }, { scale: "1.3" }], { duration: 320, easing: EASE });
    ind.style.boxShadow = `0 0 20px ${C.brass}`;
    sfx.ping(1100);
    await sleep(620);
    if (!alive(tok)) return;

    // 상대 시야에서만 덮인다
    sfx.whoosh(0.7);
    h.textContent = "상대 시야 — 뒷면으로";
    h.style.borderColor = C.aug;
    h.style.color = C.aug;
    const covers = [];
    for (const [i, o] of opps().entries()) {
      later(() => {
        if (!alive(tok)) return;
        const r = sRect(o);
        const t = tileEl(null, { back: true });
        Object.assign(t.style, {
          position: "absolute", left: `${r.cx - 19}px`, top: `${r.cy + (o === S.oppTop ? 46 : -25)}px`,
          zIndex: "10", boxShadow: `0 0 14px ${C.aug}88`,
        });
        t.style.setProperty("--tile-w", "38px");
        t.style.setProperty("--tile-h", "50px");
        S.fx.appendChild(t);
        covers.push(t);
        anim(t, [
          { opacity: 0, transform: "perspective(400px) rotateY(-80deg)" },
          { opacity: 1, transform: "perspective(400px) rotateY(0deg)" },
        ], { duration: 340, easing: EASE });
        sfx.clack(rnd(800, 1200));
        seatMark(o, "도라 모름", C.sageDim, o === S.oppTop ? 108 : 34);
      }, i * 180);
    }
    await sleep(900);
    if (!alive(tok)) return;
    const wm = mk(null, {
      position: "absolute", left: "500px", top: "150px", transform: "translateX(-50%)",
      padding: "5px 14px", borderRadius: "999px", border: `1px dashed ${C.brass}`,
      background: "rgba(14,23,18,.9)", font: "800 11px/1 ui-monospace, monospace",
      letterSpacing: "3px", color: C.brass, whiteSpace: "nowrap",
    });
    wm.textContent = "이 판의 도라는 나만 안다";
    anim(wm, [{ opacity: 0, translate: "0 -10px" }, { opacity: 1, translate: "0 0" }], { duration: 300, easing: EASE });
    banner("가려진 도라", "DORA HIDDEN", 1700);
    await sleep(1800);
    fade([h, dark, wm, ...covers]);
    await sleep(520);
  },
});

def({
  id: "rinshan_preview", name: "영상 정찰", tier: "gold", fam: INFO,
  tag: "다음 영상패를 늘 보고, 깡 없이 내 쯔모패와 맞바꾼다",
  tech: "왕패 열람(상시)과 이면 바꿔치기(교환)를 <b>한 증강이 둘 다</b> 한다. " +
        "그래서 이미 세운 두 언어를 이어 붙였다 — 상시 표시는 조용히, 교환은 호를 그려서.",
  async run(tok) {
    const dark = veil("brightness(.55)", 320);
    const h = chip("영상패 상시 열람", C.brassDim);
    const walls = [...S.wallTop.querySelectorAll(".tf")];
    const rin = walls[0];
    const code = pick(NUM_CODES);
    rin.classList.remove("back");
    rin.textContent = "";
    const im = document.createElement("img");
    im.src = `/tiles/${code}.png`;
    rin.appendChild(im);
    rin.dataset.code = code;
    rin.style.boxShadow = `0 0 16px ${C.brass}`;
    anim(rin, [{ opacity: 0.4, transform: "perspective(400px) rotateX(-70deg)" }, { opacity: 1, transform: "none" }], {
      duration: 320, easing: EASE,
    });
    const lb = seatMark(S.wallTop, "다음 영상패", C.brass, -34);
    sfx.ping(1300);
    await sleep(760);
    if (!alive(tok)) return;

    // 깡 없이 쯔모패와 교환
    h.textContent = "깡 없이 쯔모패와 교환";
    h.style.borderColor = C.brass;
    h.style.color = C.brass;
    const drawn = S.myhand.querySelector(".drawn") ?? handTiles()[13];
    const dr = sRect(drawn);
    const rr = sRect(rin);
    const drawnCode = drawn.dataset.code || "1m";
    sfx.whoosh(0.6);
    flyTile(code, rr, dr, { bow: -80, ms: 540 });
    flyTile(drawnCode, dr, rr, { bow: 80, ms: 540 });
    anim(rin, [{ opacity: 1 }, { opacity: 0 }], { duration: 160 });
    anim(drawn, [{ opacity: 1 }, { opacity: 0 }], { duration: 160 });
    await sleep(560);
    if (!alive(tok)) return;
    setTile(drawn, code, { ms: 300 });
    drawn.style.opacity = "1";
    rin.style.opacity = "1";
    rin.textContent = "";
    const im2 = document.createElement("img");
    im2.src = `/tiles/${drawnCode}.png`;
    rin.appendChild(im2);
    rin.dataset.code = drawnCode;
    sfx.clack(800);
    ring(dr.cx, dr.cy, 8, 80, 440, "rgba(194,160,104,.85)", 2);
    bigGlyph("嶺", { y: 260, col: C.brass, size: 78, ms: 1300 });
    banner("영상 정찰", "RINSHAN SWAP", 1600);
    await sleep(1700);
    fade([h, dark, lb]);
    await sleep(520);
  },
});

def({
  id: "triple_peek", name: "삼세 예지", tier: "prism", fam: INFO,
  tag: "다음 쯔모 세 장이 나에게만 공개된다",
  tech: "예지(5장 레일)의 <b>축소판</b>이라 같은 레일 언어를 쓰되 " +
        "<b>슬롯 3개</b>로 줄이고 순서 조작은 없다. 비슷한 증강은 비슷하게 보여야 " +
        "차이(장수·조작 가능 여부)가 오히려 또렷해진다.",
  async run(tok) {
    const dark = veil("brightness(.55)", 320);
    const h = chip("다음 쯔모 3장");
    const walls = [...S.wallTop.querySelectorAll(".tf")];
    const from = sRect(walls[walls.length - 1]);
    const RY = 176;
    const codes = plausibleHand().slice(0, 3);
    const rail = mk(null, {
      position: "absolute", left: "352px", top: `${RY}px`, width: "296px", height: "1px",
      background: `linear-gradient(90deg, transparent, ${C.brass}b0 14%, ${C.brass}b0 86%, transparent)`,
      transformOrigin: "left center",
    });
    anim(rail, [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 380, easing: EASE });
    sfx.riser(0.9);
    await sleep(460);
    if (!alive(tok)) return;

    const ghosts = [];
    for (let i = 0; i < 3; i++) {
      const tx = 420 + i * 80;
      const g = mk(null, {
        position: "absolute", left: "0", top: "0", width: "46px", height: "62px",
        borderRadius: "5px", border: `1px solid ${C.brass}8c`,
        background: "rgba(236,228,210,.07)",
        backdropFilter: "blur(3px) brightness(1.15)", webkitBackdropFilter: "blur(3px) brightness(1.15)",
        boxShadow: `0 0 18px ${C.brass}47`,
        offsetPath: `path("M ${from.cx - 23} ${from.cy - 31} C ${from.cx + 30} ${from.cy - 110}, ${tx - 60} ${RY - 120}, ${tx - 23} ${RY - 76}")`,
        offsetDistance: "0%", opacity: "0",
      });
      const img = document.createElement("img");
      img.src = `/tiles/${codes[i]}.png`;
      Object.assign(img.style, { width: "100%", height: "100%", objectFit: "contain", opacity: "0.66", filter: "brightness(1.5) saturate(.55)" });
      g.appendChild(img);
      const no = mk(null, {
        position: "absolute", left: `${tx}px`, top: `${RY + 8}px`, transform: "translateX(-50%)",
        font: "700 9px/1 ui-monospace, monospace", color: C.sageDim,
      });
      no.textContent = `+${i + 1}`;
      ghosts.push(g, no);
      later(() => {
        if (!alive(tok)) return;
        anim(g, [
          { offsetDistance: "0%", opacity: 0, scale: "0.5" },
          { offsetDistance: "100%", opacity: 1, scale: "1" },
        ], { duration: 600, easing: EASE });
        anim(no, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: 420 });
        sTone({ f: 1000 + i * 230, dur: 0.14, gain: 0.06, type: "sine" });
      }, i * 170);
    }
    await sleep(3 * 170 + 700);
    if (!alive(tok)) return;
    const wm = mk(null, {
      position: "absolute", left: "500px", top: `${RY - 108}px`, transform: "translateX(-50%)",
      padding: "5px 14px", borderRadius: "999px", border: `1px dashed ${C.brass}`,
      background: "rgba(14,23,18,.9)", font: "800 11px/1 ui-monospace, monospace",
      letterSpacing: "3px", color: C.brass, whiteSpace: "nowrap",
    });
    wm.textContent = "나에게만 공개 · 순서 조작 불가";
    anim(wm, [{ opacity: 0, translate: "0 -8px" }, { opacity: 1, translate: "0 0" }], { duration: 280, easing: EASE });
    banner("삼세 예지", "PEEK ×3", 1600);
    await sleep(1700);
    fade([h, dark, rail, wm, ...ghosts]);
    await sleep(520);
  },
});

/* ══════════════════════ 기타 ══════════════════════ */

def({
  id: "reload", name: "재장전", tier: "prism", fam: INFO,
  tag: "이미 써버린 내 다른 증강 하나를 1회 복구한다",
  tech: "대상이 <b>패가 아니라 증강 카드</b>인 유일한 케이스다. 무장해제가 카드를 " +
        "부쉈다면 이쪽은 <b>되살린다</b> — 소진된 카드가 회색에서 색을 되찾고 " +
        "잔여 횟수가 0에서 1로 돌아간다. 같은 카드 소품의 반대 문장.",
  async run(tok) {
    const dark = veil("brightness(.5)", 340);
    const h = chip("소진된 증강 지목");
    const card = S.augSlot.querySelector(".augcard.prism") ?? S.augSlot.querySelector(".augcard");
    const cr = sRect(card);
    // 소진 상태
    card.style.filter = "saturate(0) brightness(.55)";
    const used = mk(null, {
      position: "absolute", left: `${cr.cx}px`, top: `${cr.cy}px`,
      transform: "translate(-50%,-50%) rotate(-12deg)",
      padding: "3px 10px", borderRadius: "4px", border: `2px solid ${C.sageDim}`,
      font: "800 12px/1 ui-monospace, monospace", letterSpacing: "2px", color: C.sageDim,
      background: "rgba(10,18,16,.85)", whiteSpace: "nowrap",
    });
    used.textContent = "0 / 1";
    anim(used, [{ opacity: 0, scale: "1.6" }, { opacity: 1, scale: "1" }], { duration: 280, easing: EASE });
    sfx.riser(0.8);
    await sleep(700);
    if (!alive(tok)) return;

    // 탄창이 물린다
    sfx.clack(420);
    sfx.impact();
    shake(340, 8);
    flash(170, "#dcc79a", 0.32);
    h.textContent = "재장전 — 1회 복구";
    anim(card, [{ filter: "saturate(0) brightness(.55)" }, { filter: "saturate(1) brightness(1)" }], {
      duration: 520, easing: EASE,
    });
    card.style.filter = "";
    card.style.boxShadow = `0 0 26px ${C.brass}`;
    anim(card, [{ transform: "translateY(0) scale(1)" }, { transform: "translateY(-10px) scale(1.06)" }, { transform: "translateY(0) scale(1)" }], {
      duration: 460, easing: EASE_IMPACT,
    });
    used.textContent = "1 / 1";
    used.style.borderColor = C.brass;
    used.style.color = C.brass;
    anim(used, [{ scale: "1" }, { scale: "1.4" }, { scale: "1" }], { duration: 420, easing: EASE });
    ring(cr.cx, cr.cy, 16, 200, 620, "rgba(194,160,104,.85)", 3);
    sparkBurst(cr.cx, cr.cy, { n: 22, col: "220,199,154", spread: 140 });
    bigGlyph("装填", { y: 280, col: C.brass, size: 62, ms: 1400 });
    banner("재 장 전", "RELOADED", 1600);
    await sleep(1800);
    fade([h, dark, used]);
    await sleep(520);
  },
});
