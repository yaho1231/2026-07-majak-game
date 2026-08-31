/**
 * 축 전체 스윕 — disrupt/defense/river/steal 태그 증강을 2~3장씩 한 사람에게 몰아
 * 실제 반장전/동풍전을 완주시키고 크래시·훅 예외·불변식 위반을 본다.
 * (조합의 «세기»가 아니라 «깨지는가»를 보는 1차 그물)
 */
import { runMatch, PERSONAS, SEATS, conflicting, byId } from "../../harness.js";
import type { PlayerId } from "@majak/core";

const AXIS = [
  "counter","yakuman_shield","pseudo_dealer","last_stand","scapegoat","invincible",
  "hidden_river","discard_lock","seat_swap","parasite","nagashi_yakuman","pond_snatch",
  "grave_rob","spy","karma","silent_swap","rank_gate","void_kan","siege_riichi",
  "no_ron_pact","always_tenpai","call_seal","brief_fog","bottom_yaku","tenpai_scan",
  "danger_sense","disarm","push_riichi","honor_return","frame_up","time_pressure",
  "blind_ron","picky_eater",
];

const pairs: [string, string][] = [];
for (let i = 0; i < AXIS.length; i++)
  for (let j = i + 1; j < AXIS.length; j++) {
    const a = AXIS[i]!, b = AXIS[j]!;
    if (!conflicting(a, b)) pairs.push([a, b]);
  }
console.log(`# 축 내부 짝 ${pairs.length}개 (conflicts 제외)`);

const only = process.argv[2] === undefined ? null : Number(process.argv[2]);
const start = Number(process.env["START"] ?? 0);
const end = Number(process.env["END"] ?? pairs.length);

let bad = 0;
for (let i = start; i < Math.min(end, pairs.length); i++) {
  const [a, b] = pairs[i]!;
  const seed = 9000 + i;
  const preset = { p0: [a, b], p1: [a, b], p2: [], p3: [] } as Record<PlayerId, readonly string[]>;
  const r = await runMatch({
    seed,
    mode: process.env["MODE"] === "hanchan" ? "hanchan" : "tonpuu",
    preset,
    personas: { p0: PERSONAS["masher"]!, p1: PERSONAS["chaos"]!, p2: PERSONAS["riichiRusher"]!, p3: PERSONAS["caller"]! },
    timeoutMs: 90_000,
  });
  const v = r.violations.filter((x) => x.kind !== "SCORE_DRIFT_ATTRIBUTED");
  if (r.crash !== undefined || r.effectErrors.length > 0 || v.length > 0) {
    bad++;
    console.log(`\n!! [${i}] ${a} + ${b} seed=${seed} rounds=${r.rounds}`);
    if (r.crash !== undefined) console.log(`   CRASH ${r.crash.split("\n")[0]}`);
    for (const e of [...new Set(r.effectErrors)].slice(0, 4)) console.log(`   EFFECT ${e}`);
    for (const x of v.slice(0, 5)) console.log(`   ${x.kind} ${x.round} ${x.seat ?? ""} ${x.detail.slice(0, 160)}`);
  } else {
    process.stdout.write(".");
  }
}
console.log(`\n총 ${Math.min(end, pairs.length) - start}판 중 이상 ${bad}건`);
