/** out/*.jsonl 집계 + 드리프트 부분합 판정 (근거 여러 건이 한 틱에 겹치면 오탐) */
import { readdirSync, readFileSync } from "node:fs";
const dir = new URL("./out/", import.meta.url).pathname;
interface Row { pair: { a: string; b: string; bucket: string }; seed: number; mode: string; dual?: boolean; preset: Record<string, string[]>; crash?: string; effectErrors: string[]; bad: { kind: string; seat?: string; round: string; detail: string }[]; rounds: number; mix: number }
const rows: Row[] = [];
for (const f of readdirSync(dir)) {
  if (!f.endsWith(".jsonl")) continue;
  for (const line of readFileSync(dir + f, "utf8").split("\n")) {
    if (line.trim() !== "") rows.push(JSON.parse(line) as Row);
  }
}
const amounts = (d: string): number[] => [...d.matchAll(/ (-?\d+)\)/g)].map((m) => Number(m[1]));
const subsetSum = (xs: number[], t: number): boolean => {
  const seen = new Set<number>([0]);
  for (const x of xs) for (const v of [...seen]) seen.add(v + x);
  return seen.has(t);
};
const byKind = new Map<string, { row: Row; v: Row["bad"][number] | null }[]>();
const add = (k: string, row: Row, v: Row["bad"][number] | null): void => {
  if (!byKind.has(k)) byKind.set(k, []);
  byKind.get(k)!.push({ row, v });
};
for (const r of rows) {
  if (r.crash !== undefined) add("CRASH: " + r.crash.split("\n")[0]!.slice(0, 80), r, null);
  for (const e of r.effectErrors) add("EFFECT: " + e.slice(0, 80), r, null);
  for (const v of r.bad) {
    if (v.kind === "SCORE_DRIFT_UNEXPLAINED") {
      const m = /\(([-+]?\d+)\)/.exec(v.detail);
      const delta = m === null ? NaN : Number(m[1]);
      const cands = amounts(v.detail);
      add(subsetSum(cands, delta) ? "DRIFT_FP(부분합 일치)" : "DRIFT_REAL", r, v);
    } else add(v.kind, r, v);
  }
}
for (const [k, list] of [...byKind.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n### ${k}  (${list.length})`);
  for (const { row, v } of list.slice(0, 10)) {
    console.log(`  ${row.pair.a}×${row.pair.b} [${row.pair.bucket}] seed=${row.seed} ${row.mode}${row.dual === true ? " dual" : ""} mix=${row.mix}`);
    if (v !== null) console.log(`     ${v.seat ?? "-"} ${v.round} ${v.detail.slice(0, 220)}`);
  }
}
console.log(`\nrows=${rows.length}`);
