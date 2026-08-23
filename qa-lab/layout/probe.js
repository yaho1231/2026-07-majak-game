window.__layoutProbe = () => /**
 * 레이아웃 겹침 탐지 프로브 — 브라우저 콘솔/자동화에서 주입해 쓴다.
 *
 * 판정 규칙: "서로 겹치면 안 되는 그룹" 목록을 정해 두고, 그룹에 속한 요소끼리
 * 실제 사각형이 얼마나 물리는지 잰다. 조상-자손 관계와 같은 그룹 안의 형제는 뺀다.
 * 화면 밖으로 나간 것, 부모를 넘친 것도 함께 잡는다.
 *
 * window.__layoutProbe() → 결과 객체.
 */
(() => {
  const GROUPS = {
    hand: [".own-hand-rail"],
    ownTop: [".own-top-main", ".own-aug", ".own-top-waits", ".quick-toggles-inline"],
    actionBar: [".action-bar"],
    board: [".center-panel", ".river-wrap"],
    plates: [".plate"],
    center: [".center-core", ".center-round", ".center-sub", ".wall-count", ".center-dora"],
    oppTop: [".opp-strip-top .nameplate", ".opp-strip-top .back-v", ".opp-strip-top .meld-row"],
    oppLeft: [".opp-strip-left .nameplate", ".opp-strip-left .back-h", ".opp-strip-left .meld-col"],
    oppRight: [".opp-strip-right .nameplate", ".opp-strip-right .back-h", ".opp-strip-right .meld-col"],
    chrome: [".icon-btn", ".ui-zoom", ".mode-badge", ".bot-diff-badge", ".info-note", ".quick-toggles", ".emote-bar"],
    overlay: [".rotate-hint", ".aug-notice", ".turn-banner"],
  };
  // 겹쳐도 되는 짝 (의도된 겹침 · 상호배타 · 부모/자식 성격)
  const ALLOW = new Set([
    "actionBar|hand", "hand|actionBar",
    // 액션 바가 내 바닥 아래 단을 스치는 것은 **의도된 거래**다 (styles.css --own-band
    // 주석 · docs/34 §3-1): 실측을 --own-band 에 넣으면 치·펑 프롬프트가 뜰 때마다
    // 판 전체가 크기를 바꿔 출렁인다. 좁은 폭에서는 --own-reserve 가 자리를 비운다.
    "actionBar|board", "board|actionBar",
    "actionBar|ownTop", "ownTop|actionBar",
    "center|plates", "plates|center",
    "board|center", "center|board",
    "board|plates", "plates|board",
    "overlay|board", "board|overlay",
  ]);

  const vis = (e) => {
    const s = getComputedStyle(e);
    if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) < 0.05) return false;
    const r = e.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const key = (e) => {
    const cl = [...e.classList].slice(0, 2).join(".");
    return e.tagName.toLowerCase() + (cl ? "." + cl : "");
  };
  const rect = (e) => {
    const r = e.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), r: Math.round(r.right), b: Math.round(r.bottom) };
  };
  const inter = (a, b) => {
    const w = Math.min(a.r, b.r) - Math.max(a.x, b.x);
    const h = Math.min(a.b, b.b) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? { w: Math.round(w), h: Math.round(h), area: Math.round(w * h) } : null;
  };

  const items = [];
  for (const [g, sels] of Object.entries(GROUPS)) {
    for (const s of sels) {
      document.querySelectorAll(s).forEach((e) => {
        if (vis(e)) items.push({ g, e, k: key(e), r: rect(e) });
      });
    }
  }

  const overlaps = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const A = items[i], B = items[j];
      if (A.g === B.g) continue;
      if (ALLOW.has(A.g + "|" + B.g)) continue;
      if (A.e.contains(B.e) || B.e.contains(A.e)) continue;
      const it = inter(A.r, B.r);
      if (!it) continue;
      // 1px 미만의 스침은 무시
      if (it.w < 2 || it.h < 2) continue;
      const minArea = Math.min(A.r.w * A.r.h, B.r.w * B.r.h);
      overlaps.push({
        a: A.g + " " + A.k, b: B.g + " " + B.k,
        ar: A.r, br: B.r, ov: it,
        pct: Math.round((it.area / minArea) * 100),
      });
    }
  }
  overlaps.sort((x, y) => y.pct - x.pct);

  // 화면 밖 (게임 루트 기준)
  const offscreen = [];
  const W = innerWidth, H = innerHeight;
  document.querySelectorAll(".game-root .center-panel, .game-root .plate, .game-root .river-wrap, .game-root .own-hand-rail, .game-root .opp-strip, .game-root .nameplate, .game-root .icon-btn, .game-root .own-top-main, .game-root .own-aug").forEach((e) => {
    if (!vis(e)) return;
    const r = rect(e);
    const out = Math.max(0, -r.x) + Math.max(0, r.r - W) + Math.max(0, -r.y) + Math.max(0, r.b - H);
    if (out > 2) offscreen.push({ k: key(e), r, out: Math.round(out) });
  });

  // 넘침 (자식이 overflow:hidden 부모를 넘음)
  const clipped = [];
  document.querySelectorAll(".game-root .center-panel, .game-root .center-core, .game-root .plate, .game-root .nameplate, .game-root .aug-pill, .game-root .own-hand-rail").forEach((e) => {
    if (!vis(e)) return;
    const dx = e.scrollWidth - e.clientWidth, dy = e.scrollHeight - e.clientHeight;
    if (dx > 2 || dy > 2) clipped.push({ k: key(e), dx, dy });
  });

  const root = document.querySelector(".game-root") || document.body;
  const cs = getComputedStyle(document.querySelector(".table") || root);
  const vars = {};
  for (const n of ["--ui-scale", "--board", "--panel", "--top-band", "--own-band", "--waits-row-h", "--hand-pref", "--rt-w", "--board-fit-v"]) {
    vars[n] = cs.getPropertyValue(n).trim();
  }
  const el = document.querySelector(".center-panel");
  if (el) vars.panelPx = Math.round(el.getBoundingClientRect().width);
  const hs = document.querySelector(".hand-tile");
  if (hs) vars.handTilePx = Math.round(hs.getBoundingClientRect().width);

  return {
    vp: [innerWidth, innerHeight],
    scale: Number(getComputedStyle(document.body).getPropertyValue("--ui-scale")) || 1,
    docScrollW: document.documentElement.scrollWidth,
    vars,
    overlaps: overlaps.slice(0, 25),
    offscreen,
    clipped,
    counts: { overlaps: overlaps.length, offscreen: offscreen.length, clipped: clipped.length },
  };
})();
'installed'
/* ── QA 자동 진입 ──
   `#qa` 해시로 열면 로비 → 바로 한 판 → 증강 1장 선택까지 자동으로 밟는다.
   HMR 이 페이지를 새로 고쳐도 같은 상태로 돌아온다. */
window.__qaEnter = function () {
  const tick = setInterval(() => {
    if (document.querySelector(".own-hand-rail")) return;
    const draft = document.querySelector(".draft-card");
    if (draft) {
      draft.click();
      return;
    }
    const quick = [...document.querySelectorAll("button")].find((b) =>
      b.textContent.includes("바로 한 판"),
    );
    if (quick) quick.click();
  }, 500);
  setTimeout(() => clearInterval(tick), 60000);
};
if (location.hash.includes("qa")) window.addEventListener("load", () => window.__qaEnter());

/** 크기를 바꾼 뒤 한 번 부른다 — 자동화 도구의 뷰포트 변경은 resize 이벤트를 안 낸다. */
window.__qaSize = function () {
  window.dispatchEvent(new Event("resize"));
  return [innerWidth, innerHeight, getComputedStyle(document.body).getPropertyValue("--ui-scale")].join(" ");
};

/** 한 줄 요약 — 스윕 기록용. */
window.__qaRun = function () {
  const p = window.__layoutProbe();
  const s = p.scale;
  const L = (v) => Math.round(v / s);
  return JSON.stringify({
    vp: p.vp.join("x"),
    s,
    vl: L(innerWidth) + "x" + L(innerHeight),
    pS: p.vars.panelPx,
    pL: L(p.vars.panelPx),
    hand: p.vars.handTilePx,
    ov: p.overlaps.filter((o) => o.pct >= 8).map((o) => o.a.split(" ")[1] + "X" + o.b.split(" ")[1] + ":" + o.pct),
    off: p.offscreen.map((o) => o.k + ":" + o.out),
    clip: p.clipped.map((c) => c.k + ":" + c.dx + "," + c.dy),
    sw: p.docScrollW,
  });
};
