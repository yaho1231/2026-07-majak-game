import fs from "node:fs";
const rows = JSON.parse(fs.readFileSync("qa-lab/round2/text/catalog.json","utf8"));
const src = fs.readFileSync("packages/client/src/augmentBrief.ts","utf8");
const re = /^\s{2}(\w+):\s*\{\s*use:\s*(MODE_1_2|"[^"]*")\s*,\s*text:\s*"([^"]*)"/gm;
const brief = {};
for (const m of src.matchAll(re)) brief[m[1]] = { use: m[2]==="MODE_1_2"?"동풍전1·반장전2":m[2].slice(1,-1), text: m[3] };
const cards = rows.map(r => {
  const b = brief[r.id] ?? {use:"",text:r.description};
  return `<div class="cell"><div class="codex-card" data-id="${r.id}">
  <div class="codex-card-name">${r.name}</div>
  <div class="codex-card-desc"><span class="augdesc"><span class="augdesc-use">${b.use}</span><span class="augdesc-body">${b.text}</span></span></div>
  <div class="codex-card-foot">서버 표본 없음</div></div></div>`;
}).join("\n");
const html = `<!doctype html><html><head><meta charset="utf-8">
<style>
body{margin:0;background:#0d1712;font-family:"Pretendard","Apple SD Gothic Neo","Noto Sans KR",sans-serif;}
.cell{width:210px;display:inline-block;vertical-align:top;margin:6px;}
.codex-card{--rarity:#a8bcaf;text-align:left;display:flex;flex-direction:column;gap:6px;padding:11px 13px 12px;border-radius:12px;background:#16211b;border:1px solid #2a3a30;border-left:3px solid #7a8c80;box-sizing:border-box;}
.codex-card-name{font-weight:800;color:#f7f3e8;font-size:14.5px;}
.codex-card-desc{font-size:11.8px;line-height:1.45;color:#a8bcaf;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}
.augdesc{display:inline;}
.augdesc-use{display:inline-block;margin-right:6px;padding:1px 7px;border-radius:999px;background:rgba(199,188,255,0.14);border:1px solid rgba(199,188,255,0.34);color:#ded7ff;font-size:0.85em;font-weight:800;white-space:nowrap;vertical-align:1px;}
.augdesc-body{display:inline;}
.codex-card-foot{margin-top:auto;font-size:11.5px;color:#c2d0c5;}
</style></head><body>${cards}</body></html>`;
fs.writeFileSync("qa-lab/round2/text/clamp.html", html);
console.log("wrote", rows.length);
