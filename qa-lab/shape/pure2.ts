/** 2차 순수 검사 — polar_ends 머리, joker 샹텐/대기, true_dragon 특수형 */
import { winningKinds, shantenOf } from "@majak/core";
import type { DecomposeOptions, TileKind } from "@majak/core";
import { isWinningShape } from "../../packages/core/src/mahjong/scoring/decompose.js";
import { h } from "../../packages/content/test/helpers.js";

const HAKU: TileKind = { suit: "dragon", rank: 1 };
const JK: DecomposeOptions = { wildKinds: [HAKU] };
const PE: DecomposeOptions = { polarEnds: true };
const w = (s: string, o: DecomposeOptions, m = 0): string =>
  winningKinds(h(s), m, undefined, o).map((k) => `${k.rank}${k.suit[0]}`).join(",");

console.log("--- polar_ends 머리(작두) 검사");
for (const spec of ["123m456m789m123p19p", "123m456m789m123p19m", "111m222m333m444m19m", "123m456m789m123p11p"]) {
  console.log(`  ${spec}: std=${isWinningShape(h(spec), 0, {})} polar=${isWinningShape(h(spec), 0, PE)}`);
}
console.log("  1m9m 머리 대기(13장 123m456m789m123p1m):",
  "std=", w("123m456m789m123p1m", {}), "| polar=", w("123m456m789m123p1m", PE));

console.log("\n--- joker 샹텐");
const cases: [string, string][] = [
  ["19m19p19s1234567z", "국사 텐파이 (백 1장 포함)"],
  ["19m19p19s123456z5z", "국사 13면? 백 중복"],
  ["1122334455667m7m", "치또이 계열"],
  ["123m456p789s1122z", "표준 텐파이 (백 없음)"],
  ["123m456p789s112z5z", "백 1장 있음"],
  ["123m456p789s11z55z", "백 2장"],
  ["555z123m456p789s11p", "백 3장 (14장)"],
];
for (const [spec, label] of cases) {
  const hand = h(spec);
  const base = shantenOf(hand, 0, {});
  const wj = shantenOf(hand, 0, JK);
  const flag = wj > base ? "  <== 조커가 샹텐을 악화시킴" : "";
  console.log(`  ${spec.padEnd(20)} ${label.padEnd(24)} base=${base} joker=${wj}${flag}`);
}

console.log("\n--- joker 대기");
for (const spec of ["19m19p19s1234567z", "1122334455667m", "123m456p789s112z"]) {
  console.log(`  ${spec}: std=[${w(spec, {})}] joker=[${w(spec, JK)}]`);
}

console.log("\n--- joker: 치또이/국사 형태에 wild 적용되는가 (14장)");
for (const spec of ["1122334455667m5z", "19m19p19s123456z5z", "112233445566m5z5z"]) {
  console.log(`  ${spec}: std=${isWinningShape(h(spec), 0, {})} joker=${isWinningShape(h(spec), 0, JK)}`);
}

console.log("\n--- true_dragon(totalSets=5) + 치또이/국사");
const TD: DecomposeOptions = { totalSets: 5 };
console.log("  17장 국사류:", isWinningShape(h("19m19p19s1234567z19m9p"), 0, TD));
console.log("  17장 치또이류:", isWinningShape(h("11223344556677m11p".replace("11p", "1p1p")), 0, TD));
console.log("  16장 국사 샹텐:", shantenOf(h("19m19p19s1234567z199m"), 0, TD));
console.log("  16장 대기(5멘쯔형):", w("123m456m789m123p456p1s", TD));
