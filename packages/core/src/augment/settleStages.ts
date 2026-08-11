/**
 * 정산 단계 (Settle Stages) — ROUND_SETTLED를 고쳐 쓰는 증강의 **실행 순서 단일 진실**.
 *
 * # 왜 필요한가
 *
 * `ROUND_SETTLED`의 `deltas`를 가로채 고치는 증강이 20종을 넘는다. 이들은 전부
 * "지금 deltas를 읽어 고쳐 쓴다" — 즉 **교환법칙이 성립하지 않는다.** 그런데 예전엔
 * 실행 순서가 `(AugmentDef.tier, 등록 순서)`로 결정됐다:
 *
 * - `tier`는 표시용 등급이 폐기된 뒤에도 silver/gold/prism이 혼재해 있었다. 그래서
 *   역만 방어술(gold)은 책임전가(prism)보다 **항상** 먼저 돌았고, 그 시점엔 아직
 *   자기 손실이 0이라 발동 조건을 못 만족해 **"역만 완전 면역"이 한 번도 작동하지 않았다.**
 * - 같은 tier끼리는 `installAugment` 호출 순서 = **드래프트 픽 순서**로 갈렸다.
 *   기생충 × 일확천금은 누가 먼저 픽했는지에 따라 결과가 3배 차이 났다.
 *
 * 두 문제 모두 원인이 같다 — **정산 순서를 증강의 등급에 맡긴 것**이다.
 * 그래서 정산 인터셉터는 tier를 쓰지 않는다. 전부 `SETTLE_LAYER` 하나에 모아 놓고
 * 아래 단계 번호(priority)로만 순서를 정한다. 결과적으로 순서는 **의미**로만 결정되며
 * 드래프트 순서·등급과 완전히 무관해진다(리플레이·재개에서도 동일).
 *
 * # 단계
 *
 * 번호가 작은 단계가 먼저 돈다. 각 단계는 "정산 금액에 무엇을 하는가"로 갈린다.
 *
 * | 단계 | 하는 일 | 예 |
 * |------|---------|-----|
 * | `Replace`      | 정산 이벤트 자체를 다른 이벤트로 대체 | 뒤집힌 모래시계(유국 취소) |
 * | `Redistribute` | 지불자만 재배선. 총액·수령액 불변 | 책임전가 · 덤터기 |
 * | `Multiply`     | 내 화료 획득에 배수 | 일확천금 · 핏빛 계약 · 판돈 굴리기 |
 * | `BankTopUp`    | 뱅크가 발행하는 가산 (상대는 더 내지 않는다) | 뚫린 천장 · 큰손 · 카운터 · "+N판" 보너스 |
 * | `Transfer`     | 정액을 남에게서 가져오거나 남에게 넘긴다 | 가불 인생 폭발 · 스파이 · 기생충 |
 * | `DrawPatch`    | 유국 전용 재정산 | 유국역만 · 승승장구 |
 * | `SignFlip`     | 이 사람의 최종 증감에 부호를 뒤집는다 | 음양 반전 |
 * | `Shield`       | 방어·환급. **위 전부가 끝난 최종 손실**을 보고 막는다 | 역만 방어술 |
 * | `Observe`      | deltas를 바꾸지 않고 결과만 관찰 | 만년 오야(연장 판정) |
 *
 * # 규칙
 *
 * - 배수(`Multiply`)는 **뱅크 가산(`BankTopUp`)보다 먼저** 돈다 — 뚫린 천장의 보전액에
 *   일확천금 3배가 다시 곱해지면 지수 폭발이 한 단계 더 겹친다.
 * - 정액 이동(`Transfer`)은 배수·가산 **뒤에** 돈다 — 3000점 강탈이 배수로 불어나면
 *   "정액"이라는 표기가 거짓이 된다.
 * - 부호 반전(`SignFlip`)은 **돈이 움직이는 모든 단계 뒤, 방어 앞**이다. 앞에 두면 나중에
 *   더해지는 가산·이동이 반전을 빠져나가고, 방어 뒤에 두면 방어가 0으로 만든 손실을
 *   다시 뒤집어 0이 되어 능력이 사라진다.
 * - 방어(`Shield`)는 **반드시 마지막**이다. 어떤 경로로 생긴 손실이든 최종값을 봐야
 *   "완전 면역"이 참이 된다.
 * - 새 정산 증강을 추가할 때는 여기 표에 어느 단계인지 적고 `settleInterceptor`로 등록한다.
 *   `ctx.interceptor(ROUND_SETTLED, …)`를 직접 부르면 다시 tier·픽 순서에 끌려간다.
 *
 * # 같은 단계 안의 순서
 *
 * priority는 `settlePriority(stage, seat, augmentId)`가 만든다 — 자세한 근거는 그
 * 함수의 주석에. 요약하면 **단계 → 자리 → 증강 id** 순이고, 셋 다 게임 상태에서만
 * 나오므로 드래프트 픽 순서·설치 순서·재구성(이어하기·리플레이)과 무관하다.
 * 마지막 자리(id)는 *결정론*만 보장할 뿐 *의미*는 없다. 두 증강의 앞뒤가 규칙상
 * 정해져야 한다면 단계를 나눠라.
 */

import { RuleLayer } from "../engine/rules/RuleRegistry.js";

/**
 * 정산 인터셉터가 공통으로 쓰는 레이어.
 *
 * Prism으로 고정한다 — 증강의 tier와 무관하게 **같은 레이어**에 모여야 아래 단계
 * 번호(priority)가 실제 순서를 결정한다. tier가 다르면 layer가 먼저 비교되어
 * priority가 무시된다(EffectRegistry.matching).
 */
export const SETTLE_LAYER: RuleLayer = RuleLayer.Prism;

/** 정산 단계 번호 (작을수록 먼저). 위 문서 표와 1:1 대응한다. */
export const SETTLE_STAGE = {
  Replace: 0,
  Redistribute: 100,
  Multiply: 200,
  BankTopUp: 300,
  Transfer: 400,
  DrawPatch: 500,
  SignFlip: 550,
  Shield: 600,
  Observe: 900,
} as const;

export type SettleStage = (typeof SETTLE_STAGE)[keyof typeof SETTLE_STAGE];

/**
 * 증강 id → `[0, 1)` 안의 안정적인 소수 (FNV-1a 32비트).
 *
 * 값 자체에 의미는 없다. 필요한 성질은 딱 두 가지다 —
 * **id만 보고 정해진다**(설치 순서·픽 순서와 무관)와 **같은 단계 안에서 겹치지 않는다**.
 * 후자는 카탈로그 전체를 훑는 테스트(`settle_order_determinism.test.ts`)가 강제한다.
 */
function idFraction(augmentId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < augmentId.length; i++) {
    h ^= augmentId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // 2^24 버킷 — 배정밀도에서 단계 번호(최대 900)에 더해도 손실 없이 구분된다.
  return (h >>> 8) / 0x1000000;
}

/**
 * 정산 인터셉터의 `priority` — **모든 등록 경로가 이걸 써야 한다.**
 *
 * `단계 + 자리 + id소수` 세 자리로 순서를 못 박는다.
 *
 * - **단계**(100 간격): 의미. `SETTLE_STAGE` 표가 단일 진실이다.
 * - **자리**(0~3): 플레이어 간 순서. 게임 상태에서 나오므로 픽 순서와 무관하다.
 * - **id소수**(<1): 같은 사람이 **같은 단계에 둘을 들고 있을 때**의 순서.
 *
 * 마지막 자리가 이 함수를 만든 이유다. 예전에는 `단계 + 자리`뿐이라 한 사람이 같은
 * 단계의 증강 둘을 쥐면 priority가 완전히 똑같아졌고, 그러면 `EffectRegistry`가
 * 등록 순서(seq) = **드래프트 픽 순서**로 밀었다 — `settleStages.ts`가 없애려던 바로
 * 그 결함이 한 경우에만 살아남아 있었다. 실제로 결과가 갈린다: 큰손(big_hand)은
 * `deltas`의 **현재값**을 읽어 만관까지 채우므로, 같은 BankTopUp 단계의 가산이
 * 앞에 오느냐 뒤에 오느냐로 수령액이 통째로 달라진다.
 *
 * ⚠ 이 소수는 순서를 **결정론적으로 만들 뿐, 의미를 주지는 않는다.** 어떤 두 증강의
 * 앞뒤가 규칙상 반드시 정해져야 한다면 소수에 기대지 말고 **단계를 나눠라.**
 *
 * 단계 간격이 100이고 `자리 + id소수 < 4`라 단계 경계는 절대 넘지 않는다.
 */
export function settlePriority(
  stage: SettleStage,
  seat: number,
  augmentId: string,
): number {
  return stage + seat + idFraction(augmentId);
}
