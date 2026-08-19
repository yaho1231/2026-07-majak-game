import { Prng } from "@majak/core";
import { PERSONAS, assignPreset } from "../harness.js";
import { runSpyMatch } from "./spy.js";
import type { PlayerId } from "@majak/core";

const INFO = ["ura_peek","peek_riichi_waits","xray_hand","rinshan_preview","foresight","dora_conceal","tenpai_scan","danger_sense","triple_peek"];
const personaNames = ["masher","riichiRusher","folder","caller","chaos","stall"];

async function main() {
  const N = Number(process.argv[2] ?? 12);
  const start = Number(process.argv[3] ?? 1);
  const census = new Map<string, Set<string>>();
  const tally: Record<string, number> = {};
  const examples: Record<string, string> = {};
  let rounds = 0, views = 0;
  for (let s = start; s < start + N; s++) {
    const rng = new Prng(s * 977);
    // 좌석마다 담당 증강 하나씩 + 랜덤 하나
    const forced = INFO[s % INFO.length]!;
    const preset = assignPreset(rng, "hanchan", [forced], 2);
    // 정보 증강을 최소 2좌석에 강제 배치
    (preset.p1 as string[])[0] = INFO[(s + 3) % INFO.length]!;
    (preset.p2 as string[])[0] = INFO[(s + 5) % INFO.length]!;
    const personas = Object.fromEntries(
      (["p0","p1","p2","p3"] as PlayerId[]).map((p, i) => [p, PERSONAS[personaNames[(s + i) % personaNames.length]!]!]),
    ) as Record<PlayerId, typeof PERSONAS.masher>;
    const r = await runSpyMatch({ seed: s, preset, personas });
    rounds += r.rounds; views += r.views;
    for (const [k, v] of r.census) {
      let set = census.get(k); if (!set) { set = new Set(); census.set(k, set); }
      for (const x of v) if (set.size < 8) set.add(x);
    }
    for (const l of r.leaks) {
      const chan = l.kind === "RESIDUE_ANY" ? (/channel "([^"]+)"/.exec(l.detail)?.[1] ?? "?") : "";
      const key = chan === "" ? l.kind : `${l.kind}:${chan.replace(/p[0-3]$/, "pN")}`;
      tally[key] = (tally[key] ?? 0) + 1;
      examples[key] ??= `seed=${s} :: ${l.viewer}@${l.round} :: ${l.detail}`;
    }
    if (r.crash !== undefined) { tally["CRASH"] = (tally["CRASH"] ?? 0) + 1; examples["CRASH"] ??= `seed=${s} ${r.crash}`; }
    for (const e of r.effectErrors) { tally["EFFECT_ERR"] = (tally["EFFECT_ERR"] ?? 0) + 1; examples["EFFECT_ERR"] ??= `seed=${s} ${e}`; }
    for (const v of r.violations) { tally[v.kind] = (tally[v.kind] ?? 0) + 1; examples[v.kind] ??= `seed=${s} ${v.detail}`; }
    process.stdout.write(`seed ${s}: rounds=${r.rounds} views=${r.views} leaks=${r.leaks.length}\n`);
  }
  console.log(`\n=== ${N} matches, ${rounds} rounds, ${views} views ===`);
  console.log("TALLY:", JSON.stringify(tally, null, 1));
  for (const [k, v] of Object.entries(examples)) console.log(`\n[${k}] ${v}`);
  console.log("\n=== augmentView channel census ===");
  for (const [k, v] of [...census].sort()) console.log(`  ${k}  <-  ${[...v].join(" | ")}`);
}
main();
