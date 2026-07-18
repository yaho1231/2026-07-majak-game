/**
 * 대기의 미학 (wait_art, gold).
 * 나쁜 대기로 화료하면 판이 붙는다: 단기 +2판, 간짱·변짱 +1판.
 *
 * 구현: 대기 형태별 커스텀 역 2종을 YakuRegistry에 1회 등록하고,
 * yakuHolders("wait_art")로 보유자만 성립시킨다. 변형의 waitType으로 판별.
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef } from "@majak/core";
import { yakuHolders } from "../util.js";

export const waitArt: AugmentDef = defineAugment({
  id: "wait_art",
  tier: "gold",
  name: "대기의 미학",
  description:
    "다른 역이 하나 이상 성립할 때, 단기(탄키) 대기로 화료하면 +2판, 간짱·변짱 대기로 화료하면 +1판. 이 효과만으로는 화료할 수 없다 (보조 역).",
  install(ctx) {
    const yaku = ctx.yaku;
    if (yaku === undefined) return;
    const holds = (winnerId: string | undefined): boolean =>
      winnerId !== undefined && yakuHolders(yaku, "wait_art").has(winnerId);

    if (yaku.get("wait_art_tanki") === undefined) {
      yaku.register({
        id: "wait_art_tanki",
        name: "대기의 미학·단기",
        closedHan: 2,
        openHan: 2,
        auxiliary: true, // 다른 실제 역이 있을 때만 판이 붙는다
        check: (variant, wctx) =>
          holds(wctx.winnerId) && variant.waitType === "tanki",
      });
    }
    if (yaku.get("wait_art_bad") === undefined) {
      yaku.register({
        id: "wait_art_bad",
        name: "대기의 미학·간변",
        closedHan: 1,
        openHan: 1,
        auxiliary: true,
        check: (variant, wctx) =>
          holds(wctx.winnerId) &&
          (variant.waitType === "kanchan" || variant.waitType === "penchan"),
      });
    }
    yakuHolders(yaku, "wait_art").add(ctx.holder);
  },
});
