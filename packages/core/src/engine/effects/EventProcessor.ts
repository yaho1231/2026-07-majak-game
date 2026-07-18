/**
 * EventProcessor — 이벤트 처리 파이프라인의 "Event → Effect → State" 구간.
 *
 * 루트 이벤트 하나를 받아 Interceptor(수정/취소/대체) → Reducer 적용 →
 * Reaction(방출)을 큐가 빌 때까지 반복한다. 대체는 큐 맨 앞, 방출은 큐 맨 뒤.
 *
 * Issue 004(연쇄 폭주): maxChainDepth + maxEventsPerRoot 한도 초과 시 예외.
 * Reducer가 순수 함수이므로 호출자가 원본 상태를 유지하면 롤백은 공짜다.
 *
 * Action → 루트 이벤트 변환과 lastEventSeq 관리는 Core Engine(02)의 몫이다.
 *
 * 설계: docs/05_EFFECT_SYSTEM.md §3~4
 */

import type { GameEvent, ProposedEvent } from "../events/GameEvent.js";
import type { RuleRegistry } from "../rules/RuleRegistry.js";
import { EffectRegistry } from "./EffectRegistry.js";

export interface ProcessorOptions {
  /** 세로 연쇄(A→B→A…) 한도. 대체 포함 매 홉마다 depth+1 */
  maxChainDepth?: number;
  /** 루트 이벤트 하나가 만들 수 있는 이벤트 총량 (가로 폭발 방지) */
  maxEventsPerRoot?: number;
}

export interface CanceledEvent {
  event: ProposedEvent;
  /** 취소·대체한 Effect의 source */
  by: string;
  reason: "canceled" | "replaced";
}

export interface ProcessResult<S> {
  state: S;
  /** 확정·적용된 이벤트, 적용 순서대로. 이 배열이 Event Log에 이어 붙는다 */
  events: GameEvent[];
  /** 취소·대체된 제안들 (디버깅·UI 알림용) */
  canceled: CanceledEvent[];
}

export type Reducer<S> = (state: S, event: GameEvent) => S;

interface PendingEvent {
  event: ProposedEvent;
  depth: number;
  causedBy: number | undefined;
}

export const DEFAULT_MAX_CHAIN_DEPTH = 16;
export const DEFAULT_MAX_EVENTS_PER_ROOT = 128;

export class EventProcessor<S> {
  private readonly maxChainDepth: number;
  private readonly maxEventsPerRoot: number;

  constructor(
    private readonly effects: EffectRegistry<S>,
    private readonly reducer: Reducer<S>,
    options: ProcessorOptions = {},
  ) {
    this.maxChainDepth = options.maxChainDepth ?? DEFAULT_MAX_CHAIN_DEPTH;
    this.maxEventsPerRoot = options.maxEventsPerRoot ?? DEFAULT_MAX_EVENTS_PER_ROOT;
  }

  /**
   * @param lastSeq 마지막으로 사용된 이벤트 seq — 확정 이벤트는 lastSeq+1부터 번호를 받는다
   * @throws 한도 초과·훅 내부 예외 시. 호출자는 원본 상태를 유지해 Action을 거부한다
   */
  process(
    state: S,
    rules: RuleRegistry,
    root: ProposedEvent,
    lastSeq: number,
  ): ProcessResult<S> {
    const queue: PendingEvent[] = [{ event: root, depth: 0, causedBy: undefined }];
    const events: GameEvent[] = [];
    const canceled: CanceledEvent[] = [];
    let nextSeq = lastSeq + 1;
    let processedCount = 0;

    while (queue.length > 0) {
      const item = queue.shift() as PendingEvent;

      processedCount++;
      if (processedCount > this.maxEventsPerRoot) {
        throw new Error(
          `Event cascade exceeded maxEventsPerRoot (${this.maxEventsPerRoot}) — runaway augment combo?`,
        );
      }
      if (item.depth > this.maxChainDepth) {
        throw new Error(
          `Event chain exceeded maxChainDepth (${this.maxChainDepth}) — runaway augment combo?`,
        );
      }

      // ── Interceptor: 수정 / 취소 / 대체 ──
      let draft = item.event;
      let dropped = false;
      for (const { source, intercept } of this.effects.interceptorsFor(draft.type)) {
        const result = intercept(draft, { state, rules });
        if (result === null) {
          canceled.push({ event: draft, by: source, reason: "canceled" });
          dropped = true;
          break;
        }
        if (result.type !== draft.type) {
          // 대체: 원본의 자리를 이어받도록 큐 맨 앞에서 재진입
          canceled.push({ event: draft, by: source, reason: "replaced" });
          queue.unshift({ event: result, depth: item.depth + 1, causedBy: item.causedBy });
          dropped = true;
          break;
        }
        draft = result;
      }
      if (dropped) continue;

      // ── 확정 → Reducer 적용 → 기록 ──
      const confirmed: GameEvent =
        item.causedBy === undefined
          ? { seq: nextSeq++, type: draft.type, payload: draft.payload }
          : { seq: nextSeq++, type: draft.type, payload: draft.payload, causedBy: item.causedBy };
      state = this.reducer(state, confirmed);
      events.push(confirmed);

      // ── Reaction: 방출은 큐 맨 뒤 (너비 우선) ──
      for (const { react } of this.effects.reactionsFor(confirmed.type)) {
        react(confirmed, {
          state,
          rules,
          emit: (e) => {
            queue.push({ event: e, depth: item.depth + 1, causedBy: confirmed.seq });
          },
        });
      }
    }

    return { state, events, canceled };
  }
}
