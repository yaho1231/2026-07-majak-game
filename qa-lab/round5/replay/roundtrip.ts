/**
 * 과제 T4 (계획 55 §4 B-5, §2-7 X-7) — 리플레이 라운드트립 검사기
 *
 * 하네스 `runMatch(onEvent)` 로 리플레이 JSONL 줄을 모으고, 세 벌의 재구성기가 **라이브 최종
 * 상태**와 같은 곳에 도착하는지 본다.
 *
 *   (a)  서버 `ReplayReader.reconstructGame(lines)` 최종 GameState ≟ 라이브 최종 상태
 *        + 1차(리듀서만) ≟ 2차(`rebuildAugments` 뒤) — 재설치가 상태를 건드리는지 따로 분리
 *   (a') 서버 `ReplayReader.replayFile(path)` — 파일 경유 두 번째 재구성기 (X-7: 셋 다 대조)
 *   (b)  국 경계마다(onRound end) «지금까지 줄(seq ≤ k)»로 reconstructGame → 어느 국에서 갈리는지
 *   (c)  `buildReplayView(state, viewer)` 를 모든 seq × 모든 viewer(p0~p3 + __spectator) 에서 — 던지지 않는지
 *   (d)  클라이언트 `packages/client/src/replayRebuild.ts` 를 node 에서 import 해 같은 줄로 재구성 → (a) 와 비교
 *        + replaySettlements · replayViewAt(전 index) · replayInsightAt(stride) 무예외
 *   (e)  preset(드래프트 없음) 판이 AUGMENT_DRAFTED 를 내는지 — 1국 시작 보유 증강마다 줄이 있어야 한다
 *
 * 정규화: lastEventSeq 제외 · 객체 키 정렬(순서 무관 맵) · 함수 제외 · JSON 라운드트립(undefined 제거).
 * 배열은 순서를 본다 — 원소 집합만 같으면 ARRAY_ORDER 로 따로 표시한다.
 *
 * 사용:
 *   npx tsx qa-lab/round5/replay/roundtrip.ts [shard=0] [shards=1] [옵션]
 *     --ids a,b,c        강제 증강 목록 (기본: combo_sweep.test.ts 의 RISKY 전체)
 *     --risky N          RISKY 앞 N 종만
 *     --all              content 전 카탈로그
 *     --seeds 1,2,3 | 1-5   (기본 1-5) — 짝수 시드 = 반장전, 홀수 = 동풍전 (combo_sweep 규약)
 *     --drafts off|on|both  (기본 both) — off: preset 판만, on: 드래프트 켠 판만
 *     --draftGames N     드래프트 켠 판 수 (기본 ceil(preset 판 수 / 4), 최소 2)
 *     --only i,j         계획 인덱스로 골라 돌리기 (재현용)
 *     --viewStride N     (c) 검사할 seq 간격 (기본 1 = 전부; 이벤트 경계·마지막은 항상 포함)
 *     --timeoutMs N      판당 타임아웃 (기본 120000) — 초과는 TIMEOUT 발견
 *     --tag name         출력 파일 이름 태그 (기본 run)
 *     --out dir          출력 폴더 (기본 qa-lab/round5/replay/out)
 *     --keepReplays      발견이 없는 판의 리플레이 파일도 남긴다
 *     --mutate X         자기 검증: 재구성기에 먹이는 줄만 상하게 한다 (dropEvent:<k> | dropDraft | swapEvents:<k>)
 *                        → 불일치·예외가 «잡혀야» 검사기가 살아 있는 것이다. 라이브 판은 그대로다.
 *     --noEverySeq       끄기 전용. 기본은 브로드캐스트된 seq 마다 라이브 스냅샷 ≟ 1차 재구성 (첫 분기 seq).
 *                        최종·국말 비교만으로는 국 안에서 리셋되는 값(turnCount 등)의 분기를 놓친다 —
 *                        자기 검증 `--mutate dropEvent:300` 이 ROUND_MISMATCH 만 내고 최종은 «일치»였다.
 *
 * 출력: out/roundtrip-<tag>-<shard>of<shards>.jsonl (판마다 seed·preset·mode·persona·drafts·ms·검사),
 *       out/report-<tag>-<shard>of<shards>.md, 발견 있는 판의 리플레이 out/replays/<tag>-i<i>-seed<seed>.jsonl
 * 합본: npx tsx qa-lab/round5/replay/report.ts --tag <tag>
 * 종료코드: 발견이 하나라도 있으면 1
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import {
  AUGMENT_DRAFTED,
  ROUND_SETTLED,
  ROUND_STARTED,
  SPECTATOR_ID,
  Prng,
  createInitialGameState,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type { GameEvent, GameState, PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";
import {
  buildReplayView,
  reconstructGame,
  replayFile,
} from "../../../packages/server/src/ReplayReader.js";
import type { ReplayInitLine } from "../../../packages/server/src/ReplayReader.js";
import { PERSONAS, SEATS, assignPreset, byId, offerable, runMatch } from "../../harness.js";
import type { Persona } from "../../harness.js";
import { buildReport } from "./report.js";
import type { Diff, Row } from "./report.js";

// ─────────────────────────── 인자 ───────────────────────────

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "../../..");
const argv = process.argv.slice(2);
/** 값을 받지 않는 플래그 — 그 다음 인자는 positional 이다 */
const FLAGS_NOARG = new Set(["--all", "--keepReplays", "--noEverySeq"]);
const positional = argv.filter(
  (a, i) => !a.startsWith("--") && (i === 0 || !argv[i - 1]!.startsWith("--") || FLAGS_NOARG.has(argv[i - 1]!)),
);
const flag = (k: string): string | null => {
  const i = argv.indexOf(k);
  return i >= 0 ? (argv[i + 1] ?? null) : null;
};
const has = (k: string): boolean => argv.includes(k);
const shard = Number(positional[0] ?? 0);
const shards = Number(positional[1] ?? 1);
const tag = flag("--tag") ?? "run";
const outDir = flag("--out") ?? join(here, "out");
const viewStride = Math.max(1, Number(flag("--viewStride") ?? 1));
const timeoutMs = Number(flag("--timeoutMs") ?? 120_000);
const draftsMode = (flag("--drafts") ?? "both") as "off" | "on" | "both";
const keepReplays = has("--keepReplays");
const only = flag("--only")?.split(",").map(Number) ?? null;
/** 자기 검증 전용 — 재구성기 입력 줄을 일부러 상하게 한다 (dropEvent:<k> | dropDraft | swapEvents:<k>) */
const mutate = flag("--mutate");
/** 브로드캐스트마다 라이브 스냅샷을 남겨 seq 단위로 1차 재구성과 대조한다 — 기본 켬(스모크에서 비용 측정 불가 수준) */
const everySeq = !has("--noEverySeq");

function parseSeeds(s: string): number[] {
  const m = /^(\d+)-(\d+)$/.exec(s);
  if (m !== null) {
    const out: number[] = [];
    for (let k = Number(m[1]); k <= Number(m[2]); k++) out.push(k);
    return out;
  }
  return s.split(",").map(Number).filter((n) => Number.isFinite(n));
}

/** combo_sweep.test.ts 의 RISKY 를 소스에서 그대로 읽는다 — 복사본이 낡지 않게. */
function readRisky(): string[] {
  const src = readFileSync(join(ROOT, "packages/content/test/combo_sweep.test.ts"), "utf-8");
  const m = /const RISKY = \[([\s\S]*?)\];/.exec(src);
  if (m === null) throw new Error("combo_sweep.test.ts 에서 RISKY 를 찾지 못했다");
  return [...m[1]!.matchAll(/"([a-z0-9_]+)"/g)].map((x) => x[1]!);
}

// ─────────────────────────── 계획 ───────────────────────────

interface Plan {
  i: number;
  kind: "preset" | "draft";
  forced: string | null;
  seed: number;
  mode: "hanchan" | "tonpuu";
  preset: Record<PlayerId, string[]>;
  personas: string[];
  drafts: boolean;
}

const PNAMES = Object.keys(PERSONAS);
function strHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function buildPlan(): Plan[] {
  const risky = readRisky();
  const ids = has("--all")
    ? contentAugments.map((d) => d.id)
    : flag("--ids") !== null
      ? flag("--ids")!.split(",")
      : flag("--risky") !== null
        ? risky.slice(0, Number(flag("--risky")))
        : risky;
  const seeds = parseSeeds(flag("--seeds") ?? "1-5");
  const plans: Omit<Plan, "i">[] = [];
  if (draftsMode !== "on") {
    for (const id of ids) {
      for (const seed of seeds) {
        // combo_sweep 규약: 짝수 시드 = 반장전, 홀수 = 동풍전, 같은 rng 시드로 같은 preset
        const mode: "hanchan" | "tonpuu" = seed % 2 === 0 ? "hanchan" : "tonpuu";
        const def = byId.get(id);
        if (def === undefined) { console.warn(`알 수 없는 증강 id: ${id} — 건너뜀`); continue; }
        if (!offerable(def, mode)) continue;
        const preset = assignPreset(new Prng(seed ^ 0x9e3779b9), mode, [id], 2);
        const prng = new Prng((seed * 7919 + strHash(id)) >>> 0);
        // p0(강제 보유자)는 증강광 — 그 증강의 이벤트가 로그에 최대한 남게
        const personas = SEATS.map((_s, k) => (k === 0 ? "masher" : PNAMES[prng.int(PNAMES.length)]!));
        plans.push({ kind: "preset", forced: id, seed, mode, preset, personas, drafts: false });
      }
    }
  }
  if (draftsMode !== "off") {
    const n = flag("--draftGames") !== null
      ? Number(flag("--draftGames"))
      : Math.max(2, Math.ceil(plans.length / 4));
    for (let k = 0; k < n; k++) {
      const seed = 1000 + k;
      const mode: "hanchan" | "tonpuu" = k % 2 === 0 ? "hanchan" : "tonpuu";
      // 드래프트 판에도 preset 을 준다 — 지급·드래프트 두 경로가 한 로그에 섞이게
      const preset = assignPreset(new Prng(seed ^ 0x9e3779b9), mode, [], 2);
      const prng = new Prng((seed * 7919 + 1) >>> 0);
      const personas = SEATS.map(() => PNAMES[prng.int(PNAMES.length)]!);
      plans.push({ kind: "draft", forced: null, seed, mode, preset, personas, drafts: true });
    }
  }
  return plans.map((p, i) => ({ ...p, i }));
}

// ─────────────────────────── 정규화·비교 ───────────────────────────

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v !== null && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) o[k] = sortKeys((v as Record<string, unknown>)[k]);
    return o;
  }
  return v;
}

/** lastEventSeq 제외 · 함수 제외 · 키 정렬 · JSON 라운드트립 */
function norm(st: GameState): unknown {
  const { lastEventSeq: _drop, ...rest } = st;
  return sortKeys(JSON.parse(JSON.stringify(rest, (_k, val: unknown) => (typeof val === "function" ? undefined : val))));
}
const normJson = (st: GameState): string => JSON.stringify(norm(st));

const show = (v: unknown): string => {
  const s = JSON.stringify(v);
  return s === undefined ? "undefined" : s.length > 160 ? `${s.slice(0, 160)}…` : s;
};
const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

function firstDiff(a: unknown, b: unknown, path = "$"): Diff | null {
  if (a === b) return null;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return { path, kind: "ARRAY_LEN", left: show(a), right: show(b) };
    for (let i = 0; i < a.length; i++) {
      const d = firstDiff(a[i], b[i], `${path}[${i}]`);
      if (d !== null) {
        const sa = a.map((x) => JSON.stringify(x)).sort().join("");
        const sb = b.map((x) => JSON.stringify(x)).sort().join("");
        return sa === sb ? { path, kind: "ARRAY_ORDER", left: show(a), right: show(b) } : d;
      }
    }
    return null;
  }
  if (isObj(a) && isObj(b)) {
    for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
      if (!(k in a)) return { path: `${path}.${k}`, kind: "MISSING_LEFT", left: "∅", right: show(b[k]) };
      if (!(k in b)) return { path: `${path}.${k}`, kind: "MISSING_RIGHT", left: show(a[k]), right: "∅" };
      const d = firstDiff(a[k], b[k], `${path}.${k}`);
      if (d !== null) return d;
    }
    return null;
  }
  return { path, kind: "VALUE", left: show(a), right: show(b) };
}

const errMsg = (e: unknown): string =>
  e instanceof Error ? `${e.message} @ ${(e.stack ?? "").split("\n")[1]?.trim() ?? "?"}` : String(e);

/** console.warn 을 가로채 모은다 (재구성기들이 절단·설치 실패를 warn 으로만 알린다) */
function captureWarn<T>(sink: string[], fn: () => T): T {
  const orig = console.warn;
  console.warn = (...a: unknown[]) => { if (sink.length < 20) sink.push(a.map((x) => (x instanceof Error ? x.message : String(x))).join(" ").slice(0, 200)); };
  try { return fn(); } finally { console.warn = orig; }
}
async function captureWarnAsync<T>(sink: string[], fn: () => Promise<T>): Promise<T> {
  const orig = console.warn;
  console.warn = (...a: unknown[]) => { if (sink.length < 20) sink.push(a.map((x) => (x instanceof Error ? x.message : String(x))).join(" ").slice(0, 200)); };
  try { return await fn(); } finally { console.warn = orig; }
}

// ─────────────────────────── 서버식 1차 재구성 (seq 마다 상태) ───────────────────────────

/**
 * `reconstructGame` 의 1차 루프를 그대로 옮긴 것 — 서버는 seq 별 상태를 내주지 않아 (c) 에
 * 필요한 «모든 seq 의 상태»를 여기서 만든다. 절차는 ReplayReader.ts 와 글자 그대로 같다
 * (createInitialGameState → createStandardGameFromState(house) → dispatch → AUGMENT_DRAFTED 에 installAugment({yaku})).
 * 마지막 상태가 reconstructGame 과 다르면 그것은 2차(`rebuildAugments`)가 상태를 바꿨다는 뜻이다.
 */
function serverStyleStates(lines: readonly string[]): { states: GameState[]; events: GameEvent[]; error: string | null } {
  const init = JSON.parse(lines[0]!) as ReplayInitLine;
  let state = createInitialGameState(init.payload.config, init.payload.options);
  const saved = init.payload.hanchan;
  const house = {
    ...(saved?.kuitan !== undefined ? { kuitan: saved.kuitan } : {}),
    ...(saved?.openHands !== undefined ? { openHands: saved.openHands } : {}),
  };
  const tmp = createStandardGameFromState(state, undefined, contentAugments, undefined, house);
  const states: GameState[] = [state];
  const events: GameEvent[] = [];
  for (const line of lines.slice(1)) {
    const ev = JSON.parse(line) as GameEvent;
    try {
      state = tmp.engine.reducers.dispatch(state, ev);
    } catch (e) {
      return { states, events, error: `${ev.type}@seq${ev.seq}: ${errMsg(e)}` };
    }
    state = { ...state, lastEventSeq: ev.seq };
    if (ev.type === AUGMENT_DRAFTED) {
      const p = ev.payload as { player: PlayerId; augmentId: string };
      const def = tmp.augments.get(p.augmentId);
      if (def !== undefined) installAugment(tmp.engine, def, p.player, { yaku: tmp.yaku });
    }
    events.push(ev);
    states.push(state);
  }
  return { states, events, error: null };
}

// ─────────────────────────── 클라이언트 재구성기 (동적 import) ───────────────────────────

type ClientMod = typeof import("../../../packages/client/src/replayRebuild.js");
let clientMod: ClientMod | null = null;
let clientImport: string = "ok";
try {
  clientMod = (await import(pathToFileURL(join(ROOT, "packages/client/src/replayRebuild.ts")).href)) as ClientMod;
  for (const fn of ["rebuildReplay", "replaySettlements", "replayViewAt", "replayInsightAt"]) {
    if (typeof (clientMod as unknown as Record<string, unknown>)[fn] !== "function") {
      clientImport = `export 누락: ${fn}`;
      clientMod = null;
      break;
    }
  }
} catch (e) {
  clientImport = `import 실패: ${errMsg(e)}`;
  clientMod = null;
}

// ─────────────────────────── 한 판 ───────────────────────────

const VIEWERS: PlayerId[] = [...SEATS, SPECTATOR_ID];
const rkOf = (st: GameState): string => `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;

async function runOne(p: Plan): Promise<Row> {
  const t0 = performance.now();
  const lines: string[] = [];
  const roundSnaps: { round: string; seq: number; ref: GameState; json: string }[] = [];
  let latest: GameState | null = null;
  let latestSeq = -1;
  let installedAtRound1: Record<string, string[]> | null = null;
  const liveBySeq = new Map<number, string>();
  const personas = Object.fromEntries(SEATS.map((s, k) => [s, PERSONAS[p.personas[k]!]!])) as Record<PlayerId, Persona>;

  const report = await runMatch({
    seed: p.seed,
    mode: p.mode,
    preset: p.preset,
    personas,
    timeoutMs,
    ...(p.drafts ? {} : { drafts: false }),
    onEvent: (l) => { lines.push(l); },
    onRound: (st, phase) => {
      if (phase === "start" && installedAtRound1 === null) {
        installedAtRound1 = Object.fromEntries(st.players.map((pl) => [pl.id, [...pl.augments]]));
      }
      if (phase === "end") roundSnaps.push({ round: rkOf(st), seq: st.lastEventSeq, ref: st, json: normJson(st) });
    },
    onState: (st) => {
      latest = st; latestSeq = st.lastEventSeq;
      // --everySeq: 브로드캐스트마다 라이브 스냅샷(정규화 JSON)을 seq 로 남긴다 — 국 단위가
      // 아니라 «어느 seq 에서 갈리는가»까지 잡는다 (국 안에서 리셋되는 값은 최종·국말 비교가 놓친다)
      if (everySeq && !liveBySeq.has(st.lastEventSeq)) liveBySeq.set(st.lastEventSeq, normJson(st));
    },
  });
  const tMatch = performance.now() - t0;
  // 자기 검증(--mutate): 재구성기에 먹이는 줄만 상하게 한다 — 라이브 스냅샷은 그대로.
  // 검사기가 «불일치를 실제로 잡는가»를 보는 용도. 기본은 무변형.
  if (mutate !== null) {
    const evIdx = (k: number): number => Math.max(1, Math.min(lines.length - 1, k));
    if (mutate.startsWith("dropEvent:")) {
      const k = evIdx(Number(mutate.slice("dropEvent:".length)) || Math.floor(lines.length / 2));
      lines.splice(k, 1);
    } else if (mutate === "dropDraft") {
      const k = lines.findIndex((l, j) => j > 0 && l.includes(`"type":"${AUGMENT_DRAFTED}"`));
      if (k > 0) lines.splice(k, 1);
    } else if (mutate.startsWith("swapEvents:")) {
      const k = evIdx(Number(mutate.slice("swapEvents:".length)) || Math.floor(lines.length / 2));
      if (k + 1 < lines.length) { const a = lines[k]!; lines[k] = lines[k + 1]!; lines[k + 1] = a; }
    } else {
      throw new Error(`알 수 없는 --mutate: ${mutate} (dropEvent:<k> | dropDraft | swapEvents:<k>)`);
    }
  }
  const live = latest as GameState | null;
  const liveJson = live === null ? null : norm(live);
  const findings: string[] = [];
  const timeout = report.crash?.startsWith("TIMEOUT") === true;
  if (report.crash !== undefined) findings.push(timeout ? "TIMEOUT" : "CRASH");
  if (report.effectErrors.length > 0) findings.push("EFFECT_ERROR");
  const violations = report.violations.filter((v) => v.kind !== "SCORE_DRIFT_ATTRIBUTED").map((v) => `${v.kind}@${v.round}${v.seat ? "/" + v.seat : ""}`);
  if (violations.length > 0) findings.push("HARNESS_VIOLATION");

  // 라이브 상태 참조가 나중에 변형됐는가 — 국 끝에 찍은 JSON 과 지금의 같은 참조를 비교
  let liveMutated = false;
  for (const s of roundSnaps) if (normJson(s.ref) !== s.json) { liveMutated = true; break; }
  if (live !== null && live.lastEventSeq !== latestSeq) liveMutated = true;
  if (liveMutated) findings.push("LIVE_STATE_MUTATED");

  // 줄 파싱 — seq 단조·__init__
  const parsed = lines.map((l) => { try { return JSON.parse(l) as { type?: string; seq?: number }; } catch { return null; } });
  if (parsed[0]?.type !== "__init__") findings.push("NO_INIT");
  let lastSeq = -1;
  let monotonic = true;
  for (const e of parsed.slice(1)) {
    if (e === null || typeof e.seq !== "number") { monotonic = false; break; }
    if (e.seq <= lastSeq) { monotonic = false; break; }
    lastSeq = e.seq;
  }
  if (!monotonic) findings.push("SEQ_NOT_MONOTONIC");
  // __init__ 의 draftSchedules 에 엔진이 모르는 스테이지가 있으면 그 드래프트는 조용히 안 돈다
  // (하네스가 "eastFirst" 를 넣는데 DraftStage 에는 없다 → gameStart 드래프트 경로가 한 번도 안 덮인다)
  const KNOWN_STAGES = new Set(["gameStart", "eastThird", "eastFourth", "southEntry", "southThird"]);
  const draftSchedules = ((parsed[0] as { payload?: { hanchan?: { draftSchedules?: unknown } } } | null)?.payload?.hanchan?.draftSchedules ?? []) as string[];
  // 결함이 아니라 하네스 설정 문제라 findings 가 아닌 warnings 로 — 종료코드·리플레이 보존에 영향 없음
  const warnings: string[] = [];
  if (draftSchedules.some((s) => !KNOWN_STAGES.has(s))) warnings.push(`UNKNOWN_DRAFT_STAGE:${draftSchedules.filter((s) => !KNOWN_STAGES.has(s)).join("+")}`);
  if (p.drafts && !draftSchedules.includes("gameStart")) warnings.push("NO_GAMESTART_DRAFT");
  const linesUpTo = (seq: number): string[] => [lines[0]!, ...lines.slice(1).filter((_l, k) => (parsed[k + 1]?.seq ?? Infinity) <= seq)];
  const trailingLines = live === null ? 0 : parsed.slice(1).filter((e) => (e?.seq ?? -1) > live.lastEventSeq).length;
  const cmpLines = live !== null && trailingLines > 0 ? linesUpTo(live.lastEventSeq) : lines;

  const row: Row = {
    i: p.i, tag, kind: p.kind, forced: p.forced, seed: p.seed, mode: p.mode, preset: p.preset, personas: p.personas, drafts: p.drafts,
    ms: { match: Math.round(tMatch), server: 0, replayFile: 0, rounds: 0, views: 0, client: 0, total: 0 },
    lines: lines.length, events: Math.max(0, lines.length - 1), rounds: report.rounds,
    liveSeq: live?.lastEventSeq ?? null, trailingLines,
    crash: report.crash?.split("\n")[0] ?? null, timeout, effectErrors: report.effectErrors.length, violations,
    server: { ok: false, error: null, eventCount: null, match: null, firstDiff: null, stage2Match: null, stage2Diff: null, reconEffectErrors: [], warns: [] },
    replayFile: { ok: false, error: null, match: null, firstDiff: null },
    roundsCheck: { checked: 0, matched: 0, firstMismatch: null, errors: [] },
    views: { states: 0, checkedStates: 0, calls: 0, stride: viewStride, errors: [], stage1Error: null },
    seqCheck: { enabled: everySeq, captured: 0, compared: 0, firstMismatch: null },
    client: { import: clientImport, ok: false, error: null, events: null, truncated: false, match: null, firstDiff: null, vsServer: null, vsServerDiff: null, settlements: null, settledEvents: 0, viewAtCalls: 0, viewAtErrors: [], insightCalls: 0, insightNulls: 0, warns: [] },
    presetCheck: { installedAtRound1, draftedLines: 0, notLogged: [], heldAtEnd: live === null ? null : Object.fromEntries(live.players.map((pl) => [pl.id, [...pl.augments]])) },
    liveMutated, findings, warnings, replayPath: null,
    draftSchedules, gameStartDraft: draftSchedules.includes("gameStart"),
  };
  if (lines.length === 0) { findings.push("NO_LINES"); row.ms.total = Math.round(performance.now() - t0); return row; }

  // (e) preset 판 — 1국 시작 보유 증강마다 AugmentDrafted 줄이 있어야 재구성이 증강을 단다
  {
    const drafted = new Set<string>();
    for (const l of lines.slice(1)) {
      try {
        const e = JSON.parse(l) as { type?: string; payload?: { player?: string; augmentId?: string } };
        if (e.type === AUGMENT_DRAFTED) drafted.add(`${e.payload?.player}:${e.payload?.augmentId}`);
      } catch { /* 반 줄 */ }
    }
    row.presetCheck.draftedLines = drafted.size;
    // (콜백 안에서 대입되므로 TS 흐름 분석은 아직 null 로 본다 — 명시 캐스트)
    const held = (installedAtRound1 as Record<string, string[]> | null) ?? {};
    for (const [seat, ids] of Object.entries(held)) {
      for (const id of ids) if (!drafted.has(`${seat}:${id}`)) row.presetCheck.notLogged.push(`${seat}:${id}`);
    }
    if (row.presetCheck.notLogged.length > 0) findings.push("PRESET_NOT_LOGGED");
  }

  // (a) 서버 reconstructGame — 전체 줄 (라이브 뒤에 남은 줄이 있으면 라이브 seq 까지)
  let serverFinal: unknown = null;
  {
    const t = performance.now();
    try {
      const recon = captureWarn(row.server.warns, () => reconstructGame(cmpLines, {
        extraAugments: contentAugments,
        processor: { onEffectError: (f) => { if (row.server.reconEffectErrors.length < 10) row.server.reconEffectErrors.push(String((f as { error?: unknown }).error ?? "?")); } },
      }));
      row.server.ok = true;
      row.server.eventCount = recon.eventCount;
      if (recon.eventCount !== cmpLines.length - 1) findings.push("SERVER_EVENTCOUNT");
      serverFinal = norm(recon.game.engine.state);
      if (liveJson !== null) {
        row.server.firstDiff = firstDiff(liveJson, serverFinal);
        row.server.match = row.server.firstDiff === null;
        if (!row.server.match) findings.push("SERVER_FINAL_MISMATCH");
      }
      if (row.server.reconEffectErrors.length > 0) findings.push("RECON_EFFECT_ERROR");
      if (row.server.warns.length > 0) findings.push("SERVER_RECON_WARN");
    } catch (e) {
      row.server.error = errMsg(e);
      findings.push("SERVER_RECON_THROW");
    }
    row.ms.server = Math.round(performance.now() - t);
  }

  // (a') 서버 replayFile — 파일로 써서 두 번째 재구성기를 지난다
  const replayDir = join(outDir, "replays");
  mkdirSync(replayDir, { recursive: true });
  const replayPath = join(replayDir, `${tag}-i${p.i}-seed${p.seed}.jsonl`);
  writeFileSync(replayPath, lines.join("\n") + "\n");
  {
    const t = performance.now();
    try {
      const r = await captureWarnAsync(row.server.warns, () => replayFile(replayPath, contentAugments));
      row.replayFile.ok = true;
      if (trailingLines === 0 && liveJson !== null) {
        row.replayFile.firstDiff = firstDiff(liveJson, norm(r.state));
        row.replayFile.match = row.replayFile.firstDiff === null;
        if (!row.replayFile.match) findings.push("REPLAYFILE_MISMATCH");
      } else if (serverFinal !== null && trailingLines === 0) {
        row.replayFile.firstDiff = firstDiff(serverFinal, norm(r.state));
        row.replayFile.match = row.replayFile.firstDiff === null;
        if (!row.replayFile.match) findings.push("REPLAYFILE_MISMATCH");
      }
    } catch (e) {
      row.replayFile.error = errMsg(e);
      findings.push("REPLAYFILE_THROW");
    }
    row.ms.replayFile = Math.round(performance.now() - t);
  }

  // (b) 국 경계마다 prefix 재구성
  {
    const t = performance.now();
    for (const s of roundSnaps) {
      row.roundsCheck.checked++;
      try {
        const recon = captureWarn(row.server.warns, () => reconstructGame(linesUpTo(s.seq), { extraAugments: contentAugments }));
        const d = firstDiff(JSON.parse(s.json), norm(recon.game.engine.state));
        if (d === null) row.roundsCheck.matched++;
        else if (row.roundsCheck.firstMismatch === null) row.roundsCheck.firstMismatch = { round: s.round, seq: s.seq, diff: d };
      } catch (e) {
        if (row.roundsCheck.errors.length < 5) row.roundsCheck.errors.push(`${s.round}@${s.seq}: ${errMsg(e)}`);
      }
    }
    if (row.roundsCheck.firstMismatch !== null) findings.push("ROUND_MISMATCH");
    if (row.roundsCheck.errors.length > 0) findings.push("ROUND_RECON_THROW");
    row.ms.rounds = Math.round(performance.now() - t);
  }

  // (c) 모든 seq × 모든 viewer — buildReplayView 무예외 (+ 1차↔2차 분리)
  {
    const t = performance.now();
    const s1 = serverStyleStates(lines);
    row.views.states = s1.states.length;
    row.views.stage1Error = s1.error;
    if (s1.error !== null) findings.push("STAGE1_DISPATCH_THROW");
    if (serverFinal !== null && s1.error === null && trailingLines === 0) {
      const last = s1.states[s1.states.length - 1]!;
      row.server.stage2Diff = firstDiff(norm(last), serverFinal);
      row.server.stage2Match = row.server.stage2Diff === null;
      if (!row.server.stage2Match) findings.push("STAGE2_MUTATES");
    }
    // --everySeq: 브로드캐스트된 seq 마다 라이브 ≟ 1차 재구성 — 첫 분기 seq
    if (everySeq) {
      row.seqCheck.captured = liveBySeq.size;
      for (const st of s1.states) {
        const liveAt = liveBySeq.get(st.lastEventSeq);
        if (liveAt === undefined) continue;
        row.seqCheck.compared++;
        const reconAt = normJson(st);
        if (liveAt !== reconAt) {
          row.seqCheck.firstMismatch = { seq: st.lastEventSeq, diff: firstDiff(JSON.parse(liveAt), JSON.parse(reconAt)) ?? { path: "$", kind: "VALUE", left: "?", right: "?" } };
          findings.push("SEQ_MISMATCH");
          break;
        }
      }
    }
    const pick = new Set<number>();
    const n = s1.states.length;
    for (let k = 0; k < n; k++) if (viewStride === 1 || k % viewStride === 0) pick.add(k);
    pick.add(n - 1);
    s1.events.forEach((ev, k) => {
      if (ev.type === AUGMENT_DRAFTED || ev.type === ROUND_STARTED || ev.type === ROUND_SETTLED) {
        for (const d of [0, 1, 2]) if (k + d < n) pick.add(k + d);
      }
    });
    for (const k of [...pick].sort((a, b) => a - b)) {
      const st = s1.states[k]!;
      row.views.checkedStates++;
      for (const v of VIEWERS) {
        row.views.calls++;
        try {
          const view = buildReplayView(st, v, contentAugments);
          if (view === null || typeof view !== "object") throw new Error(`view is ${String(view)}`);
        } catch (e) {
          if (row.views.errors.length < 20) row.views.errors.push({ seq: st.lastEventSeq, viewer: v, msg: errMsg(e) });
        }
      }
    }
    if (row.views.errors.length > 0) findings.push("VIEW_THROW");
    row.ms.views = Math.round(performance.now() - t);
  }

  // (d) 클라이언트 replayRebuild
  if (clientMod !== null) {
    const t = performance.now();
    try {
      const rebuilt = captureWarn(row.client.warns, () => clientMod!.rebuildReplay([...lines]));
      row.client.ok = true;
      row.client.events = rebuilt.events.length;
      row.client.truncated = rebuilt.events.length !== lines.length - 1;
      if (row.client.truncated) findings.push("CLIENT_TRUNCATED");
      const cFinal = norm(rebuilt.states[rebuilt.states.length - 1]!);
      if (liveJson !== null && trailingLines === 0) {
        row.client.firstDiff = firstDiff(liveJson, cFinal);
        row.client.match = row.client.firstDiff === null;
        if (!row.client.match) findings.push("CLIENT_FINAL_MISMATCH");
      }
      if (serverFinal !== null && trailingLines === 0) {
        row.client.vsServerDiff = firstDiff(cFinal, serverFinal);
        row.client.vsServer = row.client.vsServerDiff === null;
        if (!row.client.vsServer) findings.push("CLIENT_VS_SERVER");
      }
      row.client.settledEvents = rebuilt.events.filter((e) => e.type === ROUND_SETTLED).length;
      try {
        row.client.settlements = clientMod.replaySettlements(rebuilt).length;
        if (row.client.settlements !== row.client.settledEvents) findings.push("CLIENT_SETTLEMENTS");
      } catch (e) {
        row.client.warns.push(`replaySettlements: ${errMsg(e)}`);
        findings.push("CLIENT_SETTLEMENTS_THROW");
      }
      for (let k = 0; k < rebuilt.states.length; k++) {
        row.client.viewAtCalls++;
        try { clientMod.replayViewAt(rebuilt, k); } catch (e) {
          if (row.client.viewAtErrors.length < 10) row.client.viewAtErrors.push({ index: k, msg: errMsg(e) });
        }
      }
      if (row.client.viewAtErrors.length > 0) findings.push("CLIENT_VIEW_THROW");
      const pick = new Set<number>([rebuilt.states.length - 1]);
      for (let k = 0; k < rebuilt.states.length; k += viewStride) pick.add(k);
      for (const k of pick) {
        row.client.insightCalls++;
        const ins = captureWarn(row.client.warns, () => clientMod!.replayInsightAt(rebuilt, k));
        if (ins === null) row.client.insightNulls++;
      }
      if (row.client.insightNulls > 0) findings.push("CLIENT_INSIGHT_NULL");
      if (row.client.warns.length > 0) findings.push("CLIENT_WARN");
    } catch (e) {
      row.client.error = errMsg(e);
      findings.push("CLIENT_RECON_THROW");
    }
    row.ms.client = Math.round(performance.now() - t);
  } else {
    findings.push("CLIENT_IMPORT_FAIL");
  }

  if (findings.length > 0 || keepReplays) row.replayPath = replayPath;
  else if (existsSync(replayPath)) unlinkSync(replayPath);
  row.ms.total = Math.round(performance.now() - t0);
  return row;
}

// ─────────────────────────── 메인 ───────────────────────────

const plans = buildPlan().filter((p) => (only === null || only.includes(p.i)) && p.i % shards === shard);
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, `roundtrip-${tag}-${shard}of${shards}.jsonl`);
writeFileSync(outFile, "");
console.log(`plan=${plans.length} shard=${shard}/${shards} client=${clientImport} viewStride=${viewStride} timeoutMs=${timeoutMs} out=${outFile}`);

const rows: Row[] = [];
for (const p of plans) {
  const row = await runOne(p);
  rows.push(row);
  appendFileSync(outFile, JSON.stringify(row) + "\n");
  console.log(
    `i=${p.i} ${p.kind} forced=${p.forced ?? "-"} seed=${p.seed} ${p.mode} drafts=${p.drafts} ms=${row.ms.total}` +
    ` (match ${row.ms.match} srv ${row.ms.server} file ${row.ms.replayFile} rounds ${row.ms.rounds} views ${row.ms.views} cli ${row.ms.client})` +
    ` ev=${row.events} rounds=${row.rounds} srv=${row.server.match} s2=${row.server.stage2Match} file=${row.replayFile.match}` +
    ` rnd=${row.roundsCheck.matched}/${row.roundsCheck.checked} views=${row.views.calls}/${row.views.errors.length}err` +
    ` cli=${row.client.match} c~s=${row.client.vsServer} drafted=${row.presetCheck.draftedLines} notLogged=${row.presetCheck.notLogged.length}` +
    (row.findings.length > 0 ? ` FINDINGS=${[...new Set(row.findings)].join(",")}` : "") +
    (row.warnings.length > 0 ? ` warn=${row.warnings.join(",")}` : ""),
  );
  if (row.server.firstDiff !== null) console.log(`   live↔server ${row.server.firstDiff.path} (${row.server.firstDiff.kind}): ${row.server.firstDiff.left} ≠ ${row.server.firstDiff.right}`);
  if (row.roundsCheck.firstMismatch !== null) console.log(`   round-prefix ${row.roundsCheck.firstMismatch.round}@${row.roundsCheck.firstMismatch.seq} ${row.roundsCheck.firstMismatch.diff.path}`);
  if (row.seqCheck.firstMismatch !== null) console.log(`   every-seq first divergence @seq${row.seqCheck.firstMismatch.seq} ${row.seqCheck.firstMismatch.diff.path} (${row.seqCheck.firstMismatch.diff.kind}): ${row.seqCheck.firstMismatch.diff.left} ≠ ${row.seqCheck.firstMismatch.diff.right}`);
  if (row.client.firstDiff !== null) console.log(`   live↔client ${row.client.firstDiff.path} (${row.client.firstDiff.kind})`);
  if (row.server.stage2Diff !== null) console.log(`   stage1↔stage2 ${row.server.stage2Diff.path} (${row.server.stage2Diff.kind}): ${row.server.stage2Diff.left} ≠ ${row.server.stage2Diff.right}`);
}

const md = buildReport(rows, `리플레이 라운드트립 — ${tag} 샤드 ${shard}/${shards}`);
const mdPath = join(outDir, `report-${tag}-${shard}of${shards}.md`);
writeFileSync(mdPath, md);
const nf = rows.filter((r) => r.findings.length > 0).length;
const sum = (k: keyof Row["ms"]): number => rows.reduce((s, r) => s + r.ms[k], 0);
console.log(`DONE games=${rows.length} findings=${nf} avgMs=${rows.length ? Math.round(sum("total") / rows.length) : 0}` +
  ` (match ${Math.round(sum("match") / Math.max(1, rows.length))} srv ${Math.round(sum("server") / Math.max(1, rows.length))} views ${Math.round(sum("views") / Math.max(1, rows.length))} cli ${Math.round(sum("client") / Math.max(1, rows.length))}) report=${mdPath}`);
process.exitCode = nf > 0 ? 1 : 0;
