/**
 * 리치 도메인 대량 플레이테스트.
 *   tsx qa-lab/riichi/run.ts <from> <count> [mode]
 */
import { Prng } from "@majak/core";
import type { PlayerId } from "@majak/core";
import { PERSONAS, SEATS, conflicting, runMatch, byId } from "../harness.js";
import type { Persona, Violation } from "../harness.js";
import { riichiCheck, bumpRound } from "./check.js";

export const RIICHI12 = [
  "riichi_upgrade", "free_riichi_discard", "open_riichi_reveal", "no_retreat",
  "all_or_nothing", "riichi_seal", "off_by_one", "stealth_riichi",
  "siege_riichi", "late_double", "palm_flip", "soul_strike",
] as const;

const rusher: Persona = { ...PERSONAS.riichiRusher!, augmentBias: 0.5 };
const rushMasher: Persona = { name: "리치광", augmentBias: 0.95, riichiBias: 1, callBias: 0.15, kanBias: 0.4, alwaysWin: true };
const rushStall: Persona = { name: "리치지연", augmentBias: 0.8, riichiBias: 1, callBias: 0.1, kanBias: 0.2, alwaysWin: false };

export function riichiPreset(rng: Prng, per = 2): Record<PlayerId, string[]> {
  const pool = [...RIICHI12];
  // 셔플
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const out: Record<PlayerId, string[]> = { p0: [], p1: [], p2: [], p3: [] };
  const taken = new Set<string>();
  for (const seat of SEATS) {
    const held = out[seat]!;
    for (const id of pool) {
      if (held.length >= per) break;
      if (taken.has(id)) continue;
      if (held.some((h) => conflicting(h, id))) continue;
      held.push(id);
      taken.add(id);
    }
  }
  return out;
}

export interface Agg {
  matches: number;
  crashes: { seed: number; msg: string; preset: unknown }[];
  effErr: Map<string, number>;
  viol: Map<string, { n: number; ex: string }>;
  covered: Set<string>;
  actions: Record<string, number>;
}

export function newAgg(): Agg {
  return { matches: 0, crashes: [], effErr: new Map(), viol: new Map(), covered: new Set(), actions: {} };
}

export function absorb(agg: Agg, seed: number, preset: Record<PlayerId, readonly string[]>, r: { crash?: string; effectErrors: string[]; violations: Violation[]; actionsTaken: Record<string, number> }): void {
  agg.matches++;
  if (r.crash !== undefined) agg.crashes.push({ seed, msg: r.crash.split("\n").slice(0, 3).join(" | "), preset });
  for (const e of r.effectErrors) agg.effErr.set(e.slice(0, 160), (agg.effErr.get(e.slice(0, 160)) ?? 0) + 1);
  for (const v of r.violations) {
    const cur = agg.viol.get(v.kind);
    if (cur === undefined) agg.viol.set(v.kind, { n: 1, ex: `seed=${seed} ${v.round} ${v.seat ?? ""} ${v.detail} :: ${JSON.stringify(preset)}` });
    else cur.n++;
  }
  for (const [k, n] of Object.entries(r.actionsTaken)) agg.actions[k] = (agg.actions[k] ?? 0) + n;
}

export function report(agg: Agg): void {
  console.log(`\n=== ${agg.matches} matches ===`);
  console.log("actions:", JSON.stringify(agg.actions));
  console.log(`crashes: ${agg.crashes.length}`);
  for (const c of agg.crashes.slice(0, 12)) console.log(`  seed=${c.seed} ${c.msg}\n    ${JSON.stringify(c.preset)}`);
  console.log("effectErrors:");
  for (const [k, n] of [...agg.effErr].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  x${n} ${k}`);
  console.log("violations:");
  for (const [k, v] of [...agg.viol].sort((a, b) => b[1].n - a[1].n)) console.log(`  x${v.n} ${k}\n     ${v.ex}`);
}

const PERS: Persona[][] = [
  [rusher, rushMasher, PERSONAS.caller!, PERSONAS.folder!],
  [rushMasher, rusher, rushStall, PERSONAS.masher!],
  [rushStall, rushMasher, rusher, PERSONAS.chaos!],
  [rusher, rusher, rushMasher, PERSONAS.stall!],
  [rushMasher, PERSONAS.folder!, rusher, rusher],
];

export async function main(): Promise<void> {
  const from = Number(process.argv[2] ?? 1);
  const count = Number(process.argv[3] ?? 20);
  const mode = (process.argv[4] ?? "hanchan") as "hanchan" | "tonpuu";
  const agg = newAgg();
  for (let i = 0; i < count; i++) {
    const seed = from + i;
    const rng = new Prng(seed * 7919 + 13);
    const preset = riichiPreset(rng, seed % 3 === 0 ? 3 : 2);
    for (const s of SEATS) for (const a of preset[s]) agg.covered.add(a);
    const ps = PERS[seed % PERS.length]!;
    const box: { w: null } = { w: null };
    const r = await runMatch({
      seed, mode, preset,
      personas: { p0: ps[0]!, p1: ps[1]!, p2: ps[2]!, p3: ps[3]! },
      onRound: (_st, phase) => { if (phase === "start") bumpRound(); },
      onState: (st, out) => riichiCheck(st, out, box as never),
      timeoutMs: 90_000,
    });
    absorb(agg, seed, preset, r);
    const kinds = [...new Set(r.violations.map((v) => v.kind))].join(",");
    console.log(
      `#${seed} r=${r.rounds} crash=${r.crash === undefined ? "-" : r.crash.split("\n")[0]} eff=${r.effectErrors.length} viol=${r.violations.length}${kinds === "" ? "" : " [" + kinds + "]"}`,
    );
    for (const v of r.violations.slice(0, 6))
      if (v.kind !== "SCORE_DRIFT_ATTRIBUTED")
        console.log(`   ! ${v.kind} ${v.round} ${v.seat ?? ""} ${v.detail}`);
    if (r.violations.some((v) => v.kind !== "SCORE_DRIFT_ATTRIBUTED") || r.crash !== undefined)
      console.log(`   preset=${JSON.stringify(preset)} personas=${ps.map((x) => x.name).join("/")}`);
  }
  report(agg);
  console.log("covered:", [...agg.covered].filter((a) => (RIICHI12 as readonly string[]).includes(a)).length, "/12");
  void byId;
}

if (process.env.QA_NO_MAIN !== "1") await main();
