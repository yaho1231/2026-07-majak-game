/**
 * rank_gate 공개 뱃지(view:*:rank_gate:{holder})가 국을 넘어 남는가.
 * 기대: 국이 끝나면 지목이 풀리고 뱃지도 사라진다("지목은 ... 국이 끝나면 풀린다").
 */
import { PERSONAS, runMatch } from "./h.js";

const seen: string[] = [];
const r = await runMatch({
  seed: 1,
  mode: "hanchan",
  preset: { p0: [], p1: [], p2: [], p3: ["rank_gate"] },
  personas: { p0: PERSONAS.masher!, p1: PERSONAS.masher!, p2: PERSONAS.masher!, p3: PERSONAS.masher! },
  onRound: (st, phase) => {
    if (phase !== "start") return;
    const rk = `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;
    const badge = st.augmentData["view:*:rank_gate:p3"];
    const marks = Object.entries(st.augmentData).filter(([k]) => k.startsWith("rank_gate:mark:"));
    seen.push(`[국시작 ${rk}] badge=${JSON.stringify(badge)} marks=${JSON.stringify(marks)}`);
  },
  timeoutMs: 90_000,
});
console.log(seen.join("\n"));
console.log("crash:", r.crash ?? "-");
