/**
 * 빌드 하나(또는 대조군)를 시드 여러 개로 완주시키고 JSON 을 남긴다.
 *   tsx qa-lab/synergy3/build/main.ts <buildKey|control> [seeds=8]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { runBuild } from "./run.js";
import { BUILDS } from "./builds.js";
import type { PlayerId } from "@majak/core";

const key = process.argv[2] ?? "control";
const nSeeds = Number(process.argv[3] ?? 8);
const off = Number(process.argv[4] ?? 0);
const def = BUILDS.find((b) => b.key === key);
if (key !== "control" && def === undefined) throw new Error(`unknown build ${key}`);
const ids = def?.ids ?? [];
const mode = def?.mode ?? "tonpuu";

mkdirSync("qa-lab/synergy3/build/out", { recursive: true });

const games: unknown[] = [];
for (let s = 1 + off; s <= nSeeds + off; s++) {
  const preset = { p0: ids, p1: [], p2: [], p3: [] } as Record<PlayerId, readonly string[]>;
  const r = await runBuild({ seed: s, mode, preset });
  games.push({
    seed: s,
    ms: r.ms,
    crash: r.crash ?? null,
    rounds: r.rounds,
    outcomes: r.outcomes,
    finalScores: r.finalScores,
    riichiBySeat: r.riichiBySeat,
    wins: r.wins,
    augPoints: r.augPoints,
    violations: r.violations.map((v) => `${v.kind}:${v.detail}`.slice(0, 200)),
    effectErrors: r.effectErrors,
    actionsBySeat: r.actionsBySeat,
    aug: [...r.metrics.bySeat].map(([k, c]) => ({
      k, ruleSet: c.ruleSet, reactCall: c.reactCall, reactEmit: c.reactEmit,
      interCall: c.interCall, interChange: c.interChange, optionOffer: c.optionOffer,
      actionFired: c.actionFired, emitted: Object.fromEntries(c.emittedTypes),
    })),
    bot: [...r.botMetrics.aug].map(([id, c]) => ({
      id, chooseCalls: c.chooseCalls, proposed: c.proposed, threw: c.threw,
      fired: c.fired, opportunity: c.opportunity, randomFire: c.randomFire,
      lostTo: [...c.lostTo], samples: c.samples.slice(0, 2),
    })),
    contentFailures: [...r.botMetrics.contentFailures],
    unofferedWarns: [...r.botMetrics.unofferedWarns],
    augActions: [...r.botMetrics.augActions].filter(([a]) => ids.includes(a)).map(([a, v]) => [a, [...v]]),
  });
  process.stderr.write(`${key} seed=${s} rounds=${r.rounds} wins=${r.wins.length} ${r.ms}ms ${r.crash ?? ""}\n`);
}
writeFileSync(`qa-lab/synergy3/build/out/${key}${off === 0 ? "" : `_${off}`}.json`, JSON.stringify({ key, ids, mode, games }, null, 1));
console.log(`done ${key}`);
