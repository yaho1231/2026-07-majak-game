/**
 * B-2 조합 스위프 공용 라이브러리 (qa-lab/round5/combo/).
 *
 * 한 사람(p0)이 3~4장을 동시에 들었을 때의 크래시·훅 예외·불변식 위반·소프트락을 잡는다.
 * 소스(`packages/`)는 읽기만 한다. 하네스(`qa-lab/harness.ts`)의 `runMatch(drafts:false)`로
 * 드래프트 없이 preset만 설치한 판을 완주시킨다.
 *
 *  - `validCombo`  : conflicts·모드 제한을 걸러 «설치가 조용히 빠지는» 조합을 미리 막는다
 *                    (HanchanController.installPreset 은 같은 좌석의 상호 배제를 **말없이** 버린다)
 *  - `play`        : 판 하나. 시드·모드·preset·페르소나·ms·실패 분류·시그니처·touched 를 남긴다
 *  - `shrink`      : 실패한 조합을 같은 시드·같은 p1~p3 로 부분집합(n-1 → … → 1장)까지 줄여
 *                    최소 재현 조합을 찾고, p0 빈손(대조군)도 같은 실패를 내는지 본다
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AUGMENT_SYNERGY, Prng } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { PERSONAS, SEATS, allAugments, assignPreset, byId, conflicting, offerable, runMatch } from "../../harness.js";
import type { Persona, RunOpts, Violation } from "../../harness.js";
import { pairInvariants } from "../../pairs/lib.js";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const OUT_DIR = join(HERE, "out");
export const COMBOS_FILE = join(HERE, "combos.jsonl");
export const REPO_ROOT = join(HERE, "..", "..", "..");

export type Mode = "hanchan" | "tonpuu";
export type Tier = "risky" | "signal" | "dist";
export const MODES: readonly Mode[] = ["hanchan", "tonpuu"];

/** combos.jsonl 한 줄 */
export interface ComboEntry {
  idx: number;
  tier: Tier;
  /** 정렬된 id — 재현·중복 제거의 키 */
  combo: string[];
  /** 출처 태그 (예: `risky:C(27,3)`, `docs/48:36`, `sim:out/x.jsonl`, `dist:fallback`) */
  src: string;
  /** 이 조합 전원이 제공 가능한 모드 */
  modes: Mode[];
  /** signal 층: 문서에서 뽑은 원래의 쌍 (3번째 장은 같은 축에서 얹은 것) */
  pair?: [string, string];
}

export const canon = (ids: readonly string[]): string[] => [...new Set(ids)].sort();
export const comboKey = (ids: readonly string[]): string => canon(ids).join("+");

export function hasConflict(ids: readonly string[]): string | null {
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (conflicting(ids[i] as string, ids[j] as string)) return `${ids[i]}~${ids[j]}`;
    }
  }
  return null;
}

export function modesFor(ids: readonly string[]): Mode[] {
  return MODES.filter((m) => ids.every((id) => {
    const d = byId.get(id);
    return d !== undefined && offerable(d, m);
  }));
}

/** 설치 가능한 조합인가 — 아니면 이유 */
export function validCombo(ids: readonly string[]): { ok: true; modes: Mode[] } | { ok: false; why: string } {
  const c = canon(ids);
  if (c.length < 1) return { ok: false, why: "empty" };
  const unknown = c.filter((id) => !byId.has(id));
  if (unknown.length > 0) return { ok: false, why: `unknown:${unknown.join(",")}` };
  const conf = hasConflict(c);
  if (conf !== null) return { ok: false, why: `conflict:${conf}` };
  const modes = modesFor(c);
  if (modes.length === 0) return { ok: false, why: "no-common-mode" };
  return { ok: true, modes };
}

export function tagsOf(id: string): readonly string[] {
  return AUGMENT_SYNERGY[id]?.tags ?? [];
}

/** 전 카탈로그 id (content 113 + standard 4) */
export const ALL_IDS: readonly string[] = allAugments.map((d) => d.id);

// ───────────────────────────── 판 하나 ─────────────────────────────

export type FailClass = "crash" | "softlock" | "effect" | "violation" | "invalid";

export interface PlayArgs {
  seed: number;
  mode: Mode;
  /** p0 = 조합(부분집합), p1~p3 = 무작위 2장 — shrink 는 p0 만 바꾼다 */
  preset: Record<PlayerId, string[]>;
  personaNames: string[];
  /** 검사 대상 카드 — touched·presetDropped 의 기준 (보통 p0 의 원래 조합) */
  combo: readonly string[];
  timeoutMs: number;
  /** pairs/lib 의 엄격 불변식(USES_OVER_CAP·HAND_SIZE_STRICT·TILE_TOTAL …)까지 건다 */
  strict: boolean;
}

export interface Played {
  seed: number;
  mode: Mode;
  preset: Record<PlayerId, string[]>;
  personas: string[];
  drafts: false;
  ms: number;
  rounds: number;
  crash: string | null;
  effectErrors: string[];
  /** SCORE_DRIFT_ATTRIBUTED 와 알려진 오탐을 뺀 위반 (`KIND@round/seat: detail`) */
  violations: string[];
  /** 1국 시작 시 실제 설치 목록 */
  installedAtRound1: Record<PlayerId, string[]> | null;
  /** combo 중 p0 에 설치되지 않은 것 (gen 단계가 놓친 conflicts·모드 제한) */
  presetDropped: string[];
  /** combo 카드별 — augmentData 에 흔적을 남겼는가 */
  touched: Record<string, boolean>;
  actions: Record<string, number>;
  status: "ok" | "fail" | "invalid";
  failClass: FailClass | null;
  /** 실패 시그니처 — shrink 가 «같은 결함인가»를 비교하는 키 */
  sig: string | null;
}

const IGNORE_KINDS = new Set(["SCORE_DRIFT_ATTRIBUTED"]);

/** 알려진 오탐 — findings/pairs.md: 무장해제된 진짜 용은 16/17 → 13/14 로 되돌아간다 */
function knownFalsePositive(v: Violation, preset: Record<PlayerId, string[]>): boolean {
  if (v.kind === "HAND_SIZE_STRICT") {
    const all = Object.values(preset).flat();
    if (all.includes("true_dragon") && all.includes("disarm")) return true;
  }
  return false;
}

const norm = (s: string): string => s.replace(/\d+/g, "#").replace(/\s+/g, " ").trim();

export function signatureOf(p: Pick<Played, "crash" | "effectErrors" | "violations">): { cls: FailClass; sig: string } | null {
  if (p.crash !== null) {
    if (p.crash.startsWith("TIMEOUT")) return { cls: "softlock", sig: "SOFTLOCK" };
    return { cls: "crash", sig: `CRASH:${norm(p.crash.split("\n")[0] ?? "").slice(0, 120)}` };
  }
  if (p.effectErrors.length > 0) {
    return { cls: "effect", sig: `EFF:${norm(p.effectErrors[0] ?? "").slice(0, 120)}` };
  }
  if (p.violations.length > 0) {
    const kinds = [...new Set(p.violations.map((v) => v.split("@")[0] ?? v))].sort();
    return { cls: "violation", sig: `VIOL:${kinds.join(",")}` };
  }
  return null;
}

export function personasFrom(names: readonly string[]): Record<PlayerId, Persona> {
  return Object.fromEntries(SEATS.map((s, i) => {
    const n = names[i] ?? "chaos";
    const p = PERSONAS[n];
    if (p === undefined) throw new Error(`unknown persona ${n}`);
    return [s, p];
  })) as Record<PlayerId, Persona>;
}

export async function play(a: PlayArgs): Promise<Played> {
  const personas = personasFrom(a.personaNames);
  let installedAtRound1: Record<PlayerId, string[]> | null = null;
  const seenKeys = new Set<string>();
  const inv = a.strict ? pairInvariants(a.combo) : null;
  const opts: RunOpts = {
    seed: a.seed,
    mode: a.mode,
    preset: a.preset,
    personas,
    drafts: false,
    timeoutMs: a.timeoutMs,
    onRound: (st: GameState, phase) => {
      inv?.onRound(st, phase);
      if (phase === "start" && installedAtRound1 === null) {
        installedAtRound1 = Object.fromEntries(st.players.map((p) => [p.id, [...p.augments]])) as Record<PlayerId, string[]>;
      }
    },
    onState: (st: GameState, out: Violation[]) => {
      for (const k of Object.keys(st.augmentData)) seenKeys.add(k);
      inv?.onState(st, out);
    },
  };
  const t0 = Date.now();
  const r = await runMatch(opts);
  const ms = Date.now() - t0;
  const bad = r.violations.filter((v) => !IGNORE_KINDS.has(v.kind) && !knownFalsePositive(v, a.preset));
  const violations = bad.slice(0, 40).map((v) => `${v.kind}@${v.round}${v.seat !== undefined ? "/" + v.seat : ""}: ${v.detail.slice(0, 160)}`);
  const installed = installedAtRound1 as Record<PlayerId, string[]> | null;
  const p0 = installed?.p0 ?? [];
  const presetDropped = installed === null ? [] : (a.preset.p0 ?? []).filter((id) => !p0.includes(id));
  const touched: Record<string, boolean> = {};
  for (const id of a.combo) {
    touched[id] = [...seenKeys].some((k) => k.startsWith(`${id}:`) || k.includes(`:${id}:`) || k.includes(`uses:${id}`) || k.endsWith(`:${id}`));
  }
  const out: Played = {
    seed: a.seed, mode: a.mode, preset: a.preset, personas: a.personaNames, drafts: false,
    ms, rounds: r.rounds,
    crash: r.crash ?? null,
    effectErrors: r.effectErrors.slice(0, 20),
    violations,
    installedAtRound1: installed,
    presetDropped,
    touched,
    actions: r.actionsTaken,
    status: "ok", failClass: null, sig: null,
  };
  const s = signatureOf(out);
  if (s !== null) { out.status = "fail"; out.failClass = s.cls; out.sig = s.sig; }
  else if (presetDropped.length > 0) { out.status = "invalid"; out.failClass = "invalid"; out.sig = `PRESET_DROPPED:${presetDropped.join(",")}`; }
  return out;
}

// ───────────────────────────── 판 배정 ─────────────────────────────

export const SEED_BASE = 710_000;
const PERSONA_NAMES = Object.keys(PERSONAS);

/**
 * 조합 idx 의 k 번째 판(k=0,1) — 시드·모드·p1~p3 preset·페르소나를 결정론으로 만든다.
 *  - 시드 = SEED_BASE + idx*2 + k
 *  - 모드 = k=0 반장전 · k=1 동풍전 (조합의 모드 제한이 있으면 가능한 쪽)
 *  - p0 페르소나 = k=0 masher · k=1 chaos, p1~p3 는 시드 rng 로 6종 중 무작위
 *  - p1~p3 = assignPreset 무작위 2장 (조합과 겹치지 않음)
 */
export function gameArgs(e: ComboEntry, k: number, timeoutMs: number, strict: boolean): PlayArgs {
  const seed = SEED_BASE + e.idx * 2 + k;
  let mode: Mode = k % 2 === 0 ? "hanchan" : "tonpuu";
  if (!e.modes.includes(mode)) mode = e.modes[0] ?? "hanchan";
  const rng = new Prng((seed * 2654435761) >>> 0);
  const preset = assignPreset(rng, mode, e.combo, 2);
  const personaNames = [k % 2 === 0 ? "masher" : "chaos", ...[1, 2, 3].map(() => PERSONA_NAMES[rng.int(PERSONA_NAMES.length)] as string)];
  return { seed, mode, preset, personaNames, combo: e.combo, timeoutMs, strict };
}

// ───────────────────────────── shrink ─────────────────────────────

export interface ShrinkTrial {
  subset: string[];
  played: Played;
}

export interface ShrinkResult {
  /** 실패를 유지한 최소 조합 (원 조합 그대로면 «부분집합 어느 것도 재현 안 됨») */
  min: string[];
  /** 최소 조합의 시그니처가 원 실패와 같은가 */
  sameSig: boolean;
  minSig: string | null;
  /** p0 빈손(대조군)도 실패하는가 — true 면 조합이 아니라 p1~p3·시드의 문제 */
  baselineFails: boolean;
  baselineSig: string | null;
  trials: number;
  ms: number;
}

/**
 * 탐욕 델타 디버깅: 크기 n-1 부분집합을 전부 돌려 실패하는 것(같은 시그니처 우선)으로
 * 내려간다. 같은 시드·모드·p1~p3·페르소나를 유지하고 p0 만 바꾼다.
 * `isFail` 을 바꾸면 실제 실패 없이도 함수 자체를 검증할 수 있다(스모크).
 */
export async function shrink(
  base: PlayArgs,
  original: Played,
  opts: { isFail?: (p: Played) => boolean; onTrial?: (t: ShrinkTrial) => void } = {},
): Promise<ShrinkResult> {
  const isFail = opts.isFail ?? ((p: Played): boolean => p.status === "fail");
  const t0 = Date.now();
  let current = [...(base.preset.p0 ?? [])];
  let currentPlayed: Played = original;
  let trials = 0;
  const run = async (subset: string[]): Promise<Played> => {
    trials++;
    // combo 도 부분집합으로 — 엄격 불변식의 AUG_LOST 가 «뺀 카드»를 유실로 오인하지 않게
    const p = await play({ ...base, combo: subset, preset: { ...base.preset, p0: subset } });
    opts.onTrial?.({ subset, played: p });
    return p;
  };
  while (current.length > 1) {
    let sameSig: { subset: string[]; played: Played } | null = null;
    let anyFail: { subset: string[]; played: Played } | null = null;
    for (let i = 0; i < current.length; i++) {
      const subset = current.filter((_, j) => j !== i);
      const p = await run(subset);
      if (!isFail(p)) continue;
      if (p.sig === original.sig && sameSig === null) sameSig = { subset, played: p };
      if (anyFail === null) anyFail = { subset, played: p };
      if (sameSig !== null) break;
    }
    const next = sameSig ?? anyFail;
    if (next === null) break;
    current = next.subset;
    currentPlayed = next.played;
  }
  const baseline = await run([]);
  return {
    min: current,
    sameSig: currentPlayed.sig === original.sig,
    minSig: currentPlayed.sig,
    baselineFails: isFail(baseline),
    baselineSig: baseline.sig,
    trials,
    ms: Date.now() - t0,
  };
}

// ───────────────────────────── 입출력 ─────────────────────────────

export function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8").split(/\r?\n/).filter((l) => l.trim() !== "").map((l) => JSON.parse(l) as T);
}

export function ensureOutDir(): string {
  mkdirSync(OUT_DIR, { recursive: true });
  return OUT_DIR;
}

export function loadCombos(path = COMBOS_FILE): ComboEntry[] {
  const rows = readJsonl<ComboEntry>(path);
  if (rows.length === 0) throw new Error(`combos 없음: ${path} — 먼저 gen3.ts 를 돌려라`);
  return rows;
}

export function argFlag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
export function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
