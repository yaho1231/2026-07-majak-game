import { FlowController, createInitialGameState, createStandardGameFromState, installAugment } from "@majak/core";
import type { GameState } from "@majak/core";
import { deadWallMaster } from "../../../packages/content/src/augments/dead_wall_master.js";

const base = createInitialGameState({ seed: 7, playerIds: ["p0","p1","p2","p3"] }, { startScore: 25000, redFivesPerSuit: 1 });
const state: GameState = { ...base, players: base.players.map(p => p.id === "p0" ? { ...p, augments: ["dead_wall_master"] } : p) };
const game = createStandardGameFromState(state, undefined, [deadWallMaster]);
installAugment(game.engine, deadWallMaster, "p0", { yaku: game.yaku });
const flow = new FlowController(game.engine);
const st = flow.begin();
console.log("phase", game.engine.state.round.phase, "dealerSeat", game.engine.state.round.dealerSeat, "turnSeat", game.engine.state.round.turnSeat);
console.log("augData", JSON.stringify(Object.fromEntries(Object.entries(game.engine.state.augmentData).filter(([k])=>k.includes("dead_wall")))));
console.log("st", st.kind, st.kind==="awaiting"?JSON.stringify(st.prompts.map(p=>({p:p.player,o:[...new Set(p.options.map(o=>o.type))]}))):"");
if (st.kind === "awaiting") {
  const pr = st.prompts[0]!;
  const d = pr.options.find(o=>o.type==="discard")!;
  const after = flow.submit(pr.player, d);
  console.log("after", JSON.stringify(Object.fromEntries(Object.entries(game.engine.state.augmentData).filter(([k])=>k.includes("dead_wall")))));
  console.log("after prompts", after.kind, after.kind==="awaiting"?JSON.stringify(after.prompts.map(p=>({p:p.player,o:[...new Set(p.options.map(o=>o.type))]}))):"");
}
