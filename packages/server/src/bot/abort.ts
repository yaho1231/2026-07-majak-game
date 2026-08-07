/**
 * abort — **구종구패(九種九牌)를 선언할 것인가.**
 *
 * ## 봇은 이걸 한 번도 못 했다
 *
 * `kyushuKyuhai`는 `BotAgent`의 '표준 액션' 목록에 이름만 올라 있었고, 그 옵션에
 * **입찰하는 평가자가 하나도 없었다.** 버림·리치·후로·깡·증강 어느 쪽도 이 타입을
 * 보지 않는다. `bidDiscard`는 언제나 버릴 패 하나를 내므로 `decide.ts`의 2층은 늘
 * 답을 찾고, "아무도 입찰하지 않았을 때"의 난수 폴백에는 **도달할 수 없었다.**
 * 결과: 배패에 요구패 13종이 흩어져 있어도 봇은 그 손을 끝까지 두었다.
 *
 * ## 무엇을 근거로 선언하는가
 *
 * 이 판단에 튜닝할 것은 거의 없다 — 규칙이 옵션을 **자기 첫 순에 요구패 9종 이상**일
 * 때만 내주기 때문이다(코어 `standardActions`). 즉 여기까지 온 손은 이미 "몸통이 될
 * 것이 거의 없는 배패"라는 사실이 확정돼 있고, 남은 질문은 둘뿐이다.
 *
 *  1. **국사무쌍이 살아 있는가.** 요구패 종류가 많을수록 그 손은 잡손이 아니라
 *     국사 배패다 — 12·13종이면 2·1샹텐이라 그냥 두는 것이 압도적으로 낫다.
 *     (증강이 국사 조건을 넓힌 손도 여기서 저절로 걸린다 — `shantenOf`가 `opts`를
 *     보고 세므로 종류만이 아니라 실제 샹텐으로 판단한다.)
 *  2. **한 국을 지워도 되는가.** 유찰은 점수를 0으로 되돌리는 것이 아니라 **한 국을
 *     통째로 없애는 것**이다. 뒤집어야 하는 처지(올라스 꼴찌)에서는 남은 기회를
 *     하나 태우는 셈이라 오히려 손해다 — `match.riskAppetite`가 그 처지를 이미
 *     한 축으로 압축해 두었다.
 *
 * 값은 **점수 단위**로 낸다(봇의 다른 모든 입찰과 같은 축) — "이 국을 잡손으로
 * 끝까지 두면 평균 얼마를 잃는가"가 그대로 유찰의 값어치다.
 */

import type { ActionOption } from "@majak/core/mahjong/flow/FlowController.js";
import { shantenOf } from "@majak/core";
import type { TileKind } from "@majak/core";
import { kindKey } from "@majak/core";
import type { BotRead } from "./read.js";
import type { ActionBid } from "./decide.js";

/**
 * 잡손으로 한 국을 끝까지 두는 값 (음수를 양수로 뒤집어 적는다).
 *
 * 요구패 9종 배패의 화료율은 사실상 0이고, 남는 것은 **방총 위험과 노텐벌부**뿐이다.
 * 한 국의 방총률이 약 12%에 평균 실점 5800점이면 700점, 여기에 노텐으로 끝날 몫
 * (약 1000점 × 대부분)이 얹힌다. 넉넉히 잡지 않고 보수적으로 둔다 — 이 값이 크면
 * 국사 배패까지 유찰시키게 된다.
 */
const JUNK_ROUND_COST = 1400;

/**
 * 오야가 유찰로 얻는 것 — **연장**이다. 잡손 한 국을 지우고 친을 유지하니
 * 값이 붙는다(본장도 하나 오른다).
 */
const DEALER_REPEAT = 700;

/**
 * 국사무쌍이 살아 있다고 보는 샹텐. 요구패 13종 배패는 국사 1샹텐, 12종은 2샹텐이다.
 * 그 손은 잡손이 아니라 **역만 배패**라 유찰이 아깝다.
 */
const KOKUSHI_ALIVE_SHANTEN = 2;

/**
 * 구종구패 입찰. 옵션이 없으면 null(= 이 자리가 아니다).
 *
 * 값이 음수면 `bestBid`가 버림 입찰에 진다 — "선언하지 않는다"는 규칙이 아니라
 * 입찰이 진 결과로 나온다(봇의 다른 판단과 같은 형태).
 */
export function bidAbort(read: BotRead, options: readonly ActionOption[]): ActionBid | null {
  const option = options.find((o) => o.type === "kyushuKyuhai");
  if (option === undefined) return null;

  // 국사무쌍이 살아 있는 배패인가 — 종류 수가 아니라 **실제 샹텐**으로 본다.
  // 국사 샹텐은 표준형·치또이와 함께 `shantenOf`가 이미 세고 있고, 요구패만 든
  // 손에서는 그 값이 곧 국사 샹텐이다.
  const kokushi = shantenOf(read.hand, read.meldCount, read.opts);
  if (kokushi <= KOKUSHI_ALIVE_SHANTEN) {
    return {
      option,
      value: -Infinity,
      reason: `구종구패 보류 (국사 샹텐${kokushi})`,
    };
  }

  /**
   * 뒤집어야 하는 처지에서는 한 국을 지우는 것이 곧 기회를 하나 태우는 것이다.
   * `riskAppetite`가 +1이면 유찰의 값이 0이 되고, -1(순위를 지킨다)이면 오히려
   * 조용히 끝나는 국이 반갑다.
   */
  const appetite = Math.max(-1, Math.min(1, read.match.riskAppetite));
  const value =
    JUNK_ROUND_COST * (1 - appetite) + (read.match.isDealer ? DEALER_REPEAT : 0);

  return {
    option,
    value,
    reason: `구종구패 (요구패 ${orphanTypes(read.hand)}종 · 국사 샹텐${kokushi})`,
  };
}

/** 손에 든 요구패(1·9·자패)의 **종류** 수 — 로그용 */
function orphanTypes(hand: readonly TileKind[]): number {
  const seen = new Set<string>();
  for (const k of hand) {
    const isNumber = k.suit === "man" || k.suit === "pin" || k.suit === "sou";
    if (!isNumber || k.rank === 1 || k.rank === 9) seen.add(kindKey(k));
  }
  return seen.size;
}
