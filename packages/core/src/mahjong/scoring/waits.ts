/**
 * waits — 텐파이 여부와 대기패 계산.
 *
 * "이 kind를 더하면 화료 형태인가"를 universe의 모든 kind에 대해 검사한다.
 * universe가 파라미터라서 증강이 추가한 새 패 종류도 대기가 될 수 있다.
 *
 * 설계: docs/08_MAHJONG_ENGINE.md
 */

import { standardKinds } from "../tiles/Tile.js";
import type { Suit, TileKind } from "../tiles/Tile.js";
import { winningKindsOf } from "./decompose.js";
import type { DecomposeOptions } from "./decompose.js";

/**
 * 기본 universe(표준 34종)는 한 번만 만든다 — 예전에는 호출마다 34개 객체를 새로
 * 만들었다. 돌려주는 대기는 아래에서 **복사**하므로 호출자가 이 객체를 만질 일은 없다.
 */
const STANDARD_UNIVERSE: readonly TileKind[] = standardKinds();

/**
 * @param hand13 화료패를 제외한 손패 (13 - 3×후로 수 장)
 * @param opts 분해 옵션 (하위 호환: ReadonlySet<Suit>는 sequenceSuits로 해석)
 * @returns 화료할 수 있는 kind 목록 (중복 없음)
 */
export function winningKinds(
  hand13: readonly TileKind[],
  meldCount: number,
  universe?: readonly TileKind[],
  opts?: DecomposeOptions | ReadonlySet<Suit>,
): TileKind[] {
  if (universe === undefined) {
    // 공유 universe의 객체를 그대로 내보내지 않는다 — 종전처럼 호출마다 새 객체다.
    return winningKindsOf(hand13, meldCount, STANDARD_UNIVERSE, opts).map((k) => ({
      suit: k.suit,
      rank: k.rank,
    }));
  }
  return winningKindsOf(hand13, meldCount, universe, opts);
}

export function isTenpai(
  hand13: readonly TileKind[],
  meldCount: number,
  universe: readonly TileKind[] = standardKinds(),
  opts?: DecomposeOptions | ReadonlySet<Suit>,
): boolean {
  return winningKinds(hand13, meldCount, universe, opts).length > 0;
}
