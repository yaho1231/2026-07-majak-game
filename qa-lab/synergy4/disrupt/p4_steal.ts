/**
 * P4 — 강탈 축: 기생충(parasite) × 스파이(spy) × 덤터기(scapegoat) × 카운터.
 * 모두 정산에서 «남의 점수를 내 쪽으로 돌린다». 같은 단계(Transfer)에 둘이 앉으면
 * 하나가 무시되거나 이중으로 걷힐 수 있다.
 *
 * 장면: p1이 3900(2판40부)을 p2에게서 론. p0이 강탈 카드를 든다.
 * 예측:
 *  - 기생충(숙주 p1): p1 이득 3900의 절반 → 1,900~2,000 이 p0에게.
 *  - 스파이(찍은 패 = p1의 오름패): p1 이득 전액(3900)이 p0에게.
 *  - 둘 다: 총 이동은 **3900을 넘을 수 없다**(p1이 받은 것이 그것뿐이다).
 *    순서(idFraction)에 따라 갈리면 안 된다.
 */
import { run, table, K4 } from "./lib.js";
import { ron } from "./scenes_local.js";
import { kindKey, kindOf } from "@majak/core";
import type { GameState } from "@majak/core";

const HAND = "123m123p123s678s9s";
const WAIT = "9s";
// p1이 화료자, p2가 방총자
const scene = { ...ron(HAND, WAIT, "p2") } as any;
scene.hands = { p0: "*", p1: HAND, p2: "*", p3: "*" };

const para = (s: GameState) => ({ [K4.parasiteTarget(s, "p0")]: "p1" });
const spyOn = (s: GameState) => ({ [K4.spyMark("p0")]: kindKey(s.tiles[s.round.lastDiscard!.tileId]!.kind) });

const mk = (augs: Record<string, string[]>, data?: (s: GameState) => Record<string, unknown>) =>
  run({ craft: scene, augs, winner: "p1", ...(data ? { data } : {}) });

table("P4 · 기생충 × 스파이 (둘 다 p0, 대상 p1)", [
  { label: "없음", r: mk({}) },
  { label: "A=parasite", r: mk({ p0: ["parasite"] }, para) },
  { label: "B=spy", r: mk({ p0: ["spy"] }, spyOn) },
  { label: "A+B", r: mk({ p0: ["parasite", "spy"] }, (s) => ({ ...para(s), ...spyOn(s) })) },
]);

table("P4b · 기생충을 둘이 같은 숙주에게 (p0·p3)", [
  { label: "p0만", r: mk({ p0: ["parasite"] }, para) },
  { label: "p3만", r: mk({ p3: ["parasite"] }, (s) => ({ [K4.parasiteTarget(s, "p3")]: "p1" })) },
  { label: "둘 다", r: mk({ p0: ["parasite"], p3: ["parasite"] }, (s) => ({ ...para(s), [K4.parasiteTarget(s, "p3")]: "p1" })) },
]);

table("P4c · 스파이를 둘이 같은 패에 (p0·p3)", [
  { label: "p0만", r: mk({ p0: ["spy"] }, spyOn) },
  { label: "둘 다", r: mk({ p0: ["spy"], p3: ["spy"] }, (s) => ({ ...spyOn(s), [K4.spyMark("p3")]: kindKey(s.tiles[s.round.lastDiscard!.tileId]!.kind) })) },
]);

// P4d — 카운터(강탈+가산)와 기생충: p0이 화료하고 p3이 p0에 기생
const scene0 = ron(HAND, WAIT, "p1");
const cData = () => ({ [K4.counterPrev("p0")]: "p1", [K4.counterStruck("p0")]: true, [K4.counterSpent("p0")]: true });
const mk0 = (augs: Record<string, string[]>, data?: (s: GameState) => Record<string, unknown>) =>
  run({ craft: scene0, augs, winner: "p0", ...(data ? { data } : {}) });
table("P4d · 카운터(p0) × 기생충(p3이 p0에 기생) — 뱅크 발행분까지 빨아먹는가", [
  { label: "counter만", r: mk0({ p0: ["counter"] }, cData) },
  { label: "parasite만", r: mk0({ p3: ["parasite"] }, (s) => ({ [K4.parasiteTarget(s, "p3")]: "p0" })) },
  { label: "둘 다", r: mk0({ p0: ["counter"], p3: ["parasite"] }, (s) => ({ ...cData(), [K4.parasiteTarget(s, "p3")]: "p0" })) },
]);
