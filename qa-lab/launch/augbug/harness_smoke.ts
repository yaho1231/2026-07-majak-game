import { Prng } from "@majak/core";
import { PERSONAS, SEATS, assignPreset, runMatch } from "../../harness.js";
async function main() {
  const rng = new Prng(1);
  const preset = assignPreset(rng, "tonpuu", ["devils_advance"], 2);
  const personas = Object.fromEntries(SEATS.map((s) => [s, Object.values(PERSONAS)[0]]));
  const r = await runMatch({ seed: 1, mode: "tonpuu", preset, personas: personas as never, timeoutMs: 30000 });
  console.log("OK crash=", r.crash, "rounds=", r.rounds);
}
main();
