/**
 * 등록 순서 의존 — 같은 좌석에 같은 두 증강을 [a,b] 와 [b,a] 로 심고 같은 시드로 완주시켜
 * 결과가 달라지는가. 달라지면 드래프트 순서가 결과를 바꾼다는 뜻.
 * 사용: tsx qa-lab/round2/synergy/order_dep.ts <shard> <shards> <mode>
 */
import { Prng } from "@majak/core";
import type { PlayerId } from "@majak/core";
import { PERSONAS, byId, conflicting, offerable, runMatch, DEFS, fillSeats } from "../../pairs/lib.js";
import type { Persona } from "../../pairs/lib.js";
const shard = Number(process.argv[2] ?? 0), shards = Number(process.argv[3] ?? 1);
const mode = (process.argv[4] ?? "tonpuu") as "hanchan" | "tonpuu";
const catOf = (id: string): string => (byId.get(id) as { category?: string } | undefined)?.category ?? "etc";
const ids = DEFS.filter((d) => offerable(d, mode)).map((d) => d.id);
const pairs: [string,string][] = [];
for (let i=0;i<ids.length;i++) for (let j=i+1;j<ids.length;j++){
  const a=ids[i]!,b=ids[j]!;
  if (conflicting(a,b)) continue;
  if (catOf(a)!==catOf(b)) continue;   // 같은 훅을 잡을 확률이 높은 쪽만
  pairs.push([a,b]);
}
const P = { p0: PERSONAS.masher!, p1: PERSONAS.caller!, p2: PERSONAS.riichiRusher!, p3: PERSONAS.stall! } as Record<PlayerId,Persona>;
let n=0, diff=0;
for (let k=0;k<pairs.length;k++){
  if (k%shards!==shard) continue;
  const [a,b]=pairs[k]!;
  const seed = 5_500_000 + k*13;
  const rng = new Prng(seed*7919+13);
  const base = fillSeats(rng, mode, [a,b]) as Record<string,string[]>;
  const A = { ...base, p0: [a,b] } as never;
  const B = { ...base, p0: [b,a] } as never;
  const ra = await runMatch({ seed, mode, preset: A, personas: P, timeoutMs: 120_000 });
  const rb = await runMatch({ seed, mode, preset: B, personas: P, timeoutMs: 120_000 });
  n++;
  const sa = JSON.stringify(ra.finalScores), sb = JSON.stringify(rb.finalScores);
  if (sa!==sb || ra.rounds!==rb.rounds) {
    diff++;
    console.log(`ORDERDEP ${a} | ${b}  seed=${seed}\n   [a,b] ${sa} r=${ra.rounds}\n   [b,a] ${sb} r=${rb.rounds}`);
  }
  if (n%20===0) console.log(`-- s${shard} ${n} pairs, diff=${diff}`);
}
console.log(`DONE shard=${shard} pairs=${n} orderDependent=${diff}`);
