/* 증강 발동음 바리에이션 — augmentSet (soft/light/heavy 3단 세트)
 *
 * 방향: 후로의 밝은 클랙과 계열이 다른 저역+신비 계열.
 * 각 바리에이션은 같은 재질의 3단 — soft 는 light 의 축소판, heavy 는 확대판.
 */
import { def } from "/sfx-registry.js?v=2";
import { play, thump, noise, sparkle, bell, popBend, gliss, rand } from "/sfx-kit.js?v=2";

// ① 와다이코 "둥" 위로 신사 방울(스즈)이 은은히 울린다 — 북의 실물감 + 영적인 잔향
def({
  id: "augmentSet-wadaiko-suzu",
  sound: "augmentSet",
  name: "큰북과 방울",
  tag: "와다이코 저역 '둥' + 스즈(신사 방울) 여운 — 실물감과 신비의 겹",
  dur: 0.6,
  run(part) {
    const det = rand(0.99, 1.01);
    if (part === "soft") {
      thump(0, { from: 80, to: 44, dur: 0.09, gain: 0.1 });
      bell(0.03, { freq: 1046 * det, gain: 0.055, dur: 0.2, partials: [[1, 1], [2.05, 0.35], [2.76, 0.18]] });
      return;
    }
    if (part === "heavy") {
      thump(0, { from: 78, to: 30, dur: 0.22, gain: 0.4 });
      noise({ at: 0, filter: "lowpass", freq: 220, dur: 0.11, gain: 0.14 });
      bell(0.09, { freq: 784 * det, gain: 0.1, dur: 0.5, partials: [[1, 1], [2.05, 0.5], [2.76, 0.28], [4.07, 0.14]] });
      sparkle(0.18, { count: 5, base: 2000, spread: 1300, span: 0.3, gain: 0.035 });
      return;
    }
    thump(0, { from: 92, to: 36, dur: 0.16, gain: 0.3 });
    noise({ at: 0, filter: "lowpass", freq: 260, dur: 0.08, gain: 0.1 });
    bell(0.07, { freq: 1046 * det, gain: 0.085, dur: 0.34, partials: [[1, 1], [2.05, 0.35], [2.76, 0.18]] });
  },
});

// ② 저역 붐이 깔리고 하프 글리스가 피어올라 벨로 맺힌다 — 마법진이 열리는 그림
def({
  id: "augmentSet-mahoujin",
  sound: "augmentSet",
  name: "마법진 개화",
  tag: "저역 붐 → 하프 글리산도 상승 → 벨 착지 — 마법소녀식 발동",
  dur: 0.7,
  run(part) {
    if (part === "soft") {
      gliss(0, { from: 784, to: 1568, steps: 3, span: 0.07, dur: 0.06, type: "sine", gain: 0.035 });
      bell(0.09, { freq: 1568, gain: 0.06, dur: 0.18, partials: [[1, 1], [2.0, 0.2]] });
      return;
    }
    if (part === "heavy") {
      thump(0, { from: 95, to: 32, dur: 0.2, gain: 0.36 });
      noise({ at: 0, filter: "lowpass", freq: 280, dur: 0.1, gain: 0.13 });
      gliss(0.06, { from: 523, to: 2093, steps: 7, span: 0.2, dur: 0.08, type: "sine", gain: 0.045 });
      bell(0.28, { freq: 1046, gain: 0.09, dur: 0.42, partials: [[1, 1], [2.0, 0.3], [3.01, 0.12]] });
      bell(0.3, { freq: 1568, gain: 0.07, dur: 0.4, partials: [[1, 1], [2.0, 0.2]] });
      sparkle(0.3, { count: 6, base: 2100, spread: 1500, span: 0.3, gain: 0.04 });
      return;
    }
    thump(0, { from: 110, to: 40, dur: 0.14, gain: 0.26 });
    noise({ at: 0, filter: "lowpass", freq: 320, dur: 0.07, gain: 0.09 });
    gliss(0.05, { from: 523, to: 1568, steps: 5, span: 0.14, dur: 0.07, type: "sine", gain: 0.04 });
    bell(0.21, { freq: 1568, gain: 0.08, dur: 0.3, partials: [[1, 1], [2.0, 0.22], [3.01, 0.1]] });
  },
});

// ③ 깊은 곳에서 부풀어 오르는 저음 뽀용 + 수면 위 시머 — 귀엽지만 심연에서 오는 마법 팝
def({
  id: "augmentSet-shinkai-poyon",
  sound: "augmentSet",
  name: "심해 뽀용",
  tag: "저음 사인 피치벤드 '뽀용' + 서브 쿠션 + 위쪽 시머 반짝임",
  dur: 0.6,
  run(part) {
    if (part === "soft") {
      popBend(0, { from: 196, to: 294, dur: 0.13, gain: 0.13, type: "sine", vib: { rate: 10, depth: 9 } });
      play([{ freq: 2349, at: 0.05, dur: 0.06, type: "sine", gain: 0.03 }]);
      return;
    }
    if (part === "heavy") {
      popBend(0.02, { from: 82, to: 196, dur: 0.32, gain: 0.36, type: "sine", vib: { rate: 7, depth: 5 } });
      play([{ freq: 49, at: 0, dur: 0.3, type: "sine", gain: 0.13 }]);
      sparkle(0.16, { count: 8, base: 1800, spread: 1600, span: 0.34, gain: 0.045 });
      play([{ freq: 1175, at: 0.34, dur: 0.2, type: "triangle", gain: 0.05 }]);
      return;
    }
    popBend(0, { from: 98, to: 220, dur: 0.24, gain: 0.3, type: "sine", vib: { rate: 8, depth: 6 } });
    play([{ freq: 65, at: 0, dur: 0.2, type: "sine", gain: 0.09 }]);
    sparkle(0.1, { count: 5, base: 1700, spread: 1300, span: 0.22, gain: 0.04 });
  },
});

// ④ 서브 드랍의 고동 위에 오르골 아르페지오가 얹힌다 — 태엽 감긴 초능력의 정갈한 발동
def({
  id: "augmentSet-orgel-shindo",
  sound: "augmentSet",
  name: "오르골 심동",
  tag: "서브 피치드랍 '쿵' + 오르골 음색(G→C→E) 아르페지오",
  dur: 0.75,
  run(part) {
    const ORGEL = [[1, 1], [3.01, 0.25], [4.9, 0.1]];
    if (part === "soft") {
      thump(0, { from: 64, to: 40, dur: 0.07, gain: 0.07 });
      bell(0, { freq: 1046, gain: 0.09, dur: 0.24, partials: ORGEL });
      return;
    }
    if (part === "heavy") {
      thump(0, { from: 72, to: 26, dur: 0.24, gain: 0.34 });
      noise({ at: 0, filter: "lowpass", freq: 240, dur: 0.09, gain: 0.1 });
      bell(0.05, { freq: 784, gain: 0.08, dur: 0.34, partials: ORGEL });
      bell(0.15, { freq: 1046, gain: 0.09, dur: 0.38, partials: ORGEL });
      bell(0.25, { freq: 1318, gain: 0.1, dur: 0.45, partials: ORGEL });
      sparkle(0.32, { count: 6, base: 2200, spread: 1600, span: 0.3, gain: 0.04 });
      return;
    }
    thump(0, { from: 84, to: 32, dur: 0.18, gain: 0.28 });
    bell(0.04, { freq: 784, gain: 0.08, dur: 0.32, partials: ORGEL });
    bell(0.14, { freq: 1046, gain: 0.09, dur: 0.36, partials: ORGEL });
  },
});
