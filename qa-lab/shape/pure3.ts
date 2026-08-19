/** 3차 — polar_ends 머리 / joker 국사 / shantenOf(wildKinds) 최소 재현 */
import { shantenOf, winningKinds } from "@majak/core";
import type { DecomposeOptions, TileKind } from "@majak/core";
import { isWinningShape } from "../../packages/core/src/mahjong/scoring/decompose.js";
import { h } from "../../packages/content/test/helpers.js";

const HAKU: TileKind = { suit: "dragon", rank: 1 };
const JK: DecomposeOptions = { wildKinds: [HAKU] };
const PE: DecomposeOptions = { polarEnds: true };

console.log("=== A) polar_ends: 1·9 혼합 머리(작두)가 성립하는가");
// 222m333m444m555m + 1m9m : 남는 두 장이 1m·9m뿐이라 머리는 1m9m 말고 없다
for (const spec of ["222m333m444m555m19m", "222m333m444m555m11m", "234m345m456m567m19m"]) {
  console.log(`  ${spec}: std=${isWinningShape(h(spec), 0, {})} polar=${isWinningShape(h(spec), 0, PE)}`);
}
console.log("  대기: 222m333m444m555m1m ->", winningKinds(h("222m333m444m555m1m"), 0, undefined, PE).map((k) => `${k.rank}${k.suit[0]}`).join(","));

console.log("\n=== B) joker: 국사 형태에 조커가 적용되는가 (14장)");
// 19m19p19s + 동남서북 + 백·발 + 백 2장 = 중(3d)이 빠졌고 백이 3장
const kok = "19m19p19s1234z56z55z";
console.log(`  ${kok} (${h(kok).length}장): std=${isWinningShape(h(kok), 0, {})} joker=${isWinningShape(h(kok), 0, JK)}`);
const kok2 = "19m19p19s1234z567z5z"; // 13종 + 백 1장 더 = 표준 국사
console.log(`  ${kok2} (${h(kok2).length}장): std=${isWinningShape(h(kok2), 0, {})} joker=${isWinningShape(h(kok2), 0, JK)}`);

console.log("\n=== C) shantenOf(wildKinds) 최소 재현");
const rows: [string, number][] = [];
for (const spec of [
  "19m19p19s1234567z",     // 국사 텐파이 (백 포함) — 진짜 0
  "19m19p19s123456z1m",    // 백 없는 국사 텐파이 — 진짜 0
  "123m456p789s11z55z",    // 13장, 진짜 텐파이(0)
  "123m456p789s112z5z",    // 13장, 백 1장
  "5z5z5z5z123m456p789s",  // 백 4장 + 3멘쯔
]) {
  const hand = h(spec);
  const base = shantenOf(hand, 0, {});
  const wj = shantenOf(hand, 0, JK);
  const waits = winningKinds(hand, 0, undefined, JK).length;
  console.log(`  ${spec.padEnd(24)} n=${hand.length} base=${base} joker=${wj} jokerWaits=${waits}`);
  rows.push([spec, wj]);
}
console.log("  ↑ joker < -1 또는 base보다 큰 값 = 버그. 특히 13장에서 -1(=이미 완성)은 불가능.");
