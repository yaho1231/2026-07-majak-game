/**
 * 웨이브 2 — 버킷을 통째로(전수) 돌린다. 진행 로그도 파일에 즉시 flush 한다.
 *   tsx qa-lab/pairs/run2.ts <shard> <shards> <bucket> <mode> <seedBase> [dual]
 * bucket: usesCtl | deltas | tilesWin | state | misc
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { Prng } from "@majak/core";
import { buildBuckets } from "./gen.js";
import { runPair } from "./lib.js";

const shard = Number(process.argv[2] ?? 0);
const shards = Number(process.argv[3] ?? 1);
const bucket = process.argv[4] ?? "usesCtl";
const mode = (process.argv[5] ?? "hanchan") as "hanchan" | "tonpuu";
const seedBase = Number(process.argv[6] ?? 5000);
const dual = process.argv[7] === "dual";
const limit = Number(process.argv[8] ?? 1e9);

const bk = buildBuckets(mode);
let pairs = [...(bk[bucket] ?? [])];
if (pairs.length > limit) {
  const rng = new Prng(99);
  const picked: typeof pairs = [];
  while (picked.length < limit && pairs.length > 0) picked.push(pairs.splice(rng.int(pairs.length), 1)[0]!);
  pairs = picked;
}
const mine = pairs.filter((_, i) => i % shards === shard);

mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
const tag = `${bucket}-${mode}${dual ? "-dual" : ""}-${shard}`;
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
log(`start ${tag} pairs=${mine.length}`);
for (let i = 0; i < mine.length; i++) {
  const p = mine[i]!;
  const seed = seedBase + i * 31 + shard * 3;
  let r;
  try {
    r = await runPair(p, seed, mode, i % 3, dual);
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
        dual,
        preset: r.preset,
        crash: r.crash,
        effectErrors: r.effectErrors.slice(0, 5),
        bad: r.bad.slice(0, 8),
        rounds: r.rounds,
        mix: i % 3,
      }) + "\n",
    );
    log(
      `HIT ${p.a}×${p.b} seed=${seed} crash=${r.crash?.split("\n")[0] ?? "-"} eff=${r.effectErrors.length} bad=${[...new Set(r.bad.map((v) => v.kind))].join(",")}`,
    );
  }
  if (games % 5 === 0) log(`${games}/${mine.length} rounds=${rounds} hits=${hits} ${Math.round((Date.now() - t0) / 1000)}s`);
}
log(`COVER a=${touchedA} b=${touchedB} both=${touchedBoth} / ${games}`);
log(`DONE games=${games} rounds=${rounds} hits=${hits} ${Math.round((Date.now() - t0) / 1000)}s`);
