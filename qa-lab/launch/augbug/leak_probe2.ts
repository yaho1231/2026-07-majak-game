/** sweep.ts와 완전히 같은 파라미터로, 각 판의 시간·RSS를 찍어 이상치를 찾는다 */
import { Prng } from "@majak/core";
import { contentAugments } from "@majak/content";
import { PERSONAS, assignPreset, runMatch, SEATS } from "../../harness.js";
import type { Persona } from "../../harness.js";

const ALL = contentAugments.map((d) => d.id);
const plist = Object.values(PERSONAS) as Persona[];
const start = Number(process.argv[2] ?? 94000);
const count = Number(process.argv[3] ?? 360);

function mb(n: number): string { return (n / 1024 / 1024).toFixed(1); }

for (let i = start; i < start + count; i++) {
  const rng = new Prng(i * 2654435761);
  const mode = i % 3 === 0 ? "tonpuu" : "hanchan";
  const forced = [ALL[i % ALL.length] as string];
  const preset = assignPreset(rng, mode, forced, 2);
  const personas = Object.fromEntries(
    SEATS.map((s) => [s, plist[rng.int(plist.length)] as Persona]),
  ) as Record<string, Persona>;
  const t0 = Date.now();
  const r = await runMatch({ seed: i * 7919 + 13, mode, preset, personas: personas as never, timeoutMs: 90_000 });
  const dt = Date.now() - t0;
  if (global.gc) global.gc();
  const mu = process.memoryUsage();
  const line = `i=${i} dt=${dt}ms rss=${mb(mu.rss)}MB heapUsed=${mb(mu.heapUsed)}MB crash=${r.crash !== undefined} rounds=${r.rounds} forced=${forced[0]}`;
  console.log(line);
  if (dt > 10000) console.log(`  ⚠ SLOW: preset=${JSON.stringify(preset)}`);
}
console.log("PROBE DONE");
