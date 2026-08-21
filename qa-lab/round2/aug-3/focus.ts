/**
 * aug-3 정밀 조사용 러너 — 특정 액션을 **우선적으로** 누르는 에이전트로 돌리고
 * 모든 확정 이벤트를 잡아 둔다. 도메인 가설을 하나씩 확정하는 데 쓴다.
 */
import {
  DEFAULT_HANCHAN_CONFIG,
  HanchanController,
  Prng,
} from "@majak/core";
import type {
  ActionOption,
  AugmentDef,
  DecisionPrompt,
  DraftStage,
  GameState,
  PlayerAgent,
  PlayerId,
  PlayerView,
} from "@majak/core";
import { contentAugments } from "@majak/content";
import { STD_ACTIONS } from "../../harness.js";

export const SEATS: PlayerId[] = ["p0", "p1", "p2", "p3"];

export interface GameEvent {
  type: string;
  payload: Record<string, unknown>;
}

export interface FocusOpts {
  seed: number;
  mode?: "hanchan" | "tonpuu";
  preset: Record<string, readonly string[]>;
  presetHands?: Record<string, readonly string[]>;
  /** 좌석별 우선 액션 타입 (앞쪽 우선). 없으면 표준 봇처럼 군다. */
  prefer?: Record<string, readonly string[]>;
  /** 좌석별 절대 누르지 않을 액션 타입 */
  avoid?: Record<string, readonly string[]>;
  /** 화료 버튼을 누를지 (기본 true) */
  win?: Record<string, boolean>;
  riichi?: Record<string, boolean>;
  call?: Record<string, boolean>;
  /** 드래프트를 끈다 (다른 증강이 섞이지 않게) */
  noDraft?: boolean;
  onState?: (st: GameState) => void;
  onEvent?: (e: GameEvent, st: GameState | null) => void;
  timeoutMs?: number;
}

export interface FocusReport {
  crash?: string;
  effectErrors: string[];
  events: GameEvent[];
  actions: Record<string, number>;
  finalScores: Record<string, number>;
}

class FocusAgent implements PlayerAgent {
  readonly isBot = true;
  readonly nickname: string;
  private readonly rng: Prng;
  taken: string[] = [];
  constructor(
    readonly id: PlayerId,
    private readonly o: FocusOpts,
    seed: number,
  ) {
    this.nickname = `f-${id}`;
    this.rng = new Prng(seed);
  }
  sendView(_v: PlayerView): void {}
  async decide(prompt: DecisionPrompt): Promise<ActionOption> {
    const opts = prompt.options;
    const prefer = this.o.prefer?.[this.id] ?? [];
    const avoid = new Set(this.o.avoid?.[this.id] ?? []);
    const pick = (o: ActionOption): ActionOption => {
      this.taken.push(o.type);
      return o;
    };
    const pool = opts.filter((o) => !avoid.has(o.type));
    for (const t of prefer) {
      const hit = pool.find((o) => o.type === t);
      if (hit !== undefined) return pick(hit);
    }
    const wantWin = this.o.win?.[this.id] ?? true;
    const w = pool.find((o) => o.type === "win");
    if (w !== undefined && wantWin) return pick(w);
    const wantRiichi = this.o.riichi?.[this.id] ?? false;
    const r = pool.find((o) => o.type === "riichi");
    if (r !== undefined && wantRiichi) return pick(r);
    const wantCall = this.o.call?.[this.id] ?? false;
    if (wantCall) {
      for (const t of ["pon", "chi", "minkan", "ankan"]) {
        const c = pool.find((o) => o.type === t);
        if (c !== undefined) return pick(c);
      }
    }
    const pass = pool.find((o) => o.type === "pass");
    if (pass !== undefined) return pick(pass);
    const disc = pool.filter((o) => o.type === "discard" || o.type === "free_discard");
    if (disc.length > 0) return pick(disc[this.rng.int(disc.length)] as ActionOption);
    const std = pool.filter((o) => STD_ACTIONS.has(o.type));
    if (std.length > 0) return pick(std[this.rng.int(std.length)] as ActionOption);
    if (pool.length === 0) {
      if (opts.length === 0) throw new Error("EMPTY_OPTIONS");
      return pick(opts[0] as ActionOption);
    }
    return pick(pool[this.rng.int(pool.length)] as ActionOption);
  }
  async decideDraft(_s: DraftStage, choices: AugmentDef[]): Promise<string> {
    return (choices[this.rng.int(choices.length)] as AugmentDef).id;
  }
}

export async function runFocus(o: FocusOpts): Promise<FocusReport> {
  const mode = o.mode ?? "hanchan";
  const agents = SEATS.map((id, i) => new FocusAgent(id, o, o.seed * 131 + i * 7 + 1));
  const events: GameEvent[] = [];
  const effectErrors: string[] = [];
  const report: FocusReport = { effectErrors, events, actions: {}, finalScores: {} };
  const ctrl = new HanchanController(agents, {
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
  } as never, {
    onEvent: (j: string) => {
      try {
        const e = JSON.parse(j) as GameEvent;
        if (events.length < 200_000) events.push(e);
        o.onEvent?.(e, ctrl.gameState);
      } catch { /* ignore */ }
    },
    onEffectError: (f: unknown) => {
      const s = `${(f as { event?: { type?: string } }).event?.type ?? "?"}: ${String((f as { error?: unknown }).error ?? JSON.stringify(f))}`;
      if (effectErrors.length < 200) effectErrors.push(s);
    },
  } as never);
  if (o.onState !== undefined) {
    ctrl.addSpectator({
      id: "qa",
      sendView: () => {
        const st = ctrl.gameState;
        if (st !== null) o.onState?.(st);
      },
    });
  }
  try {
    await withTimeout(ctrl.run(), o.timeoutMs ?? 120_000);
  } catch (e) {
    report.crash = e instanceof Error ? `${e.message}\n${(e.stack ?? "").split("\n").slice(1, 8).join("\n")}` : String(e);
  }
  const st = ctrl.gameState;
  if (st !== null) for (const p of st.players) report.finalScores[p.id] = p.score;
  for (const a of agents) for (const t of a.taken) report.actions[t] = (report.actions[t] ?? 0) + 1;
  return report;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((res, rej) => {
    const t = setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
}
