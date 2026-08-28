/**
 * 배수/뱅크발행 5종을 한 좌석에 동시 스택 — 점수 폭주(SCORE_ABSURD) 여부 실측.
 * aotenjou_ceiling(상한해제) + jackpot(0.5~3배) + big_hand(만관 하한) + counter(직격 +4판)
 * + devils_advance(만관 이상마다 9000 추가 징수) 를 p0에 몰아준다.
 * masher 페르소나 4인 반장전, 다수 시드로 완주시켜 SCORE_ABSURD/NaN 여부, 국당 최대 획득점을 본다.
 */
import { PERSONAS, runMatch } from "../../harness.js";

const STACK = ["aotenjou_ceiling", "jackpot", "big_hand", "counter", "devils_advance"];

async function main() {
  let maxAbs = 0;
  let absurdCount = 0;
  let nanCount = 0;
  let maxSwing = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const r = await runMatch({
      seed,
      mode: "hanchan",
      preset: { p0: STACK, p1: [], p2: [], p3: [] },
      personas: { p0: PERSONAS.masher!, p1: PERSONAS.masher!, p2: PERSONAS.masher!, p3: PERSONAS.masher! },
    });
    if (r.crash) console.log(`seed=${seed} CRASH: ${r.crash}`);
    for (const v of r.violations) {
      if (v.kind === "SCORE_ABSURD") { absurdCount++; console.log(`seed=${seed} SCORE_ABSURD: ${v.detail}`); }
      if (v.kind === "SCORE_NAN") { nanCount++; console.log(`seed=${seed} SCORE_NAN: ${v.detail}`); }
      if (v.kind === "SCORE_DRIFT_UNEXPLAINED") console.log(`seed=${seed} DRIFT_UNEXPLAINED: ${v.detail}`);
    }
    const scores = Object.values(r.finalScores);
    const abs = Math.max(...scores.map((s) => Math.abs(s)));
    if (abs > maxAbs) maxAbs = abs;
    const swing = Math.max(...scores) - Math.min(...scores);
    if (swing > maxSwing) maxSwing = swing;
    console.log(`seed=${seed} rounds=${r.rounds} finalScores=${JSON.stringify(r.finalScores)}`);
  }
  console.log(`\n최대 |최종점수| = ${maxAbs}, 최대 좌석간 격차 = ${maxSwing}, SCORE_ABSURD=${absurdCount}건, SCORE_NAN=${nanCount}건`);
}

main();
