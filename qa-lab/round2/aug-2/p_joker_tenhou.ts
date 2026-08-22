/** 의심 8 — 오야가 첫 순에 조커를 켜서 미완성 배패를 완성시키면 천화가 붙는가? */
import { ROUND_SETTLED, SYSTEM_PLAYER, createStandardGameFromState, installAugment } from "@majak/core";
import type { GameEvent, GameState, PlayerId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { joker } from "../../../packages/content/src/augments/joker.js";

function withAug(s: GameState, p: PlayerId, ids: string[]): GameState {
  return { ...s, players: s.players.map((x) => (x.id === p ? { ...x, augments: [...ids] } : x)) };
}
// p0 = 오야. 백 두 장이 조커가 되면 234p 를 채워 완성형이 된다 (조커 없으면 미완성)
const base = craft({
  hands: { p0: "123m456m789m11p2p5z5z", p1: "*", p2: "*", p3: "*" },
  phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
});
const state: GameState = {
  ...withAug(base, "p0", ["joker"]),
  round: { ...base.round, firstTurn: true, turnCount: 1, dealerSeat: 0 },
};
const game = createStandardGameFromState(state);
installAugment(game.engine, joker, "p0", { yaku: game.yaku });
console.log("joker_call ok =", game.engine.submit({ player: "p0", type: "joker_call", payload: {} }).ok);
const drawn = game.engine.state.round.lastDrawnTile;
const w = game.engine.submit({
  player: SYSTEM_PLAYER, type: "sys.settleWin",
  payload: { wins: [{ winner: "p0", from: null, tileId: drawn, winType: "tsumo" }] },
});
console.log("settle ok =", w.ok, (w as { error?: string }).error ?? "");
for (const e of game.engine.eventLog.filter((x: GameEvent) => x.type === ROUND_SETTLED)) {
  const p = e.payload as { winInfos?: { points: number; yakumanCount: number; yaku: { id: string }[] }[] };
  for (const wi of p.winInfos ?? []) console.log("points", wi.points, "yakuman", wi.yakumanCount, "yaku", wi.yaku.map((y) => y.id).join(","));
}
