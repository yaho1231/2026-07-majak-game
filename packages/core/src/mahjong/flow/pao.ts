/**
 * 책임지불 (파오 / 包 / sekinin barai) — 01 §9 `score.pao`.
 *
 * 대삼원의 **세 번째** 삼원패 커쯔, 대사희의 **네 번째** 바람 커쯔를 울려 주면
 * 그 패를 내준 사람이 "확정시킨 사람"이 되어 책임을 진다.
 *
 * # 판정을 후로 이력으로만 하는 이유
 *
 * 이 게임에는 커쯔·역만을 이상한 경로로 만드는 증강이 있다 — 무늬가 섞인 커쯔
 * (동수의 결속), 동남서북 슌쯔·깡(바람의 계보), 7장짜리 대삼원(삼원의 의지).
 * 완성된 손을 역산해 "누가 세 번째를 줬나"를 되짚으면 이런 손에서 엉뚱한 사람이
 * 걸린다. 그래서 판정은 **실제 후로 기록**(`Meld.calledFrom`, 배열 순서 = 선언 순서)
 * 만 읽는다. 후로가 아닌 경로로 선 역만은 파오가 붙지 않는다 — 준 사람이 없으니까.
 *
 * # 조건 (전부 만족해야 파오)
 *
 * 1. 화료 손에 대삼원(또는 대사희)이 실제로 서 있다.
 * 2. 해당 커쯔 **전부**가 후로로 테이블에 눕혀져 있다 (대삼원 3개 / 대사희 4개).
 *    손 안의 안커가 섞여 있으면 파오가 아니다 — 마지막 한 장을 내준 사람이
 *    "이 사람이 대삼원이구나"를 **볼 수 없었으니** 책임을 물을 수 없다.
 * 3. 선언 순서상 **마지막** 커쯔가 남의 버림패를 울린 것이다 (`calledFrom` 존재).
 *    안깡·쯔모로 스스로 맞췄으면 책임자가 없다.
 *
 * 가깡(kan_added)은 원래 펑의 자리·`calledFrom`을 그대로 물려받으므로(flowEvents),
 * 배열 순서는 언제나 "그 몸통이 처음 선 순서"다.
 */

import type { GameState, Meld } from "../../engine/state/GameState.js";
import type { PlayerId } from "../../engine/zones/Zone.js";
import { Suits } from "../tiles/Tile.js";
import { kindOf } from "./helpers.js";

/** 파오 대상 역 — 배수는 `yakumanMultiplier`와 같아야 한다 (standardYaku) */
const PAO_YAKU = [
  { yakuId: "daisangen", suit: Suits.Dragon, need: 3, units: 1 },
  { yakuId: "daisuushii", suit: Suits.Wind, need: 4, units: 2 },
] as const;

export interface PaoResult {
  /** 책임을 지는 사람 (마지막 커쯔를 내준 사람) */
  responsible: PlayerId;
  /** 책임 대상 역 id */
  yakuId: string;
  /** 그 역이 차지하는 역만 배수 — 다른 역만과 복합했을 때 파오 몫을 가른다 */
  units: number;
}

/** 같은 자패(suit) 한 종류만으로 이뤄진 커쯔·깡 후로인가 */
function isHonorTripletMeld(
  state: GameState,
  meld: Meld,
  suit: string,
): boolean {
  if (meld.kind === "chi" || meld.kind === "kokushi_pon") return false;
  const kinds = meld.tileIds.map((id) => kindOf(state, id));
  const first = kinds[0];
  if (first === undefined || first.suit !== suit) return false;
  // 랭크·무늬가 섞인 몸통(바람의 계보 동남서북 깡, 동수의 결속)은 커쯔가 아니다
  return kinds.every((k) => k.suit === suit && k.rank === first.rank);
}

/**
 * 이 화료에 파오가 붙는가. 붙지 않으면 null.
 *
 * @param yakuIds 성립한 역 id 목록 (`WinEvaluation.yaku`에서)
 */
export function findPao(
  state: GameState,
  winner: PlayerId,
  yakuIds: readonly string[],
): PaoResult | null {
  const melds = state.round.byPlayer[winner]?.melds ?? [];
  for (const spec of PAO_YAKU) {
    if (!yakuIds.includes(spec.yakuId)) continue;
    const matching = melds.filter((m) => isHonorTripletMeld(state, m, spec.suit));
    if (matching.length !== spec.need) continue; // 안커가 섞여 있다 → 책임자 없음
    const confirming = matching[matching.length - 1] as Meld;
    const from = confirming.calledFrom;
    if (from === undefined || from === winner) continue; // 안깡·자력 완성
    return { responsible: from, yakuId: spec.yakuId, units: spec.units };
  }
  return null;
}

/** 100점 단위 반올림 (지불액 표기 단위) */
export const round100 = (n: number): number => Math.round(n / 100) * 100;
