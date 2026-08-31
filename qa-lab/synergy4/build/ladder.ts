/** 사다리 — 같은 시드 짝지어 3장 vs 2장 vs 1장 vs 0장. */
import { readFileSync, readdirSync } from "node:fs";
import { BUILDS } from "./builds.js";
interface Row { key: string; cond: string; seed: number; score: number; rank: number; wins: number; winPts: number; }
const dir = "qa-lab/synergy4/build/out";
const at = new Map<string, Row>();
const all: Row[] = [];
for (const f of readdirSync(dir).filter((x) => x.endsWith(".jsonl"))) {
  for (const l of readFileSync(`${dir}/${f}`, "utf8").split("\n")) {
    if (l.trim() === "") continue;
    try { const r = JSON.parse(l) as Row; at.set(`${r.key}|${r.cond}|${r.seed}`, r); all.push(r); } catch { /* */ }
  }
}
const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a: number[]): number => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const t = (a: number[]): string => `${mean(a) >= 0 ? "+" : ""}${mean(a).toFixed(0)} (t=${(mean(a) / (sd(a) / Math.sqrt(a.length))).toFixed(2)}, n=${a.length})`;

const glob: Record<string, number[]> = { "3-2": [], "3-1": [], "3-0": [], "2-1": [], "1-0": [] };
console.log("빌드 | 3장−최고2장 | 3장−평균2장 | 3장−최고1장 | 3장−없음 | 평균2장−평균1장");
for (const b of BUILDS) {
  const seeds: number[] = [];
  for (let s = 1; s <= 40; s++) if (["ABC", "AB", "AC", "BC", "A", "B", "C", "none"].every((c) => at.has(`${b.key}|${c}|${s}`))) seeds.push(s);
  if (seeds.length < 5) { console.log(`${b.key} | (시드 부족 ${seeds.length})`); continue; }
  const g = (c: string, s: number): number => at.get(`${b.key}|${c}|${s}`)!.score;
  const d32b: number[] = [], d32m: number[] = [], d31b: number[] = [], d30: number[] = [], d21: number[] = [];
  for (const s of seeds) {
    const abc = g("ABC", s);
    const pairs = [g("AB", s), g("AC", s), g("BC", s)];
    const singles = [g("A", s), g("B", s), g("C", s)];
    d32b.push(abc - Math.max(...pairs));
    d32m.push(abc - mean(pairs));
    d31b.push(abc - Math.max(...singles));
    d30.push(abc - g("none", s));
    d21.push(mean(pairs) - mean(singles));
  }
  glob["3-2"]!.push(...d32m); glob["3-1"]!.push(...d31b); glob["3-0"]!.push(...d30); glob["2-1"]!.push(...d21);
  console.log(`${b.key} | ${t(d32b)} | ${t(d32m)} | ${t(d31b)} | ${t(d30)} | ${t(d21)}`);
}
console.log(`\n전체: 3장−평균2장 ${t(glob["3-2"]!)} · 3장−최고1장 ${t(glob["3-1"]!)} · 3장−없음 ${t(glob["3-0"]!)} · 평균2장−평균1장 ${t(glob["2-1"]!)}`);
