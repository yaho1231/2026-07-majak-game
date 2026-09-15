/**
 * run3 — 조합 스위프 실행기 (샤딩). 계획 B-2.
 *
 *   tsx qa-lab/round5/combo/run3.ts <shard> <shards> [--seeds 2] [--timeout 90000] [--tiers risky,signal,dist]
 *                                   [--limit N] [--only idx,idx] [--no-strict] [--fresh] [--combos path] [--out path]
 *
 *  - combos.jsonl 의 idx % shards === shard 인 조합을 맡는다 (한 조합의 시드 2개와 shrink 는 같은 샤드)
 *  - 판마다: p0 = 조합(3~4장), p1~p3 = assignPreset 무작위 2장, drafts:false,
 *            p0 페르소나 masher(k=0)/chaos(k=1), 시드 = 710000 + idx*2 + k, 모드 반장전/동풍전 교대
 *  - 실패(크래시·소프트락·훅 예외·불변식)면 같은 시드·같은 p1~p3 로 부분집합을 돌려 최소 재현 조합을 찾는다(shrink)
 *  - 결과: out/run3-<shard>of<shards>.jsonl — kind:"game" 줄(판) + kind:"shrink" 줄(부분집합 시도)
 *  - 이어하기: 같은 out 파일에 이미 있는 (idx,k) 는 건너뛴다. --fresh 면 새로 쓴다. --only 는 재현용.
 */
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { COMBOS_FILE, argFlag, ensureOutDir, gameArgs, hasFlag, loadCombos, play, readJsonl, shrink } from "./lib.js";
import type { Played, ShrinkResult, Tier } from "./lib.js";

const shard = Number(process.argv[2] ?? 0);
const shards = Number(process.argv[3] ?? 1);
if (!Number.isInteger(shard) || !Number.isInteger(shards) || shards < 1 || shard < 0 || shard >= shards) {
  throw new Error(`usage: run3.ts <shard> <shards>  (got ${process.argv[2]} ${process.argv[3]})`);
}
const SEEDS = Number(argFlag("seeds") ?? 2);
const TIMEOUT = Number(argFlag("timeout") ?? 90_000);
const TIERS = new Set<Tier>((argFlag("tiers") ?? "risky,signal,dist").split(",") as Tier[]);
const LIMIT = Number(argFlag("limit") ?? 0);
const ONLY = argFlag("only")?.split(",").map(Number);
const STRICT = !hasFlag("no-strict");
const outFile = argFlag("out") ?? join(ensureOutDir(), `run3-${shard}of${shards}.jsonl`);

export interface GameRow extends Played {
  kind: "game";
  idx: number; tier: Tier; src: string; combo: string[]; k: number;
  shrink?: ShrinkResult;
}
export interface ShrinkRow extends Played {
  kind: "shrink";
  idx: number; tier: Tier; combo: string[]; k: number; subset: string[];
}

const all = loadCombos(argFlag("combos") ?? COMBOS_FILE);
let mine = all.filter((e) => e.idx % shards === shard && TIERS.has(e.tier));
if (ONLY !== undefined) mine = all.filter((e) => ONLY.includes(e.idx));
if (LIMIT > 0) mine = mine.slice(0, LIMIT);

const done = new Set<string>();
if (hasFlag("fresh") || !existsSync(outFile)) writeFileSync(outFile, "");
else for (const r of readJsonl<{ kind: string; idx: number; k: number }>(outFile)) if (r.kind === "game") done.add(`${r.idx}:${r.k}`);

const emit = (row: GameRow | ShrinkRow): void => { appendFileSync(outFile, JSON.stringify(row) + "\n"); };

const stat = { games: 0, ok: 0, fail: 0, invalid: 0, shrinkGames: 0, ms: 0, softlock: 0 };
const t0 = Date.now();
const planned = mine.length * SEEDS - [...done].length;
console.log(`run3 shard=${shard}/${shards} combos=${mine.length} seeds=${SEEDS} planned=${Math.max(0, planned)} strict=${STRICT} timeout=${TIMEOUT} out=${outFile}`);

for (const e of mine) {
  for (let k = 0; k < SEEDS; k++) {
    if (done.has(`${e.idx}:${k}`)) continue;
    const a = gameArgs(e, k, TIMEOUT, STRICT);
    const p = await play(a);
    stat.games++; stat.ms += p.ms;
    if (p.status === "ok") stat.ok++;
    else if (p.status === "invalid") stat.invalid++;
    else { stat.fail++; if (p.failClass === "softlock") stat.softlock++; }
    const row: GameRow = { kind: "game", idx: e.idx, tier: e.tier, src: e.src, combo: e.combo, k, ...p };
    let shrinkNote = "";
    if (p.status === "fail") {
      const sr = await shrink(a, p, {
        onTrial: (t) => {
          stat.shrinkGames++;
          emit({ kind: "shrink", idx: e.idx, tier: e.tier, combo: e.combo, k, subset: t.subset, ...t.played });
        },
      });
      row.shrink = sr;
      shrinkNote = ` shrink→[${sr.min.join(",")}] same=${sr.sameSig} baseline=${sr.baselineFails} trials=${sr.trials}`;
    }
    emit(row);
    console.log(
      `#${e.idx} ${e.tier} k=${k} seed=${p.seed} ${p.mode} [${e.combo.join(",")}] ${p.ms}ms r=${p.rounds} ${p.status}` +
      (p.sig !== null ? ` ${p.sig.slice(0, 90)}` : "") + shrinkNote,
    );
    if (stat.games % 25 === 0) {
      console.log(`-- ${stat.games} games ok=${stat.ok} fail=${stat.fail} invalid=${stat.invalid} shrink=${stat.shrinkGames} avgMs=${Math.round(stat.ms / stat.games)} elapsed=${Math.round((Date.now() - t0) / 1000)}s`);
    }
  }
}
console.log(`DONE shard=${shard}/${shards} games=${stat.games} ok=${stat.ok} fail=${stat.fail} (softlock=${stat.softlock}) invalid=${stat.invalid} shrinkGames=${stat.shrinkGames} avgMs=${stat.games > 0 ? Math.round(stat.ms / stat.games) : 0} elapsed=${Math.round((Date.now() - t0) / 1000)}s out=${outFile}`);
