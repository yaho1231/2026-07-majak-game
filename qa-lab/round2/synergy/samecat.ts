/**
 * **같은 계열(category)끼리의 짝** 전수 스위프 — 1차 pairs 감사가 명시적으로 제외한 구간.
 * 같은 훅을 잡는 둘(점수 배율×배율, 패산 조작×조작 …)이 여기 모여 있다.
 * 사용: tsx qa-lab/round2/synergy/samecat.ts <shard> <shards> [cats] [mode]
 */
import { Prng } from "@majak/core";
import type { PlayerId } from "@majak/core";
import { PERSONAS, byId, conflicting, offerable, runMatch, DEFS, fillSeats, pairInvariants } from "../../pairs/lib.js";
import type { Persona } from "../../pairs/lib.js";

const shard = Number(process.argv[2] ?? 0);
const shards = Number(process.argv[3] ?? 1);
const catFilter = (process.argv[4] ?? "").split(",").filter((s) => s !== "");
const mode = (process.argv[5] ?? "tonpuu") as "hanchan" | "tonpuu";

const catOf = (id: string): string => (byId.get(id) as { category?: string } | undefined)?.category ?? "etc";
const ids = DEFS.filter((d) => offerable(d, mode)).map((d) => d.id);
const pairs: [string, string][] = [];
for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
  const a = ids[i]!, b = ids[j]!;
  if (catOf(a) !== catOf(b)) continue;
  if (catFilter.length > 0 && !catFilter.includes(catOf(a))) continue;
  if (conflicting(a, b)) continue;
  pairs.push([a, b]);
}
console.log(`같은 계열 짝 ${pairs.length}쌍 (mode=${mode}) shard ${shard}/${shards}`);

const mixes: Persona[][] = [
  [PERSONAS.masher!, PERSONAS.masher!, PERSONAS.masher!, PERSONAS.masher!],
  [PERSONAS.masher!, PERSONAS.caller!, PERSONAS.riichiRusher!, PERSONAS.folder!],
  [PERSONAS.masher!, PERSONAS.stall!, PERSONAS.chaos!, PERSONAS.stall!],
];
let ok = 0, crash = 0, eff = 0, viol = 0, rounds = 0;
const t0 = Date.now();
for (let k = 0; k < pairs.length; k++) {
  if (k % shards !== shard) continue;
  const [a, b] = pairs[k]!;
  const seed = 810_000 + k * 17;
  const rng = new Prng(seed * 7919 + 13);
  const preset = fillSeats(rng, mode, [a, b]) as Record<string, string[]>;
  preset["p2"] = [a, b]; // 같은 짝을 두 사람이 마주 든다
  const inv = pairInvariants([a, b]);
  const mx = mixes[k % mixes.length] as Persona[];
  let r;
  try {
    r = await runMatch({
      seed, mode, preset: preset as unknown as Record<PlayerId, readonly string[]>,
      personas: { p0: mx[0]!, p1: mx[1]!, p2: mx[2]!, p3: mx[3]! } as Record<PlayerId, Persona>,
      onState: inv.onState, onRound: inv.onRound, timeoutMs: 120_000,
    });
  } catch (e) { crash++; console.log(`THROW ${a}×${b} seed=${seed}: ${String(e)}`); continue; }
  ok++; rounds += r.rounds;
  const tag = `${catOf(a)} ${a}×${b} seed=${seed} ${mode}`;
  if (r.crash !== undefined) { crash++; console.log(`CRASH ${tag}\n  ${r.crash}`); }
  if (r.effectErrors.length > 0) { eff++; console.log(`EFFERR ${tag}\n  ${[...new Set(r.effectErrors)].slice(0,5).join("\n  ")}`); }
  const bad = r.violations.filter((v) => v.kind !== "SCORE_DRIFT_ATTRIBUTED");
  if (bad.length > 0) { viol++; console.log(`VIOL ${tag} preset=${JSON.stringify(preset)}\n  ${JSON.stringify(bad.slice(0,8))}`); }
  if (ok % 25 === 0) console.log(`-- s${shard} ${ok}p ${rounds}r ${(Date.now()-t0)/1000|0}s crash=${crash} eff=${eff} viol=${viol}`);
}
console.log(`DONE shard=${shard} pairs=${ok} rounds=${rounds} crash=${crash} eff=${eff} viol=${viol} ${(Date.now()-t0)/1000|0}s`);
