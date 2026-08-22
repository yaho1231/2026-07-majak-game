import { standardAugments } from "@majak/core";
import { contentAugments } from "@majak/content";
const ALL = [...standardAugments, ...contentAugments];
const byId = new Map(ALL.map(a => [a.id, a]));
const closure = new Map<string, Set<string>>();
for (const a of ALL) closure.set(a.id, new Set());
for (const a of ALL) for (const c of (a as any).conflicts ?? []) {
  if (!byId.has(c)) { console.log("DANGLING", a.id, c); continue; }
  closure.get(a.id)!.add(c); closure.get(c)!.add(a.id);
}
const out: Record<string,string[]> = {};
for (const [id, s] of [...closure].sort((x,y)=>x[0].localeCompare(y[0]))) if (s.size) out[id] = [...s].sort();
for (const [id, v] of Object.entries(out)) console.log(`  ${id}: [${v.map(x=>`"${x}"`).join(", ")}], // ${byId.get(id)!.name} ↔ ${v.map(x=>byId.get(x)!.name).join("·")}`);
console.log("count", Object.keys(out).length);
