/**
 * 무장해제되면 **전원 공개 배너도 함께 내린다** — 선언 상태 증강의 공용 규약.
 *
 * ## 왜 있는가 — 화면이 정확히 반대 방향으로 거짓말을 했다
 *
 * 코어의 무장해제 게이트(`isSourceDisarmed`)는 Modifier·Interceptor·Reaction·액티브
 * 버튼만 건너뛴다. **이미 `augmentData`에 실려 버린 값**은 건드리지 못한다. 그래서
 * "선언하면 그 국 내내 유효"인 증강들은 잠긴 뒤에도 배너가 그대로 남았다:
 * 천하무적·불가침 조약은 «이번 국 론 불가»를 띄운 채 **실제로는 론이 열려 있었고**,
 * 봉인술은 «6순 동안 못 운다»를 띄운 채 울 수 있었다. 사람은 그 배너를 믿고 진짜
 * 화료 기회를 버리고 후로를 포기한다 — pill에 쇠사슬(잠김)과 guard 배너가 나란히 떠서
 * 어느 쪽이 참인지 읽을 방법도 없었다. (봇은 `effectiveAugmentsOf`로 먼저 걸러내므로
 * **사람만 속았다.**) 2026-08-23 QA synergy3 disrupt 확정 4.
 *
 * 되돌림은 구조상 **대상 증강이 스스로** 해야 한다 — 무장해제는 `AUGMENT_DISARMED`를
 * 통보할 뿐이고 무엇을 어떻게 내릴지는 그 증강만 안다(disarm.ts의 주석 그대로).
 * 눈먼 총알(blind_ron)·초읽기(time_pressure)가 이미 그 규약대로 배너를 내리고 있었고,
 * 여기는 그 다섯 줄을 한 곳으로 모은 것이다.
 *
 * ## 쓰는 법
 *
 * ```ts
 * clearViewOnDisarm(ctx, (state) => [noticeKey(holder), lastMapKey(holder)]);
 * ```
 *
 * 통보는 잠금 목록에 넣기 **전에** 오므로 이 리액션은 정상적으로 돈다
 * (disarm.ts `toEvents`의 순서 계약). 국이 끝나면 무장해제가 풀리지만, 국 스코프
 * 뷰 채널은 어차피 다음 국 `setupRound`에서 함께 지워지므로 되살릴 것이 없다.
 *
 * ⚠ **테이블 공용 채널에는 쓰지 마라.** 두 명이 같은 증강을 들었을 때 한 명만
 * 무장해제해도 남의 것까지 꺼진다 — 초읽기가 그 경우라 자기 파일에서 «아직 살아 있는
 * 다른 보유자»를 직접 세고 있다(2026-08-22 QA aug-4 의심 2). 여기 오는 것은
 * 보유자별로 갈린 키뿐이다.
 */

import { AUGMENT_DISARMED, augmentDataSet } from "@majak/core";
import type {
  AugmentContext,
  AugmentDisarmedPayload,
  GameState,
} from "@majak/core";

/**
 * 이 증강이 잠기는 순간 넘긴 뷰 채널들을 지운다(보유자별 키 전용).
 *
 * @param keys 지울 키 목록 — 잠기는 시점의 state를 받아 만든다(국 스코프 키 때문).
 */
export function clearViewOnDisarm(
  ctx: AugmentContext,
  keys: (state: GameState) => readonly string[],
): void {
  ctx.reaction(AUGMENT_DISARMED, (event, rc) => {
    const p = event.payload as AugmentDisarmedPayload;
    if (p.augmentId !== ctx.augmentId || p.target !== ctx.holder) return;
    for (const key of keys(rc.state)) {
      // 애초에 안 실려 있으면 이벤트를 내지 않는다(리플레이 소음을 늘리지 않는다)
      if (rc.state.augmentData[key] === undefined) continue;
      rc.emit(augmentDataSet(key, undefined));
    }
  });
}
