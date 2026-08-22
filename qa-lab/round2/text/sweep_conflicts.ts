import { standardAugments } from "@majak/core";
import { contentAugments } from "@majak/content";
const ALL = [...standardAugments, ...contentAugments];
const byId = new Map(ALL.map(a => [a.id, a]));
let n = 0, ok = 0;
for (const a of ALL) {
  const eff = new Set<string>([...(a.conflicts ?? [])]);
  for (const o of ALL) if ((o.conflicts ?? []).includes(a.id)) eff.add(o.id);
  if (eff.size === 0) continue;
  const text = `${a.description} ${a.detail ?? ""}`;
  const miss = [...eff].filter(x => !text.includes(byId.get(x)?.name ?? "\0"));
  if (miss.length === 0) { ok++; continue; }
  n++;
  console.log(`${a.id}(${a.name}) — 문구에 없는 배타: ${miss.map(x=>`${byId.get(x)?.name}(${x})`).join(", ")}`);
}
console.log(`\n배타를 가진 증강 중 문구가 침묵하는 것: ${n}종 / 다 적어 둔 것: ${ok}종`);
