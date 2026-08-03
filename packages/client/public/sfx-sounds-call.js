/* sfx-sounds-call.js — callSet(치·펑·깡) 바리에이션 4종
 * 공통 설계: 마작 "탁" 코어(clack/tileBody) 한 방 + 작은 귀여운 틴트.
 * 3종은 같은 재질에서 무게만 다르게 — 치=낮고 둥글게, 펑=중간·드라이, 깡=높고 짧게.
 */
import { def } from "/sfx-registry.js?v=1";
import { noise, tileBody, clack, bell, pluck, popBend, note } from "/sfx-kit.js?v=1";

// ① 도자기 잔을 내려놓는 클랙 직후 오르골 한 알이 반짝 — 실물감 위에 키라키라 여운
def({
  id: "callSet-porcelain-bell",
  sound: "callSet",
  name: "도자기 풍경",
  tag: "도자기 클랙 + 오르골 벨 틴트 — 치 E5 · 펑 A5 · 깡 C6",
  dur: 0.26,
  run(part) {
    const ORGEL = [[1, 1], [3.01, 0.25], [4.9, 0.1]];
    if (part === "chi") {
      clack(620, 0.2, 0.07);
      bell(0.012, { freq: note("E5"), gain: 0.05, dur: 0.2, partials: ORGEL });
    } else if (part === "kan") {
      clack(1020, 0.18, 0.04);
      bell(0.008, { freq: note("C6"), gain: 0.04, dur: 0.12, partials: ORGEL });
    } else {
      clack(820, 0.2, 0.055);
      bell(0.01, { freq: note("A5"), gain: 0.045, dur: 0.16, partials: ORGEL });
    }
  },
});

// ② 벚나무 우드블록 "톡" 뒤에 고토 현 하나를 살짝 뜯는다 — 화풍(和風) 담백한 결
def({
  id: "callSet-woodblock-koto",
  sound: "callSet",
  name: "벚나무 고토",
  tag: "우드블록 톡 + 고토 플럭 틴트 — 치 A4 · 펑 D5 · 깡 G5",
  dur: 0.26,
  run(part) {
    if (part === "chi") {
      tileBody(0, { base: 520, gain: 0.18, dur: 0.075 });
      noise({ filter: "bandpass", freq: 1400, q: 1.4, dur: 0.03, gain: 0.12 });
      pluck(0.018, { freq: note("A4"), gain: 0.07, dur: 0.2, bright: 0.8 });
    } else if (part === "kan") {
      tileBody(0, { base: 920, gain: 0.15, dur: 0.045 });
      noise({ filter: "bandpass", freq: 2400, q: 1.4, dur: 0.02, gain: 0.1 });
      pluck(0.012, { freq: note("G5"), gain: 0.055, dur: 0.12, bright: 1 });
    } else {
      tileBody(0, { base: 700, gain: 0.17, dur: 0.06 });
      noise({ filter: "bandpass", freq: 1900, q: 1.4, dur: 0.025, gain: 0.11 });
      pluck(0.015, { freq: note("D5"), gain: 0.065, dur: 0.16, bright: 0.9 });
    }
  },
});

// ③ 클랙 반 박자 뒤 파스텔 "뽀용" 상승 벤드 — 미소녀 게임 결의 귀여운 확인음
def({
  id: "callSet-pastel-poyon",
  sound: "callSet",
  name: "파스텔 뽀용",
  tag: "돌 클랙 + 사인 피치벤드 뽀용 — 치 G4→C5 · 펑 C5→E5 · 깡 E5→A5",
  dur: 0.24,
  run(part) {
    if (part === "chi") {
      clack(640, 0.2, 0.07);
      popBend(0.025, { from: note("G4"), to: note("C5"), dur: 0.13, gain: 0.07 });
    } else if (part === "kan") {
      clack(1040, 0.17, 0.04);
      popBend(0.018, { from: note("E5"), to: note("A5"), dur: 0.09, gain: 0.06, vib: { rate: 18, depth: 12 } });
    } else {
      clack(820, 0.19, 0.055);
      popBend(0.02, { from: note("C5"), to: note("E5"), dur: 0.11, gain: 0.065 });
    }
  },
});

// ④ 유리구슬끼리 맞부딪는 "칭—" — 틴트 없이 클랙의 재질 자체를 유리로 바꾼 방향
def({
  id: "callSet-glass-marble",
  sound: "callSet",
  name: "유리구슬",
  tag: "유리 비조화 부분음 탭 + 미세 하이 팁 — 치 880 · 펑 1100 · 깡 1320Hz",
  dur: 0.24,
  run(part) {
    const GLASS = [[1, 1], [2.32, 0.3], [3.86, 0.1]];
    if (part === "chi") {
      tileBody(0, { base: 600, gain: 0.09, dur: 0.05 });
      bell(0.002, { freq: 880, gain: 0.13, dur: 0.1, partials: GLASS });
      noise({ filter: "highpass", freq: 6200, dur: 0.01, gain: 0.045 });
    } else if (part === "kan") {
      tileBody(0, { base: 900, gain: 0.08, dur: 0.035 });
      bell(0.002, { freq: 1320, gain: 0.11, dur: 0.06, partials: GLASS });
      noise({ filter: "highpass", freq: 7000, dur: 0.008, gain: 0.04 });
    } else {
      tileBody(0, { base: 760, gain: 0.09, dur: 0.045 });
      bell(0.002, { freq: 1100, gain: 0.12, dur: 0.08, partials: GLASS });
      noise({ filter: "highpass", freq: 6600, dur: 0.009, gain: 0.045 });
    }
  },
});
