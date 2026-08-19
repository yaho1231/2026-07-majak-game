import { readFileSync } from "node:fs";
import { standardAugments } from "@majak/core";
import { contentAugments } from "@majak/content";
const all = [...standardAugments, ...contentAugments] as any[];
const std = new Set(standardAugments.map(a=>a.id));
for (const a of all) {
  const txt = `${a.description}\n${a.detail ?? ""}`;
  const claims = txt.split(/\n|(?<=다)\s/).filter(s=>/나만|나에게만|자신만|당신에게만|보유자만|본인만|비밀|공개되지 않|상대에게는|알 수 없|고를 수 없|당사자에게만|당사자 둘에게만/.test(s));
  if (!claims.length) continue;
  const p = std.has(a.id) ? "packages/core/src/augment/standardAugments.ts" : `packages/content/src/augments/${a.id}.ts`;
  const src = readFileSync(p, "utf8");
  const pubs = [...src.matchAll(/(round)?[vV]iewKey\(\s*"\*"\s*,\s*([^)]*)\)/g)].map(m=>m[0].replace(/\s+/g," "));
  console.log(`\n### ${a.id}`);
  for (const c of claims) console.log("  TXT:", c.trim().slice(0,140));
  for (const q of new Set(pubs)) console.log("  PUB:", q);
}
