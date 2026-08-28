/** augbug 스위프 GC 스래싱 원인 조사 — 판을 여러 번 돌리며 RSS를 찍는다 */
import { Prng } from "@majak/core";
import { PERSONAS, SEATS, assignPreset, runMatch } from "../../harness.js";
import type { Persona } from "../../harness.js";

const plist = Object.values(PERSONAS) as Persona[];
const N = Number(process.argv[2] ?? 40);
const start = Number(process.argv[3] ?? 94000);

function mb(n: number): string { return (n / 1024 / 1024).toFixed(1); }

for (let k = 0; k < N; k++) {
  const i = start + k;
  const rng = new Prng(i * 2654435761);
  const mode = i % 3 === 0 ? "tonpuu" : "hanchan";
  const forced = ["devils_advance"];
  const preset = assignPreset(rng, mode as never, forced, 2);
  const personas = Object.fromEntries(
    SEATS.map((s) => [s, plist[rng.int(plist.length)] as Persona]),
  ) as Record<string, Persona>;
  const t0 = Date.now();
  const r = await runMatch({ seed: i * 7919 + 13, mode: mode as never, preset, personas: personas as never, timeoutMs: 30_000 });
  const dt = Date.now() - t0;
  if (global.gc) global.gc();
  const mu = process.memoryUsage();
  console.log(
    `k=${k} i=${i} dt=${dt}ms rss=${mb(mu.rss)}MB heapUsed=${mb(mu.heapUsed)}MB external=${mb(mu.external)}MB arrayBuffers=${mb(mu.arrayBuffers)}MB crash=${r.crash !== undefined} rounds=${r.rounds}`,
  );
}
