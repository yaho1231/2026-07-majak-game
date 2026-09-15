/**
 * B-1 단독 스위프 집계 — out/*.jsonl → report.md (+ summary.json)
 *
 *   tsx qa-lab/round5/solo/analyze.ts [outDir=out] [report=report.md] [seeds=5]
 *
 * 표: (증강 × 페르소나) 셀에 crash/effErr/viol/touched=0 · SCORE_DRIFT_UNEXPLAINED 목록 ·
 * 판당 ms 분포 · 누락 작업(샤드가 안 끝난 것). seeds 는 «전체 작업 수» 계산에만 쓴다.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { P0_PERSONAS, badKinds, enumerateJobs, jobKey } from "./lib.js";
import type { Row } from "./lib.js";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, process.argv[2] ?? "out");
const reportPath = join(here, process.argv[3] ?? "report.md");
const seeds = Number(process.argv[4] ?? 5);

const rows = new Map<string, Row>();
let lines = 0, broken = 0;
const files = existsSync(outDir) ? readdirSync(outDir).filter((f) => f.endsWith(".jsonl")).sort() : [];
for (const f of files) {
  for (const line of readFileSync(join(outDir, f), "utf8").split("\n")) {
    if (line.trim() === "") continue;
    lines++;
    try { const r = JSON.parse(line) as Row; rows.set(jobKey(r), r); } catch { broken++; }
  }
}
const all = [...rows.values()];
const played = all.filter((r) => r.skipped === undefined);
const isBad = (r: Row): boolean => r.crash !== null || r.fatal !== undefined || r.effectErrors > 0 || r.softlock || badKinds(r.violations).length > 0;

// ── 누락 작업 (전체 작업 목록과 대조; 부분 실행이면 필터가 달라 누락이 많이 나올 수 있다)
const expected = enumerateJobs(seeds);
const missing = expected.filter((j) => !rows.has(jobKey(j)));

// ── 분포
const pct = (xs: number[], p: number): number => xs.length === 0 ? 0 : xs[Math.min(xs.length - 1, Math.floor(xs.length * p))]!;
const msBy = (pred: (r: Row) => boolean): { n: number; p50: number; p90: number; p99: number; max: number; mean: number } => {
  const xs = played.filter(pred).map((r) => r.ms).sort((a, b) => a - b);
  const mean = xs.length === 0 ? 0 : Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  return { n: xs.length, p50: pct(xs, 0.5), p90: pct(xs, 0.9), p99: pct(xs, 0.99), max: xs[xs.length - 1] ?? 0, mean };
};
const msAll = msBy(() => true);
const msHan = msBy((r) => r.mode === "hanchan");
const msTon = msBy((r) => r.mode === "tonpuu");

// ── 집계
const count = <T,>(xs: T[], key: (x: T) => string): Map<string, number> => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
  return m;
};
const violByKind = new Map<string, number>();
for (const r of played) for (const k of badKinds(r.violations)) violByKind.set(k, (violByKind.get(k) ?? 0) + (r.violations[k] ?? 0));
const crashRows = played.filter((r) => r.crash !== null);
const fatalRows = played.filter((r) => r.fatal !== undefined);
const effRows = played.filter((r) => r.effectErrors > 0);
const softRows = played.filter((r) => r.softlock);
const violRows = played.filter((r) => badKinds(r.violations).length > 0);
const driftRows = played.filter((r) => (r.violations["SCORE_DRIFT_UNEXPLAINED"] ?? 0) > 0);
const untouchedRows = played.filter((r) => !r.touched);
const augs = [...new Set(all.map((r) => r.aug))].sort();
const personas = P0_PERSONAS.filter((p) => all.some((r) => r.persona === p));
const ref = (r: Row): string => `${r.aug} ${r.persona} ${r.mode} seed=${r.seed}`;
const groupBy = <K extends string>(xs: Row[], key: (r: Row) => K): Map<K, Row[]> => {
  const m = new Map<K, Row[]>();
  for (const x of xs) { const k = key(x); const a = m.get(k); if (a === undefined) m.set(k, [x]); else a.push(x); }
  return m;
};
const sig = (s: string): string => s.split("\n")[0]!.slice(0, 140);

// ── 리포트
const L: string[] = [];
L.push(`# B-1 단독 스위프 결과 (${new Date().toISOString().slice(0, 16)}) — ${outDir}`);
L.push("");
L.push(`- 파일 ${files.length}개 · 줄 ${lines} (깨진 줄 ${broken}) · 고유 판 ${all.length} · 실행 ${played.length} · modes 불일치 skip ${all.length - played.length}`);
L.push(`- 전체 작업(117×6×${seeds}×2 = ${expected.length}) 대비 누락 ${missing.length}`);
L.push(`- **크래시 ${crashRows.length} · 도구 fatal ${fatalRows.length} · 훅 예외 판 ${effRows.length} · 소프트락 ${softRows.length} · 불변식 위반 판 ${violRows.length} · SCORE_DRIFT_UNEXPLAINED 판 ${driftRows.length} · touched=0 판 ${untouchedRows.length}**`);
L.push(`- 판당 ms: 전체 n=${msAll.n} mean=${msAll.mean} p50=${msAll.p50} p90=${msAll.p90} p99=${msAll.p99} max=${msAll.max} · 반장 p50=${msHan.p50} p90=${msHan.p90} max=${msHan.max} (n=${msHan.n}) · 동풍 p50=${msTon.p50} p90=${msTon.p90} max=${msTon.max} (n=${msTon.n})`);
L.push(`- 합계 CPU 시간 ${(played.reduce((a, r) => a + r.ms, 0) / 1000 / 60).toFixed(1)}분 (샤드 수로 나누면 벽시계 근사)`);
L.push("");
L.push("## 위반 kind 별 건수 (SCORE_DRIFT_ATTRIBUTED 제외)");
L.push("");
L.push("| kind | 건수 | 판 수 | 증강 수 | 예 |");
L.push("|---|---:|---:|---:|---|");
for (const [k, n] of [...violByKind].sort((a, b) => b[1] - a[1])) {
  const rs = played.filter((r) => (r.violations[k] ?? 0) > 0);
  const ex = rs[0]!;
  L.push(`| ${k} | ${n} | ${rs.length} | ${new Set(rs.map((r) => r.aug)).size} | ${ref(ex)} — ${(ex.violationSamples.find((s) => s.startsWith(k)) ?? "").slice(0, 120).replace(/\|/g, "\\|")} |`);
}
if (violByKind.size === 0) L.push("| (없음) | | | | |");
L.push("");

const section = (title: string, rs: Row[], detail: (r: Row) => string): void => {
  L.push(`## ${title} — ${rs.length}판`);
  L.push("");
  if (rs.length === 0) { L.push("없음"); L.push(""); return; }
  const g = groupBy(rs, (r) => `${r.aug} :: ${sig(detail(r))}`);
  L.push("| 증강 :: 서명 | 판 | 페르소나 | 모드 | 재현 예 |");
  L.push("|---|---:|---|---|---|");
  for (const [k, xs] of [...g].sort((a, b) => b[1].length - a[1].length)) {
    const ex = xs[0]!;
    L.push(`| ${k.replace(/\|/g, "\\|")} | ${xs.length} | ${[...new Set(xs.map((r) => r.persona))].join(",")} | ${[...new Set(xs.map((r) => r.mode))].join(",")} | \`repro.ts ${ex.aug} ${ex.persona} ${ex.mode} ${ex.seed}\` |`);
  }
  L.push("");
};
section("크래시 (엔진 throw)", crashRows, (r) => r.crash ?? "");
section("도구 fatal (하네스 밖 예외)", fatalRows, (r) => r.fatal ?? "");
section("훅 예외 (onEffectError)", effRows, (r) => r.effectErrorSamples[0] ?? "");
section("소프트락 (타임아웃)", softRows, () => "TIMEOUT");
section("불변식 위반", violRows, (r) => badKinds(r.violations).join(","));

L.push(`## SCORE_DRIFT_UNEXPLAINED — ${driftRows.length}판`);
L.push("");
if (driftRows.length === 0) L.push("없음");
else {
  L.push("| 증강 | 페르소나 | 모드 | seed | 상세 |");
  L.push("|---|---|---|---:|---|");
  for (const r of driftRows.slice(0, 200)) {
    const d = r.violationSamples.find((s) => s.startsWith("SCORE_DRIFT_UNEXPLAINED")) ?? "";
    L.push(`| ${r.aug} | ${r.persona} | ${r.mode} | ${r.seed} | ${d.slice(0, 180).replace(/\|/g, "\\|")} |`);
  }
  if (driftRows.length > 200) L.push(`| … | | | | (${driftRows.length - 200}판 더) |`);
}
L.push("");

// touched=0
L.push("## touched=0 (augmentData·이벤트·액션 어디에도 흔적 없음)");
L.push("");
const neverTouchedAll = augs.filter((a) => { const rs = played.filter((r) => r.aug === a); return rs.length > 0 && rs.every((r) => !r.touched); });
const passiveOnly = neverTouchedAll.filter((a) => played.filter((r) => r.aug === a).every((r) => r.passive));
const neverTouched = neverTouchedAll.filter((a) => !passiveOnly.includes(a));
const hookSum = (a: string): string => {
  const rs = played.filter((r) => r.aug === a);
  const k = ["ruleSet", "reactCall", "reactEmit", "interCall", "interChange", "optionOffer"] as const;
  return k.map((x) => `${x}=${rs.reduce((n, r) => n + (r.hooks?.[x] ?? 0), 0)}`).join(" ");
};
L.push(`- **모든 판에서 흔적 없음 + 훅도 상태를 안 바꿈: ${neverTouched.length}종** — «발동 불가» 결함 후보 (액티브면 optionOffer=0, 리액션이면 reactEmit=0 인지 본다)`);
for (const a of neverTouched) L.push(`  - ${a}: ${hookSum(a)}`);
L.push(`- 패시브(규칙 설정·인터셉터 호출만 있고 변경 없음): ${passiveOnly.length}종 — ${passiveOnly.map((a) => `${a}(${hookSum(a).replace(/ /g, ",")})`).join(", ") || "(없음)"}`);
L.push("  (setHolderRule 만 쓰는 카드는 정상. interCall>0·interChange=0 은 «조건이 한 번도 안 맞음»이라 시드를 늘리거나 장면 테스트로 본다)");
const byModeUntouched = (mode: string): string[] => augs.filter((a) => { const rs = played.filter((r) => r.aug === a && r.mode === mode); return rs.length > 0 && rs.every((r) => !r.touched); }).filter((a) => !neverTouchedAll.includes(a));
L.push(`- 반장전에서만 흔적 없음: ${byModeUntouched("hanchan").join(", ") || "(없음)"}`);
L.push(`- 동풍전에서만 흔적 없음: ${byModeUntouched("tonpuu").join(", ") || "(없음)"}`);
const cellUntouched: string[] = [];
for (const a of augs) for (const p of personas) {
  const rs = played.filter((r) => r.aug === a && r.persona === p);
  if (rs.length > 0 && rs.every((r) => !r.touched) && !neverTouchedAll.includes(a)) cellUntouched.push(`${a}×${p}`);
}
L.push(`- 특정 페르소나에서만 흔적 없음 (${cellUntouched.length}셀): ${cellUntouched.slice(0, 80).join(", ")}${cellUntouched.length > 80 ? " …" : ""}`);
L.push("");

// ms 분포
L.push("## 판당 ms");
L.push("");
L.push("| 구간 | n | mean | p50 | p90 | p99 | max |");
L.push("|---|---:|---:|---:|---:|---:|---:|");
for (const [name, m] of [["전체", msAll], ["반장전", msHan], ["동풍전", msTon]] as const) L.push(`| ${name} | ${m.n} | ${m.mean} | ${m.p50} | ${m.p90} | ${m.p99} | ${m.max} |`);
L.push("");
const slowAug = [...groupBy(played, (r) => r.aug)].map(([a, rs]) => [a, Math.round(rs.reduce((x, r) => x + r.ms, 0) / rs.length), Math.max(...rs.map((r) => r.ms))] as const).sort((a, b) => b[1] - a[1]).slice(0, 10);
L.push(`- 증강별 평균 ms 상위 10: ${slowAug.map(([a, m, mx]) => `${a}(${m}/max ${mx})`).join(", ")}`);
const slowest = [...played].sort((a, b) => b.ms - a.ms).slice(0, 5);
L.push(`- 가장 느린 판 5: ${slowest.map((r) => `${ref(r)} ${r.ms}ms rounds=${r.rounds}`).join(" · ")}`);
L.push("");

// 매트릭스
L.push("## 증강 × 페르소나 표");
L.push("");
L.push("셀 = 그 (증강, 페르소나)의 시드×모드 판들 요약. `·` 깨끗+흔적 있음 · `C`n 크래시 · `F`n fatal · `E`n 훅 예외 · `L`n 소프트락 · `V`n 불변식 위반 · `D`n 드리프트 미설명 · `t`k/n 흔적 있는 판 수(전부면 생략) · `T0` 흔적 0(훅도 무변경) · `P` 패시브(훅 호출만) · `S` 전부 skip");
L.push("");
L.push(`| 증강 | tier | cat | ${personas.join(" | ")} |`);
L.push(`|---|---|---|${personas.map(() => "---").join("|")}|`);
for (const a of augs) {
  const any = all.find((r) => r.aug === a)!;
  const cells = personas.map((p) => {
    const rs = all.filter((r) => r.aug === a && r.persona === p);
    if (rs.length === 0) return "";
    const pl = rs.filter((r) => r.skipped === undefined);
    if (pl.length === 0) return "S";
    const parts: string[] = [];
    const c = pl.filter((r) => r.crash !== null).length; if (c > 0) parts.push(`C${c}`);
    const f = pl.filter((r) => r.fatal !== undefined).length; if (f > 0) parts.push(`F${f}`);
    const e = pl.filter((r) => r.effectErrors > 0).length; if (e > 0) parts.push(`E${e}`);
    const l = pl.filter((r) => r.softlock).length; if (l > 0) parts.push(`L${l}`);
    const v = pl.filter((r) => badKinds(r.violations).some((k) => k !== "SCORE_DRIFT_UNEXPLAINED" && k !== "SOFTLOCK_TIMEOUT")).length; if (v > 0) parts.push(`V${v}`);
    const d = pl.filter((r) => (r.violations["SCORE_DRIFT_UNEXPLAINED"] ?? 0) > 0).length; if (d > 0) parts.push(`D${d}`);
    const t = pl.filter((r) => r.touched).length;
    if (t === 0) parts.push(pl.every((r) => r.passive) ? "P" : "T0"); else if (t < pl.length) parts.push(`t${t}/${pl.length}`);
    if (pl.length < rs.length) parts.push(`s${rs.length - pl.length}`);
    return parts.length === 0 ? "·" : parts.join(" ");
  });
  L.push(`| ${a} | ${any.tier} | ${any.category} | ${cells.join(" | ")} |`);
}
L.push("");

// 누락
L.push(`## 누락 작업 — ${missing.length}`);
L.push("");
if (missing.length > 0) {
  const byAug = count(missing, (j) => j.aug);
  L.push(`- 증강별: ${[...byAug].slice(0, 30).map(([a, n]) => `${a}(${n})`).join(", ")}${byAug.size > 30 ? " …" : ""}`);
  L.push(`- 예: ${missing.slice(0, 10).map((j) => `${j.aug}/${j.persona}/${j.mode}/#${j.seedIdx}`).join(", ")}`);
  L.push("- (부분 실행·스모크라면 정상. 본 실행이면 `ls out/*.done` 과 logs/*.log 끝을 본다 — run-shards.sh 를 다시 띄우면 이어 돈다)");
}
L.push("");

writeFileSync(reportPath, L.join("\n"));
const summary = {
  outDir, files: files.length, rows: all.length, played: played.length, skipped: all.length - played.length,
  expected: expected.length, missing: missing.length,
  crash: crashRows.length, fatal: fatalRows.length, effectErrors: effRows.length, softlock: softRows.length,
  violations: violRows.length, driftUnexplained: driftRows.length, untouched: untouchedRows.length,
  neverTouchedAugs: neverTouched, passiveAugs: passiveOnly, violByKind: Object.fromEntries(violByKind),
  ms: { all: msAll, hanchan: msHan, tonpuu: msTon },
  badRefs: played.filter(isBad).slice(0, 50).map(ref),
};
writeFileSync(reportPath.replace(/\.md$/, "") + ".summary.json", JSON.stringify(summary, null, 1));
console.log(`report → ${reportPath}`);
console.log(JSON.stringify({ ...summary, badRefs: summary.badRefs.length, neverTouchedAugs: neverTouched.length }));
