import { standardAugments } from "@majak/core";
import { contentAugments } from "@majak/content";
const ALL = [...standardAugments, ...contentAugments];
const byId = new Map(ALL.map(a => [a.id, a as any]));
for (const id of process.argv.slice(2)) {
  const a = byId.get(id);
  if (!a) { console.log(id, "??"); continue; }
  console.log(`=== ${id} (${a.name}) cat=${a.category}`);
  console.log("D:", a.description);
  console.log("T:", a.detail);
}
