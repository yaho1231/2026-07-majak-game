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

  /**
   * 가산(멘쯔·작두·대기)만 따로 센다. 기본 20·멘젠론 10·쯔모 2와 섞어 버리면
   * "가산이 하나도 없는 후로 핑후형"을 뒤에서 되짚을 수 없다 — 예전에는 쯔모 2가
   * 먼저 붙어 fu가 22가 되는 바람에 아래 보정의 `fu === 20` 조건이 영영 안 걸렸고,
   * 후로 핑후형 쯔모가 22 → 30부로 나왔다.
   */
  let extra = 0;

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
    extra += setFu;
  }

  const pair = variant.pair;
  if (pair !== null) {
    if (pair.suit === Suits.Dragon) extra += 2;
    if (pair.suit === Suits.Wind) {
      if (pair.rank === ctx.seatWind) extra += 2;
      if (pair.rank === ctx.prevalentWind) extra += 2; // 연풍패 작두 = +4
    }
  }

  if (
    variant.waitType === "kanchan" ||
    variant.waitType === "penchan" ||
    variant.waitType === "tanki"
  ) {
    extra += 2;
  }

  /*
   * 후로 핑후형 = 후로했는데 가산이 하나도 없는 손 (01 §7).
   *   - 론  → 30부. 20부 론은 인정하지 않는 표준 보정.
   *   - 쯔모 → **20부**. 쯔모 2부를 붙이지 않고 20부로 둔다 (천봉 등 온라인·작장
   *     통용 룰). 예전엔 20+2=22 → 30이 나와 론과 구분이 없었다.
   * 치또이(25 고정)·국사는 위에서 이미 빠져나갔고, 멘젠 핑후 쯔모는 여기 안 들어온다
   * (isClosed) — "핑후처럼 보이는" 손이 새어 들어오지 않게 후로 손으로만 좁힌다.
   */
  if (!variant.isClosed && extra === 0) {
    return ctx.winType === "ron" ? 30 : 20;
  }

  let fu = 20 + extra;
  if (variant.isClosed && ctx.winType === "ron") fu += 10;
  if (ctx.winType === "tsumo" && !hasPinfu) fu += 2;

  return roundUp10(fu);
}
