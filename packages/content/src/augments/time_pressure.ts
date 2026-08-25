/**
 * 초읽기 (time_pressure, prism) — "생각할 시간을 전부에게서 빼앗는다".
 *
 * 뽑는 순간 자동으로 발동해 **그 국 하나 동안** 테이블 전원의 모든 결정에
 * **5초 제한**이 걸린다. 타패는 물론 론·치·펑·깡 같은 반응 선언, 액티브 증강의 선택까지
 * 전부 같은 시계를 본다. 자기 자신도 예외가 아니다.
 *
 * 시간이 다 되면 서버가 **안전 폴백**으로 대신 진행한다 —
 * 버릴 차례면 **쯔모기리**, 울지 말지 물어보는 자리면 **패스**,
 * 되돌릴 수 없는 발동의 마무리 단계면 **남은 후보 중 하나**로 끝맺는다(리플레이 결정성을
 * 위해 무작위가 아니라 후보 목록에서 결정적으로 고른다 — `HumanAgent`).
 *
 * 이 증강만은 도파민이 룰이 아니라 **손가락**에 있다. 리치를 건 상대 앞에서 5초 안에
 * 안전패를 고르는 것은 평소의 마작과 전혀 다른 게임이며, 자기 자신도 같은 시계를
 * 보고 있으므로 "나만 편한 방해"가 아니다.
 *
 * 구현: 콘텐츠 쪽은 **공개 채널 한 줄**이 전부다 — 국 스코프 뷰 채널 `time_pressure`에
 * 제한 초를 싣는다. 제한 시간은 게임 규칙이 아니라 **접속·진행의 문제**라 엔진이 아니라
 * 서버(`HumanAgent`)가 그 값을 읽어 결정 대기 시간을 줄이고, 클라이언트는 같은 값으로
 * 카운트다운을 그린다. 봇은 원래 즉답이라 사실상 영향을 받지 않는다.
 */

import {
  AUGMENT_DISARMED,
  augmentDataSet,
  augmentInstanceId,
  defineAugment,
  isSourceDisarmed,
} from "@majak/core";
import type { AugmentDef, AugmentDisarmedPayload } from "@majak/core";
import { armOnNextRound, armedNow, roundViewKey } from "../util.js";
import { installPreArmRecharge, rechargeBotPolicy } from "./preArmRecharge.js";

const ID = "time_pressure";

/**
 * 제한 시간(초). 서버·클라이언트가 이 값을 그대로 읽는다.
 * 채널 이름에 보유자를 넣지 않는다 — 효과가 테이블 전원에게 같으므로,
 * 서버가 누가 보유자인지 모르는 채로도 한 곳만 보면 된다.
 */
export const TIME_PRESSURE_SECONDS = 5;
/** 서버·클라이언트가 함께 보는 채널 이름 (뷰에서는 접두가 떨어져 이 이름 그대로다) */
export const TIME_PRESSURE_CHANNEL = ID;

export const timePressure: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "disrupt",
  complexity: 1,
  name: "초읽기",
  description:
    "(획득 즉시 · 이번 국만 · 반장전은 게임 내 1회 재장전) 전원의 모든 결정에 5초 제한이 걸린다 — 나도 포함이다. 시간을 넘기면 쯔모기리·패스로 자동 진행된다.",
  /*
   * detail의 마무리 폴백 문구는 예전에 "남은 후보 중 하나가 **무작위로** 선택된다"였다.
   * 서버는 리플레이·재개 결정성을 위해 `Math.random()`을 **일부러 걷어내고** 후보 목록의
   * 해시로 고르도록 바꿨는데(`HumanAgent.ts` 주석에 경위가 있다, docs/25 시스템 횡단 #14)
   * 문구만 옛 동작에 남아 있었다 — 같은 상황이면 언제나 같은 것이 골라지므로 "무작위"는
   * 거짓이고, 상대에게도 걸리는 증강이라 그 차이가 전략 정보다(QA text 확정 35).
   * 구현이 옳고 문장이 낡은 경우라 **문장을 고친다**.
   */
  detail:
    "(획득 즉시 · 이번 국만) 타패, 론·치·퐁·깡 선언, 액티브 증강 선택이 모두 제한 대상이다. 되돌릴 수 없는 발동의 마무리 단계에서는 남은 후보 중 하나가 정해진 규칙에 따라 골라진다(리플레이가 같은 결과를 내야 하므로 무작위가 아니다).\n\n⚠ 5초 제한은 **사람에게만** 걸린다 — 봇은 받지 않는다.\n\n반장전에서는 게임 내 1회, 자기 순에 **다시 장전**할 수 있다 — 누른 다음 국에 한 번 더 켜진다. (동풍전에는 없다.)",
  install(ctx) {
    // 획득 뒤 처음 시작되는 국 하나에만 켜진다.
    // 전원 공개 — 서버는 이 값으로 결정 대기 시간을 줄이고 클라는 카운트다운을 그린다.
    armOnNextRound(ctx, ID, () => [
      augmentDataSet(roundViewKey("*", TIME_PRESSURE_CHANNEL), TIME_PRESSURE_SECONDS),
    ]);

    /*
     * 반장전 한정 — 게임 내 1회, 원하는 타이밍에 다시 장전한다.
     * 국이 두 배인 판에서 "그 국 하나"의 비중이 절반이 되는 것을 되돌린다
     * (반장전 QA 2026-08-25, preArmRecharge.ts에 경위가 있다).
     */
    installPreArmRecharge(ctx, ID);

    /*
     * **무장해제되면 초읽기도 그 자리에서 꺼진다.**
     *
     * 코어의 무장해제 게이트는 Modifier·Interceptor·Reaction·액티브 버튼만 건너뛴다.
     * 그런데 이 증강의 효과는 국 시작에 **이미 실려 버린 공개 채널 값 하나**라 게이트를
     * 아예 타지 않았다 — 잠근 뒤에도 국이 끝날 때까지 테이블 전원이 5초 안에 결정해야
     * 했다(무장해제 1회를 쓰고도 아무것도 안 잠긴다, QA disrupt-b 확정 3).
     * 진짜 용과 같은 규약으로 스스로 되돌린다: 무장해제 통보는 목록에 넣기 **전에**
     * 오므로 이 리액션은 정상적으로 돈다(disarm.ts toEvents의 순서 계약).
     */
    ctx.reaction(AUGMENT_DISARMED, (event, rc) => {
      const p = event.payload as AugmentDisarmedPayload;
      if (p.augmentId !== ID || p.target !== ctx.holder) return;
      if (rc.state.augmentData[roundViewKey("*", TIME_PRESSURE_CHANNEL)] === undefined) {
        return;
      }
      /*
       * ⚠ 채널은 **보유자별이 아니라 테이블 공용**이다(위 주석의 의도). 그래서 두 명이
       * 같은 국에 이 증강을 들면, 한쪽만 무장해제해도 이 리액션이 공용 채널을 지워
       * **나머지 한 명의 초읽기까지 함께 꺼졌다**(2026-08-22 QA aug-4 의심 2).
       * 아직 살아 있는 다른 보유자가 있으면 채널을 그대로 둔다 — 무장해제는 지목한
       * 한 사람의 증강만 잠그는 것이지 남의 증강까지 잠그는 것이 아니다.
       * (이 리액션은 목록에 들어가기 **전에** 오므로, 지금 나 자신은 아직
       *  `isSourceDisarmed`가 false다 — 그래서 나를 명시적으로 뺀다.)
       */
      const stillArmed = rc.state.players.some(
        (pl) =>
          pl.id !== ctx.holder &&
          pl.augments.includes(ID) &&
          armedNow(rc.state, ID, pl.id) &&
          !isSourceDisarmed(rc.state, augmentInstanceId(pl.id, ID)),
      );
      if (stillArmed) return;
      rc.emit(augmentDataSet(roundViewKey("*", TIME_PRESSURE_CHANNEL), undefined));
    });
  },
  // 자동 발동이라 선택 지점이 없었지만, 반장전 재장전 버튼만은 봇도 눌러야 한다
  // (정책이 없으면 봇은 그 버튼을 영영 누르지 않는다).
  bot: rechargeBotPolicy(ID),
});
