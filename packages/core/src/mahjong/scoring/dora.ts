/**
 * dora — 도라 표시패 → 도라 kind 변환과 도라 수 계산.
 * 도라는 역이 아니다 — 역이 1판 이상일 때만 evaluate가 판에 가산한다.
 *
 * 설계: docs/08_MAHJONG_ENGINE.md §6
 */

import { Suits, isNumberSuit, kindKey } from "../tiles/Tile.js";
import type { TileKind } from "../tiles/Tile.js";

/** 표시패의 "다음 패"가 도라. 9→1, 북→동, 중→백 순환. 커스텀 suit는 rank+1 */
export function doraKindFor(indicator: TileKind): TileKind {
  if (isNumberSuit(indicator)) {
    return { suit: indicator.suit, rank: indicator.rank === 9 ? 1 : indicator.rank + 1 };
  }
  if (indicator.suit === Suits.Wind) {
    return { suit: Suits.Wind, rank: indicator.rank === 4 ? 1 : indicator.rank + 1 };
  }
  if (indicator.suit === Suits.Dragon) {
    return { suit: Suits.Dragon, rank: indicator.rank === 3 ? 1 : indicator.rank + 1 };
  }
  return { suit: indicator.suit, rank: indicator.rank + 1 };
}

/** 같은 도라가 2번 표시되면 2배로 세어진다 (표시패 중복 = 도라 중첩) */
export function countDora(
  kinds: readonly TileKind[],
  doraKinds: readonly TileKind[],
): number {
  const doraCount = new Map<string, number>();
  for (const d of doraKinds) {
    const key = kindKey(d);
    doraCount.set(key, (doraCount.get(key) ?? 0) + 1);
  }
  let total = 0;
  for (const k of kinds) total += doraCount.get(kindKey(k)) ?? 0;
  return total;
}
