import { splitTerms } from "../../../packages/client/src/glossary.js";
import { readFileSync } from "node:fs";
const rows = JSON.parse(readFileSync("qa-lab/round2/text/catalog.json","utf8"));
const src = readFileSync("packages/client/src/augmentBrief.ts","utf8");
const re = /^\s{2}(\w+):\s*\{\s*use:\s*(?:MODE_1_2|"[^"]*")\s*,\s*text:\s*"([^"]*)"/gm;
const briefs: [string,string][] = [...src.matchAll(re)].map(m=>[m[1]!,m[2]!]);
const corpus: [string,string,string][] = [];
for (const r of rows) { corpus.push([r.id,"desc",r.description]); if(r.detail) corpus.push([r.id,"detail",r.detail]); }
for (const [id,t] of briefs) corpus.push([id,"brief",t]);
// 짧은(2자) 용어가 다른 낱말 안에 잡힌 것으로 의심되는 자리
const seen = new Map<string, Set<string>>();
for (const [id,kind,text] of corpus) {
  let off = 0;
  for (const c of splitTerms(text) as any[]) {
    if (c.kind === "term") {
      const before = text.slice(Math.max(0,off-6), off);
      const after = text.slice(off+c.text.length, off+c.text.length+6);
      const key = `${c.entry.key}|${c.text}|${after.slice(0,3)}`;
      if (!seen.has(key)) seen.set(key, new Set());
      seen.get(key)!.add(`${id}.${kind}: …${before}[${c.text}]${after}…`);
    }
    off += c.text.length;
  }
}
// 2글자 이하 용어만 출력
const out: string[] = [];
for (const [key, set] of seen) {
  const [k, surf] = key.split("|");
  if ((surf as string).length <= 2) out.push(`${k} «${surf}» → ${[...set][0]}`);
}
console.log(out.sort().join("\n"));
console.log("총", out.length);
