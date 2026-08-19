import { samplePairs } from "./gen.js";
import { runPair } from "./lib.js";
const ps = samplePairs(40, "tonpuu", 7);
for (let i = 0; i < 6; i++) {
  const r = await runPair(ps[i]!, 900 + i, "tonpuu", i % 3, false);
  console.log(ps[i]!.a, "x", ps[i]!.b, "rounds", r.rounds, JSON.stringify([...new Set(r.bad.map((v) => v.kind))]));
  for (const b of r.bad.slice(0, 3)) console.log("   ", b.kind, b.detail.slice(0, 170));
}
