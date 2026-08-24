/**
 * 탭 판정 프로브 — «눌리는가»를 실제 히트 테스트로 잰다.
 *
 * 레이아웃 겹침(probe.js)과는 다른 종류의 고장을 잡는다: 보이기는 하는데
 * 그 자리를 다른 무엇이 먼저 받아 **탭이 안 먹는** 경우다. 모바일에서 제일 흔하다
 * (투명한 오버레이, 화면을 덮는 안내, z-index 를 잘못 잡은 알약 등).
 *
 * 방법: 조작해야 하는 요소마다 안쪽 5점(가운데 + 네 귀퉁이에서 살짝 안쪽)을 찍어
 * `document.elementFromPoint` 가 그 요소나 그 후손을 돌려주는지 본다. 아니면
 * **무엇이 가로챘는지**를 함께 적는다. 터치 목표 크기(화면 px)도 같이 잰다.
 *
 * window.__tapProbe() → { blocked: [...], small: [...], counts }
 */
window.__tapProbe = function () {
  const TARGETS = [
    "button",
    "a[href]",
    "input",
    "select",
    "[role='button']",
    "[role='switch']",
    ".hand-tile",
    ".qt-item",
    ".act",
    ".aug-pill",
    ".icon-btn",
    ".draft-card",
    ".emote-toggle",
    ".emote-btn",
  ];
  const MIN_TOUCH = 44;
  const coarse = window.matchMedia("(pointer: coarse)").matches;

  const vis = (e) => {
    const s = getComputedStyle(e);
    if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) < 0.05) return false;
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    // 화면 밖은 «가려짐»이 아니라 «없음»이다 — offscreen 으로 따로 센다.
    return r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
  };
  const name = (e) => {
    if (!e) return "(null)";
    const cl = [...e.classList].slice(0, 3).join(".");
    return e.tagName.toLowerCase() + (cl ? "." + cl : "") + (e.id ? "#" + e.id : "");
  };
  const label = (e) => (e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 24);

  /*
   * 전체 화면 오버레이(증강 선택·정산·설정 등)가 떠 있으면, 그 **뒤에** 있는 것이
   * 안 눌리는 건 정상이다. 그럴 때는 오버레이보다 위(z 기준)에 실제로 서 있는 것만
   * 따진다 — 안 그러면 판 뒤의 버튼 수십 개가 «안 눌린다»로 쏟아져 진짜를 덮는다.
   */
  const overlay = [...document.querySelectorAll(".overlay, .result-overlay, .draft-panel")].find(
    (e) => {
      if (!vis(e)) return false;
      const r = e.getBoundingClientRect();
      return r.width > innerWidth * 0.7 && r.height > innerHeight * 0.5;
    },
  );
  const overlayZ = overlay ? Number(getComputedStyle(overlay).zIndex) || 50 : -1;
  const stackZ = (e) => {
    for (let n = e; n instanceof Element; n = n.parentElement) {
      const z = Number(getComputedStyle(n).zIndex);
      if (!Number.isNaN(z)) return z;
    }
    return 0;
  };
  const inScope = (e) => {
    if (!overlay) return true;
    return overlay.contains(e) || stackZ(e) >= overlayZ;
  };

  const seen = new Set();
  const els = [];
  for (const sel of TARGETS) {
    document.querySelectorAll(sel).forEach((e) => {
      if (!seen.has(e) && vis(e) && inScope(e)) {
        seen.add(e);
        els.push(e);
      }
    });
  }

  const blocked = [];
  const small = [];
  const offscreen = [];

  for (const e of els) {
    const r = e.getBoundingClientRect();
    const ix = Math.min(6, r.width / 3);
    const iy = Math.min(6, r.height / 3);
    const pts = [
      [r.left + r.width / 2, r.top + r.height / 2],
      [r.left + ix, r.top + iy],
      [r.right - ix, r.top + iy],
      [r.left + ix, r.bottom - iy],
      [r.right - ix, r.bottom - iy],
    ];
    let hits = 0;
    const blockers = new Map();
    for (const [x, y] of pts) {
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
      const at = document.elementFromPoint(x, y);
      if (at !== null && (at === e || e.contains(at) || at.contains(e))) {
        hits++;
      } else {
        const k = name(at);
        blockers.set(k, (blockers.get(k) || 0) + 1);
      }
    }
    if (hits === 0 && blockers.size > 0) {
      blocked.push({
        el: name(e),
        text: label(e),
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        by: [...blockers.entries()].map(([k, n]) => k + "×" + n),
        severity: "전부",
      });
    } else if (blockers.size > 0 && hits < 5) {
      blocked.push({
        el: name(e),
        text: label(e),
        rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        by: [...blockers.entries()].map(([k, n]) => k + "×" + n),
        severity: hits + "/5만 통과",
      });
    }

    // 화면 밖으로 반 이상 나간 것
    const outX = Math.max(0, -r.left) + Math.max(0, r.right - innerWidth);
    const outY = Math.max(0, -r.top) + Math.max(0, r.bottom - innerHeight);
    if (outX > r.width / 2 || outY > r.height / 2) {
      offscreen.push({ el: name(e), text: label(e), rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] });
    }

    if (coarse && (r.width < MIN_TOUCH || r.height < MIN_TOUCH)) {
      small.push({ el: name(e), text: label(e), size: Math.round(r.width) + "×" + Math.round(r.height) });
    }
  }

  // 같은 종류를 뭉쳐서 본다 (손패 13장이 13줄로 나오면 못 읽는다)
  const squash = (arr, keyFn) => {
    const m = new Map();
    for (const it of arr) {
      const k = keyFn(it);
      if (!m.has(k)) m.set(k, { ...it, n: 0 });
      m.get(k).n++;
    }
    return [...m.values()];
  };

  return {
    vp: [innerWidth, innerHeight],
    overlay: overlay ? name(overlay) + " z=" + overlayZ : null,
    coarse,
    scale: Number(getComputedStyle(document.body).getPropertyValue("--ui-scale")) || 1,
    checked: els.length,
    blocked: squash(blocked, (b) => b.el + "|" + b.by.join(",") + "|" + b.severity),
    offscreen: squash(offscreen, (o) => o.el),
    small: squash(small, (s) => s.el + "|" + s.size),
    counts: { blocked: blocked.length, offscreen: offscreen.length, small: small.length },
  };
};
