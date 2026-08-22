/**
 * score — 판·부 → 점수와 지불 분배. 01_GAME_RULES §7의 표.
 * 절상 만관 없음, 셈수 역만 있음, 100점 올림. 본장·공탁은 Game Flow(11)의 몫.
 *
 * 설계: docs/08_MAHJONG_ENGINE.md §5
 */

export type LimitName =
  | "mangan"
  | "haneman"
  | "baiman"
  | "sanbaiman"
  | "kazoe_yakuman"
  | "yakuman"
  | null;

export interface ScoreArgs {
  han: number;
  fu: number;
  /** 0이면 일반 손 */
  yakumanCount?: number;
  isDealer: boolean;
  winType: "tsumo" | "ron";
  /**
   * **단계 상한을 씌우지 않는다** (뚫린 천장 · `score.uncapped`).
   *
   * 만관·하네만·배만·역만의 계단을 없애고 판수에 선형으로 붙인다 —
   * 만관(5판) 위로는 **2판마다 만관 하나**, 만관 아래는 표준 `부 × 2^(2+판)`을
   * 상한 없이 그대로 쓴다(4판 40부 2,560이 2,000으로 깎이지 않는 것이 이 구간의
   * 천장 뚫기다). 역만은 판·부를 세지 않으므로 13판으로 환산한다.
   *
   * 곡선의 근거와 기울기 조정 이력은 `content/src/augments/aotenjou_ceiling.ts`.
   * 그 증강이 여기를 **유일한 구현**으로 쓴다 — 예전에는 증강이 곡선을 따로
   * 들고 있어서, 다른 증강이 얹어 주는 "+N판"은 이 상한 해제를 못 보고
   * `calculateScore`의 계단에 다시 잘렸다(2026-08-23 QA synergy3 score 확정 6:
   * 같은 "+3판"인데 실판 계열은 48,000, 뱅크 환산 계열은 42,000이었다).
   */
  uncapped?: boolean;
}

export interface ScoreResult {
  basePoints: number;
  /** 화료자가 받는 총점 (본장·공탁 제외) */
  total: number;
  limit: LimitName;
  payments: {
    /** 론: 방총자 부담 */
    discarder?: number;
    /** 자 쯔모: 친 부담 */
    dealer?: number;
    /** 쯔모: 자 1명당 부담 */
    others?: number;
  };
}

const roundUp100 = (n: number): number => Math.ceil(n / 100) * 100;

/** 만관의 기본점 */
const MANGAN_BASE = 2000;
/** 상한 해제 구간에서 판 하나가 더해 주는 기본점 — 만관의 절반(= 2판당 만관 하나) */
const UNCAPPED_PER_HAN = MANGAN_BASE / 2;
/** 이 판수부터 표준 상한이 걸리기 시작한다 */
const MANGAN_HAN = 5;

/** 상한 없는 기본점 — `uncapped` 전용 곡선 (위 ScoreArgs.uncapped 주석 참고) */
function uncappedBase(args: ScoreArgs): number {
  const effHan = args.han + 13 * (args.yakumanCount ?? 0);
  if (effHan < MANGAN_HAN) return args.fu * 2 ** (2 + effHan);
  return MANGAN_BASE + (effHan - MANGAN_HAN) * UNCAPPED_PER_HAN;
}

export function calculateScore(args: ScoreArgs): ScoreResult {
  const yakuman = args.yakumanCount ?? 0;
  let basePoints: number;
  let limit: LimitName = null;

  if (args.uncapped === true) {
    basePoints = uncappedBase(args);
  } else if (yakuman > 0) {
    basePoints = 8000 * yakuman;
    limit = "yakuman";
  } else if (args.han >= 13) {
    basePoints = 8000;
    limit = "kazoe_yakuman";
  } else if (args.han >= 11) {
    basePoints = 6000;
    limit = "sanbaiman";
  } else if (args.han >= 8) {
    basePoints = 4000;
    limit = "baiman";
  } else if (args.han >= 6) {
    basePoints = 3000;
    limit = "haneman";
  } else if (args.han >= 5) {
    basePoints = 2000;
    limit = "mangan";
  } else {
    basePoints = args.fu * 2 ** (2 + args.han);
    if (basePoints > 2000) {
      basePoints = 2000; // 절상 없음 — 4판 30부(1920)는 그대로
      limit = "mangan";
    }
  }

  if (args.winType === "ron") {
    const paid = roundUp100(basePoints * (args.isDealer ? 6 : 4));
    return { basePoints, total: paid, limit, payments: { discarder: paid } };
  }

  if (args.isDealer) {
    const each = roundUp100(basePoints * 2);
    return { basePoints, total: each * 3, limit, payments: { others: each } };
  }

  const dealerPays = roundUp100(basePoints * 2);
  const othersPay = roundUp100(basePoints);
  return {
    basePoints,
    total: dealerPays + othersPay * 2,
    limit,
    payments: { dealer: dealerPays, others: othersPay },
  };
}
