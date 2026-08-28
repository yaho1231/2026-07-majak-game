/**
 * 4~5증강 동시 보유 시 정산 순서가 "드래프트(획득) 순서"에 의존하는지 확인.
 * settleStages.ts 주석에 따르면 priority = stage + seat + idFraction(augmentId) 로,
 * 획득 순서가 아니라 augmentId의 해시로 결정된다. 이게 실제로 참인지 실행으로 검증한다.
 *
 * p0에게 같은 5개 증강(spy, jackpot, big_hand, aotenjou_ceiling, counter)을
 * 순서만 바꿔 지급하고, 같은 시드로 반장전을 완주시켜 최종 점수/이벤트가
 * 완전히 동일한지 비교한다.
 */
import { PERSONAS, runMatch } from "../../harness.js";

const FIVE = ["spy", "jackpot", "big_hand", "aotenjou_ceiling", "counter"];
const REVERSED = [...FIVE].reverse();

async function main() {
  const seeds = [1, 2, 3, 42, 777];
  let mismatches = 0;
  for (const seed of seeds) {
    const base = {
      seed,
      mode: "hanchan" as const,
      personas: { p0: PERSONAS.masher!, p1: PERSONAS.masher!, p2: PERSONAS.masher!, p3: PERSONAS.masher! },
    };
    const rA = await runMatch({ ...base, preset: { p0: FIVE, p1: [], p2: [], p3: [] } });
    const rB = await runMatch({ ...base, preset: { p0: REVERSED, p1: [], p2: [], p3: [] } });
    const sameScores = JSON.stringify(rA.finalScores) === JSON.stringify(rB.finalScores);
    const sameRounds = rA.rounds === rB.rounds;
    console.log(`seed=${seed} rounds A/B=${rA.rounds}/${rB.rounds} scoresA=${JSON.stringify(rA.finalScores)} scoresB=${JSON.stringify(rB.finalScores)} same=${sameScores && sameRounds}`);
    if (rA.crash) console.log("  CRASH A:", rA.crash);
    if (rB.crash) console.log("  CRASH B:", rB.crash);
    if (rA.violations.length) console.log("  violations A:", rA.violations.slice(0, 5));
    if (rB.violations.length) console.log("  violations B:", rB.violations.slice(0, 5));
    if (!sameScores || !sameRounds) mismatches++;
  }
  console.log(`\n총 ${seeds.length}시드 중 순서 뒤집어 결과 달라진 것: ${mismatches}건`);
}

main();
