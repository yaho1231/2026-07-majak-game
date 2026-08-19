/**
 * defcall QA 러너 — harness.runMatch 를 확장해서 이벤트 로그까지 본다.
 * 방어 6종 + 후로 8종 전용 불변식.
 */
import {
  DEFAULT_HANCHAN_CONFIG,
  HanchanController,
  DEAD_WALL,
  WALL,
  handZone,
} from "@majak/core";
import type {
  GameState,
  PlayerId,
  RoundSettledPayload,
} from "@majak/core";
import { contentAugments } from "@majak/content";
import { PersonaAgent, SEATS, checkState } from "../harness.js";
import type { Ledger } from "../harness.js";
import type { Persona, Violation } from "../harness.js";

export interface Ev { type: string; payload: any; seq?: number }

export interface DefcallReport {
  seed: number;
  mode: "hanchan" | "tonpuu";
  preset: Record<PlayerId, readonly string[]>;
  crash?: string;
  effectErrors: string[];
  violations: Violation[];
  rounds: number;
  finalScores: Record<PlayerId, number>;
  events: Ev[];
  actionsTaken: Record<string, number>;
}

export interface DefcallOpts {
  seed: number;
  mode?: "hanchan" | "tonpuu";
  preset: Record<PlayerId, readonly string[]>;
  personas: Record<PlayerId, Persona>;
  presetHands?: Record<PlayerId, readonly string[]>;
  keepEvents?: boolean;
  /** true면 드래프트를 통째로 끈다 — preset 증강만 남는다 (진짜 격리) */
  noDraft?: boolean;
  /** HanchanConfig 추가 덮어쓰기 (startScore·dobi 등) */
  config?: Record<string, unknown>;
  onState?: (st: GameState, out: Violation[]) => void;
  onEvent?: (e: Ev, st: GameState | null, out: Violation[]) => void;
  onRound?: (st: GameState, phase: "start" | "end") => void;
  timeoutMs?: number;
}

export async function runDefcall(o: DefcallOpts): Promise<DefcallReport> {
  const mode = o.mode ?? "hanchan";
  const violations: Violation[] = [];
  const effectErrors: string[] = [];
  const events: Ev[] = [];
  const agents = SEATS.map((id, i) => new PersonaAgent(id, o.personas[id]!, o.seed * 131 + i * 7 + 1));
  const seen: Ledger = { notes: [], reasons: [], drifts: [] };
  let rounds = 0;
  const rep: DefcallReport = {
    seed: o.seed, mode, preset: o.preset, effectErrors, violations,
    rounds: 0, finalScores: {} as Record<PlayerId, number>, events, actionsTaken: {},
  };
  let ctrl: HanchanController;
  ctrl = new HanchanController(agents, {
    ...DEFAULT_HANCHAN_CONFIG,
    mode,
    seed: o.seed,
    maxWind: mode === "tonpuu" ? 1 : 2,
    westEntry: false,
    draftSchedules: o.noDraft === true
      ? []
      : mode === "tonpuu"
        ? ["eastFirst", "eastThird", "eastFourth"]
        : ["eastFirst", "eastThird", "southEntry", "southThird"],
    extraAugments: contentAugments,
    presetAugments: o.preset,
    ...(o.presetHands !== undefined ? { presetHands: o.presetHands } : {}),
    agentDecideTimeoutMs: 20_000,
    ...(o.config ?? {}),
  } as never, {
    onRoundStart: (g: any) => { rounds++; o.onRound?.(g.engine.state, "start"); },
    onRoundEnd: (g: any) => { o.onRound?.(g.engine.state, "end"); },
    onEffectError: (f: any) => {
      const s = `${f?.event?.type ?? "?"}: ${String(f?.error ?? JSON.stringify(f))}`;
      if (effectErrors.length < 100) effectErrors.push(s);
    },
    onEvent: (json: string) => {
      let e: Ev;
      try { e = JSON.parse(json) as Ev; } catch { return; }
      if (e.type === "ScoreChanged") {
        const r = e.payload?.reason;
        const d = Number(e.payload?.delta ?? 0);
        if (typeof r === "string" && r !== "") seen.reasons.push({ label: `ScoreChanged(${r} ${d})`, amount: d });
      } else if (e.type === "RoundSettled") {
        for (const n of (e.payload?.augPoints ?? []) as any[]) seen.notes.push({ label: `augPoint(${n.augId} ${n.player} ${n.points ?? 0})`, amount: n.points ?? 0 });
      }
      if (o.keepEvents === true && events.length < 200_000) events.push(e);
      o.onEvent?.(e, ctrl.gameState, violations);
    },
  } as never);
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
    await withTimeout(ctrl.run(), o.timeoutMs ?? 180_000);
  } catch (e) {
    rep.crash = e instanceof Error ? `${e.message}\n${(e.stack ?? "").split("\n").slice(1, 8).join("\n")}` : String(e);
  }
  {
    const pool = [...seen.notes, ...seen.reasons];
    const used = new Set<number>();
    for (const d of seen.drifts) {
      let hit = -1;
      for (let i = 0; i < pool.length; i++) {
        if (used.has(i)) continue;
        if (pool[i]!.amount === d.delta) { hit = i; break; }
      }
      if (hit >= 0) { used.add(hit); violations.push({ kind: "SCORE_DRIFT_ATTRIBUTED", round: d.round, detail: `${d.from} -> ${d.to} (${d.delta}) — ${pool[hit]!.label}` }); }
      else violations.push({ kind: "SCORE_DRIFT_UNEXPLAINED", round: d.round, detail: `${d.from} -> ${d.to} (${d.delta}) — 근거 없음. 후보: ${pool.map((x) => x.label).slice(-6).join(", ")}` });
    }
  }
  const st = ctrl.gameState;
  if (st !== null) for (const p of st.players) rep.finalScores[p.id] = p.score;
  rep.rounds = rounds;
  for (const a of agents) for (const t of a.actionLog) rep.actionsTaken[t] = (rep.actionsTaken[t] ?? 0) + 1;
  return rep;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((res, rej) => {
    const t = setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms (soft-lock 의심)`)), ms);
    p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
}

export { SEATS, DEAD_WALL, WALL, handZone };
export type { GameState, PlayerId, RoundSettledPayload, Violation, Persona };
