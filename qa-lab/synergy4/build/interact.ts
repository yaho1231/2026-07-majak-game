/** 상호작용 — 「혼자일 때의 기여」 vs 「나머지 둘이 이미 있을 때의 기여」 */
import { readFileSync, readdirSync } from "node:fs";
import { BUILDS } from "./builds.js";
interface Row { key: string; cond: string; seed: number; score: number; }
const at = new Map<string, Row>();
for (const f of readdirSync("qa-lab/synergy4/build/out").filter((x) => x.endsWith(".jsonl"))) {
  for (const l of readFileSync(`qa-lab/synergy4/build/out/${f}`, "utf8").split("\n")) {
    if (l.trim() === "") continue;
    try { const r = JSON.parse(l) as Row; at.set(`${r.key}|${r.cond}|${r.seed}`, r); } catch { /* */ }
  }
}
const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
const se = (a: number[]): number => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1) / a.length); };
const f = (a: number[]): string => `${mean(a) >= 0 ? "+" : ""}${mean(a).toFixed(0)}±${se(a).toFixed(0)}`;
const P: Record<string, [string, string, string, string]> = {
  A: ["A", "none", "ABC", "BC"], B: ["B", "none", "ABC", "AC"], C: ["C", "none", "ABC", "AB"],
};
console.log("빌드 | 카드 | 혼자일 때 기여 | 나머지 둘과 함께일 때 기여 | 차(시너지) | t");
for (const b of BUILDS) {
  for (const [slot, id] of [["A", b.ids[0]], ["B", b.ids[1]], ["C", b.ids[2]]] as const) {
    const [s1, s0, m1, m0] = P[slot] as [string, string, string, string];
    const solo: number[] = [], with2: number[] = [], diff: number[] = [];
    for (let s = 1; s <= 40; s++) {
      const a = at.get(`${b.key}|${s1}|${s}`), z = at.get(`${b.key}|${s0}|${s}`);
      const c = at.get(`${b.key}|${m1}|${s}`), d = at.get(`${b.key}|${m0}|${s}`);
      if (a === undefined || z === undefined || c === undefined || d === undefined) continue;
      solo.push(a.score - z.score); with2.push(c.score - d.score); diff.push((c.score - d.score) - (a.score - z.score));
    }
    if (solo.length < 5) continue;
    console.log(`${b.key} | ${id} | ${f(solo)} | ${f(with2)} | ${f(diff)} | ${(mean(diff) / se(diff)).toFixed(2)}`);
  }
}
