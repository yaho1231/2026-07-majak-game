/**
 * fu — 부 계산. 01_GAME_RULES §7의 표준 규칙.
 *
 * 설계: docs/08_MAHJONG_ENGINE.md §4
 */

import { Suits, isTerminalOrHonor } from "../tiles/Tile.js";
import type { TileKind } from "../tiles/Tile.js";
import type { ScoringVariant, WinContext } from "./WinContext.js";

const roundUp10 = (n: number): number => Math.ceil(n / 10) * 10;

export function calculateFu(
  variant: ScoringVariant,
  ctx: WinContext,
  hasPinfu: boolean,
): number {
  if (variant.form === "chiitoitsu") return 25;
  if (variant.form === "kokushi") return 0; // 역만 — 부 무의미

  let fu = 20;

  if (variant.isClosed && ctx.winType === "ron") fu += 10;
  if (ctx.winType === "tsumo" && !hasPinfu) fu += 2;

  for (const s of variant.sets) {
    if (s.type !== "triplet") continue;
    const tile = s.tiles[0] as TileKind;
    let setFu = isTerminalOrHonor(tile) ? 8 : 4; // 암각 기준
    if (!s.concealed) setFu /= 2;
    if (s.isKan) setFu *= 4;
    fu += setFu;
  }

  const pair = variant.pair;
  if (pair !== null) {
    if (pair.suit === Suits.Dragon) fu += 2;
    if (pair.suit === Suits.Wind) {
      if (pair.rank === ctx.seatWind) fu += 2;
      if (pair.rank === ctx.prevalentWind) fu += 2; // 연풍패 작두 = +4
    }
  }

  if (
    variant.waitType === "kanchan" ||
    variant.waitType === "penchan" ||
    variant.waitType === "tanki"
  ) {
    fu += 2;
  }

  // 부로 핑후형 론 보정: 가산이 하나도 없으면 30부 취급
  if (!variant.isClosed && fu === 20) fu = 30;

  return roundUp10(fu);
}
