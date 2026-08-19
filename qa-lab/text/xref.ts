import { standardAugments } from "@majak/core";
import { contentAugments } from "@majak/content";
const all = [...standardAugments, ...contentAugments] as any[];
const names = all.map(a => [a.name.replace(/\s*\(.*\)$/,""), a.id] as const).sort((a,b)=>b[0].length-a[0].length);
for (const a of all) {
  const txt = `${a.description}\n${a.detail ?? ""}`;
  const refs = new Set<string>();
  for (const [n, id] of names) if (id !== a.id && n.length >= 2 && txt.includes(n)) refs.add(`${n}(${id})`);
  if (refs.size) console.log(`${a.id.padEnd(20)} -> ${[...refs].join(" · ")}`);
}
