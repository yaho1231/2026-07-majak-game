/**
 * `info_tier.ts` 산출물 분석 — 카드별 «보유 − 미보유» 짝지은 표본.
 *   tsx qa-lab/synergy4/build/info_analyze.ts
 *
 * 같은 시드의 대조군(card="none")을 짝으로 삼는다. 출력은 카드별 한 줄:
 *   n쌍 · 완전동일 비율 · 평균 점수차 ±se · t · 평균 순위차 · 화료차 · 방총차 · 발동수
 */
import { readFileSync, readdirSync } from "node:fs";

interface Row {
  card: string; seed: number; score: number; rank: number; rounds: number;
  wins: number; winPts: number; dealIn: number; dealInPts: number; riichi: number;
  fires?: [string, number][];
}

const dir = "qa-lab/synergy4/build/info_out";
const rows: Row[] = [];
for (const f of readdirSync(dir).filter((x) => x.endsWith(".jsonl"))) {
  for (const line of readFileSync(`${dir}/${f}`, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    try { rows.push(JSON.parse(line) as Row); } catch { /* 마지막 줄이 잘렸을 수 있다 */ }
  }
}
const base = new Map<number, Row>();
for (const r of rows) if (r.card === "none") base.set(r.seed, r);

const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a: number[]): number => {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1));
};

const cards = [...new Set(rows.map((r) => r.card))].filter((c) => c !== "none");
const out: { card: string; n: number; same: number; m: number; se: number; t: number;
  dr: number; dw: number; dd: number; fires: number }[] = [];

for (const c of cards) {
  const d: number[] = []; const dr: number[] = []; const dw: number[] = []; const dd: number[] = [];
  let same = 0; let fires = 0;
  for (const r of rows.filter((x) => x.card === c)) {
    const b = base.get(r.seed);
    if (b === undefined) continue;
    d.push(r.score - b.score); dr.push(r.rank - b.rank);
    dw.push(r.wins - b.wins); dd.push(r.dealIn - b.dealIn);
    if (r.score === b.score && r.rounds === b.rounds && r.wins === b.wins) same++;
    for (const [, n] of r.fires ?? []) fires += n;
  }
  if (d.length === 0) continue;
  const m = mean(d); const se = sd(d) / Math.sqrt(d.length);
  out.push({ card: c, n: d.length, same, m, se, t: m / (se || 1),
    dr: mean(dr), dw: mean(dw), dd: mean(dd), fires });
}
out.sort((a, b) => b.t - a.t);

console.log("카드 | n쌍 | 완전동일 | 평균점수차 | ±se | t | 순위차 | 화료차 | 방총차 | 발동수");
for (const o of out) {
  console.log(
    `${o.card} | ${o.n} | ${o.same}/${o.n} | ${o.m >= 0 ? "+" : ""}${o.m.toFixed(0)}` +
    ` | ${o.se.toFixed(0)} | ${o.t.toFixed(2)} | ${o.dr.toFixed(2)} | ${o.dw.toFixed(2)}` +
    ` | ${o.dd.toFixed(2)} | ${o.fires}`,
  );
}
