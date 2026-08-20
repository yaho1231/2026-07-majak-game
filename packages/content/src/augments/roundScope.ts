/**
 * 국 스코프 **데이터** 키의 공용 정리 지점.
 *
 * ## 왜 있는가 — 키가 매치 내내 쌓인다
 *
 * 많은 증강이 "이번 국만 유효한 값"을 담을 때 키 이름에 `장-국-본장`을 박아
 * (`future_sight:stacks:2-1-4:p0`, `spy:marked:3-1-8:p2`, `call_seal:turn:1-1-0:p0` …)
 * 자동 만료를 흉내 낸다. 다음 국에는 키 이름이 달라지므로 **읽히지 않게 될 뿐 지워지지는
 * 않는다** — `augmentData`가 국마다 단조 증가한다. 실측으로 반장전 12국에 키 102개가
 * 쌓였고 그중 52개가 국 번호가 박힌 것이었으며, 12국 동안 삭제된 키는 1개뿐이었다
 * (QA cross 확정 3). `augmentData`는 DB 스냅샷·리플레이 로그에 통째로 실리는 상태라
 * 국 수에 비례해 부풀고, "지난 국 키"를 실수로 읽는 버그가 조용히 살아남을 토양이 된다.
 *
 * 엔진에는 이미 정리 규약이 있다 — 키 이름 끝의 `ROUND_SCOPED_MARK`(`#round`)가 붙은
 * `augmentData` 항목은 다음 국 `setupRound`에서 통째로 지워진다(`GameState.ts`).
 * 뷰 채널은 `roundViewKey`가 그 표식을 붙여 주는데, **데이터 키에는 같은 통로가 없어서**
 * 각자 국 번호를 이름에 박는 쪽으로 갈라졌다. 이 파일이 그 통로다.
 *
 * ## 쓰는 법
 *
 * ```ts
 * const turnKey = (state: GameState, holder: PlayerId): string =>
 *   roundScopedKey(ID, "turn", state, holder);
 * ```
 *
 * 이름에 `roundKey`를 **그대로 남긴다**(표식만 덧붙인다): 국이 바뀌는 순간과 정리가
 * 도는 순간이 완전히 같지 않은 경로(재구성·리플레이·본장 재배패)에서도 "지난 국 값을
 * 이번 국 값으로 잘못 읽는" 일이 없어야 하기 때문이다. 표식은 **삭제**를 얻으려는 것이고,
 * 국 번호는 **오독 방지**를 위한 것이라 둘 다 필요하다.
 *
 * ⚠ 국을 넘어 살아야 하는 값(매치 사용 횟수·쿨다운 기준점·스택)에는 쓰지 말 것.
 */

import { ROUND_SCOPED_MARK } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { roundKey } from "../util.js";

/**
 * 이번 국에만 유효한 augmentData 키 — 국 경계에서 엔진이 지운다.
 *
 * @param augmentId 증강 id (키 접두 규약)
 * @param name      용도 이름 (`turn`, `opened`, `planted` …)
 * @param holder    보유자별로 갈라야 하면 넘긴다
 */
export function roundScopedKey(
  augmentId: string,
  name: string,
  state: GameState,
  holder?: PlayerId,
): string {
  const seat = holder === undefined ? "" : `:${holder}`;
  return `${augmentId}:${name}:${roundKey(state)}${seat}${ROUND_SCOPED_MARK}`;
}
