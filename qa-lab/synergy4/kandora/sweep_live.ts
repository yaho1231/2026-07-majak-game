/**
 * 실판 스위프 — 깡·도라·타점 축 28종의 2장 조합을 동풍전으로 완주시키며
 * 크래시 · 훅 예외 · 불변식 위반 · 설명 불가 점수 드리프트를 본다.
 *
 * 축의 조합은 C(28,2)=378 개다. conflicts로 잠긴 것만 뺀다.
 * 시간 관계상 seed 하나씩 — 목적은 «이 축의 조합이 판을 깨뜨리는가»의 1차 필터다.
 */
import { runMatch, PERSONAS, conflicting, byId } from "../../harness.js";
import type { PlayerId } from "@majak/core";

const AXIS = [
  "red_five_touch", "counter", "ura_peek", "rinshan_preview", "hidden_blade",
  "scapegoat", "let_it_ride", "jackpot", "big_hand", "cliff_bloom",
  "blood_contract", "aotenjou_ceiling", "devils_advance", "all_or_nothing",
  "eternal_dealer", "ankan_dora", "void_kan", "honba_hunter", "unification",
  "soul_hunt", "blame_shift", "dora_conceal", "snake_kan", "north_trader",
  "mirror_dora", "blind_ron", "dora_afterimage", "sign_flip",
];

async function main(): Promise<void> {
  const pairs: [string, string][] = [];
  for (let i = 0; i < AXIS.length; i++) {
    for (let j = i + 1; j < AXIS.length; j++) {
      const a = AXIS[i] as string, b = AXIS[j] as string;
      if (conflicting(a, b)) continue;
      if (byId.get(a) === undefined || byId.get(b) === undefined) { console.log(`?? 미등록: ${a}/${b}`); continue; }
      pairs.push([a, b]);
    }
  }
  const only = process.argv[2] === undefined ? pairs : pairs.slice(0, Number(process.argv[2]));
  console.log(`조합 ${only.length}개 (conflicts 제외, 전체 ${(AXIS.length * (AXIS.length - 1)) / 2}개 중)`);
  let bad = 0;
  for (const [a, b] of only) {
    const preset: Record<PlayerId, readonly string[]> = { p0: [a, b], p1: [], p2: [], p3: [] };
    const r = await runMatch({
      seed: 4200 + pairs.indexOf([a, b] as never),
      mode: "tonpuu",
      preset,
      personas: { p0: PERSONAS["masher"]!, p1: PERSONAS["caller"]!, p2: PERSONAS["riichiRusher"]!, p3: PERSONAS["chaos"]! },
      timeoutMs: 90_000,
    });
    const un = r.violations.filter((v) => v.kind !== "SCORE_DRIFT_ATTRIBUTED");
    const hard = un.filter((v) => v.kind !== "SCORE_DRIFT_UNEXPLAINED");
    if (r.crash !== undefined || r.effectErrors.length > 0 || un.length > 0) {
      bad++;
      console.log(`\n### ${a} + ${b}`);
      if (r.crash !== undefined) console.log(`  CRASH: ${r.crash.split("\n")[0]}`);
      for (const e of r.effectErrors.slice(0, 3)) console.log(`  EFFECT_ERR: ${e}`);
      const kinds = new Map<string, number>();
      for (const v of un) kinds.set(v.kind, (kinds.get(v.kind) ?? 0) + 1);
      console.log(`  위반: ${[...kinds].map(([k, n]) => `${k}×${n}`).join(", ")}`);
      for (const v of hard.slice(0, 2)) console.log(`    ${v.kind} ${v.round} ${v.detail}`);
      for (const v of un.filter((x) => x.kind === "SCORE_DRIFT_UNEXPLAINED").slice(0, 2)) {
        console.log(`    DRIFT ${v.round} ${v.detail.slice(0, 200)}`);
      }
    } else {
      process.stdout.write(".");
    }
  }
  console.log(`\n\n완료 — 신호 있는 조합 ${bad} / ${only.length}`);
}
void main();
