import { PERSONAS, runMatch } from "../../harness.js";

const STACK = ["aotenjou_ceiling", "jackpot", "big_hand", "counter", "devils_advance"];

async function main() {
  let maxAbs = 0;
  let absurdCount = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const r = await runMatch({
      seed,
      mode: "tonpuu",
      preset: { p0: STACK, p1: [], p2: [], p3: [] },
      personas: { p0: PERSONAS.masher!, p1: PERSONAS.masher!, p2: PERSONAS.masher!, p3: PERSONAS.masher! },
    });
    if (r.crash) console.log(`seed=${seed} CRASH: ${r.crash}`);
    for (const v of r.violations) {
      if (v.kind === "SCORE_ABSURD" || v.kind === "SCORE_NAN" || v.kind === "SCORE_DRIFT_UNEXPLAINED") {
        console.log(`seed=${seed} ${v.kind}: ${v.detail}`);
        absurdCount++;
      }
    }
    const scores = Object.values(r.finalScores);
    const abs = Math.max(...scores.map((s) => Math.abs(s)));
    if (abs > maxAbs) maxAbs = abs;
    console.log(`seed=${seed} rounds=${r.rounds} finalScores=${JSON.stringify(r.finalScores)}`);
  }
  console.log(`\n최대 |최종점수| = ${maxAbs}, 이상신호=${absurdCount}건`);
}
main();
