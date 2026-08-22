/**
 * 타점·정산·뱅크 축 시너지 검증용 공용 하네스.
 * packages/ 는 절대 건드리지 않는다 — 읽기만.
 */
import {
  FlowController,
  ROUND_SETTLED,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type {
  AugmentDef,
  GameEvent,
  GameState,
  PlayerId,
  RoundSettledPayload,
} from "@majak/core";
import { contentAugments } from "@majak/content";
import { craft } from "../../../packages/content/test/helpers.js";
import type { CraftConfig } from "../../../packages/content/test/helpers.js";

export const DEFS = new Map<string, AugmentDef>(
  contentAugments.map((a) => [a.id, a]),
);

export type Seats = Partial<Record<PlayerId, string[]>>;

export interface RunOpts {
  craft: CraftConfig;
  /** 좌석별 증강 id 목록 */
  augs: Seats;
  /** 정산 전에 심어 둘 augmentData (state를 받아 키를 계산할 수 있다) */
  data?: (state: GameState) => Record<string, unknown>;
  /** 시작 점수 덮어쓰기 */
  scores?: Partial<Record<PlayerId, number>>;
  /** 화료를 선언할 사람 */
  winner: PlayerId;
  round?: Partial<GameState["round"]>;
  mode?: "hanchan" | "tonpuu";
}

export interface RunResult {
  settled: RoundSettledPayload;
  deltas: Record<string, number>;
  total: number;
  state: GameState;
  flow: FlowController;
}

function lastSettled(flow: FlowController): RoundSettledPayload {
  const log = (flow as unknown as { engine: { eventLog: GameEvent[] } }).engine
    .eventLog;
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i]?.type === ROUND_SETTLED) {
      return log[i]!.payload as RoundSettledPayload;
    }
  }
  throw new Error("no RoundSettled event");
}

export function run(opts: RunOpts): RunResult {
  let state = craft(opts.craft);
  if (opts.round !== undefined) {
    state = { ...state, round: { ...state.round, ...opts.round } };
  }
  if (opts.mode !== undefined) {
    state = { ...state, config: { ...state.config, mode: opts.mode } };
  }
  state = {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      augments: [...(opts.augs[p.id] ?? [])],
      score: opts.scores?.[p.id] ?? p.score,
    })),
  };
  if (opts.data !== undefined) {
    state = { ...state, augmentData: { ...state.augmentData, ...opts.data(state) } };
  }

  const game = createStandardGameFromState(state);
  for (const p of state.players) {
    for (const id of opts.augs[p.id] ?? []) {
      const def = DEFS.get(id);
      if (def === undefined) throw new Error(`unknown augment ${id}`);
      installAugment(game.engine, def, p.id, { yaku: game.yaku });
    }
  }
  const flow = new FlowController(game.engine);
  const begun = flow.begin();
  if (begun.kind !== "awaiting") throw new Error(`expected awaiting, got ${begun.kind}`);
  const status = flow.submit(opts.winner, { type: "win", payload: {} });
  if (status.kind !== "roundOver") {
    throw new Error(`expected roundOver, got ${status.kind}`);
  }
  const settled = lastSettled(flow);
  const deltas = settled.deltas as Record<string, number>;
  return {
    settled,
    deltas,
    total: Object.values(deltas).reduce((a, b) => a + b, 0),
    state,
    flow,
  };
}

export const P: PlayerId[] = ["p0", "p1", "p2", "p3"];

/** 4칸 대조군 표 출력 */
export function table(
  title: string,
  rows: { label: string; r: RunResult }[],
): void {
  console.log(`\n### ${title}`);
  console.log(
    `| 조합 | ${P.join(" | ")} | 합계 | augPoints |\n|---|---|---|---|---|---|---|`,
  );
  for (const { label, r } of rows) {
    const cells = P.map((p) => String(r.deltas[p] ?? 0));
    const notes = (r.settled.augPoints ?? [])
      .map((n) => `${n.player}:${n.augId}${n.han !== undefined ? `+${n.han}판` : ""}=${n.points}`)
      .join(", ");
    console.log(`| ${label} | ${cells.join(" | ")} | ${r.total} | ${notes} |`);
  }
}

export function winInfoLine(r: RunResult): string {
  return (r.settled.winInfos ?? [])
    .map(
      (w) =>
        `${w.winner} ${w.winType} han=${w.han} fu=${w.fu} yakuman=${w.yakumanCount} pts=${w.points} honba=${w.honbaBonus ?? 0} pot=${w.riichiPotGain ?? 0} yaku=[${w.yaku.map((y) => `${y.id}:${y.han}`).join(",")}]`,
    )
    .join(" ; ");
}
