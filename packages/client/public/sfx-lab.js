/* MAJAK 효과음 랩 — UI 배선
 *
 * 바리에이션 정의는 sfx-sounds-*.js 에 있다. 여기는 목록·재생·선택·자가진단만.
 */
import { SOUNDS, VARIANTS } from "/sfx-registry.js?v=1";
import { unlock, setMaster, setEnv, loadSamples } from "/sfx-kit.js?v=1";
// 등록만 하면 되는 모듈들 — import 자체가 부수효과다
import "/sfx-sounds-current.js?v=1";
import "/sfx-sounds-ui.js?v=1";
import "/sfx-sounds-call.js?v=1";
import "/sfx-sounds-augment.js?v=1";
import "/sfx-sounds-declare.js?v=1";
import "/sfx-sounds-bigwin.js?v=1";
import "/sfx-sounds-flow.js?v=1";

const $ = (id) => document.getElementById(id);
const STORE_KEY = "sfxlab-stars";

let stars = new Set();
try {
  stars = new Set(JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]"));
} catch {
  /* 무시 */
}
const saveStars = () => localStorage.setItem(STORE_KEY, JSON.stringify([...stars]));

// ── 오디오 언락 — 첫 제스처에서 컨텍스트를 열고 실물 샘플을 받는다 ──
let unlocked = false;
function ensureAudio() {
  unlock();
  if (!unlocked) {
    unlocked = true;
    void loadSamples();
  }
}
window.addEventListener("pointerdown", ensureAudio, { capture: true });
window.addEventListener("keydown", ensureAudio, { capture: true });

// ── 목록 ──
function famsInOrder() {
  const fams = [];
  for (const s of SOUNDS) if (!fams.includes(s.fam)) fams.push(s.fam);
  return fams;
}

function variantsFor(soundKey) {
  // "현재 게임"(-current)을 맨 앞에, 나머지는 등록 순서
  const list = VARIANTS.filter((v) => v.sound === soundKey);
  list.sort((a, b) => Number(b.id.endsWith("-current")) - Number(a.id.endsWith("-current")));
  return list;
}

let seqTimers = [];
function stopSeq() {
  for (const t of seqTimers) clearTimeout(t);
  seqTimers = [];
}

function markPlaying(row, ms) {
  row.classList.add("playing");
  setTimeout(() => row.classList.remove("playing"), ms);
}

function playVariant(v, row, partKey) {
  ensureAudio();
  stopSeq();
  const sound = SOUNDS.find((s) => s.key === v.sound);
  try {
    if (partKey !== undefined || sound?.parts === undefined) {
      v.run(partKey);
      markPlaying(row, Math.min(3000, (v.dur ?? 0.5) * 1000 + 300));
      return;
    }
    // 세트의 ▶ = 구성원을 순서대로 (간격은 소리 길이에 맞춰)
    const gap = Math.max(700, Math.min(2600, (v.dur ?? 0.5) * 1000 + 350));
    sound.parts.forEach((p, i) => {
      seqTimers.push(setTimeout(() => v.run(p.key), i * gap));
    });
    markPlaying(row, sound.parts.length * gap);
  } catch (err) {
    console.error(`[sfx-lab] ${v.id} 재생 실패`, err);
  }
}

function buildVariantRow(v, sound) {
  const row = document.createElement("div");
  row.className = "variant" + (v.id.endsWith("-current") ? " is-current" : "");

  const play = document.createElement("button");
  play.className = "v-play";
  play.textContent = "▶";
  play.title = sound.parts !== undefined ? "세트 전체를 순서대로 재생" : "재생";
  play.addEventListener("click", () => playVariant(v, row, undefined));
  row.appendChild(play);

  const star = document.createElement("button");
  star.className = "v-star" + (stars.has(v.id) ? " on" : "");
  star.textContent = "★";
  star.title = "이 소리로 선택 (복수 선택 가능)";
  star.addEventListener("click", () => {
    if (stars.has(v.id)) stars.delete(v.id);
    else stars.add(v.id);
    star.classList.toggle("on", stars.has(v.id));
    saveStars();
    updatePickbar();
  });
  row.appendChild(star);

  const body = document.createElement("div");
  body.className = "v-body";
  body.innerHTML = `<div class="v-name"></div><div class="v-tag"></div>`;
  body.querySelector(".v-name").textContent = v.name;
  body.querySelector(".v-tag").textContent = v.tag;
  row.appendChild(body);

  if (sound.parts !== undefined) {
    const parts = document.createElement("div");
    parts.className = "v-parts";
    for (const p of sound.parts) {
      const b = document.createElement("button");
      b.className = "v-part";
      b.textContent = p.label;
      b.addEventListener("click", () => playVariant(v, row, p.key));
      parts.appendChild(b);
    }
    row.appendChild(parts);
  }

  const dur = document.createElement("span");
  dur.className = "v-dur";
  dur.textContent = `${(v.dur ?? 0).toFixed(1)}s`;
  row.appendChild(dur);
  return row;
}

function build() {
  const app = $("app");
  app.textContent = "";
  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = "브라우저 정책상 첫 클릭 후부터 소리가 납니다 · 회색 항목이 현재 게임에 들어 있는 소리";
  app.appendChild(hint);

  for (const fam of famsInOrder()) {
    const h = document.createElement("div");
    h.className = "fam-h";
    h.textContent = fam;
    app.appendChild(h);

    for (const sound of SOUNDS.filter((s) => s.fam === fam)) {
      const card = document.createElement("section");
      card.className = "sound";
      const head = document.createElement("div");
      head.className = "sound-h";
      head.innerHTML = `<span class="nm"></span>${sound.sync !== undefined ? `<span class="sync"></span>` : ""}<span class="when"></span>`;
      head.querySelector(".nm").textContent = sound.name;
      if (sound.sync !== undefined) head.querySelector(".sync").textContent = sound.sync;
      head.querySelector(".when").textContent = sound.when;
      card.appendChild(head);

      const vars = variantsFor(sound.key);
      if (vars.length === 0) {
        const empty = document.createElement("div");
        empty.className = "v-tag";
        empty.textContent = "(바리에이션 없음)";
        card.appendChild(empty);
      }
      for (const v of vars) card.appendChild(buildVariantRow(v, sound));
      app.appendChild(card);
    }
  }
  updatePickbar();
}

// ── 선택 내역 ──
function pickSummary() {
  const lines = [];
  for (const sound of SOUNDS) {
    const picked = VARIANTS.filter((v) => v.sound === sound.key && stars.has(v.id));
    if (picked.length === 0) continue;
    for (const v of picked) lines.push(`${sound.name}: ${v.name} (${v.id})`);
  }
  return lines.join("\n");
}

function updatePickbar() {
  $("pickCount").textContent = `선택 ${stars.size}개`;
}

$("btnCopy").addEventListener("click", async () => {
  const text = pickSummary();
  if (text === "") {
    $("pickCount").textContent = "선택된 항목이 없습니다";
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    $("pickCount").textContent = "복사 완료!";
  } catch {
    // 클립보드 권한이 없으면 프롬프트로 보여준다
    window.prompt("복사해서 전달해주세요:", text);
  }
  setTimeout(updatePickbar, 1500);
});

$("vol").addEventListener("input", (e) => {
  ensureAudio();
  setMaster(Number(e.target.value) / 100 * 1.28); // 70% ≈ 게임 기본 0.9
});

// ── 자가진단 — 모든 바리에이션을 오프라인 렌더해 무음/에러/피크를 본다 ──
async function renderOne(v, partKey) {
  const len = Math.ceil((Math.min(4, (v.dur ?? 0.5)) + 0.6) * 44100);
  const oac = new OfflineAudioContext(1, len, 44100);
  const out = oac.createGain();
  out.gain.value = 0.9;
  out.connect(oac.destination);
  setEnv({ ac: oac, out });
  let err = null;
  try {
    v.run(partKey);
  } catch (e) {
    err = e;
  }
  setEnv(null);
  if (err !== null) return { status: "error", detail: String(err) };
  const buf = await oac.startRendering();
  const d = buf.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < d.length; i++) {
    const a = Math.abs(d[i]);
    if (a > peak) peak = a;
  }
  if (!Number.isFinite(peak)) return { status: "error", detail: "NaN 출력" };
  if (peak < 0.001) return { status: "silent", detail: "무음" };
  return { status: "ok", detail: `peak ${peak.toFixed(2)}` };
}

$("btnTest").addEventListener("click", async () => {
  ensureAudio();
  const panel = $("testpanel");
  panel.hidden = false;
  panel.textContent = "진단 중…";
  const rows = [];
  let bad = 0;
  for (const v of VARIANTS) {
    const sound = SOUNDS.find((s) => s.key === v.sound);
    const parts = sound?.parts?.map((p) => p.key) ?? [undefined];
    for (const pk of parts) {
      const r = await renderOne(v, pk);
      const label = pk !== undefined ? `${v.id} [${pk}]` : v.id;
      const cls = r.status === "ok" ? "ok" : r.status === "silent" ? "warn" : "bad";
      if (r.status === "error") bad++;
      rows.push(`<div class="${cls}">${r.status === "ok" ? "✓" : r.status === "silent" ? "△" : "✗"} ${label} — ${r.detail}</div>`);
      console.log(`[selftest] ${label}: ${r.status} ${r.detail}`);
    }
  }
  panel.innerHTML =
    `<div><b>자가진단 — 에러 ${bad}건</b> (△ 무음은 샘플 미로드일 수 있음) ` +
    `<button class="btn" onclick="this.closest('.testpanel').hidden=true">닫기</button></div>` +
    rows.join("");
});

build();
console.log(`[sfx-lab] 바리에이션 ${VARIANTS.length}개 로드`);
