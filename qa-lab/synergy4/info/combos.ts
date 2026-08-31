/** 이 축의 증강 목록과 2장 조합 전부를 찍는다 (conflicts로 잠긴 것 표시). */
import { AXIS } from "./sweep.js";
import { conflicting } from "../../harness.js";
console.log(`# 축 증강 ${AXIS.length}장`);
let n = 0, locked = 0;
const out: string[] = [];
for (let i = 0; i < AXIS.length; i++)
  for (let j = i + 1; j < AXIS.length; j++) {
    const c = conflicting(AXIS[i]!, AXIS[j]!);
    if (c) { locked++; out.push(`X ${AXIS[i]} + ${AXIS[j]} (conflicts)`); } else { n++; out.push(`- ${AXIS[i]} + ${AXIS[j]}`); }
  }
console.log(`# 2장 조합 ${n + locked}개 (그중 conflicts로 제외 ${locked})`);
for (const l of out) console.log(l);
