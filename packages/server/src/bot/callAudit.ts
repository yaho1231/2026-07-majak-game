/**
 * callAudit — **봇이 콜 기회를 무슨 이유로 흘리는가**를 세는 자리.
 *
 * ## 왜 필요한가
 *
 * 봇의 후로율은 8~17%, 사람은 30~40%다. 측정 하네스가 생긴 뒤로 이 격차의 원인을
 * 두 번 추측했고 **두 번 다 틀렸다.**
 *
 *   - #136: 쿠이탄 게이트가 좁다 → 풀었더니 판이 나빠져 되돌림
 *   - #148: EV의 낙관을 걷어낸 뒤 같은 게이트를 다시 재 봄 → 또 나빠짐(순위 -0.045)
 *
 * 두 번 다 "아마 이것 때문일 것이다"에서 출발해 800판을 태우고 아니라는 답을 얻었다.
 * 세 번째 추측 대신 **세는 쪽을 먼저 만든다.** 콜 기회 하나하나가 어디서 걸러지는지
 * 알면, 다음 가설은 짐작이 아니라 분포에서 나온다.
 *
 * ## 재는 자리
 *
 * 콜 기회는 `bidCall`을 지나며 다섯 관문 중 하나에서 걸리거나, 입찰까지 가서
 * 패스·버림에 진다. 관문은 **구조적 거절**(EV를 계산해 보지도 않는다)이고,
 * 마지막 하나만 **EV의 판단**이다. 둘을 나눠 세는 것이 이 파일의 요점이다 —
 * 구조적 거절이 대부분이라면 문턱을 봐야 하고, EV에서 지는 것이 대부분이라면
 * 값매김을 봐야 한다. 지금까지는 둘 중 어느 쪽인지도 모른 채 문턱만 건드렸다.
 *
 * ## 어떻게 붙는가
 *
 * 실험 스위치(`bot/flags.ts`)와 같은 길로 들어온다 — `BotAgent.setCallAudit`으로
 * 걸고 `buildRead`가 판 읽기에 실어 주므로, **전역 상태가 없고 실대국은 건드리지
 * 않는다**(기본값 `undefined`라 `record` 호출 자체가 일어나지 않는다).
 */

/** 콜 기회 하나가 어디서 끝났는가 */
export type CallOutcome =
  /** 울었다 */
  | "taken"
  /** 입찰까지 갔지만 패스·버림·리치에 EV로 졌다 — 유일하게 '판단'인 항목 */
  | "lost_to_pass"
  /** 멘젠 텐파이라 스스로 열지 않았다 */
  | "menzen_tenpai"
  /** 부를 수 있는 조합을 손에서 못 만들었다 (뷰가 옵션만 주고 패가 안 맞는 경우) */
  | "no_shape"
  /** 울어도 샹텐이 줄지 않는다 */
  | "no_progress"
  /** 울면 화료할 역이 없다 */
  | "no_yaku";

/** 콜 기회 하나의 기록 */
export interface CallAuditEntry {
  outcome: CallOutcome;
  /**
   * **펑(대명깡 포함)이 가능한 기회인가.** 아니면 치뿐이다.
   *
   * 둘을 나누는 이유는 성질이 다르기 때문이다 — 펑은 상대 셋 누구한테서나 오고
   * 또이쯔만 있으면 되지만, 치는 상가에게서만 오고 손을 열어도 역이 잘 안 붙는다.
   * "역 없음으로 걸린 것이 치인가 펑인가"가 다음에 무엇을 볼지를 가른다.
   */
  canPon: boolean;
  /** 불린 패가 나에게 역패인가 — "역패 펑을 흘리고 있는가"가 핵심 질문이라 따로 센다 */
  yakuhai: boolean;
  /** 부르기 전 샹텐 */
  shantenBefore: number;
  /** 이번 국의 순목 */
  turn: number;
  /**
   * 콜 EV가 이긴 쪽 입찰보다 **얼마나 앞섰는가** (음수면 그만큼 졌다).
   * 입찰까지 간 기회(`taken`·`lost_to_pass`)에만 있다.
   *
   * 이 값이 있어야 "졌다"와 "아슬아슬하게 졌다"를 나눌 수 있다. 실제로 손으로 짚어
   * 본 장면 하나(5샹텐 손의 백 펑)가 835 대 814, 2.5% 차이로 갈렸다 — 그런 것이
   * 몇 건이나 되는지는 세어 봐야 안다.
   */
  margin?: number;
}

/** 기록을 받는 쪽 (arena가 구현한다) */
export interface CallAudit {
  record(entry: CallAuditEntry): void;
}

/** 결과별 집계 — 순서가 곧 표의 순서다 */
export const CALL_OUTCOMES: readonly CallOutcome[] = [
  "taken",
  "lost_to_pass",
  "no_yaku",
  "no_progress",
  "menzen_tenpai",
  "no_shape",
];

/** 사람이 읽는 이름 */
export const CALL_OUTCOME_LABEL: Record<CallOutcome, string> = {
  taken: "울었다",
  lost_to_pass: "EV에서 짐",
  no_yaku: "역 없음",
  no_progress: "전진 없음",
  menzen_tenpai: "멘젠 텐파이",
  no_shape: "조합 없음",
};

/** 여러 판의 기록을 모으는 집계기 */
export class CallTally implements CallAudit {
  /** 결과별 기회 수 */
  readonly byOutcome = new Map<CallOutcome, number>();
  /** 역패 기회만 따로 (사람이 거의 항상 부르는 쪽) */
  readonly yakuhaiByOutcome = new Map<CallOutcome, number>();
  /** 결과별 샹텐 합 — 평균을 내면 "어떤 손에서 걸리는가"가 보인다 */
  private readonly shantenSum = new Map<CallOutcome, number>();
  /** EV로 진 기회들의 상대 차이 |margin| / 이긴 입찰값 — 아슬아슬함의 분포 */
  private readonly lostMargins: number[] = [];
  /** 결과별, 펑이 가능했던 기회 수 (나머지는 치뿐인 기회다) */
  private readonly ponByOutcome = new Map<CallOutcome, number>();
  total = 0;

  record(entry: CallAuditEntry): void {
    this.total++;
    bump(this.byOutcome, entry.outcome);
    bump(this.shantenSum, entry.outcome, entry.shantenBefore);
    if (entry.yakuhai) bump(this.yakuhaiByOutcome, entry.outcome);
    if (entry.canPon) bump(this.ponByOutcome, entry.outcome);
    if (entry.outcome === "lost_to_pass" && entry.margin !== undefined) {
      this.lostMargins.push(entry.margin);
    }
  }

  /**
   * EV로 진 기회 중 **`ratio`(예: 0.05 = 5%) 이내로 진** 비율.
   * 높으면 그 판단이 동전 던지기 위에 서 있다는 뜻이다 — 값매김을 조금만 건드려도
   * 결과가 뒤집힌다.
   */
  narrowLossRate(ratio: number): number {
    if (this.lostMargins.length === 0) return 0;
    const near = this.lostMargins.filter((m) => Math.abs(m) <= ratio).length;
    return near / this.lostMargins.length;
  }

  /** EV로 진 기회 수 (margin이 기록된 것만) */
  get lostSamples(): number {
    return this.lostMargins.length;
  }

  count(outcome: CallOutcome): number {
    return this.byOutcome.get(outcome) ?? 0;
  }

  yakuhaiCount(outcome: CallOutcome): number {
    return this.yakuhaiByOutcome.get(outcome) ?? 0;
  }

  /** 그 결과로 끝난 기회 중 펑이 가능했던 수 */
  ponCount(outcome: CallOutcome): number {
    return this.ponByOutcome.get(outcome) ?? 0;
  }

  /** 그 결과로 끝난 기회 중 치뿐이었던 수 */
  chiOnlyCount(outcome: CallOutcome): number {
    return this.count(outcome) - this.ponCount(outcome);
  }

  /** 그 결과로 끝난 기회들의 평균 샹텐 (없으면 0) */
  averageShanten(outcome: CallOutcome): number {
    const n = this.count(outcome);
    return n === 0 ? 0 : (this.shantenSum.get(outcome) ?? 0) / n;
  }
}

function bump<K>(map: Map<K, number>, key: K, by = 1): void {
  map.set(key, (map.get(key) ?? 0) + by);
}
