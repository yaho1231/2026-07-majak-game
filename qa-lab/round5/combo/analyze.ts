/**
 * analyze — out/run3-*.jsonl (+ 지정 파일) 을 모아 report.md 를 쓴다.
 *
 *   tsx qa-lab/round5/combo/analyze.ts [--out report.md] [--files a.jsonl,b.jsonl]
 *
 * 보고: 규모(층별 조합·판·ms) · 실패 시그니처별 묶음(최소 재현 조합·대조군·재현 명령) ·
 *       shrink 표 · 설치 누락(invalid) · 카드별 touched 커버리지(이 설정에서 한 번도 흔적을 안 남긴 카드)
 */
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { COMBOS_FILE, HERE, OUT_DIR, argFlag, readJsonl } from "./lib.js";
import type { ComboEntry, Played, ShrinkResult, Tier } from "./lib.js";

interface GameRow extends Played { kind: "game"; idx: number; tier: Tier; src: string; combo: string[]; k: number; shrink?: ShrinkResult }
interface ShrinkRow extends Played { kind: "shrink"; idx: number; tier: Tier; combo: string[]; k: number; subset: string[] }

const OUT = argFlag("out") ?? join(HERE, "report.md");
const files = argFlag("files")?.split(",").map((f) => (f.startsWith("/") ? f : join(process.cwd(), f)))
  ?? (existsSync(OUT_DIR) ? readdirSync(OUT_DIR).filter((f) => /^run3-\d+of\d+\.jsonl$/.test(f)).sort().map((f) => join(OUT_DIR, f)) : []);

const combos = existsSync(COMBOS_FILE) ? readJsonl<ComboEntry>(COMBOS_FILE) : [];
const games: GameRow[] = [];
const shrinks: ShrinkRow[] = [];
for (const f of files) {
  for (const r of readJsonl<GameRow | ShrinkRow>(f)) {
    if (r.kind === "game") games.push(r);
    else if (r.kind === "shrink") shrinks.push(r);
  }
}

const TIERS: Tier[] = ["risky", "signal", "dist"];
const pct = (a: number, b: number): string => (b === 0 ? "-" : `${((100 * a) / b).toFixed(1)}%`);
const q = (xs: number[], p: number): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] as number;
};
const repro = (g: GameRow): string => `tsx qa-lab/round5/combo/run3.ts 0 1 --only ${g.idx} --seeds ${g.k + 1} --out /tmp/repro-${g.idx}.jsonl`;

const L: string[] = [];
L.push(`# B-2 조합 스위프 결과 (${new Date().toISOString().slice(0, 10)})`);
L.push("");
L.push(`입력 파일 ${files.length}개 · combos.jsonl ${combos.length}조합 · 판 ${games.length} · shrink 시도 ${shrinks.length}`);
L.push("");

// ── 규모
L.push("## 1. 규모");
L.push("");
L.push("| 층 | 조합(목록) | 조합(실행) | 판 | ok | fail | invalid | 평균 ms | p95 ms | 총 시간 |");
L.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
for (const t of [...TIERS, "all" as const]) {
  const gs = t === "all" ? games : games.filter((g) => g.tier === t);
  const listed = t === "all" ? combos.length : combos.filter((c) => c.tier === t).length;
  const ran = new Set(gs.map((g) => g.idx)).size;
  const ms = gs.map((g) => g.ms);
  const sum = ms.reduce((a, b) => a + b, 0);
  L.push(`| ${t} | ${listed} | ${ran} | ${gs.length} | ${gs.filter((g) => g.status === "ok").length} | ${gs.filter((g) => g.status === "fail").length} | ${gs.filter((g) => g.status === "invalid").length} | ${gs.length > 0 ? Math.round(sum / gs.length) : 0} | ${q(ms, 0.95)} | ${Math.round(sum / 1000)}s |`);
}
L.push("");
const modes = { hanchan: games.filter((g) => g.mode === "hanchan").length, tonpuu: games.filter((g) => g.mode === "tonpuu").length };
const p0p = { masher: games.filter((g) => g.personas[0] === "masher").length, chaos: games.filter((g) => g.personas[0] === "chaos").length };
L.push(`모드: 반장전 ${modes.hanchan} · 동풍전 ${modes.tonpuu}. p0 페르소나: masher ${p0p.masher} · chaos ${p0p.chaos}. 4장 조합 판: ${games.filter((g) => g.combo.length === 4).length}.`);
L.push("");

// ── 실패
const fails = games.filter((g) => g.status === "fail");
L.push(`## 2. 실패 — ${fails.length}판 / ${games.length} (${pct(fails.length, games.length)})`);
L.push("");
const byClass: Record<string, number> = {};
for (const g of fails) byClass[g.failClass ?? "?"] = (byClass[g.failClass ?? "?"] ?? 0) + 1;
L.push(`분류: ${Object.entries(byClass).map(([k, v]) => `${k} ${v}`).join(" · ") || "없음"}`);
L.push("");
if (fails.length > 0) {
  const bySig = new Map<string, GameRow[]>();
  for (const g of fails) { const k = g.sig ?? "?"; const arr = bySig.get(k) ?? []; arr.push(g); bySig.set(k, arr); }
  const sigs = [...bySig.entries()].sort((a, b) => b[1].length - a[1].length);
  L.push("| # | 시그니처 | 판 | 조합 수 | 층 | 최소 재현(shrink) | 대조군(p0 빈손)도 실패 | 예시 |");
  L.push("|---|---|---:|---:|---|---|---|---|");
  sigs.forEach(([sig, gs], i) => {
    const tiers = [...new Set(gs.map((g) => g.tier))].join(",");
    const mins = new Map<string, number>();
    let baselineFails = 0;
    for (const g of gs) {
      if (g.shrink === undefined) continue;
      const k = g.shrink.min.join("+") + (g.shrink.sameSig ? "" : " (다른 시그니처)");
      mins.set(k, (mins.get(k) ?? 0) + 1);
      if (g.shrink.baselineFails) baselineFails++;
    }
    const minStr = [...mins.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${k}×${n}`).join("<br>") || "-";
    const ex = gs[0] as GameRow;
    L.push(`| ${i + 1} | \`${sig.replace(/\|/g, "\\|").slice(0, 110)}\` | ${gs.length} | ${new Set(gs.map((g) => g.idx)).size} | ${tiers} | ${minStr} | ${baselineFails}/${gs.filter((g) => g.shrink !== undefined).length} | #${ex.idx} seed=${ex.seed} ${ex.mode} [${ex.combo.join(",")}] |`);
  });
  L.push("");
  L.push("### 2-1. 실패 판 상세 (시그니처별 최대 5판)");
  L.push("");
  for (const [sig, gs] of sigs) {
    L.push(`#### \`${sig.slice(0, 140)}\``);
    L.push("");
    for (const g of gs.slice(0, 5)) {
      L.push(`- #${g.idx} ${g.tier} k=${g.k} seed=${g.seed} ${g.mode} p0=[${g.combo.join(",")}] personas=${g.personas.join("/")} rounds=${g.rounds} ${g.ms}ms`);
      L.push(`  - preset: \`${JSON.stringify(g.preset)}\``);
      if (g.crash !== null) L.push(`  - crash: \`${(g.crash.split("\n")[0] ?? "").slice(0, 200)}\``);
      for (const e of g.effectErrors.slice(0, 3)) L.push(`  - effectError: \`${e.slice(0, 200)}\``);
      for (const v of g.violations.slice(0, 4)) L.push(`  - violation: \`${v.slice(0, 200)}\``);
      if (g.shrink !== undefined) {
        L.push(`  - shrink: 최소 [${g.shrink.min.join(",")}] sameSig=${g.shrink.sameSig} minSig=\`${(g.shrink.minSig ?? "-").slice(0, 80)}\` 대조군 실패=${g.shrink.baselineFails}${g.shrink.baselineSig !== null ? ` (\`${g.shrink.baselineSig.slice(0, 60)}\`)` : ""} 시도 ${g.shrink.trials}판 ${g.shrink.ms}ms`);
      }
      L.push(`  - 재현: \`${repro(g)}\``);
    }
    L.push("");
  }
}

// ── shrink 표
const shrunk = fails.filter((g) => g.shrink !== undefined);
L.push(`## 3. shrink 요약 — ${shrunk.length}건`);
L.push("");
if (shrunk.length > 0) {
  const sizeHist: Record<number, number> = {};
  let same = 0; let base = 0;
  for (const g of shrunk) { const s = g.shrink as ShrinkResult; sizeHist[s.min.length] = (sizeHist[s.min.length] ?? 0) + 1; if (s.sameSig) same++; if (s.baselineFails) base++; }
  L.push(`최소 조합 크기 분포: ${Object.entries(sizeHist).map(([k, v]) => `${k}장 ${v}`).join(" · ")} · 같은 시그니처 유지 ${same}/${shrunk.length} · 대조군(p0 빈손)도 실패 ${base}/${shrunk.length}`);
  L.push("");
  L.push("대조군도 실패하는 건은 조합이 아니라 p1~p3 무작위 카드·시드의 문제다 — 그 판의 preset 전체를 보라.");
  L.push("");
  const minKeys = new Map<string, { n: number; sigs: Set<string>; ex: GameRow }>();
  for (const g of shrunk) {
    const s = g.shrink as ShrinkResult;
    if (s.baselineFails) continue;
    const k = s.min.join("+");
    const m = minKeys.get(k) ?? { n: 0, sigs: new Set<string>(), ex: g };
    m.n++; m.sigs.add(s.minSig ?? "?"); minKeys.set(k, m);
  }
  if (minKeys.size > 0) {
    L.push("| 최소 재현 조합 | 건 | 시그니처 | 예시 재현 |");
    L.push("|---|---:|---|---|");
    for (const [k, m] of [...minKeys.entries()].sort((a, b) => b[1].n - a[1].n)) {
      L.push(`| ${k} | ${m.n} | ${[...m.sigs].map((s) => s.slice(0, 60)).join("<br>")} | \`${repro(m.ex)}\` |`);
    }
    L.push("");
  }
}

// ── invalid
const invalid = games.filter((g) => g.status === "invalid");
L.push(`## 4. 설치 누락(invalid) — ${invalid.length}판`);
L.push("");
if (invalid.length > 0) {
  L.push("gen3 의 conflicts·모드 필터를 통과했는데 1국 시작 시 p0 에 없던 카드 — installPreset 이 말없이 버린 것이다. 원인(카탈로그 미등록·새 conflicts)을 확인한다.");
  L.push("");
  for (const g of invalid.slice(0, 30)) L.push(`- #${g.idx} seed=${g.seed} ${g.mode} [${g.combo.join(",")}] 누락=${g.presetDropped.join(",")} 설치=${(g.installedAtRound1?.p0 ?? []).join(",")}`);
  L.push("");
}

// ── 커버리지
L.push("## 5. 커버리지 — p0 조합 카드별 touched(augmentData 흔적)");
L.push("");
const cov = new Map<string, { n: number; touched: number }>();
for (const g of games) {
  for (const id of g.combo) {
    const c = cov.get(id) ?? { n: 0, touched: 0 };
    c.n++; if (g.touched[id] === true) c.touched++; cov.set(id, c);
  }
}
const covRows = [...cov.entries()].sort((a, b) => a[1].touched / a[1].n - b[1].touched / b[1].n || b[1].n - a[1].n);
const inert = covRows.filter(([, c]) => c.touched === 0);
L.push(`카드 ${cov.size}종 · 한 번도 흔적을 안 남긴 카드 ${inert.length}종 (상시 규칙형은 augmentData 를 안 쓸 수 있어 «발동 불가»의 증거는 아니다 — B-1 touched 와 대조):`);
L.push("");
if (inert.length > 0) L.push(inert.map(([id, c]) => `\`${id}\`(${c.n}판)`).join(" · "));
L.push("");
L.push("| 카드 | 판 | touched | 비율 |");
L.push("|---|---:|---:|---:|");
for (const [id, c] of covRows.slice(0, 40)) L.push(`| ${id} | ${c.n} | ${c.touched} | ${pct(c.touched, c.n)} |`);
L.push("");

// ── 실행 안 된 조합
const ranIdx = new Set(games.map((g) => g.idx));
const notRun = combos.filter((c) => !ranIdx.has(c.idx));
L.push(`## 6. 미실행 조합 — ${notRun.length} / ${combos.length}`);
L.push("");
if (notRun.length > 0 && notRun.length <= 40) for (const c of notRun) L.push(`- #${c.idx} ${c.tier} [${c.combo.join(",")}]`);
else if (notRun.length > 40) L.push(`(${notRun.length}건 — 샤드가 아직 안 끝났거나 --tiers/--limit 로 잘랐다)`);
L.push("");

writeFileSync(OUT, L.join("\n") + "\n");
console.log(JSON.stringify({ out: OUT, files: files.length, games: games.length, fails: fails.length, invalid: invalid.length, shrinkTrials: shrinks.length, inertCards: inert.length }));
