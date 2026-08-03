/* 흐름·결과 사운드 바리에이션 — round / draft / pick / draw / yakuSteps
 * 무드: 일본식 팝 + 미소녀 초능력 + 리치마작. 오르골·하프·유리·벚꽃, 그리고 패의 실물감.
 */
import { def } from "/sfx-registry.js?v=1";
import { play, thump, noise, sparkle, tileBody, bell, pluck, popBend, coin, gliss, chord, note } from "/sfx-kit.js?v=1";

// 오르골 부분음 세트 (권장 비율)
const ORGEL = [[1, 1], [3.01, 0.25], [4.9, 0.1]];
// 장조 펜타토닉 반음 오프셋 (10계단)
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];

// ───────── round — 새 국 시작 (전환 신호, ≤0.6s) ─────────

// 의도: 오르골 뚜껑이 열리듯 2음(G5→C6)이 상승하고 옅은 키라키라가 스며든다 — "새 아침" 전환.
def({
  id: "round-orgel-dawn",
  sound: "round",
  name: "오르골 여명",
  tag: "오르골 2음 상승(G5→C6) + 옅은 반짝임",
  dur: 0.6,
  run() {
    bell(0, { freq: note("G5"), gain: 0.075, dur: 0.38, partials: ORGEL });
    bell(0.13, { freq: note("C6"), gain: 0.085, dur: 0.45, partials: [[1, 1], [3.01, 0.22], [4.9, 0.08]] });
    sparkle(0.2, { count: 4, base: 2400, spread: 1200, span: 0.22, gain: 0.035 });
  },
});

// 의도: 하프 글리산도가 벚꽃잎처럼 위로 흩날린 뒤 장조 코드로 사뿐히 내려앉는다.
def({
  id: "round-sakura-harp",
  sound: "round",
  name: "벚꽃 하프",
  tag: "상승 글리산도 → 장조 코드 착지",
  dur: 0.6,
  run() {
    gliss(0, { from: note("C5"), to: note("A5"), steps: 5, span: 0.14, dur: 0.09, type: "triangle", gain: 0.045 });
    chord(0.16, { freqs: [note("C5"), note("E5"), note("G5")], dur: 0.3, type: "triangle", gain: 0.045, strum: 0.02 });
  },
});

// 의도: 마작패 "탁" 한 번이 개국을 선언하고 따뜻한 차임 하나가 뒤를 받친다 — 실물감+반짝임 공존.
def({
  id: "round-tile-chime",
  sound: "round",
  name: "패 탁 차임",
  tag: "패 노크 한 번 + 차임 한 알",
  dur: 0.55,
  run() {
    tileBody(0, { base: 720, gain: 0.08, dur: 0.06 });
    noise({ at: 0, filter: "highpass", freq: 4800, dur: 0.012, gain: 0.03 });
    bell(0.09, { freq: note("C6"), gain: 0.08, dur: 0.38, partials: ORGEL });
  },
});

// ───────── draft — 드래프트 카드 등장 (카드가 펼쳐지는 느낌, ≤0.5s) ─────────

// 의도: 종이 부채가 "샤라락" 위로 쓸리는 노이즈 스와이프 끝에 작은 핑 — 카드가 펼쳐졌다.
def({
  id: "draft-card-fan",
  sound: "draft",
  name: "카드 샤라락",
  tag: "종이 스와이프(밴드패스 상승) + 작은 핑",
  dur: 0.4,
  run() {
    noise({ at: 0, filter: "bandpass", freq: 900, freqTo: 3200, q: 1.4, dur: 0.16, gain: 0.055 });
    play([{ freq: note("A5"), at: 0.16, dur: 0.14, type: "sine", gain: 0.065 }]);
    sparkle(0.14, { count: 3, base: 2200, spread: 1000, span: 0.12, gain: 0.03 });
  },
});

// 의도: 펜타토닉 3음 하프 뜯기(D5→G5→A5)가 부채꼴로 벌어진다 — 카드 한 장 한 장의 감촉.
def({
  id: "draft-harp-fan",
  sound: "draft",
  name: "하프 부채꼴",
  tag: "하프 3음이 부채처럼 펼쳐진다",
  dur: 0.4,
  run() {
    pluck(0, { freq: note("D5"), gain: 0.05, dur: 0.18, bright: 1.1 });
    pluck(0.07, { freq: note("G5"), gain: 0.055, dur: 0.18, bright: 1.1 });
    pluck(0.14, { freq: note("A5"), gain: 0.06, dur: 0.22, bright: 1.1 });
  },
});

// 의도: 카드가 "뽀용" 하고 폴짝 튀어나온다 — 위로 벤드 + 잔비브라토, 끝에 반짝 한 점.
def({
  id: "draft-poyon",
  sound: "draft",
  name: "카드 뽀용",
  tag: "위로 튀는 뽀용 벤드 + 반짝 한 점",
  dur: 0.35,
  run() {
    popBend(0, { from: note("G4"), to: note("E5"), dur: 0.12, gain: 0.08, type: "sine", vib: { rate: 9, depth: 12 } });
    play([{ freq: note("E6"), at: 0.13, dur: 0.08, type: "sine", gain: 0.045 }]);
  },
});

// ───────── pick — 드래프트 픽 확정 (확정감, ≤0.5s) ─────────

// 의도: 낮은 도장 "쿵" 한 번이 찍히고 밝은 오르골 종이 뒤따른다 — 무게 있는 확정.
def({
  id: "pick-stamp-bell",
  sound: "pick",
  name: "도장 쿵 종",
  tag: "도장 한 방 + 오르골 종 확정",
  dur: 0.45,
  run() {
    thump(0, { from: 150, to: 55, dur: 0.08, gain: 0.1 });
    tileBody(0.005, { base: 620, gain: 0.035, dur: 0.05 });
    bell(0.08, { freq: note("A5"), gain: 0.09, dur: 0.32, partials: [[1, 1], [3.01, 0.2], [4.9, 0.08]] });
  },
});

// 의도: 받침음 위에서 부드러운 2단 코인 핑 — "획득했다"는 게임적 기쁨.
def({
  id: "pick-coin-chime",
  sound: "pick",
  name: "코인 짤랑",
  tag: "받침 톤 + 부드러운 2단 코인 핑",
  dur: 0.3,
  run() {
    play([{ freq: note("C5"), at: 0, dur: 0.1, type: "triangle", gain: 0.08 }]);
    coin(0.02, { freq: note("E6"), gain: 0.04 });
  },
});

// 의도: 패 감촉 살짝 + 유리구슬 2음 상승(E6→G6) — 투명하고 가벼운 확정.
def({
  id: "pick-glass-bead",
  sound: "pick",
  name: "유리구슬",
  tag: "패 촉감 + 유리질 벨 2음 상승",
  dur: 0.45,
  run() {
    tileBody(0, { base: 900, gain: 0.05, dur: 0.04 });
    bell(0.02, { freq: note("E6"), gain: 0.075, dur: 0.2, partials: [[1, 1], [2.76, 0.22]] });
    bell(0.11, { freq: note("G6"), gain: 0.085, dur: 0.3, partials: [[1, 1], [2.76, 0.18]] });
  },
});

// ───────── draw — 유국 (조용·차분·약간 쓸쓸, ≤0.8s) ─────────

// 의도: 로우패스 바람이 한숨처럼 내려앉고 낮은 오르골 한 음만 남는다.
def({
  id: "draw-wind-sigh",
  sound: "draw",
  name: "바람 한숨",
  tag: "내려앉는 바람 + 낮은 오르골 한 음",
  dur: 0.7,
  run() {
    noise({ at: 0, filter: "lowpass", freq: 1200, freqTo: 350, dur: 0.35, gain: 0.045 });
    bell(0.18, { freq: note("A4"), gain: 0.055, dur: 0.5, partials: [[1, 1], [3.01, 0.15]] });
  },
});

// 의도: 오르골이 해질녘처럼 3음(E5→C5→A4) 내려간다 — 협화 하강, 쓸쓸하지만 순하게.
def({
  id: "draw-orgel-dusk",
  sound: "draw",
  name: "오르골 노을",
  tag: "오르골 3음 하강 (E5→C5→A4)",
  dur: 0.8,
  run() {
    bell(0, { freq: note("E5"), gain: 0.05, dur: 0.28, partials: ORGEL });
    bell(0.16, { freq: note("C5"), gain: 0.05, dur: 0.28, partials: ORGEL });
    bell(0.32, { freq: note("A4"), gain: 0.055, dur: 0.42, partials: ORGEL });
  },
});

// 의도: 먼 데서 풍경(風鈴)이 드문드문 울리고 미풍이 스친다 — 텅 빈 탁자의 여백.
def({
  id: "draw-far-chime",
  sound: "draw",
  name: "먼 풍경",
  tag: "드문드문한 풍경 3음 + 미풍",
  dur: 0.75,
  run() {
    noise({ at: 0, filter: "lowpass", freq: 500, dur: 0.5, gain: 0.02 });
    play([
      { freq: note("A5"), at: 0, dur: 0.3, type: "sine", gain: 0.04, attack: 0.02 },
      { freq: note("E5"), at: 0.24, dur: 0.35, type: "sine", gain: 0.038, attack: 0.02 },
      { freq: note("D5"), at: 0.44, dur: 0.3, type: "sine", gain: 0.035, attack: 0.025 },
    ]);
  },
});

// ───────── yakuSteps — 역 스탬프 계단 (스탬프당 ≤0.12s, gain ≤0.1) ─────────

// 의도: 역 하나마다 오르골 종이 한 알씩 — 펜타토닉으로 올라가는 종알갱이 계단.
def({
  id: "yakuSteps-orgel-stairs",
  sound: "yakuSteps",
  name: "오르골 계단",
  tag: "스탬프마다 오르골 종 한 알, 펜타토닉 상승",
  dur: 1.2,
  run(part) {
    const n = Math.min(Number(part ?? "6"), PENTA.length);
    for (let i = 0; i < n; i++) {
      const f = note("E5") * 2 ** (PENTA[i] / 12);
      bell(0.15 + i * 0.09, { freq: f, gain: 0.055, dur: 0.11, partials: [[1, 1], [3.01, 0.2], [4.9, 0.07]] });
    }
  },
});

// 의도: 물방울이 "포롱" 하나씩 떨어진다 — 음 아래에서 벤드로 미끄러져 들어가는 스탬프.
def({
  id: "yakuSteps-water-drops",
  sound: "yakuSteps",
  name: "물방울 계단",
  tag: "스탬프마다 위로 벤드하는 물방울, 펜타토닉 상승",
  dur: 1.1,
  run(part) {
    const n = Math.min(Number(part ?? "6"), PENTA.length);
    for (let i = 0; i < n; i++) {
      const f = note("G5") * 2 ** (PENTA[i] / 12);
      popBend(0.15 + i * 0.09, { from: f * 0.82, to: f, dur: 0.07, gain: 0.06, type: "sine" });
    }
  },
});

// 의도: 고토(箏) 현을 한 줄씩 뜯어 올라간다 — 나무 결의 스탬프, 화면과 같은 화풍.
def({
  id: "yakuSteps-koto-stairs",
  sound: "yakuSteps",
  name: "고토 계단",
  tag: "스탬프마다 고토 뜯기 한 번, 펜타토닉 상승",
  dur: 1.1,
  run(part) {
    const n = Math.min(Number(part ?? "6"), PENTA.length);
    for (let i = 0; i < n; i++) {
      const f = note("D5") * 2 ** (PENTA[i] / 12);
      pluck(0.15 + i * 0.09, { freq: f, gain: 0.05, dur: 0.1, bright: 0.9 });
    }
  },
});
