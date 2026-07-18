/**
 * EffectRegistry — Event 훅(Interceptor/Reaction)의 등록·조회.
 *
 * 증강 능력의 실행 지점. 실행 순서는 RuleRegistry와 동일한
 * (layer, priority, 등록 순서) 결정론 규칙을 쓴다.
 *
 * 설계: docs/05_EFFECT_SYSTEM.md §1~2
 */

import type { GameEvent, ProposedEvent } from "../events/GameEvent.js";
import type { RuleLayer, RuleRegistry } from "../rules/RuleRegistry.js";

/** 상태 타입 S에 독립적 — Effect System은 게임 도메인을 모른다 */
export interface EffectContext<S> {
  state: S;
  rules: RuleRegistry;
}

export interface ReactionContext<S> extends EffectContext<S> {
  /** 후속 이벤트 제안. 큐 맨 뒤에 들어가며 depth+1, causedBy가 자동 기록된다 */
  emit(event: ProposedEvent): void;
}

/**
 * 적용 전 훅. 반환값:
 * - 같은 type의 이벤트 → 수정
 * - null → 취소 (뒤 순서 Interceptor는 실행되지 않음)
 * - 다른 type의 이벤트 → 대체 (파이프라인 재진입, depth+1)
 */
export type Interceptor<S> = (
  event: ProposedEvent,
  ctx: EffectContext<S>,
) => ProposedEvent | null;

/** 적용 후 훅. 되돌릴 수 없고, ctx.emit으로 새 이벤트를 제안할 수만 있다 */
export type Reaction<S> = (event: GameEvent, ctx: ReactionContext<S>) => void;

export interface EffectDef<S> {
  /** 등록 주체 (증강 인스턴스 id 등). 소멸 시 removeBySource로 일괄 제거 */
  source: string;
  layer: RuleLayer;
  priority?: number;
  /** 반응할 이벤트 type. "*" = 모든 이벤트 */
  on: string;
  intercept?: Interceptor<S>;
  react?: Reaction<S>;
}

interface StoredEffect<S> {
  source: string;
  layer: RuleLayer;
  priority: number;
  seq: number;
  on: string;
  intercept: Interceptor<S> | undefined;
  react: Reaction<S> | undefined;
}

export class EffectRegistry<S> {
  private readonly effects: StoredEffect<S>[] = [];
  private nextSeq = 0;

  register(effect: EffectDef<S>): void {
    if (effect.intercept === undefined && effect.react === undefined) {
      throw new Error(
        `Effect from "${effect.source}" must define intercept or react`,
      );
    }
    this.effects.push({
      source: effect.source,
      layer: effect.layer,
      priority: effect.priority ?? 0,
      seq: this.nextSeq++,
      on: effect.on,
      intercept: effect.intercept,
      react: effect.react,
    });
  }

  removeBySource(source: string): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      if (this.effects[i]?.source === source) this.effects.splice(i, 1);
    }
  }

  private matching(eventType: string): StoredEffect<S>[] {
    return this.effects
      .filter((e) => e.on === eventType || e.on === "*")
      .sort((a, b) => a.layer - b.layer || a.priority - b.priority || a.seq - b.seq);
  }

  interceptorsFor(
    eventType: string,
  ): { source: string; intercept: Interceptor<S> }[] {
    return this.matching(eventType).flatMap((e) =>
      e.intercept === undefined ? [] : [{ source: e.source, intercept: e.intercept }],
    );
  }

  reactionsFor(eventType: string): { source: string; react: Reaction<S> }[] {
    return this.matching(eventType).flatMap((e) =>
      e.react === undefined ? [] : [{ source: e.source, react: e.react }],
    );
  }
}
