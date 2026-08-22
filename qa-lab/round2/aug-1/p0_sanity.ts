import { PERSONAS, SEATS } from "../../harness.js";
import { runViewMatch } from "./viewrun.js";
// dora_conceal 을 p0 만 들었을 때, 비보유자 뷰의 도라 표시패가 실제로 비는지 직접 본다.
const r = await runViewMatch({
  seed: 11, mode: "tonpuu",
  preset: { p0: ["dora_conceal"], p1: [], p2: [], p3: [] } as never,
  personas: { p0: PERSONAS.masher!, p1: PERSONAS.folder!, p2: PERSONAS.caller!, p3: PERSONAS.chaos! } as never,
});
console.log(JSON.stringify(r, null, 1).slice(0, 2000));
console.log("SEATS", SEATS.length);
