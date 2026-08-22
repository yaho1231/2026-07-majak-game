/**
 * full_hand_swap — 후로 종류가 다르면 손패 장수가 깨진다.
 *
 * validate의 sameHandSize는 `deal.handSize` 규칙과 **후로 개수**만 본다.
 * 그런데 깡은 손에서 3장, 퐁·치는 2장을 낸다 — 개수가 같아도 손패 장수가 다르다.
 * 보유자가 깡(손패 10 + 쯔모 1), 대상이 퐁(손패 11)이면
 *   toWall = 10 (내 손패 − 쯔모패), steal = 11 (상대 손패 전부)
 * 이 되어 보유자 손패가 11 + 쯔모 1 = 12장이 된다 (정상 11장).
 */
import {
  WALL, createStandardGameFromState, handIdsOf, installAugment, meldCountOf,
} from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { fullHandSwap } from "../../../packages/content/src/augments/full_hand_swap.js";

function withAug(state: GameState, player: PlayerId, ids: string[]): GameState {
  return { ...state, players: state.players.map((p) => (p.id === player ? { ...p, augments: [...ids] } : p)) };
}

// p3 = 보유자: 대명깡 하나(손패 10장) + 영상 쯔모 1장 = 손 존 11장
// p1 = 대상 : 퐁 하나(손패 11장)
const base = craft({
  hands: {
    p0: "*",
    p1: "123m456m789m12p", // 11장 (퐁 1개 보유자의 정상 손패)
    p2: "*",
    p3: "1234s5678s99s1p",// 11장 = 깡 1개(손패 10) + 영상 쯔모 1장
  },
  melds: {
    p1: [{ kind: "pon", spec: "555p", from: "p0" }],
    p3: [{ kind: "minkan", spec: "3333z", from: "p2" }],
  },
  phase: "turn.act",
  turnSeat: 3,
  drawnLastFor: "p3",
});
const state = withAug(base, "p3", ["full_hand_swap"]);
const game = createStandardGameFromState(state);
installAugment(game.engine, fullHandSwap, "p3", { yaku: game.yaku });

const st0 = game.engine.state;
console.log("before: p3 hand=", handIdsOf(st0, "p3").length, "melds=", meldCountOf(st0, "p3"),
  "| p1 hand=", handIdsOf(st0, "p1").length, "melds=", meldCountOf(st0, "p1"),
  "| turnCount=", st0.round.turnCount, "wall=", st0.zones[WALL]?.tileIds.length);

const r = game.engine.submit({ player: "p3", type: "hand_swap", payload: { target: "p1" } });
console.log("submit ok=", r.ok, "err=", (r as { error?: string }).error);

const st = game.engine.state;
const p3hand = handIdsOf(st, "p3").length;
const p1hand = handIdsOf(st, "p1").length;
console.log("after : p3 hand=", p3hand, "melds=", meldCountOf(st, "p3"), "→ eff=", p3hand + meldCountOf(st, "p3") * 3);
console.log("after : p1 hand=", p1hand, "melds=", meldCountOf(st, "p1"), "→ eff=", p1hand + meldCountOf(st, "p1") * 3);
console.log("wall=", st.zones[WALL]?.tileIds.length);
const expected3 = 14 - meldCountOf(st, "p3") * 3;
console.log(p3hand === expected3 ? "OK" : `BUG: p3 손패 ${p3hand}장 (정상 ${expected3}장)`);
