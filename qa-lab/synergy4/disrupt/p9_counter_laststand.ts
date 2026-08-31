/**
 * P9 — 카운터(counter) × 승부수(last_stand). 둘 다 리치 축이고 한 사람이 들 수 있다.
 * counter.ts 는 «추격 리치를 무르면 반격도 함께 무른다»를 RIICHI_CANCELED 리액션으로
 * 구현해 두었다(2026-08-22 확정 4). 여기서는 그 회귀 검사를 재실행한다.
 *
 * 예측: 승부수로 리치를 취소하면 (a) 대납 1,000점이 상대에게 돌아가고
 *       (b) counter:struck 이 false 로 내려가야 한다.
 */
import { craft, setup, turnOptions, startFlow2 } from "../../synergy3/disrupt/lib.js";
import type { GameState } from "@majak/core";

const state0: GameState = craft({
  hands: { p0: "234m678m678s23p33p9m", p1: "*", p2: "*", p3: "*" },
  discards: { p1: "1z", p2: "2z", p3: "3z" } as never,
  phase: "turn.act",
  turnSeat: 0,
  drawnLastFor: "p0",
} as never);

// p1이 먼저 리치를 건 상태를 흉내 낸다: counter:prev/struck/paid 를 심는다
const seeded: GameState = {
  ...state0,
  augmentData: {
    ...state0.augmentData,
    "counter:prev:p0": "p1",
    "counter:struck:p0": true,
    "counter:spent:p0": true,
    "counter:paid:p0": 1000,
  },
  round: {
    ...state0.round,
    byPlayer: {
      ...state0.round.byPlayer,
      p0: { ...state0.round.byPlayer["p0"]!, riichi: { discardIndex: 0, ippatsu: false, doubleRiichi: false, turn: 1 } as never },
    },
  },
};

const g = setup(seeded, { p0: ["counter", "last_stand"] });
const before = g.engine.state.players.map((p) => `${p.id}:${p.score}`).join(" ");
console.log("전:", before, "· struck =", g.engine.state.augmentData["counter:struck:p0"]);
const opts = turnOptions(g, "p0");
console.log("후보:", JSON.stringify([...new Set(opts.map((o) => o.type))]));
const ls = opts.find((o) => o.type.includes("last_stand") || o.type.includes("cancel"));
if (ls === undefined) { console.log("승부수 후보 없음"); }
else {
  const { flow } = startFlow2(g);
  flow.submit("p0", { type: ls.type, payload: ls.payload } as never);
  console.log("후:", g.engine.state.players.map((p) => `${p.id}:${p.score}`).join(" "),
    "· struck =", g.engine.state.augmentData["counter:struck:p0"],
    "· paid =", g.engine.state.augmentData["counter:paid:p0"]);
}
