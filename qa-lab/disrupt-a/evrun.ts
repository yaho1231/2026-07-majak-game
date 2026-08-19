/** 이벤트 로그까지 보는 러너 (harness와 별개 — onRoundEnd에서 engine.eventLog를 읽는다) */
import { DEFAULT_HANCHAN_CONFIG, HanchanController } from "@majak/core";
import type { PlayerId, GameState, GameEvent } from "@majak/core";
import { contentAugments } from "@majak/content";
import { PersonaAgent, SEATS } from "./h.js";
import type { Persona } from "./h.js";

export interface EvRunOpts {
  seed: number;
  mode?: "hanchan" | "tonpuu";
  preset: Record<PlayerId, readonly string[]>;
  personas: Record<PlayerId, Persona>;
  /** 국이 끝날 때마다: 그 국의 이벤트 목록 + 국 시작 상태 */
  onRoundEvents: (events: readonly GameEvent[], state: GameState) => void;
  timeoutMs?: number;
}

export async function evRun(o: EvRunOpts): Promise<{ crash?: string; rounds: number; effectErrors: string[] }> {
  const mode = o.mode ?? "hanchan";
  const agents = SEATS.map((id, i) => new PersonaAgent(id, o.personas[id]!, o.seed * 131 + i * 7 + 1));
  let cursor = 0;
  let rounds = 0;
  const effectErrors: string[] = [];
  const ctrl = new HanchanController(agents, {
    ...DEFAULT_HANCHAN_CONFIG,
    mode,
    seed: o.seed,
    maxWind: mode === "tonpuu" ? 1 : 2,
    westEntry: false,
    draftSchedules: [],
    extraAugments: contentAugments,
    presetAugments: o.preset,
    agentDecideTimeoutMs: 20_000,
  } as never, {
    onRoundStart: (g: { engine: { eventLog: GameEvent[] } }) => { cursor = g.engine.eventLog.length; rounds++; },
    onRoundEnd: (g: { engine: { eventLog: GameEvent[]; state: GameState } }) => {
      o.onRoundEvents(g.engine.eventLog.slice(cursor), g.engine.state);
      cursor = g.engine.eventLog.length;
    },
    onEffectError: (f: unknown) => {
      if (effectErrors.length < 50) effectErrors.push(JSON.stringify(f).slice(0, 200));
    },
  } as never);
  let crash: string | undefined;
  try {
    await new Promise<void>((res, rej) => {
      const t = setTimeout(() => rej(new Error(`TIMEOUT ${o.timeoutMs ?? 90000}ms`)), o.timeoutMs ?? 90_000);
      ctrl.run().then(() => { clearTimeout(t); res(); }, (e) => { clearTimeout(t); rej(e); });
    });
  } catch (e) {
    crash = e instanceof Error ? e.message : String(e);
  }
  return crash === undefined ? { rounds, effectErrors } : { crash, rounds, effectErrors };
}
