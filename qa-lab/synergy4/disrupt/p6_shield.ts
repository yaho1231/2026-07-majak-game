/**
 * P6 — 역만 방어술(yakuman_shield)의 겹침. «방총 손해를 줄이는 카드가 겹칠 때
 * 이중 감면 또는 상쇄가 나는가»
 *
 * 장면: p0가 스안커단기 쯔모(역만). p1·p2·p3 가 분담한다.
 * 예측:
 *  - 방어막 1장(p1): p1 손실 0, p0 수령 그대로(부족분 뱅크).
 *  - 방어막 2~3장: 각자 자기 몫만 돌려받는다. 이중 환급이면 합계가 인원수만큼 부푼다.
 *  - 덤터기(p2가 p0에게? 아니 — 덤터기는 «내 쯔모»에만) → p0가 덤터기로 p1에게 몰아주면
 *    방어막은 «몰린 전액»까지 돌려받아야 한다(2026-08-23 확정 1의 회귀 검사).
 */
import { run, table, winInfoLine, K4 } from "./lib.js";
import { tsumo } from "./scenes_local.js";
import type { GameState } from "@majak/core";

const YK = tsumo("111m333m555m777m9m9m"); // 스안커 단기 쯔모
const sg = (s: GameState, t: string) => ({ [K4.scapegoatTarget(s, "p0")]: t });
const mk = (augs: Record<string, string[]>, data?: (s: GameState) => Record<string, unknown>) =>
  run({ craft: YK, augs, winner: "p0", ...(data ? { data } : {}) });

console.log(winInfoLine(mk({})));
table("P6 · 역만 쯔모 × 역만 방어술 보유자 수", [
  { label: "방어막 0", r: mk({}) },
  { label: "p1", r: mk({ p1: ["yakuman_shield"] }) },
  { label: "p1,p2", r: mk({ p1: ["yakuman_shield"], p2: ["yakuman_shield"] }) },
  { label: "p1,p2,p3", r: mk({ p1: ["yakuman_shield"], p2: ["yakuman_shield"], p3: ["yakuman_shield"] }) },
]);

table("P6b · 덤터기(p0→p1)로 전액을 몰아준 역만 쯔모 × p1 방어막", [
  { label: "덤터기만", r: mk({ p0: ["scapegoat"] }, (s) => sg(s, "p1")) },
  { label: "덤터기 + p1방어막", r: mk({ p0: ["scapegoat"], p1: ["yakuman_shield"] }, (s) => sg(s, "p1")) },
  { label: "덤터기 + p2방어막(무관한 사람)", r: mk({ p0: ["scapegoat"], p2: ["yakuman_shield"] }, (s) => sg(s, "p1")) },
  { label: "덤터기 + 전원방어막", r: mk({ p0: ["scapegoat"], p1: ["yakuman_shield"], p2: ["yakuman_shield"], p3: ["yakuman_shield"] }, (s) => sg(s, "p1")) },
]);

// P6c — 배만/삼배만 절반 감면이 겹칠 때
const BAI = tsumo("111234567m22345m"); // 청일색계 고타점
table("P6c · 배만급 쯔모 × 방어막(절반) 여러 장", [
  { label: "방어막 0", r: run({ craft: BAI, augs: {}, winner: "p0" }) },
  { label: "p1", r: run({ craft: BAI, augs: { p1: ["yakuman_shield"] }, winner: "p0" }) },
  { label: "p1,p2,p3", r: run({ craft: BAI, augs: { p1: ["yakuman_shield"], p2: ["yakuman_shield"], p3: ["yakuman_shield"] }, winner: "p0" }) },
]);
console.log(winInfoLine(run({ craft: BAI, augs: {}, winner: "p0" })));
