import { WALL, kindKey } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
const base = craft({ hands: { p0: "123m456m789m33p99s", p1: "33p111222333444s", p2: "*", p3: "*" }, phase: "turn.draw", turnSeat: 0 });
const wall = base.zones[WALL]!.tileIds;
console.log("wall len", wall.length);
const c: Record<string, number> = {};
for (const id of wall) { const k = kindKey(base.tiles[id]!.kind); c[k] = (c[k] ?? 0) + 1; }
console.log(JSON.stringify(c));
