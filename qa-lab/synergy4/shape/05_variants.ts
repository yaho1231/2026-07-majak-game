import { decompose, kindKey } from "@majak/core";
import { h } from "../../../packages/content/test/helpers.js";
const s = (k: any) => `${k.rank}${k.suit[0]}`;
const ng = "1m1p1s2m3p4s5m6p7s8m9p9s9m2p";
const opts = { mixedRuns: true, mixedTriplets: true, mixedPairs: true };
const ds = decompose(h(ng), 0, opts as any);
console.log(`분해 ${ds.length}개. 화료패 2p 가 머리/몸통에 kindKey로 잡히는가:`);
let hit = 0;
for (const d of ds) {
  const inPair = d.pair !== null && kindKey(d.pair) === "pin2";
  const inSet = d.sets.some((x) => x.tiles.some((t) => kindKey(t) === "pin2"));
  if (inPair || inSet) hit++;
}
console.log(`  2p를 품는 분해 = ${hit} / ${ds.length}`);
for (const d of ds.slice(0, 12)) {
  console.log(`   머리 ${d.pair ? s(d.pair) : "-"} | ${d.sets.map((x) => x.tiles.map(s).join("")).join(" ")}`);
}

import { winningKinds, isWinningShape } from "@majak/core";
const ng13 = "1m1p1s2m3p4s5m6p7s8m9p9s9m";
const w = winningKinds(h(ng13), 0, undefined, opts as any).map(kindKey);
console.log(`\n13장 ${ng13} 의 대기(구련 옵션): ${w.join(" ")}`);
console.log(`  → 대기에 pin2 있는가: ${w.includes("pin2")}`);
console.log(`  → 그 2p로 화료하면 변형 0개 (위 참조) = 대기인데 화료 불가`);

// 같은 병 — 더 단순한 손으로 재현
const simple = "2m2p345m345p678m678p11s";
console.log(`\n단순 재현 ${simple} (머리 2m+2p 혼색)`);
for (const wt of ["man2", "pin2"]) {
  const ds2 = decompose(h(simple), 0, opts as any);
  const okAny = ds2.some((d) => (d.pair !== null && kindKey(d.pair) === wt) || d.sets.some((x) => x.tiles.some((t) => kindKey(t) === wt)));
  console.log(`  화료패 ${wt}: 분해 ${ds2.length}개, 품는 분해 있음=${okAny}`);
}
