/**
 * 웨이브 3 — "버림/선언 경로에 제약을 거는 것" × "버림/선언 경로를 바꾸는 것".
 * 소프트락(빈 선택지)·강제 버림 충돌을 노린다. dual(두 자리가 같은 짝) 고정.
 *   tsx qa-lab/pairs/run3.ts <shard> <shards> <mode> <seedBase>
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { runPair, usable } from "./lib.js";
import type { Pair } from "./lib.js";

const RESTRICT = [
  "discard_lock",
  "time_pressure",
  "call_seal",
  "riichi_seal",
  "no_ron_pact",
  "silent_pact",
  "hidden_river",
  "frame_up",
  "seat_swap",
  "table_flip",
  "meld_dissolve",
  "brief_fog",
  "three_dragons_will",
  "picky_eater",
];
const REROUTE = [
  "no_retreat",
  "stealth_riichi",
  "free_riichi_discard",
  "open_riichi_reveal",
  "siege_riichi",
  "push_riichi",
  "palm_flip",
  "take_back",
  "regret",
  "silent_swap",
  "giant_god",
  "tile_split",
  "honor_return",
  "north_trader",
  "full_hand_swap",
  "hand_swap3",
  "grave_rob",
  "pond_snatch",
];

const shard = Number(process.argv[2] ?? 0);
const shards = Number(process.argv[3] ?? 1);
const mode = (process.argv[4] ?? "hanchan") as "hanchan" | "tonpuu";
const seedBase = Number(process.argv[5] ?? 9000);

/** 강(버림패)·후로 자리를 물리적으로 되감는 것들 — 서로 부딪히면 패가 겹치거나 사라진다 */
const RIVER = [
  "take_back",
  "regret",
  "grave_rob",
  "silent_swap",
  "pond_snatch",
  "meld_dissolve",
  "blind_ron",
  "frame_up",
  "hidden_river",
  "table_flip",
  "north_trader",
  "giant_god",
];

const pairs: Pair[] = [];
const seen = new Set<string>();
const add = (a: string, b: string): void => {
  if (!usable(a, b, mode)) return;
  const k = a < b ? `${a}|${b}` : `${b}|${a}`;
  if (seen.has(k)) return;
  seen.add(k);
  pairs.push({ a, b, bucket: "restrict" });
};
for (const a of RESTRICT) for (const b of REROUTE) add(a, b);
for (let i = 0; i < RIVER.length; i++) for (let j = i + 1; j < RIVER.length; j++) add(RIVER[i]!, RIVER[j]!);
const mine = pairs.filter((_, i) => i % shards === shard);
mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
const tag = `restrict-${mode}-${shard}`;
const outFile = new URL(`./out/${tag}.jsonl`, import.meta.url).pathname;
const logFile = new URL(`./out/${tag}.log`, import.meta.url).pathname;
const log = (s: string): void => {
  appendFileSync(logFile, s + "\n");
};

let games = 0;
let rounds = 0;
let hits = 0;
let touchedA = 0;
let touchedB = 0;
let touchedBoth = 0;
const t0 = Date.now();
log(`start ${tag} pairs=${mine.length} (total ${pairs.length})`);
for (let i = 0; i < mine.length; i++) {
  const p = mine[i]!;
  const seed = seedBase + i * 41 + shard * 5;
  let r;
  try {
    r = await runPair(p, seed, mode, i % 3, true);
  } catch (e) {
    log(`RUNNER_THROW ${p.a}×${p.b} seed=${seed} ${String(e)}`);
    continue;
  }
  games++;
  rounds += r.rounds;
  if (r.touched.a) touchedA++;
  if (r.touched.b) touchedB++;
  if (r.touched.a && r.touched.b) touchedBoth++;
  if (r.crash !== undefined || r.effectErrors.length > 0 || r.bad.length > 0) {
    hits++;
    appendFileSync(
      outFile,
      JSON.stringify({
        pair: r.pair,
        seed: r.seed,
        mode: r.mode,
        dual: true,
        preset: r.preset,
        crash: r.crash,
        effectErrors: r.effectErrors.slice(0, 5),
        bad: r.bad.slice(0, 8),
        rounds: r.rounds,
        mix: i % 3,
      }) + "\n",
    );
    log(
      `HIT ${p.a}×${p.b} seed=${seed} mix=${i % 3} crash=${r.crash?.split("\n")[0] ?? "-"} eff=${r.effectErrors.length} bad=${[...new Set(r.bad.map((v) => v.kind))].join(",")}`,
    );
  }
  if (games % 5 === 0) log(`${games}/${mine.length} rounds=${rounds} hits=${hits} ${Math.round((Date.now() - t0) / 1000)}s`);
}
log(`COVER a=${touchedA} b=${touchedB} both=${touchedBoth} / ${games}`);
log(`DONE games=${games} rounds=${rounds} hits=${hits} ${Math.round((Date.now() - t0) / 1000)}s`);
