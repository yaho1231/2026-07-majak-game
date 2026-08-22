import { run, winInfoLine } from "./lib.js";
import { ron, tsumo } from "./scenes.js";

const cands: [string, string, string][] = [
  ["small", "123m123p123s678s9s", "9s"],
  ["tanyao", "234m234p234s567s7s", "7s"],
  ["chinitsu", "111234567m2234m", "2m"],
  ["chin13", "111234567899m9m", "9m"],
  ["toitoi", "111m333m555m777m9m", "9m"],
  ["honitsu", "111m999m11122z3z", "3z"],
  ["yakuman", "111222333444m9m", "9m"],
];

for (const [name, hand, wait] of cands) {
  try {
    const r = run({ craft: ron(hand, wait), augs: {}, winner: "p0" });
    console.log(`${name.padEnd(10)} RON  ${winInfoLine(r)}  deltas=${JSON.stringify(r.deltas)}`);
  } catch (e) {
    console.log(`${name.padEnd(10)} RON  FAIL ${(e as Error).message}`);
  }
  try {
    const r = run({ craft: tsumo(hand + wait), augs: {}, winner: "p0" });
    console.log(`${name.padEnd(10)} TSUMO ${winInfoLine(r)}  deltas=${JSON.stringify(r.deltas)}`);
  } catch (e) {
    console.log(`${name.padEnd(10)} TSUMO FAIL ${(e as Error).message}`);
  }
}
