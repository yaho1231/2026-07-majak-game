/** P1c — counter 의 «손 가치 강탈»과 «직격 +3판»을 분리해서 잰다. */
import { run, table, K4 } from "./lib.js";
import { ron } from "./scenes_local.js";
import type { GameState } from "@majak/core";

const HAND = { hand: "123m123p123s678s9s", wait: "9s" };
const R = { dealerSeat: 1 as const };
const cData = () => ({
  [K4.counterPrev("p0")]: "p1",
  [K4.counterStruck("p0")]: true,
  [K4.counterSpent("p0")]: true,
});
const pData = (s: GameState) => ({ [K4.pushForced(s, "p0")]: "p1" });

// (a) 강탈만: 추격 대상은 p1인데 론은 p2에게서 → 직격 +3판 조건 불성립
const fromP2 = ron(HAND.hand, HAND.wait, "p2");
// (b) 강탈+직격: 론도 p1에게서
const fromP1 = ron(HAND.hand, HAND.wait, "p1");

const mk = (craft: any, augs: Record<string, string[]>, data?: (s: GameState) => Record<string, unknown>, extra: string[] = []) =>
  run({ craft, augs, winner: "p0", round: R, ...(data ? { data } : {}) });

table("P1c-1 · 강탈만(론은 p2에게서) — counter 노트 = 강탈액", [
  { label: "counter", r: mk(fromP2, { p0: ["counter"] }, cData) },
  { label: "counter+천장", r: mk(fromP2, { p0: ["counter", "aotenjou_ceiling"] }, cData) },
]);
table("P1c-2 · 강탈+직격(p1에게서 론)", [
  { label: "counter", r: mk(fromP1, { p0: ["counter"] }, cData) },
  { label: "counter+천장", r: mk(fromP1, { p0: ["counter", "aotenjou_ceiling"] }, cData) },
  { label: "counter+push", r: mk(fromP1, { p0: ["counter", "push_riichi"] }, (s) => ({ ...cData(), ...pData(s) })) },
  { label: "counter+push+천장", r: mk(fromP1, { p0: ["counter", "push_riichi", "aotenjou_ceiling"] }, (s) => ({ ...cData(), ...pData(s) })) },
]);
