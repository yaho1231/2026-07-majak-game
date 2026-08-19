import { Prng } from "@majak/core";
import { PERSONAS, fillSeats, runMatch } from "./lib.js";
const rng = new Prng(5251 * 7919 + 13);
const preset = fillSeats(rng, "hanchan", ["future_sight", "reload"]) as Record<string, string[]>;
preset["p2"] = ["future_sight", "reload"];
let idx = 0;
let last = "";
await runMatch({
  seed: 5251,
  mode: "hanchan",
  preset: preset as never,
  personas: { p0: PERSONAS.masher!, p1: PERSONAS.stall!, p2: PERSONAS.chaos!, p3: PERSONAS.stall! },
  onRound: (_s, ph) => { if (ph === "start") { idx++; console.log(`ROUNDSTART #${idx}`); } },
  onState: (st) => {
    const k = `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;
    if (k !== last) { console.log(`  key ${last} -> ${k} (idx #${idx}) phase=${st.round.phase}`); last = k; }
  },
});
