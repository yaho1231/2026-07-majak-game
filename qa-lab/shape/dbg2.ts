import { ROUND_SETTLED } from "@majak/core";
import type { GameEvent } from "@majak/core";
import { PERSONAS, runMatch } from "./h2.js";
const cases: [string, string[]][] = [["none", []], ["tanyao_break", ["tanyao_break"]], ["spy", ["spy"]]];
for (const [label, aug] of cases) {
  let wins = 0, rounds = 0;
  for (const seed of [5000, 5017, 5034]) {
    let eng: any = null;
    const r = await runMatch({
      seed, mode: "tonpuu",
      preset: { p0: aug, p1: aug, p2: aug, p3: aug },
      personas: { p0: PERSONAS.masher!, p1: PERSONAS.riichiRusher!, p2: PERSONAS.caller!, p3: PERSONAS.folder! },
      noDraft: true,
      onGameStart: (g: any) => { eng = g.engine; },
      timeoutMs: 120000,
    });
    rounds += r.rounds;
    for (const e of (eng?.eventLog ?? []) as GameEvent[]) {
      if (e.type !== ROUND_SETTLED) continue;
      wins += ((e.payload as any).winInfos ?? []).length;
    }
  }
  console.log(`${label.padEnd(14)} rounds=${rounds} wins=${wins}`);
}
