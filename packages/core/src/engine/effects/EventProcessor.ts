/**
 * EventProcessor — 이벤트 처리 파이프라인의 "Event → Effect → State" 구간.
 *
 * 루트 이벤트 하나를 받아 Interceptor(수정/취소/대체) → Reducer 적용 →
 * Reaction(방출)을 큐가 빌 때까지 반복한다. 대체는 큐 맨 앞, 방출은 큐 맨 뒤.
 *
 * Issue 004(연쇄 폭주): maxChainDepth + maxEventsPerRoot 한도 초과 시 예외.
 * Reducer가 순수 함수이므로 호출자가 원본 상태를 유지하면 롤백은 공짜다.
 *
 * 훅 격리(docs/25 최우선#1): Interceptor·Reaction이 던지면 **그 source의 효과만**
 * 이번 이벤트에서 건너뛰고 나머지는 정상 진행한다. 격리가 없던 시절에는 증강
 * 하나의 예외가 액션 거부 → FlowController throw → 방 삭제로 이어져 4인 매치가
 * 통째로 사라졌다. 실패는 삼키지 않고 ProcessResult.failures로 올려보낸다.
 *
 * 한도 초과(위 두 가지)만은 여전히 throw다 — 폭주는 특정 source의 잘못이 아니라
 * 조합의 문제이고, 계속 진행하면 무한 루프가 되기 때문이다.
 *
 * Action → 루트 이벤트 변환과 lastEventSeq 관리는 Core Engine(02)의 몫이다.
 *
 * 설계: docs/05_EFFECT_SYSTEM.md §3~4
 */

import type { GameEvent, ProposedEvent } from "../events/GameEvent.js";
import type { RuleRegistry } from "../rules/RuleRegistry.js";
import { EffectRegistry } from "./EffectRegistry.js";

export interface ProcessorOptions<S = unknown> {
  /** 세로 연쇄(A→B→A…) 한도. 대체 포함 매 홉마다 depth+1 */
  maxChainDepth?: number;
  /** 루트 이벤트 하나가 만들 수 있는 이벤트 총량 (가로 폭발 방지) */
  maxEventsPerRoot?: number;
  /**
   * source(증강 인스턴스)의 Interceptor·Reaction을 상태에 따라 무효화하는 게이트 (무장해제).
   * false를 돌려주는 source의 효과는 이 이벤트 처리에서 건너뛴다. 생략(기본)이면 전부 적용해
   * 종전 동작과 완전히 동일하다. GameEngine이 state.augmentData의 비활성 목록을 읽어 설정한다.
   */
  isSourceEnabled?: (source: string, state: S) => boolean;
  /**
   * Interceptor·Reaction이 던졌을 때 호출된다 (격리 후, 진행은 계속된다).
   * 서버 로깅용 — 게임 진행에 영향을 주면 안 되고, 여기서 던지면 그 예외는 무시된다.
   */
  onEffectError?: (failure: EffectFailure) => void;
}

/** 격리된 훅 실패 1건 — 그 source의 효과만 이번 이벤트에서 빠졌다는 기록 */
export interface EffectFailure {
  /** 실패한 Effect의 source (증강 인스턴스 id) */
  source: string;
  phase: "intercept" | "react";
  /** 실패 시점에 처리 중이던 이벤트 type */
  eventType: string;
  message: string;
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
  /** 던져서 이번 이벤트에서 격리된 훅들 (없으면 빈 배열) */
  failures: EffectFailure[];
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
  private readonly isSourceEnabled: (source: string, state: S) => boolean;
  private readonly onEffectError: ((failure: EffectFailure) => void) | undefined;

  constructor(
    private readonly effects: EffectRegistry<S>,
    private readonly reducer: Reducer<S>,
    options: ProcessorOptions<S> = {},
  ) {
    this.maxChainDepth = options.maxChainDepth ?? DEFAULT_MAX_CHAIN_DEPTH;
    this.maxEventsPerRoot = options.maxEventsPerRoot ?? DEFAULT_MAX_EVENTS_PER_ROOT;
    this.isSourceEnabled = options.isSourceEnabled ?? (() => true);
    this.onEffectError = options.onEffectError;
  }

  /** 격리된 실패를 기록한다. 로깅 콜백이 던져도 게임 진행에는 영향이 없다 */
  private recordFailure(into: EffectFailure[], failure: EffectFailure): void {
    into.push(failure);
    try {
      this.onEffectError?.(failure);
    } catch {
      /* 로깅 실패가 게임을 멈춰선 안 된다 */
    }
  }

  /**
   * @param lastSeq 마지막으로 사용된 이벤트 seq — 확정 이벤트는 lastSeq+1부터 번호를 받는다
   * @throws 한도 초과 시에만. 호출자는 원본 상태를 유지해 Action을 거부한다.
   *         훅 내부 예외는 던지지 않고 격리해 ProcessResult.failures로 돌려준다.
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
    const failures: EffectFailure[] = [];
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
        // 무장해제로 비활성화된 source의 Interceptor는 건너뛴다
        if (!this.isSourceEnabled(source, state)) continue;
        // 격리: 던진 Interceptor는 "아무것도 하지 않은 것"으로 취급하고 draft를 그대로 넘긴다
        let result: ProposedEvent | null;
        try {
          result = intercept(draft, { state, rules });
        } catch (error) {
          this.recordFailure(failures, {
            source,
            phase: "intercept",
            eventType: draft.type,
            message: error instanceof Error ? error.message : String(error),
          });
          continue;
        }
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
      for (const { source, react } of this.effects.reactionsFor(confirmed.type)) {
        // 무장해제로 비활성화된 source의 Reaction은 건너뛴다
        if (!this.isSourceEnabled(source, state)) continue;
        // 격리: emit을 일단 버퍼에 모았다가 react가 정상 반환했을 때만 큐에 넣는다.
        // 2개를 emit하고 3번째에서 던진 Reaction이 "절반만 실행된" 상태를 남기지 않도록
        // source 단위로 all-or-nothing을 보장한다.
        const emitted: PendingEvent[] = [];
        try {
          react(confirmed, {
            state,
            rules,
            emit: (e) => {
              emitted.push({ event: e, depth: item.depth + 1, causedBy: confirmed.seq });
            },
          });
        } catch (error) {
          this.recordFailure(failures, {
            source,
            phase: "react",
            eventType: confirmed.type,
            message: error instanceof Error ? error.message : String(error),
          });
          continue; // emitted 폐기
        }
        queue.push(...emitted);
      }
    }

    return { state, events, canceled, failures };
  }
}
