/** disrupt-b 대량 실행 — 담당 증강을 강제 지급하고 페르소나를 돌린다 */
import { Prng } from "@majak/core";
import { PERSONAS, assignPreset, runMatch, SEATS } from "../harness.js";
import type { Persona } from "../harness.js";
import { MINE, crossRoundCheck, domainCheck, makeCtx } from "./checks.js";

const argv = process.argv.slice(2);
const arg = (k: string, d: number): number => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 ? Number(argv[i + 1]) : d;
};
const N = arg("n", 20);
const START = arg("start", 1);
const MODE = argv.includes("--tonpuu") ? "tonpuu" : "hanchan";

const personaNames = ["masher", "riichiRusher", "folder", "caller", "chaos", "stall"];
const pick = (rng: Prng): Persona => PERSONAS[personaNames[rng.int(personaNames.length)]!]!;

let totalRounds = 0;
const summary = new Map<string, number>();
const bump = (k: string): void => summary.set(k, (summary.get(k) ?? 0) + 1);

for (let i = 0; i < N; i++) {
  const seed = START + i;
  const rng = new Prng(seed * 7919 + 13);
  // 담당 증강 2개를 p0에, 다른 2개를 p1에 강제 — 나머지는 무작위
  const shuffled = [...MINE].sort(() => rng.next() - 0.5);
  const forced = shuffled.slice(0, 2);
  const preset = assignPreset(rng, MODE as "hanchan" | "tonpuu", forced);
  // p1에도 담당 증강 하나를 밀어넣는다 (상호작용)
  const extra = shuffled[2]!;
  if (!Object.values(preset).some((l) => l.includes(extra))) {
    (preset.p1 as string[])[0] = extra;
  }
  const ctx = makeCtx();
  const cross: import("../harness.js").Violation[] = [];
  const r = await runMatch({
    seed,
    mode: MODE as "hanchan" | "tonpuu",
    preset,
    personas: { p0: pick(rng), p1: pick(rng), p2: pick(rng), p3: pick(rng) },
    onState: (st, out) => domainCheck(st, out, ctx),
    onRound: (st, phase) => {
      domainCheck(st, [], ctx);
      if (phase === "start") crossRoundCheck(st, cross, ctx);
    },
    timeoutMs: 120_000,
  });
  totalRounds += r.rounds;
  const kinds = new Map<string, string>();
  for (const v of [...r.violations, ...cross]) if (!kinds.has(v.kind)) kinds.set(v.kind, `${v.round} ${v.seat ?? ""} ${v.detail}`);
  const acts = Object.entries(r.actionsTaken).filter(([k]) => ["call_seal_use","declare_brief_fog","disarm_lock","push_brand","frame_discard","reload_use"].includes(k)).map(([k,v]) => `${k}=${v}`).join(" ");
  console.log(`COV seed=${seed} ${acts}`);
  const line = [
    `seed=${seed}`,
    `${MODE}`,
    `rounds=${r.rounds}`,
    r.crash ? `CRASH:${r.crash.split("\n")[0]}` : "",
    r.effectErrors.length ? `EFFERR(${r.effectErrors.length}):${r.effectErrors[0]}` : "",
    kinds.size ? `VIOL:${[...kinds.keys()].join(",")}` : "",
  ].filter(Boolean).join(" ");
  if (r.crash || r.effectErrors.length || kinds.size) {
    console.log(line);
    console.log("   forced:", JSON.stringify(preset));
    for (const [k, d] of kinds) console.log(`   - ${k}: ${d}`);
    if (r.crash) console.log("   ", r.crash);
    if (r.effectErrors.length) console.log("   eff:", [...new Set(r.effectErrors)].slice(0, 4));
  }
  if (r.crash) bump(`CRASH:${r.crash.split("\n")[0].slice(0, 60)}`);
  for (const e of new Set(r.effectErrors)) bump(`EFF:${e.slice(0, 60)}`);
  for (const k of kinds.keys()) bump(k);
}
console.log(`\n=== ${N} matches (${MODE}), rounds=${totalRounds} ===`);
for (const [k, v] of [...summary].sort((a, b) => b[1] - a[1])) console.log(`${String(v).padStart(4)}  ${k}`);
void SEATS;
