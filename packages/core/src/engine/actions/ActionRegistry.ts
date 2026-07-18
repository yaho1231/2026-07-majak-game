/**
 * ActionRegistry — 플레이어 행동의 정의·검증.
 *
 * Action은 바깥 세계와 엔진의 유일한 접점이다. 상태를 바꾸지 않고,
 * 검증 후 루트 이벤트를 만들 뿐이다. validate/toEvents는 순수 함수여야 한다.
 *
 * 설계: docs/06_ACTION_SYSTEM.md
 */

import type { ProposedEvent } from "../events/GameEvent.js";
import type { RuleRegistry } from "../rules/RuleRegistry.js";
import type { GameState } from "../state/GameState.js";
import type { PlayerId } from "../zones/Zone.js";

export interface ActionRequest<TPayload = unknown> {
  player: PlayerId;
  type: string;
  payload: TPayload;
}

export interface ActionContext {
  state: GameState;
  rules: RuleRegistry;
}

export interface ActionDef<TPayload = unknown> {
  type: string;
  /** 합법이면 null, 불법이면 거부 사유 (클라이언트에 그대로 전달된다) */
  validate(request: ActionRequest<TPayload>, ctx: ActionContext): string | null;
  /** 합법 확정 후 이 행동이 만들어낼 루트 이벤트(들) */
  toEvents(request: ActionRequest<TPayload>, ctx: ActionContext): ProposedEvent[];
}

export class ActionRegistry {
  private readonly defs = new Map<string, ActionDef<unknown>>();

  register<TPayload>(def: ActionDef<TPayload>): void {
    if (this.defs.has(def.type)) {
      throw new Error(`Action already registered: ${def.type}`);
    }
    this.defs.set(def.type, def as unknown as ActionDef<unknown>);
  }

  get(type: string): ActionDef<unknown> | undefined {
    return this.defs.get(type);
  }

  has(type: string): boolean {
    return this.defs.has(type);
  }

  types(): string[] {
    return [...this.defs.keys()];
  }
}
