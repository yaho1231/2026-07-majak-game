/**
 * docs/40 §4 가 "설계 답이 없다"고 남겨 둔 spy × parasite 좌석 순서 의존을
 * 실제 코드(spy.ts:166 / parasite.ts:105)로 정량 확인한다.
 * 둘 다 SETTLE_STAGE.Transfer라 settlePriority(stage, seat, id) 중 seat이 작은 쪽이 먼저 돈다.
 * p1(seat1)이 spy, p2(seat2)가 parasite(숙주=p0)를 들고, p0가 화료하는 상황을 강제로 만든다.
 */
import { PERSONAS, runMatch } from "../../harness.js";

async function main() {
  // p1(스파이, seat1) vs p2(기생충, seat2, 숙주=p0) — 화료자는 p0(seat0)
  for (const seed of [5, 11, 23]) {
    const r = await runMatch({
      seed,
      mode: "tonpuu",
      preset: { p0: [], p1: ["spy"], p2: ["parasite"], p3: [] },
      personas: { p0: PERSONAS.masher!, p1: PERSONAS.masher!, p2: PERSONAS.masher!, p3: PERSONAS.masher! },
    });
    console.log(`seed=${seed} rounds=${r.rounds} finalScores=${JSON.stringify(r.finalScores)} crash=${r.crash ?? "-"}`);
  }
}
main();
