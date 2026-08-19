/**
 * 최소 재현용 장면 조립기 — content 테스트의 craft를 그대로 쓴다.
 * (읽기 전용 재사용. 소스는 건드리지 않는다.)
 */
import {
  DEAD_WALL,
  FlowController,
  ROUND_SETTLED,
  createStandardGameFromState,
  installAugment,
  kindKey,
} from "@majak/core";
import type {
  AugmentDef,
  GameEvent,
  GameState,
  PlayerId,
  RoundSettledPayload,
  TileId,
  TileKind,
} from "@majak/core";
import { contentAugments } from "@majak/content";
import { craft, h } from "../../packages/content/test/helpers.js";
import type { CraftConfig } from "../../packages/content/test/helpers.js";

export { craft, h };
export type { CraftConfig };

const defs = new Map(contentAugments.map((d) => [d.id, d]));
export const def = (id: string): AugmentDef => {
  const d = defs.get(id);
  if (d === undefined) throw new Error(`no augment ${id}`);
  return d;
};

/** 좌석에 증강을 붙인 상태 */
export function withAug(
  state: GameState,
  give: Partial<Record<PlayerId, string[]>>,
): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      give[p.id] !== undefined ? { ...p, augments: [...give[p.id]!] } : p,
    ),
  };
}

/** 왕패 특정 자리의 패 **종류**를 강제한다 (도라 표시패·뒷도라 표시패 지정용) */
export function setDeadWallKind(state: GameState, idx: number, kind: TileKind): GameState {
  const id = state.zones[DEAD_WALL]?.tileIds[idx] as TileId | undefined;
  if (id === undefined) throw new Error(`deadWall[${idx}] 없음`);
  return { ...state, tiles: { ...state.tiles, [id]: { ...state.tiles[id]!, kind } } };
}

export function deadWallKinds(state: GameState): string[] {
  return (state.zones[DEAD_WALL]?.tileIds ?? []).map((id) => kindKey(state.tiles[id]!.kind));
}

export function start(state: GameState, give: Partial<Record<PlayerId, string[]>>) {
  const game = createStandardGameFromState(withAug(state, give));
  for (const [seat, ids] of Object.entries(give)) {
    for (const id of ids ?? []) {
      installAugment(game.engine, def(id), seat as PlayerId, {
        yaku: game.yaku,
        catalog: game.augments,
      });
    }
  }
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  return { game, flow, status };
}

export function lastSettled(flow: FlowController): RoundSettledPayload {
  const log = (flow as unknown as { engine: { eventLog: GameEvent[] } }).engine.eventLog;
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i]?.type === ROUND_SETTLED) return log[i]!.payload as RoundSettledPayload;
  }
  throw new Error("no RoundSettled");
}
