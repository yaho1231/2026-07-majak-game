/**
 * 방해·수비·좌석 축 시너지 검증 공용 도구 (QA 전용 — packages/ 는 절대 건드리지 않는다)
 */
import {
  FlowController,
  createStandardGameFromState,
  installAugment,
  buildPlayerView,
  buildWinContext,
  evaluateWin,
  handZone,
  kindKey,
  kindOf,
  playerAtSeat,
  ROUND_SETTLED,
  DEAD_WALL,
  WALL,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  PlayerId,
  PlayerView,
  TileId,
  WinEvaluation,
} from "@majak/core";
import { craft, h } from "../../../packages/content/test/helpers.js";
import { contentAugments } from "../../../packages/content/src/index.js";

export { FlowController };
export { craft, h, kindKey, kindOf, handZone, playerAtSeat, DEAD_WALL, WALL, ROUND_SETTLED };
export type { GameState, PlayerId, TileId, PlayerView, WinEvaluation, AugmentDef };

export const PLAYERS: PlayerId[] = ["p0", "p1", "p2", "p3"];

export function defOf(id: string): AugmentDef {
  const d = contentAugments.find((a: AugmentDef) => a.id === id);
  if (d === undefined) throw new Error(`unknown augment ${id}`);
  return d;
}

export function withAugments(
  state: GameState,
  map: Partial<Record<PlayerId, string[]>>,
): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      map[p.id] ? { ...p, augments: [...(map[p.id] as string[])] } : { ...p, augments: [] },
    ),
  };
}

/** map: 좌석 → 증강 id 목록. 카탈로그에서 def를 찾아 전부 install 한다. */
export function setup(state: GameState, map: Partial<Record<PlayerId, string[]>>) {
  const withA = withAugments(state, map);
  const game = createStandardGameFromState(withA);
  for (const [pid, ids] of Object.entries(map)) {
    for (const id of ids ?? []) {
      installAugment(game.engine, defOf(id), pid as PlayerId, {
        yaku: game.yaku,
        catalog: game.augments,
      });
    }
  }
  return game;
}

export type Game = ReturnType<typeof setup>;

/** 액션 제출 (실패하면 이유를 던진다) */
export function submit(
  game: Game,
  player: PlayerId,
  type: string,
  payload: unknown = {},
): void {
  const res = game.engine.submit({ player, type, payload } as never);
  if (!res.ok) throw new Error(`${type} rejected: ${res.reason}`);
}

/**
 * 보유자 턴 옵션 목록 — FlowController의 후보 생성과 같은 경로
 * (`engine.turnOptionProviders` → 각 액션의 validate).
 */
export function turnOptions(
  game: Game,
  player: PlayerId,
): { type: string; payload: unknown }[] {
  const state = game.engine.state;
  const out: { type: string; payload: unknown }[] = [];
  for (const provider of game.engine.turnOptionProviders) {
    for (const cand of provider(state, player)) {
      const def = game.engine.actions.get(cand.type);
      if (def === undefined) continue;
      const reason = def.validate(
        { player, type: cand.type, payload: cand.payload } as never,
        { state, rules: game.engine.rules } as never,
      );
      if (reason === null) out.push({ type: cand.type, payload: cand.payload });
    }
  }
  return out;
}

export function view(game: Game, viewer: PlayerId): PlayerView {
  return buildPlayerView(game.engine.state, viewer, game.engine.rules, {
    yaku: game.yaku,
  });
}

export function evalWin(
  game: Game,
  winner: PlayerId,
  winType: "tsumo" | "ron",
  tileId: TileId,
  opts: { includeUra?: boolean; from?: PlayerId } = {},
): WinEvaluation | null {
  const ctx = buildWinContext(game.engine.state, winner, winType, tileId, {
    rules: game.engine.rules,
    includeUra: opts.includeUra ?? false,
    ...(opts.from ? { from: opts.from } : {}),
  });
  return evaluateWin(ctx, game.yaku);
}

export function rule<T>(game: Game, key: string, player?: PlayerId): T | "n/a" {
  if (!game.engine.rules.has(key)) return "n/a";
  return game.engine.rules.resolve<T>(key, {
    ...(player ? { playerId: player } : {}),
    state: game.engine.state,
  });
}

export function augData(game: Game): Record<string, unknown> {
  return game.engine.state.augmentData as Record<string, unknown>;
}

/** view.augmentView 채널을 평평하게 (접두 제거된 이름 → 값) */
export function channels(game: Game, viewer: PlayerId): Record<string, unknown> {
  return (view(game, viewer).augmentView ?? {}) as Record<string, unknown>;
}

/** FlowController 로 시작하고, 화료/유국까지 몰아 마지막 ROUND_SETTLED payload 를 준다 */
export function startFlow(game: Game): FlowController {
  const flow = new FlowController(game.engine);
  flow.begin();
  return flow;
}

/** begin() 결과까지 함께 돌려준다 */
export function startFlow2(game: Game) {
  const flow = new FlowController(game.engine);
  return { flow, status: flow.begin() };
}

export function lastSettled(game: Game): Record<string, unknown> {
  const log = game.engine.eventLog;
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i]?.type === ROUND_SETTLED) {
      return log[i]!.payload as Record<string, unknown>;
    }
  }
  throw new Error("no RoundSettled event");
}

export function table(title: string, rows: Record<string, unknown>[]): void {
  console.log(`\n### ${title}`);
  console.table(rows);
}

export function log(...a: unknown[]): void {
  console.log(...a);
}
