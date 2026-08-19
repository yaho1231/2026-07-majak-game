/**
 * 짝 스윕 러너.
 *   tsx qa-lab/pairs/run.ts <shard> <shards> <count> [mode]
 * 결과 JSONL: qa-lab/pairs/out/<mode>-<shard>.jsonl
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { samplePairs } from "./gen.js";
import { runPair } from "./lib.js";

const shard = Number(process.argv[2] ?? 0);
const shards = Number(process.argv[3] ?? 1);
const count = Number(process.argv[4] ?? 60);
const mode = (process.argv[5] ?? "tonpuu") as "hanchan" | "tonpuu";
const seedBase = Number(process.argv[6] ?? 1000);

const all = samplePairs(count, mode, 42);
const mine = all.filter((_, i) => i % shards === shard);
mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
const outFile = new URL(`./out/${mode}-${shard}.jsonl`, import.meta.url).pathname;

let games = 0;
let rounds = 0;
let hits = 0;
const t0 = Date.now();
for (let i = 0; i < mine.length; i++) {
  const p = mine[i]!;
  const seed = seedBase + i * 17 + shard;
  const r = await runPair(p, seed, mode, i % 3);
  games++;
  rounds += r.rounds;
  const interesting =
    r.crash !== undefined || r.effectErrors.length > 0 || r.bad.length > 0;
  if (interesting) {
    hits++;
    appendFileSync(
      outFile,
      JSON.stringify({
        pair: r.pair,
        seed: r.seed,
        mode: r.mode,
        preset: r.preset,
        crash: r.crash,
        effectErrors: r.effectErrors.slice(0, 5),
        bad: r.bad.slice(0, 8),
        rounds: r.rounds,
        mix: i % 3,
      }) + "\n",
    );
    console.log(
      `[${shard}] HIT ${p.a}×${p.b} (${p.bucket}) seed=${seed} crash=${r.crash?.split("\n")[0] ?? "-"} eff=${r.effectErrors.length} bad=${r.bad.map((v) => v.kind).join(",")}`,
    );
  }
  if (games % 10 === 0) {
    console.log(
      `[${shard}] ${games}/${mine.length} games rounds=${rounds} hits=${hits} ${Math.round((Date.now() - t0) / 1000)}s`,
    );
  }
}
console.log(`[${shard}] DONE games=${games} rounds=${rounds} hits=${hits} ${Math.round((Date.now() - t0) / 1000)}s`);
