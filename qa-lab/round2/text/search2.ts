import { splitTerms } from "../../../packages/client/src/glossary.js";
import { readFileSync } from "node:fs";
const rows = JSON.parse(readFileSync("qa-lab/round2/text/catalog.json","utf8"));
const src = readFileSync("packages/client/src/augmentBrief.ts","utf8");
const re = /^\s{2}(\w+):\s*\{\s*use:\s*(?:MODE_1_2|"[^"]*")\s*,\s*text:\s*"([^"]*)"/gm;
const brief: Record<string,string> = {};
for (const m of src.matchAll(re)) brief[m[1]!] = m[2]!;
for (const r of rows) {
  const hay = (r.name + " " + r.id + " " + r.description + " " + (r.detail??"")).toLowerCase();
  const terms = (splitTerms(brief[r.id] ?? "") as any[]).filter(c=>c.kind==="term").map(c=>c.text);
  const miss = [...new Set(terms.filter((t:string)=>!hay.includes(t.toLowerCase())))];
  if (miss.length) console.log(`${r.id}(${r.name}): 카드에 뜨는 용어 [${miss.join(", ")}] 로는 검색되지 않는다`);
}
