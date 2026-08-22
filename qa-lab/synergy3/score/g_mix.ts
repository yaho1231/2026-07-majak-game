/**
 * G군: 남은 조합 — 책임전가 × 천장/훔치기, 반전 × 훔치기, 판수 상한, 복수자.
 */
import { run, table, winInfoLine } from "./lib.js";
import { ron } from "./scenes.js";
import { K, rk } from "./keys.js";
import type { GameState } from "@majak/core";

const CHIN = { hand: "111234567m2234m", wait: "2m" }; // 8판 오야 론 24,000
const merge =
  (...fs: ((s: GameState) => Record<string, unknown>)[]) =>
  (s: GameState) =>
    Object.assign({}, ...fs.map((f) => f(s)));
const spyMark = (h: string, key: string) => () => ({ [K.spyMark(h)]: key });
const para = (h: string, t: string) => (s: GameState) => ({ [K.parasiteTarget(s, h)]: t });
const armed = (aug: string, h: string) => (s: GameState) => ({ [K.armed(aug, h)]: rk(s) });
const haitei = (s: GameState) => ({ [K.haiteiFired(s, "p0")]: true });

const scene = ron(CHIN.hand, CHIN.wait, "p1");
const R = (
  augs: Record<string, string[]>,
  data?: (s: GameState) => Record<string, unknown>,
) => run({ craft: scene, augs, winner: "p0", ...(data ? { data } : {}) });

table("G1 · 책임전가(p0) × 뚫린 천장(p0) — 초과분도 3분할되는가", [
  { label: "없음", r: R({}) },
  { label: "A=blame_shift", r: R({ p0: ["blame_shift"] }) },
  { label: "B=aotenjou", r: R({ p0: ["aotenjou_ceiling"] }) },
  { label: "A+B", r: R({ p0: ["blame_shift", "aotenjou_ceiling"] }) },
]);

table("G2 · 책임전가(p0) × 스파이(p2) — 총액 보존/지불자 정합", [
  { label: "A=blame_shift", r: R({ p0: ["blame_shift"] }) },
  { label: "B=spy(p2)", r: R({ p2: ["spy"] }, spyMark("p2", "man2")) },
  {
    label: "A+B",
    r: R({ p0: ["blame_shift"], p2: ["spy"] }, spyMark("p2", "man2")),
  },
]);

table("G3 · 책임전가(p0) × 기생충(p2→p0)", [
  { label: "A=blame_shift", r: R({ p0: ["blame_shift"] }) },
  { label: "B=parasite", r: R({ p2: ["parasite"] }, para("p2", "p0")) },
  { label: "A+B", r: R({ p0: ["blame_shift"], p2: ["parasite"] }, para("p2", "p0")) },
]);

table("G4 · 반전(p0=화료자) × 스파이/기생충 — 뒤집을 것이 남아 있는가", [
  { label: "A=sign_flip(p0)", r: R({ p0: ["sign_flip"] }, armed("sign_flip", "p0")) },
  {
    label: "A+spy(p2)",
    r: R(
      { p0: ["sign_flip"], p2: ["spy"] },
      merge(armed("sign_flip", "p0"), spyMark("p2", "man2")),
    ),
  },
  {
    label: "A+parasite(p2)",
    r: R(
      { p0: ["sign_flip"], p2: ["parasite"] },
      merge(armed("sign_flip", "p0"), para("p2", "p0")),
    ),
  },
]);

table("G5 · 반전(p0=화료자) × 뚫린 천장(p0) — 뱅크 발행이 얼마나 커지는가", [
  { label: "A=sign_flip", r: R({ p0: ["sign_flip"] }, armed("sign_flip", "p0")) },
  { label: "B=aotenjou", r: R({ p0: ["aotenjou_ceiling"] }) },
  {
    label: "A+B",
    r: R({ p0: ["sign_flip", "aotenjou_ceiling"] }, armed("sign_flip", "p0")),
  },
]);

// G6 — 판수 상한: 실판 11판 손(청일색8 + 바닥3)에 뱅크 환산 +3판(해저)을 얹는다
const bottomScene = {
  ...ron(CHIN.hand, CHIN.wait, "p1"),
  discards: { p0: "123456789p333s", p1: "" },
} as Parameters<typeof run>[0]["craft"];
const B = (
  augs: Record<string, string[]>,
  data?: (s: GameState) => Record<string, unknown>,
) => run({ craft: bottomScene, augs, winner: "p0", ...(data ? { data } : {}) });

table("G6 · 실판 11판 손 — 해저(+3판, 뱅크 환산) × 뚫린 천장", [
  { label: "bottom_yaku만 (11판)", r: B({ p0: ["bottom_yaku"] }) },
  { label: "+haitei(+3판)", r: B({ p0: ["bottom_yaku", "haitei_lord"] }, haitei) },
  { label: "+aotenjou", r: B({ p0: ["bottom_yaku", "aotenjou_ceiling"] }) },
  {
    label: "셋 다",
    r: B({ p0: ["bottom_yaku", "haitei_lord", "aotenjou_ceiling"] }, haitei),
  },
]);
console.log(
  "G6 셋 다:",
  winInfoLine(B({ p0: ["bottom_yaku", "haitei_lord", "aotenjou_ceiling"] }, haitei)),
);

// G7 — 복수자(+2 실판) × 뚫린 천장 (실판이므로 천장이 그대로 세어야 한다)
const nem = () => ({ [K.avengerNemesis("p0")]: "p1" });
table("G7 · 복수자(p0, 원수=p1, +2판 실판) × 뚫린 천장", [
  { label: "없음", r: R({}) },
  { label: "A=avenger", r: R({ p0: ["avenger"] }, nem) },
  { label: "B=aotenjou", r: R({ p0: ["aotenjou_ceiling"] }) },
  { label: "A+B", r: R({ p0: ["avenger", "aotenjou_ceiling"] }, nem) },
]);
console.log("G7 A+B:", winInfoLine(R({ p0: ["avenger", "aotenjou_ceiling"] }, nem)));

// G8 — 복수자 × 해저 (뱅크 환산 +3) × 바닥 (실판 +3): 판수 계열 셋
table("G8 · 판수 3종 겹침 — 복수자(+2 실판)/바닥(+3 실판)/해저(+3 뱅크)", [
  { label: "없음", r: B({}) },
  { label: "avenger", r: B({ p0: ["avenger"] }, nem) },
  { label: "bottom_yaku", r: B({ p0: ["bottom_yaku"] }) },
  { label: "haitei", r: B({ p0: ["haitei_lord"] }, haitei) },
  {
    label: "셋 다",
    r: B({ p0: ["avenger", "bottom_yaku", "haitei_lord"] }, merge(nem, haitei)),
  },
]);
