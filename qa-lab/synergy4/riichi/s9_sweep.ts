/**
 * synergy4 / riichi — S9. 리치 축 조합 전체를 실제 반장전으로 돌려 크래시·훅 예외·
 * 불변식 위반을 훑는다. (값 비교는 s1~s8의 유닛 재현이 하고, 여기서는 «깨지는가»만 본다)
 */
import { Prng } from "@majak/core";
import { runMatch, PERSONAS, assignPreset, conflicting } from "../../harness.js";
import type { PlayerId } from "@majak/core";

const AXIS = [
  "counter", "ura_peek", "riichi_upgrade", "free_riichi_discard", "peek_riichi_waits",
  "last_stand", "hidden_blade", "open_riichi_reveal", "no_retreat", "all_or_nothing",
  "pond_snatch", "riichi_seal", "off_by_one", "ankan_dora", "stealth_riichi",
  "siege_riichi", "async_chiitoi", "soul_hunt", "no_ron_pact", "late_double",
  "meld_dissolve", "silent_pact", "regret", "push_riichi", "palm_flip", "soul_strike",
];

const pairs: [string, string][] = [];
for (let i = 0; i < AXIS.length; i++) {
  for (let j = i + 1; j < AXIS.length; j++) {
    const a = AXIS[i] as string, b = AXIS[j] as string;
    if (!conflicting(a, b)) pairs.push([a, b]);
  }
}
const only = process.argv[2] === undefined ? pairs : pairs.slice(0, Number(process.argv[2]));
console.log(`조합 ${pairs.length}쌍 (conflicts 제외) 중 ${only.length}쌍 실행`);

const personas = {
  p0: PERSONAS["riichiRusher"]!, p1: PERSONAS["masher"]!,
  p2: PERSONAS["chaos"]!, p3: PERSONAS["caller"]!,
} as Record<PlayerId, (typeof PERSONAS)[string]>;

let bad = 0;
for (let i = 0; i < only.length; i++) {
  const [a, b] = only[i] as [string, string];
  const seed = 9000 + i;
  const preset = assignPreset(new Prng(seed), "hanchan", [a, b], 2);
  // p1에게도 반대편 카드를 하나 심어 «상대 리치»가 실제로 생기게 한다
  const r = await runMatch({ seed, mode: "hanchan", preset, personas, timeoutMs: 90_000 });
  const hard = r.violations.filter((v) => v.kind !== "SCORE_DRIFT_ATTRIBUTED");
  if (r.crash !== undefined || r.effectErrors.length > 0 || hard.length > 0) {
    bad++;
    console.log(`\n!! [${a} + ${b}] seed=${seed}`);
    if (r.crash !== undefined) console.log(`   crash: ${r.crash.split("\n")[0]}`);
    for (const e of [...new Set(r.effectErrors)].slice(0, 5)) console.log(`   effectError: ${e}`);
    for (const v of hard.slice(0, 5)) console.log(`   ${v.kind} ${v.round}: ${v.detail.slice(0, 200)}`);
  } else if (i % 25 === 0) {
    console.log(`  .. ${i}/${only.length} ok (${a}+${b})`);
  }
}
console.log(`\n== 이상 있는 조합 ${bad} / ${only.length}`);
