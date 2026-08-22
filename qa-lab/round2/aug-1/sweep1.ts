/**
 * aug-1 광역 스위프 — 담당 30종을 강제 지급하고 페르소나를 돌려가며 완주시킨다.
 * 모드: solo(p0만) / dual(p0,p2 동시 보유) / pair(담당 증강 2개 조합)
 */
import { Prng } from "@majak/core";
import { PERSONAS, assignPreset, runMatch, SEATS } from "../../harness.js";
import type { Persona } from "../../harness.js";

const MINE = [
  "alchemist", "all_or_nothing", "always_tenpai", "ankan_dora", "aotenjou_ceiling",
  "async_chiitoi", "avenger", "big_hand", "blame_shift", "blind_ron",
  "blood_contract", "bluff_pretense", "bottom_deal", "bottom_yaku", "brief_fog",
  "broken_border", "broken_wall", "call_seal", "cliff_bloom", "conjure_draw",
  "cornucopia", "counter", "danger_sense", "dead_wall_master", "devils_advance",
  "die_hard", "disarm", "discard_lock", "dora_afterimage", "dora_conceal",
];

const plist = Object.values(PERSONAS) as Persona[];
const shard = Number(process.argv[2] ?? 0);
const shards = Number(process.argv[3] ?? 1);
const perAug = Number(process.argv[4] ?? 45);

let games = 0, crashes = 0, effs = 0, viols = 0;
const t0 = Date.now();
for (let ai = 0; ai < MINE.length; ai++) {
  if (ai % shards !== shard) continue;
  const aug = MINE[ai] as string;
  for (let k = 0; k < perAug; k++) {
    const seedBase = ai * 1009 + k * 7919 + 13;
    const rng = new Prng(seedBase * 2654435761);
    const mode = k % 3 === 2 ? "hanchan" : "tonpuu";
    const kind = k % 3 === 2 ? "dual" : k % 5 === 1 ? "pair" : "solo";
    let preset = assignPreset(rng, mode, [aug], 2) as Record<string, string[]>;
    if (kind === "dual") {
      preset = assignPreset(rng, mode, [aug], 2) as Record<string, string[]>;
      preset["p2"] = [aug, ...(preset["p2"] ?? []).filter((x) => x !== aug)].slice(0, 2);
    } else if (kind === "pair") {
      const other = MINE[(ai + 1 + (k % 7)) % MINE.length] as string;
      preset = assignPreset(rng, mode, [aug], 2) as Record<string, string[]>;
      preset["p0"] = [aug, other];
    }
    const personas = Object.fromEntries(
      SEATS.map((s, i) => [s, plist[(k + i) % plist.length] as Persona]),
    ) as Record<string, Persona>;
    let r;
    try {
      r = await runMatch({ seed: seedBase, mode, preset: preset as never, personas: personas as never, timeoutMs: 120_000 });
    } catch (e) {
      console.log(`THROW aug=${aug} k=${k} seed=${seedBase} ${String(e)}`);
      continue;
    }
    games++;
    const tag = `aug=${aug} kind=${kind} mode=${mode} seed=${seedBase} preset=${JSON.stringify(preset)}`;
    if (r.crash !== undefined) { crashes++; console.log(`CRASH ${tag}\n  ${r.crash}`); }
    if (r.effectErrors.length > 0) { effs++; console.log(`EFFERR ${tag}\n  ${[...new Set(r.effectErrors)].slice(0, 5).join("\n  ")}`); }
    const bad = r.violations.filter((v) => v.kind !== "SCORE_DRIFT_ATTRIBUTED");
    if (bad.length > 0) { viols++; console.log(`VIOL ${tag}\n  ${JSON.stringify(bad.slice(0, 6))}`); }
    if (games % 10 === 0) console.log(`-- shard${shard} ${games} games ${(Date.now() - t0) / 1000 | 0}s (crash=${crashes} eff=${effs} viol=${viols})`);
  }
}
console.log(`DONE shard=${shard} games=${games} crash=${crashes} eff=${effs} viol=${viols} ${(Date.now() - t0) / 1000 | 0}s`);
