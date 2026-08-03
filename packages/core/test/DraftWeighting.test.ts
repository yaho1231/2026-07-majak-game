/**
 * 드래프트 파워 티어 가중 추출 (docs/25 최우선#10).
 *
 * `POWER_TIER_WEIGHT`(SS+ ×0.15 … D ×1.20)는 정의만 돼 있고 드래프트 어디에서도
 * 읽히지 않았다 — 소비처가 재수출·관리자 티어표·테스트뿐이라 실제 추첨은
 * **완전 균등**이었다. docs/20이 계산한 "SS+가 6장 중 뜰 확률 11% → 1.8%"는
 * 현실이 아니었고, 개벽·단색 세계·진짜 용이 D 티어와 같은 확률로 나왔다.
 */

import { describe, expect, it } from "vitest";
import { AugmentRegistry } from "../src/augment/AugmentRegistry.js";
import {
  AUGMENT_POWER_TIERS,
  POWER_TIER_WEIGHT,
} from "../src/augment/powerTier.js";
import type { PowerTier } from "../src/augment/powerTier.js";
import { Prng } from "../src/engine/random/Prng.js";
import type { AugmentDef } from "../src/augment/Augment.js";

/** 티어만 다른 더미 증강 — id를 티어표에 있는 실제 id로 골라야 가중치가 걸린다 */
function defWithId(id: string): AugmentDef {
  return {
    id,
    tier: "prism",
    category: "scoring",
    name: id,
    description: id,
    detail: id,
    install: () => undefined,
  } as AugmentDef;
}

/** 그 티어에 속하는 실제 증강 id 하나 */
function idOfTier(tier: PowerTier): string {
  const found = Object.entries(AUGMENT_POWER_TIERS).find(
    ([, e]) => e.tier === tier,
  );
  if (found === undefined) throw new Error(`no augment in tier ${tier}`);
  return found[0];
}

describe("draftWeight", () => {
  it("티어표의 가중치를 그대로 돌려준다", () => {
    for (const tier of Object.keys(POWER_TIER_WEIGHT) as PowerTier[]) {
      const id = idOfTier(tier);
      expect(AugmentRegistry.draftWeight(id)).toBe(POWER_TIER_WEIGHT[tier]);
    }
  });

  it("티어표에 없는 id는 균등(1.0)으로 본다", () => {
    expect(AugmentRegistry.draftWeight("__not_in_tier_table__")).toBe(1);
  });
});

describe("rollFrom — 가중 비복원 추출", () => {
  const ssId = idOfTier("SS+");
  const dId = idOfTier("D");

  it("SS+는 D보다 확연히 덜 뽑힌다 (가중치 0.15 대 1.20 = 1:8)", () => {
    const candidates = [defWithId(ssId), defWithId(dId)];
    let ss = 0;
    const trials = 4000;
    for (let i = 0; i < trials; i++) {
      const picked = AugmentRegistry.rollFrom(new Prng(i), 1, candidates);
      if (picked[0]?.id === ssId) ss++;
    }
    const ratio = ss / trials;
    // 이론값 0.15/(0.15+1.20) ≈ 0.111. 균등이면 0.5가 나온다.
    expect(ratio).toBeGreaterThan(0.07);
    expect(ratio).toBeLessThan(0.16);
  });

  it("같은 시드는 항상 같은 결과를 낸다 (리플레이 안전)", () => {
    const candidates = [defWithId(ssId), defWithId(dId), defWithId(idOfTier("A"))];
    const a = AugmentRegistry.rollFrom(new Prng(1234), 3, candidates).map((d) => d.id);
    const b = AugmentRegistry.rollFrom(new Prng(1234), 3, candidates).map((d) => d.id);
    expect(a).toEqual(b);
  });

  it("count가 후보 수 이상이면 결국 전부 나온다 (비복원)", () => {
    const candidates = [defWithId(ssId), defWithId(dId), defWithId(idOfTier("B"))];
    const picked = AugmentRegistry.rollFrom(new Prng(7), 5, candidates).map((d) => d.id);
    expect(new Set(picked).size).toBe(3);
  });

  it("exclude된 id는 뽑히지 않는다", () => {
    const candidates = [defWithId(ssId), defWithId(dId)];
    const picked = AugmentRegistry.rollFrom(
      new Prng(3),
      2,
      candidates,
      new Set([ssId]),
    );
    expect(picked.map((d) => d.id)).toEqual([dId]);
  });
});
