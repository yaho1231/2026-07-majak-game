/**
 * 불가침 조약(no_ron_pact) — "파기되면 그 뒤로는 평범하게 론당한다".
 * 그러나 파기 조건이 상태 파생(rs.riichi != null)이라, 승부수로 리치를 취소하면
 * 조약이 **되살아난다**(같은 국, 6순 이내). 공개 배너도 "조약 유효"로 되돌아간다.
 */
import { createStandardGameFromState, installAugment } from "@majak/core";
import type { GameState, TileId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { noRonPact } from "../../../packages/content/src/augments/no_ron_pact.js";
import { lastStand } from "../../../packages/content/src/augments/last_stand.js";

const base = craft({
  hands: { p0: "234m345p345s678s5s", p1: "*", p2: "*", p3: "*" },
  phase: "turn.act",
  turnSeat: 0,
});
const wall = base.zones["wall"]!.tileIds;
const drawn = wall[0] as TileId;
const st: GameState = {
  ...base,
  players: base.players.map((p) => (p.id === "p0" ? { ...p, augments: ["no_ron_pact", "last_stand"] } : p)),
  zones: {
    ...base.zones,
    wall: { ...base.zones["wall"]!, tileIds: wall.slice(1) },
    "hand:p0": { ...base.zones["hand:p0"]!, tileIds: [...base.zones["hand:p0"]!.tileIds, drawn] },
  },
  round: { ...base.round, turnCount: 3, lastDrawnTile: drawn },
};

function mk(s: GameState) {
  const g = createStandardGameFromState(s);
  installAugment(g.engine, noRonPact, "p0", { yaku: g.yaku });
  installAugment(g.engine, lastStand, "p0", { yaku: g.yaku });
  return g;
}
const immune = (g: ReturnType<typeof mk>): boolean =>
  g.engine.rules.resolve<boolean>("win.ronImmune", { playerId: "p0", state: g.engine.state });
const banner = (g: ReturnType<typeof mk>): unknown =>
  g.engine.state.augmentData[`view:*:1-1-0:no_ron_pact:p0`] ??
  Object.entries(g.engine.state.augmentData).find(([k]) => k.includes("no_ron_pact:p0") && !k.includes("active"))?.[1];

let g = mk(st);
console.log(`① 3순, 리치 전         ronImmune=${immune(g)} 배너=${JSON.stringify(banner(g))}`);
g.engine.submit({ player: "p0", type: "riichi", payload: { tileId: drawn } });
console.log(`② 리치 선언 직후        ronImmune=${immune(g)} 배너=${JSON.stringify(banner(g))}`);

// 내 순으로 되돌려 승부수로 리치 취소
const w2 = g.engine.state.zones["wall"]!.tileIds;
const d2 = w2[0] as TileId;
const st2: GameState = {
  ...g.engine.state,
  zones: {
    ...g.engine.state.zones,
    wall: { ...g.engine.state.zones["wall"]!, tileIds: w2.slice(1) },
    "hand:p0": { ...g.engine.state.zones["hand:p0"]!, tileIds: [...g.engine.state.zones["hand:p0"]!.tileIds, d2] },
  },
  round: { ...g.engine.state.round, phase: "turn.act", turnSeat: 0, lastDrawnTile: d2, turnCount: 4 },
};
const g2 = mk(st2);
const r = g2.engine.submit({ player: "p0", type: "cancel_riichi", payload: {} });
console.log(`③ 승부수로 리치 취소 ok=${r.ok} → ronImmune=${immune(g2)}  ← "파기되면 그 뒤로는 평범하게 론당한다"에 어긋남`);
// 배너 갱신은 다음 버림에서 일어난다
g2.engine.submit({ player: "p0", type: "discard", payload: { tileId: d2 } });
console.log(`④ 취소 뒤 첫 버림 후    ronImmune=${immune(g2)} 배너=${JSON.stringify(banner(g2))}`);
