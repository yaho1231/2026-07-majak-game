/**
 * 천하통일(unification) — 45000 도달 시 즉시 종료가 **보유자에게만** 걸리는가.
 * 실행: tsx qa-lab/score-b/t_unification.ts
 */
import type { GameState, PlayerId } from "@majak/core";
import { PERSONAS, runMatch } from "./run.js";

const SEATS: PlayerId[] = ["p0", "p1", "p2", "p3"];
let problems = 0;
const bad = (s: string): void => { problems++; console.log(`  !! ${s}`); };

for (const seed of [11,12,13,14,15,16,17,18,19,20,21,22,23,24]) {
  const preset = { p0: ["unification"], p1: [], p2: [], p3: [] } as Record<PlayerId, string[]>;
  const scores: { round: string; s: Record<string, number> }[] = [];
  const r = await runMatch({
    seed, mode: "tonpuu", preset, startScore: 44900,
    personas: { p0: PERSONAS.masher!, p1: PERSONAS.caller!, p2: PERSONAS.caller!, p3: PERSONAS.masher! },
    onRound: (st: GameState, phase) => {
      if (phase !== "end") return;
      scores.push({
        round: `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`,
        s: Object.fromEntries(st.players.map((p) => [p.id, p.score])),
      });
    },
  });
  // 보유자가 45000을 넘긴 정산이 있었다면 그것이 **마지막** 정산이어야 한다
  const hitAt = scores.findIndex((x) => (x.s.p0 ?? 0) >= 45000);
  if (hitAt >= 0 && hitAt !== scores.length - 1) {
    bad(`seed=${seed} p0가 ${scores[hitAt]!.round}에서 45000 도달했는데 국이 ${scores.length - 1 - hitAt}번 더 이어졌다`);
  }
  // 비보유자가 45000을 넘겼다고 게임이 끝나면 안 된다 (마지막 국이 아닌 곳에서 확인)
  const otherHit = scores.findIndex((x) => SEATS.slice(1).some((q) => (x.s[q] ?? 0) >= 45000));
  const endedEarly = scores.length < 4; // 동풍전 정규 4국
  if (otherHit >= 0 && endedEarly && hitAt < 0) {
    bad(`seed=${seed} 비보유자만 45000을 넘겼는데 ${scores.length}국에서 끝났다`);
  }
  console.log(
    `seed=${seed} rounds=${scores.length} p0hit=${hitAt} otherHit=${otherHit} ` +
    `final=${JSON.stringify(scores.at(-1))} crash=${r.crash?.split("\n")[0] ?? "-"}`,
  );
}
console.log(`\n문제 ${problems}건`);
