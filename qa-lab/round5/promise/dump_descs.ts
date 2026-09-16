/** 개발 보조 — 117장 설명을 한 파일로 덤프 (parse.ts 정규식을 눈으로 맞출 때 쓴다) */
import { standardAugments } from "@majak/core";
import { contentAugments } from "@majak/content";
const all = [...contentAugments, ...standardAugments];
for (const d of all) {
  console.log(`### ${d.id} [${d.tier}/${(d as { category?: string }).category ?? "?"}] modes=${JSON.stringify(d.modes ?? null)}\nD: ${d.description}\nT: ${(d.detail ?? "").replace(/\n/g, " ⏎ ")}\n`);
}
console.error(all.length);
