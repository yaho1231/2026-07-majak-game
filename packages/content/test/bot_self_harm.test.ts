/**
 * 봇 자해 정책 (docs/25 손패 #7, 역/점수 #14).
 *
 * 두 증강의 봇이 **손 상태를 전혀 보지 않고** 조건이 서는 즉시 발동했다.
 * 자리 바꿈은 좋은 배패를 무작위 손과 맞바꾸며 게임당 3회를 초반에 소진했고,
 * 삼원의 의지는 완성된 몸통을 재료로 태웠다.
 */

import { describe, expect, it } from "vitest";
import { botChosenOption } from "@majak/core";
import type { BotDecisionContext, BotAugmentOption } from "@majak/core";
import { seatSwap } from "../src/augments/seat_swap.js";
import { threeDragonsWill } from "../src/augments/three_dragons_will.js";

/** 손 상태만 다른 최소 봇 문맥 */
function ctxWith(
  shanten: number,
  tenpai: boolean,
  options: BotAugmentOption[],
  overrides: Partial<BotDecisionContext> = {},
): BotDecisionContext {
  return {
    holder: "p0",
    options,
    shanten,
    tenpai,
    waits: [],
    remaining: () => 4,
    view: {
      players: [
        { id: "p0", seat: 1 },
        { id: "p1", seat: 0 },
      ],
      round: { dealerSeat: 0 },
    },
    ...overrides,
  } as unknown as BotDecisionContext;
}

describe("자리 바꿈 봇 — 손이 좋으면 교환하지 않는다", () => {
  const opts: BotAugmentOption[] = [
    { type: "seat_swap", payload: { target: "p1" } } as BotAugmentOption,
  ];

  it("텐파이면 발동하지 않는다", () => {
    expect(seatSwap.bot?.choose(ctxWith(0, true, opts))).toBeNull();
  });

  it("셰텐이 얕으면(손이 자라는 중) 발동하지 않는다", () => {
    expect(seatSwap.bot?.choose(ctxWith(1, false, opts))).toBeNull();
  });

  it("손이 나쁘면 종전대로 오야와 교환한다", () => {
    const picked = botChosenOption(seatSwap.bot?.choose(ctxWith(5, false, opts)) ?? null);
    expect(picked).not.toBeNull();
    expect((picked?.payload as { target?: string }).target).toBe("p1");
  });
});

describe("삼원의 의지 봇 — 손이 좋으면 몸통을 태우지 않는다", () => {
  const opts: BotAugmentOption[] = [
    { type: "dragons_will", payload: {} } as BotAugmentOption,
  ];

  it("텐파이면 발동하지 않는다", () => {
    expect(threeDragonsWill.bot?.choose(ctxWith(0, true, opts))).toBeNull();
  });

  it("손이 나쁘면 종전대로 발동한다", () => {
    expect(threeDragonsWill.bot?.choose(ctxWith(5, false, opts))).not.toBeNull();
  });
});
