/**
 * waits — 텐파이 여부와 대기패 계산.
 *
 * "이 kind를 더하면 화료 형태인가"를 universe의 모든 kind에 대해 검사한다.
 * universe가 파라미터라서 증강이 추가한 새 패 종류도 대기가 될 수 있다.
 *
 * 설계: docs/08_MAHJONG_ENGINE.md
 */

import { kindKey, standardKinds } from "../tiles/Tile.js";
import type { Suit, TileKind } from "../tiles/Tile.js";
import { isWinningShape } from "./decompose.js";
import type { DecomposeOptions } from "./decompose.js";

/**
 * @param hand13 화료패를 제외한 손패 (13 - 3×부로 수 장)
 * @param opts 분해 옵션 (하위 호환: ReadonlySet<Suit>는 sequenceSuits로 해석)
 * @returns 화료할 수 있는 kind 목록 (중복 없음)
 */
export function winningKinds(
  hand13: readonly TileKind[],
  meldCount: number,
  universe: readonly TileKind[] = standardKinds(),
  opts?: DecomposeOptions | ReadonlySet<Suit>,
): TileKind[] {
  const seen = new Set<string>();
  const waits: TileKind[] = [];
  for (const candidate of universe) {
    const key = kindKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    if (isWinningShape([...hand13, candidate], meldCount, opts)) {
      waits.push(candidate);
    }
  }
  return waits;
}

export function isTenpai(
  hand13: readonly TileKind[],
  meldCount: number,
  universe: readonly TileKind[] = standardKinds(),
  opts?: DecomposeOptions | ReadonlySet<Suit>,
): boolean {
  return winningKinds(hand13, meldCount, universe, opts).length > 0;
}
