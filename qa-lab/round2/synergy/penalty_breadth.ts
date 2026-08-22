import { AUGMENT_SYNERGY, synergyBias, standardAugments } from "@majak/core";
import { contentAugments } from "@majak/content";
const all = [...standardAugments, ...contentAugments];
const ids = all.map(d=>d.id);
const rows = ids.map((h) => {
  const b = synergyBias([h]);
  const pen = Object.values(b).filter(v=>v<1).length;
  const bonus = Object.values(b).filter(v=>v>1).length;
  return { h, pen, bonus, pct: (pen/ids.length*100) };
}).sort((a,b)=>b.pen-a.pen);
console.log("total catalog", ids.length);
console.log("TOP penalizers:"); for (const r of rows.slice(0,12)) console.log(`  ${r.h}: penalized=${r.pen} (${r.pct.toFixed(1)}%) boosted=${r.bonus}`);
// 4개 보유 시 (마지막 스테이지) 남는 중립/보너스 후보
let worstN = 0, worstK = "";
for (let i=0;i<400;i++){
  const held: string[] = [];
  for (let k=0;k<3;k++) held.push(ids[(i*17+k*29)%ids.length]!);
  const b = synergyBias(held);
  const pen = Object.entries(b).filter(([,v])=>v<1).length;
  if (pen>worstN){worstN=pen;worstK=held.join("+");}
}
console.log(`3개 보유 최악: ${worstN}/${ids.length} 페널티 (${worstK})`);
