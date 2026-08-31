/**
 * 안개 계열의 **상태 키와 «그대로 읽는 사람» 판정**의 단일 진실.
 *
 * ## 왜 있는가 — «누구든»이 자기 파일 안에서만 성립했다
 *
 * 안개 덮인 바닥(hidden_river)과 박무(brief_fog)는 둘 다 카드에 «보유자만/나만 네 개의
 * 바닥을 그대로 읽는다»를 적어 놓고, 각자 `visibility.discards` 모디파이어에서 뷰어를
 * 면제해 왔다. 그런데 면제 판정이 **자기 증강만** 알아봤다:
 *
 * - `brief_fog`: `rctx.playerId === holder` — 이 인스턴스의 보유자 하나뿐.
 * - `hidden_river`: 「이번 국에 안개를 선언한 사람이면 누구든」으로 이미 한 번 넓혔지만
 *   (qa-lab text 확정 5), 그 «누구든»이 hidden_river의 플래그만 보므로 **박무 선언자는
 *   못 알아본다.**
 *
 * 결과는 정확히 설명의 반대였다 — 안개 둘이 같은 판에 뜨면 **양쪽 보유자가 모두** 시야를
 * 잃고, 박무끼리면 둘 다 0장이 되어 아무것도 안 든 것보다 못한 상태가 됐다. 두 증강은
 * `antiIds`로만 묶여 있어(= 확률만 기운다) 얼마든지 함께 뜬다
 * (2026-08-23 QA synergy3 disrupt 확정 2·3).
 *
 * 그래서 **키와 판정을 통째로 한 곳으로 올렸다.** 각 파일이 서로의 키 문자열을 흉내 내는
 * 구조로 두면 한쪽 키가 바뀌는 날 조용히 다시 갈라진다 — 세 번째 안개가 생겨도 여기
 * 한 줄만 추가하면 나머지는 저절로 맞는다.
 *
 * ⚠ 면제는 «지금 자기 안개가 살아 있는 동안»만이다. 박무의 6순이 지나면 그 사람도 다시
 *   남의 안개에 갇힌다 — 태운 횟수의 대가는 그 창 안에서만 돌려받는다.
 */

import { DISARMED_SOURCES_KEY, augmentInstanceId } from "@majak/core";
import { flagOf } from "../util.js";
import type { GameState, PlayerId } from "@majak/core";
import { roundScopedKey } from "./roundScope.js";

/** 박무의 안개가 유효한 순 수 — 선언한 순부터 이 수만큼 */
export const BRIEF_FOG_TURNS = 6;

/**
 * 안개 덮인 바닥의 선언 플래그 — **국 단위**다(roundKey 스코프).
 * 국이 끝나면 저절로 걷히므로 별도의 해제 처리가 필요 없다.
 */
export const hiddenRiverFogKey = (
  state: GameState,
  holder: PlayerId,
): string => roundScopedKey("hidden_river", "fog", state, holder);

/**
 * 박무가 선언된 순간의 turnCount — 6순 창의 기준점.
 *
 * ⚠ **국 스코프여야 한다.** `round.turnCount`는 국마다 0으로 리셋되므로, 기준점을 게임
 * 스코프에 두면 다음 국에서 `0 - 8 < 6`이 영원히 참이 되어 **안개가 영구히 유지되고**
 * 두 번째 사용도 영영 열리지 않는다(2026-07-29 감사).
 */
export const briefFogTurnKey = (state: GameState, holder: PlayerId): string =>
  roundScopedKey("brief_fog", "turn", state, holder);

/** 안개 덮인 바닥 — 이번 국에 선언했는가 (선언하면 국이 끝날 때까지 참) */
export function hiddenRiverDeclared(
  state: GameState,
  holder: PlayerId,
): boolean {
  return flagOf(state, hiddenRiverFogKey(state, holder));
}

/**
 * 박무 — 지금 이 순간 안개가 유효한가 (이번 국에 선언했고, 그 뒤 6순 이내).
 *
 * ⚠ **사용 카운터를 보지 않는다.** 예전에는 `counterOf(usesKey) > 0`을 앞세워
 * 활성 판정이 사용 카운터를 겸용했다 — 재장전이 그 카운터를 되돌리면(0) **6순 중
 * 0순만 지났어도 안개가 그 자리에서 걷혔다**(QA disrupt-b 확정 2). 걷히는 조건은
 * detail대로 **6순 경과**와 **국 종료**뿐이고, 둘 다 국 스코프 turnKey로 선다.
 */
export function briefFogActive(state: GameState, holder: PlayerId): boolean {
  // 이번 국에 선언한 적이 없으면 키 자체가 없다 (0순 선언과 구분하려면 존재 여부를 본다)
  const declaredTurn = state.augmentData[briefFogTurnKey(state, holder)];
  if (typeof declaredTurn !== "number") return false;
  return state.round.turnCount - declaredTurn < BRIEF_FOG_TURNS;
}

/**
 * 이 뷰어가 **지금 안개를 걸어 둔 사람**인가 — 그렇다면 어느 안개도 그를 가리지 않는다.
 * 안개 계열의 `visibility.discards` 모디파이어는 전부 이 술어로 면제를 판정한다.
 */
export function fogCasterNow(state: GameState, viewer: PlayerId): boolean {
  return hiddenRiverDeclared(state, viewer) || briefFogActive(state, viewer);
}

/* ──────────────────────────────────────────────────────────────────────────
 * 다중 보유 면제 술어 (공통) — 이 파일이 안개에서 배운 것을 일반화한 자리다.
 *
 * 「나만 본다」류 정보 은닉 증강은 전부 **같은 함정**을 밟는다: 모디파이어가
 * `rctx.playerId === holder` 로 **자기 인스턴스의 보유자 하나만** 면제하면,
 * 같은 증강을 둘이 들었을 때 서로의 모디파이어에 걸려 **양쪽 다 실명한다.**
 * 안개(위 `fogCasterNow`)가 그렇게 한 번 터졌고, 「가려진 도라」에서 똑같이
 * 다시 터졌다(2026-08-31 QA synergy4 info 확정 1).
 *
 * 면제 판정의 규약은 **«보는 사람이 그 증강을 지금 살아 있는 채로 들고 있는가»** 다 —
 * 어느 인스턴스가 이 모디파이어를 걸었는지는 보지 않는다. 새 은닉 증강을 만들 때는
 * `holdsAugmentNow`를 쓰고, 보유만으로는 부족한(선언·지속시간이 있는) 계열은
 * `fogCasterNow` 처럼 여기에 술어를 하나 더 올린다.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * 이 좌석이 `augmentId`를 **지금 유효하게** 보유하고 있는가.
 *
 * 무장해제로 잠긴 인스턴스는 «들고 있지 않다»로 센다 — 잠긴 증강은 규칙도 효과도
 * 서지 않으므로, 그 증강이 주는 면제만 살아남으면 잠금이 반쪽이 된다.
 */
export function holdsAugmentNow(
  state: GameState,
  viewer: PlayerId,
  augmentId: string,
): boolean {
  const p = state.players.find((x) => x.id === viewer);
  if (p === undefined || !p.augments.includes(augmentId)) return false;
  const disarmed = state.augmentData[DISARMED_SOURCES_KEY];
  if (Array.isArray(disarmed) && disarmed.includes(augmentInstanceId(viewer, augmentId))) {
    return false;
  }
  return true;
}
