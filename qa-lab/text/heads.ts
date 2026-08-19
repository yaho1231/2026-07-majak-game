import { standardAugments } from "@majak/core";
import { contentAugments } from "@majak/content";
const all = [...standardAugments, ...contentAugments] as any[];
const m = new Map<string,string[]>();
for (const a of all) {
  const h = /^\(([^)]*)\)/.exec(a.description)?.[1] ?? "(없음)";
  if (!m.has(h)) m.set(h, []);
  m.get(h)!.push(a.id);
}
for (const [h, ids] of [...m].sort((x,y)=>y[1].length-x[1].length)) console.log(`${ids.length}  «${h}»  ${ids.join(" ")}`);
