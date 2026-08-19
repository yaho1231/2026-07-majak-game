import { readFileSync } from "node:fs";
import { standardAugments } from "@majak/core";
import { contentAugments } from "@majak/content";
const all = [...standardAugments, ...contentAugments] as any[];
const std = new Set(standardAugments.map(a=>a.id));
for (const a of all) {
  const txt = `${a.description}\n${a.detail ?? ""}`;
  if (!/전원에게 (공개|보인다|표시|보이)|전원 공개|모두에게 공개/.test(txt)) continue;
  const p = std.has(a.id) ? "packages/core/src/augment/standardAugments.ts" : `packages/content/src/augments/${a.id}.ts`;
  const src = readFileSync(p, "utf8");
  const pub = [
    /viewKey\(\s*"\*"/.test(src) && 'viewKey("*")',
    /roundViewKey\(\s*"\*"/.test(src) && 'roundViewKey("*")',
    /actionFx|announce|notice|banner/.test(src) && "fx",
    /publishUsesLeft/.test(src) && "uses",
  ].filter(Boolean);
  console.log(`${pub.length? "  ":"!!"} ${a.id.padEnd(20)} [${pub.join(",")}]`);
}
