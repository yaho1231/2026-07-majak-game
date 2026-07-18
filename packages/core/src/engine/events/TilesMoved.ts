/**
 * TilesMoved — 엔진 기본 제공 이벤트 1호.
 * 모든 패 이동(쯔모·버림·부로·증강의 회수/봉인…)이 이 이벤트로 표현된다.
 *
 * 설계: docs/02_CORE_ENGINE.md §3, docs/07_TILE_SYSTEM.md §3
 */

import type { TileId } from "../../mahjong/tiles/Tile.js";
import type { ProposedEvent } from "./GameEvent.js";
import type { EventReducer } from "../reducers/ReducerRegistry.js";
import { moveTiles } from "../zones/Zone.js";
import type { ZoneId } from "../zones/Zone.js";

export const TILES_MOVED = "TilesMoved";

export interface TilesMovedPayload {
  from: ZoneId;
  to: ZoneId;
  tileIds: TileId[];
  insertAt?: number;
}

export function tilesMoved(
  payload: TilesMovedPayload,
): ProposedEvent<typeof TILES_MOVED, TilesMovedPayload> {
  return { type: TILES_MOVED, payload };
}

export const tilesMovedReducer: EventReducer = (state, event) => {
  const p = event.payload as TilesMovedPayload;
  return { ...state, zones: moveTiles(state.zones, p.from, p.to, p.tileIds, p.insertAt) };
};
