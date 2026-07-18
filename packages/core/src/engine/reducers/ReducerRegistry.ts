/**
 * ReducerRegistry — 이벤트 type → 상태 변경 함수의 등록·디스패치.
 *
 * 모든 이벤트 type은 Reducer가 등록되어 있어야 한다. 없으면 예외 →
 * Action 거부 (오타·등록 누락 조기 발견). 알림성 이벤트도 항등 Reducer를
 * 명시적으로 등록한다.
 *
 * 설계: docs/02_CORE_ENGINE.md §3
 */

import type { GameEvent } from "../events/GameEvent.js";
import type { GameState } from "../state/GameState.js";

export type EventReducer = (state: GameState, event: GameEvent) => GameState;

/** 상태 변경이 없는 알림성 이벤트용 */
export const identityReducer: EventReducer = (state) => state;

export class ReducerRegistry {
  private readonly reducers = new Map<string, EventReducer>();

  register(eventType: string, reducer: EventReducer): void {
    if (this.reducers.has(eventType)) {
      throw new Error(`Reducer already registered for event type: ${eventType}`);
    }
    this.reducers.set(eventType, reducer);
  }

  has(eventType: string): boolean {
    return this.reducers.has(eventType);
  }

  dispatch(state: GameState, event: GameEvent): GameState {
    const reducer = this.reducers.get(event.type);
    if (reducer === undefined) {
      throw new Error(`No reducer registered for event type: ${event.type}`);
    }
    return reducer(state, event);
  }
}
