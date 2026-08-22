/**
 * "지금 손에 든 쯔모패는 **패산이 아니라 남의 바닥에서 왔다**" 판정.
 *
 * ## 왜 있는가 — 무르기가 남의 버림패를 패산에 묻었다
 *
 * 강에서 패를 회수하는 카드 셋(정적의 손 `silent_swap` · 날치기 `pond_snatch` ·
 * 무덤 도굴 `grave_rob`)은 집어 온 패를 `replaceDrawnTile` 로 **쯔모패 자리에 세운다**.
 * 무르기(`take_back`)의 validate 는 "`lastDrawnTile` 이 아직 손에 있는가"만 봤으므로,
 * 바닥에서 집어 온 그 패를 그대로 "무르기"해 **패산 맨 밑에 묻을 수 있었다** —
 * 상대 바닥에서 아무 패나 한 장 지우면서 정적의 손의 +2판은 그대로 챙기는 짓이
 * 3순마다 성립했다 (QA synergy3 handedit 확정 6, 2026-08-23).
 * 카드가 약속한 것은 "**쯔모한 패**를 … 패산 맨 밑에 되돌린다" 하나뿐이다.
 *
 * ## 규약
 *
 * 세 카드는 이미 각자 국 스코프로 "이번에 집어 온 패의 tileId"를 남긴다
 * (`win.tsumoFuriten` 모디파이어가 읽는 것과 같은 값). 여기서는 그 세 표식을
 * **한자리에서** 읽는다 — 값이 지금의 `lastDrawnTile` 과 같을 때만 "바닥에서 온
 * 쯔모패"라는 뜻이고, 다음 쯔모가 오면 자연히 어긋난다.
 *
 * 새로 강 회수 카드를 만들면 아래 목록에 한 줄을 더한다.
 */

import type { GameState, PlayerId, TileId } from "@majak/core";
import { roundScopedKey } from "./roundScope.js";

/** [증강 id, 그 증강이 쓰는 이름] — 각 카드의 `takenKey`/`robbedKey` 와 반드시 같아야 한다 */
const RIVER_TAKE_MARKS: readonly (readonly [string, string])[] = [
  ["silent_swap", "taken"],
  ["pond_snatch", "taken"],
  ["grave_rob", "robbed"],
];

/** 이 패가 이번 국에 이 사람이 **바닥에서 집어 온** 패인가 */
export function isRiverTakenTile(
  state: GameState,
  holder: PlayerId,
  tileId: TileId,
): boolean {
  return RIVER_TAKE_MARKS.some(
    ([id, name]) => state.augmentData[roundScopedKey(id, name, state, holder)] === tileId,
  );
}
