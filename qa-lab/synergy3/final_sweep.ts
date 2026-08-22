/**
 * 최종 스위프 — 3라운드 수정 전체를 실게임으로 태운다.
 * 좌석마다 무작위 2~3증강, 페르소나 혼합. 크래시·훅 예외·불변식 위반만 본다.
 */
import { PERSONAS, runMatch, byId } from "../harness.js";
import type { PlayerId } from "@majak/core";

const IDS = [...byId.keys()];
const P = Object.values(PERSONAS);
const N = Number(process.argv[2] ?? 24);
const START = Number(process.argv[3] ?? 5000);
let crash = 0, eff = 0, viol = 0, rounds = 0;
const seen = new Map<string, number>();
for (let i = 0; i < N; i++) {
  const seed = START + i;
  const rng = (n: number, k: number): number => (seed * 7919 + k * 104729) % n;
  const preset = {} as Record<PlayerId, readonly string[]>;
  (["p0", "p1", "p2", "p3"] as PlayerId[]).forEach((p, si) => {
    const n = 2 + (rng(2, si));
    const ids: string[] = [];
    for (let k = 0; k < n; k++) {
      const id = IDS[rng(IDS.length, si * 13 + k * 31)] as string;
      if (!ids.includes(id)) ids.push(id);
    }
    preset[p] = ids;
  });
  const r = await runMatch({
    seed, mode: "tonpuu", preset,
    personas: {
      p0: P[rng(P.length, 1)]!, p1: P[rng(P.length, 2)]!,
      p2: P[rng(P.length, 3)]!, p3: P[rng(P.length, 4)]!,
    } as never,
  });
  rounds += r.rounds;
  if (r.crash !== undefined) { crash++; console.log(`CRASH seed=${seed}`, JSON.stringify(preset), r.crash.split("\n")[0]); }
  if (r.effectErrors.length > 0) { eff += r.effectErrors.length; console.log(`EFFERR seed=${seed}`, r.effectErrors.slice(0, 3)); }
  for (const v of r.violations) {
    if (v.kind === "SCORE_DRIFT_ATTRIBUTED") continue;
    viol++; seen.set(v.kind, (seen.get(v.kind) ?? 0) + 1);
    if ((seen.get(v.kind) ?? 0) <= 2) console.log(`VIOL seed=${seed} ${v.kind} ${v.detail.slice(0, 160)}`);
  }
}
console.log(`\n${N}게임 ${rounds}국 · crash=${crash} effectError=${eff} 위반=${viol}`, [...seen]);
