/**
 * 이중 선언(riichi_upgrade) — description: "내 하가(다음 차례 사람)는 **그 국에** 리치를
 * 걸 수 없게 된다". detail: "**내가 그 리치를 지고 있는 동안** 봉인". 둘이 어긋난다.
 * 구현은 detail 쪽이라, 승부수로 내 리치를 물리면 하가의 리치가 같은 국에 되살아난다.
 */
import { createStandardGameFromState, installAugment } from "@majak/core";
import type { GameState, TileId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { riichiUpgrade } from "../../../packages/content/src/augments/riichi_upgrade.js";
import { lastStand } from "../../../packages/content/src/augments/last_stand.js";

const base = craft({
  hands: { p0: "234m345p345s678s55s", p1: "123m456m789m11p234p", p2: "*", p3: "*" },
  phase: "turn.act",
  turnSeat: 0,
  drawnLastFor: "p0",
});
const st: GameState = {
  ...base,
  players: base.players.map((p) => (p.id === "p0" ? { ...p, augments: ["riichi_upgrade", "last_stand"] } : p)),
};
function mk(s: GameState) {
  const g = createStandardGameFromState(s);
  installAugment(g.engine, riichiUpgrade, "p0", { yaku: g.yaku });
  installAugment(g.engine, lastStand, "p0", { yaku: g.yaku });
  return g;
}
const blocked = (g: ReturnType<typeof mk>, who: string): boolean =>
  g.engine.rules.resolve<boolean>("riichi.blocked", { playerId: who as never, state: g.engine.state });

const g = mk(st);
console.log(`① 선언 전            p1봉인=${blocked(g, "p1")}`);
g.engine.submit({ player: "p0", type: "riichi", payload: { tileId: g.engine.state.round.lastDrawnTile as TileId } });
console.log(`② 이중 선언 리치 후   p1봉인=${blocked(g, "p1")} 공개채널=${JSON.stringify(g.engine.state.augmentData["view:*:riichi_upgrade:p0"])}`);

const w = g.engine.state.zones["wall"]!.tileIds;
const d = w[0] as TileId;
const st2: GameState = {
  ...g.engine.state,
  zones: {
    ...g.engine.state.zones,
    wall: { ...g.engine.state.zones["wall"]!, tileIds: w.slice(1) },
    "hand:p0": { ...g.engine.state.zones["hand:p0"]!, tileIds: [...g.engine.state.zones["hand:p0"]!.tileIds, d] },
  },
  round: { ...g.engine.state.round, phase: "turn.act", turnSeat: 0, lastDrawnTile: d },
};
const g2 = mk(st2);
g2.engine.submit({ player: "p0", type: "cancel_riichi", payload: {} });
console.log(`③ 승부수로 리치 취소   p1봉인=${blocked(g2, "p1")} 공개채널=${JSON.stringify(g2.engine.state.augmentData["view:*:riichi_upgrade:p0"])}  ← 채널은 아직 "p1"`);
