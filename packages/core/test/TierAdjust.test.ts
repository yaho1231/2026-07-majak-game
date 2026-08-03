/**
 * 티어 자동 조정 (사용자 확정 2026-08-03).
 * "20판마다 / 티어별 승률 상위 10%는 반 단계 상향", 티어가 섞이도록 하위 10%는 하향.
 */

import { describe, expect, it } from "vitest";
import {
  ADJUST_EVERY_GAMES,
  MAX_HALF_STEPS,
  MIN_SAMPLE,
  adjustedWeight,
  computeAdjustment,
  weightForOffset,
  weightsFromOffsets,
} from "../src/augment/tierAdjust.js";
import type { AugmentRecord } from "../src/augment/tierAdjust.js";
import {
  AUGMENT_POWER_TIERS,
  POWER_TIER_WEIGHT,
} from "../src/augment/powerTier.js";
import type { PowerTier } from "../src/augment/powerTier.js";

/** 그 티어의 증강 id들 */
function idsOfTier(tier: PowerTier): string[] {
  return Object.entries(AUGMENT_POWER_TIERS)
    .filter(([, e]) => e.tier === tier)
    .map(([id]) => id);
}

describe("weightForOffset — 반 단계는 이웃 티어와의 중간값이다", () => {
  it("조정이 없으면 티어표 그대로다", () => {
    expect(weightForOffset("A", 0)).toBe(POWER_TIER_WEIGHT.A);
    expect(weightForOffset("D", 0)).toBe(POWER_TIER_WEIGHT.D);
  });

  it("반 단계 상향은 A와 S의 정확한 중간이다", () => {
    const mid = (POWER_TIER_WEIGHT.A + POWER_TIER_WEIGHT.S) / 2;
    expect(weightForOffset("A", 1)).toBeCloseTo(mid, 10);
  });

  it("두 반 단계 상향은 한 티어 위와 같다", () => {
    expect(weightForOffset("A", 2)).toBeCloseTo(POWER_TIER_WEIGHT.S, 10);
  });

  it("반 단계 하향은 약한 쪽(가중치가 큰 쪽)으로 간다", () => {
    expect(weightForOffset("A", -1)).toBeGreaterThan(POWER_TIER_WEIGHT.A);
  });

  it("표의 양끝을 넘어가지 않는다", () => {
    expect(weightForOffset("SS+", 10)).toBe(POWER_TIER_WEIGHT["SS+"]);
    expect(weightForOffset("D", -10)).toBe(POWER_TIER_WEIGHT.D);
  });
});

describe("computeAdjustment — 티어별로 위아래를 함께 뽑는다", () => {
  /** 한 티어의 증강들에 승률을 순서대로 매긴 집계 */
  function recordsFor(tier: PowerTier): Record<string, AugmentRecord> {
    const ids = idsOfTier(tier);
    const out: Record<string, AugmentRecord> = {};
    ids.forEach((id, i) => {
      // i가 작을수록 승률이 높다
      out[id] = { games: 100, wins: 100 - i };
    });
    return out;
  }

  it("표본이 적은 증강은 조정 대상이 아니다", () => {
    const ids = idsOfTier("A");
    const records: Record<string, AugmentRecord> = {};
    for (const id of ids) records[id] = { games: MIN_SAMPLE - 1, wins: MIN_SAMPLE - 1 };
    expect(computeAdjustment(records)).toEqual({});
  });

  it("승률 최상위는 상향(+1), 최하위는 하향(-1)된다", () => {
    const tier: PowerTier = "A";
    const ids = idsOfTier(tier);
    if (ids.length < 10) return; // 이 티어가 10종 미만이면 10%가 1개가 안 된다
    const out = computeAdjustment(recordsFor(tier));
    expect(out[ids[0] as string]).toBe(1);
    expect(out[ids[ids.length - 1] as string]).toBe(-1);
  });

  it("티어별로 따로 뽑는다 — 다른 티어의 최상위도 함께 상향된다", () => {
    const a = idsOfTier("A");
    const b = idsOfTier("B");
    if (a.length < 10 || b.length < 10) return;
    const out = computeAdjustment({ ...recordsFor("A"), ...recordsFor("B") });
    // 전체에서 한 번에 뽑았다면 한쪽 티어만 잡혔을 것이다
    expect(out[a[0] as string]).toBe(1);
    expect(out[b[0] as string]).toBe(1);
  });

  it("누적은 상한에서 멈춘다", () => {
    const tier: PowerTier = "A";
    const ids = idsOfTier(tier);
    if (ids.length < 10) return;
    let offsets = {};
    for (let i = 0; i < MAX_HALF_STEPS + 3; i++) {
      offsets = computeAdjustment(recordsFor(tier), offsets);
    }
    expect((offsets as Record<string, number>)[ids[0] as string]).toBe(MAX_HALF_STEPS);
  });

  it("같은 입력은 같은 결과를 낸다 (결정적)", () => {
    const r = recordsFor("B");
    expect(computeAdjustment(r)).toEqual(computeAdjustment(r));
  });
});

describe("가중치 반영", () => {
  it("조정이 없으면 정적 티어표와 같다", () => {
    const w = weightsFromOffsets({});
    for (const [id, e] of Object.entries(AUGMENT_POWER_TIERS)) {
      expect(w[id]).toBe(POWER_TIER_WEIGHT[e.tier]);
    }
  });

  it("상향된 증강은 가중치가 줄어(더 희귀해)진다", () => {
    const id = idsOfTier("A")[0] as string;
    expect(adjustedWeight(id, { [id]: 2 })).toBeLessThan(adjustedWeight(id, {}));
  });

  it("주기는 20판이다 (사용자 확정)", () => {
    expect(ADJUST_EVERY_GAMES).toBe(20);
  });
});
