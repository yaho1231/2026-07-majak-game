import type { PlayerId } from "@majak/core";
import { PERSONAS } from "../harness.js";
import { runSpyMatch } from "./spy.js";

const preset: Record<PlayerId, string[]> = {
  p0: ["peek_riichi_waits", "tenpai_scan"],
  p1: ["xray_hand", "danger_sense"],
  p2: ["rinshan_preview", "triple_peek"],
  p3: ["foresight", "ura_peek"],
};
const personas = { p0: PERSONAS.masher!, p1: PERSONAS.stall!, p2: PERSONAS.caller!, p3: PERSONAS.riichiRusher! };

const r = await runSpyMatch({ seed: Number(process.argv[2] ?? 100), preset, personas, timeoutMs: 120000 });
console.log("rounds", r.rounds, "views", r.views, "leaks", r.leaks.length, "crash", r.crash);
const byKind = new Map<string, typeof r.leaks>();
for (const l of r.leaks) { const a = byKind.get(l.kind) ?? []; a.push(l); byKind.set(l.kind, a); }
for (const [k, a] of byKind) {
  console.log(`\n## ${k} x${a.length}`);
  for (const l of a.slice(0, 5)) console.log(`  ${l.viewer}@${l.round} ${l.detail}`);
}
