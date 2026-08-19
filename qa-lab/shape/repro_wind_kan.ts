/**
 * 확정 재현 — wind_lineage(바람의 계보) 동남서북 안깡은 **북(北)이 자풍/장풍인 사람에게
 * 계보 역패가 붙지 않는다.**
 *
 * detail: "바람 슌쯔 안의 자풍·장풍은 커쯔 역패와 똑같이 각각 1판이 붙고".
 * 그런데 동남서북 깡의 채점 대표 3장(WinContext.meldToSet → runQuadRepr)은 **동·남·서**라
 * 북이 통째로 빠진다. wind_lineage의 windRunHas(variant, rank)는 그 대표 3장만 보므로
 * 북가(자풍=4)·북장은 같은 깡을 해도 1판을 못 받는다 — 동/남/서 자리는 받는다.
 */
import { buildVariants, isHonorRun, Suits } from "@majak/core";
import type { DecomposeOptions, ScoringVariant, TileKind, WinContext } from "@majak/core";
import { h } from "../../packages/content/test/helpers.js";

/** wind_lineage.ts의 windRunHas 사본 */
function windRunHas(variant: ScoringVariant, rank: number): boolean {
  return variant.sets.some(
    (s) => s.type === "run" && isHonorRun(s.tiles) &&
      s.tiles.every((t) => t.suit === Suits.Wind) && s.tiles.some((t) => t.rank === rank),
  );
}

const opts: DecomposeOptions = { honorRuns: true };
const ctx = {
  hand: h("123m456p789s11p"), winningTile: h("1p")[0] as TileKind, winType: "tsumo",
  melds: [{ kind: "kan_closed", tiles: h("1234z"), concealed: true }],
  seatWind: 1, prevalentWind: 1, riichi: null, options: opts, winnerId: "p0",
} as unknown as WinContext;

const v = buildVariants(ctx)[0] as ScoringVariant;
console.log("동남서북 안깡의 채점 대표 몸통:",
  v.sets.map((s) => `${s.type}(${s.tiles.map((t) => `${t.rank}${t.suit[0]}`).join("")})`).join(" "));
for (const [name, rank] of [["동", 1], ["남", 2], ["서", 3], ["북", 4]] as [string, number][]) {
  console.log(`  자풍/장풍이 ${name}(rank=${rank}) 일 때 계보 역패 성립: ${windRunHas(v, rank)}`);
}
console.log("\n기대: 깡에 네 바람이 다 들어 있으므로 넷 다 true. 실제: 북만 false.");

console.log("\n(참고) 손 안의 남서북 슌쯔는 정상적으로 북을 센다:");
const ctx2 = {
  hand: h("234z123m456p789s11p"), winningTile: h("1p")[0] as TileKind, winType: "tsumo",
  melds: [], seatWind: 4, prevalentWind: 1, riichi: null, options: opts, winnerId: "p0",
} as unknown as WinContext;
const v2 = buildVariants(ctx2)[0] as ScoringVariant;
console.log("  남서북 슌쯔:", v2.sets.map((s) => s.tiles.map((t) => `${t.rank}${t.suit[0]}`).join("")).join(" "),
  "→ 북 성립:", windRunHas(v2, 4));
