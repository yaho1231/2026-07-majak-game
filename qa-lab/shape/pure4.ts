/** 4차 — 자패 슌쯔 × 순환, 동남서북 깡의 역 판정 */
import { YakuRegistry, buildVariants, evaluateWin, registerStandardYaku, isHonorRun } from "@majak/core";
import type { DecomposeOptions, TileKind, WinContext } from "@majak/core";
import { isWinningShape } from "../../packages/core/src/mahjong/scoring/decompose.js";
import { h } from "../../packages/content/test/helpers.js";

const reg = new YakuRegistry();
registerStandardYaku(reg);

console.log("=== honorRuns × wrapRuns: 자패가 순환하면 안 된다 (북→동, 중→백)");
const WLW: DecomposeOptions = { honorRuns: true, wrapRuns: true };
for (const spec of ["412z123m456p789s11p", "341z123m456p789s11p", "671z123m456p789s11p", "712z123m456p789s11p"]) {
  console.log(`  ${spec}: honor=${isWinningShape(h(spec), 0, { honorRuns: true })} honor+wrap=${isWinningShape(h(spec), 0, WLW)}`);
}
console.log("  isHonorRun 직접:", ["412z", "341z", "671z", "123z", "234z", "567z"].map((s) => `${s}=${isHonorRun(h(s))}`).join(" "));

console.log("\n=== 동남서북 안깡의 역 판정 (대사희/소사희/역패 헛성립?)");
function evMeld(spec: string, win: string, meldSpec: string, opts: DecomposeOptions): void {
  const ctx = {
    hand: h(spec), winningTile: h(win)[0] as TileKind, winType: "tsumo",
    melds: [{ kind: "kan_closed", tiles: h(meldSpec), concealed: true }],
    seatWind: 1, prevalentWind: 1, riichi: null, options: opts, winnerId: "p0",
  } as unknown as WinContext;
  const vs = buildVariants(ctx);
  const r = evaluateWin(ctx, reg);
  console.log(`  손=${spec}+${win} 깡=${meldSpec}`);
  for (const v of vs.slice(0, 4)) {
    console.log(`     ${v.sets.map((s) => `${s.type[0]}(${s.tiles.map((t) => `${t.rank}${t.suit[0]}`).join("")})`).join(" ")}`);
  }
  console.log(`     => ${r === null ? "NO WIN" : `[${r.yaku.map((y) => `${y.id}:${y.han}`).join(" ")}] ym=${r.yakumanCount} fu=${r.fu}`}`);
}
evMeld("123m456p789s11p", "1p", "1234z", { honorRuns: true });
evMeld("123m456p789s11p", "1p", "1111z", {});
evMeld("123m456p789s11p", "1p", "5555z", {});

console.log("\n=== wind_lineage: 바람 슌쯔 두 벌이 사희(대사희)를 흉내내나");
const WL: DecomposeOptions = { honorRuns: true };
for (const spec of ["123z234z123m456p11p", "1234z1234z11p123m".replace("1234z1234z", "123z234z"), "111z222z333z444z11p"]) {
  const ctx = {
    hand: h(spec), winningTile: h("1p")[0] as TileKind, winType: "tsumo", melds: [],
    seatWind: 1, prevalentWind: 1, riichi: null, options: WL, winnerId: "p0",
  } as unknown as WinContext;
  const r = evaluateWin(ctx, reg);
  console.log(`  ${spec}(${h(spec).length}) -> ${r === null ? "NO WIN" : `[${r.yaku.map((y) => y.id).join(" ")}] ym=${r.yakumanCount}`}`);
}
