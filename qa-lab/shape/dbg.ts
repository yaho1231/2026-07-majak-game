import { ROUND_SETTLED } from "@majak/core";
import type { GameEvent } from "@majak/core";
import { PERSONAS, runMatch } from "./h2.js";
let eng: any = null;
const r = await runMatch({
  seed: 5000, mode: "tonpuu",
  preset: { p0: ["tanyao_break"], p1: ["tanyao_break"], p2: ["tanyao_break"], p3: ["tanyao_break"] },
  personas: { p0: PERSONAS.masher!, p1: PERSONAS.riichiRusher!, p2: PERSONAS.caller!, p3: PERSONAS.folder! },
  noDraft: true,
  onGameStart: (g: any) => { eng = g.engine; },
  timeoutMs: 120000,
});
console.log("rounds", r.rounds, "crash", r.crash);
const types = new Map<string, number>();
for (const e of (eng?.eventLog ?? []) as GameEvent[]) types.set(e.type, (types.get(e.type) ?? 0) + 1);
console.log("ROUND_SETTLED const =", ROUND_SETTLED, "count =", types.get(ROUND_SETTLED));
console.log([...types].filter(([k]) => /settle|Settle|round/i.test(k)));
for (const e of (eng?.eventLog ?? []) as GameEvent[]) {
  if (e.type !== ROUND_SETTLED) continue;
  const p: any = e.payload;
  console.log("settle:", p.outcome, "winInfos=", JSON.stringify(p.winInfos?.map((w: any) => [w.winner, w.han, w.yaku.map((y: any) => y.id)])));
}
