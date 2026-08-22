/**
 * C군: 훔치기/이전 계열(Transfer) 겹침 + 뱅크 하한(큰손)과의 상호작용.
 *
 * 기대(먼저 적는다):
 *  C1 spy(p1이 p0의 오름패를 찍음) 단독: p0의 수령 24,000이 통째로 p1에게. 합 0.
 *  C2 parasite(p2가 p0에 기생) 단독: 12,000이 p2에게. 합 0.
 *  C3 C1+C2: 원금 24,000보다 많이 빠져나가면 안 된다. 합 0.
 *  C4 big_hand(p0 선언) × spy(p1): 큰손은 "내가 받는 총액 최소 만관"을 약속하고
 *     스파이는 "그 점수가 전부 나에게"를 약속한다 — 동시에 참일 수 없다.
 *     어느 쪽이 이기는가? 뱅크가 두 번 발행하지는 않는가?
 *  C5 big_hand × parasite: 이미 Reassert로 방어했다고 주석이 말한다 — 확인만.
 *  C6 뚫린 천장(p0) × 기생충(p2): 늘어난 몫도 절반이 새어 나가는가.
 */
import { run, table } from "./lib.js";
import { ron, tsumo } from "./scenes.js";
import { K, rk } from "./keys.js";
import type { GameState } from "@majak/core";

const CHIN = { hand: "111234567m2234m", wait: "2m" }; // 오야 8판, 론 24,000
const TINY = { hand: "123m123p123s678s9s", wait: "9s" }; // 2판 40부 → 오야 론 3,900

const merge =
  (...fs: ((s: GameState) => Record<string, unknown>)[]) =>
  (s: GameState) =>
    Object.assign({}, ...fs.map((f) => f(s)));

// p0가 2m으로 론 → spy가 찍을 패는 "man2"
const spyMark = (h: string, key: string) => () => ({ [K.spyMark(h)]: key });
const para = (h: string, target: string) => (s: GameState) => ({
  [K.parasiteTarget(s, h)]: target,
});
const bigHand = (h: string) => (s: GameState) => ({ [K.bigHandDeclared(h)]: rk(s) });

const scene = ron(CHIN.hand, CHIN.wait, "p1");
const R = (
  augs: Record<string, string[]>,
  data?: (s: GameState) => Record<string, unknown>,
) => run({ craft: scene, augs, winner: "p0", ...(data ? { data } : {}) });

table("C1-C3 · 스파이(p1) × 기생충(p2) — p0 오야 론 24,000", [
  { label: "없음", r: R({}) },
  { label: "A=spy(p1)", r: R({ p1: ["spy"] }, spyMark("p1", "man2")) },
  { label: "B=parasite(p2→p0)", r: R({ p2: ["parasite"] }, para("p2", "p0")) },
  {
    label: "A+B",
    r: R({ p1: ["spy"], p2: ["parasite"] }, merge(spyMark("p1", "man2"), para("p2", "p0"))),
  },
]);

// 좌석을 뒤집어 본다 — spy가 p3, parasite가 p1
table("C3b · 자리를 바꿔서 (spy=p3, parasite=p1)", [
  { label: "A=spy(p3)", r: R({ p3: ["spy"] }, spyMark("p3", "man2")) },
  { label: "B=parasite(p1→p0)", r: R({ p1: ["parasite"] }, para("p1", "p0")) },
  {
    label: "A+B",
    r: R({ p3: ["spy"], p1: ["parasite"] }, merge(spyMark("p3", "man2"), para("p1", "p0"))),
  },
]);

// C4/C5 — 저타점 손으로 큰손 하한이 실제로 걸리게 한다
const tinyScene = ron(TINY.hand, TINY.wait, "p1");
const T = (
  augs: Record<string, string[]>,
  data?: (s: GameState) => Record<string, unknown>,
) => run({ craft: tinyScene, augs, winner: "p0", ...(data ? { data } : {}) });

table("C4-C5 · 큰손(p0) × 스파이/기생충 — 저타점 오야 론", [
  { label: "없음", r: T({}) },
  { label: "A=big_hand", r: T({ p0: ["big_hand"] }, bigHand("p0")) },
  { label: "B=spy(p1, 7s)", r: T({ p1: ["spy"] }, spyMark("p1", "sou9")) },
  {
    label: "A+B(spy)",
    r: T({ p0: ["big_hand"], p1: ["spy"] }, merge(bigHand("p0"), spyMark("p1", "sou9"))),
  },
  { label: "C=parasite(p2→p0)", r: T({ p2: ["parasite"] }, para("p2", "p0")) },
  {
    label: "A+C(parasite)",
    r: T({ p0: ["big_hand"], p2: ["parasite"] }, merge(bigHand("p0"), para("p2", "p0"))),
  },
]);

// C6 — 뚫린 천장 × 기생충
table("C6 · 뚫린 천장(p0) × 기생충(p2→p0) — 8판 론", [
  { label: "없음", r: R({}) },
  { label: "A=aotenjou", r: R({ p0: ["aotenjou_ceiling"] }) },
  { label: "B=parasite", r: R({ p2: ["parasite"] }, para("p2", "p0")) },
  {
    label: "A+B",
    r: R({ p0: ["aotenjou_ceiling"], p2: ["parasite"] }, para("p2", "p0")),
  },
]);

// C7 — 뚫린 천장 × 눈먼 총알: 총알은 winInfo.points만 옮긴다. 천장 초과분은?
const armedBR = (h: string) => (s: GameState) => ({ [K.armed("blind_ron", h)]: rk(s) });
const scene2 = { ...ron(CHIN.hand, CHIN.wait, "p1"), seed: 2 };
const R2 = (
  augs: Record<string, string[]>,
  data?: (s: GameState) => Record<string, unknown>,
) => run({ craft: scene2, augs, winner: "p0", ...(data ? { data } : {}) });
table("C7 · 뚫린 천장(p0) × 눈먼 총알(p2, seed=2)", [
  { label: "없음", r: R2({}) },
  { label: "A=aotenjou", r: R2({ p0: ["aotenjou_ceiling"] }) },
  { label: "B=blind_ron", r: R2({ p2: ["blind_ron"] }, armedBR("p2")) },
  {
    label: "A+B",
    r: R2({ p0: ["aotenjou_ceiling"], p2: ["blind_ron"] }, armedBR("p2")),
  },
]);

// C8 — 덤터기(쯔모) × 뚫린 천장: 초과분까지 지목자에게 몰리는가 (설명대로면 몰린다)
const tsc = tsumo("111234567m2234m2m");
const TS = (
  augs: Record<string, string[]>,
  data?: (s: GameState) => Record<string, unknown>,
) => run({ craft: tsc, augs, winner: "p0", ...(data ? { data } : {}) });
const sg = (s: GameState) => ({ [K.scapegoatTarget(s, "p0")]: "p1" });
table("C8 · 덤터기(p0→p1) × 뚫린 천장(p0) — 오야 쯔모", [
  { label: "없음", r: TS({}) },
  { label: "A=scapegoat", r: TS({ p0: ["scapegoat"] }, sg) },
  { label: "B=aotenjou", r: TS({ p0: ["aotenjou_ceiling"] }) },
  { label: "A+B", r: TS({ p0: ["scapegoat", "aotenjou_ceiling"] }, sg) },
]);

// C9 — 덤터기(p0→p1) × 기생충(p2→p0): 지목자 아닌 p2가 이득을 본다
table("C9 · 덤터기(p0→p1) × 기생충(p2→p0)", [
  { label: "A=scapegoat", r: TS({ p0: ["scapegoat"] }, sg) },
  { label: "B=parasite", r: TS({ p2: ["parasite"] }, para("p2", "p0")) },
  {
    label: "A+B",
    r: TS({ p0: ["scapegoat"], p2: ["parasite"] }, merge(sg, para("p2", "p0"))),
  },
]);
