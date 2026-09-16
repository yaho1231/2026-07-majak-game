/**
 * 단독 스위프 한 판 재현 — out/*.jsonl 의 {aug, persona, mode, seed} 를 그대로 다시 돌려
 * 위반·훅 예외·크래시 스택을 전부 찍는다.
 *
 *   tsx qa-lab/round5/solo/repro.ts <aug> <persona> <mode> [seed]
 *   (seed 를 비우면 seedIdx 0 의 시드)
 */
import { badKinds, playOne, seedOf } from "./lib.js";
import type { Mode } from "./lib.js";

const [aug, persona, modeArg, seedArg] = process.argv.slice(2);
if (aug === undefined || persona === undefined || modeArg === undefined) {
  console.error("usage: repro.ts <aug> <persona> <hanchan|tonpuu> [seed]");
  process.exit(2);
}
const mode = modeArg as Mode;
const seed = seedArg !== undefined ? Number(seedArg) : seedOf(aug, mode, persona, 0);
const row = await playOne({ i: 0, aug, mode, persona, seedIdx: -1, seed }, { timeoutMs: Number(process.env["SOLO_TIMEOUT_MS"] ?? 90_000) });
console.log(JSON.stringify({ ...row, violationSamples: undefined, effectErrorSamples: undefined }, null, 1));
console.log("--- violations (bad kinds):", badKinds(row.violations).join(", ") || "none");
for (const s of row.violationSamples) console.log("  ", s);
console.log("--- effectErrors:", row.effectErrors);
for (const s of row.effectErrorSamples) console.log("  ", s);
if (row.crash !== null) console.log("--- crash:\n", row.crash);
if (row.fatal !== undefined) console.log("--- fatal:\n", row.fatal);
