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
    // 깡은 랭크가 섞여도 깡이다. 바람의 계보(동남서북)·장사진(3-4-5-6)의 깡은
    // meldToSet이 슌쯔성 몸통으로 내보내므로, type만 보면 커쯔 루프를 통째로
    // 건너뛰어 **부수가 0**이 됐다 — 자패 안깡 32부가 사라져 "깡을 안 하는 게
    // 이득"이 되고, 스깡쯔를 세워도 20부 손이 나왔다(docs/25 역/점수 #9).
    if (s.type !== "triplet" && s.isKan !== true) continue;
    // 랭크가 섞인 깡은 "전부 요구패·자패인가"로 판정한다 — 보통 커쯔는 모든 패가
    // 같은 종류라 종전과 결과가 같다.
    let setFu = s.tiles.every((t: TileKind) => isTerminalOrHonor(t)) ? 8 : 4; // 암각 기준
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

  // 후로 핑후형 론 보정: 가산이 하나도 없으면 30부 취급
  if (!variant.isClosed && fu === 20) fu = 30;

  return roundUp10(fu);
}
