import { readFileSync } from "node:fs";
import { standardAugments } from "@majak/core";
import { contentAugments } from "@majak/content";
const all = [...standardAugments, ...contentAugments] as any[];
const std = new Set(standardAugments.map(a=>a.id));
const codeOnly = (s:string)=>s.replace(/\/\*[\s\S]*?\*\//g," ").replace(/\/\/[^\n]*/g," ").replace(/"(?:[^"\\]|\\.)*"/g,'""').replace(/'(?:[^'\\]|\\.)*'/g,"''").replace(/`(?:[^`\\]|\\.)*`/g,"``");
for (const a of all) {
  const head = /^\(([^)]*)\)/.exec(a.description)?.[1] ?? "";
  if (!/^상시/.test(head)) continue;
  const p = std.has(a.id) ? "packages/core/src/augment/standardAugments.ts" : `packages/content/src/augments/${a.id}.ts`;
  const src = codeOnly(readFileSync(p,"utf8"));
  const hits = ["cooldownReady","cooldownUse","COOLDOWN_ROUNDS","matchUses","publishUsesLeft","usesKey","hasUsesLeft","maxUses"].filter(k=>src.includes(k));
  // 문구 자체가 한도를 인정하는가
  const admits = /횟수 제한 없다|횟수 제한은 없|횟수 제한 없음|게임 내|국에 1회|매 국|연장은|교환|열람/.test(a.description);
  if (hits.length) console.log(`${admits?"  ":"!!"} ${a.id.padEnd(20)} «${head}» -> ${hits.join(",")}`);
}
