/**
 * 뒤섞인 아홉 개의 연꽃(mixed_nine_gates)의 **후로 차단**이 다른 모양 증강을 어떻게 먹는가.
 *
 * 연꽃은 손이 구련 뼈대(±1장) 위에 있는 동안 보유자의 call.pon/chi/kan 을 통째로 닫는다.
 * 기대(미리 적음): 무너진 국경(치)·바람의 계보(치·안깡)를 함께 든 사람은, 손이 우연히
 * 그 뼈대 모양이 되는 순간 **동색 치까지 포함해 후로 능력을 전부 잃는다**.
 * 연꽃 카드는 "그 뼈대가 선 동안에는 치·퐁·깡 버튼이 뜨지 않는다"고 적었지만,
 * 국경/계보 카드는 "치 전부에 적용된다"고 적었다 — 어느 쪽이 이기는가를 잰다.
 */
import { createStandardGameFromState, handZone, installAugment, kindKey, kindOf } from "@majak/core";
import type { AugmentDef, GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { mixedNineGates } from "../../../packages/content/src/augments/mixed_nine_gates.js";
import { brokenBorder } from "../../../packages/content/src/augments/broken_border.js";
import { brokenWall } from "../../../packages/content/src/augments/broken_wall.js";

function scene(hand: string, discard: string, augs: AugmentDef[]) {
  let st: GameState = craft({
    hands: { p0: hand, p1: "*", p2: "*", p3: "*" },
    phase: "reaction", turnSeat: 3, lastDiscard: { player: "p3", spec: discard },
  });
  st = { ...st, players: st.players.map((p) => (p.id === "p0" ? { ...p, augments: augs.map((a) => a.id) } : p)) };
  const g = createStandardGameFromState(st);
  for (const a of augs) installAugment(g.engine, a, "p0", { yaku: g.yaku });
  return g;
}
function ids(g: ReturnType<typeof scene>, keys: string[]): TileId[] {
  const pool = [...(g.engine.state.zones[handZone("p0")]?.tileIds ?? [])];
  return keys.map((k) => {
    const i = pool.findIndex((t) => kindKey(kindOf(g.engine.state, t)) === k);
    if (i < 0) throw new Error(`없다 ${k}`);
    const id = pool[i]!; pool.splice(i, 1); return id;
  });
}
function check(hand: string, discard: string, type: "chi" | "pon", keys: string[], augs: AugmentDef[]): string {
  const g = scene(hand, discard, augs);
  const def = g.engine.actions.get(type)!;
  return def.validate(
    { player: "p0" as PlayerId, type, payload: { tileIds: ids(g, keys) } } as never,
    { state: g.engine.state, rules: g.engine.rules } as never,
  ) ?? "**허용됨**";
}

// 뼈대(랭크 1112345678999) 13장 — 무늬는 흩어져 있다
const SKELETON = "11m1p2s3m4p5s6m7p8s9m9p9s";
// 뼈대가 아닌 평범한 13장 (같은 재료를 갖고 있다)
const PLAIN = "11m1p2s3m4p5s6m7p8s9m9p2p";

const sets: [string, AugmentDef[]][] = [
  ["국경만", [brokenBorder]],
  ["연꽃만", [mixedNineGates]],
  ["국경+연꽃", [brokenBorder, mixedNineGates]],
  ["윤회+연꽃", [brokenWall, mixedNineGates]],
];
console.log("### 4s 버림 — 손패 3m·4p(혼색 치 재료) / 뼈대 위 vs 아닌 손");
for (const [n, augs] of sets) {
  console.log(`  ${n.padEnd(10)} 뼈대   혼색치(3m,5s→4p?) = ${check(SKELETON, "2s", "chi", ["man3", "pin4"], augs)}`);
  console.log(`  ${"".padEnd(10)} 뼈대   동색치(8s,9s→7s)  = ${check(SKELETON, "7s", "chi", ["sou8", "sou9"], augs)}`);
  console.log(`  ${"".padEnd(10)} 평범   혼색치            = ${check(PLAIN, "2s", "chi", ["man3", "pin4"], augs)}`);
  console.log(`  ${"".padEnd(10)} 뼈대   퐁(1m,1p→1s)     = ${check(SKELETON, "1s", "pon", ["man1", "pin1"], augs)}`);
}
