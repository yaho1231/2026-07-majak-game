/** 네 좌석 같은 조합 — 어떤 조합이 국 수를 폭발시키는가 (조합별 국 수) */
import { Prng } from "@majak/core";
import type { PlayerId } from "@majak/core";
import { PERSONAS, SEATS, conflicting, offerable, runMatch, DEFS } from "../../pairs/lib.js";
import type { Persona } from "../../pairs/lib.js";
const P = { p0: PERSONAS.masher!, p1: PERSONAS.masher!, p2: PERSONAS.masher!, p3: PERSONAS.masher! } as Record<PlayerId, Persona>;
const pool = DEFS.filter((d) => offerable(d, "hanchan")).map((d) => d.id);
function combo(rng: Prng, n: number, taken: Set<string>): string[] {
  const held: string[] = []; let g = 0;
  while (held.length < n && g++ < 400) {
    const id = pool[rng.int(pool.length)]!;
    if (taken.has(id) || held.some((h) => conflicting(h, id))) continue;
    held.push(id); taken.add(id);
  }
  return held;
}
for (let i = 0; i < 6; i++) {
  const seed = 4_400_000 + i * 17;
  const rng = new Prng(seed * 7919 + 17);
  const c = combo(rng, 3, new Set<string>());
  const preset: Record<string, string[]> = {};
  for (const s of SEATS) preset[s] = [...c];
  const t = Date.now();
  const r = await runMatch({ seed, mode: "hanchan", preset: preset as never, personas: P, timeoutMs: 300_000 });
  console.log(`[${c.join("+")}]  국=${r.rounds}  ${(Date.now()-t)/1000|0}s  crash=${r.crash!==undefined}`);
}
