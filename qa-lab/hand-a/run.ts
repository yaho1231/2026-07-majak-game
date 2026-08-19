/**
 * hand-a 전용 러너 — qa-lab/harness.ts 의 runMatch 와 같지만
 *  · 드래프트를 끌 수 있다(draftSchedules) → 강제 증강만 순수 격리해서 본다
 *  · 에이전트를 직접 넘길 수 있다(스크립트 에이전트로 최소 재현을 짠다)
 * harness.ts 는 공용이므로 건드리지 않는다.
 */
import {
  DEFAULT_HANCHAN_CONFIG,
  HanchanController,
} from "@majak/core";
import type { GameState, PlayerAgent, PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";
import { PersonaAgent, SEATS, checkState } from "../harness.js";
import type { Persona, Violation, MatchReport } from "../harness.js";

export interface RunOpts2 {
  seed: number;
  mode?: "hanchan" | "tonpuu";
  preset: Record<PlayerId, readonly string[]>;
  personas?: Record<PlayerId, Persona>;
  agents?: PlayerAgent[];
  presetHands?: Record<string, readonly string[]>;
  draftSchedules?: readonly string[];
  onRound?: (st: GameState, phase: "start" | "end") => void;
  onState?: (st: GameState, out: Violation[]) => void;
  timeoutMs?: number;
}

export async function runMatch2(o: RunOpts2): Promise<MatchReport> {
  const mode = o.mode ?? "hanchan";
  const violations: Violation[] = [];
  const effectErrors: string[] = [];
  const agents: PlayerAgent[] =
    o.agents ??
    SEATS.map((id, i) => new PersonaAgent(id, o.personas![id]!, o.seed * 131 + i * 7 + 1));
  // harness.checkState 의 원장 타입이 바뀌어도 깨지지 않게 여유 필드를 함께 넘긴다
  const seen = { notes: [] as unknown[], reasons: [] as unknown[], drifts: [] as unknown[] } as never;
  let rounds = 0;
  const report: MatchReport = {
    seed: o.seed, mode, preset: o.preset, effectErrors, violations,
    actionsTaken: {}, rounds: 0, finalScores: {} as Record<PlayerId, number>,
  };
  const ctrl = new HanchanController(agents, {
    ...DEFAULT_HANCHAN_CONFIG,
    mode,
    seed: o.seed,
    maxWind: mode === "tonpuu" ? 1 : 2,
    westEntry: false,
    draftSchedules: o.draftSchedules ?? [],
    extraAugments: contentAugments,
    presetAugments: o.preset,
    ...(o.presetHands !== undefined ? { presetHands: o.presetHands } : {}),
    agentDecideTimeoutMs: 20_000,
  } as never, {
    onRoundStart: (g: { engine: { state: GameState } }) => { rounds++; o.onRound?.(g.engine.state, "start"); },
    onRoundEnd: (g: { engine: { state: GameState } }) => { o.onRound?.(g.engine.state, "end"); },
    onEffectError: (f: unknown) => {
      const s = `${(f as { event?: { type?: string } }).event?.type ?? "?"}: ${String((f as { error?: unknown }).error ?? JSON.stringify(f))}`;
      if (effectErrors.length < 100) effectErrors.push(s);
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
    report.rankings = await withTimeout(ctrl.run(), o.timeoutMs ?? 180_000);
  } catch (e) {
    report.crash = e instanceof Error ? `${e.message}\n${(e.stack ?? "").split("\n").slice(1, 6).join("\n")}` : String(e);
  }
  const st = ctrl.gameState;
  if (st !== null) for (const p of st.players) report.finalScores[p.id] = p.score;
  report.rounds = rounds;
  for (const a of agents) {
    const log = (a as { actionLog?: string[] }).actionLog;
    if (log !== undefined) for (const t of log) report.actionsTaken[t] = (report.actionsTaken[t] ?? 0) + 1;
  }
  return report;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((res, rej) => {
    const t = setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
}
