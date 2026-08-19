/**
 * 점수 총합 드리프트를 **이벤트 단위**로 추적한다.
 * 사용: tsx qa-lab/defcall/trace_drift.ts <augId> <seed> [nSeats] [mode]
 */
import type { PlayerId } from "@majak/core";
import { PERSONAS } from "../harness.js";
import { runDefcall } from "./run.js";

const aug = process.argv[2]!;
const seed = Number(process.argv[3] ?? 1);
const nSeats = Number(process.argv[4] ?? 2);
const mode = (process.argv[5] === "tonpuu" ? "tonpuu" : "hanchan") as "hanchan" | "tonpuu";
const seats: PlayerId[] = ["p0", "p1", "p2", "p3"];
const P = ["folder", "caller", "masher", "riichiRusher", "chaos", "stall"] as const;

const preset = Object.fromEntries(seats.map((s, i) => [s, i < nSeats ? [aug] : []])) as any;
const personas = Object.fromEntries(seats.map((s, k) => [s, PERSONAS[P[(seed + k) % P.length]!]!])) as any;

let last = -1;
const recent: string[] = [];
const r = await runDefcall({
  seed, mode, preset, personas, noDraft: process.env.DRAFT !== '1',
  onEvent: (e, st) => {
    recent.push(`${e.type} ${JSON.stringify(e.payload).slice(0, 220)}`);
    if (recent.length > 12) recent.shift();
    if (st === null) return;
    let t = st.players.reduce((a, p) => a + p.score, 0) + st.round.riichiPot;
    if (last < 0) { last = t; return; }
    if (t !== last) {
      console.log(`\n### DRIFT ${last} -> ${t} (${t - last}) at ${e.type}  round=${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba} pot=${st.round.riichiPot}`);
      console.log(`  scores=${JSON.stringify(Object.fromEntries(st.players.map((p) => [p.id, p.score])))}`);
      for (const l of recent) console.log(`   | ${l}`);
      last = t;
    }
  },
});
console.log("crash", r.crash ?? "-", "rounds", r.rounds, "final", JSON.stringify(r.finalScores));
