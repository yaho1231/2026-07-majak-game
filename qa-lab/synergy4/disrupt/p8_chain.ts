/**
 * P8 — 강 회수 연쇄: 한 턴에 날치기 → 무덤 도굴(또는 정적의 손)을 이어 쓸 수 있는가.
 *
 * 날치기는 쯔모패를 패산 맨 밑으로 되돌리고 주운 패를 lastDrawnTile 로 만든다.
 * 도굴·정적의 손은 lastDrawnTile 이 있으면 발동하므로, 같은 턴에 이어 붙을 수 있다.
 * 그러면 «상대 바닥에서 집은 패»가 다시 패산으로 들어가고 또 다른 바닥 패가 손에 온다.
 * 여기서는 (1) 실제로 이어지는지 (2) 패 중복·유실이 없는지를 본다.
 */
import { craft, setup, turnOptions, startFlow2 } from "../../synergy3/disrupt/lib.js";
import { WALL, DEAD_WALL, handZone, discardsZone, meldsZone } from "@majak/core";
import type { GameState } from "@majak/core";

function integrity(st: GameState): string {
  const where = new Map<number, string>();
  const dup: string[] = [];
  for (const z of Object.values(st.zones))
    for (const id of z.tileIds) {
      if (where.has(id)) dup.push(`${id}:${where.get(id)}+${z.id}`);
      else where.set(id, z.id);
    }
  const total = Object.keys(st.tiles).length;
  return `배치 ${where.size}/${total} · 중복 ${dup.length ? dup.join(",") : "없음"}`;
}

const state: GameState = craft({
  hands: { p0: "234m678m678s23p33p9m", p1: "*", p2: "*", p3: "*" },
  discards: { p1: "4p5p", p2: "1z2z", p3: "3z4z" } as never,
  phase: "turn.act",
  turnSeat: 0,
  drawnLastFor: "p0",
} as never);

const g = setup(state, { p0: ["pond_snatch", "grave_rob"] });
const { flow } = startFlow2(g);
console.log("시작:", integrity(g.engine.state), "· 손", g.engine.state.zones[handZone("p0")]!.tileIds.length);
const snatch = turnOptions(g, "p0").filter((o) => o.type === "pond_snatch");
// 5p 를 줍는다 (오름패가 아닌 패)
const pick = snatch.find((o) => {
  const id = (o.payload as any).snatchId;
  const k = g.engine.state.tiles[id]!.kind;
  return k.suit === "pin" && k.rank === 5;
});
console.log("날치기 후보", snatch.length, "· 5p 후보", pick !== undefined);
if (pick !== undefined) {
  const st1 = flow.submit("p0", { type: "pond_snatch", payload: pick.payload } as never);
  console.log("날치기 후:", integrity(g.engine.state), "· 손", g.engine.state.zones[handZone("p0")]!.tileIds.length,
    "· lastDrawn", g.engine.state.round.lastDrawnTile, "· kind", st1.kind);
  const opts2 = turnOptions(g, "p0");
  const byType: Record<string, number> = {};
  for (const o of opts2) byType[o.type] = (byType[o.type] ?? 0) + 1;
  console.log("이어지는 후보:", JSON.stringify(byType));
  const rob = opts2.find((o) => o.type === "grave_rob");
  if (rob !== undefined) {
    const st2 = flow.submit("p0", { type: "grave_rob", payload: rob.payload } as never);
    console.log("도굴 후:", integrity(g.engine.state), "· kind", st2.kind);
    const rs = [...g.engine.eventLog].reverse().find((e) => e.type === "RoundSettled");
    console.log("정산:", JSON.stringify((rs?.payload as any)?.deltas));
  } else {
    console.log("도굴 후보 없음 (연쇄 불가)");
  }
}
