/**
 * 북풍 상인 — 왕패/표시패/영상패 정합성.
 * 실행: tsx qa-lab/score-b/t_north.ts
 */
import { DEAD_WALL, WALL, doraIndicatorIndex, handIdsOf, kindKey, meldsZone, rinshanRemaining } from "@majak/core";
import type { GameState, TileId } from "@majak/core";
import { craft, start } from "./scene.js";

const say = (s: string): void => { console.log(s); };

function dump(tag: string, s: GameState): void {
  const dw = s.zones[DEAD_WALL]?.tileIds ?? [];
  const ind = s.round.doraIndicators;
  const idx0 = doraIndicatorIndex(s, 0);
  say(
    `${tag}: wall=${s.zones[WALL]?.tileIds.length} deadWall=${dw.length} rinshan=${rinshanRemaining(s)} ` +
    `ind=[${ind.map((t) => kindKey(s.tiles[t]!.kind)).join(",")}] ` +
    `indIdx(0)=${idx0} deadWall[idx0]=${dw[idx0] === undefined ? "-" : kindKey(s.tiles[dw[idx0]!]!.kind)} ` +
    `indMatchesIndex=${ind[0] === dw[idx0]} ` +
    `hand=${handIdsOf(s, "p0").length} melds=${s.zones[meldsZone("p0")]?.tileIds.length} ` +
    `lastRinshan=${s.round.lastDrawRinshan}`,
  );
}

// p0 손에 北 4장, 자기 턴
const base = craft({
  hands: { p0: "4444z123m456m789m1s", p1: "*", p2: "*", p3: "*" },
  phase: "turn.act",
  turnSeat: 0,
  drawnLastFor: "p0",
});
const { game, flow } = start(base, { p0: ["north_trader"] } as never);
dump("초기", game.engine.state);

for (let i = 0; i < 4; i++) {
  const st = game.engine.state;
  const north = handIdsOf(st, "p0").find((id: TileId) => {
    const k = st.tiles[id]!.kind;
    return k.suit === "wind" && k.rank === 4;
  });
  if (north === undefined) { say(`북 없음 (i=${i})`); break; }
  const res = flow.submit("p0", { type: "north_pull", payload: { tileId: north } });
  if (res.kind !== "awaiting") { say(`북빼기 실패 i=${i} kind=${res.kind}`); break; }
  dump(`북빼기 ${i + 1}회`, game.engine.state);
  // 표시패가 실제로 왕패 안에 있는가
  const s2 = game.engine.state;
  const dw = s2.zones[DEAD_WALL]?.tileIds ?? [];
  for (const t of s2.round.doraIndicators) {
    if (!dw.includes(t)) say(`  ⚠ 표시패 ${t} 가 왕패 밖에 있다`);
  }
  // 패 총수 보존
  const all = Object.values(s2.zones).flatMap((z) => z.tileIds);
  if (new Set(all).size !== all.length) say("  ⚠ 패 중복");
  if (all.length !== Object.keys(s2.tiles).length) {
    say(`  ⚠ 패 유실: zones=${all.length} tiles=${Object.keys(s2.tiles).length}`);
  }
  // 버려야 다음 턴 — 1s를 버린다
  const discard = handIdsOf(s2, "p0").find((id: TileId) => kindKey(s2.tiles[id]!.kind) === "sou1");
  if (discard === undefined) { say("  1s 없음 — 아무거나 버린다"); }
  const d = discard ?? handIdsOf(s2, "p0")[0]!;
  // 버린 뒤 다시 p0 턴이 오도록: 그냥 같은 턴에 연속 북빼기가 되는지 본다
  void d;
}

// 4회 북빼기 후 판수 확인용 — 실물에서 센 北 장수
const fin = game.engine.state;
const inMelds = new Set((fin.round.byPlayer.p0?.melds ?? []).flatMap((m) => m.tileIds));
const pulled = (fin.zones[meldsZone("p0")]?.tileIds ?? []).filter((id: TileId) => {
  if (inMelds.has(id)) return false;
  const k = fin.tiles[id]!.kind;
  return k.suit === "wind" && k.rank === 4;
}).length;
say(`빼놓은 北=${pulled} (= +${pulled}판 기대)`);
say(`view 채널=${JSON.stringify(Object.entries(fin.augmentData).filter(([k]) => k.includes("north_trader")))}`);
