/**
 * 탕야오 해방 (prism) — 자패 없이 수패로만 이루어진 손이면 1·9가 섞여 있어도
 * 탕야오로 인정되며, **그 탕야오를 2판으로 취급**한다.
 *
 * ⚠ 밸런스 연혁(2026-07-26): 탕야오 2판 → 기존처럼 1판 + 화료 시 +2000점 →
 * 확정 보상 단위를 판수로 통일해 1판 + 화료 시 +2판 → **역 자체를 2판으로 취급**(현재).
 * 마지막 정리는 docs/10 §0 "확정 보상 단위·표기" 규약 — 관련 역이 있으면 별도 보너스를
 * 붙이지 않고 **그 역의 판수로 흡수해서** 쓴다. 정산 보정(addWinHanBonus)은 이제 없다.
 *
 * 구현: 커스텀 역 "tanyao_break"를 YakuRegistry에 1회만 등록하고,
 * yakuHolders 집합으로 화료자가 보유자인 경우에만 성립시킨다.
 * 1·9 수패가 하나 이상 있어야 성립하므로 진짜 탕야오와는 중복되지 않는다.
 *
 * 이 증강은 docs/16 §1b E "조용한 규칙 완화" — 1·9를 끼고 탕야오를 선언하는 순간은
 * 테이블에서 분명히 보이는데(마작 상식 파괴) 보상이 조용했다. 지금은 그 보상이
 * "이 탕야오는 2판짜리다"라는 역 판수 하나로 정산에 드러난다.
 */

import { allKinds, defineAugment, isNumberSuit, isTerminal } from "@majak/core";
import type { AugmentDef } from "@majak/core";
import { addYakuHolder, yakuHolders } from "../util.js";

const ID = "tanyao_break";
/**
 * 해방된 탕야오의 판수 (2026-07-26 사용자 확정).
 * 표준 탕야오는 1판이지만 이 역은 **2판으로 취급**한다 — 예전의 "1판 + 화료 시 +2판 보너스"를
 * 역 자체의 판수 하나로 접었다(docs/10 §0 "확정 보상 단위·표기").
 */
const BREAK_HAN = 2;

export const tanyaoBreak: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "shape",
  complexity: 2,
  name: "탕야오 해방",
  description:
    "(상시) 자패 없이 수패로만 이루어진 손이면 1·9가 섞여 있어도 탕야오로 인정되며, 그 탕야오를 2판으로 취급한다.",
  detail:
    "(상시) 자패가 하나라도 있으면 성립하지 않고, 1·9가 없는 손은 원래의 탕야오로 계산된다. 해방된 탕야오는 역만에는 적용되지 않는다.",
  // 준찬타·찬타·혼노두와 **동시에 붙는 것은 의도된 설계다** (2026-08-03 사용자 확정).
  // 감사에서 "노두가 없다는 탕야오와 모든 몸통에 노두가 있다는 준찬타가 한 손에
  // 동시 표기된다"가 모순으로 제기됐지만, 이 증강은 탕야오의 정의 자체를 넓힌다 —
  // **1·9를 포함할 수 있는 탕야오**가 된 것이라 준찬타와 공존하는 것이 당연하다.
  install(ctx) {
    const yaku = ctx.yaku;
    if (yaku === undefined) return;
    // 역은 게임(YakuRegistry)당 1회만 등록 — 여러 명이 같은 증강을 보유해도 안전
    if (yaku.get(ID) === undefined) {
      yaku.register({
        // 무장해제되면 이 역도 함께 잠긴다 (evaluate가 disarmedSources와 대조)
        source: ctx.instanceId,
        id: ID,
        name: "탕야오 해방",
        closedHan: BREAK_HAN,
        openHan: BREAK_HAN,
        check: (variant, wctx) => {
          if (wctx.winnerId === undefined) return false;
          if (!yakuHolders(yaku, ID).has(wctx.winnerId)) return false;
          const kinds = allKinds(variant);
          // 자패(풍·삼원) 없음 + 1·9 수패 하나 이상 → 진짜 탕야오와 중복 방지
          return kinds.every((k) => isNumberSuit(k)) && kinds.some((k) => isTerminal(k));
        },
      });
    }
    addYakuHolder(ctx, yaku, ID);
  },
});
