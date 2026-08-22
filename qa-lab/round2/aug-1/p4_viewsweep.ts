import { Prng } from "@majak/core";
import { PERSONAS, assignPreset, SEATS } from "../../harness.js";
import type { Persona } from "../../harness.js";
import { runViewMatch } from "./viewrun.js";

const MINE = (process.argv[2] ?? "") === "" ? [
  "bottom_deal","dead_wall_master","cliff_bloom","brief_fog","danger_sense",
  "discard_lock","dora_conceal","dora_afterimage","counter","blind_ron",
  "alchemist","conjure_draw","bluff_pretense","disarm","call_seal",
] : [process.argv[2]];
const per = Number(process.argv[3] ?? 6);
const plist = Object.values(PERSONAS) as Persona[];

for (let ai = 0; ai < MINE.length; ai++) {
  const aug = MINE[ai] as string;
  for (let k = 0; k < per; k++) {
    const seed = ai * 733 + k * 3137 + 5;
    const rng = new Prng(seed * 2654435761);
    const mode = k % 2 === 0 ? "tonpuu" : "hanchan";
    const preset = assignPreset(rng, mode, [aug], 2) as Record<string, string[]>;
    if (k % 3 === 2) preset["p2"] = [aug, ...(preset["p2"] ?? []).filter((x) => x !== aug)].slice(0, 2);
    const personas = Object.fromEntries(SEATS.map((s, i) => [s, plist[(k + i) % plist.length] as Persona])) as Record<string, Persona>;
    const r = await runViewMatch({ seed, mode, preset: preset as never, personas: personas as never });
    const tag = `aug=${aug} seed=${seed} mode=${mode} preset=${JSON.stringify(preset)}`;
    if (r.crash !== undefined) console.log(`CRASH ${tag}\n  ${r.crash}`);
    if (r.effectErrors.length > 0) console.log(`EFFERR ${tag}\n  ${[...new Set(r.effectErrors)].slice(0,4).join("\n  ")}`);
    if (r.leaks.length > 0) {
      const grouped = new Map<string, string[]>();
      for (const l of r.leaks) {
        const arr = grouped.get(l.kind) ?? [];
        if (arr.length < 3) arr.push(`${l.viewer}: ${l.detail}`);
        grouped.set(l.kind, arr);
      }
      console.log(`LEAK ${tag}`);
      for (const [k2, v] of grouped) console.log(`  ${k2}: ${v.join(" | ")}`);
    }
  }
  console.log(`-- done ${aug}`);
}
