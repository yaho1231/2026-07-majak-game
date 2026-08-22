/** 실제 대국에서 let_it_ride × jackpot 이 얼마까지 가는가 */
import { PERSONAS, runMatch } from "../../harness.js";
import type { PlayerId } from "@majak/core";
const n = Number(process.argv[2] ?? 20);
let worst = 0, worstTag = "";
for (let i = 0; i < n; i++) {
  const seed = 33000 + i * 7;
  const r = await runMatch({
    seed, mode: "tonpuu",
    preset: { p0: ["let_it_ride", "jackpot"], p1: [], p2: [], p3: [] } as never,
    personas: { p0: PERSONAS.masher!, p1: PERSONAS.caller!, p2: PERSONAS.riichiRusher!, p3: PERSONAS.chaos! } as Record<PlayerId, never>,
    timeoutMs: 120000,
  });
  const s = r.finalScores as Record<string, number>;
  const top = Math.max(...Object.values(s));
  if (top > worst) { worst = top; worstTag = `seed=${seed} ${JSON.stringify(s)}`; }
  console.log(`seed=${seed} scores=${JSON.stringify(s)} rounds=${r.rounds} crash=${r.crash ?? "-"}`);
}
console.log(`\n최고 점수 ${worst}  ${worstTag}`);
