/** 양극×결속 잡종 펑의 후속 — 정상 케이스 대조 + 그 몸통이 역에 어떻게 세어지는가 */
import {
  createStandardGameFromState, buildWinContext, evaluateWin, handZone,
  installAugment, kindKey, kindOf, winShapeOf,
} from "@majak/core";
import type { AugmentDef, GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { polarEnds } from "../../../packages/content/src/augments/polar_ends.js";
import { mixedTriplet } from "../../../packages/content/src/augments/mixed_triplet.js";

function scene(hand: string, discard: string, augs: AugmentDef[]) {
  let st: GameState = craft({
    hands: { p0: hand, p1: "*", p2: "*", p3: "*" },
    phase: "reaction", turnSeat: 3, lastDiscard: { player: "p3", spec: discard },
  });
  st = { ...st, players: st.players.map((p) => (p.id === "p0" ? { ...p, augments: augs.map((a) => a.id) } : p)) };
  const game = createStandardGameFromState(st);
  for (const a of augs) installAugment(game.engine, a, "p0", { yaku: game.yaku });
  return game;
}
function ponIds(g: ReturnType<typeof scene>, keys: string[]): TileId[] {
  const ids = [...(g.engine.state.zones[handZone("p0")]?.tileIds ?? [])];
  const out: TileId[] = [];
  for (const k of keys) {
    const i = ids.findIndex((t) => kindKey(kindOf(g.engine.state, t)) === k);
    if (i < 0) throw new Error(`없다 ${k}`);
    out.push(ids[i]!); ids.splice(i, 1);
  }
  return out;
}
function ponCheck(hand: string, discard: string, keys: string[], augs: AugmentDef[]): string {
  const g = scene(hand, discard, augs);
  const def = g.engine.actions.get("pon")!;
  return def.validate(
    { player: "p0" as PlayerId, type: "pon", payload: { tileIds: ponIds(g, keys) } } as never,
    { state: g.engine.state, rules: g.engine.rules } as never,
  ) ?? "**허용됨**";
}

const A = { 없음: [], 양극: [polarEnds], 결속: [mixedTriplet], "양극+결속": [polarEnds, mixedTriplet] } as Record<string, AugmentDef[]>;
console.log("### 펑 validate (버림 1m)");
for (const [n, augs] of Object.entries(A)) {
  console.log(`  ${n.padEnd(9)} 9m·9m(양극 정상) = ${ponCheck("99m234m567m99p11s2s", "1m", ["man9","man9"], augs)}`);
  console.log(`  ${"".padEnd(9)} 1p·1s(결속 정상) = ${ponCheck("1p1s234m567m99p11s2s", "1m", ["pin1","sou1"], augs)}`);
  console.log(`  ${"".padEnd(9)} 9m·1p(잡종)     = ${ponCheck("9m1p234m567m99p11s2s", "1m", ["man9","pin1"], augs)}`);
  console.log(`  ${"".padEnd(9)} 9m·1s(잡종2)    = ${ponCheck("9m1s234m567m99p11s2s", "1m", ["man9","sou1"], augs)}`);
}

console.log("\n### 잡종 펑 {1m,9m,1p} 을 들고 역패로 화료 — 몸통이 어떻게 세어지나");
for (const [n, augs] of Object.entries(A)) {
  let st: GameState = craft({
    hands: { p0: "234m567m99p" },
    melds: { p0: [{ kind: "pon", spec: "1m9m1p", from: "p3" }, { kind: "pon", spec: "777z", from: "p3" }] },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  } as never);
  st = { ...st, players: st.players.map((p) => (p.id === "p0" ? { ...p, augments: augs.map((a) => a.id) } : p)) };
  const game = createStandardGameFromState(st);
  for (const a of augs) installAugment(game.engine, a, "p0", { yaku: game.yaku });
  const ids = game.engine.state.zones[handZone("p0")]?.tileIds ?? [];
  const ctx = buildWinContext(game.engine.state, "p0", "tsumo", ids[ids.length - 1] as TileId, { rules: game.engine.rules });
  const ev = evaluateWin(ctx, game.yaku);
  console.log(`  ${n.padEnd(9)} ${ev === null ? "화료형 아님" : `han=${ev.han} fu=${ev.fu} :: ${ev.yaku.map((y) => `${y.id}(${y.han})`).join(" ")} | shape=${JSON.stringify(ev.shape?.groups?.map((g:any)=>g.type+":"+g.tiles.map(kindKey).join("")))}`}`);
}

console.log("\n### 대조 — 정상 양극 펑 {1m,9m,9m} 을 들고 같은 손");
for (const [n, augs] of Object.entries(A)) {
  let st: GameState = craft({
    hands: { p0: "234m567m99p" },
    melds: { p0: [{ kind: "pon", spec: "1m9m9m", from: "p3" }, { kind: "pon", spec: "777z", from: "p3" }] },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  } as never);
  st = { ...st, players: st.players.map((p) => (p.id === "p0" ? { ...p, augments: augs.map((a) => a.id) } : p)) };
  const game = createStandardGameFromState(st);
  for (const a of augs) installAugment(game.engine, a, "p0", { yaku: game.yaku });
  const ids = game.engine.state.zones[handZone("p0")]?.tileIds ?? [];
  const ctx = buildWinContext(game.engine.state, "p0", "tsumo", ids[ids.length - 1] as TileId, { rules: game.engine.rules });
  const ev = evaluateWin(ctx, game.yaku);
  console.log(`  ${n.padEnd(9)} ${ev === null ? "화료형 아님" : `han=${ev.han} fu=${ev.fu} :: ${ev.yaku.map((y) => `${y.id}(${y.han})`).join(" ")}`}`);
}
