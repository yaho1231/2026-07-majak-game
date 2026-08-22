/** 네 좌석이 같은 조합을 들었을 때 판이 얼마나 무거워지는가 (triples shard0 이 유독 느리다) */
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
for (const same of [true, false]) {
  let tot = 0, rounds = 0, crash = 0;
  for (let i = 0; i < 6; i++) {
    const seed = 4_400_000 + i * 17;
    const rng = new Prng(seed * 7919 + 17);
    const taken = new Set<string>();
    const preset: Record<string, string[]> = { p0: [], p1: [], p2: [], p3: [] };
    if (same) { const c = combo(rng, 3, taken); for (const s of SEATS) preset[s] = [...c]; }
    else for (const s of SEATS) preset[s] = combo(rng, 3, taken);
    const t = Date.now();
    const r = await runMatch({ seed, mode: "hanchan", preset: preset as never, personas: P, timeoutMs: 180_000 });
    tot += Date.now() - t; rounds += r.rounds; if (r.crash !== undefined) crash++;
  }
  console.log(`sameForAll=${same}: 6게임 ${(tot/1000)|0}s (${(tot/6000).toFixed(1)}s/게임) 총 ${rounds}국 crash=${crash}`);
}
