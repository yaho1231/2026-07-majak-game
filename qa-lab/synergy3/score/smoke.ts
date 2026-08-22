import { run, table, winInfoLine } from "./lib.js";

const base = {
  hands: { p0: "123m123p123s678s9s", p1: "*", p2: "*", p3: "*" },
  discards: { p1: "9s" },
  phase: "reaction",
  turnSeat: 1,
  lastDiscard: { player: "p1" as const, spec: "9s" },
} as const;

const none = run({ craft: { ...base }, augs: {}, winner: "p0" });
console.log(winInfoLine(none));
table("smoke — 론 대조군", [{ label: "없음", r: none }]);
