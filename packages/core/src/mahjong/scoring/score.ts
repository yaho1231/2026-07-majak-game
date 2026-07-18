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

export function calculateScore(args: ScoreArgs): ScoreResult {
  const yakuman = args.yakumanCount ?? 0;
  let basePoints: number;
  let limit: LimitName = null;

  if (yakuman > 0) {
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
