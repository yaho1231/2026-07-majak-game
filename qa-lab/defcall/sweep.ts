/**
 * defense/call 대량 스윕. 담당 증강 14종을 좌석에 강제 지급하고 페르소나를 섞어 돌린다.
 * 사용: tsx qa-lab/defcall/sweep.ts <fromSeed> <toSeed> [tonpuu]
 */
import { Prng } from "@majak/core";
import type { PlayerId } from "@majak/core";
import { PERSONAS, assignPreset, conflicting } from "../harness.js";
import { runDefcall } from "./run.js";
import { makeChecks } from "./checks.js";

const DEF = ["yakuman_shield", "last_stand", "die_hard", "invincible", "no_ron_pact", "always_tenpai"];
const CALL = ["omni_chi", "open_kokushi", "cliff_bloom", "void_kan", "bluff_pretense", "meld_dissolve", "silent_pact", "snake_kan"];
const MINE = [...DEF, ...CALL];

const P = ["folder", "caller", "masher", "riichiRusher", "chaos", "stall"] as const;

const from = Number(process.argv[2] ?? 1);
const to = Number(process.argv[3] ?? 40);
const mode = (process.argv[4] === "tonpuu" ? "tonpuu" : "hanchan") as "hanchan" | "tonpuu";

const agg: Record<string, number> = {};
let games = 0, rounds = 0, crashes = 0;
const seen = new Set<string>();

for (let seed = from; seed <= to; seed++) {
  const rng = new Prng(seed * 7919 + 13);
  // 좌석별 담당 증강 2개씩 (충돌 회피), 나머지는 랜덤 채움
  const mineShuffled = [...MINE].sort(() => rng.next() - 0.5);
  const preset: Record<PlayerId, string[]> = { p0: [], p1: [], p2: [], p3: [] };
  const seats: PlayerId[] = ["p0", "p1", "p2", "p3"];
  let i = 0;
  for (const s of seats) {
    let guard = 0;
    while (preset[s].length < 2 && guard++ < 60) {
      const id = mineShuffled[i++ % mineShuffled.length]!;
      if (seats.some((q) => preset[q].includes(id))) continue;
      if (preset[s].some((h) => conflicting(h, id))) continue;
      preset[s].push(id);
    }
  }
  // 랜덤 증강 1개씩 더 얹어 상호작용을 만든다
  const filler = assignPreset(rng, mode, [], 1);
  for (const s of seats) {
    const f = filler[s][0];
    if (f !== undefined && !seats.some((q) => preset[q].includes(f)) && !preset[s].some((h) => conflicting(h, f))) {
      preset[s].push(f);
    }
  }
  const personas = Object.fromEntries(
    seats.map((s, k) => [s, PERSONAS[P[(seed + k) % P.length]!]!]),
  ) as any;

  const chk = makeChecks(preset, mode);
  const r = await runDefcall({ seed, mode, preset, personas, onState: chk.onState, onEvent: chk.onEvent });
  games++; rounds += r.rounds;
  for (const [k, v] of Object.entries(chk.stats)) agg[k] = (agg[k] ?? 0) + v;
  if (r.crash !== undefined) {
    crashes++;
    console.log(`CRASH seed=${seed} ${mode} ${r.crash.split("\n").slice(0, 3).join(" | ")}`);
    console.log(`   preset=${JSON.stringify(preset)}`);
  }
  for (const ee of r.effectErrors.slice(0, 3)) {
    const key = `EFFERR ${ee.slice(0, 120)}`;
    if (!seen.has(key)) { seen.add(key); console.log(`${key}  seed=${seed} preset=${JSON.stringify(preset)}`); }
  }
  for (const v of r.violations) {
    const key = `${v.kind}`;
    if (!seen.has(key + (v.detail.slice(0, 40)))) {
      seen.add(key + v.detail.slice(0, 40));
      console.log(`VIOL ${v.kind} seed=${seed} seat=${v.seat ?? "-"} round=${v.round} :: ${v.detail.slice(0, 200)}`);
      console.log(`   preset=${JSON.stringify(preset)}`);
    }
    agg[`viol:${v.kind}`] = (agg[`viol:${v.kind}`] ?? 0) + 1;
  }
}
console.log(`\n=== ${mode} seeds ${from}..${to}: games=${games} rounds=${rounds} crashes=${crashes}`);
console.log(JSON.stringify(Object.fromEntries(Object.entries(agg).sort()), null, 1));
