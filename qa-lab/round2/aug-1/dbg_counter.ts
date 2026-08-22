import { FlowController, createStandardGameFromState, installAugment, kindOf, kindKey } from "@majak/core";
import type { GameState } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { counter } from "../../../packages/content/src/augments/counter.js";
import { lastStand } from "../../../packages/content/src/augments/last_stand.js";

const base = craft({
  hands: { p0: "123m123p123s678s9s1z", p1: "*", p2: "*", p3: "*" },
  phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
});
const state: GameState = {
  ...base,
  players: base.players.map(p => p.id === "p0" ? { ...p, augments: ["counter","last_stand"] } : p),
  round: { ...base.round, riichiPot: 1000, byPlayer: { ...base.round.byPlayer, p1: { ...base.round.byPlayer["p1"]!, riichi: { double:false, ippatsu:true, discardIndex:0 } } } },
  augmentData: { ...base.augmentData, "counter:prev:p0": "p1" },
};
const game = createStandardGameFromState(state, undefined, [counter, lastStand]);
installAugment(game.engine, counter, "p0", { yaku: game.yaku });
installAugment(game.engine, lastStand, "p0", { yaku: game.yaku });
const flow = new FlowController(game.engine);
const st = flow.begin();
console.log("lastDrawnTile", game.engine.state.round.lastDrawnTile, "kind", kindKey(kindOf(game.engine.state, game.engine.state.round.lastDrawnTile!)));
if (st.kind === "awaiting") {
  for (const p of st.prompts) console.log(p.player, JSON.stringify(p.options.map(o=>({t:o.type, ...(o.payload as any)}))));
}

const sc = (id:string)=>game.engine.state.players.find(p=>p.id===id)!.score;
console.log("before", sc("p0"), sc("p1"), "pot", game.engine.state.round.riichiPot);
let cur = st as any;
const r0 = cur.prompts[0].options.find((o:any)=>o.type==="riichi" && o.payload.tileId===108);
cur = flow.submit("p0", r0);
console.log("after riichi", sc("p0"), sc("p1"), "pot", game.engine.state.round.riichiPot,
  "ippatsu", game.engine.state.round.byPlayer["p1"]?.riichi?.ippatsu,
  "struck", game.engine.state.augmentData["counter:struck:p0"],
  "spent", game.engine.state.augmentData["counter:spent:p0"]);
for (let i=0;i<12 && cur.kind==="awaiting";i++) {
  const pr = cur.prompts[0];
  if (!pr) break;
  if (pr.player === "p0") break;
  const o = pr.options.find((x:any)=>x.type==="pass") ?? pr.options.find((x:any)=>x.type==="discard");
  if (!o) { console.log("no discard for", pr.player, pr.options.map((x:any)=>x.type)); break; }
  cur = flow.submit(pr.player, o);
}
console.log("now", cur.kind, cur.kind==="awaiting"?JSON.stringify(cur.prompts.map((p:any)=>({p:p.player,o:[...new Set(p.options.map((o:any)=>o.type))]}))):"");
const cp = cur.kind==="awaiting" ? cur.prompts.find((p:any)=>p.player==="p0") : undefined;
const co = cp?.options.find((o:any)=>o.type==="cancel_riichi");
console.log("cancel option", JSON.stringify(co));
if (co) {
  const res = flow.submit("p0", co);
  console.log("after cancel", res.kind, sc("p0"), sc("p1"), "pot", game.engine.state.round.riichiPot,
    "riichi", JSON.stringify(game.engine.state.round.byPlayer["p0"]?.riichi),
    "struck", game.engine.state.augmentData["counter:struck:p0"],
    "spent", game.engine.state.augmentData["counter:spent:p0"]);
}
