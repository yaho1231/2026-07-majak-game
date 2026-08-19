/** conflicts 선언 감사 — 비대칭·존재하지 않는 id·자기 자신 */
import { contentAugments } from "@majak/content";
import { standardAugments } from "@majak/core";
const all = [...standardAugments, ...contentAugments];
const byId = new Map(all.map((d) => [d.id, d]));
let asym = 0;
for (const d of all) {
  for (const c of d.conflicts ?? []) {
    if (c === d.id) console.log(`SELF   ${d.id} lists itself`);
    const other = byId.get(c);
    if (other === undefined) { console.log(`UNKNOWN ${d.id} -> ${c} (그런 증강 없음)`); continue; }
    if (!(other.conflicts ?? []).includes(d.id)) {
      asym++;
      console.log(`ASYM   ${d.id} -> ${c} 이지만 ${c} 는 ${d.id} 를 적지 않았다`);
    }
  }
}
console.log(`\n증강 ${all.length}종, conflicts 를 가진 것 ${all.filter((d) => (d.conflicts ?? []).length > 0).length}종, 비대칭 ${asym}건`);
