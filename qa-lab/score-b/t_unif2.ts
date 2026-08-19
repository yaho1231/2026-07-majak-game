/**
 * 천하통일 — 문턱 도달 시 **정산 직후 즉시 종료**, 그리고 그것이 **보유자에게만** 걸리는가.
 * 전원 50000점에서 시작해 1국만에 끝나야 한다(보유자 기준).
 * 실행: tsx qa-lab/score-b/t_unif2.ts
 */
import type { PlayerId } from "@majak/core";
import { PERSONAS, runMatch } from "./run.js";

let problems = 0;
for (const seed of [31, 32, 33, 34, 35, 36]) {
  for (const [label, preset] of [
    ["대조군(증강 없음)", { p0: [], p1: [], p2: [], p3: [] }],
    ["p0가 unification", { p0: ["unification"], p1: [], p2: [], p3: [] }],
  ] as [string, Record<PlayerId, string[]>][]) {
    let rounds = 0;
    let lastScores: Record<string, number> = {};
    const r = await runMatch({
      seed, mode: "tonpuu", preset, startScore: 50000,
      personas: { p0: PERSONAS.folder!, p1: PERSONAS.folder!, p2: PERSONAS.folder!, p3: PERSONAS.folder! },
      onRound: (st, phase) => {
        if (phase !== "end") return;
        rounds++;
        lastScores = Object.fromEntries(st.players.map((p) => [p.id, p.score]));
      },
    });
    const p0 = lastScores.p0 ?? 0;
    const expectEnd = preset.p0.includes("unification");
    const ok = expectEnd ? rounds === 1 : rounds >= 2;
    if (!ok) { problems++; }
    console.log(`seed=${seed} ${label}: rounds=${rounds} scores=${JSON.stringify(lastScores)} p0=${p0} ${ok ? "" : "  ← 기대와 다름"} crash=${r.crash?.split("\n")[0] ?? "-"}`);
  }
}
console.log(`\n문제 ${problems}건`);
