/* 현재 게임에 들어 있는 소리 — sfx.ts 를 그대로 포팅한 기준점.
 * 새 바리에이션과 비교할 수 있게 모든 사운드에 "현재" 항목을 등록한다.
 */
import { def } from "/sfx-registry.js?v=1";
import { play, thump, noise, sparkle, tileBody, clack, shot, rand } from "/sfx-kit.js?v=1";

const cur = (sound, dur, tag, run) =>
  def({ id: `${sound}-current`, sound, name: "현재 게임", tag, dur, run });

cur("hover", 0.06, "타패 녹음(discard.wav) 앞머리 50ms를 작게", () => {
  shot("discard", 0, 0.1, 0.05);
});

cur("slide", 0.05, "마른 노이즈 '칙' 28ms", () => {
  const v = rand(0.9, 1.1);
  noise({ filter: "bandpass", freq: 2400 * v, q: 1.2, dur: 0.028, gain: 0.06 });
  noise({ at: 0, filter: "highpass", freq: 5000, dur: 0.016, gain: 0.04 });
});

cur("callPrompt", 0.2, "부드러운 사인 차임 '삑'", () => {
  play([
    { freq: 1040, at: 0, dur: 0.13, type: "sine", gain: 0.05 },
    { freq: 2080, at: 0.005, dur: 0.09, type: "sine", gain: 0.016 },
  ]);
});

cur("score", 0.1, "square 1318Hz 짧은 틱", () => {
  play([{ freq: 1318, dur: 0.06, type: "square", gain: 0.05 }]);
});

cur("countTick", 1.0, "square 틱, 진행도 따라 880→1580Hz (1초 데모)", () => {
  for (let i = 0; i < 16; i++) {
    const p = i / 15;
    play([{ freq: 880 + p * 700, at: i * 0.055, dur: 0.035, type: "square", gain: 0.035 }]);
  }
});

cur("countDone", 0.4, "저역 thump + 2음 상승 종지", () => {
  thump(0, { from: 180, to: 60, dur: 0.08, gain: 0.22 });
  play([
    { freq: 1046, dur: 0.09, type: "triangle", gain: 0.09 },
    { freq: 1568, at: 0.06, dur: 0.18, type: "triangle", gain: 0.08 },
  ]);
});

def({
  id: "callSet-current",
  sound: "callSet",
  name: "현재 게임",
  tag: "합성 돌 클랙 — 치 660(딥) · 펑 820(드라이) · 깡 1060(우드)",
  dur: 0.25,
  run(part) {
    if (part === "chi") clack(660, 0.26, 0.065);
    else if (part === "kan") clack(1060, 0.22, 0.04);
    else clack(820, 0.24, 0.055);
  },
});

def({
  id: "augmentSet-current",
  sound: "augmentSet",
  name: "현재 게임",
  tag: "실물 북 '둥' — 피치드랍 몸통 + 가죽 노이즈 + 나무 테두리",
  dur: 0.5,
  run(part) {
    if (part === "soft") {
      thump(0.01, { from: 88, to: 42, dur: 0.12, gain: 0.17 });
      tileBody(0.015, { base: 280, gain: 0.055, dur: 0.07 });
      return;
    }
    const w = part === "heavy" ? 1 : 0;
    thump(0.02, { from: 96 - w * 16, to: 38, dur: 0.2 + w * 0.06, gain: 0.42 + w * 0.09 });
    noise({ at: 0.02, filter: "lowpass", freq: 300, dur: 0.09, gain: 0.18 });
    tileBody(0.025, { base: 300 - w * 60, gain: 0.09, dur: 0.09 });
  },
});

cur("riichi", 1.0, "패 눕히는 '탁'(call.wav) + 금속 벨 '샤킹—'", () => {
  shot("call", 0.08, 0.62);
  thump(0.08, { from: 200, to: 58, dur: 0.11, gain: 0.28 });
  play([
    { freq: 1245, at: 0.18, dur: 0.4, type: "triangle", gain: 0.07 },
    { freq: 1245 * 2.01, at: 0.18, dur: 0.34, type: "sine", gain: 0.05 },
    { freq: 1245 * 2.76, at: 0.19, dur: 0.28, type: "sine", gain: 0.035 },
  ]);
  sparkle(0.25, { count: 5, base: 2600, spread: 1800, span: 0.24, gain: 0.045 });
});

cur("ron", 1.2, "라이저 → 0.2s 슬램 + 서브베이스 → C-E-G-C 팡파르", () => {
  noise({ filter: "bandpass", freq: 500, freqTo: 3600, q: 1.8, dur: 0.18, gain: 0.07 });
  noise({ at: 0.2, filter: "lowpass", freq: 420, dur: 0.16, gain: 0.34 });
  noise({ at: 0.2, filter: "bandpass", freq: 1300, q: 0.9, dur: 0.06, gain: 0.22 });
  thump(0.2, { from: 130, to: 32, dur: 0.16, gain: 0.42 });
  play([{ freq: 88, at: 0.2, dur: 0.34, type: "sine", gain: 0.26, slideTo: 30 }]);
  play([
    { freq: 523, at: 0.38, dur: 0.11, type: "triangle", gain: 0.11 },
    { freq: 523, at: 0.38, dur: 0.11, type: "square", gain: 0.04 },
    { freq: 659, at: 0.47, dur: 0.11, type: "triangle", gain: 0.12 },
    { freq: 784, at: 0.56, dur: 0.13, type: "triangle", gain: 0.13 },
    { freq: 1046, at: 0.66, dur: 0.3, type: "triangle", gain: 0.13 },
    { freq: 1046, at: 0.66, dur: 0.3, type: "square", gain: 0.045 },
  ]);
  sparkle(0.7, { count: 6, base: 2100, spread: 1600, span: 0.25, gain: 0.05 });
});

cur("tsumo", 1.1, "픽업 2음 → 높은 슬램 '딱!' → 밝고 빠른 팡파르", () => {
  play([
    { freq: 392, at: 0.06, dur: 0.07, type: "triangle", gain: 0.07 },
    { freq: 494, at: 0.13, dur: 0.07, type: "triangle", gain: 0.08 },
  ]);
  thump(0.2, { from: 220, to: 62, dur: 0.11, gain: 0.36 });
  noise({ at: 0.2, filter: "bandpass", freq: 2600, q: 1.2, dur: 0.05, gain: 0.24 });
  noise({ at: 0.2, filter: "lowpass", freq: 600, dur: 0.1, gain: 0.2 });
  play([
    { freq: 659, at: 0.33, dur: 0.1, type: "triangle", gain: 0.11 },
    { freq: 784, at: 0.41, dur: 0.1, type: "triangle", gain: 0.12 },
    { freq: 1046, at: 0.49, dur: 0.12, type: "triangle", gain: 0.13 },
    { freq: 1318, at: 0.58, dur: 0.28, type: "triangle", gain: 0.12 },
    { freq: 1318, at: 0.58, dur: 0.28, type: "square", gain: 0.04 },
  ]);
  sparkle(0.62, { count: 6, base: 2400, spread: 1800, span: 0.22, gain: 0.05 });
});

def({
  id: "manganSet-current",
  sound: "manganSet",
  name: "현재 게임",
  tag: "등급 따라 팡파르 4→7음 + 코인 캐스케이드 (하네만+)",
  dur: 2.0,
  run(part) {
    const rank = { mangan: 1, haneman: 2, baiman: 3, sanbaiman: 4 }[part ?? "mangan"] ?? 1;
    noise({ filter: "bandpass", freq: 400, freqTo: 3000, q: 1.8, dur: 0.18, gain: 0.07 });
    thump(0.2, { from: 150 - rank * 8, to: 40 - rank * 2, dur: 0.12 + rank * 0.01, gain: 0.3 + rank * 0.04 });
    noise({ at: 0.2, filter: "lowpass", freq: 500, dur: 0.12, gain: 0.2 + rank * 0.03 });
    const scale = [523, 659, 784, 1046, 1318, 1568, 2093];
    const notes = 3 + rank;
    const step = 0.1 - rank * 0.008;
    const specs = [];
    for (let i = 0; i < notes; i++) {
      const last = i === notes - 1;
      specs.push({ freq: scale[i], at: 0.36 + i * step, dur: last ? 0.34 : 0.11, type: "triangle", gain: 0.11 + i * 0.004 });
      if (last) specs.push({ freq: scale[i], at: 0.36 + i * step, dur: 0.34, type: "square", gain: 0.05 });
    }
    play(specs);
    const fanEnd = 0.36 + notes * step;
    sparkle(fanEnd - 0.05, { count: 4 + rank * 3, base: 2100, spread: 2200, span: 0.3 + rank * 0.1, gain: 0.05 });
    if (rank >= 2) {
      for (let i = 0; i < rank * 2; i++) {
        const t0 = fanEnd + i * 0.07 + rand(0, 0.02);
        const f0 = rand(1900, 2600);
        play([
          { freq: f0, at: t0, dur: 0.03, type: "square", gain: 0.04 },
          { freq: f0 * 1.5, at: t0 + 0.03, dur: 0.06, type: "square", gain: 0.035 },
        ]);
      }
    }
  },
});

cur("yakuman", 2.4, "0.45s 라이저 → 대형 슬램 → 공(gong) 롱테일 → 시머", () => {
  // 라이저는 kit 어휘 밖(생 오실레이터)이라 slideTo 로 근사한다
  play([{ freq: 70, slideTo: 620, at: 0, dur: 0.45, type: "sawtooth", gain: 0.11, attack: 0.35 }]);
  noise({ filter: "bandpass", freq: 300, freqTo: 5200, q: 2, dur: 0.45, gain: 0.09 });
  thump(0.45, { from: 100, to: 26, dur: 0.22, gain: 0.5 });
  noise({ at: 0.45, filter: "lowpass", freq: 380, dur: 0.2, gain: 0.4 });
  play([{ freq: 42, at: 0.45, dur: 0.7, type: "sine", gain: 0.26, slideTo: 30 }]);
  const gong = 98;
  play([
    { freq: gong, at: 0.45, dur: 1.4, type: "triangle", gain: 0.14 },
    { freq: gong * 2.05, at: 0.45, dur: 1.2, type: "sine", gain: 0.09 },
    { freq: gong * 2.76, at: 0.47, dur: 1.1, type: "sine", gain: 0.06 },
    { freq: gong * 4.07, at: 0.47, dur: 0.9, type: "sine", gain: 0.04 },
    { freq: gong * 5.43, at: 0.49, dur: 0.7, type: "sine", gain: 0.025 },
  ]);
  sparkle(0.7, { count: 14, base: 2200, spread: 2600, span: 1.0, gain: 0.04 });
  play([
    { freq: 2093, at: 0.75, dur: 1.0, type: "sine", gain: 0.03 },
    { freq: 3136, at: 0.85, dur: 0.9, type: "sine", gain: 0.02 },
  ]);
});

cur("round", 0.45, "2음 상승 (392→523)", () => {
  play([
    { freq: 392, dur: 0.16, gain: 0.09 },
    { freq: 523, at: 0.12, dur: 0.28, gain: 0.1 },
  ]);
});

cur("draft", 0.3, "2음 상승 (587→880)", () => {
  play([
    { freq: 587, dur: 0.1, gain: 0.07 },
    { freq: 880, at: 0.08, dur: 0.16, gain: 0.08 },
  ]);
});

cur("pick", 0.35, "2음 상승 (784→1175)", () => {
  play([
    { freq: 784, dur: 0.1, gain: 0.1 },
    { freq: 1175, at: 0.07, dur: 0.24, gain: 0.1 },
  ]);
});

cur("draw", 0.5, "조용한 2음 하강 (440→349)", () => {
  play([
    { freq: 440, dur: 0.2, gain: 0.08 },
    { freq: 349, at: 0.16, dur: 0.3, gain: 0.08 },
  ]);
});

def({
  id: "yakuSteps-current",
  sound: "yakuSteps",
  name: "현재 게임",
  tag: "펜타토닉 계단 상승 + 노이즈 스탬프",
  dur: 1.2,
  run(part) {
    const count = Number(part ?? "6");
    const penta = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    const n = Math.min(count, penta.length);
    const startAt = 0.15;
    const step = 0.09;
    const specs = [];
    for (let i = 0; i < n; i++) {
      specs.push({ freq: 523 * 2 ** (penta[i] / 12), at: startAt + i * step, dur: 0.09, type: "triangle", gain: 0.07 });
    }
    play(specs);
    for (let i = 0; i < n; i++) {
      noise({ at: startAt + i * step, filter: "bandpass", freq: 1600, q: 1.2, dur: 0.03, gain: 0.06 });
    }
  },
});
