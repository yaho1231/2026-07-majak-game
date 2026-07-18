/**
 * Zone — 패가 존재하는 공간.
 *
 * 패산·손패·버림패·커스텀 Zone을 전부 같은 구조로 다루고,
 * 모든 패 이동은 moveTiles 하나로 표현된다 (물리 법칙).
 * 이동의 합법성 판정은 Action System + RuleRegistry의 몫이다.
 *
 * 설계: docs/07_TILE_SYSTEM.md §2~3
 */

import type { TileId } from "../../mahjong/tiles/Tile.js";

export type ZoneId = string;
export type PlayerId = string;

export interface Zone {
  id: ZoneId;
  /** "wall" | "deadWall" | "hand" | "discards" | "melds" | 커스텀. 가시성 Rule의 조회 키 */
  kind: string;
  owner?: PlayerId;
  /** 순서 있는 목록 — 순서가 곧 의미다 (쯔모 순서, 버림 순서) */
  tileIds: TileId[];
}

export type Zones = Record<ZoneId, Zone>;

export const WALL: ZoneId = "wall";
export const DEAD_WALL: ZoneId = "deadWall";

export function handZone(player: PlayerId): ZoneId {
  return `hand:${player}`;
}

export function discardsZone(player: PlayerId): ZoneId {
  return `discards:${player}`;
}

export function meldsZone(player: PlayerId): ZoneId {
  return `melds:${player}`;
}

export function createZone(id: ZoneId, kind: string, owner?: PlayerId): Zone {
  return owner === undefined
    ? { id, kind, tileIds: [] }
    : { id, kind, owner, tileIds: [] };
}

/**
 * 단 하나의 이동 원시 연산. 순수 함수 — 새 Zones를 반환하고 원본은 불변.
 * 존재하지 않는 패·Zone은 즉시 예외 (엔진 버그 조기 발견).
 * insertAt 생략 시 목적지 맨 뒤에 추가.
 */
export function moveTiles(
  zones: Zones,
  from: ZoneId,
  to: ZoneId,
  tileIds: readonly TileId[],
  insertAt?: number,
): Zones {
  const src = zones[from];
  const dst = zones[to];
  if (src === undefined) throw new Error(`Unknown zone: ${from}`);
  if (dst === undefined) throw new Error(`Unknown zone: ${to}`);
  if (from === to) throw new Error(`Cannot move tiles within the same zone: ${from}`);

  const moving = new Set(tileIds);
  if (moving.size !== tileIds.length) {
    throw new Error(`Duplicate tile ids in move: [${tileIds.join(", ")}]`);
  }
  const srcSet = new Set(src.tileIds);
  for (const id of tileIds) {
    if (!srcSet.has(id)) throw new Error(`Tile ${id} is not in zone ${from}`);
  }

  const remaining = src.tileIds.filter((id) => !moving.has(id));
  const dstTiles = [...dst.tileIds];
  dstTiles.splice(insertAt ?? dstTiles.length, 0, ...tileIds);

  return {
    ...zones,
    [from]: { ...src, tileIds: remaining },
    [to]: { ...dst, tileIds: dstTiles },
  };
}
