/**
 * 한 프로세스에서 담당 증강 14종을 순차 격리 스윕한다 (드래프트 OFF).
 * 사용: tsx qa-lab/defcall/batch.ts <seedsPerAug> [nSeats] [mode] [augFilter]
 */
import type { PlayerId } from "@majak/core";
import { PERSONAS } from "../harness.js";
import { runDefcall } from "./run.js";
import { makeChecks } from "./checks.js";

const MINE = [
  "yakuman_shield", "last_stand", "die_hard", "invincible", "no_ron_pact", "always_tenpai",
  "omni_chi", "open_kokushi", "cliff_bloom", "void_kan", "bluff_pretense", "meld_dissolve",
  "silent_pact", "snake_kan",
];
const seeds = Number(process.argv[2] ?? 8);
const nSeats = Number(process.argv[3] ?? 2);
const mode = (process.argv[4] === "tonpuu" ? "tonpuu" : "hanchan") as "hanchan" | "tonpuu";
const filter = process.argv[5];
const seats: PlayerId[] = ["p0", "p1", "p2", "p3"];
const P = ["folder", "caller", "masher", "riichiRusher", "chaos", "stall"] as const;

let totalRounds = 0;
for (const aug of MINE.filter((a) => filter === undefined || a.includes(filter))) {
  const agg: Record<string, number> = {};
  const seen = new Set<string>();
  let rounds = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const preset = Object.fromEntries(seats.map((s, i) => [s, i < nSeats ? [aug] : []])) as any;
    const personas = Object.fromEntries(seats.map((s, k) => [s, PERSONAS[P[(seed + k) % P.length]!]!])) as any;
    const chk = makeChecks(preset, mode);
    const r = await runDefcall({ seed, mode, preset, personas, noDraft: true, onState: chk.onState, onEvent: chk.onEvent });
    rounds += r.rounds;
    for (const [k, v] of Object.entries(chk.stats)) agg[k] = (agg[k] ?? 0) + v;
    if (r.crash !== undefined) console.log(`[${aug}] CRASH seed=${seed} :: ${r.crash.split("\n").slice(0, 5).join(" | ")}`);
    for (const ee of r.effectErrors.slice(0, 3)) {
      const k = `EFF ${ee.slice(0, 110)}`;
      if (!seen.has(k)) { seen.add(k); console.log(`[${aug}] ${k} seed=${seed}`); }
    }
    for (const v of r.violations) {
      agg[`viol:${v.kind}`] = (agg[`viol:${v.kind}`] ?? 0) + 1;
      const k = v.kind + v.detail.slice(0, 30);
      if (!seen.has(k)) { seen.add(k); console.log(`[${aug}] VIOL ${v.kind} seed=${seed} seat=${v.seat ?? "-"} r=${v.round} :: ${v.detail.slice(0, 240)}`); }
    }
  }
  totalRounds += rounds;
  console.log(`[${aug}] rounds=${rounds} ${JSON.stringify(Object.fromEntries(Object.entries(agg).sort()))}`);
}
console.log(`\n=== batch done: totalRounds=${totalRounds}`);
