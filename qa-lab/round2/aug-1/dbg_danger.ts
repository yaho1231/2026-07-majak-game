import { FlowController, createStandardGameFromState, installAugment, winningKinds, winHandKindsOf, meldCountOf, scoringOptionsOf, kindKey } from "@majak/core";
import type { GameState } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { dangerSense } from "../../../packages/content/src/augments/danger_sense.js";

const base = craft({
  hands: { p0: "19m19p19s1234567z9s", p1: "123m123p123s678s9s", p2: "*", p3: "*" },
  phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
});
const state: GameState = { ...base, players: base.players.map(p => p.id === "p0" ? { ...p, augments: ["danger_sense"] } : p) };
const game = createStandardGameFromState(state, undefined, [dangerSense]);
installAugment(game.engine, dangerSense, "p0", { yaku: game.yaku });
const st = game.engine.state;
for (const pid of ["p1","p2","p3"] as const) {
  const w = winningKinds(winHandKindsOf(st, game.engine.rules, pid), meldCountOf(st, pid), undefined, scoringOptionsOf(st, game.engine.rules, pid));
  console.log(pid, "hand=", winHandKindsOf(st, game.engine.rules, pid).map(kindKey).join(","), "waits=", w.map(kindKey));
}
const flow = new FlowController(game.engine);
const b = flow.begin();
console.log("begin", b.kind, b.kind === "awaiting" ? JSON.stringify(b.prompts.map(p=>({p:p.player,o:p.options.map(o=>o.type)}))) : "");
const r0 = flow.submit("p0", { type: "danger_sense_use", payload: {} });
console.log("submit", r0.kind);
const r = game.engine.state.round;
console.log("keys", Object.keys(game.engine.state.augmentData).filter(k=>k.includes("danger")));
console.log(JSON.stringify(game.engine.state.augmentData[`view:p0:danger_sense#${r.prevalentWind}-${r.roundNumber}-${r.honba}`]));
console.log("ROUNDKEY", JSON.stringify(game.engine.state.augmentData["view:p0:danger_sense#round"]));
