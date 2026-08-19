import { standardAugments } from "@majak/core";
import { contentAugments } from "@majak/content";
const all = [...standardAugments, ...contentAugments] as any[];
const byId = new Map(all.map(a => [a.id, a]));
// symmetric closure of conflicts
const sym = new Map<string, Set<string>>();
for (const a of all) sym.set(a.id, new Set());
for (const a of all) for (const c of (a.conflicts ?? [])) { sym.get(a.id)!.add(c); sym.get(c)?.add(a.id); }
for (const a of all) {
  const txt = `${a.description}\n${a.detail ?? ""}`;
  const mentions = /함께 가질 수 없|함께 들 수 없|같이 가질 수 없|배타|상호 배제/.test(txt);
  const s = [...sym.get(a.id)!];
  if (mentions || s.length) {
    console.log(`\n--- ${a.id} (${a.name})  conflicts=[${s.map(x=>`${x}/${byId.get(x)?.name}`).join(", ")}]`);
    if (mentions) {
      for (const line of txt.split(/(?<=[.。])\s|\n/)) if (/함께 가질 수 없|함께 들 수 없|같이 가질 수 없/.test(line)) console.log("  TXT:", line.trim());
    } else console.log("  TXT: (문구에 배타 언급 없음)");
  }
}
