import { splitTerms, GLOSSARY } from "../../../packages/client/src/glossary.js";
import { readFileSync } from "node:fs";
const rows = JSON.parse(readFileSync("qa-lab/round2/text/catalog.json","utf8"));
const src = readFileSync("packages/client/src/augmentBrief.ts","utf8");
const re = /^\s{2}(\w+):\s*\{\s*use:\s*(?:MODE_1_2|"[^"]*")\s*,\s*text:\s*"([^"]*)"/gm;
const corpus: [string,string][] = [];
for (const r of rows) { corpus.push([r.id+".desc",r.description]); if(r.detail) corpus.push([r.id+".detail",r.detail]); }
for (const m of src.matchAll(re)) corpus.push([m[1]!+".brief", m[2]!]);
const RISKY = new Set(["toimen","kamicha","shimocha","yakuman","han","atama","machi","tenpai"]);
const seen = new Map<string,string>();
for (const [id,text] of corpus) {
  let off = 0;
  for (const c of splitTerms(text) as any[]) {
    if (c.kind === "term" && RISKY.has(c.entry.key)) {
      const after = text.slice(off+c.text.length, off+c.text.length+4).replace(/\n/g," ");
      const key = `${c.entry.key}|${c.text}|${after}`;
      if (!seen.has(key)) seen.set(key, `${id}: …${text.slice(Math.max(0,off-12),off)}[${c.text}]${after}…`);
    }
    off += c.text.length;
  }
}
console.log([...seen.values()].sort().join("\n"));
console.log("고유 문맥", seen.size);
