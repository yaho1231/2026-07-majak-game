import { decompose, isWinningShape, scoringOptionsOf, handZone, kindOf, createStandardGameFromState, installAugment } from "@majak/core";
import type { DecomposeOptions, GameState } from "@majak/core";
import { contentAugments } from "@majak/content";
import { craft, h } from "../../../packages/content/test/helpers.js";

const byId = new Map(contentAugments.map((d) => [d.id, d]));

function optsFor(ids: string[], hand: string): DecomposeOptions {
  let st: GameState = craft({ hands: { p0: hand, p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 0, drawnLastFor: "p0" });
  st = { ...st, players: st.players.map((p) => (p.id === "p0" ? { ...p, augments: ids } : p)) };
  const game = createStandardGameFromState(st);
  for (const id of ids) installAugment(game.engine, byId.get(id)!, "p0", { yaku: game.yaku });
  return scoringOptionsOf(game.engine.state, game.engine.rules, "p0");
}

console.log("=== (c) 뒤섞인 아홉 개의 연꽃 ===");
const ng = "1m1p1s2m3p4s5m6p7s8m9p9s9m2p";
console.log("  hand 14 =", h(ng).length);
console.log("  opts(구련 보유) =", JSON.stringify(optsFor(["mixed_nine_gates"], ng)));
console.log("  isWinningShape(mixedAll) =", isWinningShape(h(ng), 0, { mixedRuns: true, mixedTriplets: true, mixedPairs: true }));
console.log("  isWinningShape(opts) =", isWinningShape(h(ng), 0, optsFor(["mixed_nine_gates"], ng)));
// 13장 상태의 opts (대기 중) — onNineGatesPath는 13/14 둘 다 본다
const ng13 = "1m1p1s2m3p4s5m6p7s8m9p9s9m";
console.log("  opts(13장) =", JSON.stringify(optsFor(["mixed_nine_gates"], ng13)));

console.log("\n=== (b) 진짜 용 × 탕야오 해방 (17장 정상 형) ===");
// 5멘쯔 + 머리, 전부 수패, 1·9 포함, polar 불필요
const td = "111m999m234p567p234s55s";
console.log("  hand =", h(td).length, "장");
console.log("  isWinningShape(totalSets=5) =", isWinningShape(h(td), 0, { totalSets: 5 }));

console.log("\n=== (a) 양극+결속 전용 손의 역 ===");
// 1만9통1삭 몸통 하나 — 결속 단독·양극 단독으로는 안 서는 손
const pt = "1m9p1s234m567m234p55p";
for (const o of [{}, { polarEnds: true }, { mixedTriplets: true }, { polarEnds: true, mixedTriplets: true }]) {
  console.log(`  ${JSON.stringify(o).padEnd(46)} shape=${isWinningShape(h(pt), 0, o)} decomp=${decompose(h(pt), 0, o).length}`);
}
console.log("  분해:", JSON.stringify(decompose(h(pt), 0, { polarEnds: true, mixedTriplets: true }).map(d => d.sets.map(s => s.tiles.map(t => `${t.rank}${t.suit[0]}`).join("")))));

console.log("\n=== (c2) measure 경로에서 구련이 왜 null인가 ===");
import { buildWinContext, evaluateWin } from "@majak/core";
{
  let st: GameState = craft({ hands: { p0: ng, p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 0, drawnLastFor: "p0" });
  st = { ...st, players: st.players.map((p) => (p.id === "p0" ? { ...p, augments: ["mixed_nine_gates"] } : p)) };
  const game = createStandardGameFromState(st);
  installAugment(game.engine, byId.get("mixed_nine_gates")!, "p0", { yaku: game.yaku });
  const s = game.engine.state;
  const ids = s.zones[handZone("p0")]!.tileIds;
  const kinds = ids.map((t) => kindOf(s, t));
  console.log("  손패 순서:", kinds.map(k => `${k.rank}${k.suit[0]}`).join(" "));
  const ctx = buildWinContext(s, "p0", "tsumo", ids[ids.length - 1]!, { rules: game.engine.rules });
  console.log("  ctx.hand len =", ctx.hand.length, " variants =", (ctx as any).variants?.length);
  const ev = evaluateWin(ctx, game.yaku);
  console.log("  evaluateWin =", ev === null ? "null" : JSON.stringify({ ok: ev.ok, yakuman: ev.yakumanCount, han: ev.han, yaku: ev.yaku.map(y => y.id) }));
}
