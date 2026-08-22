/** 하네스 자체 검증 — 평범한 손이 제대로 채점되는가 */
import { measure, table, waitsOf } from "./lib.js";
import { brokenBorder } from "../../../packages/content/src/augments/broken_border.js";
import { mixedTriplet } from "../../../packages/content/src/augments/mixed_triplet.js";

// 평범한 탕야오 핑후 손
console.log("표준 234m567m234p55s678s tsumo:");
console.log(measure({ hand: "234567m234p678s55s", winType: "tsumo", winTile: "5s" }, []));

// 무너진 국경 — 혼색 슌쯔
table(
  "혼색 슌쯔 2m3p4s",
  { hand: "234m567m234p2m3p4s99z".replace("99z", "77z"), winType: "tsumo" },
  { name: "국경", augs: [brokenBorder] },
  { name: "결속", augs: [mixedTriplet] },
);

console.log(waitsOf("234567m234p678s5s", []));
