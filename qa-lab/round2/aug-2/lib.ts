/** aug-2 전용 러너 — harness.runMatch와 같되 **이벤트 스트림**을 호출자에게 넘긴다. */
import { DEFAULT_HANCHAN_CONFIG, HanchanController } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";
import { PERSONAS, PersonaAgent, SEATS, checkState } from "../../harness.js";
import type { Ledger, Persona, Violation } from "../../harness.js";

export { PERSONAS, SEATS };

export interface Ev { type: string; payload: Record<string, unknown> }

export interface RunOpts2 {
  seed: number;
  mode?: "hanchan" | "tonpuu";
  preset: Record<PlayerId, readonly string[]>;
  personas: Record<PlayerId, Persona>;
  presetHands?: Record<PlayerId, readonly string[]>;
  onRound?: (st: GameState, phase: "start" | "end") => void;
  onState?: (st: GameState, out: Violation[]) => void;
  onEvent?: (e: Ev, st: GameState | null) => void;
  timeoutMs?: number;
}

export interface Report2 {
  crash?: string;
  effectErrors: string[];
  violations: Violation[];
  rounds: number;
  finalScores: Record<string, number>;
  actionsTaken: Record<string, number>;
}

export async function runMatch2(o: RunOpts2): Promise<Report2> {
  const mode = o.mode ?? "hanchan";
  const violations: Violation[] = [];
  const effectErrors: string[] = [];
  const agents = SEATS.map((id, i) => new PersonaAgent(id, o.personas[id]!, o.seed * 131 + i * 7 + 1));
  const seen: Ledger = { notes: [], reasons: [], drifts: [] };
  let rounds = 0;
  const ctrl = new HanchanController(agents, {
    ...DEFAULT_HANCHAN_CONFIG,
    mode,
    seed: o.seed,
    maxWind: mode === "tonpuu" ? 1 : 2,
    westEntry: false,
    draftSchedules: mode === "tonpuu"
      ? ["eastFirst", "eastThird", "eastFourth"]
      : ["eastFirst", "eastThird", "southEntry", "southThird"],
    extraAugments: contentAugments,
    presetAugments: o.preset,
    ...(o.presetHands !== undefined ? { presetHands: o.presetHands } : {}),
    agentDecideTimeoutMs: 20_000,
  }, {
    onRoundStart: (g: { engine: { state: GameState } }) => { rounds++; o.onRound?.(g.engine.state, "start"); },
    onRoundEnd: (g: { engine: { state: GameState } }) => { o.onRound?.(g.engine.state, "end"); },
    onEvent: (j: string) => {
      try {
        const e = JSON.parse(j) as Ev;
        o.onEvent?.(e, ctrl.gameState);
      } catch { /* ignore */ }
    },
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
  const rep: Report2 = { effectErrors, violations, rounds: 0, finalScores: {}, actionsTaken: {} };
  try {
    await withTimeout(ctrl.run(), o.timeoutMs ?? 120_000);
  } catch (e) {
    rep.crash = e instanceof Error ? `${e.message}\n${(e.stack ?? "").split("\n").slice(1, 6).join("\n")}` : String(e);
  }
  const st = ctrl.gameState;
  if (st !== null) for (const p of st.players) rep.finalScores[p.id] = p.score;
  rep.rounds = rounds;
  for (const a of agents) for (const t of a.actionLog) rep.actionsTaken[t] = (rep.actionsTaken[t] ?? 0) + 1;
  return rep;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((res, rej) => {
    const t = setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
}
