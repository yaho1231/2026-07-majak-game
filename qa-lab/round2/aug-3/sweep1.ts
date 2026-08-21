/**
 * aug-3 광역 스위프 — 담당 28종. solo / dual(두 좌석 동시 보유) / pair(담당끼리 2개 조합).
 * 사용: tsx qa-lab/round2/aug-3/sweep1.ts <shard> <shards> <perAug>
 */
import { Prng } from "@majak/core";
import { PERSONAS, assignPreset, runMatch, SEATS } from "../../harness.js";
import type { Persona } from "../../harness.js";
import { makeChecks } from "./inv.js";

export const MINE = [
  "nagashi_yakuman", "no_retreat", "no_ron_pact", "north_trader", "off_by_one",
  "omni_chi", "open_kokushi", "open_riichi_reveal", "palm_flip", "parasite",
  "peek_riichi_waits", "picky_eater", "polar_ends", "pond_snatch", "pseudo_dealer",
  "push_riichi", "rank_gate", "red_five_touch", "regret", "reload",
  "riichi_seal", "riichi_upgrade", "rinshan_preview", "roundScope", "royal_kokushi",
  "scapegoat", "seat_swap", "siege_riichi",
].filter((x) => x !== "roundScope"); // roundScope는 증강이 아니라 공용 키 헬퍼다

const plist = Object.values(PERSONAS) as Persona[];
const shard = Number(process.argv[2] ?? 0);
const shards = Number(process.argv[3] ?? 1);
const perAug = Number(process.argv[4] ?? 45);

let games = 0, crashes = 0, effs = 0, viols = 0;
const t0 = Date.now();
const seenKinds = new Map<string, number>();

for (let ai = 0; ai < MINE.length; ai++) {
  if (ai % shards !== shard) continue;
  const aug = MINE[ai] as string;
  for (let k = 0; k < perAug; k++) {
    const seedBase = ai * 1009 + k * 7919 + 13;
    const rng = new Prng(seedBase * 2654435761);
    const mode = k % 3 === 0 ? "tonpuu" : "hanchan";
    const kind = k % 3 === 2 ? "dual" : k % 5 === 1 ? "pair" : "solo";
    let preset = assignPreset(rng, mode, [aug], 2) as Record<string, string[]>;
    if (kind === "dual") {
      preset["p2"] = [aug, ...(preset["p2"] ?? []).filter((x) => x !== aug)].slice(0, 2);
    } else if (kind === "pair") {
      const other = MINE[(ai + 1 + (k % 7)) % MINE.length] as string;
      preset["p0"] = [aug, other];
    }
    const personas = Object.fromEntries(
      SEATS.map((s, i) => [s, plist[(k + i) % plist.length] as Persona]),
    ) as Record<string, Persona>;
    const checks = makeChecks({ preset });
    let r;
    try {
      r = await runMatch({
        seed: seedBase, mode, preset: preset as never, personas: personas as never,
        onState: checks.onState, timeoutMs: 150_000,
      });
    } catch (e) {
      console.log(`THROW aug=${aug} k=${k} seed=${seedBase} ${String(e)}`);
      continue;
    }
    games++;
    const tag = `aug=${aug} kind=${kind} mode=${mode} seed=${seedBase} preset=${JSON.stringify(preset)}`;
    if (r.crash !== undefined) { crashes++; console.log(`CRASH ${tag}\n  ${r.crash}`); }
    if (r.effectErrors.length > 0) { effs++; console.log(`EFFERR ${tag}\n  ${[...new Set(r.effectErrors)].slice(0, 5).join("\n  ")}`); }
    const bad = r.violations.filter((v) => v.kind !== "SCORE_DRIFT_ATTRIBUTED");
    for (const v of bad) seenKinds.set(v.kind, (seenKinds.get(v.kind) ?? 0) + 1);
    if (bad.length > 0) {
      viols++;
      const uniq = [...new Map(bad.map((v) => [v.kind + v.detail.slice(0, 40), v])).values()];
      console.log(`VIOL ${tag}\n  ${JSON.stringify(uniq.slice(0, 6))}`);
    }
    if (games % 25 === 0) console.log(`-- shard${shard} ${games} games ${(Date.now() - t0) / 1000 | 0}s (crash=${crashes} eff=${effs} viol=${viols})`);
  }
}
console.log(`DONE shard=${shard} games=${games} crash=${crashes} eff=${effs} viol=${viols} ${(Date.now() - t0) / 1000 | 0}s`);
console.log(`KINDS ${JSON.stringify([...seenKinds])}`);
