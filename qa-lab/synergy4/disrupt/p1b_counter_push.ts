/** P1b — 같은 조합을 «자(비오야)»·저타점에서, 그리고 상한이 없는 판(뚫린 천장)에서 잰다. */
import { run, table, winInfoLine, K4 } from "./lib.js";
import { ron } from "./scenes_local.js";
import type { GameState } from "@majak/core";

const HAND = { hand: "123m123p123s678s9s", wait: "9s" }; // 삼색 2판 40부
const scene = { ...ron(HAND.hand, HAND.wait, "p1") };
const R = { dealerSeat: 1 as const }; // p1이 오야 → p0은 자

const counterData = () => ({
  [K4.counterPrev("p0")]: "p1",
  [K4.counterStruck("p0")]: true,
  [K4.counterSpent("p0")]: true,
});
const pushData = (s: GameState) => ({ [K4.pushForced(s, "p0")]: "p1" });

const mk = (augs: Record<string, string[]>, data?: (s: GameState) => Record<string, unknown>) =>
  run({ craft: scene, augs, winner: "p0", round: R, ...(data ? { data } : {}) });

table("P1b · 자(p0) 2판40부(2600) 직격 론", [
  { label: "없음", r: mk({}) },
  { label: "A=counter(+3판)", r: mk({ p0: ["counter"] }, counterData) },
  { label: "B=push(+2판)", r: mk({ p0: ["push_riichi"] }, pushData) },
  { label: "A+B", r: mk({ p0: ["counter", "push_riichi"] }, (s) => ({ ...counterData(), ...pushData(s) })) },
]);

table("P1c · 같은 판에 뚫린 천장(상한 해제)을 얹어 캡을 걷어낸다", [
  { label: "천장만", r: mk({ p0: ["aotenjou_ceiling"] }) },
  { label: "천장+counter", r: mk({ p0: ["aotenjou_ceiling", "counter"] }, counterData) },
  { label: "천장+push", r: mk({ p0: ["aotenjou_ceiling", "push_riichi"] }, pushData) },
  { label: "천장+A+B", r: mk({ p0: ["aotenjou_ceiling", "counter", "push_riichi"] }, (s) => ({ ...counterData(), ...pushData(s) })) },
]);
console.log(winInfoLine(mk({ p0: ["counter", "push_riichi"] }, (s) => ({ ...counterData(), ...pushData(s) }))));
