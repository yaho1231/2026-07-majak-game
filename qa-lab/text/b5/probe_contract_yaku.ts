/**
 * 핏빛 계약 — detail의 "지정 역 목록(… 치또이 **등**)"이 실제로 몇 종인가.
 * 실행: /Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b5/probe_contract_yaku.ts
 */
import type { GameState, PlayerId } from "@majak/core";
import { craft, start } from "../../score-b/scene.js";
const say = (s: string): void => { console.log(s); };

const base: GameState = craft({
  hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
  phase: "turn.act",
  turnSeat: 0,
  drawnLastFor: "p0",
});
const { game, flow } = start(base, { p0: ["blood_contract"] } as never);
const prompt = flow.begin();
const opts = (prompt as { options?: { type: string; payload: unknown }[] }).options ?? [];
const offered = opts
  .filter((o) => o.type === "blood_contract_declare")
  .map((o) => (o.payload as { yaku: string }).yaku);
say(`실제 계약 가능한 역 (${offered.length}종): ${offered.join(", ")}`);

const def = game.engine.actions.get("blood_contract_declare")!;
for (const y of ["sanankou", "chanta", "junchan", "ryanpeiko", "honroutou", "sanshoku_doukou", "shousangen"]) {
  const r = def.validate(
    { player: "p0" as PlayerId, type: "blood_contract_declare", payload: { yaku: y } } as never,
    { state: game.engine.state, rules: game.engine.rules } as never,
  );
  say(`  ${y.padEnd(16)} → ${r === null ? "가능" : `불가(${r})`}`);
}
