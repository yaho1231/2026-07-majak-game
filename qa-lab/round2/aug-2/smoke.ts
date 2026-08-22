import { PERSONAS, runMatch2 } from "./lib.js";
const evs = new Map<string, number>();
const r = await runMatch2({
  seed: 7, mode: "tonpuu",
  preset: { p0: ["karma"], p1: [], p2: [], p3: [] },
  personas: { p0: PERSONAS.masher!, p1: PERSONAS.folder!, p2: PERSONAS.caller!, p3: PERSONAS.chaos! },
  onEvent: (e) => evs.set(e.type, (evs.get(e.type) ?? 0) + 1),
});
console.log(r.crash ?? "ok", r.rounds, r.finalScores);
console.log([...evs].slice(0, 40));
