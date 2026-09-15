/**
 * 과제 T4 — 리플레이 라운드트립 결과 보고서 (jsonl → report.md)
 *
 * 사용:
 *   npx tsx qa-lab/round5/replay/report.ts [--out qa-lab/round5/replay/out] [--tag run]
 *
 * out/ 아래 `roundtrip-<tag>-*.jsonl` 을 전부 합쳐 `out/report.md` 로 쓴다.
 * roundtrip.ts 도 샤드 하나가 끝나면 같은 함수로 `report-<tag>-<shard>of<shards>.md` 를 남긴다.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface Diff {
  /** 첫 불일치 경로 — `$.players[1].score` */
  path: string;
  /** VALUE · ARRAY_LEN · ARRAY_ORDER(원소 집합은 같고 순서만 다름) · MISSING_LEFT · MISSING_RIGHT */
  kind: string;
  left: string;
  right: string;
}

export interface Row {
  i: number;
  tag: string;
  kind: "preset" | "draft";
  forced: string | null;
  seed: number;
  mode: "hanchan" | "tonpuu";
  preset: Record<string, string[]>;
  personas: string[];
  drafts: boolean;
  ms: {
    match: number;
    server: number;
    replayFile: number;
    rounds: number;
    views: number;
    client: number;
    total: number;
  };
  lines: number;
  events: number;
  rounds: number;
  liveSeq: number | null;
  trailingLines: number;
  crash: string | null;
  timeout: boolean;
  effectErrors: number;
  violations: string[];
  /** (a) 서버 reconstructGame */
  server: {
    ok: boolean;
    error: string | null;
    eventCount: number | null;
    /** 라이브 최종 상태와 일치 (라이브가 없으면 null) */
    match: boolean | null;
    firstDiff: Diff | null;
    /** 1차(리듀서만) 상태와 2차(rebuildAugments 뒤) 상태가 같은가 */
    stage2Match: boolean | null;
    stage2Diff: Diff | null;
    reconEffectErrors: string[];
    warns: string[];
  };
  /** (a') 서버 replayFile — 파일 경유 두 번째 재구성기 */
  replayFile: {
    ok: boolean;
    error: string | null;
    match: boolean | null;
    firstDiff: Diff | null;
  };
  /** (b) 국 경계마다 prefix 재구성 */
  roundsCheck: {
    checked: number;
    matched: number;
    firstMismatch: { round: string; seq: number; diff: Diff } | null;
    errors: string[];
  };
  /** (c) buildReplayView 전 seq·전 viewer */
  views: {
    states: number;
    checkedStates: number;
    calls: number;
    stride: number;
    errors: { seq: number; viewer: string; msg: string }[];
    stage1Error: string | null;
  };
  /** --everySeq: 브로드캐스트된 seq 마다 라이브 ≟ 1차 재구성 */
  seqCheck: {
    enabled: boolean;
    captured: number;
    compared: number;
    firstMismatch: { seq: number; diff: Diff } | null;
  };
  /** (d) 클라이언트 replayRebuild */
  client: {
    import: "ok" | string;
    ok: boolean;
    error: string | null;
    events: number | null;
    truncated: boolean;
    match: boolean | null;
    firstDiff: Diff | null;
    vsServer: boolean | null;
    vsServerDiff: Diff | null;
    settlements: number | null;
    settledEvents: number;
    viewAtCalls: number;
    viewAtErrors: { index: number; msg: string }[];
    insightCalls: number;
    insightNulls: number;
    warns: string[];
  };
  /** (e) preset 판이 AugmentDrafted 를 남기는가 */
  presetCheck: {
    installedAtRound1: Record<string, string[]> | null;
    draftedLines: number;
    /** 1국 시작 시 보유 중인데 AugmentDrafted 줄이 없는 (seat:id) */
    notLogged: string[];
    /** 최종 라이브 상태 보유 목록 */
    heldAtEnd: Record<string, string[]> | null;
  };
  liveMutated: boolean;
  /** 결함 후보 — 하나라도 있으면 종료코드 1, 리플레이 파일 보존 */
  findings: string[];
  /** 결함이 아닌 메모(하네스 설정 등) — 보고서에만 실린다 */
  warnings: string[];
  replayPath: string | null;
  /** __init__ 에 실린 draftSchedules — 엔진이 모르는 이름은 UNKNOWN_DRAFT_STAGE */
  draftSchedules: string[];
  /** gameStart 드래프트가 실제로 스케줄됐는가 (resume() 의 특수 경로 커버리지) */
  gameStartDraft: boolean;
}

/** 배열 인덱스를 지운 경로 패턴 — 묶어 세기용 */
export function pathPattern(p: string): string {
  return p.replace(/\[\d+\]/g, "[*]");
}

const avg = (xs: number[]): number =>
  xs.length === 0 ? 0 : Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
const max = (xs: number[]): number => (xs.length === 0 ? 0 : Math.max(...xs));

export function buildReport(rows: Row[], title: string): string {
  const L: string[] = [];
  L.push(`# ${title}`);
  L.push("");
  L.push(`생성: ${new Date().toISOString()} · 판 수: ${rows.length}`);
  L.push("");
  if (rows.length === 0) return L.join("\n") + "\n";

  const withF = rows.filter((r) => r.findings.length > 0);
  const preset = rows.filter((r) => r.kind === "preset");
  const draft = rows.filter((r) => r.kind === "draft");
  const cnt = (f: (r: Row) => boolean): number => rows.filter(f).length;

  L.push("## 요약");
  L.push("");
  L.push("| 항목 | 값 |");
  L.push("|---|---|");
  L.push(`| 판 수 (preset / draft-on) | ${rows.length} (${preset.length} / ${draft.length}) |`);
  L.push(`| 발견 있는 판 | ${withF.length} |`);
  L.push(`| 크래시 / 타임아웃 | ${cnt((r) => r.crash !== null && !r.timeout)} / ${cnt((r) => r.timeout)} |`);
  L.push(`| 훅 예외(라이브) 있는 판 | ${cnt((r) => r.effectErrors > 0)} |`);
  L.push(`| (a) 서버 reconstructGame 최종 일치 / 불일치 / 예외 | ${cnt((r) => r.server.match === true)} / ${cnt((r) => r.server.match === false)} / ${cnt((r) => !r.server.ok)} |`);
  L.push(`| (a) 1차↔2차(rebuildAugments) 불일치 | ${cnt((r) => r.server.stage2Match === false)} |`);
  L.push(`| (a') 서버 replayFile 일치 / 불일치 / 예외 | ${cnt((r) => r.replayFile.match === true)} / ${cnt((r) => r.replayFile.match === false)} / ${cnt((r) => !r.replayFile.ok)} |`);
  L.push(`| (b) 국 경계 prefix 재구성 — 검사 국 / 첫 분기 있는 판 | ${rows.reduce((s, r) => s + r.roundsCheck.checked, 0)} / ${cnt((r) => r.roundsCheck.firstMismatch !== null)} |`);
  L.push(`| (c) buildReplayView 호출 / 예외 있는 판 | ${rows.reduce((s, r) => s + r.views.calls, 0)} / ${cnt((r) => r.views.errors.length > 0)} |`);
  if (rows.some((r) => r.seqCheck?.enabled)) {
    L.push(`| (--everySeq) seq 단위 비교 수 / 첫 분기 있는 판 | ${rows.reduce((s, r) => s + (r.seqCheck?.compared ?? 0), 0)} / ${cnt((r) => r.seqCheck?.firstMismatch != null)} |`);
  }
  L.push(`| (d) 클라 import | ${rows[0]?.client.import === "ok" ? "ok" : `실패: ${rows[0]?.client.import}`} |`);
  L.push(`| (d) 클라 최종 일치 / 불일치 / 예외·절단 | ${cnt((r) => r.client.match === true)} / ${cnt((r) => r.client.match === false)} / ${cnt((r) => r.client.import === "ok" && (!r.client.ok || r.client.truncated))} |`);
  L.push(`| (d) 클라↔서버 불일치 | ${cnt((r) => r.client.vsServer === false)} |`);
  L.push(`| (e) preset 판 중 AugmentDrafted 누락 | ${cnt((r) => r.presetCheck.notLogged.length > 0)} / ${preset.length} |`);
  L.push(`| 라이브 상태 참조 변형 감지 | ${cnt((r) => r.liveMutated)} |`);
  L.push(`| draft-on 판 중 gameStart 드래프트가 스케줄된 판 | ${cnt((r) => r.drafts && r.gameStartDraft)} / ${draft.length} |`);
  L.push("");

  L.push("## 소요 (판당 ms)");
  L.push("");
  const phases = ["match", "server", "replayFile", "rounds", "views", "client", "total"] as const;
  L.push("| 단계 | 평균 | 최대 |");
  L.push("|---|---|---|");
  for (const p of phases) {
    L.push(`| ${p} | ${avg(rows.map((r) => r.ms[p]))} | ${max(rows.map((r) => r.ms[p]))} |`);
  }
  L.push(`| 이벤트 수(평균) | ${avg(rows.map((r) => r.events))} | ${max(rows.map((r) => r.events))} |`);
  L.push(`| viewStride | ${rows[0]?.views.stride ?? "?"} | |`);
  L.push("");

  L.push("## 발견 종류별 판 수");
  L.push("");
  const byKind = new Map<string, number[]>();
  for (const r of rows) for (const f of new Set(r.findings)) byKind.set(f, [...(byKind.get(f) ?? []), r.i]);
  if (byKind.size === 0) L.push("(없음)");
  else {
    L.push("| 종류 | 판 수 | 예 (i) |");
    L.push("|---|---|---|");
    for (const [k, is] of [...byKind].sort((a, b) => b[1].length - a[1].length)) {
      L.push(`| ${k} | ${is.length} | ${is.slice(0, 8).join(", ")}${is.length > 8 ? " …" : ""} |`);
    }
  }
  L.push("");

  const byWarn = new Map<string, number>();
  for (const r of rows) for (const w of new Set(r.warnings ?? [])) byWarn.set(w, (byWarn.get(w) ?? 0) + 1);
  if (byWarn.size > 0) {
    L.push("## 경고 (결함 아님 — 하네스·설정 메모)");
    L.push("");
    L.push("| 경고 | 판 수 |");
    L.push("|---|---|");
    for (const [k, n] of [...byWarn].sort((a, b) => b[1] - a[1])) L.push(`| ${k} | ${n} |`);
    L.push("");
  }

  L.push("## 첫 분기 경로 (패턴별)");
  L.push("");
  const paths = new Map<string, { n: number; kinds: Set<string>; ex: string }>();
  const addPath = (label: string, d: Diff | null, r: Row): void => {
    if (d === null) return;
    const key = `${label} ${pathPattern(d.path)}`;
    const cur = paths.get(key) ?? { n: 0, kinds: new Set<string>(), ex: "" };
    cur.n++;
    cur.kinds.add(d.kind);
    if (cur.ex === "") cur.ex = `i=${r.i} seed=${r.seed} ${r.mode} ${d.path}: ${d.left} ≠ ${d.right}`;
    paths.set(key, cur);
  };
  for (const r of rows) {
    addPath("live↔server", r.server.firstDiff, r);
    addPath("stage1↔stage2", r.server.stage2Diff, r);
    addPath("live↔replayFile", r.replayFile.firstDiff, r);
    addPath("live↔client", r.client.firstDiff, r);
    addPath("client↔server", r.client.vsServerDiff, r);
    if (r.roundsCheck.firstMismatch !== null) addPath("round-prefix", r.roundsCheck.firstMismatch.diff, r);
    if (r.seqCheck?.firstMismatch != null) addPath(`every-seq@${r.seqCheck.firstMismatch.seq}`, r.seqCheck.firstMismatch.diff, r);
  }
  if (paths.size === 0) L.push("(없음)");
  else {
    L.push("| 비교 · 경로 | 판 수 | 종류 | 예 |");
    L.push("|---|---|---|---|");
    for (const [k, v] of [...paths].sort((a, b) => b[1].n - a[1].n)) {
      L.push(`| ${k} | ${v.n} | ${[...v.kinds].join(",")} | ${v.ex.replace(/\|/g, "\\|").slice(0, 220)} |`);
    }
  }
  L.push("");

  const rm = rows.filter((r) => r.roundsCheck.firstMismatch !== null);
  if (rm.length > 0) {
    L.push("## (b) 국 경계 첫 분기");
    L.push("");
    L.push("| i | seed | mode | forced | 국 | seq | 경로 |");
    L.push("|---|---|---|---|---|---|---|");
    for (const r of rm) {
      const m = r.roundsCheck.firstMismatch!;
      L.push(`| ${r.i} | ${r.seed} | ${r.mode} | ${r.forced ?? "-"} | ${m.round} | ${m.seq} | ${m.diff.path} (${m.diff.kind}) |`);
    }
    L.push("");
  }

  const ve = rows.filter((r) => r.views.errors.length > 0);
  if (ve.length > 0) {
    L.push("## (c) buildReplayView 예외");
    L.push("");
    for (const r of ve) {
      L.push(`- i=${r.i} seed=${r.seed} ${r.mode}: ${r.views.errors.slice(0, 5).map((e) => `seq${e.seq}/${e.viewer}: ${e.msg}`).join(" · ")}${r.views.errors.length > 5 ? ` … (+${r.views.errors.length - 5})` : ""}`);
    }
    L.push("");
  }

  const ce = rows.filter((r) => r.client.import === "ok" && (r.client.viewAtErrors.length > 0 || r.client.insightNulls > 0 || r.client.warns.length > 0 || r.client.truncated));
  if (ce.length > 0) {
    L.push("## (d) 클라이언트 재구성기 경고");
    L.push("");
    for (const r of ce) {
      L.push(`- i=${r.i} seed=${r.seed} ${r.mode}: truncated=${r.client.truncated} events=${r.client.events}/${r.events} viewAtErrors=${r.client.viewAtErrors.length} insightNull=${r.client.insightNulls}/${r.client.insightCalls} warns=${r.client.warns.slice(0, 3).join(" · ")}`);
    }
    L.push("");
  }

  const pe = rows.filter((r) => r.presetCheck.notLogged.length > 0);
  if (pe.length > 0) {
    L.push("## (e) preset 판인데 AugmentDrafted 가 없는 보유 증강");
    L.push("");
    for (const r of pe) L.push(`- i=${r.i} seed=${r.seed} ${r.mode}: ${r.presetCheck.notLogged.join(", ")}`);
    L.push("");
  }

  if (withF.length > 0) {
    L.push("## 판별 발견 (재현 인자)");
    L.push("");
    L.push("| i | kind | forced | seed | mode | drafts | personas | findings | 리플레이 파일 |");
    L.push("|---|---|---|---|---|---|---|---|---|");
    for (const r of withF) {
      L.push(`| ${r.i} | ${r.kind} | ${r.forced ?? "-"} | ${r.seed} | ${r.mode} | ${r.drafts} | ${r.personas.join("/")} | ${[...new Set(r.findings)].join(", ")} | ${r.replayPath ?? "-"} |`);
    }
    L.push("");
    L.push("재현: `npx tsx qa-lab/round5/replay/roundtrip.ts --ids <forced> --seeds <seed> --drafts off` (preset 판) 또는 `--drafts on --draftGames <k+1> --only <i>` (draft 판). 판의 preset·persona 는 (forced, seed) 에서 결정적으로 다시 계산된다.");
    L.push("");
  }
  return L.join("\n") + "\n";
}

export function readRows(outDir: string, tag: string | null): Row[] {
  const rows: Row[] = [];
  for (const f of readdirSync(outDir)) {
    // roundtrip-<tag>-<shard>of<shards>.jsonl — 태그는 정확히 일치해야 한다 (smoke 가 smoke-stride10 을 삼키지 않게)
    const m = /^roundtrip-(.+)-(\d+)of(\d+)\.jsonl$/.exec(f);
    if (m === null) continue;
    if (tag !== null && m[1] !== tag) continue;
    for (const line of readFileSync(join(outDir, f), "utf-8").split("\n")) {
      if (line.trim() === "") continue;
      try { rows.push(JSON.parse(line) as Row); } catch { /* 반 줄 */ }
    }
  }
  rows.sort((a, b) => a.i - b.i);
  return rows;
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const here = dirname(fileURLToPath(import.meta.url));
  const argv = process.argv.slice(2);
  const flag = (k: string): string | null => { const i = argv.indexOf(k); return i >= 0 ? (argv[i + 1] ?? null) : null; };
  const outDir = flag("--out") ?? join(here, "out");
  const tag = flag("--tag");
  const rows = readRows(outDir, tag);
  const md = buildReport(rows, `리플레이 라운드트립 보고 (${tag ?? "all"})`);
  const target = join(outDir, "report.md");
  writeFileSync(target, md);
  console.log(`rows=${rows.length} → ${target}`);
}
