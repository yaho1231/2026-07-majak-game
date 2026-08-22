
import { runBuild } from "./run.js";

const r = await runBuild({
  seed: 11,
  mode: "tonpuu",
  preset: { p0: ["stealth_riichi", "late_double", "ura_peek", "no_retreat"], p1: [], p2: [], p3: [] },

});
console.log("rounds", r.rounds, "ms", r.ms, "crash", r.crash ?? "-");
console.log("scores", r.finalScores);
console.log("outcomes", r.outcomes, "wins", r.wins.length);
console.log("riichi", r.riichiBySeat);
console.log("violations", r.violations.map((v) => v.kind).slice(0, 10));
console.log("effectErrors", r.effectErrors.slice(0, 5));
for (const [k, c] of r.metrics.bySeat) {
  if (!k.startsWith("p0|")) continue;
  console.log(k, JSON.stringify({ ...c, emittedTypes: Object.fromEntries(c.emittedTypes) }));
}
