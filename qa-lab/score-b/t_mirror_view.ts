/**
 * 거울의 도라 — 깡도라가 뒤집힐 때 **전원 공개 채널**이 따라 갱신되는가.
 * 카드: "무엇이 도라가 됐는지는 전원에게 공개된다" / "표시패가 뒤집힐 때마다 알린다"
 * 실행: tsx qa-lab/score-b/t_mirror_view.ts
 */
import { DEAD_WALL, frontDoraKindFor, handIdsOf, kindKey } from "@majak/core";
import type { GameState, TileId } from "@majak/core";
import { craft, start } from "./scene.js";

const say = (s: string): void => { console.log(s); };
const CH = "view:*:mirror_dora:p0#round";

function show(tag: string, s: GameState): void {
  const want = s.round.doraIndicators.map((t) => kindKey(frontDoraKindFor(s.tiles[t]!.kind)));
  say(`${tag}: 표시패=${s.round.doraIndicators.map((t) => kindKey(s.tiles[t]!.kind))} ` +
      `기대앞도라=${JSON.stringify(want)} 채널=${JSON.stringify(s.augmentData[CH])} ` +
      `${JSON.stringify(s.augmentData[CH]) === JSON.stringify(want) ? "OK" : "← 어긋남"}`);
}

// p0: 6666s 안깡 재료 + 나머지, 자기 턴
const base = craft({
  hands: { p0: "6666s123m456m789m1s", p1: "*", p2: "*", p3: "*" },
  phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
});
const { game, flow } = start(base, { p0: ["mirror_dora"] } as never);
show("배패 직후", game.engine.state);

const st0 = game.engine.state;
const quad = handIdsOf(st0, "p0").filter((id: TileId) => kindKey(st0.tiles[id]!.kind) === "sou6");
let res = flow.submit("p0", { type: "ankan", payload: { tileIds: quad } });
say(`안깡 kind=${res.kind}`);
show("안깡 직후", game.engine.state);

// 깡 후 보충 쯔모 → 버림 (여기서 깡도라가 뒤집힌다)
const st1 = game.engine.state;
const drop = handIdsOf(st1, "p0").find((id: TileId) => kindKey(st1.tiles[id]!.kind) === "sou1")
  ?? handIdsOf(st1, "p0")[0]!;
res = flow.submit("p0", { type: "discard", payload: { tileId: drop } });
say(`버림 kind=${res.kind}`);
show("깡도라 뒤집힌 뒤", game.engine.state);
say(`deadWall=${game.engine.state.zones[DEAD_WALL]?.tileIds.length}`);
