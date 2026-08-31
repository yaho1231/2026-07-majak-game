/**
 * P1 — 카운터(직격 +3판) × 등 떠밀기(직격 +2판).
 *
 * 같은 사람(p0)이 둘 다 들고, 같은 상대(p1)를 «먼저 리치를 건 사람»이자
 * «떠밀린 사람»으로 두고 p1에게서 직격 론.
 *
 * 예측:
 *  - 단독 counter: 손값 + (손+3판 − 손) 뱅크 가산 [+ 선리치자 손 가치 강탈]
 *  - 단독 push:    손값 + (손+2판 − 손)
 *  - 둘 다:        설명대로면 «+5판»어치 = (손+5판 − 손) 이 얹혀야 한다.
 *    구현이 각자 원본 han을 밑값으로 쓰면 (손+3−손)+(손+2−손) 로 **덜 나온다**.
 *    (util.ts addWinPointBonus 의 hanSoFar 규약이 정확히 이 문제를 위한 것인데,
 *     counter 는 자체 인터셉터라 hanSoFar 를 넘기지 않고 han 표기도 남기지 않는다.)
 */
import { run, table, winInfoLine, K4 } from "./lib.js";
import { ron } from "./scenes_local.js";
import type { GameState } from "@majak/core";

// 2판 40부 정도의 저타점 손 — 판수 곡선의 차이가 가장 크게 보인다
const HAND = { hand: "123m123p123s678s9s", wait: "9s" };
const scene = ron(HAND.hand, HAND.wait, "p1");

const counterData = (s: GameState) => ({
  [K4.counterPrev("p0")]: "p1",
  [K4.counterStruck("p0")]: true,
  [K4.counterSpent("p0")]: true,
});
const pushData = (s: GameState) => ({ [K4.pushForced(s, "p0")]: "p1" });

const mk = (augs: Record<string, string[]>, data?: (s: GameState) => Record<string, unknown>) =>
  run({ craft: scene, augs, winner: "p0", ...(data ? { data } : {}) });

table("P1 · counter(+3판) × push_riichi(+2판) — p1 직격 론", [
  { label: "없음", r: mk({}) },
  { label: "A=counter", r: mk({ p0: ["counter"] }, counterData) },
  { label: "B=push_riichi", r: mk({ p0: ["push_riichi"] }, pushData) },
  { label: "A+B", r: mk({ p0: ["counter", "push_riichi"] }, (s) => ({ ...counterData(s), ...pushData(s) })) },
]);
console.log(winInfoLine(mk({ p0: ["counter", "push_riichi"] }, (s) => ({ ...counterData(s), ...pushData(s) }))));
