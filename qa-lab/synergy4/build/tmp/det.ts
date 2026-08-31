import type { PlayerId } from "@majak/core";
import { runBuild } from "../../../synergy3/build/run.js";
for (let s = 1; s <= 2; s++) {
  for (let i = 0; i < 2; i++) {
    const r = await runBuild({ seed: s, mode: "hanchan", preset: { p0: [], p1: [], p2: [], p3: [] } as Record<PlayerId, readonly string[]>, timeoutMs: 600000 });
    console.log(s, i, r.finalScores.p0, r.rounds, r.ms + "ms");
  }
}
