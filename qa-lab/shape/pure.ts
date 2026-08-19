/** 순수 함수 수준 화료형 경계 검사 — decompose/waits 옵션을 직접 흔든다. */
import { winningKinds, shantenOf } from "@majak/core";
import type { DecomposeOptions, TileKind } from "@majak/core";
import { isWinningShape } from "../../packages/core/src/mahjong/scoring/decompose.js";
import { h } from "../../packages/content/test/helpers.js";

const fails: string[] = [];
function expect(label: string, actual: boolean, want: boolean): void {
  if (actual !== want) fails.push(`${label}: got ${actual}, want ${want}`);
  console.log(`${actual === want ? "ok  " : "FAIL"} ${label} = ${actual} (want ${want})`);
}
function shape(spec: string, opts: DecomposeOptions, melds = 0): boolean {
  return isWinningShape(h(spec), melds, opts);
}
function waits(spec: string, opts: DecomposeOptions, melds = 0): string {
  return winningKinds(h(spec), melds, undefined, opts)
    .map((k) => `${k.rank}${k.suit[0]}`).join(",");
}

console.log("=== async_chiitoi (chiitoiMixedPairs)");
const AC: DecomposeOptions = { chiitoiMixedPairs: true };
// 숫자만 같으면 쌍: 1m1p 2m2p 3m3p 4m4p 5m5p 6m6p 7m7p
expect("mixed 7 pairs", shape("1234567m1234567p", AC), true);
expect("mixed 7 pairs (표준 옵션에서는 불성립)", shape("1234567m1234567p", {}), false);
// 같은 패 4장은 2쌍으로 못 쓴다
expect("4장을 2쌍으로 (금지)", shape("1111m2222p3344s55m", AC), false);
expect("같은 패 3장 있으면 치또이 아님", shape("111m2233445566p7p", AC), false);
// 자패는 같은 종류 2장이어야
expect("자패 이종 쌍(동+백) 금지", shape("1122334455m1z5z66p", AC), false);
expect("자패 동종 쌍은 정상", shape("1122334455m11z66p", AC), true);
// 랭크 같지만 자패+수패
expect("수패1 + 풍패1 쌍 금지", shape("1m1z2233445566p77s", AC), false);

console.log("=== royal_kokushi (kokushiDupes=1)");
const RK: DecomposeOptions = { kokushiDupes: 1 };
// 표준 국사 13종 + 하나 = 정상
expect("표준 국사", shape("19m19p19s1234567z1z", {}), true);
// 12종 + 중복 2 (남(2z)이 빠지고 1z 3장? -> 중복은 2장까지?) 스펙: 빠진 종류 ≤ dupes
expect("12종 + 중복 (2z 빠짐, 1z 2장, 9s 2장)", shape("19m19p199s1134567z", RK), true);
expect("12종 + 중복 (표준 옵션에선 불성립)", shape("19m19p199s1134567z", {}), false);
expect("11종 (2종 빠짐) 은 불성립", shape("19m19p1999s1145677z", RK), false);
expect("요구패 아닌 패가 섞이면 불성립", shape("19m19p19s123456z55m", RK), false);

console.log("=== polar_ends");
const PE: DecomposeOptions = { polarEnds: true };
expect("199m 커쯔", shape("199m199p199s111z99m", PE), true);
expect("199m 커쯔 (표준 불성립)", shape("199m199p199s111z99m", {}), false);
expect("머리는 1·9 혼합 불가", shape("111m111p111s999m19m", PE), false);
expect("무늬 다른 1·9 혼합 커쯔 금지(1m9p9s)", shape("1m9p9s111z222z333z44m", PE), false);

console.log("=== broken_wall (wrapRuns)");
const BW: DecomposeOptions = { wrapRuns: true };
expect("891m 슌쯔", shape("891m891p891s111z99m", BW), true);
expect("891m (표준 불성립)", shape("891m891p891s111z99m", {}), false);
expect("912m 슌쯔", shape("912m912p912s111z99m", BW), true);

console.log("=== wind_lineage (honorRuns)");
const WL: DecomposeOptions = { honorRuns: true };
expect("동남서 + 남서북 + 백발중", shape("123z234z567z123m11p", WL), true);
expect("(표준 불성립)", shape("123z234z567z123m11p", {}), false);
expect("북+백 넘김 금지 (4z5z6z)", shape("456z123m456m789m11p", WL), false);
expect("발중+동 금지 (6z7z1z)", shape("671z123m456m789m11p", WL), false);

console.log("=== broken_border (mixedRuns) / mixed_triplet (mixedTriplets)");
const BB: DecomposeOptions = { mixedRuns: true };
const MT: DecomposeOptions = { mixedTriplets: true };
expect("2m3p4s 슌쯔", shape("2m3p4s123m456p789s11z", BB), true);
expect("mixedRuns로 혼색 커쯔는 안 됨", shape("2m2p2s123m456p789s11z", BB), false);
expect("mixedTriplets 혼색 커쯔", shape("2m2p2s123m456p789s11z", MT), true);
expect("mixedTriplets로 혼색 슌쯔는 안 됨", shape("2m3p4s123m456p789s11z", MT), false);

console.log("=== joker (wildKinds = 백 5z)");
const HAKU: TileKind = { suit: "dragon", rank: 1 };
const JK: DecomposeOptions = { wildKinds: [HAKU] };
expect("백 1장이 빈자리 메움", shape("123m456p789s11z23s5z", JK), true);
console.log("  joker 대기:", waits("123m456p789s11z2s5z", JK));
console.log("  joker 없는 대기:", waits("123m456p789s11z2s5z", {}));
console.log("  4멘쯔+백 대기수:", winningKinds(h("123m456p789s123s5z"), 0, undefined, JK).length);

console.log("=== true_dragon (totalSets=5)");
const TD: DecomposeOptions = { totalSets: 5 };
expect("5멘쯔+머리 17장", shape("123m456m789m123p456p11s", TD), true);
expect("4멘쯔+머리(14장)는 5멘쯔 룰에서 불성립", shape("123m456m789m123p11s", TD), false);

console.log("=== 조합");
expect("async_chiitoi + polar_ends 동시 (치또이 우선)", shape("1234567m1234567p", { chiitoiMixedPairs: true, polarEnds: true }), true);
expect("mixedRuns + wrapRuns: 9m1p2s", shape("9m1p2s123m456p789s11z", { mixedRuns: true, wrapRuns: true }), true);
expect("honorRuns + mixedRuns: 자패 슌쯔에 무늬 혼합 금지 (1z1z2z? )", shape("1z2z3z 123m456p789s11p".replace(/ /g, ""), { honorRuns: true, mixedRuns: true }), true);
// 바람+삼원 혼합 슌쯔가 mixedRuns로 열리면 안 된다
expect("바람3z + 삼원5z 혼합 슌쯔 금지", shape("345z123m456p789s11p".replace("345z", "3z4z5z"), { honorRuns: true, mixedRuns: true }), false);

console.log("\n샹텐 sanity:");
for (const [n, o] of [["std", {}], ["polar", PE], ["wrap", BW], ["honor", WL], ["joker", JK], ["td5", TD]] as [string, DecomposeOptions][]) {
  console.log(`  ${n}: shanten(19m19p19s1234567z) =`, shantenOf(h("19m19p19s1234567z"), 0, o));
}

console.log(`\nFAILS=${fails.length}`);
for (const f of fails) console.log("  ", f);
