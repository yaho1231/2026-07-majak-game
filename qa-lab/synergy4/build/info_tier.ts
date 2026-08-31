/**
 * 정보 축 티어 재평가 — «보유 vs 미보유»를 같은 시드로 짝지어 잰다 (2026-08-31).
 *
 *   tsx qa-lab/synergy4/build/info_tier.ts <seedFrom> <seedTo> [cardsCsv]
 *
 * PR #442 이전에는 봇이 `augmentData`를 아예 안 읽어서 정보 축 카드의 기여가 **정확히 0**이었다
 * (docs/48 A-14). 봇이 자기 정보를 읽게 된 지금, 그 카드들의 실제 값을 다시 잰다.
 *
 * 비용 절약: 같은 시드의 «미보유» 대조군은 카드마다 다시 돌리지 않고 **한 번 돌려 공유**한다.
 * (K장 × N시드 = N×(K+1)판. 카드마다 짝을 새로 돌리면 2NK판.)
 * 대조군 재사용이 정당한 이유는 runBuild가 시드에 대해 결정적이기 때문 — `--check-determinism`
 * 으로 확인할 수 있다.
 *
 * 출력은 JSONL 한 줄 = 한 (카드, 시드) — `info_analyze.ts`가 읽는다.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import type { PlayerId } from "@majak/core";
import { runBuild } from "../../synergy3/build/run.js";

const from = Number(process.argv[2] ?? 1);
const to = Number(process.argv[3] ?? 10);
const cards = (process.argv[4] ?? "").split(",").filter((x) => x !== "");
if (cards.length === 0) throw new Error("cards required");

/**
 * 출력 디렉터리. 기본은 종전 자리이고, `INFO_OUT`으로 갈아 끼운다 —
 * **배선 전/후를 같은 시드로 짝지어 비교**하려면 두 벌의 원자료가 섞이면 안 된다
 * (2026-08-31 봇 정보 배선).
 */
const outDir = process.env["INFO_OUT"] ?? "qa-lab/synergy4/build/info_out";
mkdirSync(outDir, { recursive: true });
const outFile = `${outDir}/s${from}-${to}.jsonl`;

async function one(seed: number, ids: readonly string[]): Promise<Record<string, unknown>> {
  const preset = { p0: ids, p1: [], p2: [], p3: [] } as Record<PlayerId, readonly string[]>;
  const r = await runBuild({ seed, mode: "hanchan", preset, timeoutMs: 600_000 });
  const p0wins = r.wins.filter((w) => w.winner === "p0");
  const p0deals = r.wins.filter((w) => w.from === "p0" && w.winner !== "p0");
  const scores = Object.entries(r.finalScores).sort((a, b) => b[1] - a[1]);
  return {
    score: r.finalScores.p0,
    rank: scores.findIndex(([id]) => id === "p0") + 1,
    rounds: r.rounds,
    wins: p0wins.length,
    winPts: p0wins.reduce((a, w) => a + w.points, 0),
    dealIn: p0deals.length,
    dealInPts: p0deals.reduce((a, w) => a + w.points, 0),
    riichi: r.riichiBySeat.p0 ?? 0,
    crash: r.crash ?? null,
    fires: [...r.metrics.bySeat]
      .filter(([k]) => k.startsWith("p0|") && ids.includes(k.slice(3)))
      .map(([k, v]) => [k.slice(3), v.reactEmit + v.interChange + v.actionFired]),
  };
}

for (let s = from; s <= to; s++) {
  const base = await one(s, []);
  appendFileSync(outFile, `${JSON.stringify({ card: "none", seed: s, ...base })}\n`);
  for (const c of cards) {
    const w = await one(s, [c]);
    appendFileSync(outFile, `${JSON.stringify({ card: c, seed: s, ...w })}\n`);
    process.stderr.write(
      `s=${s} ${c} ${String(w.score)} vs ${String(base.score)} (Δ${Number(w.score) - Number(base.score)})\n`,
    );
  }
}
console.log(`done ${cards.join(",")} ${from}-${to}`);
