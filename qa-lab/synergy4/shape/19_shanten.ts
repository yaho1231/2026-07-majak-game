/** 19 — shantenOf(봇 휴리스틱)가 형 완화를 보는가. isTenpai/winningKinds(정확)와 대조. */
import { shantenOf, isTenpai, winningKinds, kindKey } from "@majak/core";
import { h } from "../../../packages/content/test/helpers.js";
const rows: [string, string, any][] = [
  ["양극 199 텐파이", "199m199p199s11m19s", { polarEnds: true }],
  ["윤회 891 텐파이", "891m891p234s567s5z", { wrapRuns: true }],
  ["계보 동남서 텐파이", "123z234m567m11p99s", { honorRuns: true }],
  ["결속 혼색커쯔 텐파이", "2m2p2s3m3p3s567m11z99p", { mixedTriplets: true }],
  ["국경 혼색슌쯔 텐파이", "2m3p4s3m4p5s567m11z99p", { mixedRuns: true }],
  ["비대칭 혼색7쌍 텐파이", "1m1p2m2p3m3p4m4p5m5p6m6p7m", { chiitoiMixedPairs: true }],
  ["왕징표 12종 국사", "119m19p1s1234z567z", { kokushiDupes: 1 }],
  ["진짜용 5멘쯔 16장", "234m567m123p456p234s5z", { totalSets: 5 }],
];
for (const [name, spec, opts] of rows) {
  const k = h(spec);
  const t = isTenpai(k, 0, undefined, opts);
  const s = shantenOf(k, 0, opts);
  const flag = t && s > 0 ? "   <<< 텐파이인데 샹텐이 0이 아니다" : "";
  console.log(`  ${name.padEnd(22)} n=${k.length} shanten(opts)=${s} shanten({})=${shantenOf(k, 0, {})} isTenpai=${t}${flag}`);
}
