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
  /** 화료 문맥 규칙 해석 시 이번 화료의 종류 (buildWinContext가 채운다) */
  winType?: "tsumo" | "ron";
  /** 화료 문맥 규칙 해석 시 손이 멘젠인가 (안깡은 멘젠 유지) */
  isClosed?: boolean;
  /**
   * **가상의 화료 한 건** (`WinInfo` 모양). 정산 시점에만 알 수 있는 값을 보는 규칙
   * (`score.settleHanBonus`)이 읽는다.
   *
   * 타입을 `unknown`으로 둔 이유: `WinInfo`는 `mahjong/flow`의 것이고 이 파일은
   * 엔진 최하층이라 그쪽을 import하면 층이 뒤집힌다(`state`가 `unknown`인 것과 같은 이유).
   */
  winInfo?: unknown;
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
  /**
   * **규칙 세대** — 이 레지스트리의 내용이 바뀔 때마다 하나씩 오른다.
   *
   * 규칙을 읽어 만든 값을 캐시하는 쪽(관전 채점 `information/spectateScore.ts`)이
   * 「내가 본 뒤로 규칙이 바뀌었나」를 물을 자리가 필요하다. `GameState`로는 알 수
   * 없다 — 증강 설치(`installAugment`)는 **상태를 갈지 않고 이 레지스트리만 바꾼다**.
   * 그래서 국 사이 드래프트 직후, 상태 객체가 그대로인 채 규칙만 달라지는 창이 실제로
   * 생기고, 상태를 키로 쓴 캐시는 **드래프트 이전 규칙으로 계산된 값**을 계속 내놓았다.
   */
  private ver = 0;

  /** 규칙 세대 (내용이 바뀔 때마다 증가). 캐시 무효화 전용. */
  get version(): number {
    return this.ver;
  }
  /**
   * source(증강 인스턴스) 게이트 — 무장해제용. false를 돌려주는 source의 Modifier는
   * 합성에서 제외된다(문맥별). null(기본)이면 전부 적용해 종전 동작과 완전히 동일하다.
   * GameEngine이 state.augmentData의 비활성 목록을 읽어 설정한다(리플레이 안전).
   */
  private sourceGate: ((source: string, ctx: RuleContext) => boolean) | null = null;

  /** 무장해제 게이트를 설정한다 (GameEngine 전용). null이면 게이팅 없음. */
  setSourceGate(gate: ((source: string, ctx: RuleContext) => boolean) | null): void {
    this.sourceGate = gate;
    this.ver++;
  }

  /** 기본값 정의. 이미 정의된 규칙을 다시 정의하는 것은 버그이므로 즉시 실패한다. */
  define<T>(key: RuleKey, baseValue: T): void {
    if (this.base.has(key)) {
      throw new Error(`Rule already defined: ${key}`);
    }
    this.base.set(key, baseValue);
    this.ver++;
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
    this.ver++;
  }

  /**
   * 이 규칙에 Modifier를 등록한 주체(증강 인스턴스 id) 목록.
   *
   * 관전 채점이 「이 좌석의 정산 보정을 내가 다 따라갔는가」를 판정하는 데 쓴다 —
   * `score.settleHanBonus`를 등록한 증강은 관전값에 그대로 반영되지만, 그러지 않고
   * `ROUND_SETTLED` 인터셉터만으로 점수를 고치는 증강은 관전 시점에 알 수 없다.
   * 그 차이를 화면이 «단정하지 않게» 하려면 어느 쪽인지 셀 수 있어야 한다.
   */
  modifierSources(key: RuleKey): string[] {
    return [...new Set((this.modifiers.get(key) ?? []).map((m) => m.source))];
  }

  /** 특정 주체(증강)가 등록한 모든 Modifier 제거. 증강 소멸·파괴 시 호출된다. */
  removeBySource(source: string): void {
    for (const [key, list] of this.modifiers) {
      const kept = list.filter((m) => m.source !== source);
      if (kept.length !== list.length) {
        this.modifiers.set(key, kept);
        this.ver++;
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
        // 무장해제로 비활성화된 source의 Modifier는 건너뛴다 (게이트 없으면 전부 적용)
        if (this.sourceGate !== null && !this.sourceGate(mod.source, ctx)) continue;
        value = mod.apply(value, ctx);
      }
    }
    return value as T;
  }

  /**
   * `resolve`와 같은 합성을 하되, **각 Modifier가 얼마를 움직였는지**를 함께 돌려준다.
   *
   * 결과 화면이 "증강 보너스 3판"이라고만 적던 자리를 증강별로 펼치기 위한 것이다.
   * `score.extraHan`은 여러 증강이 공유하는 합계라, 둘 이상 겹치면 어느 증강이 몇 판을
   * 얹었는지 알 방법이 없었다.
   *
   * 숫자 규칙 전용이다 — `delta`는 그 Modifier 전후의 차이이므로, 값이 숫자가 아니면
   * 의미가 없다. 합성 순서·게이트는 `resolve`와 완전히 같아 총합도 같다.
   */
  resolveBreakdown(
    key: RuleKey,
    ctx: RuleContext = {},
  ): { total: number; parts: { source: string; delta: number }[] } {
    if (!this.base.has(key)) {
      throw new Error(`Unknown rule: ${key}`);
    }
    const list = this.modifiers.get(key);
    let value = this.base.get(key);
    const parts: { source: string; delta: number }[] = [];
    if (list !== undefined && list.length > 0) {
      const sorted = [...list].sort(
        (a, b) => a.layer - b.layer || a.priority - b.priority || a.seq - b.seq,
      );
      for (const mod of sorted) {
        if (this.sourceGate !== null && !this.sourceGate(mod.source, ctx)) continue;
        const before = typeof value === "number" ? value : 0;
        value = mod.apply(value, ctx);
        const after = typeof value === "number" ? value : 0;
        if (after !== before) parts.push({ source: mod.source, delta: after - before });
      }
    }
    return { total: typeof value === "number" ? value : 0, parts };
  }
}
