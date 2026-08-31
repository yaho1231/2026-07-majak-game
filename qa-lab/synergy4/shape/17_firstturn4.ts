/** 17 — «국의 첫 순에만» 카드 4종(결속·국경·비대칭·단색세계)을 한 순에 다 켤 수 있는가 */
import { createStandardGameFromState, installAugment, scoringOptionsOf, handZone, kindOf, kindKey } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";
import { craft } from "../../../packages/content/test/helpers.js";
const A = (id: string) => contentAugments.find((d) => d.id === id)!;

const ids = ["mixed_triplet", "broken_border", "async_chiitoi", "suit_unify"];
let st: GameState = craft({ hands: { p0: "123m456p789s1122z", p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 0, drawnLastFor: "p0" });
st = { ...st, players: st.players.map((p) => (p.id === "p0" ? { ...p, augments: ids } : p)) };
const g = createStandardGameFromState(st);
for (const id of ids) installAugment(g.engine, A(id), "p0", { yaku: g.yaku });

const acts: [string, any][] = [
  ["declare_mixed_triplet", {}],
  ["declare_broken_border", {}],
  ["declare_async_chiitoi", {}],
  ["mono_world", { suit: "man" }],
];
for (const [t, pl] of acts) {
  const r = g.engine.submit({ player: "p0" as PlayerId, type: t, payload: pl } as never) as any;
  console.log(`  ${t.padEnd(24)} ${r.ok ? "OK" : `거부(${r.reason})`}`);
}
const s2 = g.engine.state;
console.log("  scoringOptions:", JSON.stringify(scoringOptionsOf(s2, g.engine.rules, "p0")));
console.log("  손:", (s2.zones[handZone("p0")]?.tileIds ?? []).map((t) => kindKey(kindOf(s2, t))).join(" "));
console.log("  discardCount:", s2.round.byPlayer["p0"]?.discardCount);
