/**
 * AugmentRegistry — 증강 카탈로그 + 드래프트 추첨.
 *
 * 추첨: **카탈로그 전체에서 균등·비복원**. 등급 가중은 2026-07-22(52차) 등급 폐기와 함께
 * 제거했다 — 모든 증강이 같은 프리즘급이므로 등급으로 등장 확률을 나눌 이유가 없다.
 * 결정성은 호출자가 넘기는 Prng가 보장한다.
 *
 * 설계: docs/10_AUGMENT_SYSTEM.md §3
 */

import type { Prng } from "../engine/random/Prng.js";
import type { AugmentDef } from "./Augment.js";
import { AUGMENT_POWER_TIERS, POWER_TIER_WEIGHT } from "./powerTier.js";

export class AugmentRegistry {
  private readonly defs = new Map<string, AugmentDef>();
  /**
   * 증강 id → 드래프트 가중치 덮어쓰기 (티어 자동 조정 결과).
   *
   * **인스턴스 필드**인 것이 중요하다 — 카탈로그는 게임마다 새로 만들어지므로,
   * 모듈 전역에 두면 동시에 진행되는 방들이 서로의 조정값에 오염된다.
   * 비어 있으면 정적 티어표를 그대로 쓴다(종전 동작).
   */
  private weightOverrides: Readonly<Record<string, number>> = {};

  /** 티어 자동 조정 결과를 이 게임의 드래프트에 적용한다 (서버가 게임 생성 시 주입) */
  setWeightOverrides(weights: Readonly<Record<string, number>>): void {
    this.weightOverrides = weights;
  }

  add(def: AugmentDef): void {
    if (this.defs.has(def.id)) {
      throw new Error(`Augment already in catalog: ${def.id}`);
    }
    this.defs.set(def.id, def);
  }

  addAll(defs: readonly AugmentDef[]): void {
    for (const def of defs) this.add(def);
  }

  get(id: string): AugmentDef | undefined {
    return this.defs.get(id);
  }

  all(): AugmentDef[] {
    return [...this.defs.values()];
  }

  /**
   * 카탈로그 전체에서 서로 다른 count개를 **파워 티어 가중**·비복원으로 뽑는다.
   * @param exclude 제외할 증강 id (이미 보유·스테이지/모드 부적합)
   * 풀이 부족하면 가능한 만큼만 반환한다.
   */
  rollUniform(
    prng: Prng,
    count: number,
    exclude: ReadonlySet<string> = new Set(),
  ): AugmentDef[] {
    return AugmentRegistry.rollFrom(prng, count, this.all(), exclude, this.weightOverrides);
  }

  /** 후보 목록 버전의 rollFrom — 이 카탈로그의 가중치 덮어쓰기를 함께 적용한다 */
  rollFromCell(
    prng: Prng,
    count: number,
    candidates: readonly AugmentDef[],
    exclude: ReadonlySet<string> = new Set(),
  ): AugmentDef[] {
    return AugmentRegistry.rollFrom(prng, count, candidates, exclude, this.weightOverrides);
  }

  /**
   * **주어진 후보 목록**에서 서로 다른 count개를 파워 티어 가중·비복원으로 뽑는다.
   * 후보를 호출자가 만든다는 점만 다르다 — 좌석별 후보 칸(DraftController §다양성)처럼
   * 카탈로그의 일부만 대상으로 뽑을 때 쓴다. 풀이 부족하면 가능한 만큼만 반환한다.
   *
   * 가중치는 `POWER_TIER_WEIGHT`(SS+ ×0.15 … D ×1.20)다. 예전에는 이 표가 정의만
   * 돼 있고 **드래프트 어디에서도 읽히지 않아** 실제 추첨이 완전 균등이었다 —
   * docs/20이 계산한 "SS+가 6장 중 뜰 확률 11% → 1.8%"가 현실이 아니었다
   * (docs/25 최우선#10). 티어표에 없는 id는 1.0(균등)으로 본다.
   */
  static rollFrom(
    prng: Prng,
    count: number,
    candidates: readonly AugmentDef[],
    exclude: ReadonlySet<string> = new Set(),
    overrides: Readonly<Record<string, number>> = {},
  ): AugmentDef[] {
    const bucket = candidates.filter((d) => !exclude.has(d.id));
    const chosen: AugmentDef[] = [];
    while (chosen.length < count && bucket.length > 0) {
      const idx = AugmentRegistry.pickWeighted(prng, bucket, overrides);
      chosen.push(bucket[idx] as AugmentDef);
      bucket.splice(idx, 1);
    }
    return chosen;
  }

  /**
   * 이 증강의 드래프트 가중치. 자동 조정 결과가 있으면 그것이 정적 티어표를 이긴다.
   * 티어표에 없으면 균등 1.0 — 새 증강이 티어 미등재라고 안 뽑히는 사고를 막는다.
   */
  static draftWeight(
    id: string,
    overrides: Readonly<Record<string, number>> = {},
  ): number {
    const override = overrides[id];
    if (override !== undefined) return override;
    const tier = AUGMENT_POWER_TIERS[id]?.tier;
    return tier === undefined ? 1 : POWER_TIER_WEIGHT[tier];
  }

  /**
   * 가중 추출 — 누적합에서 한 칸을 고른다.
   *
   * `prng.int`만 쓰는 이유는 결정론 때문이다. 부동소수 난수를 새로 도입하면 리플레이가
   * 플랫폼 부동소수 오차에 노출되므로, 가중치를 정수 눈금(×100)으로 바꿔 정수 범위에서
   * 고른다. 티어 가중치가 소수점 둘째 자리까지라 손실이 없다.
   */
  private static pickWeighted(
    prng: Prng,
    bucket: readonly AugmentDef[],
    overrides: Readonly<Record<string, number>> = {},
  ): number {
    const ticks = bucket.map((d) =>
      Math.max(1, Math.round(AugmentRegistry.draftWeight(d.id, overrides) * 100)),
    );
    const total = ticks.reduce((sum, t) => sum + t, 0);
    let roll = prng.int(total);
    for (let i = 0; i < ticks.length; i++) {
      roll -= ticks[i] as number;
      if (roll < 0) return i;
    }
    return bucket.length - 1; // 도달하지 않는다 (반올림 안전망)
  }
}
