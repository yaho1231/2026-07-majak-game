/** 시너지 축 선언 vs 실제 구현(소스 키워드) 대조 — 후보 추림 */
import { AUGMENT_SYNERGY, standardAugments } from "@majak/core";
import { contentAugments } from "@majak/content";
import { readFileSync, existsSync } from "node:fs";

const all = [...standardAugments, ...contentAugments];
const dir = "packages/content/src/augments/";
const EVID: Record<string, RegExp> = {
  kan: /kan|깡/i,
  riichi: /riichi|리치/i,
  riichi_value: /ura|ippatsu|일발|뒷도라|riichi/i,
  dora: /dora|도라/i,
  chiitoi: /chiitoi|치또이|칠대자/i,
  kokushi: /kokushi|국사/i,
  yakuman: /yakuman|역만/i,
  honor: /honor|자패|字牌/i,
  terminal: /terminal|요구패|1·9|yaochu/i,
  tanyao: /tanyao|탕야오|단요/i,
  dealer: /dealer|오야|친/i,
  draw: /exhaustive|유국|draw|황패/i,
  call: /call|pon|chi|후로|울/i,
  menzen: /menzen|멘젠|문전/i,
  suit: /suit|색|청일|혼일/i,
};
const rows: string[] = [];
for (const d of all) {
  const e = AUGMENT_SYNERGY[d.id];
  if (e === undefined) continue;
  const f = `${dir}${d.id}.ts`;
  if (!existsSync(f)) { rows.push(`(소스 없음) ${d.id}`); continue; }
  const src = readFileSync(f, "utf-8");
  const bad = e.tags.filter((t) => EVID[t] !== undefined && !EVID[t]!.test(src));
  if (bad.length > 0) rows.push(`${d.id} [${(d as {name?:string}).name ?? ""}] 선언=${e.tags.join(",")} 근거없음=${bad.join(",")}`);
}
console.log(rows.join("\n") || "(근거 없는 축 선언 0)");
console.log(`\n검사한 증강 ${all.length}종`);
