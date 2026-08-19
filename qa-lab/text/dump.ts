import { standardAugments } from "@majak/core";
import { contentAugments } from "@majak/content";
const all = [...standardAugments, ...contentAugments];
console.log("TOTAL", all.length);
for (const a of all) {
  console.log(`\n===== ${a.id} | ${a.name} | rarity=${(a as any).rarity ?? "?"} | tags=${JSON.stringify((a as any).tags ?? [])} | draftStages=${JSON.stringify((a as any).draftStages ?? null)}`);
  console.log(`DESC: ${a.description}`);
  console.log(`DETAIL: ${a.detail ?? "(none)"}`);
}
