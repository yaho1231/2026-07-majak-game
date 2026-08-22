/**
 * 귀환(honor_return) — 다음 국 **배패**를 고쳐 놓고 천화·지화 게이트를 닫지 않는다.
 *
 * 주입 시점이 ROUND_STARTED 리액션이다. 코어에서 ROUND_STARTED 리듀서 = setupRound(배패)이고
 * (flowEvents.ts registerFlowReducers), 증강 리액션은 그 **뒤**에 돈다. 오야의 첫 쯔모는
 * 그보다 더 뒤다 — 즉 주입은 천화 창 한복판에서 일어난다.
 * 그런데 형제 증강 8종이 남기는 `handAlteredMark`가 여기엔 없다.
 */
import {
  SYSTEM_PLAYER, createStandardGameFromState,
  handIdsOf, installAugment, kindKey, kindOf,
} from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { handAlteredByAugment } from "../../../packages/core/src/mahjong/flow/helpers.js";
import { craft } from "../../../packages/content/test/helpers.js";
import { honorReturn } from "../../../packages/content/src/augments/honor_return.js";

function withAug(s: GameState, p: PlayerId, ids: string[]): GameState {
  return { ...s, players: s.players.map((x) => (x.id === p ? { ...x, augments: [...ids] } : x)) };
}
const base = craft({ hands: { p0: "123m456m789m1122p", p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 0, drawnLastFor: "p0" });
const state: GameState = {
  ...withAug(base, "p0", ["honor_return"]),
  round: { ...base.round, phase: "round.over" as const },
  augmentData: {
    ...base.augmentData,
    // 지난 국에 발동해 기억해 둔 자패 4장
    "honor_return:keep:p0": [
      { suit: "dragon", rank: 1 }, { suit: "dragon", rank: 1 },
      { suit: "dragon", rank: 1 }, { suit: "wind", rank: 1 },
    ],
  },
};
const game = createStandardGameFromState(state);
installAugment(game.engine, honorReturn, "p0", { yaku: game.yaku });

const before = handIdsOf(game.engine.state, "p0").map((id) => kindKey(kindOf(game.engine.state, id)));
console.log("배패 전 손패 :", before.join(" "));
console.log("주입 전 handAlteredByAugment(p0) =", handAlteredByAugment(game.engine.state, "p0"));

// ROUND_STARTED 리액션만 직접 돌린다 (setupRound는 이미 끝난 것으로 보고 손패를 그대로 쓴다)
const r = game.engine.submit({ player: SYSTEM_PLAYER, type: "sys.startRound", payload: {} });
console.log("sys.startRound ok=", r.ok, (r as { error?: string }).error ?? "");

const after = handIdsOf(game.engine.state, "p0").map((id) => kindKey(kindOf(game.engine.state, id)));
console.log("주입 후 손패 :", after.join(" "));
const altered = handAlteredByAugment(game.engine.state, "p0");
console.log("주입 후 handAlteredByAugment(p0) =", altered);
console.log(!altered ? "BUG: 배패를 고쳐 놓고 천화·지화 게이트가 열려 있다" : "OK");
