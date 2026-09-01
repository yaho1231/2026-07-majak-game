/**
 * 리치 중 손패 편집의 공용 가드 — **쯔모한 그 한 장에만** 손을 댈 수 있다.
 *
 * 손패를 바꾸는 증강은 거의 전부 리치 중 발동을 막는다(분열·조커·짝수의 세계·
 * 진짜 용·삼원패의 의지…). 예외가 둘 있었다: 연금술사(alchemist)와 염색(tile_dyeing)은
 * 48차 무페널티에서 "리치 중에도 쓸 수 있다"로 열렸다.
 *
 * 그런데 리치는 **고정된 손패**로 걸린 것이라, 그 고정된 13장 중 한 장을 바꾸면 대기가
 * 어긋난 채 다시 바꿀 수단이 없다 — 그 국은 화료가 불가능해진다(2026-09-01 사용자 보고).
 * 반면 **쯔모해 온 한 장**은 어차피 그 자리에서 버릴 패다. 그 한 장을 물들이거나 옮기는
 * 것은 고정된 손을 건드리지 않으므로 대기가 그대로다 — 대신 「지금 버릴 패」를 고를 수
 * 있게 된다(리치 중 오름패가 아니어도 안전패로 바꿔 버리는 등).
 *
 * 그래서 리치 중에는 대상 후보를 `round.lastDrawnTile` 하나로 좁힌다.
 *
 * 덤으로 **자동 쯔모기리도 저절로 맞는다**: `FlowController`는 턴 선택지가 버림 하나뿐일
 * 때만 리치를 auto로 넘기므로, 쯔모패가 수패라 증강 후보가 서면 자동으로 넘어가지 않고
 * 플레이어가 직접 버린다. 쯔모패가 자패면(숫자 변동 증강의 대상이 아니다) 후보가 없어
 * 예전 그대로 자동 쯔모기리다.
 */

import type { GameState, PlayerId, TileId } from "@majak/core";

/** 이 사람이 리치 중인가 */
export function inRiichi(state: GameState, holder: PlayerId): boolean {
  return state.round.byPlayer[holder]?.riichi != null;
}

/**
 * 지금 이 사람이 **손을 댈 수 있는 패인가** — 리치 중이면 쯔모패 한 장뿐이다.
 * 리치가 아니면 아무 제한이 없다(언제나 true).
 */
export function editableUnderRiichi(
  state: GameState,
  holder: PlayerId,
  tileId: TileId,
): boolean {
  if (!inRiichi(state, holder)) return true;
  return state.round.lastDrawnTile === tileId;
}
