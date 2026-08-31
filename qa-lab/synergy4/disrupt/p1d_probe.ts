/** counter 의 +3판이 상한 해제를 못 보는지 직접 확인 */
import { createStandardGameFromState, installAugment, FlowController } from "@majak/core";
import { contentAugments } from "@majak/content";
import { craft } from "../../../packages/content/test/helpers.js";
import { ron } from "./scenes_local.js";

const DEFS = new Map(contentAugments.map((a) => [a.id, a]));
let state = craft(ron("123m123p123s678s9s", "9s", "p1") as any);
state = { ...state, round: { ...state.round, dealerSeat: 1 } };
state = { ...state, players: state.players.map((p) => p.id === "p0" ? { ...p, augments: ["counter", "aotenjou_ceiling"] } : p) };
const game = createStandardGameFromState(state);
for (const id of ["counter", "aotenjou_ceiling"]) installAugment(game.engine, DEFS.get(id)!, "p0", { yaku: game.yaku });
console.log("score.uncapped p0 =", game.engine.rules.resolve("score.uncapped", { playerId: "p0", state: game.engine.state }));
console.log("score.uncapped p1 =", game.engine.rules.resolve("score.uncapped", { playerId: "p1", state: game.engine.state }));
