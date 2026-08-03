/* 선언·화료 바리에이션 — riichi / ron / tsumo
 * 방향: 오르골·하프·뽀용·코인/유리 4계열. 현재 게임(금속 벨·브라스풍 팡파르)과
 * 뚜렷이 다른 "일본식 팝 + 미소녀" 결을 노린다.
 */
import { def } from "/sfx-registry.js?v=1";
import { play, thump, noise, sparkle, tileBody, bell, pluck, popBend, coin, gliss, chord, note } from "/sfx-kit.js?v=1";

const ORGEL = [[1, 1], [3.01, 0.25], [4.9, 0.1]];

// ───────── riichi — 리치 선언 (타격 0.08~0.2s, 배너 0.2s, ≤1.3s) ─────────

// 패를 눕히는 "탁" 뒤에 오르골 3음(A장조 상행)이 결의를 노래한다 — 긴장 속의 귀여움
def({
  id: "riichi-orgel-tok",
  sound: "riichi",
  name: "오르골 톡",
  tag: "패 '탁' + 오르골 A-C#-E 상행 아르페지오",
  dur: 1.1,
  run() {
    tileBody(0.1, { base: 900, gain: 0.2, dur: 0.06 });
    thump(0.1, { from: 190, to: 60, dur: 0.09, gain: 0.2 });
    noise({ at: 0.1, filter: "highpass", freq: 5200, dur: 0.012, gain: 0.05 });
    bell(0.2, { freq: note("A5"), gain: 0.11, dur: 0.55, partials: ORGEL });
    bell(0.33, { freq: note("C#6"), gain: 0.09, dur: 0.45, partials: ORGEL });
    bell(0.46, { freq: note("E6"), gain: 0.08, dur: 0.5, partials: ORGEL });
    sparkle(0.55, { count: 5, base: 2500, spread: 1200, span: 0.28, gain: 0.04 });
  },
});

// 배너가 꽂히는 순간 비브라토 실린 "뽀용↑" — 리치를 가장 사랑스럽게 선언하는 방향
def({
  id: "riichi-sakura-poyon",
  sound: "riichi",
  name: "벚꽃 뽀용",
  tag: "패 '탁' + 0.2s 뽀용 피치벤드 + 꽃잎 글리스",
  dur: 0.95,
  run() {
    tileBody(0.12, { base: 840, gain: 0.2, dur: 0.055 });
    thump(0.12, { from: 170, to: 55, dur: 0.08, gain: 0.18 });
    popBend(0.2, { from: 660, to: 990, dur: 0.16, gain: 0.13, type: "sine", vib: { rate: 9, depth: 18 } });
    gliss(0.4, { from: 1568, to: 2637, steps: 5, span: 0.16, dur: 0.07, type: "sine", gain: 0.045 });
    sparkle(0.48, { count: 5, base: 2400, spread: 1400, span: 0.24, gain: 0.045 });
  },
});

// 탁 직후 하프 펜타토닉 런이 위로 쓸려 올라가 결의를 봉인 — 화풍(和風) 현악 방향
def({
  id: "riichi-harp-vow",
  sound: "riichi",
  name: "하프 서약",
  tag: "패 '탁' + 하프 펜타토닉 상행 런 + 오르골 정점",
  dur: 1.15,
  run() {
    tileBody(0.1, { base: 880, gain: 0.2, dur: 0.06 });
    thump(0.1, { from: 180, to: 58, dur: 0.09, gain: 0.19 });
    const run = ["C5", "D5", "E5", "G5", "A5", "C6"];
    for (let i = 0; i < run.length; i++) {
      pluck(0.2 + i * 0.045, { freq: note(run[i]), gain: 0.07, dur: 0.18, bright: 1.1 });
    }
    bell(0.48, { freq: note("E6"), gain: 0.09, dur: 0.5, partials: ORGEL });
    sparkle(0.56, { count: 5, base: 2600, spread: 1200, span: 0.26, gain: 0.04 });
  },
});

// 가장 절제된 방향 — 유리 풍경 딸랑 두 음(완전5도)만 남겨 서늘한 긴장을 만든다
def({
  id: "riichi-glass-chime",
  sound: "riichi",
  name: "유리 풍경",
  tag: "패 '탁' + 유리 차임 E6-B6 완전5도, 미니멀",
  dur: 1.0,
  run() {
    tileBody(0.1, { base: 1000, gain: 0.19, dur: 0.05 });
    thump(0.1, { from: 200, to: 62, dur: 0.08, gain: 0.18 });
    noise({ at: 0.1, filter: "highpass", freq: 5400, dur: 0.01, gain: 0.045 });
    bell(0.2, { freq: note("E6"), gain: 0.1, dur: 0.7, partials: [[1, 1], [2.76, 0.2], [5.4, 0.06]] });
    bell(0.32, { freq: note("B6"), gain: 0.06, dur: 0.6, partials: [[1, 1], [2.76, 0.15]] });
    sparkle(0.42, { count: 3, base: 2700, spread: 1000, span: 0.2, gain: 0.035 });
  },
});

// ───────── ron — 론 (라이저 → 0.2s 슬램 → 프레이즈, ≤1.5s) ─────────

// 라이저 → 슬램 → 트라이어드 스탭 3연발로 끝맺는 아이돌 팝 팡파르 — 무대 위 결정 포즈
def({
  id: "ron-idol-fanfare",
  sound: "ron",
  name: "아이돌 팡파르",
  tag: "라이저 → 슬램 → C-G-C 코드 스탭 3연발",
  dur: 1.35,
  run() {
    noise({ filter: "bandpass", freq: 400, freqTo: 3200, q: 1.6, dur: 0.19, gain: 0.07 });
    gliss(0.02, { from: note("E4"), to: note("E5"), steps: 6, span: 0.15, dur: 0.06, type: "triangle", gain: 0.04 });
    thump(0.2, { from: 120, to: 34, dur: 0.15, gain: 0.4 });
    noise({ at: 0.2, filter: "lowpass", freq: 420, dur: 0.14, gain: 0.28 });
    noise({ at: 0.2, filter: "bandpass", freq: 1200, q: 0.9, dur: 0.05, gain: 0.16 });
    chord(0.36, { freqs: [note("C5"), note("E5"), note("G5")], dur: 0.12, type: "triangle", gain: 0.07, strum: 0.012 });
    chord(0.5, { freqs: [note("D5"), note("G5"), note("B5")], dur: 0.12, type: "triangle", gain: 0.07, strum: 0.012 });
    chord(0.64, { freqs: [note("E5"), note("G5"), note("C6")], dur: 0.34, type: "triangle", gain: 0.08, strum: 0.012 });
    play([{ freq: note("C6"), at: 0.664, dur: 0.32, type: "square", gain: 0.04 }]);
    sparkle(0.72, { count: 6, base: 2200, spread: 1600, span: 0.26, gain: 0.05 });
  },
});

// 큰북 한 방의 묵직함 뒤에 오르골이 하행으로 답한다 — 무거움과 귀여움의 대비
def({
  id: "ron-taiko-orgel",
  sound: "ron",
  name: "북과 오르골",
  tag: "저역 스웰 → 큰북 슬램 → 오르골 하행 C6-A5-G5-E5",
  dur: 1.4,
  run() {
    play([{ freq: 65, slideTo: 130, at: 0, dur: 0.2, type: "sine", gain: 0.15, attack: 0.15 }]);
    noise({ filter: "bandpass", freq: 350, freqTo: 2400, q: 1.6, dur: 0.19, gain: 0.06 });
    thump(0.2, { from: 95, to: 30, dur: 0.2, gain: 0.45 });
    noise({ at: 0.2, filter: "lowpass", freq: 350, dur: 0.16, gain: 0.3 });
    tileBody(0.205, { base: 220, gain: 0.08, dur: 0.09 });
    bell(0.42, { freq: note("C6"), gain: 0.1, dur: 0.4, partials: ORGEL });
    bell(0.56, { freq: note("A5"), gain: 0.09, dur: 0.4, partials: ORGEL });
    bell(0.7, { freq: note("G5"), gain: 0.085, dur: 0.4, partials: ORGEL });
    bell(0.84, { freq: note("E5"), gain: 0.08, dur: 0.55, partials: ORGEL });
    sparkle(0.9, { count: 5, base: 2100, spread: 1400, span: 0.3, gain: 0.04 });
  },
});

// 하프 글리스가 라이저를 겸하고, 슬램 후 하행 캐스케이드로 점수가 내 쪽으로 흘러든다
def({
  id: "ron-harp-grab",
  sound: "ron",
  name: "하프 강탈",
  tag: "하프 상행 라이저 → 슬램 → 펜타토닉 하행 캐스케이드",
  dur: 1.4,
  run() {
    gliss(0.0, { from: note("C5"), to: note("C6"), steps: 7, span: 0.17, dur: 0.06, type: "sine", gain: 0.045 });
    noise({ filter: "bandpass", freq: 600, freqTo: 3000, q: 1.5, dur: 0.19, gain: 0.06 });
    thump(0.2, { from: 110, to: 32, dur: 0.16, gain: 0.4 });
    noise({ at: 0.2, filter: "lowpass", freq: 400, dur: 0.14, gain: 0.26 });
    play([{ freq: 90, at: 0.2, dur: 0.28, type: "sine", gain: 0.2, slideTo: 35 }]);
    const cas = ["C6", "A5", "G5", "E5", "D5", "C5"];
    for (let i = 0; i < cas.length; i++) {
      pluck(0.34 + i * 0.07, { freq: note(cas[i]), gain: 0.09 - i * 0.005, dur: 0.22, bright: 1.2 });
    }
    chord(0.78, { freqs: [note("C4"), note("G4")], dur: 0.5, type: "triangle", gain: 0.07 });
    sparkle(0.82, { count: 5, base: 2100, spread: 1500, span: 0.28, gain: 0.045 });
  },
});

// 슬램 뒤 상행 코인 3단 — 상대 점수를 짤랑짤랑 긁어오는 정산의 소리
def({
  id: "ron-coin-sweep",
  sound: "ron",
  name: "코인 정산",
  tag: "라이저 → 슬램 → 코인 핑 3단 상행 + 오르골 마침",
  dur: 1.35,
  run() {
    noise({ filter: "bandpass", freq: 450, freqTo: 2800, q: 1.6, dur: 0.19, gain: 0.065 });
    play([{ freq: note("G4"), slideTo: note("G5"), at: 0.02, dur: 0.17, type: "triangle", gain: 0.05, attack: 0.1 }]);
    thump(0.2, { from: 115, to: 33, dur: 0.15, gain: 0.42 });
    noise({ at: 0.2, filter: "lowpass", freq: 430, dur: 0.14, gain: 0.28 });
    coin(0.38, { freq: 1568, gain: 0.045 });
    coin(0.52, { freq: 1760, gain: 0.045 });
    coin(0.66, { freq: 2093, gain: 0.05 });
    bell(0.8, { freq: note("C6"), gain: 0.1, dur: 0.5, partials: ORGEL });
    sparkle(0.86, { count: 6, base: 2300, spread: 1500, span: 0.26, gain: 0.05 });
  },
});

// ───────── tsumo — 쯔모 (론보다 밝고 가볍게, 0.2s 임팩트, ≤1.4s) ─────────

// 가벼운 "딱" 뒤 코인 핑과 오르골 벨 2음 — 스스로 뽑아낸 상금의 반짝임
def({
  id: "tsumo-coin-shine",
  sound: "tsumo",
  name: "코인 샤인",
  tag: "픽업 2음 → 밝은 슬램 → 코인 핑 + 벨 E6-G6",
  dur: 1.1,
  run() {
    play([
      { freq: note("G4"), at: 0.05, dur: 0.06, type: "triangle", gain: 0.06 },
      { freq: note("B4"), at: 0.12, dur: 0.06, type: "triangle", gain: 0.07 },
    ]);
    thump(0.2, { from: 240, to: 70, dur: 0.09, gain: 0.3 });
    noise({ at: 0.2, filter: "bandpass", freq: 2400, q: 1.2, dur: 0.045, gain: 0.16 });
    noise({ at: 0.2, filter: "lowpass", freq: 700, dur: 0.08, gain: 0.14 });
    coin(0.3, { freq: 1976, gain: 0.05 });
    bell(0.42, { freq: note("E6"), gain: 0.08, dur: 0.4, partials: ORGEL });
    bell(0.54, { freq: note("G6"), gain: 0.07, dur: 0.45, partials: ORGEL });
    sparkle(0.58, { count: 6, base: 2400, spread: 1500, span: 0.24, gain: 0.05 });
  },
});

// 임팩트 직후 하프 글리스가 한 번에 위로 — 바람이 훑고 지나가는 상쾌함
def({
  id: "tsumo-harp-breeze",
  sound: "tsumo",
  name: "하프 산들바람",
  tag: "라이저 → 밝은 '딱' → 하프 글리스 상행 + 플럭 정점",
  dur: 1.0,
  run() {
    noise({ filter: "bandpass", freq: 900, freqTo: 2800, q: 1.4, dur: 0.17, gain: 0.05 });
    thump(0.2, { from: 260, to: 75, dur: 0.08, gain: 0.28 });
    tileBody(0.2, { base: 1000, gain: 0.12, dur: 0.05 });
    gliss(0.28, { from: note("G5"), to: note("G6"), steps: 6, span: 0.14, dur: 0.07, type: "triangle", gain: 0.05 });
    pluck(0.44, { freq: note("E6"), gain: 0.09, dur: 0.3, bright: 1.1 });
    sparkle(0.5, { count: 6, base: 2500, spread: 1400, span: 0.24, gain: 0.05 });
  },
});

// 작은 뽀용 예열 → 임팩트 → 큰 뽀용이 옥타브를 튀어오른다 — 가장 귀여운 자축
def({
  id: "tsumo-poyon",
  sound: "tsumo",
  name: "뽀용 완성",
  tag: "뽀용 픽업 → 슬램 → 옥타브 점프 뽀용 + 꽃잎 글리스",
  dur: 1.0,
  run() {
    popBend(0.08, { from: 520, to: 780, dur: 0.1, gain: 0.07 });
    thump(0.2, { from: 230, to: 65, dur: 0.09, gain: 0.3 });
    noise({ at: 0.2, filter: "bandpass", freq: 2000, q: 1.1, dur: 0.04, gain: 0.14 });
    popBend(0.3, { from: 784, to: 1568, dur: 0.18, gain: 0.12, type: "sine", vib: { rate: 10, depth: 30 } });
    gliss(0.52, { from: 1760, to: 2794, steps: 4, span: 0.13, dur: 0.06, type: "sine", gain: 0.04 });
    sparkle(0.58, { count: 5, base: 2500, spread: 1300, span: 0.22, gain: 0.045 });
  },
});

// 슬램 뒤 오르골 장3화음이 빠르게 상행 — 아침 햇살처럼 맑은 완성감
def({
  id: "tsumo-orgel-morning",
  sound: "tsumo",
  name: "아침 오르골",
  tag: "라이저 → 슬램 → 오르골 C-E-G 상행 + 키라키라",
  dur: 1.2,
  run() {
    noise({ filter: "bandpass", freq: 700, freqTo: 2600, q: 1.4, dur: 0.17, gain: 0.05 });
    thump(0.2, { from: 220, to: 68, dur: 0.09, gain: 0.28 });
    noise({ at: 0.2, filter: "lowpass", freq: 650, dur: 0.08, gain: 0.12 });
    bell(0.3, { freq: note("C6"), gain: 0.09, dur: 0.4, partials: ORGEL });
    bell(0.42, { freq: note("E6"), gain: 0.085, dur: 0.4, partials: ORGEL });
    bell(0.54, { freq: note("G6"), gain: 0.08, dur: 0.5, partials: ORGEL });
    sparkle(0.6, { count: 7, base: 2400, spread: 1600, span: 0.3, gain: 0.05 });
  },
});
