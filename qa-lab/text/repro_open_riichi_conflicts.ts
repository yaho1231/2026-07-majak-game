/** 오픈 리치 문구가 세는 배타 목록 vs 실제 conflicts */
import { contentAugments } from "@majak/content";
const byId = new Map(contentAugments.map((a: any) => [a.id, a]));
const d: any = byId.get("open_riichi_reveal");
console.log("DETAIL 끝문장:", d.detail.split("\n").pop().split(". ").pop());
console.log("실제 conflicts:", d.conflicts.map((c: string) => `${c}(${byId.get(c)?.name})`));
// 역방향까지 포함한 실제 배타 집합
const sym = new Set<string>(d.conflicts);
for (const a of contentAugments as any[]) if ((a.conflicts ?? []).includes("open_riichi_reveal")) sym.add(a.id);
console.log("대칭 배타 전체:", [...sym].map(c => `${c}(${byId.get(c)?.name})`));
console.log("문구가 세는 것: 승부수(last_stand) · 손바닥 뒤집기(palm_flip) · 염색(tile_dyeing)");
console.log("문구에 없는데 실제로 잠기는 것:", [...sym].filter(c => !["last_stand","palm_flip","tile_dyeing"].includes(c)).map(c => `${c}(${byId.get(c)?.name})`));
