import { splitTerms } from "../../../packages/client/src/glossary.js";
const cases = [
  "⚠ 은닉의 대가가 하나 있다 — 리치봉을 내지 않으므로 공탁이 쌓이지 않는다.",
  "이 두 역만으로는 화료할 수 없다",
  "판돈만큼을 통째로 더 받고",
  "그 판이 끝나면",
  "머리(작두)는 반드시 울지 않은",
  "패산 맨 밑으로 돌아간다",
  "손패의 잡패 하나가",
  "대기만성 (반장전)",
];
for (const c of cases) {
  const hits = (splitTerms(c) as any[]).filter(x=>x.kind==="term").map(x=>`${x.text}→${x.entry.label}`);
  console.log(JSON.stringify(c), "=>", hits.join(", ") || "(없음)");
}
