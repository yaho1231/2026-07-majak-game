/**
 * 08 — 후로(퐁·치·깡) 판정이 형 완화 조합을 손패 분해와 «같게» 보는가.
 * 손에서는 되는데 울 수는 없는(혹은 그 반대) 반쪽이 있으면 결함이다.
 */
import {
  createStandardGameFromState,
  handZone,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { AugmentDef, GameState, PlayerId, TileId } from "@majak/core";
import { contentAugments } from "@majak/content";
import { craft, h } from "../../../packages/content/test/helpers.js";
import { roundScopedKey } from "../../../packages/content/src/augments/roundScope.js";

const A = (id: string): AugmentDef => contentAugments.find((d) => d.id === id)!;

function scene(hand: string, discard: string, ids: string[], declare: string[] = []) {
  let st: GameState = craft({
    hands: { p0: hand, p1: "*", p2: "*", p3: "*" },
    phase: "reaction",
    turnSeat: 3,
    lastDiscard: { player: "p3", spec: discard },
  });
  st = { ...st, players: st.players.map((p) => (p.id === "p0" ? { ...p, augments: ids } : p)) };
  st = {
    ...st,
    augmentData: {
      ...st.augmentData,
      ...Object.fromEntries(declare.map((d) => [roundScopedKey(d, "on", st, "p0"), true])),
    },
  };
  const game = createStandardGameFromState(st);
  for (const id of ids) installAugment(game.engine, A(id), "p0", { yaku: game.yaku });
  return game;
}

type G = ReturnType<typeof scene>;
const tile = (g: G, key: string): TileId => {
  const ids = g.engine.state.zones[handZone("p0")]?.tileIds ?? [];
  const id = ids.find((t) => kindKey(kindOf(g.engine.state, t)) === key);
  if (id === undefined) throw new Error(`손에 없다: ${key}`);
  return id;
};
const K = (s: string) => kindKey(h(s)[0]!);

function check(g: G, type: string, keys: string[]): string {
  const def = g.engine.actions.get(type);
  if (def === undefined) return "액션없음";
  const r = def.validate(
    { player: "p0" as PlayerId, type, payload: { tileIds: keys.map((k) => tile(g, K(k))) } } as never,
    { state: g.engine.state, rules: g.engine.rules } as never,
  );
  return r === null ? "허용" : `거부(${r})`;
}
/** FlowController가 실제로 그 후로를 «후보로» 내놓는가 */
function offered(g: G, type: string): boolean {
  const fc: any = (g as any).flow ?? null;
  return fc === null ? false : true;
}

console.log("=== 08 후로 판정 × 형 완화 조합 ===\n");

const cases: [string, string, string, string[], string[], string[], string][] = [
  // 제목, 손패, 버림패, 증강, 선언, 퐁에 쓸 손패 2장, 기대
  ["양극 단독 · 같은 무늬 1·9 퐁", "99m123456789p11s", "1m", ["polar_ends"], [], ["9m", "9m"], "허용"],
  ["결속 단독 · 랭크만 같은 퐁", "9p9s123456789p1s", "9m", ["mixed_triplet"], ["mixed_triplet"], ["9p", "9s"], "허용"],
  ["양극만 · 무늬 다른 1·9 퐁", "9p1s123456789p1m", "1m", ["polar_ends"], [], ["9p", "1s"], "거부"],
  ["결속만 · 무늬 다른 1·9 퐁", "9p1s123456789p1m", "1m", ["mixed_triplet"], ["mixed_triplet"], ["9p", "1s"], "거부"],
  ["양극+결속 · 무늬 다른 1·9 퐁", "9p1s123456789p1m", "1m", ["polar_ends", "mixed_triplet"], ["mixed_triplet"], ["9p", "1s"], "허용"],
  ["양극+결속 · 잡종(1만9만2통) 퐁", "9m2p123456789p1s", "1m", ["polar_ends", "mixed_triplet"], ["mixed_triplet"], ["9m", "2p"], "거부"],
];
for (const [title, hand, disc, ids, decl, keys, expect] of cases) {
  const g = scene(hand, disc, ids, decl);
  const got = check(g, "pon", keys);
  const mark = got.startsWith(expect) ? "" : "   <<< 기대와 다름";
  console.log(`  ${title.padEnd(34)} → ${got.padEnd(40)} 기대=${expect}${mark}`);
}

console.log("\n-- 치(chi) --");
const chis: [string, string, string, string[], string[], string[], string][] = [
  ["국경 단독 · 2만3통4삭 치", "3p4s123456789p11s", "2m", ["broken_border"], ["broken_border"], ["3p", "4s"], "허용"],
  ["윤회 단독 · 8만9만1만 치", "9m1m123456789p11s", "8m", ["broken_wall"], [], ["9m", "1m"], "허용"],
  ["국경+윤회 · 8만9통1삭 치", "9p1s123456789p11s", "8m", ["broken_border", "broken_wall"], ["broken_border"], ["9p", "1s"], "?"],
  ["계보 단독 · 동남서 치", "2z3z123456789p11s", "1z", ["wind_lineage"], [], ["2z", "3z"], "허용"],
  ["계보+윤회 · 북동남 치", "1z2z123456789p11s", "4z", ["wind_lineage", "broken_wall"], [], ["1z", "2z"], "?"],
];
for (const [title, hand, disc, ids, decl, keys, expect] of chis) {
  const g = scene(hand, disc, ids, decl);
  const got = check(g, "chi", keys);
  console.log(`  ${title.padEnd(34)} → ${got.padEnd(46)} 기대=${expect}`);
}

console.log("\n-- 안깡(ankan) --");
const kans: [string, string, string[], string[], string[], string][] = [
  ["양극 · 1만1만9만9만 안깡", "1199m123456789p1s", ["polar_ends"], [], ["1m"], "허용"],
  ["결속 · 1만1통1삭1만 안깡", "11m1p1s123456789p", ["mixed_triplet"], ["mixed_triplet"], ["1m"], "허용"],
  ["양극+결속 · 1만9만1통9통 안깡", "19m19p123456789s0", ["polar_ends", "mixed_triplet"], ["mixed_triplet"], ["1m"], "?"],
];
for (const [title, hand, ids, decl, keys, expect] of kans) {
  try {
    const g = scene(hand.replace("0", ""), "5z", ids, decl);
    const def = g.engine.actions.get("ankan");
    const st = g.engine.state;
    const all = (st.zones[handZone("p0")]?.tileIds ?? []);
    const r = def === undefined ? "없음" : String(def.validate(
      { player: "p0" as PlayerId, type: "ankan", payload: { tileIds: all.filter((t) => {
        const k = kindOf(st, t);
        return (k.suit === "man" || k.suit === "pin") && (k.rank === 1 || k.rank === 9);
      }).slice(0, 4) } } as never,
      { state: st, rules: g.engine.rules } as never,
    ) ?? "허용");
    console.log(`  ${title.padEnd(34)} → ${r.padEnd(46)} 기대=${expect}`);
  } catch (e) {
    console.log(`  ${title.padEnd(34)} → 오류 ${(e as Error).message}`);
  }
}
