/** 도메인 불변식 스위프 — 담당 30종 강제 지급 + 페르소나 순환 */
import { Prng } from "@majak/core";
import { PERSONAS, assignPreset, runMatch, SEATS } from "../../harness.js";
import type { Persona, Violation } from "../../harness.js";
import { makeChecks, makeRoundChecks } from "./inv.js";

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
const per = Number(process.argv[4] ?? 20);
let games = 0;
const t0 = Date.now();
for (let ai = 0; ai < MINE.length; ai++) {
  if (ai % shards !== shard) continue;
  const aug = MINE[ai] as string;
  for (let k = 0; k < per; k++) {
    const seed = 90000 + ai * 617 + k * 4409;
    const rng = new Prng(seed * 2654435761);
    const mode = k % 4 === 3 ? "hanchan" : "tonpuu";
    const preset = assignPreset(rng, mode, [aug], 2) as Record<string, string[]>;
    if (k % 3 === 1) {
      preset["p2"] = [aug, ...(preset["p2"] ?? []).filter((x) => x !== aug)].slice(0, 2);
    }
    const personas = Object.fromEntries(
      SEATS.map((s, i) => [s, plist[(k + i) % plist.length] as Persona]),
    ) as Record<string, Persona>;
    const chk = makeChecks();
    const rchk = makeRoundChecks();
    const extra: Violation[] = [];
    let r;
    try {
      r = await runMatch({
        seed, mode, preset: preset as never, personas: personas as never,
        onState: (st, out) => chk(st, out),
        onRound: (st, phase) => rchk(st, phase, extra),
        timeoutMs: 150_000,
      });
    } catch (e) {
      console.log(`THROW aug=${aug} seed=${seed} ${String(e)}`);
      continue;
    }
    games++;
    const tag = `aug=${aug} mode=${mode} seed=${seed} preset=${JSON.stringify(preset)}`;
    if (r.crash !== undefined) console.log(`CRASH ${tag}\n  ${r.crash}`);
    if (r.effectErrors.length > 0) {
      console.log(`EFFERR ${tag}\n  ${[...new Set(r.effectErrors)].slice(0, 4).join("\n  ")}`);
    }
    const bad = [...r.violations, ...extra].filter((v) => v.kind !== "SCORE_DRIFT_ATTRIBUTED");
    if (bad.length > 0) console.log(`VIOL ${tag}\n  ${JSON.stringify(bad.slice(0, 8))}`);
    if (games % 10 === 0) console.log(`-- inv shard${shard} ${games} ${((Date.now() - t0) / 1000) | 0}s`);
  }
}
console.log(`DONE-INV shard=${shard} games=${games} ${((Date.now() - t0) / 1000) | 0}s`);
