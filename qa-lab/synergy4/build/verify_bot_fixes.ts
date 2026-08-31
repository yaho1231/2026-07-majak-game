/**
 * synergy4 «6. 봇» 묶음 검증 — 같은 시드로 짝지어 재는 한계 기여.
 *   tsx qa-lab/synergy4/build/verify_bot_fixes.ts [seeds=20] [augment=frame_up]
 *
 * A-0: `frame_up` 보유 vs 미보유가 통계적으로 같아야 한다(정책 오염이 사라졌으므로).
 * A-14: 정보 증강(`xray_hand` 등)은 반대로 **0이 아니어야** 한다(기여가 생겨야 한다).
 */
import type { PlayerId } from "@majak/core";
import { runBuild } from "../../synergy3/build/run.js";

const N = Number(process.argv[2] ?? 20);
const AUG = process.argv[3] ?? "frame_up";
const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a: number[]): number => {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1));
};

const d: number[] = [];
let identical = 0;
for (let s = 1; s <= N; s++) {
  const withA = await runBuild({ seed: s, mode: "hanchan", preset: { p0: [AUG], p1: [], p2: [], p3: [] } as Record<PlayerId, readonly string[]>, timeoutMs: 300_000 });
  const without = await runBuild({ seed: s, mode: "hanchan", preset: { p0: [], p1: [], p2: [], p3: [] } as Record<PlayerId, readonly string[]>, timeoutMs: 300_000 });
  const a = withA.finalScores.p0 ?? 0;
  const b = without.finalScores.p0 ?? 0;
  d.push(a - b);
  if (a === b) identical++;
}
const m = mean(d);
const se = sd(d) / Math.sqrt(d.length);
console.log(`${AUG}: n=${d.length}쌍 | 완전동일 ${identical}/${d.length} | 평균점수차 ${m >= 0 ? "+" : ""}${m.toFixed(0)} ± ${se.toFixed(0)} | t=${(m / (se || 1)).toFixed(2)}`);
