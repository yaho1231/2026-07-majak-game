/** snake_kan 문구 검증 — 4연속 깡의 채점 (run/triplet 양쪽 해석) */
import { YakuRegistry, evaluateWin, registerStandardYaku } from "@majak/core";
import type { DecomposeOptions, TileKind, WinContext, MeldInfo } from "@majak/core";
import { h } from "../../../packages/content/test/helpers.js";
import { buildVariants, allKinds } from "../../../packages/core/src/mahjong/scoring/WinContext.js";

const reg = new YakuRegistry();
registerStandardYaku(reg);

function mk(spec: string, melds: MeldInfo[], winning: string, opts: DecomposeOptions = {}, extra: Partial<WinContext> = {}): WinContext {
  return {
    hand: h(spec), melds, winningTile: h(winning)[0] as TileKind,
    winType: "tsumo", seatWind: 1, prevalentWind: 1, riichi: null,
    options: opts, winnerId: "p0", ...extra,
  } as WinContext;
}
function show(label: string, ctx: WinContext): void {
  const r = evaluateWin(ctx, reg);
  console.log(`  ${label}\n    -> ${r === null ? "NO WIN" : `[${r.yaku.map((y)=>`${y.id}:${y.han}`).join(" ")}] han=${r.han} fu=${r.fu} ym=${r.yakumanCount}`}`);
}
const kan = (spec: string): MeldInfo => ({ kind: "kan_closed", tiles: h(spec) });

console.log("=== 장사진: 또이또이/산안커/스안커 (detail: 넣을 수 있다)");
// 3456p 장사진 깡 + 111m 222m 333m + 99s  (concealed 11장)
show("kan3456p + 111m222m333m + 99s (+3m)", mk("111m222m333m99s", [kan("3456p")], "3m"));

console.log("\n=== 장사진: 일기통관 (detail: 넣을 수 있다)");
show("kan1234m + 456m789m111p + 99s (+1p)", mk("456m789m111p99s", [kan("1234m")], "1p"));

console.log("\n=== 장사진: 삼색동순 / 삼색동각");
show("kan3456m/3456p/3456s + 111z + 99s (삼색동순? 삼색동각?)",
  mk("111z99s", [kan("3456m"), kan("3456p"), kan("3456s")], "9s"));

console.log("\n=== 장사진: 산깡쯔·스깡쯔 카운트");
show("kan3456m/3456p/3456s + 111z + 99s → 산깡쯔?", mk("111z99s", [kan("3456m"), kan("3456p"), kan("3456s")], "9s"));
show("깡 4개 → 스깡쯔?", mk("99s", [kan("3456m"), kan("3456p"), kan("3456s"), kan("2345m")], "9s"));

console.log("\n=== ⚠ 4번째 패가 allKinds에서 사라지는가 (탕야오·찬타)");
const ctxT = mk("234p567p345s22s", [kan("6789m")], "2s");
show("kan6789m(9m 포함!) + 234p567p345s22s → 탕야오가 붙나?", ctxT);
for (const v of buildVariants(ctxT)) {
  console.log("    variant sets:", v.sets.map((s)=>`${s.type}${s.isKan?"(kan)":""}:${s.tiles.map(t=>`${t.rank}${t.suit[0]}`).join("")}`).join(" | "),
    "\n      allKinds:", allKinds(v).map(k=>`${k.rank}${k.suit[0]}`).join(","));
}
console.log("\n  (대조) 같은 손을 표준 슌쯔 678m + 9m으로는 탕야오가 붙을 수 없다");
show("789m + 234p567p345s22s (일반 슌쯔, 9m 있음)", mk("789m234p567p345s22s", [], "2s"));

console.log("\n=== ⚠ 청노두/찬타 계열도 같은 구멍인가");
const ctxJ = mk("111p999p111s99s", [kan("6789m")], "9s");
show("kan6789m + 111p999p111s + 99s → 청노두(chinroutou)?", ctxJ);

console.log("\n=== ⚠ 찬타/준찬타도 같은 구멍인가 (깡의 4장째가 요구패가 아닌데도)");
// 1234m 장사진 깡: 대표 3장은 1m2m3m — 몸통에 4m(중장패)이 실제로 눕혀져 있다
show("kan1234m + 123p 789s 111z + 99m (+9m)", mk("123p789s111z99m", [kan("1234m")], "9m"));
console.log("  (대조) 같은 손을 표준 123m 슌쯔 + 4m 여분으로는?");
show("123m4m + 123p789s111z99m 은 애초에 화료형이 아님 — 4m 없이 123m", mk("123m123p789s111z99m", [], "9m"));

console.log("\n=== ⚠ 준찬타(junchan) — 자패 없이");
show("kan1234m + 123p 789s 789p + 99m (+9m)", mk("123p789s789p99m", [kan("1234m")], "9m"));
