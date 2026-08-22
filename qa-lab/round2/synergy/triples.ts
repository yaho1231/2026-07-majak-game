/**
 * 조합 스위프 — 좌석마다 무작위 2~3개 조합을 강제 지급하고 완주시킨다.
 * 사용: tsx qa-lab/round2/synergy/triples.ts <shard> <shards> <games> <seedBase>
 */
import { Prng } from "@majak/core";
import type { PlayerId } from "@majak/core";
import { PERSONAS, SEATS, byId, conflicting, offerable, runMatch, DEFS, pairInvariants } from "../../pairs/lib.js";
import type { Persona } from "../../pairs/lib.js";

const shard = Number(process.argv[2] ?? 0);
const shards = Number(process.argv[3] ?? 1);
const games = Number(process.argv[4] ?? 100);
const seedBase = Number(process.argv[5] ?? 400000);

const mixes: Persona[][] = [
  [PERSONAS.masher!, PERSONAS.masher!, PERSONAS.masher!, PERSONAS.masher!],
  [PERSONAS.masher!, PERSONAS.caller!, PERSONAS.riichiRusher!, PERSONAS.folder!],
  [PERSONAS.masher!, PERSONAS.stall!, PERSONAS.chaos!, PERSONAS.stall!],
  [PERSONAS.chaos!, PERSONAS.masher!, PERSONAS.caller!, PERSONAS.masher!],
];

function combo(rng: Prng, mode: "hanchan" | "tonpuu", n: number, taken: Set<string>): string[] {
  const pool = DEFS.filter((d) => offerable(d, mode)).map((d) => d.id);
  const held: string[] = [];
  let guard = 0;
  while (held.length < n && guard++ < 500) {
    const id = pool[rng.int(pool.length)] as string;
    if (taken.has(id)) continue;
    if (held.some((h) => conflicting(h, id))) continue;
    held.push(id); taken.add(id);
  }
  return held;
}

let ok = 0, crashes = 0, effs = 0, viols = 0, rounds = 0;
const comboSeen = new Set<string>();
const augSeen = new Set<string>();
const t0 = Date.now();
for (let i = 0; i < games; i++) {
  if (i % shards !== shard) continue;
  const seed = seedBase + i * 13;
  const rng = new Prng(seed * 7919 + 17);
  const mode: "hanchan" | "tonpuu" = i % 3 === 0 ? "tonpuu" : "hanchan";
  const n = 2 + (i % 2); // 2 또는 3
  const taken = new Set<string>();
  const preset: Record<string, string[]> = { p0: [], p1: [], p2: [], p3: [] };
  const sameForAll = i % 4 === 0; // 같은 조합을 네 명이 동시에 (같은 훅 충돌)
  if (sameForAll) {
    const c = combo(rng, mode, n, taken);
    for (const s of SEATS) preset[s] = [...c];
  } else {
    for (const s of SEATS) preset[s] = combo(rng, mode, n, taken);
  }
  for (const s of SEATS) {
    const c = preset[s]!;
    comboSeen.add([...c].sort().join("+"));
    for (const id of c) augSeen.add(id);
  }
  const inv = pairInvariants(preset["p0"] as string[]);
  const mx = mixes[i % mixes.length] as Persona[];
  let r;
  try {
    r = await runMatch({
      seed, mode, preset: preset as unknown as Record<PlayerId, readonly string[]>,
      personas: { p0: mx[0]!, p1: mx[1]!, p2: mx[2]!, p3: mx[3]! } as Record<PlayerId, Persona>,
      onState: inv.onState, onRound: inv.onRound, timeoutMs: 120_000,
    });
  } catch (e) {
    crashes++; console.log(`THROW seed=${seed} ${mode} ${JSON.stringify(preset)}\n  ${String(e)}`); continue;
  }
  ok++; rounds += r.rounds;
  const tag = `seed=${seed} ${mode} same=${sameForAll} preset=${JSON.stringify(preset)}`;
  if (r.crash !== undefined) { crashes++; console.log(`CRASH ${tag}\n  ${r.crash}`); }
  if (r.effectErrors.length > 0) { effs++; console.log(`EFFERR ${tag}\n  ${[...new Set(r.effectErrors)].slice(0, 5).join("\n  ")}`); }
  const bad = r.violations.filter((v) => v.kind !== "SCORE_DRIFT_ATTRIBUTED");
  if (bad.length > 0) { viols++; console.log(`VIOL ${tag}\n  ${JSON.stringify(bad.slice(0, 8))}`); }
  if (ok % 50 === 0) console.log(`-- s${shard} ${ok}g ${rounds}r ${(Date.now()-t0)/1000|0}s crash=${crashes} eff=${effs} viol=${viols} combos=${comboSeen.size} augs=${augSeen.size}`);
}
console.log(`DONE shard=${shard} games=${ok} rounds=${rounds} crash=${crashes} eff=${effs} viol=${viols} combos=${comboSeen.size} augs=${augSeen.size} ${(Date.now()-t0)/1000|0}s`);
