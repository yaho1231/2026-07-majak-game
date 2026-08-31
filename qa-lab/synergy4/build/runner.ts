/**
 * synergy4 빌드 러너 — 한 빌드의 «부분집합 사다리»를 같은 시드로 재서 JSONL 로 남긴다.
 *   tsx qa-lab/synergy4/build/runner.ts <buildKey> <seedFrom> <seedTo> [mode]
 * 조건: full(ABC) · 쌍 3개 · 단독 3개 · none(대조군)  = 8
 * 소스는 건드리지 않는다. synergy3/build/run.ts 의 runBuild 를 그대로 쓴다.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import type { PlayerId } from "@majak/core";
import { runBuild } from "../../synergy3/build/run.js";
import { BUILDS } from "./builds.js";

const key = process.argv[2] ?? "";
const from = Number(process.argv[3] ?? 1);
const to = Number(process.argv[4] ?? 4);
const mode = (process.argv[5] ?? "hanchan") as "hanchan" | "tonpuu";
const def = BUILDS.find((b) => b.key === key);
if (def === undefined) throw new Error(`unknown build ${key}`);
const [A, B, C] = def.ids;

export const CONDS: { name: string; ids: readonly string[] }[] = [
  { name: "ABC", ids: [A, B, C] },
  { name: "AB", ids: [A, B] },
  { name: "AC", ids: [A, C] },
  { name: "BC", ids: [B, C] },
  { name: "A", ids: [A] },
  { name: "B", ids: [B] },
  { name: "C", ids: [C] },
  { name: "none", ids: [] },
];

mkdirSync("qa-lab/synergy4/build/out", { recursive: true });
const outFile = `qa-lab/synergy4/build/out/${key}_${from}-${to}.jsonl`;

for (let s = from; s <= to; s++) {
  for (const c of CONDS) {
    const preset = { p0: c.ids, p1: [], p2: [], p3: [] } as Record<PlayerId, readonly string[]>;
    let r;
    try {
      r = await runBuild({ seed: s, mode, preset, timeoutMs: 300_000 });
    } catch (e) {
      appendFileSync(outFile, `${JSON.stringify({ key, cond: c.name, seed: s, fatal: String(e) })}\n`);
      process.stderr.write(`FATAL ${key} ${c.name} ${s}: ${String(e)}\n`);
      continue;
    }
    const p0wins = r.wins.filter((w) => w.winner === "p0");
    const p0deals = r.wins.filter((w) => w.from === "p0" && w.winner !== "p0");
    const scores = Object.entries(r.finalScores).sort((a, b) => b[1] - a[1]);
    const rank = scores.findIndex(([id]) => id === "p0") + 1;
    appendFileSync(outFile, `${JSON.stringify({
      key, cond: c.name, ids: c.ids, seed: s, mode, ms: r.ms,
      crash: r.crash ?? null,
      rounds: r.rounds,
      outcomes: r.outcomes,
      score: r.finalScores.p0, rank,
      finalScores: r.finalScores,
      wins: p0wins.length,
      winPts: p0wins.reduce((a, w) => a + w.points, 0),
      winHan: p0wins.reduce((a, w) => a + w.han, 0),
      yakuman: p0wins.reduce((a, w) => a + w.yakumanCount, 0),
      dealIn: p0deals.length,
      dealInPts: p0deals.reduce((a, w) => a + w.points, 0),
      riichi: r.riichiBySeat.p0,
      extraHan: p0wins.flatMap((w) => w.extraHanBy),
      augPoints: r.augPoints,
      violations: r.violations.map((v) => `${v.kind}:${v.detail}`.slice(0, 220)),
      effectErrors: r.effectErrors.slice(0, 20),
      fires: [...r.metrics.bySeat].filter(([k]) => k.startsWith("p0|") && c.ids.includes(k.slice(3)))
        .map(([k, v]) => [k.slice(3), { set: v.ruleSet, react: v.reactEmit, inter: v.interChange, offer: v.optionOffer, fired: v.actionFired }]),
      bot: [...r.botMetrics.aug].filter(([id]) => c.ids.includes(id))
        .map(([id, v]) => [id, { opp: v.opportunity, prop: v.proposed, fired: v.fired, threw: v.threw, lostTo: [...v.lostTo] }]),
      contentFailures: [...r.botMetrics.contentFailures].slice(0, 10),
    })}\n`);
    process.stderr.write(`${key} s=${s} ${c.name} score=${r.finalScores.p0} rank=${rank} wins=${p0wins.length} ${r.ms}ms ${r.crash ?? ""}\n`);
  }
}
console.log(`done ${key} ${from}-${to}`);
