/**
 * compare — 연구 JSON 둘(기본 봇 · 스위치 켠 봇)을 같은 셀에서 나란히 본다.
 *
 *   node --import tsx/esm packages/server/src/study/compare.ts base.json flagged.json [--tier top]
 *
 * 열: 사람 p · 기본 봇 p · 스위치 봇 p. 스위치 봇이 사람 쪽으로 움직였는지를 한눈에 본다.
 */
import { readFileSync } from "node:fs";
import type { Cell } from "./tally.js";

type Table = Record<string, Cell>;
const [a, b] = [process.argv[2] as string, process.argv[3] as string];
const tier = ((): string => { const i = process.argv.indexOf("--tier"); return i >= 0 ? (process.argv[i + 1] as string) : "top"; })();
const A = JSON.parse(readFileSync(a, "utf-8")) as Record<string, Table>;
const B = JSON.parse(readFileSync(b, "utf-8")) as Record<string, Table>;
const pct = (c: Cell | undefined): string => (c === undefined || c.n === 0 ? "  —" : `${((100 * c.k) / c.n).toFixed(0).padStart(3)}%`);
const row = (label: string, h: Table, ba: Table, bb: Table, key: string): void => {
  const k = `tier=${tier}|${key}`;
  const hc = h[k];
  if (hc === undefined || hc.n < 40) return;
  console.log(`${label.padEnd(34)} 사람 ${pct(hc)}  기본 ${pct(ba[k])}  스위치 ${pct(bb[k])}   (n=${hc.n})`);
};
const cross = (x: [string, string[]], y: [string, string[]]): string[] => x[1].flatMap((v) => y[1].map((w) => `${x[0]}=${v}|${y[0]}=${w}`));

console.log("## 리치 P(리치|가능)");
for (const k of [...cross(["wait", ["1-3", "4-7", "8+"]], ["turn", ["early", "mid", "late"]]), ...cross(["pts", ["<2k", "2-4k", "4-8k", "8k+"]], ["turn", ["early", "mid", "late"]]), ...cross(["wait", ["1-3", "4-7", "8+"]], ["threat", ["none", "some", "riichi"]])])
  row(k, A["riichi"] as Table, A["riichiBot"] as Table, B["riichiBot"] as Table, k);
console.log("\n## 후로 P(울음|기회)");
for (const k of [...cross(["kind", ["yakuhai", "pon", "chi"]], ["sh", ["0", "1", "2", "3+"]]), ...cross(["kind", ["yakuhai", "pon", "chi"]], ["menzen", ["menzen", "open"]]), ...cross(["sh", ["0", "1", "2", "3+"]], ["menzen", ["menzen", "open"]])])
  row(k, A["call"] as Table, A["callBot"] as Table, B["callBot"] as Table, k);
console.log("\n## 수비 P(현물|상대 리치)");
for (const k of cross(["sh", ["0", "1", "2", "3+"]], ["turn", ["early", "mid", "late"]]))
  row(k, A["defense"] as Table, A["defenseBot"] as Table, B["defenseBot"] as Table, k);
console.log("\n## 일치율");
for (const k of ["turn", "reaction"]) {
  const ka = (A["agree"] as Table)[`${k}|${tier}`]; const kb = (B["agree"] as Table)[`${k}|${tier}`];
  console.log(`${k.padEnd(12)} 기본 ${pct(ka)}  스위치 ${pct(kb)}`);
}
const da = (A["draftAgree"] as Table)[tier]; const db = (B["draftAgree"] as Table)[tier];
console.log(`draft        기본 ${pct(da)}  스위치 ${pct(db)}`);
const sa = (A["discardAgree"] as Table)[`tier=${tier}`]; const sb = (B["discardAgree"] as Table)[`tier=${tier}`];
console.log(`discard      기본 ${pct(sa)}  스위치 ${pct(sb)}`);
console.log("\n## 증강 발동 (전체, 옵션 타입 기준 봇)");
const owner = A["augOwner"] as unknown as Record<string, string[]>;
for (const [t, c] of Object.entries(A["augUseBot"] as Table).filter(([k]) => /^type=[^|]+$/.test(k)).sort((x, y) => y[1].n - x[1].n).slice(0, 40)) {
  const id = (owner[t.slice(5)] ?? [])[0] ?? "?";
  const h = (A["augUse"] as Table)[`aug=${id}|tier=${tier}`];
  const cb = (B["augUseBot"] as Table)[t];
  if (h === undefined || h.n < 40) continue;
  console.log(`${(t.slice(5) + " (" + id + ")").padEnd(40)} 사람 ${pct(h)}  기본 ${pct(c)}  스위치 ${pct(cb)}`);
}
