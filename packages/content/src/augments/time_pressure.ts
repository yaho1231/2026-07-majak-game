/**
 * 초읽기 (time_pressure, prism) — "생각할 시간을 전부에게서 빼앗는다".
 *
 * 뽑는 순간 자동으로 발동해 **그 국 하나 동안** 테이블 전원의 모든 결정에
 * **5초 제한**이 걸린다. 타패는 물론 론·치·펑·깡 같은 반응 선언, 액티브 증강의 선택까지
 * 전부 같은 시계를 본다. 자기 자신도 예외가 아니다.
 *
 * 시간이 다 되면 서버가 **안전 폴백**으로 대신 진행한다 —
 * 버릴 차례면 **쯔모기리**, 울지 말지 물어보는 자리면 **패스**,
 * 되돌릴 수 없는 발동의 마무리 단계면 **남은 후보 중 무작위**로 끝맺는다.
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

import { augmentDataSet, defineAugment } from "@majak/core";
import type { AugmentDef } from "@majak/core";
import { armOnNextRound, roundViewKey } from "../util.js";

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
    "뽑는 순간 자동 발동. 이번 국 동안 전원의 모든 결정에 5초 제한이 걸린다 — 나도 포함이다. 시간을 넘기면 쯔모기리·패스로 자동 진행된다.",
  detail:
    "획득한 직후의 국 하나 동안 전원의 모든 결정에 5초 제한이 걸린다. 타패, 론·치·퐁·깡 선언, 액티브 증강 선택이 모두 포함되며 보유자도 예외가 아니다.\n\n제한을 넘기면 버릴 차례에는 쯔모한 패를 그대로 버리고, 반응을 묻는 자리에서는 패스하며, 되돌릴 수 없는 발동의 마무리 단계에서는 남은 후보 중 하나가 무작위로 선택된다.\n\n⚠ 5초 제한은 사람에게만 걸린다 — 봇은 이 제한을 받지 않는다. 봇이 섞인 자리에서는 그만큼 나만 조여진다.",
  install(ctx) {
    // 획득 뒤 처음 시작되는 국 하나에만 켜진다.
    // 전원 공개 — 서버는 이 값으로 결정 대기 시간을 줄이고 클라는 카운트다운을 그린다.
    armOnNextRound(ctx, ID, () => [
      augmentDataSet(roundViewKey("*", TIME_PRESSURE_CHANNEL), TIME_PRESSURE_SECONDS),
    ]);
  },
  // 봇 정책 없음 — 자동 발동이라 선택 지점이 없다.
});
