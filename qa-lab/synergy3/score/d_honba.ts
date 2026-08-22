/**
 * D군: 본장 사냥꾼(1본=1500) × 배수 계열 / 뱅크 하한 / 이전 계열.
 *
 * 장면: 5본장, p0(오야)가 2판 40부(3,900)로 론.
 * 표준 본장 가산 = 5 × 300 = 1,500 → p0 5,400.
 * honba_hunter → 5 × 1500 = 7,500 → p0 11,400.
 *
 * 기대:
 *  D1 let_it_ride(2배)는 "본장·공탁은 대상이 아니다" → 3900×2 + 7500 = 15,300.
 *  D2 blood_contract(1.5배)도 본장 제외 → 3900×1.5 + 7500 = 13,350 → 100단위 13,400 근처.
 *  D3 jackpot(3배)는 "본장 보너스까지 곱한다" → (3900+7500)×3 = 34,200.
 *  D4 big_hand(오야 하한 12,000)는 본장 수령분 포함 → 11,400 → 12,000 (뱅크 +600).
 *     honba_hunter 없으면 5,400 → 12,000 (뱅크 +6,600). 즉 본장사냥꾼이 큰손에 삼켜진다.
 */
import { run, table } from "./lib.js";
import { ron } from "./scenes.js";
import { K, rk } from "./keys.js";
import type { GameState } from "@majak/core";

const SMALL = { hand: "123m123p123s678s9s", wait: "9s" };
const scene = ron(SMALL.hand, SMALL.wait, "p1");
const R = (
  augs: Record<string, string[]>,
  data?: (s: GameState) => Record<string, unknown>,
) =>
  run({
    craft: scene,
    augs,
    winner: "p0",
    round: { honba: 5 },
    ...(data ? { data } : {}),
  });

const merge =
  (...fs: ((s: GameState) => Record<string, unknown>)[]) =>
  (s: GameState) =>
    Object.assign({}, ...fs.map((f) => f(s)));
const streak = (h: string, n: number) => () => ({ [K.letItRideStreak(h)]: n });
const jack = (h: string, m: number) => (s: GameState) => ({ [K.jackpotMult(s, h)]: m });
const bigHand = (h: string) => (s: GameState) => ({ [K.bigHandDeclared(h)]: rk(s) });
const hh = ["honba_hunter"];

table("D1 · 본장 사냥꾼 × 판돈 굴리기(2배) — 5본장, 3,900 오야 론", [
  { label: "없음", r: R({}) },
  { label: "A=honba_hunter", r: R({ p0: hh }) },
  { label: "B=let_it_ride(x2)", r: R({ p0: ["let_it_ride"] }, streak("p0", 1)) },
  { label: "A+B", r: R({ p0: [...hh, "let_it_ride"] }, streak("p0", 1)) },
]);

table("D2 · 본장 사냥꾼 × 핏빛 계약(1.5배, 삼색 계약)", [
  { label: "없음", r: R({}) },
  { label: "A=honba_hunter", r: R({ p0: hh }) },
  {
    label: "B=blood_contract",
    r: R({ p0: ["blood_contract"] }, (s) => ({ [K.bloodContract(s, "p0")]: "sanshoku" })),
  },
  {
    label: "A+B",
    r: R({ p0: [...hh, "blood_contract"] }, (s) => ({
      [K.bloodContract(s, "p0")]: "sanshoku",
    })),
  },
]);

table("D3 · 본장 사냥꾼 × 일확천금(3배)", [
  { label: "없음", r: R({}) },
  { label: "A=honba_hunter", r: R({ p0: hh }) },
  { label: "B=jackpot(x3)", r: R({ p0: ["jackpot"] }, jack("p0", 3)) },
  { label: "A+B", r: R({ p0: [...hh, "jackpot"] }, jack("p0", 3)) },
]);

table("D4 · 본장 사냥꾼 × 큰손(오야 하한 12,000)", [
  { label: "없음", r: R({}) },
  { label: "A=honba_hunter", r: R({ p0: hh }) },
  { label: "B=big_hand", r: R({ p0: ["big_hand"] }, bigHand("p0")) },
  { label: "A+B", r: R({ p0: [...hh, "big_hand"] }, bigHand("p0")) },
]);

table("D5 · 본장 사냥꾼 × 눈먼 총알(p2) — 본장분은 원래대로 정산되는가", [
  { label: "A=honba_hunter", r: R({ p0: hh }) },
  {
    label: "A+blind_ron",
    r: R({ p0: hh, p2: ["blind_ron"] }, (s) => ({ [K.armed("blind_ron", "p2")]: rk(s) })),
  },
]);

table("D6 · 본장 사냥꾼 × 책임전가 — 본장분도 3분할되는가", [
  { label: "A=honba_hunter", r: R({ p0: hh }) },
  { label: "B=blame_shift", r: R({ p0: ["blame_shift"] }) },
  { label: "A+B", r: R({ p0: [...hh, "blame_shift"] }) },
]);

table("D7 · 본장 사냥꾼 × 기생충(p2→p0) — 본장분까지 절반이 새는가", [
  { label: "A=honba_hunter", r: R({ p0: hh }) },
  {
    label: "A+parasite",
    r: R({ p0: hh, p2: ["parasite"] }, (s) => ({
      [K.parasiteTarget(s, "p2")]: "p0",
    })),
  },
]);

table("D8 · 본장 사냥꾼 × 뚫린 천장 (판수 계열 아님 — 독립이어야 한다)", [
  { label: "A=honba_hunter", r: R({ p0: hh }) },
  { label: "B=aotenjou", r: R({ p0: ["aotenjou_ceiling"] }) },
  { label: "A+B", r: R({ p0: [...hh, "aotenjou_ceiling"] }) },
]);

// D9 — 3중: 본장사냥꾼 × 일확천금(3배) × 큰손
table("D9 · 3중 — 본장사냥꾼 × 일확천금(3배) × 큰손", [
  { label: "hh", r: R({ p0: hh }) },
  { label: "hh+jackpot", r: R({ p0: [...hh, "jackpot"] }, jack("p0", 3)) },
  {
    label: "hh+jackpot+big_hand",
    r: R({ p0: [...hh, "jackpot", "big_hand"] }, merge(jack("p0", 3), bigHand("p0"))),
  },
  {
    label: "hh+jackpot(0.5)+big_hand",
    r: R({ p0: [...hh, "jackpot", "big_hand"] }, merge(jack("p0", 0.5), bigHand("p0"))),
  },
]);
