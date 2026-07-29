/**
 * YakuRegistry — 역의 등록형 관리.
 *
 * 표준 역도, 증강이 만드는 새 역도 같은 register()로 들어온다.
 * "역 조건 변경" 증강 = remove 후 교체 등록.
 *
 * 설계: docs/08_MAHJONG_ENGINE.md §3
 */

import type { ScoringVariant, WinContext } from "./WinContext.js";

export interface YakuDef {
  id: string;
  name: string;
  /** 멘젠 판수 */
  closedHan: number;
  /** 후로 시 판수. null = 후로 시 성립 불가 */
  openHan: number | null;
  isYakuman?: boolean;
  /**
   * 보조 역 — 도라처럼 판은 더하지만 "역 있음" 판정에는 세지 않는다.
   * 다른 실제 역이 하나도 없으면 아예 적용되지 않는다 (증강 보너스 역용).
   */
  auxiliary?: boolean;
  /**
   * 이 역을 등록한 주체(증강 인스턴스 id). 증강이 만든 역은 **반드시** 채운다.
   *
   * 무장해제(disarm)는 규칙 모디파이어·효과·액티브 버튼을 전부 잠그지만, 역 레지스트리에는
   * source 개념이 없어 **커스텀 역만 잠기지 않고 그대로 성립**했다(2026-07-29 감사).
   * 이 필드가 있으면 evaluate가 WinContext.disarmedSources와 대조해 걸러낸다.
   * 표준 역은 비워 둔다(잠글 주체가 없다).
   */
  source?: string;
  check(variant: ScoringVariant, ctx: WinContext): boolean;
}

export class YakuRegistry {
  private readonly defs = new Map<string, YakuDef>();

  register(def: YakuDef): void {
    if (this.defs.has(def.id)) {
      throw new Error(`Yaku already registered: ${def.id}`);
    }
    this.defs.set(def.id, def);
  }

  /** 교체(조건 변경)는 remove 후 register */
  remove(id: string): boolean {
    return this.defs.delete(id);
  }

  get(id: string): YakuDef | undefined {
    return this.defs.get(id);
  }

  all(): YakuDef[] {
    return [...this.defs.values()];
  }
}
