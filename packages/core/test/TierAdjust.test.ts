/**
 * 티어 자동 조정 (사용자 확정 2026-08-03).
 * "20판마다 / 티어별 상위 10%는 반 단계 상향", 티어가 섞이도록 하위 10%는 하향.
 *
 * 2026-08-08: 순위 기준이 승률 하나에서 **승률 + 픽률**로, 최소 표본이 10 → 5로,
 * 10%가 1종이 안 되는 작은 티어도 최소 1종씩 움직이도록 바뀌었다.
 */

import { describe, expect, it } from "vitest";
import {
  ADJUST_EVERY_GAMES,
  MAX_HALF_STEPS,
  MIN_OFFERS,
  MIN_SAMPLE,
  MIN_TIER_SAMPLE,
  adjustedWeight,
  computeAdjustment,
  strengthOf,
  weightForOffset,
  weightsFromOffsets,
} from "../src/augment/tierAdjust.js";
import type { AugmentRecord } from "../src/augment/tierAdjust.js";
import {
  AUGMENT_POWER_TIERS,
  POWER_TIER_ORDER,
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

describe("strengthOf — 승률과 픽률을 함께 본다 (2026-08-08)", () => {
  it("평범한 성적(1위율 25% · 픽률 1/3)이 1.0이다", () => {
    expect(strengthOf({ games: 100, wins: 25, offered: 300, picked: 100 })).toBeCloseTo(
      1,
      10,
    );
  });

  it("픽률 표본이 모자라면 승률만 본다 — 없는 값을 0으로 치지 않는다", () => {
    const noOffers = { games: 100, wins: 25, offered: MIN_OFFERS - 1, picked: 0 };
    // 픽률을 0으로 쳤다면 1.0보다 한참 낮았을 것이다
    expect(strengthOf(noOffers)).toBeCloseTo(1, 10);
    expect(strengthOf({ games: 100, wins: 25 })).toBeCloseTo(1, 10);
  });

  it("픽률이 높으면 조금 더 세게 잡힌다 — 승률이 같아도", () => {
    const base = { games: 100, wins: 25, offered: 300, picked: 100 };
    const loved = { games: 100, wins: 25, offered: 300, picked: 200 };
    expect(strengthOf(loved)).toBeGreaterThan(strengthOf(base));
  });

  it("픽률은 승률을 뒤집지 못한다 — 재미로 집히는 것이 파워로 오인되면 안 된다", () => {
    // 픽률 만점(전부 선택) + 평범한 승률  vs  픽률 0 + 승률 두 배
    const funny = { games: 100, wins: 25, offered: 300, picked: 300 };
    const strong = { games: 100, wins: 50, offered: 300, picked: 0 };
    expect(strengthOf(strong)).toBeGreaterThan(strengthOf(funny));
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

  it("최소 표본은 5판이다 (사용자 확정 2026-08-08)", () => {
    // 10이던 시절 운영 집계에서 문턱을 넘은 증강이 하나도 없어 조정이 무효였다.
    expect(MIN_SAMPLE).toBe(5);
  });

  it("가중치가 완만하다 — 최상위도 최하위의 절반 밑으로 내려가지 않는다", () => {
    const top = POWER_TIER_WEIGHT["SS+"];
    const bottom = POWER_TIER_WEIGHT.D;
    expect(top / bottom).toBeGreaterThan(0.5);
    // 그래도 순서는 지킨다 — 셀수록 조금 덜 나온다
    const ordered = POWER_TIER_ORDER.map((t) => POWER_TIER_WEIGHT[t]);
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i] as number).toBeGreaterThan(ordered[i - 1] as number);
    }
  });

  it("상한까지 밀려도 노출이 사라지지 않는다", () => {
    const worst = weightForOffset("SS+", MAX_HALF_STEPS);
    expect(worst / POWER_TIER_WEIGHT.D).toBeGreaterThan(0.5);
  });
});

describe("작은 티어도 움직인다 (2026-08-08)", () => {
  /** 티어 안 표본이 n종일 때 조정이 몇 종을 움직이는가 */
  function movedCount(tier: PowerTier, n: number): number {
    const ids = idsOfTier(tier).slice(0, n);
    if (ids.length < n) return -1; // 이 티어에 그만큼이 없다
    const records: Record<string, AugmentRecord> = {};
    ids.forEach((id, i) => {
      records[id] = { games: MIN_SAMPLE, wins: n - i };
    });
    return Object.values(computeAdjustment(records)).filter((v) => v !== 0).length;
  }

  it("10종이 안 되는 티어도 위아래 한 종씩은 움직인다", () => {
    // 예전에는 floor(n*0.1) < 1 이면 티어를 통째로 건너뛰어 영영 굳어 있었다.
    const moved = movedCount("D", MIN_TIER_SAMPLE);
    if (moved < 0) return; // D가 4종 미만이면 이 케이스는 확인할 수 없다
    expect(moved).toBe(2);
  });

  it("너무 작은 티어(4종 미만)는 건드리지 않는다 — 매 주기 갈리기만 한다", () => {
    const moved = movedCount("D", MIN_TIER_SAMPLE - 1);
    if (moved < 0) return;
    expect(moved).toBe(0);
  });
});
