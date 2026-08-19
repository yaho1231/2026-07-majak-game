/**
 * 시스템 횡단 QA 러너 — 실제 드래프트로 완주시키고 횡단 불변식을 검사한다.
 * (qa-lab/harness.ts 는 presetAugments 전용이라 드래프트 경로를 밟지 않는다)
 */
import {
  DEFAULT_HANCHAN_CONFIG,
  HanchanController,
  hanchanConfigForMode,
  draftDoneKey,
  Prng,
  isRoundScopedKey,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  PlayerId,
  DraftStage,
  GameEndReason,
} from "@majak/core";
import { standardAugments } from "@majak/core";
import { contentAugments } from "@majak/content";
import { PERSONAS, PersonaAgent, SEATS, checkState } from "../harness.js";
import type { Ledger, Persona, Violation } from "../harness.js";

export { PERSONAS, SEATS };
export const ALL_AUGMENTS: AugmentDef[] = [...standardAugments, ...contentAugments];
export const byId = new Map(ALL_AUGMENTS.map((d) => [d.id, d]));

export interface RoundSnap {
  idx: number;
  wind: number;
  round: number;
  honba: number;
  dealerSeat: number;
  scores: Record<string, number>;
  augKeys: string[];
}

export interface DraftSnap {
  stage: DraftStage;
  wind: number;
  round: number;
  honba: number;
  /** 스테이지 종료 시점 보유 */
  held: Record<string, string[]>;
  /** 이 스테이지에 실제로 화면에 선 카드 (AUGMENT_OFFERED) */
  offered: Record<string, string[]>;
}

export interface CrossReport {
  seed: number;
  mode: "hanchan" | "tonpuu";
  crash?: string;
  effectErrors: string[];
  violations: Violation[];
  rounds: number;
  roundSnaps: RoundSnap[];
  drafts: DraftSnap[];
  endReason?: GameEndReason;
  finalScores: Record<string, number>;
  finalAugments: Record<string, string[]>;
  finalAugData: Record<string, unknown>;
  finalRound: { wind: number; round: number; honba: number };
  rankings?: unknown;
  /** 결정성 비교용 이벤트 로그 요약 */
  logDigest: string;
  logLen: number;
}

export interface CrossOpts {
  seed: number;
  mode?: "hanchan" | "tonpuu";
  personas?: Record<PlayerId, Persona>;
  onRound?: (st: GameState, phase: "start" | "end", r: CrossReport) => void;
  onState?: (st: GameState, out: Violation[]) => void;
  timeoutMs?: number;
  configOverride?: Record<string, unknown>;
  /** 결정성 검사용 — 전체 이벤트 로그를 문자열로 남긴다 (느림) */
  fullLog?: boolean;
}

function digest(s: string): string {
  let h1 = 0x811c9dc5, h2 = 0x1000193;
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619) >>> 0;
    h2 = Math.imul(h2 + s.charCodeAt(i), 2654435761) >>> 0;
  }
  return `${h1.toString(16)}-${h2.toString(16)}-${s.length}`;
}

export async function runDraftMatch(o: CrossOpts): Promise<CrossReport> {
  const mode = o.mode ?? "hanchan";
  const personas =
    o.personas ??
    ({ p0: PERSONAS.masher!, p1: PERSONAS.caller!, p2: PERSONAS.riichiRusher!, p3: PERSONAS.folder! } as Record<
      PlayerId,
      Persona
    >);
  const violations: Violation[] = [];
  const effectErrors: string[] = [];
  const agents = SEATS.map((id, i) => new PersonaAgent(id, personas[id]!, o.seed * 131 + i * 7 + 1));
  const seen: Ledger = { notes: [], reasons: [], drifts: [] };
  const rep: CrossReport = {
    seed: o.seed,
    mode,
    effectErrors,
    violations,
    rounds: 0,
    roundSnaps: [],
    drafts: [],
    finalScores: {},
    finalAugments: {},
    finalAugData: {},
    finalRound: { wind: 0, round: 0, honba: 0 },
    logDigest: "",
    logLen: 0,
  };
  let lastGame: { engine: { state: GameState; eventLog: readonly unknown[] } } | null = null;
  let offerMark = 0;
  const engineLog = (): { type?: string; payload?: unknown }[] =>
    ((lastGame?.engine.eventLog ??
      (ctrl as unknown as { game?: { engine: { eventLog: readonly unknown[] } } }).game?.engine
        .eventLog ??
      []) as { type?: string; payload?: unknown }[]);

  const ctrl = new HanchanController(
    agents,
    {
      ...DEFAULT_HANCHAN_CONFIG,
      ...hanchanConfigForMode(mode),
      seed: o.seed,
      extraAugments: contentAugments,
      agentDecideTimeoutMs: 20_000,
      interRoundDelayMs: 0,
      autoMoveDelayMs: 0,
      ...(o.configOverride ?? {}),
    } as never,
    {
      onRoundStart: (g: never) => {
        const game = g as unknown as { engine: { state: GameState; eventLog: readonly unknown[] } };
        lastGame = game;
        const st = game.engine.state;
        rep.rounds++;
        rep.roundSnaps.push({
          idx: rep.rounds,
          wind: st.round.prevalentWind,
          round: st.round.roundNumber,
          honba: st.round.honba,
          dealerSeat: st.round.dealerSeat,
          scores: Object.fromEntries(st.players.map((p) => [p.id, p.score])),
          augKeys: Object.keys(st.augmentData).sort(),
        });
        o.onRound?.(st, "start", rep);
      },
      onRoundEnd: (g: never) => {
        const game = g as unknown as { engine: { state: GameState; eventLog: readonly unknown[] } };
        lastGame = game;
        o.onRound?.(game.engine.state, "end", rep);
      },
      onDraftEnd: (stage: DraftStage) => {
        const st = ctrl.gameState;
        if (st === null) return;
        // 이 스테이지에서 새로 찍힌 AUGMENT_OFFERED 만 읽는다
        const log = engineLog();
        const offered: Record<string, string[]> = {};
        for (let i = offerMark; i < log.length; i++) {
          const e = log[i]!;
          if (e.type !== "AugmentOffered") continue;
          const p = e.payload as { player: string; augmentIds: string[] };
          offered[p.player] = [...p.augmentIds];
        }
        offerMark = log.length;
        rep.drafts.push({
          stage,
          wind: st.round.prevalentWind,
          round: st.round.roundNumber,
          honba: st.round.honba,
          held: Object.fromEntries(st.players.map((p) => [p.id, [...p.augments]])),
          offered,
        });
      },
      onEvent: (j: string) => {
        try {
          const e = JSON.parse(j) as { type?: string; payload?: Record<string, unknown> };
          if (e.type === "ScoreChanged") {
            const r = e.payload?.["reason"];
            if (typeof r === "string" && r !== "") seen.reasons.push(`ScoreChanged(${r}:${String(e.payload?.["delta"])})`);
          } else if (e.type === "RoundSettled") {
            const notes = e.payload?.["augPoints"] as { player?: string; augId?: string; points?: number }[] | undefined;
            for (const n of notes ?? []) seen.notes.push(`augPoint(${n.augId}:${n.player}:${n.points})`);
          }
        } catch { /* ignore */ }
      },
      onGameOver: (_r: unknown, reason: GameEndReason) => {
        rep.endReason = reason;
      },
      onEffectError: (f: unknown) => {
        const s = `${(f as { event?: { type?: string } }).event?.type ?? "?"}: ${String(
          (f as { error?: unknown }).error ?? JSON.stringify(f),
        )}`;
        if (effectErrors.length < 100) effectErrors.push(s);
      },
    } as never,
  );
  ctrl.addSpectator({
    id: "qa",
    sendView: () => {
      const st = ctrl.gameState;
      if (st === null) return;
      checkState(st, violations, seen);
      o.onState?.(st, violations);
    },
  });
  try {
    rep.rankings = await withTimeout(ctrl.run(), o.timeoutMs ?? 120_000);
  } catch (e) {
    rep.crash = e instanceof Error ? `${e.message}\n${(e.stack ?? "").split("\n").slice(1, 6).join("\n")}` : String(e);
  }
  const st = ctrl.gameState;
  if (st !== null) {
    for (const p of st.players) {
      rep.finalScores[p.id] = p.score;
      rep.finalAugments[p.id] = [...p.augments];
    }
    rep.finalAugData = { ...st.augmentData };
    rep.finalRound = {
      wind: st.round.prevalentWind,
      round: st.round.roundNumber,
      honba: st.round.honba,
    };
  }
  const log = engineLog();
  rep.logLen = log.length;
  rep.logDigest = digest(JSON.stringify(log));
  return rep;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((res, rej) => {
    const t = setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
}

// ── 횡단 검사기 ────────────────────────────────────────────────────

export interface CrossIssue {
  kind: string;
  detail: string;
}

/** 드래프트/모드/보유 관련 규칙 위반 검사 */
export function auditAugments(rep: CrossReport): CrossIssue[] {
  const out: CrossIssue[] = [];
  const owner = new Map<string, string>();
  for (const [seat, held] of Object.entries(rep.finalAugments)) {
    // 1) 같은 사람이 같은 증강 2개
    const cnt = new Map<string, number>();
    for (const id of held) cnt.set(id, (cnt.get(id) ?? 0) + 1);
    for (const [id, n] of cnt) if (n > 1) out.push({ kind: "DUP_SELF", detail: `${seat} holds ${id} x${n}` });
    // 2) 게임 내 동일 증강 2인 보유
    for (const id of new Set(held)) {
      const prev = owner.get(id);
      if (prev !== undefined) out.push({ kind: "DUP_GAME", detail: `${id} held by ${prev} and ${seat}` });
      else owner.set(id, seat);
    }
    // 3) conflicts 위반
    for (let i = 0; i < held.length; i++) {
      for (let j = i + 1; j < held.length; j++) {
        const a = held[i]!, b = held[j]!;
        const ca = byId.get(a)?.conflicts ?? [];
        const cb = byId.get(b)?.conflicts ?? [];
        if (ca.includes(b) || cb.includes(a)) out.push({ kind: "CONFLICT", detail: `${seat}: ${a} + ${b}` });
      }
    }
    // 4) 모드 필터 위반
    for (const id of held) {
      const d = byId.get(id);
      if (d === undefined) { out.push({ kind: "UNKNOWN_AUG", detail: `${seat}: ${id}` }); continue; }
      if (d.modes !== undefined && !d.modes.includes(rep.mode)) {
        out.push({ kind: "MODE_VIOLATION", detail: `${seat}: ${id} modes=${d.modes.join("/")} but mode=${rep.mode}` });
      }
    }
  }
  // 5) draftStages 필터 — 각 스테이지 종료 시점의 새 획득이 그 스테이지에 허용되는가
  const prev: Record<string, string[]> = { p0: [], p1: [], p2: [], p3: [] };
  for (const d of rep.drafts) {
    for (const [seat, held] of Object.entries(d.held)) {
      const before = prev[seat] ?? [];
      const gained = held.slice(before.length);
      for (const id of gained) {
        const def = byId.get(id);
        if (def?.draftStages !== undefined && !def.draftStages.includes(d.stage)) {
          out.push({ kind: "STAGE_VIOLATION", detail: `${seat} got ${id} at ${d.stage} (allowed ${def.draftStages.join("/")})` });
        }
      }
      prev[seat] = [...held];
    }
  }
  return out;
}

/** 드래프트 스테이지가 스케줄대로 열렸는가 */
export function auditSchedule(rep: CrossReport): CrossIssue[] {
  const out: CrossIssue[] = [];
  const expected: DraftStage[] =
    rep.mode === "tonpuu"
      ? ["gameStart", "eastThird", "eastFourth"]
      : ["gameStart", "eastThird", "southEntry", "southThird"];
  const seen = rep.drafts.map((d) => d.stage);
  const dupes = seen.filter((s, i) => seen.indexOf(s) !== i);
  if (dupes.length > 0) out.push({ kind: "STAGE_TWICE", detail: dupes.join(",") });
  for (const s of seen) if (!expected.includes(s)) out.push({ kind: "STAGE_UNEXPECTED", detail: s });
  // 국에 도달했는데 그 스테이지가 열리지 않았는가
  const visited = (w: number, r: number): boolean =>
    rep.roundSnaps.some((s2) => s2.wind === w && s2.round === r);
  const trig: Partial<Record<DraftStage, [number, number]>> = {
    eastThird: [1, 3], eastFourth: [1, 4], southEntry: [2, 1], southThird: [2, 3],
  };
  for (const st of expected) {
    const t = trig[st];
    if (t === undefined) continue;
    if (visited(t[0], t[1]) && !seen.includes(st)) {
      out.push({ kind: "MISSED_STAGE", detail: `${st} — 국 ${t[0]}-${t[1]} 은 열렸는데 드래프트가 없다` });
    }
  }
  // 스테이지 완료 플래그
  for (const s of seen) {
    for (const seat of SEATS) {
      if (rep.finalAugData[draftDoneKey(s, seat)] !== true) {
        out.push({ kind: "STAGE_FLAG_MISSING", detail: `${s}/${seat}` });
      }
    }
  }
  return out;
}

/** 종국 판정 검사 */
export function auditEnd(rep: CrossReport): CrossIssue[] {
  const out: CrossIssue[] = [];
  if (rep.crash !== undefined) return out;
  const maxWind = rep.mode === "tonpuu" ? 1 : 2;
  const scores = Object.values(rep.finalScores);
  const top = Math.max(...scores);
  const wind = rep.finalRound.wind;
  const bankrupt = scores.some((s) => s < 0);
  if (rep.endReason === undefined) { out.push({ kind: "NO_END_REASON", detail: "" }); return out; }
  switch (rep.endReason) {
    case "dobi":
      if (!bankrupt) out.push({ kind: "DOBI_NO_BANKRUPT", detail: JSON.stringify(rep.finalScores) });
      break;
    case "normal":
      if (bankrupt) break;
      // 정상 종료인데 아직 정규 구간을 다 안 돌았다면 이상
      if (wind <= maxWind) out.push({ kind: "END_TOO_EARLY", detail: `wind=${wind} round=${rep.finalRound.round} scores=${JSON.stringify(rep.finalScores)}` });
      // 서입 조건: 정규 종료인데 1위가 반환점 미만이면 서입을 갔어야 한다
      if (wind === maxWind + 1 && top < 30000) {
        out.push({ kind: "NO_WEST_ENTRY", detail: `top=${top} wind=${wind}` });
      }
      break;
    case "westEntryDecided":
      if (wind <= maxWind) out.push({ kind: "WEST_BUT_EARLY", detail: `wind=${wind}` });
      break;
    default:
      break;
  }
  if (wind > maxWind + 2) out.push({ kind: "END_TOO_LATE", detail: `wind=${wind} round=${rep.finalRound.round}` });
  return out;
}

/** 국 경계 augmentData 잔류 검사 */
export function auditRoundScope(rep: CrossReport): CrossIssue[] {
  const out: CrossIssue[] = [];
  for (let i = 1; i < rep.roundSnaps.length; i++) {
    const prev = rep.roundSnaps[i - 1]!;
    const cur = rep.roundSnaps[i]!;
    // 국이 실제로 넘어갔을 때만 (같은 국 반복 = 연장이어도 setupRound는 돈다)
    for (const k of cur.augKeys) {
      if (isRoundScopedKey(k) && prev.augKeys.includes(k)) {
        // 새 국 시작 시점에 #round 키가 남아 있으면 안 된다 (ROUND_STARTED 리액션이
        // 다시 실은 것일 수 있으므로 '이전 국에도 있었다'만으로는 확정 불가 → 후속 확인)
        out.push({ kind: "ROUND_SCOPED_CARRIED", detail: `${k} at ${cur.wind}-${cur.round}-${cur.honba}` });
      }
    }
  }
  return out;
}

export function allPersonaSets(rng: Prng): Record<PlayerId, Persona> {
  const names = Object.keys(PERSONAS);
  const pick = (): Persona => PERSONAS[names[rng.int(names.length)]!]!;
  return { p0: pick(), p1: pick(), p2: pick(), p3: pick() } as Record<PlayerId, Persona>;
}
