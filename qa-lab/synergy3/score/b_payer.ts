/**
 * B군: 지불자를 바꾸는 것들끼리 겹칠 때 — 합이 맞나, 두 번 물거나 아무도 안 무는가.
 *
 * 장면: p0(오야)가 p1의 버림패로 론. 표준이면 p1이 3,900을 혼자 낸다.
 * (오야 8판 청일색으로 키우면 24,000)
 *
 * 기대(먼저 적는다):
 *  B1 blame_shift(p0) 단독: p1/p2/p3가 각각 1/3씩. 합 0.
 *  B2 blind_ron(p2 보유) 단독: p1의 지불 전액이 무작위 한 명에게 옮겨간다. 합 0.
 *  B3 A+B: **지불자는 정확히 한 벌**이어야 한다 — 3분할이 되고 그 3분할이
 *     그대로 남거나, 아니면 통째로 한 명에게 가거나. 어느 쪽이든
 *     "쏜 사람이 오히려 돈을 번다"는 있을 수 없다.
 *  B4 sign_flip(지불자 보유) × blame_shift: 뒤집히는 것은 1/3 지불분이어야 한다.
 *  B5 sign_flip(지목자 보유) × scapegoat: 전액을 문 사람이 부호 반전으로 전액을 번다.
 */
import { run, table } from "./lib.js";
import { ron, tsumo } from "./scenes.js";
import { K, rk } from "./keys.js";
import type { GameState } from "@majak/core";

const CHIN = { hand: "111234567m2234m", wait: "2m" }; // 8판 → 오야 론 24,000
const scene = ron(CHIN.hand, CHIN.wait, "p1");

const armed = (aug: string, h: string) => (s: GameState) => ({
  [K.armed(aug, h)]: rk(s),
});
const merge =
  (...fs: ((s: GameState) => Record<string, unknown>)[]) =>
  (s: GameState) =>
    Object.assign({}, ...fs.map((f) => f(s)));

const R = (augs: Record<string, string[]>, data?: (s: GameState) => Record<string, unknown>) =>
  run({ craft: scene, augs, winner: "p0", ...(data ? { data } : {}) });

table("B1-B3 · 책임전가(p0) × 눈먼 총알(p2 보유) — p0 오야 론 24,000", [
  { label: "없음", r: R({}) },
  { label: "A=blame_shift(p0)", r: R({ p0: ["blame_shift"] }) },
  { label: "B=blind_ron(p2)", r: R({ p2: ["blind_ron"] }, armed("blind_ron", "p2")) },
  {
    label: "A+B",
    r: R({ p0: ["blame_shift"], p2: ["blind_ron"] }, armed("blind_ron", "p2")),
  },
]);

// B3b — 눈먼 총알을 p0 자신이 들었을 때 (자리 순서가 바뀐다)
table("B3b · 책임전가(p0) × 눈먼 총알(p0 보유)", [
  { label: "A=blame_shift", r: R({ p0: ["blame_shift"] }) },
  { label: "B=blind_ron(p0)", r: R({ p0: ["blind_ron"] }, armed("blind_ron", "p0")) },
  {
    label: "A+B (같은 사람)",
    r: R({ p0: ["blame_shift", "blind_ron"] }, armed("blind_ron", "p0")),
  },
]);

// B4 — sign_flip(p1 = 쏜 사람) × blame_shift(p0)
table("B4 · 반전(p1=쏜 사람) × 책임전가(p0)", [
  { label: "없음", r: R({}) },
  { label: "A=sign_flip(p1)", r: R({ p1: ["sign_flip"] }, armed("sign_flip", "p1")) },
  { label: "B=blame_shift(p0)", r: R({ p0: ["blame_shift"] }) },
  {
    label: "A+B",
    r: R({ p0: ["blame_shift"], p1: ["sign_flip"] }, armed("sign_flip", "p1")),
  },
]);

// B5 — scapegoat: p0 쯔모 + p1 지목, p1이 sign_flip
const tscene = tsumo("111234567m2234m2m");
const T = (augs: Record<string, string[]>, data?: (s: GameState) => Record<string, unknown>) =>
  run({ craft: tscene, augs, winner: "p0", ...(data ? { data } : {}) });
const sg = (s: GameState) => ({ [K.scapegoatTarget(s, "p0")]: "p1" });
table("B5 · 덤터기(p0→p1) × 반전(p1) — p0 오야 쯔모", [
  { label: "없음", r: T({}) },
  { label: "A=scapegoat", r: T({ p0: ["scapegoat"] }, sg) },
  { label: "B=sign_flip(p1)", r: T({ p1: ["sign_flip"] }, armed("sign_flip", "p1")) },
  {
    label: "A+B",
    r: T({ p0: ["scapegoat"], p1: ["sign_flip"] }, merge(sg, armed("sign_flip", "p1"))),
  },
]);

// B6 — 덤터기(p0→p1) × 책임전가(p0): 쯔모라 책임전가는 개입하지 않아야 한다
table("B6 · 덤터기 × 책임전가 (쯔모 — 책임전가 무개입 기대)", [
  { label: "A=scapegoat", r: T({ p0: ["scapegoat"] }, sg) },
  { label: "A+blame_shift", r: T({ p0: ["scapegoat", "blame_shift"] }, sg) },
]);

// B7 — 덤터기(p0→p1) × 눈먼 총알: 쯔모이므로 눈먼 총알도 무개입 기대
table("B7 · 덤터기(쯔모) × 눈먼 총알(p2)", [
  { label: "A=scapegoat", r: T({ p0: ["scapegoat"] }, sg) },
  {
    label: "A+blind_ron(p2)",
    r: T({ p0: ["scapegoat"], p2: ["blind_ron"] }, merge(sg, armed("blind_ron", "p2"))),
  },
]);

// B8 — 눈먼 총알 × 반전: 총알이 sign_flip 보유자에게 꽂히면?
table("B8 · 눈먼 총알(p2) × 반전(각 좌석) — 론 24,000", [
  { label: "blind_ron만", r: R({ p2: ["blind_ron"] }, armed("blind_ron", "p2")) },
  ...(["p1", "p2", "p3"] as const).map((who) => ({
    label: `+sign_flip(${who})`,
    r: R(
      { p2: ["blind_ron"], [who]: [...(who === "p2" ? ["blind_ron"] : []), "sign_flip"] },
      merge(armed("blind_ron", "p2"), armed("sign_flip", who)),
    ),
  })),
]);
