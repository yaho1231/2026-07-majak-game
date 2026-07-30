/* MAJAK 증강 연출 랩 — UI 배선
 *
 * 연출 정의는 fx-effects-*.js 에 있다. 여기는 목록·재생·속도만 다룬다.
 */

import { S, alive, anim, buildStage, fitCanvas, fitStage, resetStage, setSpeed, token } from "/fx-core.js?v=6";
import { EFFECTS } from "/fx-registry.js?v=6";
// 등록만 하면 되는 모듈들 — import 자체가 부수효과다
import "/fx-effects-1.js?v=6";
import "/fx-effects-2.js?v=6";
import "/fx-effects-3.js?v=6";

const FAM_ORDER = [
  "3D · 물리",
  "캔버스 입자",
  "마스크 · 스캔",
  "SVG 필터",
  "파괴 · 임팩트",
  "시간 · 궤적",
];
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
