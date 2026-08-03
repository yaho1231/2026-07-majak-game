/* UI·피드백 계열 바리에이션 — hover / slide / callPrompt / score / countTick / countDone
 * 방향 축: 오르골 마이크로 톡 · 유리구슬 · 뽀용 마이크로벤드 · 고토 플럭 · 파스텔 코인.
 * 전부 합성 — 현재 게임(샘플·square 틱·생 노이즈)과 뚜렷이 다른 결을 노린다.
 */
import { def } from "/sfx-registry.js?v=2";
import { play, thump, noise, sparkle, tileBody, bell, pluck, popBend, coin, gliss, chord, rand } from "/sfx-kit.js?v=2";

// ───────── hover — 손패 훑기 (≤0.06s, 초당 31회 연타 대비 오실레이터 1~2개) ─────────

// 오르골 실린더 핀이 살짝 걸리는 초소형 "톡" — 기음 + 3.01배 부분음 한 점, 연타 시 반짝이는 타라라락
def({
  id: "hover-orgel", sound: "hover", name: "오르골 톡", tag: "오르골 핀 초소형 톡 (기음+부분음 1점, ±2% 랜덤)", dur: 0.06,
  run() {
    const f = 1568 * rand(0.98, 1.02);
    play([
      { freq: f, dur: 0.03, type: "sine", gain: 0.055 },
      { freq: f * 3.01, dur: 0.016, type: "sine", gain: 0.012 },
    ]);
  },
});

// 유리구슬끼리 살짝 닿는 "톡" — tileBody 비조화 부분음을 고음역으로 올려 유리 질감
def({
  id: "hover-marble", sound: "hover", name: "유리구슬 톡", tag: "고음 유리구슬 접촉음 (비조화 1.62배 부분음)", dur: 0.06,
  run() {
    tileBody(0, { base: 1750, gain: 0.05, dur: 0.028 });
  },
});

// 물방울이 튀는 초소형 상행 마이크로벤드 — 꼬리 없는 "뾰옹"의 최소 단위
def({
  id: "hover-poyo", sound: "hover", name: "뽀용 마이크로", tag: "45ms 상행 마이크로 피치벤드 (사인 1개)", dur: 0.06,
  run() {
    const v = rand(0.95, 1.05);
    popBend(0, { from: 820 * v, to: 1180 * v, dur: 0.045, gain: 0.06, type: "sine" });
  },
});

// ───────── slide — 패 슬라이드 (≤0.05s, 마른 마찰, 톤 최소) ─────────

// 벚꽃잎을 손끝으로 쓸어내리는 하강 스윕 — 밴드패스 중심이 아래로 미끄러진다
def({
  id: "slide-sakura", sound: "slide", name: "벚꽃 스치기", tag: "하강 밴드패스 스윕 32ms (3.4k→2k)", dur: 0.05,
  run() {
    noise({ filter: "bandpass", freq: 3400, freqTo: 2000, q: 1.3, dur: 0.032, gain: 0.055 });
  },
});

// 마른 화지(和紙)를 넘기는 "착" — 고역 사각임 + 중역 몸통 두 겹
def({
  id: "slide-paper", sound: "slide", name: "화지 착", tag: "종이 질감 2겹 노이즈 (고역 사각임+중역 몸통)", dur: 0.05,
  run() {
    noise({ filter: "highpass", freq: 4400, dur: 0.02, gain: 0.038 });
    noise({ filter: "bandpass", freq: 1500, q: 1, dur: 0.026, gain: 0.05 });
  },
});

// 비단 위를 미끄러지는 상행 스윕 — 좁은 Q로 "사락" 결만 남긴다
def({
  id: "slide-silk", sound: "slide", name: "비단 사락", tag: "상행 밴드패스 스윕 38ms (1.6k→3.2k, 좁은 Q)", dur: 0.05,
  run() {
    noise({ filter: "bandpass", freq: 1600, freqTo: 3200, q: 2.2, dur: 0.038, gain: 0.05 });
  },
});

// ───────── callPrompt — 후로 버튼 등장 (≤0.35s, 놀라지 않는 알림) ─────────

// 오르골 한 음이 조용히 열리는 차임 — 저역 사인 받침으로 포근하게
def({
  id: "callPrompt-orgel", sound: "callPrompt", name: "오르골 차임", tag: "C6 오르골 벨 한 음 + 옥타브 아래 받침", dur: 0.3,
  run() {
    bell(0, { freq: 1046, gain: 0.07, dur: 0.3, partials: [[1, 1], [3.01, 0.22], [4.9, 0.08]] });
    play([{ freq: 523, dur: 0.18, type: "sine", gain: 0.03 }]);
  },
});

// 하프를 위로 살짝 훑고 꼭대기 음이 남는 "살랑" — 초대하는 손짓
def({
  id: "callPrompt-harp", sound: "callPrompt", name: "하프 살랑", tag: "4음 상행 글리산도 + 꼭대기 음 여운", dur: 0.3,
  run() {
    gliss(0, { from: 1046, to: 1760, steps: 4, span: 0.14, dur: 0.09, type: "sine", gain: 0.05 });
    play([{ freq: 1760, at: 0.16, dur: 0.12, type: "sine", gain: 0.05 }]);
  },
});

// "저기요?" 하고 고개를 내미는 상행 뽀용 — 잔비브라토로 말랑하게
def({
  id: "callPrompt-poyo", sound: "callPrompt", name: "뽀용 노크", tag: "상행 피치벤드 D5→A5 + 잔비브라토 + 고음 메아리", dur: 0.28,
  run() {
    popBend(0, { from: 587, to: 880, dur: 0.13, gain: 0.07, type: "sine", vib: { rate: 9, depth: 12 } });
    play([{ freq: 1760, at: 0.12, dur: 0.1, type: "sine", gain: 0.03 }]);
  },
});

// ───────── score — 점수 틱 (1발, ≤0.12s) ─────────

// 파스텔 톤으로 눌러 둔 2단 코인 핑 — 점수=동전의 직관
def({
  id: "score-pastelcoin", sound: "score", name: "파스텔 코인", tag: "G6 2단 코인 핑 (square, 낮은 게인)", dur: 0.12,
  run() {
    coin(0, { freq: 1568, gain: 0.045 });
  },
});

// 유리잔 가장자리를 손톱으로 "틱" — 사인 기음 + 2.76배 유리 부분음
def({
  id: "score-glass", sound: "score", name: "유리 틱", tag: "C7 유리 틱 (기음+비조화 부분음 1점)", dur: 0.08,
  run() {
    play([
      { freq: 2093, dur: 0.05, type: "sine", gain: 0.06 },
      { freq: 2093 * 2.76, at: 0.001, dur: 0.028, type: "sine", gain: 0.015 },
    ]);
  },
});

// 고토 현을 짧게 한 번 뜯는 "틩" — 필터가 빨리 닫혀 마른 나무 결
def({
  id: "score-koto", sound: "score", name: "고토 틱", tag: "D6 고토 플럭 90ms", dur: 0.1,
  run() {
    pluck(0, { freq: 1175, gain: 0.065, dur: 0.09, bright: 0.9 });
  },
});

// ───────── countTick — 카운트업 틱 (run은 16틱 1초 데모, 틱당 dur≤0.05·gain≤0.05) ─────────

// 오르골 핀이 계단을 오르는 방울 틱 — 진행도 따라 완전5도 상승
def({
  id: "countTick-orgel", sound: "countTick", name: "오르골 방울 계단", tag: "사인+부분음 틱, C6→G6 상승 (1초 데모)", dur: 1.0,
  run() {
    for (let i = 0; i < 16; i++) {
      const p = i / 15;
      const f = 1046 * 2 ** ((p * 7) / 12);
      play([
        { freq: f, at: i * 0.055, dur: 0.03, type: "sine", gain: 0.038 },
        { freq: f * 3.01, at: i * 0.055, dur: 0.016, type: "sine", gain: 0.01 },
      ]);
    }
  },
});

// 유리구슬이 유리 계단을 또르르 오르는 틱 — 비조화 부분음의 구슬 질감
def({
  id: "countTick-marble", sound: "countTick", name: "유리구슬 계단", tag: "tileBody 유리 틱, 1.3k→2.05k 상승 (1초 데모)", dur: 1.0,
  run() {
    for (let i = 0; i < 16; i++) {
      const p = i / 15;
      tileBody(i * 0.055, { base: 1300 + p * 750, gain: 0.04, dur: 0.026 });
    }
  },
});

// 물방울이 통통 튀며 높아지는 틱 — 틱마다 상행 마이크로벤드
def({
  id: "countTick-drop", sound: "countTick", name: "물방울 카운트", tag: "상행 마이크로벤드 틱, 880→1470Hz (1초 데모)", dur: 1.0,
  run() {
    for (let i = 0; i < 16; i++) {
      const p = i / 15;
      const f = 880 + p * 590;
      popBend(i * 0.055, { from: f * 0.86, to: f, dur: 0.04, gain: 0.045, type: "sine" });
    }
  },
});

// ───────── countDone — 카운트업 피니시 (≤0.45s, 피크 ≤0.25) ─────────

// 하프 글리산도가 벚꽃처럼 올라가 오르골 벨로 맺는 종지
def({
  id: "countDone-sakura", sound: "countDone", name: "벚꽃 종지", tag: "상행 하프 글리스 → G6 오르골 벨", dur: 0.42,
  run() {
    gliss(0, { from: 784, to: 1568, steps: 5, span: 0.12, dur: 0.06, gain: 0.045 });
    bell(0.15, { freq: 1568, gain: 0.1, dur: 0.26, partials: [[1, 1], [3.01, 0.22], [4.9, 0.08]] });
  },
});

// 도장 "쿵" 위에 C장조 파스텔 화음이 살짝 벌어지며 얹히는 마무리
def({
  id: "countDone-pastelchord", sound: "countDone", name: "파스텔 화음 도장", tag: "저역 thump + C장조 4음 스트럼", dur: 0.4,
  run() {
    thump(0, { from: 160, to: 58, dur: 0.07, gain: 0.14 });
    noise({ filter: "lowpass", freq: 700, dur: 0.05, gain: 0.07 });
    chord(0.03, { freqs: [523, 659, 784, 1046], dur: 0.24, type: "triangle", gain: 0.05, strum: 0.012 });
  },
});

// 고토 두 음(G5→C6)으로 맺고 키라키라가 흩날리는 종지
def({
  id: "countDone-koto", sound: "countDone", name: "고토 종지", tag: "고토 2음 종지 + 잔 키라키라", dur: 0.45,
  run() {
    pluck(0, { freq: 784, gain: 0.08, dur: 0.12 });
    pluck(0.1, { freq: 1046, gain: 0.09, dur: 0.28, bright: 1.1 });
    sparkle(0.18, { count: 4, base: 2300, spread: 1400, span: 0.16, gain: 0.04 });
  },
});
