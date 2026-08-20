/**
 * "증강이 이번 국에 이 사람의 **손패를 고쳤다**" 표식.
 *
 * ## 왜 있는가 — 증강이 만든 손에 천화(天和)가 붙었다
 *
 * 천화·지화는 *"배패가 첫 쯔모 시점에 이미 완성돼 있었다"* 는 **사실**에 붙는 역만이다.
 * 그런데 코어의 게이트(`core/src/mahjong/flow/helpers.ts`, `buildWinContext`)는
 * `firstTurn` · `goAroundBroken` · "내 버림 0장" 셋만 봤고, 손패를 갈아 끼우는 액티브
 * 증강은 그 셋 중 무엇도 건드리지 않는다. 그래서 오야가 첫 순에 손을 **고쳐서**
 * 완성시킨 손에 천화 역만 48,000점이 거짓 근거로 지급됐다
 * (2026-08-20 QA hand 확정 4 — `dead_wall_master` 로 실증).
 *
 * `firstTurn` 을 직접 내리는 방식은 쓰지 않는다: 그 플래그는 구종구패·사풍연타·
 * 더블리치가 함께 읽는다. 천화·지화만 보는 **별도 표식**이 이 파일이다.
 *
 * ## 규약
 *
 * 손패를 실제로 갈아 끼우는 **리듀서**가 `augmentData` 에 이 키를 `true` 로 남긴다.
 * 코어는 키 이름의 접두(`handAltered:byAugment:`)와 접미(`:<playerId>#round`)만 보고
 * 판정하므로 core ↔ content 사이에 값을 주고받을 배관이 필요 없다.
 * `#round`(`ROUND_SCOPED_MARK`) 표식 덕에 국 경계에서 엔진이 알아서 지운다.
 *
 * ```ts
 * augmentData: { ...state.augmentData, [handAlteredKey(state, holder)]: true }
 * // 또는
 * augmentData: { ...state.augmentData, ...handAlteredMark(state, holder) }
 * ```
 *
 * ⚠ **버림·후로처럼 표준 규칙이 이미 아는 변화에는 붙이지 않는다.** 붙일 대상은
 * "배패가 아닌 손을 만든" 증강 — 손패의 패를 다른 실물/다른 종류로 갈아 끼우는 것이다.
 */

import type { GameState, PlayerId } from "@majak/core";
import { roundScopedKey } from "./roundScope.js";

/** 코어(`helpers.ts`)의 `HAND_ALTERED_AUGMENT_ID` 와 반드시 같아야 한다 */
const AUGMENT_ID = "handAltered";
/** 코어(`helpers.ts`)의 `HAND_ALTERED_NAME` 과 반드시 같아야 한다 */
const NAME = "byAugment";

/** 이번 국에 증강이 이 사람의 손패를 고쳤다는 표식의 키 (국 스코프) */
export function handAlteredKey(state: GameState, holder: PlayerId): string {
  return roundScopedKey(AUGMENT_ID, NAME, state, holder);
}

/** 리듀서의 `augmentData` 에 그대로 펼쳐 넣는 표식 한 쌍 */
export function handAlteredMark(
  state: GameState,
  holder: PlayerId,
): Record<string, true> {
  return { [handAlteredKey(state, holder)]: true };
}
