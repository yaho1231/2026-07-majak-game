/** 축 내부 «서로를 키워 줄 법한» 조합 목록을 뽑아 둔다 (보고서 부록용). */
import { conflicting, byId } from "../../harness.js";

const AXIS = [
  "counter","yakuman_shield","pseudo_dealer","last_stand","scapegoat","invincible",
  "hidden_river","discard_lock","seat_swap","parasite","nagashi_yakuman","pond_snatch",
  "grave_rob","spy","karma","silent_swap","rank_gate","void_kan","siege_riichi",
  "no_ron_pact","always_tenpai","call_seal","brief_fog","bottom_yaku","tenpai_scan",
  "danger_sense","disarm","push_riichi","honor_return","frame_up","time_pressure",
  "blind_ron","picky_eater",
];
const CLUSTER: Record<string, string[]> = {
  "강 회수(버림패를 손·화료로 되살린다)": ["pond_snatch","grave_rob","silent_swap","frame_up"],
  "강 이력으로 값을 만든다": ["bottom_yaku","nagashi_yakuman","picky_eater","honor_return","frame_up"],
  "강을 가린다(정보)": ["hidden_river","brief_fog","tenpai_scan","danger_sense"],
  "방총·실점을 줄인다": ["yakuman_shield","invincible","no_ron_pact","always_tenpai","karma"],
  "지불자를 재배선한다": ["scapegoat","blind_ron","parasite","spy"],
  "상대 화료에 +판/강탈": ["counter","push_riichi","scapegoat","spy","parasite","karma"],
  "상대 행동을 막는다": ["discard_lock","call_seal","rank_gate","disarm","invincible","no_ron_pact","time_pressure","blind_ron"],
  "상대를 리치로 민다/리치를 판다": ["counter","push_riichi","siege_riichi","last_stand"],
  "자리·오야를 흔든다": ["seat_swap","pseudo_dealer"],
  "깡/창깡": ["void_kan"],
};

let n = 0;
for (const [name, ids] of Object.entries(CLUSTER)) {
  const out: string[] = [];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i]!, b = ids[j]!;
      out.push(conflicting(a, b) ? `~~${a}+${b}(conflicts)~~` : `${a}+${b}`);
    }
  n += out.length;
  console.log(`\n### ${name} (${ids.length}장)\n${out.join(", ")}`);
}
const all: string[] = [];
for (let i = 0; i < AXIS.length; i++)
  for (let j = i + 1; j < AXIS.length; j++)
    if (!conflicting(AXIS[i]!, AXIS[j]!)) all.push(`${AXIS[i]}+${AXIS[j]}`);
console.log(`\n클러스터 내 짝 ${n}개 · 축 전체 짝 ${all.length}개(conflicts 제외, 전체 ${AXIS.length * (AXIS.length - 1) / 2}개 중)`);
const locked: string[] = [];
for (let i = 0; i < AXIS.length; i++)
  for (let j = i + 1; j < AXIS.length; j++)
    if (conflicting(AXIS[i]!, AXIS[j]!)) locked.push(`${AXIS[i]}+${AXIS[j]}`);
console.log(`conflicts 로 잠긴 짝: ${locked.join(", ")}`);
