/** out/*.jsonl 을 읽어 빌드별 «사다리»(3장 vs 2장 vs 1장 vs 없음)를 표로 만든다. */
import { readFileSync, readdirSync } from "node:fs";
import { BUILDS } from "./builds.js";

interface Row {
  key: string; cond: string; seed: number; score: number; rank: number;
  wins: number; winPts: number; winHan: number; rounds: number; dealIn: number; dealInPts: number;
  riichi: number; yakuman: number; crash: string | null;
  violations: string[]; effectErrors: string[];
  fires: [string, Record<string, number>][];
  bot: [string, { opp: number; prop: number; fired: number; threw: number; lostTo: string[] }][];
  contentFailures: string[]; ids: string[]; outcomes: Record<string, number>;
  augPoints: { augId: string; player: string; points: number }[];
}

const dir = "qa-lab/synergy4/build/out";
const rows: Row[] = [];
for (const f of readdirSync(dir).filter((x) => x.endsWith(".jsonl"))) {
  for (const line of readFileSync(`${dir}/${f}`, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    try { rows.push(JSON.parse(line) as Row); } catch { /* partial line */ }
  }
}
const only = process.argv[2];
const mean = (a: number[]): number => (a.length === 0 ? NaN : a.reduce((x, y) => x + y, 0) / a.length);
const sd = (a: number[]): number => {
  if (a.length < 2) return NaN;
  const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};

// 구조 결함 먼저
const crashes = rows.filter((r) => r.crash !== null && r.crash !== undefined);
const viol = rows.filter((r) => (r.violations ?? []).some((v) => !v.startsWith("SCORE_DRIFT_ATTRIBUTED")));
const errs = rows.filter((r) => (r.effectErrors ?? []).length > 0);
const cf = rows.filter((r) => (r.contentFailures ?? []).length > 0);
console.log(`총 판=${rows.length}  crash=${crashes.length}  위반판=${viol.length}  훅예외판=${errs.length}  contentFailure판=${cf.length}`);
for (const r of crashes.slice(0, 10)) console.log(`  CRASH ${r.key}/${r.cond}/s${r.seed}: ${String(r.crash).slice(0, 200)}`);
const vk = new Map<string, number>();
for (const r of viol) for (const v of r.violations) {
  if (v.startsWith("SCORE_DRIFT_ATTRIBUTED")) continue;
  const k = `${v.split(":")[0]} @${r.key}/${r.cond}`;
  vk.set(k, (vk.get(k) ?? 0) + 1);
}
for (const [k, n] of [...vk].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`  VIOL ${k} ×${n}`);
for (const r of errs.slice(0, 10)) console.log(`  EFFERR ${r.key}/${r.cond}/s${r.seed}: ${r.effectErrors.slice(0, 3).join(" | ").slice(0, 250)}`);
for (const r of cf.slice(0, 10)) console.log(`  CFAIL ${r.key}/${r.cond}/s${r.seed}: ${r.contentFailures.slice(0, 3).join(" | ").slice(0, 250)}`);

const CONDS = ["ABC", "AB", "AC", "BC", "A", "B", "C", "none"];
for (const b of BUILDS) {
  if (only !== undefined && only !== b.key) continue;
  const mine = rows.filter((r) => r.key === b.key);
  if (mine.length === 0) continue;
  const seeds = new Set(mine.filter((r) => r.cond === "ABC").map((r) => r.seed));
  // 모든 조건이 다 있는 시드만 (공정 비교)
  const full = [...seeds].filter((s) => CONDS.every((c) => mine.some((r) => r.cond === c && r.seed === s)));
  console.log(`\n## ${b.key} (${b.name}) — ${b.ids.join(" / ")}  [완전 시드 ${full.length}]`);
  console.log(`cond | n | 평균점수 | ±sd | 평균순위 | 화료 | 화료점/판 | 평균판수 | 방총 | 리치 | 발동(액션)`);
  for (const c of CONDS) {
    const rs = mine.filter((r) => r.cond === c && full.includes(r.seed));
    if (rs.length === 0) continue;
    const fires = new Map<string, number>();
    for (const r of rs) for (const [id, v] of r.bot ?? []) fires.set(id, (fires.get(id) ?? 0) + (v.fired ?? 0));
    const opp = new Map<string, number>();
    for (const r of rs) for (const [id, v] of r.bot ?? []) opp.set(id, (opp.get(id) ?? 0) + (v.opp ?? 0));
    const wins = rs.reduce((a, r) => a + r.wins, 0);
    console.log(
      `${c} | ${rs.length} | ${mean(rs.map((r) => r.score)).toFixed(0)} | ${sd(rs.map((r) => r.score)).toFixed(0)}` +
      ` | ${mean(rs.map((r) => r.rank)).toFixed(2)} | ${(wins / rs.length).toFixed(2)}` +
      ` | ${(rs.reduce((a, r) => a + r.winPts, 0) / Math.max(1, wins)).toFixed(0)}` +
      ` | ${mean(rs.map((r) => r.winHan)).toFixed(1)}han` +
      ` | ${(rs.reduce((a, r) => a + r.dealIn, 0) / rs.length).toFixed(2)}` +
      ` | ${mean(rs.map((r) => r.riichi)).toFixed(1)}` +
      ` | ${[...fires].map(([id, n]) => `${id}:${n}/${opp.get(id) ?? 0}`).join(" ")}`,
    );
  }
}
