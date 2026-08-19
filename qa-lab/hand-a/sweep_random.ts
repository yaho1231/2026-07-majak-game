/**
 * hand-a 무작위 스윕 — 좌석마다 담당 12종 중 2~3개를 무작위 배정하고 대량 실행.
 * 사용: tsx qa-lab/hand-a/sweep_random.ts <mode> <games> <seedBase>
 */
import { PersonaAgent, PERSONAS, SEATS } from "../harness.js";
import { Prng } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { runMatch2 } from "./run.js";
import { handChecks, newCtx } from "./checks.js";

const MINE = [
  "red_five_touch", "take_back", "tile_dyeing", "suit_unify", "hand_swap3",
  "full_hand_swap", "future_sight", "bottom_deal", "alchemist", "pond_snatch",
  "grave_rob", "silent_swap",
];
const POOL = [PERSONAS.masher!, PERSONAS.masher!, PERSONAS.folder!, PERSONAS.caller!, PERSONAS.riichiRusher!, PERSONAS.stall!];

const mode = (process.argv[2] ?? "tonpuu") as "hanchan" | "tonpuu";
const nGames = Number(process.argv[3] ?? 40);
const base = Number(process.argv[4] ?? 90000);

let rounds = 0;
const problems: string[] = [];
for (let g = 0; g < nGames; g++) {
  const seed = base + g * 13;
  const rng = new Prng(seed ^ 0x5eed);
  const preset = {} as Record<PlayerId, string[]>;
  for (const s of SEATS) {
    const n = 2 + rng.int(2);
    const held: string[] = [];
    while (held.length < n) {
      const id = MINE[rng.int(MINE.length)]!;
      if (!held.includes(id)) held.push(id);
    }
    preset[s] = held;
  }
  const personas = Object.fromEntries(SEATS.map((s) => [s, POOL[rng.int(POOL.length)]!])) as Record<PlayerId, typeof POOL[number]>;
  const agents = SEATS.map((id, i) => new PersonaAgent(id, personas[id]!, seed * 131 + i * 7 + 1));
  const ctx = newCtx();
  const r = await runMatch2({
    seed, mode, preset, agents,
    onState: (st: GameState, out) => handChecks(st, out, ctx),
    timeoutMs: 300_000,
  });
  rounds += r.rounds;
  const kinds = [...new Set(r.violations.map((v) => v.kind))];
  const bad = r.crash !== undefined || r.effectErrors.length > 0 || r.violations.length > 0;
  const line = `seed=${seed} rounds=${r.rounds} crash=${r.crash?.split("\n")[0] ?? "-"} eff=${r.effectErrors.length} viol=${r.violations.length}[${kinds.join(",")}] preset=${JSON.stringify(preset)}`;
  if (bad) {
    problems.push(line);
    console.log("!! " + line);
    for (const v of r.violations.slice(0, 4)) console.log("   ", JSON.stringify(v));
    for (const e of r.effectErrors.slice(0, 4)) console.log("   eff:", e);
    if (r.crash !== undefined) console.log("   crash:\n" + r.crash);
  } else console.log(`ok ${line}`);
}
console.log(`\n=== random games=${nGames} rounds=${rounds} problems=${problems.length}`);
for (const l of problems) console.log(" ", l);
