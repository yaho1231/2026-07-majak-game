/** 전 카탈로그 광역 스위프 — 좌석마다 무작위 2증강, 페르소나 혼합, 크래시/불변식 수집 */
import { Prng } from "@majak/core";
import { contentAugments } from "@majak/content";
import { PERSONAS, assignPreset, runMatch, SEATS } from "./harness.js";
import type { Persona } from "./harness.js";

const ALL = contentAugments.map((d) => d.id);
const plist = Object.values(PERSONAS) as Persona[];
const start = Number(process.argv[2] ?? 0);
const count = Number(process.argv[3] ?? 200);

let games = 0, crashes = 0, effs = 0, viols = 0;
for (let i = start; i < start + count; i++) {
  const rng = new Prng(i * 2654435761);
  const mode = i % 3 === 0 ? "tonpuu" : "hanchan";
  const forced = [ALL[i % ALL.length] as string];
  const preset = assignPreset(rng, mode, forced, 2);
  const personas = Object.fromEntries(
    SEATS.map((s) => [s, plist[rng.int(plist.length)] as Persona]),
  ) as Record<string, Persona>;
  const r = await runMatch({ seed: i * 7919 + 13, mode, preset, personas: personas as never, timeoutMs: 90_000 });
  games++;
  if (r.crash !== undefined) { crashes++; console.log(`CRASH i=${i} forced=${forced} mode=${mode}\n  preset=${JSON.stringify(r.preset)}\n  ${r.crash}`); }
  if (r.effectErrors.length > 0) { effs++; console.log(`EFFERR i=${i} forced=${forced} preset=${JSON.stringify(r.preset)}\n  ${r.effectErrors.slice(0,4).join("\n  ")}`); }
  if (r.violations.length > 0) { viols++; console.log(`VIOL i=${i} forced=${forced} preset=${JSON.stringify(r.preset)}\n  ${JSON.stringify(r.violations.slice(0,6))}`); }
  if (games % 25 === 0) console.log(`-- ${games} games (crash=${crashes} eff=${effs} viol=${viols})`);
}
console.log(`DONE games=${games} crash=${crashes} eff=${effs} viol=${viols}`);
