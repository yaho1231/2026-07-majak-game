/**
 * aug-4 광역 스위프 — 담당 27증강을 강제 지급하고 페르소나를 돌려 가며 완주시킨다.
 *
 * usage: tsx qa-lab/round2/aug-4/sweep.ts <shard> <nShards> <count>
 *   전역 인덱스 idx로 (증강 · 배치 · 모드 · 페르소나)를 결정론적으로 정하고,
 *   idx % nShards === shard 인 것만 돈다 (병렬 실행용).
 *
 *   배치: 0=solo(p0만) 1=duo(p0·p2가 같은 증강) 2=pair(p0가 담당 2종)
 */
import { Prng } from "@majak/core";
import { PERSONAS, assignPreset, runMatch, SEATS } from "../../harness.js";
import type { Persona } from "../../harness.js";
import { MINE, checkDomain, type DomainCtx } from "./invariants.js";

const plist = Object.values(PERSONAS) as Persona[];
const shard = Number(process.argv[2] ?? 0);
const nShards = Number(process.argv[3] ?? 1);
const count = Number(process.argv[4] ?? 50);

let games = 0, crashes = 0, effs = 0, viols = 0;
const seen = new Set<string>();

function log(s: string): void {
  console.log(s);
}

for (let n = 0; n < count; n++) {
  const idx = n * nShards + shard;
  const aug = MINE[idx % MINE.length] as string;
  const variant = Math.floor(idx / MINE.length) % 3;
  const gmode: "hanchan" | "tonpuu" = idx % 4 === 0 ? "hanchan" : "tonpuu";
  const rng = new Prng(idx * 2654435761 + 7);
  let preset: Record<string, string[]>;
  let extra = `idx=${idx} aug=${aug} v=${variant}`;
  if (variant === 0) {
    preset = assignPreset(rng, gmode, [aug], 2);
  } else if (variant === 1) {
    preset = assignPreset(rng, gmode, [aug], 1);
    (preset["p2"] as string[]) = [aug];
    extra += " duo";
  } else {
    preset = assignPreset(rng, gmode, [aug], 1);
    const other = MINE[(idx * 7 + 3) % MINE.length] as string;
    if (other !== aug) (preset["p0"] as string[]).push(other);
    extra += ` +${other}`;
  }
  const personas = Object.fromEntries(
    SEATS.map((s, k) => [s, plist[(idx + k * 5) % plist.length] as Persona]),
  ) as Record<string, Persona>;
  const dctx: DomainCtx = { violations: [], holders: preset as Record<string, readonly string[]> };
  const r = await runMatch({
    seed: idx * 7919 + 13,
    mode: gmode,
    preset: preset as never,
    personas: personas as never,
    timeoutMs: 180_000,
    onState: (st, out) => checkDomain(st, out, dctx),
  });
  games++;
  if (r.crash !== undefined) {
    crashes++;
    log(`CRASH ${gmode} ${extra}\n  preset=${JSON.stringify(r.preset)}\n  ${r.crash}`);
  }
  if (r.effectErrors.length > 0) {
    effs++;
    for (const e of r.effectErrors.slice(0, 3)) {
      const k = `EFF:${e.slice(0, 120)}`;
      if (!seen.has(k)) { seen.add(k); log(`EFFERR ${gmode} ${extra} preset=${JSON.stringify(r.preset)}\n  ${e}`); }
    }
  }
  const bad = r.violations.filter((v) => v.kind !== "SCORE_DRIFT_ATTRIBUTED");
  if (bad.length > 0) {
    viols++;
    for (const v of bad.slice(0, 6)) {
      const k = `V:${v.kind}:${v.detail.slice(0, 90)}`;
      if (!seen.has(k)) {
        seen.add(k);
        log(`VIOL ${gmode} ${extra} ${v.kind} [${v.round}${v.seat !== undefined ? " " + v.seat : ""}] ${v.detail}\n   preset=${JSON.stringify(r.preset)}`);
      }
    }
  }
  if (games % 10 === 0) log(`-- shard${shard} ${games}/${count} (crash=${crashes} eff=${effs} viol=${viols})`);
}
log(`DONE shard=${shard} games=${games} crash=${crashes} eff=${effs} viol=${viols}`);
