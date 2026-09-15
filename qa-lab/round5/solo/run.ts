/**
 * B-1 단독 스위프 러너 — 증강 1장 × p0 페르소나 6종 × 시드 N × 2모드, 드래프트 끔.
 *
 *   tsx qa-lab/round5/solo/run.ts <shard> <shards> [seeds=5]
 *
 * 환경변수(부분 실행·스모크용, 전체 실행에선 비운다):
 *   SOLO_AUGS=a,b,c        증강 id 목록으로 제한
 *   SOLO_PERSONAS=masher,folder
 *   SOLO_MODES=hanchan
 *   SOLO_OUT=out-smoke     결과 폴더 (기본 out) — 스모크가 본 실행 결과를 덮지 않게
 *   SOLO_TIMEOUT_MS=90000  판당 타임아웃 (초과 = SOFTLOCK_TIMEOUT 위반)
 *
 * 결과: <SOLO_OUT>/<shard>.jsonl — 판마다 lib.ts Row 한 줄. 이미 있는 줄은 건너뛴다(이어하기).
 * 재현: tsx qa-lab/round5/solo/repro.ts <aug> <persona> <mode> <seed>
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { badKinds, enumerateJobs, jobKey, playOne } from "./lib.js";
import type { JobFilter, Mode } from "./lib.js";

const shard = Number(process.argv[2] ?? 0);
const shards = Number(process.argv[3] ?? 1);
const seeds = Number(process.argv[4] ?? 5);
if (!Number.isInteger(shard) || !Number.isInteger(shards) || shard < 0 || shard >= shards) {
  throw new Error(`bad shard/shards: ${shard}/${shards}`);
}
const list = (s: string | undefined): string[] | undefined =>
  s === undefined || s.trim() === "" ? undefined : s.split(",").map((x) => x.trim()).filter((x) => x !== "");
const filter: JobFilter = {};
const fa = list(process.env["SOLO_AUGS"]); if (fa !== undefined) filter.augs = fa;
const fp = list(process.env["SOLO_PERSONAS"]); if (fp !== undefined) filter.personas = fp;
const fm = list(process.env["SOLO_MODES"]); if (fm !== undefined) filter.modes = fm as Mode[];
const timeoutMs = Number(process.env["SOLO_TIMEOUT_MS"] ?? 90_000);

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, process.env["SOLO_OUT"] ?? "out");
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, `${shard}.jsonl`);

const all = enumerateJobs(seeds, filter);
const mine = all.filter((j) => j.i % shards === shard);
const done = new Set<string>();
if (existsSync(outFile)) {
  for (const line of readFileSync(outFile, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    try { done.add(jobKey(JSON.parse(line) as { aug: string; mode: string; persona: string; seedIdx: number })); } catch { /* 깨진 줄은 다시 돈다 */ }
  }
}
const todo = mine.filter((j) => !done.has(jobKey(j)));
console.log(`[${shard}/${shards}] jobs total=${all.length} mine=${mine.length} done=${done.size} todo=${todo.length} seeds=${seeds} out=${outFile}`);

const t0 = Date.now();
let n = 0, crashes = 0, effs = 0, viols = 0, softlocks = 0, untouched = 0, skipped = 0, fatals = 0;
const msAll: number[] = [];
for (const job of todo) {
  const row = await playOne(job, { timeoutMs });
  appendFileSync(outFile, JSON.stringify(row) + "\n");
  n++;
  if (row.skipped !== undefined) { skipped++; continue; }
  msAll.push(row.ms);
  const bad = badKinds(row.violations);
  if (row.fatal !== undefined) fatals++;
  if (row.crash !== null) crashes++;
  if (row.effectErrors > 0) effs++;
  if (bad.length > 0) viols++;
  if (row.softlock) softlocks++;
  if (!row.touched) untouched++;
  const flag = row.fatal !== undefined || row.crash !== null || row.effectErrors > 0 || bad.length > 0 || row.softlock;
  if (flag) {
    console.log(`[${shard}] HIT ${row.aug} ${row.persona} ${row.mode} seed=${row.seed}` +
      ` crash=${row.crash?.split("\n")[0] ?? "-"} fatal=${row.fatal?.split("\n")[0] ?? "-"} eff=${row.effectErrors} viol=${bad.join(",") || "-"} ms=${row.ms}`);
  }
  if (n % 20 === 0 || n === todo.length) {
    const el = (Date.now() - t0) / 1000;
    console.log(`[${shard}] ${n}/${todo.length} ${el.toFixed(0)}s (${(el / Math.max(1, n)).toFixed(2)}s/판)` +
      ` crash=${crashes} eff=${effs} viol=${viols} softlock=${softlocks} untouched=${untouched} skipped=${skipped} fatal=${fatals}`);
  }
}
msAll.sort((a, b) => a - b);
const pct = (p: number): number => msAll.length === 0 ? 0 : msAll[Math.min(msAll.length - 1, Math.floor(msAll.length * p))]!;
console.log(`[${shard}] DONE games=${n} ${((Date.now() - t0) / 1000).toFixed(0)}s` +
  ` msP50=${pct(0.5)} msP90=${pct(0.9)} msMax=${msAll[msAll.length - 1] ?? 0}` +
  ` crash=${crashes} eff=${effs} viol=${viols} softlock=${softlocks} untouched=${untouched} skipped=${skipped} fatal=${fatals}`);
