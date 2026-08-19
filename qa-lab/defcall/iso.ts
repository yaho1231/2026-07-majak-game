/**
 * 단일 증강 격리 스윕 — 담당 증강 하나만 지급하고(나머지 좌석 빈손) 돌린다.
 * 사용: tsx qa-lab/defcall/iso.ts <augId> <fromSeed> <toSeed> [tonpuu] [nSeats]
 */
import type { PlayerId } from "@majak/core";
import { PERSONAS } from "../harness.js";
import { runDefcall } from "./run.js";
import { makeChecks } from "./checks.js";

const aug = process.argv[2]!;
const from = Number(process.argv[3] ?? 1);
const to = Number(process.argv[4] ?? 20);
const mode = (process.argv[5] === "tonpuu" ? "tonpuu" : "hanchan") as "hanchan" | "tonpuu";
const nSeats = Number(process.argv[6] ?? 1);

const seats: PlayerId[] = ["p0", "p1", "p2", "p3"];
const P = ["folder", "caller", "masher", "riichiRusher", "chaos", "stall"] as const;

const agg: Record<string, number> = {};
let rounds = 0, crashes = 0;
const seen = new Set<string>();
for (let seed = from; seed <= to; seed++) {
  const preset = Object.fromEntries(seats.map((s, i) => [s, i < nSeats ? [aug] : []])) as any;
  const personas = Object.fromEntries(seats.map((s, k) => [s, PERSONAS[P[(seed + k) % P.length]!]!])) as any;
  const chk = makeChecks(preset, mode);
  const r = await runDefcall({ seed, mode, preset, personas, noDraft: true, onState: chk.onState, onEvent: chk.onEvent });
  rounds += r.rounds;
  for (const [k, v] of Object.entries(chk.stats)) agg[k] = (agg[k] ?? 0) + v;
  if (r.crash !== undefined) { crashes++; console.log(`CRASH seed=${seed} ${r.crash.split("\n").slice(0, 4).join(" | ")}`); }
  for (const ee of r.effectErrors.slice(0, 2)) {
    const k = `EFF ${ee.slice(0, 100)}`;
    if (!seen.has(k)) { seen.add(k); console.log(`${k} seed=${seed}`); }
  }
  for (const v of r.violations) {
    agg[`viol:${v.kind}`] = (agg[`viol:${v.kind}`] ?? 0) + 1;
    const k = v.kind + v.detail.slice(0, 30);
    if (!seen.has(k)) { seen.add(k); console.log(`VIOL ${v.kind} seed=${seed} seat=${v.seat ?? "-"} r=${v.round} :: ${v.detail.slice(0, 220)}`); }
  }
}
console.log(`\n=== ${aug} x${nSeats} ${mode} seeds ${from}..${to}: rounds=${rounds} crashes=${crashes}`);
console.log(JSON.stringify(Object.fromEntries(Object.entries(agg).sort())));
