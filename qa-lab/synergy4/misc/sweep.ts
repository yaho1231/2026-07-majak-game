/**
 * 축 전체 짝(2장) 스위프 — 크래시·훅 예외·불변식 위반·설명 없는 점수 발행을 훑는다.
 * (효과의 «키워 주는가»는 개별 스크립트에서 재고, 여기서는 «깨지는가»만 본다.)
 */
import { runMatch, PERSONAS, conflicting, byId } from "../../harness.js";
import type { PlayerId } from "@majak/core";

const AXIS = [
  "avenger", "omni_chi", "pseudo_dealer", "die_hard", "hidden_blade",
  "open_kokushi", "seat_swap", "eternal_dealer", "broken_border", "pond_snatch",
  "karma", "honba_hunter", "mixed_triplet", "async_chiitoi", "bluff_pretense",
  "no_ron_pact", "meld_dissolve", "silent_pact", "regret", "sign_flip",
  "reload", "free_riichi_discard", "late_double",
];

const pairs: [string, string][] = [];
for (let i = 0; i < AXIS.length; i++) {
  for (let j = i + 1; j < AXIS.length; j++) {
    const a = AXIS[i] as string, b = AXIS[j] as string;
    if (conflicting(a, b)) continue;
    pairs.push([a, b]);
  }
}
const only = process.argv[2] === undefined ? null : Number(process.argv[2]);
const slice = process.argv[3] === undefined ? pairs.length : Number(process.argv[3]);
const todo = only === null ? pairs : pairs.slice(only, only + slice);
console.log(`# 짝 ${todo.length} / 전체 ${pairs.length}`);

const personas = {
  p0: PERSONAS["masher"]!, p1: PERSONAS["caller"]!,
  p2: PERSONAS["riichiRusher"]!, p3: PERSONAS["chaos"]!,
} as Record<PlayerId, (typeof PERSONAS)[string]>;

let bad = 0;
for (const [a, b] of todo) {
  for (const seed of [11, 29]) {
    const preset = { p0: [a, b], p1: [], p2: [], p3: [] } as Record<PlayerId, readonly string[]>;
    const r = await runMatch({ seed, mode: "tonpuu", preset, personas, timeoutMs: 90_000 });
    const hard = r.violations.filter((v) => v.kind !== "SCORE_DRIFT_ATTRIBUTED");
    if (r.crash !== undefined || r.effectErrors.length > 0 || hard.length > 0) {
      bad++;
      console.log(`!! ${a}+${b} seed=${seed}`);
      if (r.crash !== undefined) console.log(`   crash: ${r.crash.split("\n")[0]}`);
      for (const e of [...new Set(r.effectErrors)].slice(0, 3)) console.log(`   effect: ${e}`);
      for (const v of hard.slice(0, 3)) console.log(`   ${v.kind} ${v.round}: ${v.detail}`);
    }
  }
}
console.log(`# 끝 — 문제 있는 조합 ${bad}`);
