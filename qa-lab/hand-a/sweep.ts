/**
 * hand-a 스윕 — 담당 12종을 강제 지급하고 대량 실행.
 *
 * 사용: tsx qa-lab/hand-a/sweep.ts <mode> <seedsPerAug> [augId ...]
 */
import { PERSONAS, SEATS } from "../harness.js";
import { runMatch2 as runMatch } from "./run.js";
import type { Persona } from "../harness.js";
import { handChecks, newCtx } from "./checks.js";

const MINE = [
  "red_five_touch", "take_back", "tile_dyeing", "suit_unify", "hand_swap3",
  "full_hand_swap", "future_sight", "bottom_deal", "alchemist", "pond_snatch",
  "grave_rob", "silent_swap",
] as const;

const mode = (process.argv[2] ?? "hanchan") as "hanchan" | "tonpuu";
const nSeeds = Number(process.argv[3] ?? 5);
const only = process.argv.slice(4);
const augs = only.length > 0 ? only : [...MINE];

const mix: Persona[] = [
  PERSONAS.masher!, PERSONAS.masher!, PERSONAS.folder!, PERSONAS.caller!,
];

let games = 0;
let rounds = 0;
const summary: string[] = [];

for (const aug of augs) {
  for (let s = 0; s < nSeeds; s++) {
    const seed = 1000 + s * 17;
    // 네 좌석 전원에게 같은 증강 — 같은 증강 2인 이상 보유 시의 키 충돌도 함께 본다
    const preset = {
      p0: [aug], p1: [aug], p2: [aug], p3: [aug],
    } as Record<(typeof SEATS)[number], readonly string[]>;
    const ctx = newCtx();
    const r = await runMatch({
      seed, mode, preset,
      personas: { p0: mix[0]!, p1: mix[1]!, p2: mix[2]!, p3: mix[3]! },
      onState: (st, out) => handChecks(st, out, ctx),
      timeoutMs: 180_000,
    });
    games++;
    rounds += r.rounds;
    const kinds = new Set(r.violations.map((v) => v.kind));
    const bad =
      r.crash !== undefined || r.effectErrors.length > 0 || r.violations.length > 0;
    if (bad) {
      const line = `${aug} seed=${seed} mode=${mode} rounds=${r.rounds} crash=${r.crash?.split("\n")[0] ?? "-"} eff=${r.effectErrors.length} viol=${r.violations.length} [${[...kinds].join(",")}]`;
      summary.push(line);
      console.log("!! " + line);
      for (const v of r.violations.slice(0, 4)) console.log("   ", JSON.stringify(v));
      for (const e of r.effectErrors.slice(0, 3)) console.log("   eff:", e);
    } else {
      console.log(`ok ${aug} seed=${seed} rounds=${r.rounds}`);
    }
  }
}
console.log(`\n=== games=${games} rounds=${rounds} problem-games=${summary.length}`);
for (const l of summary) console.log(" ", l);
