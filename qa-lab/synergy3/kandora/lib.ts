/**
 * 깡·도라 축 시너지 검증 공용 도구 (QA 전용 — packages/ 는 건드리지 않는다)
 */
import {
  DEAD_WALL,
  WALL,
  FlowController,
  buildWinContext,
  createStandardGameFromState,
  createZone,
  discardsZone,
  evaluateWin,
  handZone,
  installAugment,
  kindKey,
  kindOf,
  meldsZone,
  rinshanRemaining,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  PlayerId,
  TileId,
  WinEvaluation,
} from "@majak/core";
import { craft, h } from "../../../packages/content/test/helpers.js";

export { craft, h, kindKey, kindOf, handZone, meldsZone, discardsZone, DEAD_WALL, WALL, rinshanRemaining, FlowController };
export type { GameState, PlayerId, TileId, WinEvaluation };

export function withAugments(
  state: GameState,
  map: Partial<Record<PlayerId, string[]>>,
): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      map[p.id] ? { ...p, augments: [...(map[p.id] as string[])] } : p,
    ),
  };
}

export interface Install { def: AugmentDef; holder: PlayerId }

export function setup(state: GameState, installs: Install[]) {
  const withA = withAugments(
    state,
    installs.reduce<Partial<Record<PlayerId, string[]>>>((acc, i) => {
      acc[i.holder] = [...(acc[i.holder] ?? []), i.def.id];
      return acc;
    }, {}),
  );
  const game = createStandardGameFromState(withA);
  for (const i of installs) installAugment(game.engine, i.def, i.holder, { yaku: game.yaku });
  return game;
}

type Game = ReturnType<typeof setup>;

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

export function extraHan(game: Game, player: PlayerId): number {
  if (!game.engine.rules.has("score.extraHan")) return 0;
  return game.engine.rules.resolve<number>("score.extraHan", {
    playerId: player,
    state: game.engine.state,
  });
}

/** 표 출력 */
export function table(title: string, rows: Record<string, unknown>[]): void {
  console.log(`\n### ${title}`);
  console.table(rows);
}

export function deadWall(state: GameState): TileId[] {
  return [...(state.zones[DEAD_WALL]?.tileIds ?? [])];
}
export function wall(state: GameState): TileId[] {
  return [...(state.zones[WALL]?.tileIds ?? [])];
}

/** 도라 표시패를 원하는 종류로 갈아 끼운다 (패산의 그 종류 한 장과 자리 교환) */
export function setIndicator(state: GameState, spec: string, k = 0): GameState {
  const want = kindKey(h(spec)[0]!);
  const dead = [...(state.zones[DEAD_WALL]?.tileIds ?? [])];
  const wallIds = [...(state.zones[WALL]?.tileIds ?? [])];
  const idx = dead.length - 10 + k * 2;
  const cur = dead[idx]!;
  if (kindKey(kindOf(state, cur)) === want) return state;
  const wi = wallIds.findIndex((id) => kindKey(kindOf(state, id)) === want);
  if (wi < 0) throw new Error(`no ${spec} left in wall`);
  dead[idx] = wallIds[wi]!;
  wallIds[wi] = cur;
  return {
    ...state,
    zones: {
      ...state.zones,
      [DEAD_WALL]: { ...state.zones[DEAD_WALL]!, tileIds: dead },
      [WALL]: { ...state.zones[WALL]!, tileIds: wallIds },
    },
    round: { ...state.round, doraIndicators: state.round.doraIndicators.map((id, i) => (i === k ? dead[idx]! : id)) },
  };
}

/** 뒷도라 표시패(표도라 표시패 +1 자리)를 원하는 종류로 */
export function setUraIndicator(state: GameState, spec: string, k = 0): GameState {
  const want = kindKey(h(spec)[0]!);
  const dead = [...(state.zones[DEAD_WALL]?.tileIds ?? [])];
  const wallIds = [...(state.zones[WALL]?.tileIds ?? [])];
  const idx = dead.length - 10 + k * 2 + 1;
  const cur = dead[idx]!;
  if (kindKey(kindOf(state, cur)) === want) return state;
  const wi = wallIds.findIndex((id) => kindKey(kindOf(state, id)) === want);
  if (wi < 0) throw new Error(`no ${spec} left in wall`);
  dead[idx] = wallIds[wi]!;
  wallIds[wi] = cur;
  return {
    ...state,
    zones: {
      ...state.zones,
      [DEAD_WALL]: { ...state.zones[DEAD_WALL]!, tileIds: dead },
      [WALL]: { ...state.zones[WALL]!, tileIds: wallIds },
    },
  };
}

/**
 * 패산에 원하는 종류를 확보한다 — 다른 좌석(`*` 손패)에 흘러간 패를 패산과 맞바꾼다.
 * (검증 장면을 만들기 위한 도구일 뿐, 규칙과는 무관하다.)
 */
export function reserveInWall(state: GameState, specs: string[], donors: PlayerId[] = ["p1", "p2", "p3"]): GameState {
  let st = state;
  for (const spec of specs) {
    const want = kindKey(h(spec)[0]!);
    const wallIds = [...(st.zones[WALL]?.tileIds ?? [])];
    if (wallIds.some((id) => kindKey(kindOf(st, id)) === want)) continue;
    let done = false;
    for (const d of donors) {
      const hand = [...(st.zones[handZone(d)]?.tileIds ?? [])];
      const hi = hand.findIndex((id) => kindKey(kindOf(st, id)) === want);
      if (hi < 0) continue;
      const swapId = hand[hi]!;
      hand[hi] = wallIds[0]!;
      wallIds[0] = swapId;
      st = {
        ...st,
        zones: {
          ...st.zones,
          [handZone(d)]: { ...st.zones[handZone(d)]!, tileIds: hand },
          [WALL]: { ...st.zones[WALL]!, tileIds: wallIds },
        },
      };
      done = true;
      break;
    }
    if (!done) throw new Error(`cannot reserve ${spec}`);
  }
  return st;
}

/** 패산을 n장만 남긴다 (뒤쪽 = 해저패 쪽을 남긴다) */
export function truncateWall(state: GameState, n: number): GameState {
  const w = state.zones[WALL]!;
  return {
    ...state,
    zones: { ...state.zones, [WALL]: { ...w, tileIds: w.tileIds.slice(w.tileIds.length - n) } },
  };
}
