/**
 * 죽기살기 (die_hard, gold).
 * **게임당 단 한 번**, 정산 시점의 내 점수가 시작 점수의 절반 이하(≤12,500)이면
 * 그 국의 내 실점이 **그대로 플러스로 뒤집힌다** — 8,000점을 방총하면 상대는
 * +8,000을 받고 나도 뱅크에서 +8,000을 받는다(차액은 뱅크가 낸다).
 *
 * ⚠ 2026-08-27 사용자 지시로 **발동 조건을 전면 교체**했다. 예전에는 "정산 결과 점수가
 * 0 미만"이어야 켜졌다 — 실제로는 거의 오지 않는 순간이라 카드가 죽어 있었다. 이제
 * 바닥권(시작 점수 절반 이하)이면 마이너스로 내려갈 필요 없이 켜진다. 대신 매치
 * 횟수(동1/반2)를 **게임당 1회**로 줄였다(사용자 "단 한번").
 *
 * 구현: 정산 인터셉터(SETTLE_STAGE.Shield) — 배수·가산·이동이 전부 끝난 **최종 손실**을
 * 보고 deltas를 직접 고친다. 방어이므로 반드시 마지막 단계여야 한다(settleStages 규약).
 *
 * ⚠ 2026-07-29 감사: 예전에는 정산 **뒤** 별도 ScoreChanged로 얹었다. 그러면 부활분이
 * deltas 밖에 있어 결과 화면에는 "−12,000"만 뜨는데 다음 국 점수판은 +8,000이 되어,
 * 무슨 일이 있었는지 화면으로 알 수 없었다. 지금은 deltas에 실어 증감 표시와 일치한다.
 * 인터셉터는 이벤트를 emit할 수 없으므로 발동 사실을 payload 표식(ReviveMark)으로 남기고
 * reaction이 그걸 보고 사용 횟수를 소진한다 — 역만 방어술(ShieldMark)과 같은 패턴이다.
 */

import {
  ROUND_SETTLED,
  SETTLE_STAGE,
  augmentDataSet,
  baseDeltaOf,
  defineAugment,
  installLossSnapshot,
} from "@majak/core";
import type {
  AugmentDef,
  BaseDeltasMark,
  GameState,
  PlayerId,
  RoundSettledPayload,
} from "@majak/core";
import {
  counterOf,
  publishUsesLeft,
  roundViewKey,
  settleInterceptor,
  withAugPoint,
} from "../util.js";

const ID = "die_hard";

/**
 * **판의 시작 점수 한 벌**(`DEFAULT_HANCHAN_CONFIG.startScore`).
 *
 * 상수로 두는 이유: 시작 점수는 매치 설정(`HanchanController`)에 있고 엔진 상태에는
 * 실리지 않는다. 설정을 바꿔 쓰게 될 때 함께 손봐야 하는 자리다.
 * 반등 폭의 상한이자, 발동 문턱(절반 = 12,500)의 밑값이기도 하다 — 두 값이 같은
 * 출처에서 나와야 설정을 바꿀 때 한쪽만 어긋나지 않는다.
 */
const START_SCORE = 25_000;

/** 반등 폭의 상한 — 시작 점수 한 벌 */
const REVIVE_CAP = START_SCORE;

/** 발동 문턱 — 정산 시점 내 점수가 이 이하이면 켜진다 */
const DESPERATE_AT = START_SCORE / 2;

/** 게임당 발동 횟수 — 모드와 무관하게 단 1회 (2026-08-27 사용자 확정) */
const MAX_USES = 1;

/** 게임당 발동 횟수 카운터. */
const usesKey = (h: PlayerId): string => `${ID}:uses:${h}`;
const hasUsesLeft = (state: GameState, h: PlayerId): boolean =>
  counterOf(state, usesKey(h)) < MAX_USES;

/** 이번 정산에서 부활한 보유자 목록 (인터셉터 → reaction 신호) */
interface ReviveMark {
  revivedBy?: PlayerId[];
}

export const dieHard: AugmentDef = defineAugment({
  id: ID,
  tier: "gold",
  category: "defense",
  complexity: 1,
  name: "죽기살기",
  description:
    "(게임 내 1회) 내 점수가 12,500점 이하일 때 국에서 잃은 점수가 그대로 플러스로 뒤집힌다 — 8,000점을 방총당하면 상대도 나도 +8,000점.",
  detail:
    "(게임 내 1회) 국 정산 시점에 내 점수가 시작 점수의 절반(12,500) 이하이면, 그 국에서 내가 잃을 점수의 부호가 뒤집힌다. 상대가 받을 몫은 그대로 받고, 차액은 뱅크가 낸다 — 8,000점을 방총당하면 상대 +8,000, 나도 +8,000이다.\n\n뒤집혀 돌아오는 폭은 판의 시작 점수(25,000) 한 벌까지다. 점수가 늘어나는 국에는 발동하지 않고 횟수도 줄지 않는다.",
  /*
   * 상호 배제 — 죽기살기는 **크게 잃는 순간**을 자원으로 쓴다. 그 순간을 없애는 증강과
   * 함께 들면 수비가 성공할수록 죽기살기의 수익이 0에 수렴한다(docs/21 §C-3).
   *
   * - `yakuman_shield`(역만 방어술): A급 파괴. 둘 다 SETTLE_STAGE.Shield에 앉는데, 한
   *   사람이 둘 다 가지면 자리(seat)가 같아 동률 정렬이 등록 순서로 되돌아간다(#64의
   *   한계). 방어막이 먼저면 손실 0·횟수 보존, 죽기살기가 먼저면 부호가 뒤집히고 횟수
   *   소모 → 최종 점수와 잔여 횟수가 픽 순서로 갈린다. 게다가 역만은 죽기살기가 노리는
   *   **가장 큰 실점**이라 역시너지의 대표 사례이기도 하다.
   * - `invincible`(천하무적) · `no_ron_pact`(불가침 조약): 그 국의 방총(=마이너스로
   *   내려가는 주된 경로)을 통째로 지운다. 방총이 없으면 부호를 뒤집을 깊이가 생기지
   *   않는다.
   * - `always_tenpai`(승승장구): 유국 노텐 벌점을 면제한다 — 화료 없이 국이 흘러가는
   *   판에서 점수가 깎이는 유일한 경로를 막는다.
   *
   * 2026-08-18 사용자 확정: 효과를 바꾸는 대신 **픽 단계에서 상호 배제**한다(C-1
   * 스텔스 리치와 같은 방식). 배제는 대칭이라 이쪽 한 줄로 양방향이 잠긴다.
   *
   * 2026-08-27 재검토(트리거 교체 뒤): **네 줄 모두 유지**한다. 트리거가 "0 미만"에서
   * "점수 절반 이하"로 느슨해졌어도 **수익의 원천은 여전히 내 실점**이라, 실점을 지우는
   * 증강과의 역시너지는 그대로다. `yakuman_shield`는 그에 더해 같은 Shield 단계·같은
   * 자리라는 순서 문제(위)가 남아 있어 더더욱 유지해야 한다.
   */
  conflicts: ["yakuman_shield", "invincible", "no_ron_pact", "always_tenpai"],
  install(ctx) {
    const { holder } = ctx;

    // 남은 사용 횟수를 이름표 pill에 상시 노출한다 (횟수형 증강 공용 규약)
    publishUsesLeft(ctx, (state) => ({
      left: Math.max(0, MAX_USES - counterOf(state, usesKey(holder))),
      total: MAX_USES,
    }));

    /*
     * «잃는 국인가»는 **부호 반전 이전의 원본 손익**으로 판정한다 (LossRecord 단계가
     * 그 사본을 payload에 찍어 둔다).
     */
    installLossSnapshot(ctx);

    // 방어는 반드시 마지막 단계 — 어떤 경로로 생긴 손실이든 **최종값**을 봐야 한다.
    settleInterceptor(ctx, SETTLE_STAGE.Shield, (event, ic) => {
      const p = event.payload as RoundSettledPayload & ReviveMark & BaseDeltasMark;
      if (!hasUsesLeft(ic.state, holder)) return event;
      /*
       * 발동 문턱은 **정산 시점(= 이 국의 증감을 적용하기 전) 내 점수**다. 정산 뒤
       * 점수로 보면 "이 국에 크게 맞아서 절반 아래로 내려간" 사람까지 켜져 버려
       * 사용자가 말한 «이미 바닥권인 사람»의 카드가 아니게 된다.
       */
      const before = ic.state.players.find((pl) => pl.id === holder)?.score ?? 0;
      if (before > DESPERATE_AT) return event;
      const loss = p.deltas[holder] ?? 0;
      if (loss >= 0) return event; // 잃는 국에만 — 버는 국에는 횟수도 안 쓴다
      /*
       * ⚠ **원본 부호도 함께 본다** (2026-08-31 QA synergy4 A-8).
       *
       * 반전(`sign_flip`)은 이 카드 바로 앞 단계(SignFlip 550)에서 보유자의 delta에
       * -1을 곱한다. 그래서 `deltas`만 보면 **버는 국이 손실로 보인다** — 오야
       * 국사무쌍 쯔모(+96,000)가 반전으로 −96,000이 되고, 이 카드가 그것을 진짜
       * 실점으로 읽어 REVIVE_CAP에 잘린 +25,000으로 «되살렸다». 단독으로 들었을 때보다
       * 71,000점 손해를 보면서 **게임 내 단 1회까지 태운다.** detail의 "점수가 늘어나는
       * 국에는 발동하지 않고 횟수도 줄지 않는다"와 정면으로 어긋난다.
       *
       * 반대로 원본이 실점인데 반전이 이미 플러스로 만들어 준 국은 위 `loss >= 0`에서
       * 걸러진다 — 되살릴 손실이 남아 있지 않으니 횟수도 쓰지 않는다. 둘을 함께 들면
       * "반전이 먼저 살리고, 죽기살기는 아껴 둔다"가 된다.
       */
      if (baseDeltaOf(p, holder) >= 0) return event;
      /*
       * loss=-8000 → 최종 +8000. 부호가 뒤집힌다. 상대의 수령액은 건드리지 않으므로
       * 차액 16,000은 뱅크가 낸다(사용자 예시 그대로).
       *
       * ⚠ 다만 **되돌아오는 폭은 시작 점수(25,000) 한 벌까지다** (2026-08-23 QA
       * synergy3 score 확정 3). 손실을 한 사람에게 몰아 주는 증강(덤터기·눈먼 총알)과
       * 겹치면 깊이에 상한이 없어서, 뚫린 천장이 낀 역만 쯔모를 덤터기로 뒤집어쓴
       * 보유자가 **뱅크에서 226,000점을 받고** 그 자리에서 매치 1위가 됐다
       * (25,000×4 = 100,000짜리 판이 326,000이 된다).
       *
       * 상한을 "지금 내 점수"가 아니라 **판의 시작 점수**로 잡은 이유: 지금 점수로 자르면
       * 이미 바닥난 사람에게는 반등이 거의 남지 않아, "크게 맞을수록 크게 돌아온다"는
       * 이 카드의 정체성이 정작 그게 필요한 자리에서 사라진다. 시작 점수 한 벌은
       * 이 게임에서 "한 사람 몫"의 자연스러운 크기이고, 카드의 예시(−8,000 → +8,000)는
       * 그 아래라 한 글자도 달라지지 않는다.
       */
      const revived = Math.min(-loss, REVIVE_CAP);
      const adjust = revived - loss;
      return {
        type: event.type,
        payload: {
          ...p,
          deltas: { ...p.deltas, [holder]: (p.deltas[holder] ?? 0) + adjust },
          augPoints: withAugPoint(p, ctx, adjust),
          revivedBy: [...(p.revivedBy ?? []), holder],
        },
      };
    });

    // 실제로 부활한 국에만 사용 횟수를 소진하고 전원에게 공개한다.
    ctx.reaction(ROUND_SETTLED, (event, rc) => {
      const p = event.payload as RoundSettledPayload & ReviveMark;
      if (!(p.revivedBy ?? []).includes(holder)) return;
      rc.emit(
        augmentDataSet(usesKey(holder), counterOf(rc.state, usesKey(holder)) + 1),
      );
      rc.emit(augmentDataSet(roundViewKey("*", `${ID}:${holder}`), true));
    });
  },
});
