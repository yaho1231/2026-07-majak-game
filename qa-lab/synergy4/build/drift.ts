/**
 * 구조 점검 보강 — `runBuild`(봇 러너)에는 **점수 드리프트 판정이 없다**
 * (harness.runMatch에만 있다). 그래서 같은 빌드들을 harness.runMatch로도 돌려
 * 뱅크 발행 대조(SCORE_DRIFT_*)·불변식·훅 예외를 한 번 더 훑는다.
 *   tsx qa-lab/synergy4/build/drift.ts [seeds=4]
 */
import type { PlayerId } from "@majak/core";
import { PERSONAS, runMatch } from "../../harness.js";
import { BUILDS } from "./builds.js";

const N = Number(process.argv[2] ?? 4);
const personas = { p0: PERSONAS.masher!, p1: PERSONAS.chaos!, p2: PERSONAS.riichiRusher!, p3: PERSONAS.caller! };
let games = 0, crash = 0;
const kinds = new Map<string, number>();
const samples: string[] = [];
for (const b of BUILDS) {
  for (let s = 1; s <= N; s++) {
    const r = await runMatch({
      seed: s, mode: "hanchan",
      preset: { p0: b.ids, p1: [], p2: [], p3: [] } as Record<PlayerId, readonly string[]>,
      personas, timeoutMs: 240_000,
    });
    games++;
    if (r.crash !== undefined) { crash++; samples.push(`CRASH ${b.key}/s${s}: ${r.crash.slice(0, 200)}`); }
    for (const e of r.effectErrors) { kinds.set("EFFECT_ERROR", (kinds.get("EFFECT_ERROR") ?? 0) + 1); if (samples.length < 40) samples.push(`EFFERR ${b.key}/s${s}: ${e.slice(0, 200)}`); }
    for (const v of r.violations) {
      kinds.set(v.kind, (kinds.get(v.kind) ?? 0) + 1);
      if (v.kind !== "SCORE_DRIFT_ATTRIBUTED" && samples.length < 40) samples.push(`${v.kind} ${b.key}/s${s}: ${v.detail.slice(0, 220)}`);
    }
    process.stderr.write(`${b.key} s=${s} ok\n`);
  }
}
console.log(`판=${games} crash=${crash}`);
console.log(JSON.stringify([...kinds], null, 1));
console.log(samples.join("\n"));
