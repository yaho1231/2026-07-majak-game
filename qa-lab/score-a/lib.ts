/**
 * score-a 전용 러너 — 하네스의 runMatch에 **정산 단위 관찰**을 붙인다.
 * (하네스는 GameState만 넘겨 주어 ROUND_SETTLED payload를 볼 수 없다.)
 */
import {
  DEFAULT_HANCHAN_CONFIG,
  HanchanController,
  ROUND_SETTLED,
} from "@majak/core";
import type { GameState, PlayerId, RoundSettledPayload } from "@majak/core";
import { contentAugments } from "@majak/content";
import { PERSONAS, PersonaAgent, SEATS, checkState } from "./vendor.js";
import type { Ledger, Persona, Violation } from "./vendor.js";

export { PERSONAS, SEATS };
export type { Persona, Violation };

export interface SettleObs {
  payload: RoundSettledPayload;
  /** 정산 직전 상태 (리듀서 적용 전) */
  before: GameState;
  /** 정산 직후 상태 */
  after: GameState;
  /** 정산 직전 공탁 */
  potBefore: number;
  roundIndex: number;
}

export interface Run2Opts {
  seed: number;
  mode?: "hanchan" | "tonpuu";
  preset: Record<PlayerId, readonly string[]>;
  personas: Record<PlayerId, Persona>;
  presetHands?: Record<PlayerId, readonly string[]>;
  onSettle?: (o: SettleObs) => void;
  onState?: (st: GameState, out: Violation[]) => void;
  timeoutMs?: number;
}

export interface Report2 {
  seed: number;
  crash?: string;
  effectErrors: string[];
  violations: Violation[];
  rounds: number;
  finalScores: Record<PlayerId, number>;
  actionsTaken: Record<string, number>;
}

export async function runMatch2(o: Run2Opts): Promise<Report2> {
  const mode = o.mode ?? "hanchan";
  const violations: Violation[] = [];
  const effectErrors: string[] = [];
  const agents = SEATS.map((id, i) => new PersonaAgent(id, o.personas[id]!, o.seed * 131 + i * 7 + 1));
  const seen: Ledger = { notes: [], reasons: [] };
  let rounds = 0;
  // 정산 직전 스냅샷 — 브로드캐스트마다 갱신하되 round.over는 건너뛴다
  let liveSnap: GameState | null = null;

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
    interRoundDelayMs: 0,
  }, {
    onRoundStart: () => { rounds++; },
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
    onRoundEnd: (g: { engine: { state: GameState; eventLog: readonly { type: string; payload: unknown }[] } }, _outcome: string, roundIndex: number) => {
      const log = g.engine.eventLog;
      for (let i = log.length - 1; i >= 0; i--) {
        if (log[i]?.type === ROUND_SETTLED) {
          o.onSettle?.({
            payload: log[i]!.payload as RoundSettledPayload,
            before: liveSnap ?? g.engine.state,
            after: g.engine.state,
            potBefore: liveSnap?.round.riichiPot ?? 0,
            roundIndex,
          });
          break;
        }
      }
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
      if (st.round.phase !== "round.over") liveSnap = st;
      checkState(st, violations, seen);
      o.onState?.(st, violations);
    },
  });

  const report: Report2 = {
    seed: o.seed, effectErrors, violations, rounds,
    finalScores: {} as Record<PlayerId, number>, actionsTaken: {},
  };
  try {
    await withTimeout(ctrl.run(), o.timeoutMs ?? 180_000);
  } catch (e) {
    report.crash = e instanceof Error ? `${e.message}\n${(e.stack ?? "").split("\n").slice(1, 5).join("\n")}` : String(e);
  }
  const st = ctrl.gameState;
  if (st !== null) for (const p of st.players) report.finalScores[p.id] = p.score;
  report.rounds = rounds;
  for (const a of agents) for (const t of a.actionLog) report.actionsTaken[t] = (report.actionsTaken[t] ?? 0) + 1;
  return report;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((res, rej) => {
    const t = setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
}
