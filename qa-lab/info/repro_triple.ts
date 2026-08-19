import type { PlayerId } from "@majak/core";
import { PERSONAS } from "../harness.js";
import { runSpyMatch } from "./spy.js";

const preset: Record<PlayerId, string[]> = {
  p0: ["triple_peek"], p1: ["triple_peek"], p2: ["triple_peek"], p3: ["triple_peek"],
};
const personas = { p0: PERSONAS.caller!, p1: PERSONAS.caller!, p2: PERSONAS.masher!, p3: PERSONAS.chaos! };
let leaks = 0, rounds = 0;
for (let s = Number(process.argv[2] ?? 1); s < Number(process.argv[2] ?? 1) + Number(process.argv[3] ?? 3); s++) {
  const r = await runSpyMatch({ seed: s, preset, personas, timeoutMs: 120000, noDraft: process.env.NODRAFT === "1" });
  rounds += r.rounds; leaks += r.leaks.length;
  const kinds = new Map<string, number>();
  for (const l of r.leaks) kinds.set(l.kind, (kinds.get(l.kind) ?? 0) + 1);
  console.log(`seed=${s} rounds=${r.rounds} ${JSON.stringify([...kinds])} crash=${r.crash ?? "-"}`);
  for (const l of r.leaks.slice(0, 3)) console.log(`   ${l.kind} ${l.viewer}@${l.round} ${l.detail}`);
}
console.log("total rounds", rounds, "leaks", leaks);
