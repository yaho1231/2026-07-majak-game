/**
 * score-b 대량 퍼즈 — 내 담당 10종(scoring)을 강제 배정해 돌린다.
 * 사용: tsx qa-lab/score-b/fuzz.ts <from> <to> [hanchan|tonpuu] [pure|mixed]
 *
 *  - pure : 내 10종만 배정한다(다른 증강의 잡음 없이 도라/정산 불변식을 본다)
 *  - mixed: 내 10종 + 무작위 증강을 섞는다(교차 상호작용)
 */
import { Prng } from "@majak/core";
import type { PlayerId } from "@majak/core";
import { assignPreset } from "../harness.js";
import { MINE, PERSONAS, runMatch, tally } from "./run.js";

const from = Number(process.argv[2] ?? 1);
const to = Number(process.argv[3] ?? 20);
const mode = (process.argv[4] ?? "hanchan") as "hanchan" | "tonpuu";
const arg5 = process.argv[5] ?? "pure";
const pure = arg5 !== "mixed";
const noDraft = arg5 === "strict";

const personaNames = ["masher", "riichiRusher", "caller", "chaos", "folder", "stall"];
const total: Record<string, number> = {};
let matches = 0, settles = 0, crashes = 0;
const cover: Record<string, number> = {};

for (let seed = from; seed <= to; seed++) {
  const rng = new Prng(seed ^ 0xbeef);
  const forced: Record<PlayerId, string[]> = { p0: [], p1: [], p2: [], p3: [] };
  const pool = [...MINE] as string[];
  // 10종을 네 자리에 흩뿌린다 (자리당 2~3개)
  for (const s of ["p0", "p1", "p2", "p3"] as PlayerId[]) {
    const n = pure ? 2 + rng.int(2) : 1 + rng.int(2);
    for (let i = 0; i < n && pool.length > 0; i++) {
      forced[s].push(pool.splice(rng.int(pool.length), 1)[0] as string);
    }
  }
  // 남은 것은 무작위 자리에 얹어 10종이 모두 테이블에 오르게 한다
  while (pool.length > 0) {
    const s = (["p0", "p1", "p2", "p3"] as PlayerId[])[rng.int(4)]!;
    forced[s].push(pool.pop() as string);
  }
  const mk = (a: string[], b: string[]): string[] => [...new Set([...a, ...b])].slice(0, 4);
  const base = pure
    ? { p0: [], p1: [], p2: [], p3: [] }
    : assignPreset(rng, mode, [], 3);
  const preset = {
    p0: mk(forced.p0, base.p0), p1: mk(forced.p1, base.p1),
    p2: mk(forced.p2, base.p2), p3: mk(forced.p3, base.p3),
  };
  for (const ids of Object.values(preset)) for (const id of ids) cover[id] = (cover[id] ?? 0) + 1;
  const personas = {
    p0: PERSONAS[personaNames[rng.int(personaNames.length)]!]!,
    p1: PERSONAS[personaNames[rng.int(personaNames.length)]!]!,
    p2: PERSONAS[personaNames[rng.int(personaNames.length)]!]!,
    p3: PERSONAS[personaNames[rng.int(personaNames.length)]!]!,
  };
  const r = await runMatch({ seed, mode, preset, personas, ...(noDraft ? { noDraft: true } : {}) });
  matches++;
  settles += r.settles;
  const line = (s: string): void => console.log(s);
  if (r.crash !== undefined) {
    crashes++;
    line(`CRASH seed=${seed} ${mode} ${arg5} ${r.crash.split("\n")[0]}`);
    line(`  preset=${JSON.stringify(preset)}`);
  }
  if (r.effectErrors.length > 0) {
    line(`EFFERR seed=${seed} ${mode} ${JSON.stringify(r.effectErrors.slice(0, 3))}`);
    line(`  preset=${JSON.stringify(preset)}`);
  }
  const t = tally(r.violations);
  for (const [k, n] of Object.entries(t)) total[k] = (total[k] ?? 0) + n;
  if (r.violations.length > 0) {
    const shown = new Set<string>();
    for (const v of r.violations) {
      if (shown.has(v.kind)) continue;
      shown.add(v.kind);
      line(`VIOL seed=${seed} ${mode} ${arg5} [${v.kind}] ${v.round} ${v.seat ?? "-"} ${v.detail}`);
    }
    line(`  preset=${JSON.stringify(preset)}`);
  }
  if (seed % 10 === 0) line(`.. seed=${seed} matches=${matches} settles=${settles}`);
}
console.log(`\n== ${from}..${to} ${mode} ${arg5}: matches=${matches} settles=${settles} crashes=${crashes}`);
console.log(`== totals ${JSON.stringify(total)}`);
console.log(`== coverage ${JSON.stringify(cover)}`);
