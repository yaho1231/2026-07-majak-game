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

  /**
   * 카탈로그 전체에서 서로 다른 count개를 균등·비복원으로 뽑는다.
   * @param exclude 제외할 증강 id (이미 보유·스테이지/모드 부적합)
   * 풀이 부족하면 가능한 만큼만 반환한다.
   */
  rollUniform(
    prng: Prng,
    count: number,
    exclude: ReadonlySet<string> = new Set(),
  ): AugmentDef[] {
    return AugmentRegistry.rollFrom(prng, count, this.all(), exclude);
  }

  /**
   * **주어진 후보 목록**에서 서로 다른 count개를 균등·비복원으로 뽑는다.
   * 후보를 호출자가 만든다는 점만 다르다 — 좌석별 후보 칸(DraftController §다양성)처럼
   * 카탈로그의 일부만 대상으로 뽑을 때 쓴다. 풀이 부족하면 가능한 만큼만 반환한다.
   */
  static rollFrom(
    prng: Prng,
    count: number,
    candidates: readonly AugmentDef[],
    exclude: ReadonlySet<string> = new Set(),
  ): AugmentDef[] {
    const bucket = candidates.filter((d) => !exclude.has(d.id));
    const chosen: AugmentDef[] = [];
    while (chosen.length < count && bucket.length > 0) {
      const idx = prng.int(bucket.length);
      chosen.push(bucket[idx] as AugmentDef);
      bucket.splice(idx, 1);
    }
    return chosen;
  }
}
