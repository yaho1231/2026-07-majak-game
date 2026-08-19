/**
 * 누명(frame_up) detail/description:
 *   "심긴 패는 전원에게 공개되며, **리치 중이거나 국의 첫 바퀴에는 쓸 수 없다.**"
 *
 * 게이트는 `state.round.firstTurn`(frame_up.ts:69)인데, 이 플래그는 "첫 바퀴가 끝났다"가
 * 아니라 "**첫 바퀴가 깨지지 않았다**"는 뜻이다 — 누가 한 번이라도 울거나 깡을 하면
 * 그 자리에서 false가 된다(flowEvents.ts:542 · :612).
 *
 * 그래서 **국의 첫 버림을 누가 퐁하는 순간**, 아직 아무도 두 번째 버림을 하지 않았는데도
 * 누명이 열린다. 카드 문구를 그대로 믿는 사람은 "첫 바퀴 동안은 안전하다"고 읽는다.
 */
import { createStandardGameFromState, installAugment } from "@majak/core";
import type { GameState, TileId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { frameUp } from "../../../packages/content/src/augments/frame_up.js";

const base = craft({
  hands: { p0: "*", p1: "55p123456789m1s", p2: "*", p3: "*" },
  phase: "reaction",
  turnSeat: 0,
  // 국의 첫 버림 — p0가 5p를 버렸다
  lastDiscard: { player: "p0", spec: "5p" },
});
const s: GameState = {
  ...base,
  players: base.players.map((p) => (p.id === "p1" ? { ...p, augments: ["frame_up"] } : p)),
  // craft는 '게임 중간 스냅샷'이라 firstTurn=false다 — 진짜 첫 바퀴로 되돌린다
  round: { ...base.round, firstTurn: true },
};
const g = createStandardGameFromState(s, undefined, []);
installAugment(g.engine, frameUp, "p1", { yaku: g.yaku });

const frameOpts = (): number =>
  g.engine.turnOptionProviders
    .flatMap((p) => p(g.engine.state, "p1"))
    .filter((o) => o.type === "frame_discard").length;

const st0 = g.engine.state;
console.log("첫 바퀴인가:", st0.round.firstTurn, " 각자 버림 수:", st0.players.map((p) => st0.round.byPlayer[p.id]!.discardCount).join("/"));
console.log("퐁 전 p1의 누명 후보:", frameOpts(), "(문구대로 0)");

const pair = (st0.zones["hand:p1"]?.tileIds ?? [])
  .filter((id) => {
    const k = st0.tiles[id]!.kind;
    return k.suit === "pin" && k.rank === 5;
  })
  .slice(0, 2) as [TileId, TileId];
const pon = g.engine.submit({ player: "p1", type: "pon", payload: { tileIds: pair } });

const st1 = g.engine.state;
console.log("\np1 퐁:", pon.ok, " → firstTurn:", st1.round.firstTurn);
console.log("  각자 버림 수:", st1.players.map((p) => st1.round.byPlayer[p.id]!.discardCount).join("/"), "← 아직 첫 바퀴도 안 돌았다");
console.log("  turnSeat:", st1.round.turnSeat, "(p1)");
console.log("퐁 직후 p1의 누명 후보:", frameOpts(), "← 첫 바퀴인데 열렸다");

const tile = (st1.zones["hand:p1"]?.tileIds ?? [])[0] as TileId;
const r = g.engine.submit({
  player: "p1",
  type: "frame_discard",
  payload: { tileId: tile, target: "p2" },
});
console.log("실제로 p2 바닥에 심기:", r.ok);
console.log(
  "  p2 버림 이력:",
  g.engine.state.round.byPlayer["p2"]!.discardedKinds.join(" "),
  " / p2 바닥 장수:",
  g.engine.state.zones["discards:p2"]?.tileIds.length,
);
