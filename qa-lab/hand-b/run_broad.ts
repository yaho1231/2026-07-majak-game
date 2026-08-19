/**
 * 광역 스윕 — 내 담당 11종을 좌석마다 강제로 물리고 수백 판 돌린다.
 * usage: tsx qa-lab/hand-b/run_broad.ts [count] [startSeed] [mode]
 */
import { Prng } from "@majak/core";
import { PERSONAS, runMatch, SEATS, byId, conflicting } from "../harness.js";
import type { Violation } from "../harness.js";
import { MY_AUGMENTS, extraChecks, checkLeak } from "./inv.js";
import type { Memo } from "./inv.js";
import { contentAugments } from "@majak/content";

const N = Number(process.argv[2] ?? 40);
const START = Number(process.argv[3] ?? 1);
const MODE = (process.argv[4] ?? "hanchan") as "hanchan" | "tonpuu";

const personaNames = Object.keys(PERSONAS);
const allIds = contentAugments.map((d) => d.id);

interface Bucket { count: number; sample: string; seeds: number[] }
const buckets = new Map<string, Bucket>();
const bump = (kind: string, detail: string, seed: number): void => {
  const b = buckets.get(kind);
  if (b === undefined) buckets.set(kind, { count: 1, sample: detail, seeds: [seed] });
  else { b.count++; if (b.seeds.length < 8 && !b.seeds.includes(seed)) b.seeds.push(seed); }
};

let rounds = 0;
const useCount = new Map<string, number>();
const acted = new Map<string, number>();

for (let i = 0; i < N; i++) {
  const seed = START + i;
  const rng = new Prng(seed * 7919 + 13);
  // 좌석마다 내 증강 2개 + 랜덤 1개
  const preset: Record<string, string[]> = { p0: [], p1: [], p2: [], p3: [] };
  const shuffled = [...MY_AUGMENTS].sort(() => rng.next() - 0.5);
  const taken = new Set<string>();
  for (let s = 0; s < 4; s++) {
    const seat = SEATS[s]!;
    const held: string[] = [];
    let guard = 0;
    while (held.length < 2 && guard++ < 60) {
      const id = shuffled[rng.int(shuffled.length)]!;
      if (taken.has(id)) continue;
      if (held.some((h) => conflicting(h, id))) continue;
      held.push(id); taken.add(id);
    }
    // 랜덤 1개 추가 (상호작용)
    guard = 0;
    while (held.length < 3 && guard++ < 80) {
      const id = allIds[rng.int(allIds.length)]!;
      if (taken.has(id)) continue;
      const d = byId.get(id);
      if (d?.modes !== undefined && !d.modes.includes(MODE)) continue;
      if (held.some((h) => conflicting(h, id))) continue;
      held.push(id); taken.add(id);
    }
    preset[seat] = held;
    for (const h of held) if ((MY_AUGMENTS as readonly string[]).includes(h)) useCount.set(h, (useCount.get(h) ?? 0) + 1);
  }
  const personas: Record<string, typeof PERSONAS[string]> = {};
  for (const s of SEATS) personas[s] = PERSONAS[personaNames[rng.int(personaNames.length)]!]!;

  const memo: Memo = {};
  const r = await runMatch({
    seed, mode: MODE,
    preset: preset as never,
    personas: personas as never,
    onState: (st, out) => { extraChecks(st, out, memo); },
    onRound: (st, phase) => { if (phase === "start") checkLeak(st, [] as Violation[]); },
    timeoutMs: 180_000,
  });
  rounds += r.rounds;
  for (const [t, n] of Object.entries(r.actionsTaken)) acted.set(t, (acted.get(t) ?? 0) + n);
  if (r.crash !== undefined) bump("CRASH:" + r.crash.split("\n")[0]!.slice(0, 120), r.crash, seed);
  for (const e of r.effectErrors) bump("EFFERR:" + e.slice(0, 120), e, seed);
  for (const v of r.violations) bump(v.kind, `${v.detail} @${v.round} ${v.seat ?? ""}`, seed);
  process.stdout.write(`seed=${seed} rounds=${r.rounds} crash=${r.crash ? "Y" : "-"} eff=${r.effectErrors.length} viol=${r.violations.length}\n`);
}

console.log(`\n=== ${N} matches (${MODE}), ${rounds} rounds ===`);
console.log("actions:", JSON.stringify(Object.fromEntries([...acted].filter(([k])=>!["discard","pass","win","riichi","pon","chi","minkan","ankan","shouminkan","kyushuKyuhai"].includes(k)))));
console.log("augment coverage:", JSON.stringify(Object.fromEntries(useCount)));
if (buckets.size === 0) console.log("no findings");
for (const [k, b] of [...buckets].sort((a, b2) => b2[1].count - a[1].count)) {
  console.log(`\n[${b.count}] ${k}\n   seeds=${b.seeds.join(",")}\n   ${b.sample.slice(0, 400)}`);
}
