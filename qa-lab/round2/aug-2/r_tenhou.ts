/**
 * full_hand_swap — **증강으로 만든 손에 천화(48,000)가 붙는다.**
 *
 * handAltered 표식(“증강이 이번 국에 손패를 고쳤다”)은 손패를 갈아 끼우는 리듀서가
 * 남겨야 코어의 천화·지화 게이트가 닫힌다(packages/content/src/augments/handAltered.ts).
 * 그런데 통째로 바꾸기(full_hand_swap)는 **국의 첫 순에만** 쓰는, 손패 13장을 통째로
 * 갈아 끼우는 증강인데 그 표식을 남기지 않는다 — 천화·지화 창이 정확히 그 창이다.
 */
import { ROUND_SETTLED, SYSTEM_PLAYER, createStandardGameFromState, handIdsOf, installAugment } from "@majak/core";
import type { GameEvent, GameState, PlayerId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { fullHandSwap } from "../../../packages/content/src/augments/full_hand_swap.js";

function withAug(s: GameState, p: PlayerId, ids: string[]): GameState {
  return { ...s, players: s.players.map((x) => (x.id === p ? { ...x, augments: [...ids] } : x)) };
}

const base = craft({
  hands: {
    p0: "123456789m1234s1p", // 14장, 마지막(쯔모패)이 1p
    p1: "123m456m789m234s1p", // 13장 — 1p 한 장이면 완성
    p2: "*", p3: "*",
  },
  phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
});
const state: GameState = {
  ...withAug(base, "p0", ["full_hand_swap"]),
  // 국의 첫 바퀴 — 천화 창 (craft 기본은 false라 되돌린다)
  round: { ...base.round, firstTurn: true, turnCount: 1 },
};
const game = createStandardGameFromState(state);
installAugment(game.engine, fullHandSwap, "p0", { yaku: game.yaku });

console.log("swap ok=", game.engine.submit({ player: "p0", type: "hand_swap", payload: { target: "p1" } }).ok);
const drawn = game.engine.state.round.lastDrawnTile;
console.log("p0 hand after swap =", handIdsOf(game.engine.state, "p0").length, "drawn=", drawn);
const w = game.engine.submit({
  player: SYSTEM_PLAYER, type: "sys.settleWin",
  payload: { wins: [{ winner: "p0", from: null, tileId: drawn, winType: "tsumo" }] },
});
console.log("settle ok=", w.ok, (w as { error?: string }).error ?? "");
const settled = game.engine.eventLog.filter((e: GameEvent) => e.type === ROUND_SETTLED);
for (const e of settled) {
  const p = e.payload as { winInfos?: { winner: string; yaku: { id: string; name: string }[]; points: number; yakumanCount: number }[]; deltas?: Record<string, number> };
  for (const wi of p.winInfos ?? []) {
    console.log("winner", wi.winner, "points", wi.points, "yakuman", wi.yakumanCount, "yaku", wi.yaku.map((y) => y.id).join(","));
  }
  console.log("deltas", p.deltas);
}
