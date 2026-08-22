import { contentAugments } from "@majak/content";
import { standardAugments } from "@majak/core";
const all = [...standardAugments, ...contentAugments];
const byCat = new Map<string, string[]>();
for (const d of all) {
  const c = (d as { category: string }).category;
  byCat.set(c, [...(byCat.get(c) ?? []), d.id]);
}
let total = 0;
for (const [c, ids] of [...byCat].sort()) {
  const n = ids.length * (ids.length - 1) / 2;
  total += n;
  console.log(`${c}: ${ids.length}종 → ${n}쌍`);
}
console.log("same-category pairs total:", total);
