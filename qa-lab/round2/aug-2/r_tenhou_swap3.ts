/**
 * hand_swap3 — 상대 손패를 **보고 고른 3장**으로 천화(48,000)를 조립할 수 있다.
 *
 * 등가교환은 지정→3장 넘기기→3장 가져오기가 모두 turn.act에서 일어나고 턴을 넘기지
 * 않는다. 그래서 오야의 **첫 순**에 세 단계를 다 밟을 수 있는데, 손패를 갈아 끼우면서
 * handAltered 표식을 남기지 않아 코어의 천화 게이트가 그대로 열려 있다.
 * full_hand_swap과 달리 이쪽은 **상대 손패가 나에게 공개된 상태에서 내가 고른다** —
 * 즉 운이 아니라 계산으로 조립된다.
 */
import { ROUND_SETTLED, SYSTEM_PLAYER, createStandardGameFromState, handIdsOf, installAugment, kindKey, kindOf } from "@majak/core";
import type { GameEvent, GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { handSwap3 } from "../../../packages/content/src/augments/hand_swap3.js";

function withAug(s: GameState, p: PlayerId, ids: string[]): GameState {
  return { ...s, players: s.players.map((x) => (x.id === p ? { ...x, augments: [...ids] } : x)) };
}
const base = craft({
  // p0(오야) 14장: 123m456m789m + 55p + 1z2z3z  → 자패 3장만 갈면 완성
  hands: {
    p0: "123m456m789m55p1z2z3z",
    p1: "678s123p456p9m9m9m9p", // 678s 세 장을 가져오면 p0가 완성된다
    p2: "*", p3: "*",
  },
  phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
});
const state: GameState = {
  ...withAug(base, "p0", ["hand_swap3"]),
  round: { ...base.round, firstTurn: true, turnCount: 1 },
};
const game = createStandardGameFromState(state);
installAugment(game.engine, handSwap3, "p0", { yaku: game.yaku });

const idsOf = (p: PlayerId, spec: string[]): TileId[] =>
  spec.map((k) => handIdsOf(game.engine.state, p).find((id) => kindKey(kindOf(game.engine.state, id)) === k) as TileId)
      .sort((a, b) => a - b);

console.log("aim  ok=", game.engine.submit({ player: "p0", type: "swap3", payload: { target: "p1" } }).ok);
const gives = idsOf("p0", ["wind1", "wind2", "wind3"]);
console.log("give ok=", game.engine.submit({ player: "p0", type: "swap3_give", payload: { gives } }).ok);
const takes = idsOf("p1", ["sou6", "sou7", "sou8"]);
const t = game.engine.submit({ player: "p0", type: "swap3_take", payload: { takes } });
console.log("take ok=", t.ok, (t as { error?: string }).error ?? "");
console.log("p0 hand:", handIdsOf(game.engine.state, "p0").map((id) => kindKey(kindOf(game.engine.state, id))).join(" "));

const drawn = game.engine.state.round.lastDrawnTile;
const w = game.engine.submit({
  player: SYSTEM_PLAYER, type: "sys.settleWin",
  payload: { wins: [{ winner: "p0", from: null, tileId: drawn, winType: "tsumo" }] },
});
console.log("settle ok=", w.ok, (w as { error?: string }).error ?? "");
for (const e of game.engine.eventLog.filter((x: GameEvent) => x.type === ROUND_SETTLED)) {
  const p = e.payload as { winInfos?: { winner: string; yaku: { id: string }[]; points: number }[]; deltas?: Record<string, number> };
  for (const wi of p.winInfos ?? []) console.log("winner", wi.winner, "points", wi.points, "yaku", wi.yaku.map((y) => y.id).join(","));
  console.log("deltas", p.deltas);
}
