/** 09 — 안깡: 양극·결속 조합이 손 분해와 같은 4장 규칙을 보는가 */
import { createStandardGameFromState, handZone, installAugment, kindKey, kindOf, isWinningShape, scoringOptionsOf } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";
import { craft } from "../../../packages/content/test/helpers.js";
import { roundScopedKey } from "../../../packages/content/src/augments/roundScope.js";
const A = (id: string) => contentAugments.find((d) => d.id === id)!;

function scene(hand: string, ids: string[], decl: string[]) {
  let st: GameState = craft({ hands: { p0: hand, p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 0, drawnLastFor: "p0" });
  st = { ...st, players: st.players.map((p) => (p.id === "p0" ? { ...p, augments: ids } : p)) };
  st = { ...st, augmentData: { ...st.augmentData, ...Object.fromEntries(decl.map((d) => [roundScopedKey(d, "on", st, "p0"), true])) } };
  const g = createStandardGameFromState(st);
  for (const id of ids) installAugment(g.engine, A(id), "p0", { yaku: g.yaku });
  return g;
}

const cases: [string, string, string[], string[], (k: any) => boolean, string][] = [
  ["양극 1만1만9만9만", "1199m2345678p111s", ["polar_ends"], [], (k) => k.suit === "man" && (k.rank === 1 || k.rank === 9), "허용"],
  ["결속 1만1만1통1삭", "11m1p1s2345678p11s", ["mixed_triplet"], ["mixed_triplet"], (k) => k.rank === 1 && k.suit !== "wind", "허용"],
  ["양극+결속 1만9만1통9통", "19m19p2345678p111s", ["polar_ends", "mixed_triplet"], ["mixed_triplet"], (k) => (k.suit === "man" || k.suit === "pin") && (k.rank === 1 || k.rank === 9), "허용(오늘 열린 길)"],
  ["양극만 1만9만1통9통", "19m19p2345678p111s", ["polar_ends"], [], (k) => (k.suit === "man" || k.suit === "pin") && (k.rank === 1 || k.rank === 9), "거부"],
  ["결속만 1만9만1통9통", "19m19p2345678p111s", ["mixed_triplet"], ["mixed_triplet"], (k) => (k.suit === "man" || k.suit === "pin") && (k.rank === 1 || k.rank === 9), "거부"],
];
for (const [title, hand, ids, decl, pick, expect] of cases) {
  const g = scene(hand, ids, decl);
  const st = g.engine.state;
  const sel = (st.zones[handZone("p0")]?.tileIds ?? []).filter((t) => pick(kindOf(st, t))).slice(0, 4);
  const def = g.engine.actions.get("ankan")!;
  const r = def.validate({ player: "p0" as PlayerId, type: "ankan", payload: { tileIds: sel } } as never, { state: st, rules: g.engine.rules } as never);
  console.log(`  ${title.padEnd(24)} [${sel.map((t) => kindKey(kindOf(st, t))).join(",")}] → ${r === null ? "허용" : `거부(${r})`}   기대=${expect}`);
}
