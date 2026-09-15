/**
 * B-1 단독 스위프 공용 (docs/55 §4 B-1) — 작업 목록·시드·한 판 실행.
 *
 * 한 판 = p0 에 증강 **1장**(드래프트 끔), p1~p3 는 빈 preset + 고정 페르소나 믹스.
 * 판마다 {aug, persona, mode, seed} 만 있으면 `repro.ts` 로 똑같이 다시 돌릴 수 있다 —
 * 시드는 카탈로그 순서가 아니라 (aug|mode|persona|seedIdx) 문자열 해시라 카탈로그가
 * 늘어도 같은 판이 같은 시드를 받는다.
 *
 * packages/ 는 읽기만 한다. qa-lab/harness.ts 의 runMatch(drafts:false·onEvent)와
 * qa-lab/pairs/lib.ts 의 pairInvariants 를 단일 id 로 쓴다.
 */
import { augmentIdForActionType } from "@majak/core";
import type { PlayerId } from "@majak/core";
import { PERSONAS, STD_ACTIONS, allAugments, byId, offerable, runMatch } from "../../harness.js";
import type { Persona, Violation } from "../../harness.js";
import { pairInvariants } from "../../pairs/lib.js";
import { hooksOf, installHookCounters, resetHooks, zeroHooks } from "./hooks.js";
import type { HookCount } from "./hooks.js";

installHookCounters();

export type Mode = "hanchan" | "tonpuu";
export const MODES: readonly Mode[] = ["hanchan", "tonpuu"];
/** p0 가 돌아가며 맡는 페르소나 6종 (harness PERSONAS 키) */
export const P0_PERSONAS: readonly string[] = ["masher", "riichiRusher", "folder", "caller", "chaos", "stall"];
/** p1~p3 고정 믹스 — 상대 행동(리치·접기·울기)이 필요한 카드가 켜지도록 */
export const OPP_MIX: Readonly<Record<"p1" | "p2" | "p3", string>> = { p1: "riichiRusher", p2: "folder", p3: "caller" };
/** 카탈로그 = content 113 + standard 4 (계획 X-11). id 정렬 — 샤드 배정이 안정적이도록 */
export const CATALOG_IDS: readonly string[] = [...allAugments].map((d) => d.id).sort();

export interface Job {
  /** 전체 작업 목록에서의 번호 (샤드 = i % shards) */
  i: number;
  aug: string;
  mode: Mode;
  persona: string;
  seedIdx: number;
  seed: number;
}

export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let k = 0; k < s.length; k++) {
    h ^= s.charCodeAt(k);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 판의 시드 — (aug|mode|persona|seedIdx) 해시, 1 이상 31비트 */
export function seedOf(aug: string, mode: Mode, persona: string, seedIdx: number): number {
  return (fnv1a(`${aug}|${mode}|${persona}|${seedIdx}`) & 0x7fffffff) || 1;
}

export interface JobFilter {
  augs?: readonly string[];
  personas?: readonly string[];
  modes?: readonly Mode[];
}

/** 전체 작업 목록 — aug × mode × persona × seedIdx (순서 고정) */
export function enumerateJobs(seeds: number, f: JobFilter = {}): Job[] {
  const augs = f.augs ?? CATALOG_IDS;
  for (const a of augs) if (!byId.has(a)) throw new Error(`unknown augment id: ${a}`);
  const personas = f.personas ?? P0_PERSONAS;
  for (const p of personas) if (PERSONAS[p] === undefined) throw new Error(`unknown persona: ${p}`);
  const modes = f.modes ?? MODES;
  const out: Job[] = [];
  let i = 0;
  for (const aug of augs) {
    for (const mode of modes) {
      for (const persona of personas) {
        for (let seedIdx = 0; seedIdx < seeds; seedIdx++) {
          out.push({ i: i++, aug, mode, persona, seedIdx, seed: seedOf(aug, mode, persona, seedIdx) });
        }
      }
    }
  }
  return out;
}

export const jobKey = (j: { aug: string; mode: string; persona: string; seedIdx: number }): string =>
  `${j.aug}|${j.mode}|${j.persona}|${j.seedIdx}`;

/** 한 판의 결과 줄 (out/<shard>.jsonl 의 한 줄) */
export interface Row {
  i: number;
  aug: string;
  tier: string;
  category: string;
  persona: string;
  mode: Mode;
  seed: number;
  seedIdx: number;
  preset: Record<PlayerId, readonly string[]>;
  personas: Record<PlayerId, string>;
  /** `modes` 가 맞지 않아 건너뜀 (판을 돌리지 않았다) */
  skipped?: string;
  ms: number;
  rounds: number;
  /** 엔진 throw (타임아웃은 여기 말고 softlock 으로) */
  crash: string | null;
  /** 판을 돌리기 전/후 도구 자체의 예외 */
  fatal?: string;
  softlock: boolean;
  effectErrors: number;
  effectErrorSamples: string[];
  /** kind → 건수 (SCORE_DRIFT_ATTRIBUTED 포함 — 판정은 analyze 에서) */
  violations: Record<string, number>;
  violationSamples: string[];
  actionsTaken: Record<string, number>;
  /** p0 의 이 증강이 세운 액션이 실제로 눌린 횟수 */
  fired: number;
  /** 증강이 augmentData·이벤트·액션·훅(emit/intercept 변경/옵션 제시) 어디에든 흔적을 남겼는가 */
  touched: boolean;
  touchedBy: { data: boolean; events: number; fired: number; eventTypes: string[] };
  /** p0 증강의 install ctx 훅 계수 (hooks.ts; SOLO_NO_INSTRUMENT=1 이면 전부 0) */
  hooks: HookCount;
  /** 훅은 불렸지만(ruleSet/interCall/reactCall) 상태를 바꾼 흔적이 없다 — 규칙·인터셉터형 패시브 */
  passive: boolean;
  finalScores: Record<string, number>;
}

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** 이벤트 줄에 id 가 **낱말로** 들어 있는가 (late_bloomer 가 late_bloomer_east 에 걸리지 않게) */
export function idTokenRegex(id: string): RegExp {
  return new RegExp(`(^|[^a-z0-9_])${esc(id)}([^a-z0-9_]|$)`);
}
/** 설치·제시 이벤트는 흔적으로 치지 않는다 (preset 설치도 AugmentDrafted 를 낸다) */
const NOT_A_TRACE = new Set(["__init__", "AugmentDrafted", "AugmentOffered"]);

export interface PlayOpts {
  timeoutMs?: number;
  /** 리플레이 라운드트립 등 — 이벤트 줄을 그대로 받는다 */
  onEvent?: (line: string) => void;
}

export async function playOne(job: Job, opts: PlayOpts = {}): Promise<Row> {
  const def = byId.get(job.aug);
  if (def === undefined) throw new Error(`unknown augment id: ${job.aug}`);
  const preset: Record<PlayerId, readonly string[]> = { p0: [job.aug], p1: [], p2: [], p3: [] };
  const personaNames: Record<PlayerId, string> = { p0: job.persona, ...OPP_MIX };
  const base: Omit<Row, "ms" | "rounds" | "crash" | "softlock" | "effectErrors" | "effectErrorSamples" | "violations" | "violationSamples" | "actionsTaken" | "fired" | "touched" | "touchedBy" | "hooks" | "passive" | "finalScores"> = {
    i: job.i, aug: job.aug, tier: String(def.tier), category: String(def.category),
    persona: job.persona, mode: job.mode, seed: job.seed, seedIdx: job.seedIdx, preset, personas: personaNames,
  };
  const empty = (): Row => ({
    ...base, ms: 0, rounds: 0, crash: null, softlock: false, effectErrors: 0, effectErrorSamples: [],
    violations: {}, violationSamples: [], actionsTaken: {}, fired: 0, touched: false,
    touchedBy: { data: false, events: 0, fired: 0, eventTypes: [] }, hooks: zeroHooks(), passive: false, finalScores: {},
  });
  if (!offerable(def, job.mode)) {
    return { ...empty(), skipped: `modes=${JSON.stringify(def.modes)}` };
  }
  const personas = Object.fromEntries(
    (Object.entries(personaNames) as [PlayerId, string][]).map(([s, n]) => [s, PERSONAS[n] as Persona]),
  ) as Record<PlayerId, Persona>;

  const inv = pairInvariants([job.aug]);
  const tokenRe = idTokenRegex(job.aug);
  let eventHits = 0;
  const eventTypes = new Map<string, number>();
  const usesOverTotal = new Set<string>();

  const t0 = Date.now();
  let row: Row;
  resetHooks();
  try {
    const r = await runMatch({
      seed: job.seed,
      mode: job.mode,
      preset,
      personas,
      drafts: false,
      timeoutMs: opts.timeoutMs ?? 90_000,
      onRound: inv.onRound,
      onState: (st, out) => {
        // pairInvariants 를 단일 id 로 붙인다. 단, USES_OVER_CAP 은 «cap = matchUses» 가정이라
        // scaledUses(N>1) 카드에서 오탐이 난다 — 보유자 전용 채널 view:<seat>:uses:<id> 의
        // total(진짜 상한)이 있으면 그것과 대조해 USES_OVER_TOTAL 로만 남긴다.
        const scratch: Violation[] = [];
        inv.onState(st, scratch);
        for (const v of scratch) {
          if (v.kind === "USES_OVER_CAP") {
            const m = /^([a-z0-9_]+):uses:(p[0-3])=(\d+) > cap/.exec(v.detail);
            if (m !== null) {
              const ch = st.augmentData[`view:${m[2]}:uses:${m[1]}`] as { total?: unknown } | undefined;
              const total = ch?.total;
              const n = Number(m[3]);
              if (typeof total === "number") {
                if (n > total && !usesOverTotal.has(`${m[1]}:${n}`)) {
                  usesOverTotal.add(`${m[1]}:${n}`);
                  out.push({ ...v, kind: "USES_OVER_TOTAL", detail: `${m[1]}:uses:${m[2]}=${n} > view total ${total}` });
                }
                continue;
              }
            }
          }
          if (out.length < 400) out.push(v);
        }
      },
      onEvent: (line) => {
        opts.onEvent?.(line);
        let type = "?";
        const q = line.indexOf('"type":"');
        if (q >= 0) type = line.slice(q + 8, line.indexOf('"', q + 8));
        if (NOT_A_TRACE.has(type)) return;
        if (tokenRe.test(line)) {
          eventHits++;
          eventTypes.set(type, (eventTypes.get(type) ?? 0) + 1);
        }
      },
    });
    const ms = Date.now() - t0;
    const violations: Record<string, number> = {};
    const samples: string[] = [];
    const softlock = r.crash !== undefined && r.crash.startsWith("TIMEOUT");
    if (softlock) violations["SOFTLOCK_TIMEOUT"] = 1;
    for (const v of r.violations) {
      violations[v.kind] = (violations[v.kind] ?? 0) + 1;
      if (v.kind !== "SCORE_DRIFT_ATTRIBUTED" && samples.length < 6) {
        samples.push(`${v.kind}@${v.round}${v.seat !== undefined ? "/" + v.seat : ""}: ${v.detail.slice(0, 200)}`);
      }
    }
    let fired = 0;
    for (const [t, n] of Object.entries(r.actionsTaken)) {
      if (STD_ACTIONS.has(t)) continue;
      if (augmentIdForActionType(t) === job.aug) fired += n;
    }
    const dataTouched = inv.touched().a;
    const hooks = hooksOf("p0", job.aug);
    if (hooks.installed === 0 && process.env["SOLO_NO_INSTRUMENT"] !== "1") {
      violations["AUG_NOT_INSTALLED"] = 1;
      if (samples.length < 6) samples.push(`AUG_NOT_INSTALLED: p0 에 ${job.aug} install 이 한 번도 안 불림`);
    }
    const hookTouched = hooks.reactEmit > 0 || hooks.interChange > 0 || hooks.optionOffer > 0;
    const hookCalled = hooks.ruleSet > 0 || hooks.reactCall > 0 || hooks.interCall > 0;
    row = {
      ...base,
      ms, rounds: r.rounds,
      crash: r.crash !== undefined && !softlock ? r.crash : null,
      softlock,
      effectErrors: r.effectErrors.length,
      effectErrorSamples: r.effectErrors.slice(0, 3).map((s) => s.slice(0, 300)),
      violations, violationSamples: samples,
      actionsTaken: r.actionsTaken,
      fired,
      touched: dataTouched || eventHits > 0 || fired > 0 || hookTouched,
      touchedBy: { data: dataTouched, events: eventHits, fired, eventTypes: [...eventTypes.keys()].slice(0, 6) },
      hooks,
      passive: !(dataTouched || eventHits > 0 || fired > 0 || hookTouched) && hookCalled,
      finalScores: r.finalScores,
    };
  } catch (e) {
    row = { ...empty(), ms: Date.now() - t0, fatal: e instanceof Error ? `${e.message}\n${(e.stack ?? "").split("\n").slice(1, 4).join("\n")}` : String(e) };
  }
  return row;
}

/** 판정에서 무시하는 kind (설계상 뱅크 발행이 근거와 맞은 것) */
export const IGNORE_KINDS: ReadonlySet<string> = new Set(["SCORE_DRIFT_ATTRIBUTED"]);
export function badKinds(v: Record<string, number>): string[] {
  return Object.keys(v).filter((k) => !IGNORE_KINDS.has(k) && (v[k] ?? 0) > 0).sort();
}
