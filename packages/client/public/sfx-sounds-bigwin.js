/* 대형 화료(manganSet · yakuman) 바리에이션 — 키라키라 일본풍 팝 방향.
 * 현재 게임(트라이앵글 팡파르 / 공 롱테일)과 다른 재질: 오르골·하프·유리구슬·와다이코.
 */
import { def } from "/sfx-registry.js?v=1";
import { play, thump, noise, sparkle, tileBody, bell, pluck, popBend, coin, gliss, chord, note, rand } from "/sfx-kit.js?v=1";

// 오르골 부분음 / 유리구슬 부분음
const ORGEL = [[1, 1], [3.01, 0.25], [4.9, 0.1]];
const GLASS = [[1, 1], [2.32, 0.3], [4.25, 0.12]];

const RANK = { mangan: 1, haneman: 2, baiman: 3, sanbaiman: 4 };
const rankOf = (part) => RANK[part ?? "mangan"] ?? 1;

// ───────────────────────── manganSet ─────────────────────────

// 설계: 0.2s 임팩트에 오르골 근음이 울리고, 등급만큼 긴 펜타토닉 아르페지오가 폭포처럼 쏟아진다.
def({
  id: "manganSet-orgel-falls",
  sound: "manganSet",
  name: "오르골 폭포",
  tag: "임팩트 뒤 오르골 아르페지오 — 등급이 오를수록 폭포가 길어진다",
  dur: 2.5,
  run(part) {
    const r = rankOf(part);
    // 예열 0~0.2
    noise({ filter: "bandpass", freq: 600, freqTo: 2400, q: 1.6, dur: 0.18, gain: 0.05 + r * 0.008 });
    // 0.2 임팩트 — 저역 몸통 + 오르골 근음
    thump(0.2, { from: 140 - r * 10, to: 46 - r * 4, dur: 0.11 + r * 0.015, gain: 0.28 + r * 0.045 });
    noise({ at: 0.2, filter: "lowpass", freq: 460, dur: 0.1 + r * 0.02, gain: 0.16 + r * 0.03 });
    bell(0.2, { freq: note("C5"), gain: 0.12, dur: 0.6 + r * 0.15, partials: ORGEL });
    // 오르골 아르페지오 (C장조 펜타토닉 상행)
    const names = ["E5", "G5", "A5", "C6", "D6", "E6", "G6", "A6", "C7"];
    const count = Math.min(2 + 2 * r, names.length);
    const step = 0.105 - r * 0.007;
    for (let i = 0; i < count; i++) {
      const last = i === count - 1;
      bell(0.34 + i * step, {
        freq: note(names[i]),
        gain: 0.07 + i * 0.003,
        dur: last ? 0.7 + r * 0.1 : 0.35,
        partials: ORGEL,
      });
    }
    const end = 0.34 + (count - 1) * step;
    sparkle(end, { count: 3 + r * 3, base: 2000, spread: 1600, span: 0.25 + r * 0.12, gain: 0.045 });
    // 배만 이상: 저역 코드가 바닥을 받쳐 준다
    if (r >= 3) {
      chord(end + 0.05, { freqs: [note("C4"), note("G4"), note("E5")], dur: 0.8, type: "triangle", gain: 0.06, strum: 0.015 });
    }
  },
});

// 설계: 하프 픽업 2음 → 0.2s 임팩트 → 위로 흩날리는 글리산도. 등급이 오를수록 높이 올라가 add6 코드로 착지.
def({
  id: "manganSet-harp-hanafubuki",
  sound: "manganSet",
  name: "하프 꽃보라",
  tag: "임팩트 뒤 상행 하프 글리산도 — 등급만큼 높이 흩날린다",
  dur: 2.5,
  run(part) {
    const r = rankOf(part);
    // 픽업 (예열)
    pluck(0.04, { freq: note("G4"), gain: 0.06, dur: 0.14 });
    pluck(0.12, { freq: note("A4"), gain: 0.07, dur: 0.14 });
    // 0.2 임팩트 — 저역 몸통 + 낮은 하프 근음
    thump(0.2, { from: 150 - r * 12, to: 44 - r * 3, dur: 0.12 + r * 0.012, gain: 0.3 + r * 0.04 });
    noise({ at: 0.2, filter: "lowpass", freq: 520, dur: 0.1 + r * 0.02, gain: 0.17 + r * 0.03 });
    pluck(0.2, { freq: note("C4"), gain: 0.13, dur: 0.4 + r * 0.08, bright: 1.2 });
    // 상행 글리산도 — 등급만큼 높은 정상까지
    const span = 0.3 + r * 0.1;
    const top = ["C6", "E6", "G6", "C7"][r - 1];
    gliss(0.22, { from: note("C5"), to: note(top), steps: 6 + r * 2, span, dur: 0.09, type: "triangle", gain: 0.05 });
    // 착지 코드 (C add6 계열, 등급 따라 두꺼워진다)
    const end = 0.22 + span;
    const freqs = [note("C5"), note("E5"), note("G5")];
    if (r >= 2) freqs.push(note("A5"));
    if (r >= 3) freqs.push(note("C6"));
    if (r === 4) freqs.push(note("E6"));
    chord(end + 0.02, { freqs, dur: 0.5 + r * 0.18, type: "triangle", gain: 0.075, strum: 0.02 });
    sparkle(end + 0.1, { count: 3 + r * 3, base: 2100, spread: 1800, span: 0.3 + r * 0.1, gain: 0.05 });
    // 배만 이상: 메아리 글리산도 한 번 더
    if (r >= 3) {
      gliss(end + 0.15, { from: note("G5"), to: note("G6"), steps: 7, span: 0.25, dur: 0.07, type: "sine", gain: 0.035 });
    }
  },
});

// 설계: 0.2s 패 노크 임팩트 → 유리구슬이 통통 튀는 "뽀용" 계단. 등급만큼 계단이 길어지고 코인이 반짝 붙는다.
def({
  id: "manganSet-glass-poyon",
  sound: "manganSet",
  name: "유리구슬 뽀용",
  tag: "패 노크 임팩트 뒤 뽀용 계단 — 등급만큼 통통 올라간다",
  dur: 2.2,
  run(part) {
    const r = rankOf(part);
    // 예열 — 작은 뽀용 픽업
    popBend(0.06, { from: 520, to: 660, dur: 0.1, gain: 0.05 });
    // 0.2 임팩트 — 저역 + 패 노크 + 내려앉는 뽀옹
    thump(0.2, { from: 130 - r * 8, to: 42 - r * 3, dur: 0.1 + r * 0.015, gain: 0.28 + r * 0.045 });
    tileBody(0.2, { base: 560 - r * 40, gain: 0.12, dur: 0.07 });
    noise({ at: 0.2, filter: "lowpass", freq: 480, dur: 0.09 + r * 0.02, gain: 0.15 + r * 0.03 });
    popBend(0.21, { from: 990, to: 520, dur: 0.14, gain: 0.1 });
    // 뽀용 계단 (펜타토닉 상행)
    const names = ["C5", "D5", "E5", "G5", "A5", "C6"];
    const count = 2 + r;
    const step = 0.13 - r * 0.008;
    let lastAt = 0.4;
    let lastFreq = note(names[0]);
    for (let i = 0; i < count; i++) {
      const f = note(names[i]);
      const t = 0.4 + i * step;
      const last = i === count - 1;
      popBend(t, {
        from: f * 0.78,
        to: f,
        dur: 0.1,
        gain: 0.085 + i * 0.004,
        type: "sine",
        ...(last ? { vib: { rate: 9, depth: f * 0.015 } } : {}),
      });
      if (last) {
        lastAt = t;
        lastFreq = f;
      }
    }
    // 마지막 구슬은 유리 벨로 길게 울린다
    bell(lastAt, { freq: lastFreq, gain: 0.09, dur: 0.6 + r * 0.15, partials: GLASS });
    sparkle(lastAt, { count: 3 + r * 2, base: 2200, spread: 1500, span: 0.25 + r * 0.1, gain: 0.045 });
    // 하네만 이상: 코인 반짝
    if (r >= 2) coin(lastAt + 0.12, { freq: 1568, gain: 0.04 });
    if (r >= 3) coin(lastAt + 0.24, { freq: 2093, gain: 0.035 });
  },
});

// ───────────────────────── yakuman ─────────────────────────

// 설계: 겹 하프 글리산도가 0.45s까지 차오르고, 대형 슬램과 함께 오르골 대종 코드가 성당처럼 길게 울린다.
def({
  id: "yakuman-harp-cathedral",
  sound: "yakuman",
  name: "하프 대성당",
  tag: "겹 글리산도 예열 → 슬램 → 오르골 대종 코드 롱테일",
  dur: 2.6,
  run() {
    // 예열 0~0.45 — 두 겹 하프 글리산도 + 라이저
    gliss(0.0, { from: note("C4"), to: note("C6"), steps: 11, span: 0.4, dur: 0.09, type: "triangle", gain: 0.04 });
    gliss(0.1, { from: note("G4"), to: note("G6"), steps: 9, span: 0.32, dur: 0.08, type: "sine", gain: 0.035 });
    noise({ filter: "bandpass", freq: 400, freqTo: 3200, q: 1.8, dur: 0.44, gain: 0.06 });
    // 0.45 대형 임팩트
    thump(0.45, { from: 105, to: 26, dur: 0.22, gain: 0.5 });
    noise({ at: 0.45, filter: "lowpass", freq: 380, dur: 0.2, gain: 0.32 });
    play([{ freq: 48, at: 0.45, dur: 0.6, type: "sine", gain: 0.2, slideTo: 30 }]);
    // 대종 — 오르골 부분음 C장조 코드가 겹겹이 울린다
    bell(0.45, { freq: note("C4"), gain: 0.13, dur: 1.9, partials: ORGEL });
    bell(0.47, { freq: note("G4"), gain: 0.1, dur: 1.6, partials: ORGEL });
    bell(0.49, { freq: note("E5"), gain: 0.08, dur: 1.4, partials: ORGEL });
    bell(0.51, { freq: note("C6"), gain: 0.06, dur: 1.2, partials: ORGEL });
    // 롱테일 시머
    sparkle(0.75, { count: 12, base: 2200, spread: 2200, span: 1.1, gain: 0.04 });
    play([
      { freq: note("G6"), at: 0.8, dur: 1.0, type: "sine", gain: 0.03 },
      { freq: note("E7"), at: 0.95, dur: 0.9, type: "sine", gain: 0.02 },
    ]);
  },
});

// 설계: 와다이코 두 타로 예고하고 0.45s에 대북 슬램, 그 위로 꿈결 같은 오르골 멜로디가 떠오른다.
def({
  id: "yakuman-taiko-orgel",
  sound: "yakuman",
  name: "와다이코 오르골",
  tag: "북 두 번 예고 → 대북 슬램 → 꿈결 오르골 멜로디",
  dur: 2.9,
  run() {
    // 예고 북 2타 — 점점 크게 (음악적 예열)
    thump(0.02, { from: 92, to: 46, dur: 0.09, gain: 0.16 });
    noise({ at: 0.02, filter: "lowpass", freq: 320, dur: 0.06, gain: 0.08 });
    thump(0.24, { from: 96, to: 44, dur: 0.1, gain: 0.22 });
    noise({ at: 0.24, filter: "lowpass", freq: 340, dur: 0.07, gain: 0.11 });
    noise({ filter: "bandpass", freq: 500, freqTo: 2600, q: 1.6, dur: 0.43, gain: 0.05 });
    // 0.45 대북 슬램
    thump(0.45, { from: 82, to: 24, dur: 0.26, gain: 0.52 });
    noise({ at: 0.45, filter: "lowpass", freq: 300, dur: 0.22, gain: 0.34 });
    noise({ at: 0.45, filter: "bandpass", freq: 880, q: 0.8, dur: 0.05, gain: 0.14 });
    play([{ freq: 44, at: 0.45, dur: 0.7, type: "sine", gain: 0.2, slideTo: 28 }]);
    // 오르골 멜로디 (C장조 펜타토닉, 느긋하게)
    const mel = [["E6", 0.0], ["C6", 0.17], ["D6", 0.34], ["G5", 0.51], ["A5", 0.72], ["C6", 0.93]];
    for (let i = 0; i < mel.length; i++) {
      const last = i === mel.length - 1;
      bell(0.72 + mel[i][1], {
        freq: note(mel[i][0]),
        gain: last ? 0.09 : 0.075,
        dur: last ? 1.0 : 0.5,
        partials: ORGEL,
      });
    }
    sparkle(0.9, { count: 10, base: 2100, spread: 2000, span: 1.0, gain: 0.038 });
  },
});

// 설계: 3음 픽업이 차오르고 0.45s에 코드 슬램, 이어 사비 멜로디가 터지며 코인 비가 내린다.
def({
  id: "yakuman-idol-sabi",
  sound: "yakuman",
  name: "아이돌 사비 팡파르",
  tag: "3음 픽업 → 코드 슬램 → 사비 멜로디 + 코인 비",
  dur: 2.4,
  run() {
    // 예열 — 상행 픽업 + 라이저
    play([
      { freq: note("G4"), at: 0.08, dur: 0.09, type: "triangle", gain: 0.06 },
      { freq: note("A4"), at: 0.2, dur: 0.09, type: "triangle", gain: 0.075 },
      { freq: note("B4"), at: 0.32, dur: 0.1, type: "triangle", gain: 0.09 },
    ]);
    noise({ filter: "bandpass", freq: 600, freqTo: 3400, q: 1.6, dur: 0.42, gain: 0.06 });
    // 0.45 슬램 + 코드 히트
    thump(0.45, { from: 120, to: 30, dur: 0.18, gain: 0.46 });
    noise({ at: 0.45, filter: "lowpass", freq: 460, dur: 0.16, gain: 0.3 });
    chord(0.45, { freqs: [note("C4"), note("G4"), note("E5"), note("C6")], dur: 0.55, type: "triangle", gain: 0.09, strum: 0.012 });
    play([{ freq: note("C6"), at: 0.45, dur: 0.4, type: "square", gain: 0.04 }]);
    // 사비 멜로디 (상행해서 높이 매달린다)
    const mel = [["E5", 0.62], ["G5", 0.73], ["A5", 0.84], ["C6", 0.95], ["D6", 1.07], ["E6", 1.2]];
    const specs = [];
    for (let i = 0; i < mel.length; i++) {
      const last = i === mel.length - 1;
      specs.push({ freq: note(mel[i][0]), at: mel[i][1], dur: last ? 0.5 : 0.1, type: "triangle", gain: 0.1 + i * 0.004 });
      if (last) specs.push({ freq: note(mel[i][0]), at: mel[i][1], dur: 0.5, type: "square", gain: 0.04 });
    }
    play(specs);
    chord(1.2, { freqs: [note("C5"), note("G5")], dur: 0.7, type: "triangle", gain: 0.06 });
    // 코인 비 + 시머
    coin(1.3, { freq: 1568, gain: 0.04 });
    coin(1.42, { freq: 1976, gain: 0.038 });
    coin(1.55, { freq: 2349, gain: 0.034 });
    sparkle(1.3, { count: 12, base: 2300, spread: 2000, span: 0.8, gain: 0.045 });
  },
});

// 설계: 바람이 차오르고 0.45s 슬램+뽀옹, 이어 벚꽃잎처럼 하강 펜타토닉이 흩날리다 저음 오르골로 가라앉는다.
def({
  id: "yakuman-sakura-blizzard",
  sound: "yakuman",
  name: "벚꽃 눈보라",
  tag: "바람 예열 → 슬램+뽀옹 → 꽃잎 하강 펜타토닉 흩날림",
  dur: 3.0,
  run() {
    // 예열 — 바람 스웰 + 살랑 글리스
    noise({ filter: "lowpass", freq: 500, freqTo: 1600, dur: 0.42, gain: 0.09 });
    gliss(0.08, { from: note("A5"), to: note("A6"), steps: 7, span: 0.3, dur: 0.07, type: "sine", gain: 0.03 });
    sparkle(0.15, { count: 4, base: 1900, spread: 1200, span: 0.25, gain: 0.03 });
    // 0.45 임팩트 — 슬램 + 옥타브 내려앉는 뽀옹 + 유리 벨 근음
    thump(0.45, { from: 110, to: 27, dur: 0.2, gain: 0.48 });
    noise({ at: 0.45, filter: "lowpass", freq: 400, dur: 0.18, gain: 0.32 });
    popBend(0.46, { from: note("C6"), to: note("C5"), dur: 0.22, gain: 0.11, vib: { rate: 7, depth: 12 } });
    bell(0.45, { freq: note("C5"), gain: 0.11, dur: 1.4, partials: GLASS });
    // 꽃잎 하강 (펜타토닉, 살짝 흐트러진 타이밍)
    const petals = ["A6", "G6", "E6", "D6", "C6", "A5", "G5", "E5"];
    for (let i = 0; i < petals.length; i++) {
      play([
        {
          freq: note(petals[i]),
          at: 0.75 + i * 0.14 + rand(-0.02, 0.02),
          dur: 0.28,
          type: "sine",
          gain: 0.055 - i * 0.003,
        },
      ]);
    }
    sparkle(0.7, { count: 16, base: 2100, spread: 2400, span: 1.5, gain: 0.038 });
    // 저음 오르골로 착지
    bell(1.9, { freq: note("C4"), gain: 0.07, dur: 0.9, partials: ORGEL });
  },
});
