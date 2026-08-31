/**
 * 카드 한 장의 «한계 기여»를 같은 시드 짝지어 잰다.
 *   A의 기여 = (A−none) + (AB−B) + (AC−C) + (ABC−BC) 네 쌍
 * - identical: 두 판의 최종 점수·판 수·화료 수가 완전히 같다 = 그 카드가 판에 아무 흔적도 남기지 않았다
 * - 평균차·표준편차·t (짝지은 표본)
 */
import { readFileSync, readdirSync } from "node:fs";
import { BUILDS } from "./builds.js";

interface Row { key: string; cond: string; seed: number; score: number; rank: number; wins: number; winPts: number; rounds: number; }
const dir = "qa-lab/synergy4/build/out";
const rows: Row[] = [];
for (const f of readdirSync(dir).filter((x) => x.endsWith(".jsonl"))) {
  for (const line of readFileSync(`${dir}/${f}`, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    try { rows.push(JSON.parse(line) as Row); } catch { /* partial */ }
  }
}
const at = new Map<string, Row>();
for (const r of rows) at.set(`${r.key}|${r.cond}|${r.seed}`, r);

const PAIRS: Record<string, [string, string][]> = {
  A: [["A", "none"], ["AB", "B"], ["AC", "C"], ["ABC", "BC"]],
  B: [["B", "none"], ["AB", "A"], ["BC", "C"], ["ABC", "AC"]],
  C: [["C", "none"], ["AC", "A"], ["BC", "B"], ["ABC", "AB"]],
};
const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a: number[]): number => {
  const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};

console.log("빌드 | 카드 | n쌍 | 무변화(동일결과) | 평균점수차 | ±se | t | 평균순위차 | 화료차");
for (const b of BUILDS) {
  for (const [slot, ids] of [["A", b.ids[0]], ["B", b.ids[1]], ["C", b.ids[2]]] as const) {
    const d: number[] = []; const dr: number[] = []; const dw: number[] = [];
    let same = 0;
    for (const [withC, without] of PAIRS[slot] as [string, string][]) {
      for (let s = 1; s <= 60; s++) {
        const x = at.get(`${b.key}|${withC}|${s}`); const y = at.get(`${b.key}|${without}|${s}`);
        if (x === undefined || y === undefined) continue;
        d.push(x.score - y.score); dr.push(x.rank - y.rank); dw.push(x.wins - y.wins);
        if (x.score === y.score && x.rounds === y.rounds && x.wins === y.wins) same++;
      }
    }
    if (d.length < 4) continue;
    const m = mean(d); const se = sd(d) / Math.sqrt(d.length);
    console.log(
      `${b.key} | ${ids} | ${d.length} | ${same}/${d.length} (${((same / d.length) * 100).toFixed(0)}%)` +
      ` | ${m >= 0 ? "+" : ""}${m.toFixed(0)} | ${se.toFixed(0)} | ${(m / se).toFixed(2)}` +
      ` | ${mean(dr).toFixed(2)} | ${mean(dw).toFixed(2)}`,
    );
  }
}
