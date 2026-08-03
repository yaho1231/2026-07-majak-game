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

/**
 * 표시패의 **"앞" 패** — 표준 도라(다음 패)의 정확한 역방향 순환.
 * 1→9, 동→북, 백→중. 커스텀 suit는 rank-1.
 *
 * 표준 규칙에는 없는 개념이다. 표시패의 앞도 도라로 취급하는 증강(거울의 도라)이
 * 쓰며, `doraKindFor`와 짝을 이루도록 여기 둔다 — 순환 경계(1·동·백)를 두 함수가
 * 따로 구현하면 한쪽만 고쳐져 어긋난다.
 */
export function frontDoraKindFor(indicator: TileKind): TileKind {
  if (isNumberSuit(indicator)) {
    return { suit: indicator.suit, rank: indicator.rank === 1 ? 9 : indicator.rank - 1 };
  }
  if (indicator.suit === Suits.Wind) {
    return { suit: Suits.Wind, rank: indicator.rank === 1 ? 4 : indicator.rank - 1 };
  }
  if (indicator.suit === Suits.Dragon) {
    return { suit: Suits.Dragon, rank: indicator.rank === 1 ? 3 : indicator.rank - 1 };
  }
  return { suit: indicator.suit, rank: indicator.rank - 1 };
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
