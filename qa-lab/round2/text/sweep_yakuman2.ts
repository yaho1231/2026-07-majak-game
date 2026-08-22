import { readFileSync, readdirSync } from "node:fs";
const rows = JSON.parse(readFileSync("qa-lab/round2/text/catalog.json","utf8"));
const byId = new Map(rows.map((r:any)=>[r.id,r]));
type Row = {id:string;name:string;via:string;note:string};
const out: Row[] = [];
const scan = (path: string, ids: string[]) => {
  const src = readFileSync(path,"utf8");
  for (const id of ids) {
    const r: any = byId.get(id); if (!r) continue;
    const t = r.description + " " + (r.detail ?? "");
    const ok = /역만에는? 미적용|역만 손에는|역만에 적용되지|역만 손에 붙지|역만에는 붙지/.test(t);
    // 그 파일이 실제로 판 보너스를 얹는가
    const via = /addWinHanBonus/.test(src) ? "addWinHanBonus" : /addHanBonus/.test(src) ? "score.extraHan" : "";
    if (via === "") continue;
    out.push({id, name:r.name, via, note: ok ? "예외 명시함" : "★ 문구에 예외 없음"});
  }
};
for (const f of readdirSync("packages/content/src/augments").filter(f=>f.endsWith(".ts")))
  scan("packages/content/src/augments/"+f, [f.replace(/\.ts$/,"")]);
// 표준 4종은 한 파일에 몰려 있어 개별 판정이 안 된다 — 손으로 확인한 것만
for (const id of ["iron_wall","open_riichi","yakuless_win"]) {
  const r: any = byId.get(id)!;
  const t = r.description + " " + (r.detail ?? "");
  out.push({id, name:r.name, via:"addWinHanBonus(standardAugments)", note: /역만/.test(t) ? "예외 명시함" : "★ 문구에 예외 없음"});
}
const bad = out.filter(o=>o.note.startsWith("★"));
console.log("판 보너스를 얹는 증강:", out.length, "종");
for (const o of out) console.log(` ${o.note.startsWith("★")?"★":"·"} ${o.id}(${o.name}) via ${o.via} — ${o.note}`);
console.log("\n문구에 '역만 미적용'이 빠진 것:", bad.length, "종");
console.log(bad.map(b=>b.id).join(" "));
