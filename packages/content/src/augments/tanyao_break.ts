/**
 * 탕야오 해방 (prism) — 자패 없이 수패로만 이루어진 손이면 1·9가 섞여 있어도
 * 탕야오처럼 1판을 받는다.
 *
 * 구현: 커스텀 역 "tanyao_break"를 YakuRegistry에 1회만 등록하고,
 * yakuHolders 집합으로 화료자가 보유자인 경우에만 성립시킨다.
 * 1·9 수패가 하나 이상 있어야 성립하므로 진짜 탕야오와는 중복되지 않는다.
 */

import { allKinds, defineAugment, isNumberSuit, isTerminal } from "@majak/core";
import type { AugmentDef } from "@majak/core";
import { yakuHolders } from "../util.js";

export const tanyaoBreak: AugmentDef = defineAugment({
  id: "tanyao_break",
  tier: "prism",
  name: "탕야오 해방",
  description:
    "자패 없이 수패로만 이루어진 손이면 1·9가 있어도 탕야오처럼 1판을 받는다.",
  install(ctx) {
    const yaku = ctx.yaku;
    if (yaku === undefined) return;
    // 역은 게임(YakuRegistry)당 1회만 등록 — 여러 명이 같은 증강을 보유해도 안전
    if (yaku.get("tanyao_break") === undefined) {
      yaku.register({
        id: "tanyao_break",
        name: "탕야오 해방",
        closedHan: 1,
        openHan: 1,
        check: (variant, wctx) => {
          if (wctx.winnerId === undefined) return false;
          if (!yakuHolders(yaku, "tanyao_break").has(wctx.winnerId)) return false;
          const kinds = allKinds(variant);
          // 자패(풍·삼원) 없음 + 1·9 수패 하나 이상 → 진짜 탕야오와 중복 방지
          return kinds.every((k) => isNumberSuit(k)) && kinds.some((k) => isTerminal(k));
        },
      });
    }
    yakuHolders(yaku, "tanyao_break").add(ctx.holder);
  },
});
