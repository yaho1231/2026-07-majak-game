/**
 * 시뮬레이션 샤드(JSONL) → 증강별 통계표.
 *
 * 러너가 판·좌석 단위로 원시 통계를 통째로 남겨 두므로, 집계는 전부 여기서 한다.
 * 표본을 다시 돌리지 않고 질문을 바꿀 수 있다는 것이 이 구조의 요점이다.
 *
 *   node --import tsx/esm aggregate.ts out/*.jsonl > report.md
 *   node --import tsx/esm aggregate.ts --json out/*.jsonl > stats.json
 */

import { readFileSync } from "node:fs";
import { AUGMENT_POWER_TIERS, standardAugments } from "@majak/core";
import { contentAugments } from "@majak/content";

interface Raw {
  roundsPlayed: number; wins: number; tsumoWins: number; ronWins: number;
  winPointsTotal: number; dealIns: number; dealInPointsTotal: number;
  riichiRounds: number; callRounds: number;
}
interface Row {
  seat: string; archetype: string; persona: string;
  augments: string[];
  offers: { stage: string; offered: string[]; picked: string }[];
  rank: number; score: number; rawScore: number;
  tenpaiDraws: number; drawRounds: number;
  stats: Raw;
}

const NAME = new Map<string, string>();
for (const d of [...contentAugments, ...standardAugments]) {
  NAME.set(d.id, (d as { name?: string }).name ?? d.id);
}

class Acc {
  offered = 0; picked = 0;
  games = 0; placementSum = 0; placementSq = 0;
  placements: [number, number, number, number] = [0, 0, 0, 0];
  scoreSum = 0; rawSum = 0; maxRaw = -Infinity; minRaw = Infinity;
  rounds = 0; wins = 0; tsumo = 0; winPts = 0;
  dealIns = 0; dealInPts = 0; riichi = 0; calls = 0;
  tenpaiDraws = 0; drawRounds = 0;
  pickByPersona: Record<string, { o: number; p: number }> = {};

  addHold(r: Row): void {
    this.games++;
    this.placementSum += r.rank;
    this.placementSq += r.rank * r.rank;
    if (r.rank >= 1 && r.rank <= 4) this.placements[r.rank - 1]++;
    this.scoreSum += r.score;
    this.rawSum += r.rawScore;
    if (r.rawScore > this.maxRaw) this.maxRaw = r.rawScore;
    if (r.rawScore < this.minRaw) this.minRaw = r.rawScore;
    const s = r.stats;
    this.rounds += s.roundsPlayed; this.wins += s.wins; this.tsumo += s.tsumoWins;
    this.winPts += s.winPointsTotal; this.dealIns += s.dealIns;
    this.dealInPts += s.dealInPointsTotal; this.riichi += s.riichiRounds;
    this.calls += s.callRounds;
    this.tenpaiDraws += r.tenpaiDraws; this.drawRounds += r.drawRounds;
  }
}

const div = (n: number, d: number): number => (d === 0 ? 0 : n / d);

function main(): void {
  const json = process.argv.includes("--json");
  const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const accs = new Map<string, Acc>();
  const get = (id: string): Acc => {
    let a = accs.get(id);
    if (a === undefined) { a = new Acc(); accs.set(id, a); }
    return a;
  };
  const all = new Acc();
  const byPersona = new Map<string, Acc>();
  const byArch = new Map<string, Acc>();
  let rows = 0;

  for (const f of files) {
    for (const line of readFileSync(f, "utf8").split("\n")) {
      if (line.trim() === "") continue;
      const r = JSON.parse(line) as Row;
      rows++;
      all.addHold(r);
      const bp = byPersona.get(r.persona) ?? new Acc();
      bp.addHold(r); byPersona.set(r.persona, bp);
      const ba = byArch.get(r.archetype) ?? new Acc();
      ba.addHold(r); byArch.set(r.archetype, ba);

      for (const o of r.offers) {
        for (const id of o.offered) {
          const a = get(id);
          a.offered++;
          const pp = (a.pickByPersona[r.persona] ??= { o: 0, p: 0 });
          pp.o++;
          if (id === o.picked) { a.picked++; pp.p++; }
        }
      }
      for (const id of new Set(r.augments)) get(id).addHold(r);
    }
  }

  const view = (id: string, a: Acc): Record<string, unknown> => {
    const avgP = div(a.placementSum, a.games);
    const varP = a.games < 2 ? 0 : (a.placementSq - a.games * avgP * avgP) / (a.games - 1);
    return {
      id, name: NAME.get(id) ?? id,
      tier: AUGMENT_POWER_TIERS[id]?.tier ?? null,
      offered: a.offered, picked: a.picked, pickRate: div(a.picked, a.offered),
      games: a.games,
      avgPlacement: avgP,
      placementSE: a.games < 2 ? null : Math.sqrt(Math.max(0, varP) / a.games),
      top1Rate: div(a.placements[0], a.games),
      rentaiRate: div(a.placements[0] + a.placements[1], a.games),
      lastRate: div(a.placements[3], a.games),
      avgScore: div(a.scoreSum, a.games),
      avgRawScore: div(a.rawSum, a.games),
      maxRawScore: a.games === 0 ? null : a.maxRaw,
      minRawScore: a.games === 0 ? null : a.minRaw,
      winRate: div(a.wins, a.rounds),
      avgWinPoints: div(a.winPts, a.wins),
      tsumoRate: div(a.tsumo, a.wins),
      dealInRate: div(a.dealIns, a.rounds),
      avgDealInPoints: div(a.dealInPts, a.dealIns),
      riichiRate: div(a.riichi, a.rounds),
      callRate: div(a.calls, a.rounds),
      drawTenpaiRate: div(a.tenpaiDraws, a.drawRounds),
      pickByPersona: Object.fromEntries(
        Object.entries(a.pickByPersona).map(([k, v]) => [k, { offered: v.o, picked: v.p, rate: div(v.p, v.o) }]),
      ),
    };
  };

  const table = [...accs].map(([id, a]) => view(id, a));

  if (json) {
    console.log(JSON.stringify({
      rowCount: rows, gameCount: rows / 4,
      baseline: view("(전체)", all),
      byPersona: Object.fromEntries([...byPersona].map(([k, a]) => [k, view(k, a)])),
      byArchetype: Object.fromEntries([...byArch].map(([k, a]) => [k, view(k, a)])),
      augments: table,
    }, null, 1));
    return;
  }

  const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
  const sorted = [...table].sort(
    (x, y) => (x["avgPlacement"] as number) - (y["avgPlacement"] as number),
  );
  console.log(`# 증강 시뮬레이션 집계\n`);
  console.log(`판 ${rows / 4} · 좌석행 ${rows} · 증강 ${table.length}종`);
  console.log(`표본 100판 미만: ${table.filter((t) => (t["games"] as number) < 100).length}종\n`);
  console.log(`|증강|티어|제시|픽률|보유판|평균순위|±SE|1위율|4위율|평균순위점|평균화료|화료율|방총률|리치율|후로율|최고점|최저점|`);
  console.log(`|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|`);
  for (const t of sorted) {
    console.log(
      `|${t["name"]}|${t["tier"] ?? "-"}|${t["offered"]}|${pct(t["pickRate"] as number)}` +
      `|${t["games"]}|${(t["avgPlacement"] as number).toFixed(3)}` +
      `|${t["placementSE"] === null ? "-" : (t["placementSE"] as number).toFixed(3)}` +
      `|${pct(t["top1Rate"] as number)}|${pct(t["lastRate"] as number)}` +
      `|${Math.round(t["avgScore"] as number)}|${Math.round(t["avgWinPoints"] as number)}` +
      `|${pct(t["winRate"] as number)}|${pct(t["dealInRate"] as number)}` +
      `|${pct(t["riichiRate"] as number)}|${pct(t["callRate"] as number)}` +
      `|${t["maxRawScore"]}|${t["minRawScore"]}|`,
    );
  }
}

main();
