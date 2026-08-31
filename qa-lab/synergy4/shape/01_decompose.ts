/**
 * 01 — 화료형 완화 옵션끼리의 «겹침» 순수 검사 (decompose 레벨).
 * 각 손을 (없음 / A / B / A+B)로 분해해 성립 여부를 표로 찍는다.
 * A+B에서만 성립해야 하는 손이 A+B에서도 안 서면 «겹침 실패»다.
 */
import { decompose, isWinningShape } from "@majak/core";
import type { DecomposeOptions } from "@majak/core";
import { h } from "../../../packages/content/test/helpers.js";

type Opt = Partial<DecomposeOptions>;
const O = {
  wrap: { wrapRuns: true } as Opt,              // 끝없는 윤회 broken_wall
  runs: { mixedRuns: true } as Opt,             // 무너진 국경 broken_border
  tri: { mixedTriplets: true } as Opt,          // 동수의 결속 mixed_triplet
  polar: { polarEnds: true } as Opt,            // 양극 polar_ends
  chii: { chiitoiMixedPairs: true } as Opt,     // 비대칭 async_chiitoi
  honor: { honorRuns: true } as Opt,            // 바람의 계보 wind_lineage
  royal: { kokushiDupes: 1 } as Opt,            // 왕의 징표 royal_kokushi
  dragon: { totalSets: 5 } as Opt,              // 진짜 용 true_dragon
};

let fails = 0;
function row(title: string, hand: string, an: string, a: Opt, bn: string, b: Opt, expect: "A+B만" | "A만" | "?"): void {
  const kinds = h(hand);
  const need = ((a.totalSets ?? b.totalSets ?? 4) as number) * 3 + 2;
  const t = (o: Opt): string => (isWinningShape(kinds, 0, o as DecomposeOptions) ? "O" : ".");
  const rab = t({ ...a, ...b });
  let flag = "";
  if (expect === "A+B만" && rab !== "O") { flag = "  <<< A+B 실패"; fails++; }
  const len = kinds.length === need ? "" : `  [장수 ${kinds.length}≠${need}]`;
  console.log(
    `${title.padEnd(34)} ${hand.padEnd(28)} 없음:${t({})} ${an}:${t(a)} ${bn}:${t(b)} A+B:${rab}${len}${flag}`,
  );
}

console.log("=== 01 화료형 완화 겹침 (O=화료형 성립) ===\n");

console.log("-- 양극(polar) 축 --");
row("양극+결속 1만9통1삭 커쯔", "1m9p1s234m567m234p55p", "pol", O.polar, "tri", O.tri, "A+B만");
row("양극+결속 두 몸통 다 혼색", "1m9p1s9m1p9s234m567m55p", "pol", O.polar, "tri", O.tri, "A+B만");
row("양극+국경 199 + 2만3통4삭", "199m2m3p4s567m234p55s", "pol", O.polar, "run", O.runs, "A+B만");
row("양극+윤회 199 + 891통", "199m891p234s567s55z", "pol", O.polar, "wrp", O.wrap, "A+B만");
row("양극+계보 199 + 동남서", "199m123z234m567m55p", "pol", O.polar, "hon", O.honor, "A+B만");

console.log("\n-- 결속(mixedTriplets) 축 --");
row("결속+국경 혼색커쯔+혼색슌쯔", "2m2p2s2m3p4s567m234p11z", "tri", O.tri, "run", O.runs, "A+B만");
row("결속+윤회 혼색커쯔+891", "2m2p2s891p234s567s11z", "tri", O.tri, "wrp", O.wrap, "A+B만");
row("결속+계보 혼색커쯔+동남서", "2m2p2s123z234m567m11p", "tri", O.tri, "hon", O.honor, "A+B만");

console.log("\n-- 국경(mixedRuns) 축 --");
row("국경+윤회 8만9통1삭 슌쯔", "8m9p1s234m567m11z999p", "run", O.runs, "wrp", O.wrap, "A+B만");
row("국경+계보 혼색슌쯔+동남서", "2m3p4s123z234m567m11p", "run", O.runs, "hon", O.honor, "A+B만");

console.log("\n-- 계보(honorRuns) 축 --");
row("계보+윤회 북동남(자패 순환)", "4z1z2z234m567m11p999s", "hon", O.honor, "wrp", O.wrap, "?");
row("계보+국경 동남서+백발중 혼합?", "1z2z5z234m567m11p999s", "hon", O.honor, "run", O.runs, "?");

console.log("\n-- 진짜 용(totalSets=5, 17장) 축 --");
row("용+양극", "199m199p234s567s123m55z", "drg", O.dragon, "pol", O.polar, "A+B만");
row("용+결속", "2m2p2s3m3p3s234m567m234p11z", "drg", O.dragon, "tri", O.tri, "A+B만");
row("용+국경", "2m3p4s3m4p5s234m567m234p11z", "drg", O.dragon, "run", O.runs, "A+B만");
row("용+계보", "123z234z234m567m123p99p", "drg", O.dragon, "hon", O.honor, "A+B만");
row("용+윤회", "891m891p234s567s123m55z", "drg", O.dragon, "wrp", O.wrap, "A+B만");

console.log("\n-- 비대칭 치또이 / 국사 --");
row("비대칭 단독(혼색 7쌍)", "1234567m1234567p", "chi", O.chii, "pol", O.polar, "?");
row("비대칭+양극 1만9만 쌍?", "1m9m2233m4455p6677p", "chi", O.chii, "pol", O.polar, "?");
row("왕징표 12종 국사", "1199m19p1s1234z567z", "roy", O.royal, "pol", O.polar, "?");

console.log(`\nA+B 실패 ${fails}건`);

console.log("\n--- 분해 가짓수 ---");
for (const [name, hand, a, b] of [
  ["양극+결속", "1m9p1s234m567m234p55p", O.polar, O.tri],
  ["결속+국경", "2m2p2s2m3p4s567m234p11z", O.tri, O.runs],
  ["양극+윤회", "199m891p234s567s55z", O.polar, O.wrap],
  ["용+결속", "2m2p2s3m3p3s234m567m234p11z", O.dragon, O.tri],
] as [string, string, Opt, Opt][]) {
  const k = h(hand);
  const n = (o: Opt): number => decompose(k, 0, o as DecomposeOptions).length;
  console.log(`  ${name.padEnd(10)} ${hand.padEnd(28)} 없음=${n({})} A=${n(a)} B=${n(b)} A+B=${n({ ...a, ...b })}`);
}
