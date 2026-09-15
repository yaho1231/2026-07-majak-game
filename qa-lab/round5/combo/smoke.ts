/**
 * smoke — B-2 도구 자체 검증. 전체 실행이 아니다.
 *
 *   tsx qa-lab/round5/combo/smoke.ts [--per-tier 2] [--timeout 90000]
 *
 *  1) combos.jsonl 에서 층마다 앞 N조합(기본 2) × 시드 1(k=0) = 6판을 run3 와 같은 경로(gameArgs→play)로 돌려
 *     판당 ms 를 실측하고, 조합이 전부 설치됐는지(presetDropped=∅)·행 형식을 확인한다 → out/smoke.jsonl
 *  2) shrink 함수 단위 확인 — 알려진 안전 조합 [take_back, bottom_deal, foresight] 에 «take_back 이 들어 있으면
 *     실패»라는 가짜 판정을 꽂아, 최소 조합이 [take_back] 으로 수렴하고 대조군(p0 빈손)은 통과하는지 본다.
 *  3) 전체 실행 예상 시간을 계산해 찍는다 (조합 수 × 시드 2 × 평균 ms / 샤드).
 * 종료코드: 검사 하나라도 실패하면 1
 */
import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { argFlag, ensureOutDir, gameArgs, loadCombos, play, shrink, validCombo } from "./lib.js";
import type { ComboEntry, Tier } from "./lib.js";

const PER_TIER = Number(argFlag("per-tier") ?? 2);
const TIMEOUT = Number(argFlag("timeout") ?? 90_000);
const outFile = join(ensureOutDir(), "smoke.jsonl");
writeFileSync(outFile, "");
let failed = 0;
const fail = (what: string): void => { failed++; console.log(`FAIL ${what}`); };

const combos = loadCombos();
const tiers: Tier[] = ["risky", "signal", "dist"];
const picked: ComboEntry[] = [];
for (const t of tiers) picked.push(...combos.filter((c) => c.tier === t).slice(0, PER_TIER));

// ── 1) 층별 판
const msAll: number[] = [];
for (const e of picked) {
  const a = gameArgs(e, 0, TIMEOUT, true);
  const p = await play(a);
  msAll.push(p.ms);
  const row = { kind: "game", idx: e.idx, tier: e.tier, src: e.src, combo: e.combo, k: 0, ...p };
  appendFileSync(outFile, JSON.stringify(row) + "\n");
  console.log(`#${e.idx} ${e.tier} seed=${p.seed} ${p.mode} [${e.combo.join(",")}] p0=${p.personas[0]} ${p.ms}ms rounds=${p.rounds} ${p.status}${p.sig !== null ? " " + p.sig.slice(0, 80) : ""} touched=${e.combo.map((id) => (p.touched[id] ? "1" : "0")).join("")}`);
  if (p.presetDropped.length > 0) fail(`#${e.idx} 조합이 다 설치되지 않음: ${p.presetDropped.join(",")}`);
  if (p.installedAtRound1 === null) fail(`#${e.idx} 1국 시작 관측 실패`);
  if (p.rounds < 1) fail(`#${e.idx} 국이 0개`);
  if (p.status === "fail") console.log(`  ⚠ 스모크에서 실패 신호 — 확정 아님, 전체 실행에서 shrink 로 확인: ${p.sig}`);
}

// ── 2) shrink 단위 확인 (가짜 판정)
{
  const safe = ["bottom_deal", "foresight", "take_back"];
  const v = validCombo(safe);
  if (!v.ok) fail(`안전 조합이 유효하지 않음: ${v.why}`);
  const entry: ComboEntry = { idx: 999_999, tier: "risky", combo: safe, src: "smoke", modes: v.ok ? v.modes : ["hanchan"] };
  const a = gameArgs(entry, 0, TIMEOUT, true);
  const original = await play(a);
  console.log(`shrink-unit original [${safe.join(",")}] ${original.ms}ms status=${original.status}`);
  const trials: string[] = [];
  const t0 = Date.now();
  const sr = await shrink(a, original, {
    isFail: (p) => (p.preset.p0 ?? []).includes("take_back"),
    onTrial: (t) => { trials.push(`[${t.subset.join(",")}]`); },
  });
  console.log(`shrink-unit min=[${sr.min.join(",")}] sameSig=${sr.sameSig} baselineFails=${sr.baselineFails} trials=${sr.trials} ${Date.now() - t0}ms  순서: ${trials.join(" → ")}`);
  appendFileSync(outFile, JSON.stringify({ kind: "shrink-unit", combo: safe, result: sr, trials }) + "\n");
  if (sr.min.join(",") !== "take_back") fail(`shrink 최소 조합이 [take_back] 이 아님: [${sr.min.join(",")}]`);
  if (sr.baselineFails) fail("shrink 대조군(p0 빈손)이 가짜 판정에 걸림");
  // 탐욕 축소는 같은 시그니처의 실패를 만나면 그 크기에서 즉시 내려간다 — 이 조합·순서에서는
  // [foresight,take_back](1) → [take_back](1) → 대조군(1) = 3판. 상한은 부분집합 전부(2+2)+대조군 = 5.
  if (sr.trials < 3 || sr.trials > 5) fail(`shrink 시도 수 ${sr.trials} (기대 3~5)`);
  // 원 판이 통과했으니 sameSig(null===null)=true 여야 한다
  if (!sr.sameSig) fail("shrink sameSig 가 false (원 판·최소 판 모두 sig=null 이어야 함)");
}

// ── 3) 예상 시간
const avg = msAll.length === 0 ? 0 : msAll.reduce((a, b) => a + b, 0) / msAll.length;
const total = combos.length * 2;
const est = (shards: number): string => `${Math.round((total * avg) / shards / 60000)}분`;
console.log(`DONE smokeGames=${msAll.length} avgMs=${Math.round(avg)} min=${Math.min(...msAll)} max=${Math.max(...msAll)} combos=${combos.length} totalGames(seeds=2)=${total} est(1샤드)=${est(1)} est(4)=${est(4)} est(8)=${est(8)} failed=${failed} out=${outFile}`);
process.exitCode = failed > 0 ? 1 : 0;
