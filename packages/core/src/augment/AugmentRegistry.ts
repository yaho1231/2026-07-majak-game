/**
 * AugmentRegistry — 증강 카탈로그 + 가중 드래프트 추첨.
 *
 * 추첨: 등급을 고정 가중치로 고르고 등급 내 균등, 비복원 추출.
 * 결정성은 호출자가 넘기는 Prng가 보장한다.
 *
 * 설계: docs/10_AUGMENT_SYSTEM.md §3
 */

import type { Prng } from "../engine/random/Prng.js";
import type { AugmentDef, AugmentTier } from "./Augment.js";

export type TierWeights = Record<AugmentTier, number>;

const TIERS: AugmentTier[] = ["silver", "gold", "prism"];

export class AugmentRegistry {
  private readonly defs = new Map<string, AugmentDef>();

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

  byTier(tier: AugmentTier): AugmentDef[] {
    return this.all().filter((d) => d.tier === tier);
  }

  /**
   * 한 등급 안에서만 서로 다른 count개를 균등·비복원으로 뽑는다.
   * (등급 통일 드래프트·도박사 지급용. 등급 결정은 호출자가 한다.)
   * @param exclude 제외할 증강 id (이미 보유·스테이지 부적합)
   * 풀이 부족하면 가능한 만큼만 반환한다.
   */
  rollFromTier(
    prng: Prng,
    tier: AugmentTier,
    count: number,
    exclude: ReadonlySet<string> = new Set(),
  ): AugmentDef[] {
    const bucket = this.byTier(tier).filter((d) => !exclude.has(d.id));
    const chosen: AugmentDef[] = [];
    while (chosen.length < count && bucket.length > 0) {
      const idx = prng.int(bucket.length);
      chosen.push(bucket[idx] as AugmentDef);
      bucket.splice(idx, 1);
    }
    return chosen;
  }

  /**
   * 서로 다른 count개를 등급 가중으로 뽑는다.
   * @param exclude 제외할 증강 id (이미 보유한 것)
   * 카탈로그가 부족하면 가능한 만큼만 반환한다.
   */
  rollChoices(
    prng: Prng,
    weights: TierWeights,
    count: number,
    exclude: ReadonlySet<string> = new Set(),
  ): AugmentDef[] {
    const pool: Record<AugmentTier, AugmentDef[]> = {
      silver: this.byTier("silver").filter((d) => !exclude.has(d.id)),
      gold: this.byTier("gold").filter((d) => !exclude.has(d.id)),
      prism: this.byTier("prism").filter((d) => !exclude.has(d.id)),
    };
    const chosen: AugmentDef[] = [];

    while (chosen.length < count) {
      const available = TIERS.filter(
        (t) => pool[t].length > 0 && weights[t] > 0,
      );
      if (available.length === 0) break;

      const totalWeight = available.reduce((sum, t) => sum + weights[t], 0);
      let roll = prng.next() * totalWeight;
      let picked: AugmentTier = available[0] as AugmentTier;
      for (const tier of available) {
        roll -= weights[tier];
        if (roll < 0) {
          picked = tier;
          break;
        }
      }

      const bucket = pool[picked];
      const idx = prng.int(bucket.length);
      chosen.push(bucket[idx] as AugmentDef);
      bucket.splice(idx, 1);
    }

    return chosen;
  }
}
