/** 「한 장을 더 들었는데 판이 한 톨도 달라지지 않는」 경우를 센다 (같은 시드 1:1) */
import { readFileSync, readdirSync } from "node:fs";
import { BUILDS } from "./builds.js";
interface Row { key: string; cond: string; seed: number; score: number; rounds: number; wins: number; dealIn: number; riichi: number; bot: [string, { fired: number }][] }
const at = new Map<string, Row>();
for (const f of readdirSync("qa-lab/synergy4/build/out").filter((x) => x.endsWith(".jsonl"))) {
  for (const l of readFileSync(`qa-lab/synergy4/build/out/${f}`, "utf8").split("\n")) {
    if (l.trim() === "") continue;
    try { const r = JSON.parse(l) as Row; at.set(`${r.key}|${r.cond}|${r.seed}`, r); } catch { /* */ }
  }
}
const same = (a: Row, b: Row): boolean => a.score === b.score && a.rounds === b.rounds && a.wins === b.wins && a.dealIn === b.dealIn && a.riichi === b.riichi;
console.log("빌드 | 카드 | 단독 보유 vs 미보유: 완전 동일 판 / 전체 | 그 판들에서 그 증강의 액션 발동 수");
for (const b of BUILDS) {
  for (const [slot, id] of [["A", b.ids[0]], ["B", b.ids[1]], ["C", b.ids[2]]] as const) {
    let n = 0, eq = 0, fires = 0;
    for (let s = 1; s <= 40; s++) {
      const x = at.get(`${b.key}|${slot}|${s}`), y = at.get(`${b.key}|none|${s}`);
      if (x === undefined || y === undefined) continue;
      n++; if (same(x, y)) { eq++; for (const [aid, v] of x.bot ?? []) if (aid === id) fires += v.fired ?? 0; }
    }
    if (n === 0) continue;
    if (eq > 0) console.log(`${b.key} | ${id} | ${eq}/${n} | ${fires}`);
  }
}
