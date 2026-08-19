/** out/*.jsonl 집계 */
import { readdirSync, readFileSync } from "node:fs";
const dir = new URL("./out/", import.meta.url).pathname;
const rows: any[] = [];
for (const f of readdirSync(dir)) {
  if (!f.endsWith(".jsonl")) continue;
  for (const line of readFileSync(dir + f, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    rows.push(JSON.parse(line));
  }
}
const byKind = new Map<string, any[]>();
for (const r of rows) {
  const kinds = new Set<string>();
  if (r.crash) kinds.add("CRASH:" + String(r.crash).split("\n")[0].slice(0, 90));
  for (const e of r.effectErrors ?? []) kinds.add("EFFECT:" + String(e).slice(0, 90));
  for (const v of r.bad ?? []) kinds.add(v.kind);
  for (const k of kinds) {
    if (!byKind.has(k)) byKind.set(k, []);
    byKind.get(k)!.push(r);
  }
}
const sorted = [...byKind.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [k, list] of sorted) {
  console.log(`\n### ${k}  (${list.length})`);
  for (const r of list.slice(0, 8)) {
    console.log(
      `  ${r.pair.a}×${r.pair.b} [${r.pair.bucket}] seed=${r.seed} ${r.mode} mix=${r.mix} others=${JSON.stringify(r.preset.p1)}${JSON.stringify(r.preset.p2)}${JSON.stringify(r.preset.p3)}`,
    );
    const d = (r.bad ?? []).find((v: any) => v.kind === k);
    if (d) console.log(`     ${d.detail}`);
  }
}
console.log(`\ntotal interesting rows = ${rows.length}`);
