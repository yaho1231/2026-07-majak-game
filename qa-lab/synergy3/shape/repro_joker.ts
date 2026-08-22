/**
 * 조커(joker) × 화료형 확장 증강.
 *
 * 조커는 액티브라 `joker:on:<국>#round` 플래그를 직접 세워 발동 상태를 만든다
 * (실게임의 joker_call과 같은 상태 — 이 플래그 하나가 scoring.wildKinds를 켠다).
 *
 * 기대(미리 적음):
 *  A. 조커 + 왕의 징표 — 조커가 빠진 요구패를 메워 국사가 선다. 역만은 **1개**.
 *  B. 조커 + 비대칭 — 조커가 짝을 메운다. 치또이 2판 + 나머지.
 *  C. 조커 + 연꽃 — 손패에 백이 물리적으로 남아 있으면 "14장 전부 수패"가 깨진다.
 *     조커가 몸통을 메워 화료형은 서는데 역만은 붙지 않을 것이다(= 조용한 삼킴).
 *  D. 조커 + 양극/결속/국경/윤회 — 조커가 그 확장 몸통의 빈자리도 메운다.
 */
import { measure, line, waitsOf, optionsOf, jokerOnData } from "./lib.js";
import { joker } from "../../../packages/content/src/augments/joker.js";
import { royalKokushi } from "../../../packages/content/src/augments/royal_kokushi.js";
import { asyncChiitoi } from "../../../packages/content/src/augments/async_chiitoi.js";
import { mixedNineGates } from "../../../packages/content/src/augments/mixed_nine_gates.js";
import { polarEnds } from "../../../packages/content/src/augments/polar_ends.js";
import { brokenBorder } from "../../../packages/content/src/augments/broken_border.js";
import { mixedTriplet } from "../../../packages/content/src/augments/mixed_triplet.js";
import { windLineage } from "../../../packages/content/src/augments/wind_lineage.js";
import { tanyaoBreak } from "../../../packages/content/src/augments/tanyao_break.js";

console.log("옵션 확인(조커 켬):", optionsOf("19m19p19s1234z5z5z", [joker], jokerOnData));

// ── A. 조커 × 왕의 징표 ─────────────────────────────────────────
// 손: 요구패 12종 + 백(조커) 2장. 백은 그 자체가 요구패(중=dragon1? 백=dragon1)이다.
// 12종 + 백 = 13종, 백이 2장이면 표준 국사.
console.log("\n### A1. 국사 13종 + 백 1장(=머리 후보) — 조커가 국사를 메우는가");
const H_KOKUSHI_MISS = "19m19p19s1234z6z7z5z5z"; // 1m9m1p9p1s9s 동남서북 발중 백백 = 14장(13종+백중복)
for (const [n, a] of [
  ["없음", []],
  ["조커", [joker]],
  ["왕징표", [royalKokushi]],
  ["조커+왕징표", [joker, royalKokushi]],
] as const) {
  line(n, measure({ hand: H_KOKUSHI_MISS, winType: "tsumo", data: jokerOnData }, a as never));
}

console.log("\n### A2. 요구패 11종 + 백 3장 — 조커 3장이 빠진 2종을 메우나 (왕징표=1종까지)");
const H2 = "19m19p19s123z5z5z5z6z"; // 1m9m1p9p1s9s 동남서 백백백 발 = 13장… +1
for (const [n, a] of [
  ["없음", []],
  ["조커", [joker]],
  ["왕징표", [royalKokushi]],
  ["조커+왕징표", [joker, royalKokushi]],
] as const) {
  line(n, measure({ hand: H2 + "7z", winType: "tsumo", data: jokerOnData }, a as never));
}

// ── B. 조커 × 비대칭 ─────────────────────────────────────────
console.log("\n### B. 조커 × 비대칭 — 백 1장이 홀로 남은 짝을 메우나");
const HB = "11m22m33m44p55p66s7s5z"; // 6쌍 + 7s 홀 + 백 1
for (const [n, a] of [
  ["없음", []],
  ["조커", [joker]],
  ["비대칭", [asyncChiitoi]],
  ["조커+비대칭", [joker, asyncChiitoi]],
] as const) {
  line(n, measure({ hand: HB, winType: "tsumo", data: jokerOnData }, a as never));
}

console.log("\n### B2. 조커 × 비대칭 — 무늬 다른 랭크 짝 + 백");
const HB2 = "1m1p2m2p3m3p4m4p5m5p6m6p7s5z"; // 6개의 혼색 쌍 + 7s + 백
for (const [n, a] of [
  ["없음", []],
  ["조커", [joker]],
  ["비대칭", [asyncChiitoi]],
  ["조커+비대칭", [joker, asyncChiitoi]],
] as const) {
  line(n, measure({ hand: HB2, winType: "tsumo", data: jokerOnData }, a as never));
}

// ── C. 조커 × 연꽃 ─────────────────────────────────────────
console.log("\n### C. 조커 × 연꽃 — 백이 구련 뼈대의 빈자리를 메운 손");
// 뼈대 1112345678999 (혼색) 중 한 장을 백으로 대체 + 오름패
const HC = "11m1p2s3m4p5s6m7p8s9m9p5z5m"; // 9s 자리에 백
for (const [n, a] of [
  ["없음", []],
  ["조커", [joker]],
  ["연꽃", [mixedNineGates]],
  ["조커+연꽃", [joker, mixedNineGates]],
] as const) {
  line(n, measure({ hand: HC, winType: "tsumo", data: jokerOnData }, a as never));
}
console.log("  (참고) 백 없이 완전한 뼈대:");
line("연꽃", measure({ hand: "11m1p2s3m4p5s6m7p8s9m9p9s5m", winType: "tsumo" }, [mixedNineGates]));

// ── D. 조커 × 모양 확장들 ─────────────────────────────────────
console.log("\n### D. 조커 × 양극/결속/국경 — 확장 몸통의 빈자리를 메우나");
const HD = "199m199p19s5z111z22z".replace("19s5z", "19s5z"); // 1s9s + 백 → 양극 몸통 199s?
for (const [n, a] of [
  ["없음", []],
  ["조커", [joker]],
  ["양극", [polarEnds]],
  ["조커+양극", [joker, polarEnds]],
] as const) {
  line(n, measure({ hand: HD, winType: "tsumo", data: jokerOnData }, a as never));
}

console.log("\n### D2. 조커 × 결속 — 혼색 커쯔의 빈자리");
const HD2 = "1m1p5z2m2p2s3m3p3s444m99z".replace("99z", "99m");
for (const [n, a] of [
  ["없음", []],
  ["조커", [joker]],
  ["결속", [mixedTriplet]],
  ["조커+결속", [joker, mixedTriplet]],
] as const) {
  line(n, measure({ hand: HD2, winType: "tsumo", data: jokerOnData }, a as never));
}

console.log("\n### D3. 조커 × 계보 — 자패 슌쯔의 빈자리(동남□)");
const HD3 = "12z5z234m567m789m99p";
for (const [n, a] of [
  ["없음", []],
  ["조커", [joker]],
  ["계보", [windLineage]],
  ["조커+계보", [joker, windLineage]],
] as const) {
  line(n, measure({ hand: HD3, winType: "tsumo", data: jokerOnData }, a as never));
}

console.log("\n### D4. 조커 × 탕야오해방 — 백이 손에 있어도 '자패 없음'인가");
const HD4 = "123m456m789m111p5z".replace("5z", "9p"); // 대조
line("정상 손(자패 없음)+탕야오", measure({ hand: "123m456m789m111p99p", winType: "tsumo" }, [tanyaoBreak]));
line("백 1장 낀 손 + 조커+탕야오", measure({ hand: "123m456m789m111p9p5z", winType: "tsumo", data: jokerOnData }, [joker, tanyaoBreak]));

// ── E. 대기 폭 (후리텐 표면적) ─────────────────────────────────
console.log("\n### E. 조커 대기 폭");
for (const [n, a] of [
  ["없음", []],
  ["조커", [joker]],
  ["조커+국경", [joker, brokenBorder]],
  ["조커+국경+양극", [joker, brokenBorder, polarEnds]],
] as const) {
  const w = waitsOf("123m456m789m11p5z", a as never, undefined, jokerOnData);
  console.log(`  ${n.padEnd(14)} shanten=${w.shanten} waits=${w.waits.length}`);
}
