/**
 * RuleRegistry — 모든 게임 규칙의 단일 관리 지점.
 *
 * 규칙(Rule)은 이름 붙은 값이다 (예: "riichi.cost" → 1000).
 * 증강은 규칙 값을 직접 바꾸지 않고 Modifier를 등록하며,
 * 조회(resolve) 시점에 (layer, priority, 등록 순서)로 결정적으로 합성된다.
 * 같은 입력이면 항상 같은 결과가 나오므로 리플레이가 보장된다.
 *
 * 설계: docs/00_MASTER_ARCHITECTURE.md §5.1 (Issue 001 해결)
 */

export type RuleKey = string;

/** Modifier 적용 시 참조할 수 있는 문맥. state는 순환 의존을 피해 형태를 강제하지 않는다. */
export interface RuleContext {
  playerId?: string;
  state?: unknown;
  /** 가시성 규칙 해석 시 대상 Zone의 소유자 (viewer는 playerId) */
  zoneOwner?: string;
}

/** 등급이 높은 증강이 나중에 적용된다 (= 최종 발언권). System은 엔진 안전장치 전용. */
export const RuleLayer = {
  Base: 0,
  Silver: 100,
  Gold: 200,
  Prism: 300,
  System: 1000,
} as const;

export type RuleLayer = (typeof RuleLayer)[keyof typeof RuleLayer];

export interface RuleModifier<T> {
  /** 등록 주체 (증강 인스턴스 id 등). 증강 소멸 시 removeBySource로 일괄 제거 */
  source: string;
  layer: RuleLayer;
  /** 같은 layer 내 세부 순서. 생략 시 0. 그래도 같으면 등록 순서 */
  priority?: number;
  apply: (current: T, ctx: RuleContext) => T;
}

interface StoredModifier {
  source: string;
  layer: RuleLayer;
  priority: number;
  seq: number;
  apply: (current: unknown, ctx: RuleContext) => unknown;
}

export class RuleRegistry {
  private readonly base = new Map<RuleKey, unknown>();
  private readonly modifiers = new Map<RuleKey, StoredModifier[]>();
  private nextSeq = 0;

  /** 기본값 정의. 이미 정의된 규칙을 다시 정의하는 것은 버그이므로 즉시 실패한다. */
  define<T>(key: RuleKey, baseValue: T): void {
    if (this.base.has(key)) {
      throw new Error(`Rule already defined: ${key}`);
    }
    this.base.set(key, baseValue);
  }

  has(key: RuleKey): boolean {
    return this.base.has(key);
  }

  keys(): RuleKey[] {
    return [...this.base.keys()];
  }

  /** 정의되지 않은 규칙에 Modifier를 붙이는 것도 즉시 실패 (오타·등록 누락 조기 발견). */
  addModifier<T>(key: RuleKey, mod: RuleModifier<T>): void {
    if (!this.base.has(key)) {
      throw new Error(`Cannot modify unknown rule: ${key}`);
    }
    const list = this.modifiers.get(key) ?? [];
    list.push({
      source: mod.source,
      layer: mod.layer,
      priority: mod.priority ?? 0,
      seq: this.nextSeq++,
      apply: mod.apply as (current: unknown, ctx: RuleContext) => unknown,
    });
    this.modifiers.set(key, list);
  }

  /** 특정 주체(증강)가 등록한 모든 Modifier 제거. 증강 소멸·파괴 시 호출된다. */
  removeBySource(source: string): void {
    for (const [key, list] of this.modifiers) {
      const kept = list.filter((m) => m.source !== source);
      if (kept.length !== list.length) {
        this.modifiers.set(key, kept);
      }
    }
  }

  /** 기본값에 Modifier들을 (layer, priority, 등록 순서)로 합성한 최종 값을 돌려준다. */
  resolve<T>(key: RuleKey, ctx: RuleContext = {}): T {
    if (!this.base.has(key)) {
      throw new Error(`Unknown rule: ${key}`);
    }
    const list = this.modifiers.get(key);
    let value = this.base.get(key);
    if (list !== undefined && list.length > 0) {
      const sorted = [...list].sort(
        (a, b) => a.layer - b.layer || a.priority - b.priority || a.seq - b.seq,
      );
      for (const mod of sorted) {
        value = mod.apply(value, ctx);
      }
    }
    return value as T;
  }
}
