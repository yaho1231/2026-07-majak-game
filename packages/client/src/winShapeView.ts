/**
 * winShapeView — 결과 화면이 **화료한 손을 몸통 단위로** 그리기 위한 배치.
 *
 * 서버가 실어 주는 `WinInfo.shape`는 kind 목록이다(채점이 고른 분해). 화면에 세우려면
 * 그 kind를 **공개된 실물 패**(id·적도라·conjured 같은 속성을 가진)와 짝지어야 한다.
 * 여기서 하는 일이 그 짝짓기다.
 *
 * 조커(백이 무엇이든 되는 증강)는 손패에 백으로 남아 있는데 shape에는 **변한 뒤의 kind**가
 * 실린다. 그래서 kind가 맞는 패를 먼저 다 붙이고, 남은 자리에 남은 패를 넣는다 —
 * 그 자리가 곧 조커이고, `as`에 무엇이 됐는지가 담긴다.
 *
 * 손패가 shape로 설명되지 않으면(리치 스냅샷 공개 등) null을 돌려준다. 그 경우 화면은
 * 종전대로 그냥 정렬해서 보여 준다.
 */

import { Suits, kindKey } from "@majak/core";
import type { PublicTileView, TileKind, WinShape, WinShapeGroupType } from "@majak/core";

export interface ShapeSlot {
  tile: PublicTileView;
  /** 이 자리가 조커라면 무엇으로 쓰였는가 (아니면 없다) */
  as?: TileKind;
}

export interface ShapeGroupView {
  type: WinShapeGroupType;
  slots: ShapeSlot[];
  /**
   * 표준 마작에서는 성립하지 않는 몸통인가 (증강이 만든 모양).
   * 하나라도 있으면 결과 화면이 몸통마다 이름표를 붙인다 — 평범한 손은 그대로 둔다.
   */
  unusual: boolean;
}

const NUMBER_SUITS = new Set<string>([Suits.Man, Suits.Pin, Suits.Sou]);

/** 표준 마작으로 설명되지 않는 몸통인가 */
function isUnusual(type: WinShapeGroupType, tiles: readonly TileKind[]): boolean {
  const first = tiles[0];
  if (first === undefined) return false;
  if (type === "single") return false;
  /*
   * 구련 뼈대 — 표준 구련은 «평범한 몸통은 아니지만 표준 룰 그대로»이므로 강조하지
   * 않는다. 무늬가 섞인 뼈대만이 증강(뒤섞인 아홉 개의 연꽃)이 만든 자리다.
   */
  if (type === "gates") return tiles.some((t) => t.suit !== first.suit);
  if (type === "triplet" || type === "pair") {
    // 커쯔·머리는 원래 **같은 패**로만 이뤄진다 — 무늬가 섞였거나(동수의 결속·비대칭)
    // 랭크가 섞였으면(양극의 1·9) 증강이 만든 몸통이다.
    return tiles.some((t) => kindKey(t) !== kindKey(first));
  }
  // 슌쯔 — 자패 슌쯔(바람의 계보)·혼색 슌쯔(부숴진 벽)·순환 슌쯔(8-9-1)
  if (!NUMBER_SUITS.has(first.suit)) return true;
  if (tiles.some((t) => t.suit !== first.suit)) return true;
  return tiles.some((t, i) => t.rank !== first.rank + i);
}

/**
 * shape(kind 목록)를 공개된 실물 패에 붙인다.
 *
 * @param hand 화료자의 공개 손패 (후로 제외, 화료패 포함)
 * @returns 몸통별 배치. 손패로 설명이 안 되면 null
 */
export function groupWinHand(
  shape: WinShape,
  hand: readonly PublicTileView[],
): ShapeGroupView[] | null {
  const slotCount = shape.groups.reduce((n, g) => n + g.tiles.length, 0);
  if (slotCount !== hand.length) return null;

  const pool = [...hand];
  const take = (kind: TileKind): PublicTileView | null => {
    const i = pool.findIndex((t) => kindKey(t.kind) === kindKey(kind));
    if (i < 0) return null;
    return pool.splice(i, 1)[0] as PublicTileView;
  };

  // 1차: kind가 그대로 맞는 패를 붙인다. 못 붙인 자리는 2차에서 조커가 메운다.
  const groups = shape.groups.map((g) => ({
    type: g.type,
    tiles: g.tiles,
    slots: g.tiles.map((kind) => {
      const tile = take(kind);
      return tile === null ? { kind, tile: null as PublicTileView | null } : { kind, tile };
    }),
  }));

  // 2차: 남은 자리 ← 남은 패(조커). 무엇이 됐는지를 `as`로 남긴다.
  for (const g of groups) {
    for (const s of g.slots) {
      if (s.tile !== null) continue;
      const tile = pool.shift();
      if (tile === undefined) return null;
      s.tile = tile;
    }
  }
  if (pool.length > 0) return null;

  return groups.map((g) => {
    const slots: ShapeSlot[] = g.slots.map((s) => {
      const tile = s.tile as PublicTileView;
      return kindKey(tile.kind) === kindKey(s.kind) ? { tile } : { tile, as: s.kind };
    });
    return {
      type: g.type,
      slots,
      unusual: isUnusual(g.type, g.tiles) || slots.some((s) => s.as !== undefined),
    };
  });
}

/** 몸통 이름표 — 이름표는 이상한 몸통이 하나라도 있을 때만 붙인다 */
export function shapeGroupLabel(
  type: WinShapeGroupType,
  form: WinShape["form"],
): string {
  // 구련보등 — 슌쯔·커쯔로 끊지 않고 뼈대와 남는 한 장으로 읽는다.
  if (type === "gates") return "1112345678999";
  if (form === "chuuren" && type === "single") return "남는 한 장";
  if (type === "run") return "슌쯔";
  if (type === "triplet") return "커쯔";
  if (type === "pair") return form === "chiitoitsu" ? "쌍" : "머리";
  return "";
}
