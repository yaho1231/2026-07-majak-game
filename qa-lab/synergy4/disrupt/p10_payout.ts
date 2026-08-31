/**
 * P10 — 지불 재배선 클러스터의 겹침(덤터기·눈먼 총알·기생충·스파이).
 * 같은 Redistribute/Transfer 단계에 여럿이 앉는다 — 하나가 무시되거나 이중으로 걷히는가.
 */
import { run, table, K4 } from "./lib.js";
import { ron, tsumo } from "./scenes_local.js";
import { kindKey } from "@majak/core";
import type { GameState } from "@majak/core";

const HAND = "123m123p123s678s9s", WAIT = "9s";
const armed = (aug: string, h: string) => (s: GameState) => ({ [K4.armed(aug, h)]: `${s.round.prevalentWind}-${s.round.roundNumber}-${s.round.honba}` });

// (1) p0 쯔모 + 덤터기(→p1) × 기생충(p3이 p0에 기생) × 스파이
const T = tsumo("123m123p123s678s99s");
const sg = (s: GameState) => ({ [K4.scapegoatTarget(s, "p0")]: "p1" });
const par3 = (s: GameState) => ({ [K4.parasiteTarget(s, "p3")]: "p0" });
const mkT = (augs: Record<string, string[]>, data?: (s: GameState) => Record<string, unknown>) =>
  run({ craft: T, augs, winner: "p0", ...(data ? { data } : {}) });
table("P10a · 덤터기(p0→p1) × 기생충(p3→p0) — «나머지 둘은 한 푼도 내지 않는다»가 지켜지는가", [
  { label: "덤터기만", r: mkT({ p0: ["scapegoat"] }, sg) },
  { label: "기생충만", r: mkT({ p3: ["parasite"] }, par3) },
  { label: "둘 다", r: mkT({ p0: ["scapegoat"], p3: ["parasite"] }, (s) => ({ ...sg(s), ...par3(s) })) },
]);

// (2) p1이 p2에게 론 · p0가 눈먼 총알 + 스파이/기생충
const R = ron(HAND, WAIT, "p2") as any;
R.hands = { p0: "*", p1: HAND, p2: "*", p3: "*" };
const spyOn = (s: GameState) => ({ [K4.spyMark("p0")]: kindKey(s.tiles[s.round.lastDiscard!.tileId]!.kind) });
const mkR = (augs: Record<string, string[]>, data?: (s: GameState) => Record<string, unknown>) =>
  run({ craft: R, augs, winner: "p1", ...(data ? { data } : {}) });
table("P10b · 눈먼 총알(p0) × 스파이(p0) — 지불자 재배선 + 수령자 강탈", [
  { label: "없음", r: mkR({}) },
  { label: "blind_ron", r: mkR({ p0: ["blind_ron"] }, armed("blind_ron", "p0")) },
  { label: "spy", r: mkR({ p0: ["spy"] }, spyOn) },
  { label: "둘 다", r: mkR({ p0: ["blind_ron", "spy"] }, (s) => ({ ...armed("blind_ron", "p0")(s), ...spyOn(s) })) },
]);
table("P10c · 눈먼 총알을 둘이 든다 (p0·p3) — 국당 한 번만 쏘여야 한다", [
  { label: "p0만", r: mkR({ p0: ["blind_ron"] }, armed("blind_ron", "p0")) },
  { label: "둘 다", r: mkR({ p0: ["blind_ron"], p3: ["blind_ron"] }, (s) => ({ ...armed("blind_ron", "p0")(s), ...armed("blind_ron", "p3")(s) })) },
]);
