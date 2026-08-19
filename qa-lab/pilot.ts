import { Prng } from "@majak/core";
import { PERSONAS, assignPreset, runMatch, SEATS } from "./harness.js";

const seeds = [1, 2, 3, 4];
for (const seed of seeds) {
  const preset = assignPreset(new Prng(seed ^ 0x1234), "hanchan", []);
  const r = await runMatch({
    seed,
    preset,
    personas: { p0: PERSONAS.masher!, p1: PERSONAS.riichiRusher!, p2: PERSONAS.caller!, p3: PERSONAS.chaos! },
  });
  console.log(`seed=${seed} rounds=${r.rounds} crash=${r.crash ? r.crash.split("\n")[0] : "-"} effErr=${r.effectErrors.length} viol=${r.violations.length}`);
  if (r.violations.length) console.log("  ", JSON.stringify(r.violations.slice(0, 5)));
  if (r.effectErrors.length) console.log("  eff:", r.effectErrors.slice(0, 3));
}
