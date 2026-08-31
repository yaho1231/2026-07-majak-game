/**
 * T5 — 가려진 도라(p0) × 왕패의 주인(p1)의 «자리표» 정합성.
 *
 * 예측: p1은 표시패 자리를 자리표(뒷면)로 본다. 그 자리(index 4)를 지목해 교환하면
 * ① 실제로 교환되는 것은 그 자리의 **진짜 표시패**이고
 * ② round.doraIndicators가 p1이 내보낸 손패로 갈아 끼워지며
 * ③ 왕패 장수는 14로 보존되고
 * ④ 교환 후에도 p1에게는 그 자리가 여전히 가려진다(새 표시패도 표시패다).
 *
 * 대조군: 은폐가 없을 때 같은 교환.
 */
import {
  DEAD_WALL,
  act,
  base,
  build,
  handZone,
  head,
  kindKey,
  kindOf,
  line,
  ok,
  view,
  zoneKinds,
} from "./lib.js";

function run(label: string, spec: Record<string, readonly string[]>): void {
  head(label);
  const st = base({ turnSeat: 1, drawnLastFor: "p1" });
  const g = build(st, spec);
  const before = g.engine.state;
  const indBefore = before.round.doraIndicators[0]!;
  const dwBefore = before.zones[DEAD_WALL]!.tileIds;
  const handTileId = before.zones[handZone("p1")]!.tileIds[0]!;
  line(`  교환 전: 표시패 = ${kindKey(kindOf(before, indBefore))} (왕패 index ${dwBefore.indexOf(indBefore)})`);
  line(`  p1이 보는 왕패 = ${JSON.stringify(zoneKinds(view(g, "p1"), DEAD_WALL))}`);
  const err = act(g, "p1", "dw_swap", { handTileId, deadIndex: 4 });
  line(`  dw_swap(index 4) → ${err ?? "ok"}`);
  const after = g.engine.state;
  const dwAfter = after.zones[DEAD_WALL]!.tileIds;
  line(`  교환 후: 표시패 = ${kindKey(kindOf(after, after.round.doraIndicators[0]!))}`);
  line(`  왕패 장수 = ${dwAfter.length}, index4 = ${kindKey(kindOf(after, dwAfter[4]!))}`);
  ok(dwAfter.length === 14, "왕패 장수 보존");
  ok(after.round.doraIndicators[0] === handTileId, "도라 표시패가 내보낸 손패로 갈아 끼워졌다");
  ok(dwAfter[4] === handTileId, "왕패 index4 = 내보낸 손패");
  ok(after.zones[handZone("p1")]!.tileIds.includes(indBefore), "옛 표시패가 p1 손으로 들어왔다");
  const v1 = view(g, "p1");
  line(`  교환 후 p1이 보는 왕패 = ${JSON.stringify(zoneKinds(v1, DEAD_WALL))}`);
  line(`  교환 후 p1 doraIndicators = ${JSON.stringify(v1.round.doraIndicators.map((i) => (v1.tiles[i] === undefined ? "?" : kindKey(v1.tiles[i]!.kind))))}`);
}

run("A) 대조군 — 은폐 없음, p1이 왕패의 주인", { p1: ["dead_wall_master"] });
run("B) p0 가려진 도라 + p1 왕패의 주인", { p0: ["dora_conceal"], p1: ["dead_wall_master"] });
