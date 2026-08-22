/** AUGMENT_PLAY(봇 판단용 메타) 정합 — 유령 행 / 채널 규약 / 배수 극단 */
import { AUGMENT_PLAY, standardAugments, augmentValueMultiplier, augmentThreatMultiplier } from "@majak/core";
import { contentAugments } from "@majak/content";
const all = [...standardAugments, ...contentAugments];
const ids = new Set(all.map((d) => d.id));
const dead = Object.keys(AUGMENT_PLAY).filter((id) => !ids.has(id));
console.log(`catalog=${all.length} play=${Object.keys(AUGMENT_PLAY).length} 유령행=${JSON.stringify(dead)}`);
const V = Object.entries(AUGMENT_PLAY).filter(([,p]:any)=>p.value!==undefined).map(([id,p]:any)=>[id,p.value]);
const T = Object.entries(AUGMENT_PLAY).filter(([,p]:any)=>p.threat!==undefined).map(([id,p]:any)=>[id,p.threat]);
console.log(`value 선언 ${V.length}종, threat 선언 ${T.length}종`);
const topV = [...V].sort((a:any,b:any)=>b[1]-a[1]).slice(0,5);
console.log("value 상위:", JSON.stringify(topV));
// 4장 조합에서 캡에 닿는가
const vids = V.map(([id]:any)=>id);
let capped = 0, tries = 0;
for (let i=0;i<vids.length;i++) for (let j=i+1;j<vids.length;j++) for (let k=j+1;k<vids.length;k++){
  tries++; if (augmentValueMultiplier([vids[i],vids[j],vids[k]] as string[]) >= 3.0) capped++;
}
console.log(`3개 조합 ${tries}건 중 value배수 ≥3.0 인 것 ${capped}`);
console.log("value 캡 도달 예:", vids.length>=3 ? augmentValueMultiplier(topV.map(([id]:any)=>id) as string[]) : "-");
