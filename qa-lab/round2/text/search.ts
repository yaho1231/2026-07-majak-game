import { readFileSync } from "node:fs";
const rows = JSON.parse(readFileSync("qa-lab/round2/text/catalog.json","utf8"));
const src = readFileSync("packages/client/src/augmentBrief.ts","utf8");
const re = /^\s{2}(\w+):\s*\{\s*use:\s*(?:MODE_1_2|"[^"]*")\s*,\s*text:\s*"([^"]*)"/gm;
const brief: Record<string,string> = {};
for (const m of src.matchAll(re)) brief[m[1]!] = m[2]!;
// 도감 필터가 보는 코퍼스 = name + id + description + detail
const bad: string[] = [];
for (const r of rows) {
  const hay = (r.name + " " + r.id + " " + r.description + " " + (r.detail??"")).toLowerCase();
  const words = (brief[r.id] ?? "").replace(/[^가-힣A-Za-z0-9]/g," ").split(/\s+/).filter(w=>w.length>=2);
  const miss = words.filter(w=>!hay.includes(w.toLowerCase()));
  if (miss.length) bad.push(`${r.id}(${r.name}) 카드에 보이는데 검색 안 됨: ${[...new Set(miss)].join(", ")}`);
}
console.log(bad.join("\n"));
console.log("\n영향 증강:", bad.length, "/", rows.length);
