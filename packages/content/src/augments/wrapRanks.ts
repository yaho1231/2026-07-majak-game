/**
 * 숫자 순환(1↔9) 규약 — 끝없는 윤회(broken_wall)가 켜는 `hand.wrapRanks`를 읽는 자.
 *
 * 2026-08-27: 사용자 지시로 끝없는 윤회가 "슌쯔가 순환한다"에 더해
 * **다른 증강의 ±1 숫자 이동도 1↔9로 순환시킨다**. 증강끼리 서로의 id를 하드코딩하지
 * 않고 코어 규칙으로 통신하는 이 저장소의 규약을 따라, 전용 규칙 하나(`hand.wrapRanks`)를
 * 두고 끝없는 윤회가 켜고 연금술사·한 끗 차이가 읽는다.
 * (기존 `scoring.wrapRuns`를 그대로 읽지 않는 이유: 그 규칙의 의미는 "슌쯔 분해가
 *  순환한다"이지 "손패 숫자 이동이 순환한다"가 아니다. 나중에 순환 슌쯔 없이 숫자
 *  이동만 순환시키는 카드가 생겨도 이 축에 그대로 붙는다.)
 */

import type { GameState, PlayerId, RuleRegistry } from "@majak/core";

/** 손패 숫자 이동(±1)이 1↔9를 넘어 순환하는가 — 보유자 스코프 규칙 */
export const WRAP_RANKS_RULE = "hand.wrapRanks";

/** 이 플레이어에게 숫자 순환이 켜져 있는가 */
export function wrapRanksOn(
  state: GameState,
  rules: RuleRegistry,
  player: PlayerId,
): boolean {
  return (
    rules.has(WRAP_RANKS_RULE) &&
    rules.resolve<boolean>(WRAP_RANKS_RULE, { playerId: player, state }) === true
  );
}

/**
 * rank를 delta(±1)만큼 옮긴다. 범위를 벗어나면 순환이 켜져 있을 때만 반대쪽 끝으로
 * 감고(9+1=1, 1-1=9), 아니면 null(= 불가능)을 돌려준다.
 */
export function shiftRank(rank: number, delta: 1 | -1, wrap: boolean): number | null {
  const nr = rank + delta;
  if (nr >= 1 && nr <= 9) return nr;
  if (!wrap) return null;
  return nr > 9 ? 1 : 9;
}

/** 두 rank가 ±1 이웃인가 (순환이 켜져 있으면 9와 1도 이웃) */
export function rankAdjacent(a: number, b: number, wrap: boolean): boolean {
  if (Math.abs(a - b) === 1) return true;
  return wrap && Math.abs(a - b) === 8;
}
