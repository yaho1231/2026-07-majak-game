import { contentAugments } from "@majak/content";
const deg = new Map<string, Set<string>>();
for (const a of contentAugments) {
  for (const c of (a.conflicts ?? [])) {
    if (!deg.has(a.id)) deg.set(a.id, new Set());
    if (!deg.has(c)) deg.set(c, new Set());
    deg.get(a.id)!.add(c); deg.get(c)!.add(a.id);
  }
}
const rows = [...deg.entries()].map(([k,v])=>[k,v.size] as const).sort((a,b)=>b[1]-a[1]);
console.log("총 증강", contentAugments.length, "· 상호배제 관계가 있는 증강", rows.length);
console.log(rows.slice(0,10));
