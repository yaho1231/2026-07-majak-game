/**
 * 우는 국사무쌍(open_kokushi) × 왕의 징표(royal_kokushi) × 조커(joker).
 *
 * 기대(미리 적음):
 *  ① 우는 국사 단독 — 1m1p1s 특수 퐁 + 손패 10종 + 머리 = 역만 13판.
 *  ② 우는 국사 + 왕의 징표 — 왕의 징표는 "요구패 13종을 모두 갖추지 않아도 성립한다"고
 *     **무조건** 약속한다. 그러니 퐁 3종 + 손패 9종 + 중복 머리(=한 종류가 빠진 손)도
 *     역만이어야 한다. 두 증강 모두 prism이고 conflicts에 서로 없다 = 함께 들 수 있다.
 *  ③ 우는 국사 + 조커 — 백이 빠진 종류를 메운다.
 */
import { measure, line } from "./lib.js";
import { openKokushi } from "../../../packages/content/src/augments/open_kokushi.js";
import { royalKokushi } from "../../../packages/content/src/augments/royal_kokushi.js";
import { joker } from "../../../packages/content/src/augments/joker.js";
import { jokerOnData } from "./lib.js";
import { asyncChiitoi } from "../../../packages/content/src/augments/async_chiitoi.js";

const PON = [{ kind: "kokushi_pon" as never, spec: "1m1p1s", from: "p3" as const }];

console.log("conflicts: open_kokushi =", openKokushi.conflicts, "/ royal =", royalKokushi.conflicts);

// ① 정상 — 퐁 1m1p1s + 손패 9m9p9s 1234z 567z 중 10종 + 머리 1
//    손패는 14-3 = 11장: 나머지 10종 각 1장 + 그중 하나 2장
console.log("\n### ① 우는 국사 — 13종 전부(퐁3 + 손패10종 + 머리)");
const FULL = "9m9p9s1234z567z9m"; // 9m,9p,9s,동남서북,백발중 (10종) + 9m 중복 = 11장
for (const [n, a] of [
  ["없음", []],
  ["우는국사", [openKokushi]],
  ["우는국사+왕징표", [openKokushi, royalKokushi]],
] as const) {
  line(n, measure({ hand: FULL, melds: PON, winType: "tsumo", winTile: "9m" }, a as never));
}

// ② 한 종류(北=4z)가 빠지고 그 자리를 중복으로 메운 손 — 왕의 징표가 약속하는 것
console.log("\n### ② 우는 국사 + 왕의 징표 — 北이 빠지고 9m 중복으로 메운 손");
const MISS = "9m9p9s123z567z9m9p"; // 9종 + 9m·9p 중복 = 11장 (北 없음)
for (const [n, a] of [
  ["없음", []],
  ["우는국사", [openKokushi]],
  ["왕징표", [royalKokushi]],
  ["우는국사+왕징표", [openKokushi, royalKokushi]],
] as const) {
  line(n, measure({ hand: MISS, melds: PON, winType: "tsumo", winTile: "9p" }, a as never));
}

// ②-b 대조군: 후로 없는 순수 손에서는 왕의 징표가 정말 도는가 (12종 + 중복)
console.log("\n### ②-b 대조군 — 후로 없는 14장, 北 빠짐 + 9m 중복");
const CLOSED_MISS = "19m19p19s123z567z9m"; // 12종 + 9m 중복 = 14장? (2+2+2+3+3+1=13)... 아래에서 확인
console.log("  손패 장수:", CLOSED_MISS.replace(/[a-z]/g, "").length + 0);
for (const [n, a] of [
  ["없음", []],
  ["왕징표", [royalKokushi]],
] as const) {
  line(n, measure({ hand: "19m19p19s123z567z9m9p", winType: "tsumo" }, a as never));
}

// ③ 우는 국사 + 조커 — 백(조커)이 빠진 北을 메우나
console.log("\n### ③ 우는 국사 + 조커 — 백이 빠진 종류를 메우나");
const JOK = "9m9p9s123z67z5z5z9m"; // 11장: 9m9p9s 東南西 發中 白白(조커2) 9m중복. 北 없음.
for (const [n, a] of [
  ["없음", []],
  ["우는국사", [openKokushi]],
  ["우는국사+조커", [openKokushi, joker]],
  ["우는국사+조커+왕징표", [openKokushi, joker, royalKokushi]],
] as const) {
  line(n, measure({ hand: JOK, melds: PON, winType: "tsumo", winTile: "9m", data: jokerOnData }, a as never));
}

// ④ 우는 국사의 kokushiOnly가 다른 화료형을 막는가 (비대칭 치또이와 함께)
console.log("\n### ④ 우는 국사(퐁 후) × 비대칭 — 치또이 길이 막히는가");
for (const [n, a] of [
  ["비대칭만", [asyncChiitoi]],
  ["우는국사+비대칭", [openKokushi, asyncChiitoi]],
] as const) {
  line(n, measure({ hand: "11m22m33m44p55p6s6s", melds: PON, winType: "tsumo" }, a as never));
}
