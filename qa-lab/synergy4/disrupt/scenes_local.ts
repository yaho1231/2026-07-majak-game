import type { PlayerId } from "@majak/core";
import type { CraftConfig } from "../../../packages/content/test/helpers.js";

/** p0가 `wait`를 론으로 잡는 장면 (p1이 쏜다) */
export function ron(hand: string, wait: string, from: PlayerId = "p1"): CraftConfig {
  const seat = { p0: 0, p1: 1, p2: 2, p3: 3 }[from] ?? 1;
  return {
    hands: { p0: hand, p1: "*", p2: "*", p3: "*" },
    discards: { [from]: "" } as Record<PlayerId, string>,
    phase: "reaction",
    turnSeat: seat,
    lastDiscard: { player: from, spec: wait },
  } as CraftConfig;
}

/** p0가 쯔모하는 장면 (hand는 14장) */
export function tsumo(hand14: string): CraftConfig {
  return {
    hands: { p0: hand14, p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  } as CraftConfig;
}

/** 손패 카탈로그 — 판수대별 */
export const HANDS = {
  /** 2판 40부 (삼색) */
  small: { hand: "123m123p123s678s9s", wait: "9s" },
  /** 탕야오 핑후계 저타점 */
  tiny: { hand: "234m234p23456s77s", wait: "7s" },
  /** 청일색 (고타점) */
  chinitsu: { hand: "111234567m22345m", wait: "3m" },
  /** 청일색 13장 */
  chin13: { hand: "1112345678m999m", wait: "9m" },
  /** 또이또이+혼일색 */
  toitoi: { hand: "111m333m555m777m9m", wait: "9m" },
} as const;
