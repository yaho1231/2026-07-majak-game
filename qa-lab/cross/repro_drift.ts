/**
 * 점수 총합 드리프트 최소 재현 — seed 2002 (hanchan).
 * 드리프트가 난 순간의 직전 이벤트를 찍는다.
 */
import { Prng } from "@majak/core";
import { runDraftMatch, allPersonaSets } from "./lib.js";

const seed = Number(process.argv[2] ?? 2002);
const mode = (process.argv[3] ?? "hanchan") as "hanchan" | "tonpuu";

let prevTotal: number | undefined;
const rep = await runDraftMatch({
  seed,
  mode,
  personas: allPersonaSets(new Prng(seed ^ 0x5eed)),
  onState: (st) => {
    const total = st.players.reduce((a, p) => a + p.score, 0) + (st.round.riichiPot ?? 0);
    if (prevTotal !== undefined && total !== prevTotal) {
      console.log(
        `DRIFT ${prevTotal} -> ${total} (${total - prevTotal}) at ${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`,
        JSON.stringify(st.players.map((p) => [p.id, p.score])),
      );
    }
    prevTotal = total;
  },
});
console.log("augments", JSON.stringify(rep.finalAugments, null, 1));
console.log("end", rep.endReason, rep.finalScores, "pot-less total",
  Object.values(rep.finalScores).reduce((a, b) => a + b, 0));
