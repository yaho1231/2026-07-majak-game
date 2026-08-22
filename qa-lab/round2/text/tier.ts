import { AUGMENT_POWER_TIERS, standardAugments } from "@majak/core";
import { contentAugments } from "@majak/content";
const all = [...standardAugments, ...contentAugments];
const ids = new Set(all.map(a=>a.id));
const tiered = new Set(Object.keys(AUGMENT_POWER_TIERS));
console.log("카탈로그에 있는데 티어 없음(미분류):", [...ids].filter(i=>!tiered.has(i)));
console.log("티어에 있는데 카탈로그에 없음(유령):", [...tiered].filter(i=>!ids.has(i)));
// note 문구 품질
let empty=0, debts:string[]=[];
for (const [id,e] of Object.entries(AUGMENT_POWER_TIERS) as any) {
  const note = e.tierOverride ?? "";
  if (note.startsWith("⚠ 재평가 필요")) debts.push(id);
}
console.log("재평가 빚:", debts.length, debts.join(","));
