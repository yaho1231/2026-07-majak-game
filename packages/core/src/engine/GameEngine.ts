/**
 * GameEngine — 파이프라인 전체를 하나로 꿰는 실행기.
 *
 * ActionRequest 접수 → ActionDef 검증 → 루트 이벤트 → EventProcessor
 * → 성공 시에만 새 상태 채택 (Action = 트랜잭션).
 *
 * 엔진은 규칙도 마작도 모른다 — 4개 Registry에 등록된 것을 순서대로 실행할 뿐이다.
 *
 * 설계: docs/02_CORE_ENGINE.md
 */

import { ActionRegistry } from "./actions/ActionRegistry.js";
import type { ActionRequest } from "./actions/ActionRegistry.js";
import { EffectRegistry } from "./effects/EffectRegistry.js";
import { EventProcessor } from "./effects/EventProcessor.js";
import type {
  CanceledEvent,
  EffectFailure,
  ProcessorOptions,
} from "./effects/EventProcessor.js";
import type { GameEvent } from "./events/GameEvent.js";
import { ReducerRegistry } from "./reducers/ReducerRegistry.js";
import { RuleRegistry } from "./rules/RuleRegistry.js";
import { ROUND_SCOPED_MARK } from "./state/GameState.js";
import type { GameState } from "./state/GameState.js";
import type { PlayerId } from "./zones/Zone.js";

/** 증강이 턴 프롬프트에 추가 선택지를 제안하기 위한 후보 (validate가 최종 판정) */
export interface ActionCandidate {
  type: string;
  payload: unknown;
}

/**
 * 턴 플레이어에게 제시할 추가 액션 후보를 만드는 프로바이더.
 * 증강이 새 플레이어 액션(예: 버림패 회수)을 프롬프트에 노출할 때 등록한다.
 * 반환한 후보는 FlowController가 validate로 다시 걸러 합법인 것만 제시한다.
 */
export type TurnOptionProvider = (
  state: GameState,
  player: PlayerId,
) => ActionCandidate[];

/**
 * 리액션(후로) 프롬프트 확장 — 다른 사람의 버림패에 반응하는 후보를 낸다.
 * discard는 반응 대상(버린 사람·패). 반환 후보는 FlowController가 validate로 거른다.
 */
export type ReactionOptionProvider = (
  state: GameState,
  player: PlayerId,
  discard: { player: PlayerId; tileId: import("../mahjong/tiles/Tile.js").TileId },
) => ActionCandidate[];

export interface EngineOptions {
  state: GameState;
  rules?: RuleRegistry;
  effects?: EffectRegistry<GameState>;
  actions?: ActionRegistry;
  reducers?: ReducerRegistry;
  processor?: ProcessorOptions;
  /**
   * 이어하기(resume) 재구성용 — 엔진 로그를 과거 확정 이벤트로 미리 채운다.
   * 이후 submit이 새 이벤트를 append하며, 리플레이 파일에는 새 이벤트만 덧붙는다.
   */
  log?: readonly GameEvent[];
}

export type SubmitResult =
  | { ok: true; events: GameEvent[]; canceled: CanceledEvent[]; failures: EffectFailure[] }
  | { ok: false; reason: string };

/**
 * 무장해제로 이번 국 비활성화된 증강 인스턴스(source) 목록 — state.augmentData에 담긴다
 * (리플레이 안전).
 *
 * **국 스코프 키**다 — 국 경계에서 `setupRound`가 지운다. 예전에는 무장해제 증강이
 * 자기 리액션으로 직접 비웠는데, 그 리액션의 source가 자기 자신이라 **무장해제로
 * 무장해제를 잠그면 해제 코드가 게이트에 막혀 영영 돌지 않았다** — 지목당한 증강이
 * 매치 끝까지 잠기고, 잠근 쪽의 "이번 국 이미 씀" 플래그도 영원히 안 풀렸다
 * (docs/25 방해 #1). 정리를 엔진이 하면 게이트와 무관해진다.
 */
export const DISARMED_SOURCES_KEY = `engine:disarmed${ROUND_SCOPED_MARK}`;

/**
 * source가 이번 국 무장해제로 비활성화됐는가. 목록이 비면 즉시 false(핫패스 무할당).
 *
 * 규칙 Modifier·Interceptor·Reaction뿐 아니라 **액티브 버튼(holderTurnOptions)** 도
 * 이 판정으로 잠긴다 — installAugment가 후보 생성을 이 함수로 감싼다.
 * "규칙형 증강만 잠기고 액션형은 멀쩡하다"던 예전 한계를 없앤 지점이다.
 */
export function isSourceDisarmed(state: GameState, source: string): boolean {
  const v = state.augmentData[DISARMED_SOURCES_KEY];
  return Array.isArray(v) && v.length > 0 && (v as string[]).includes(source);
}

export class GameEngine {
  readonly rules: RuleRegistry;
  readonly effects: EffectRegistry<GameState>;
  readonly actions: ActionRegistry;
  readonly reducers: ReducerRegistry;

  private readonly processor: EventProcessor<GameState>;
  private currentState: GameState;
  private readonly log: GameEvent[] = [];
  /**
   * 옵션 프로바이더는 **누가 등록했는지**(증강 인스턴스 id)를 함께 들고 있는다.
   * 없으면 증강을 파괴해도 액티브 버튼을 낼 프로바이더가 그대로 남는다
   * (docs/25 시스템 횡단 #7 — uninstallAugment가 절반만 제거하던 원인).
   */
  private readonly turnProviders: { source?: string; provider: TurnOptionProvider }[] = [];
  private readonly reactionProviders: {
    source?: string;
    provider: ReactionOptionProvider;
  }[] = [];
  /** 증강 인스턴스 id → 파괴 시 실행할 정리 훅 */
  private readonly uninstallHooks = new Map<string, (() => void)[]>();

  constructor(options: EngineOptions) {
    this.currentState = options.state;
    this.rules = options.rules ?? new RuleRegistry();
    this.effects = options.effects ?? new EffectRegistry<GameState>();
    this.actions = options.actions ?? new ActionRegistry();
    this.reducers = options.reducers ?? new ReducerRegistry();
    this.processor = new EventProcessor<GameState>(
      this.effects,
      (state, event) => this.reducers.dispatch(state, event),
      {
        ...(options.processor ?? {}),
        // 무장해제: 비활성 source의 Interceptor·Reaction을 건너뛴다 (비면 no-op)
        isSourceEnabled: (source, state) => !isSourceDisarmed(state, source),
      },
    );
    // 무장해제: 비활성 source의 Rule Modifier를 합성에서 제외.
    //
    // ctx.state가 없으면 엔진의 현재 상태로 판정한다. 예전에는 state가 없을 때
    // 무조건 통과시켰는데, state를 안 넘기고 resolve하는 호출부가 core+content에
    // 17곳이라 그 규칙들이 **무장해제로 절대 잠기지 않았다** (docs/25 최우선#3).
    // 대표 사례가 표준 증강 open_riichi — 무장해제해도 후로한 손으로 리치가 됐다.
    //
    // 무장해제 목록은 국 경계에서만 바뀌므로, submit 처리 중(아직 currentState가
    // 커밋되기 전)의 폴백도 같은 국 안에서는 정확하다. 정확성이 필요한 호출부는
    // 종전대로 ctx.state를 넘기면 그쪽이 우선한다.
    this.rules.setSourceGate((source, ctx) => {
      const st = (ctx.state as GameState | undefined) ?? this.currentState;
      return !isSourceDisarmed(st, source);
    });
    if (options.log !== undefined) this.log.push(...options.log);
  }

  get state(): GameState {
    return this.currentState;
  }

  /** 증강이 턴 프롬프트 확장을 등록한다 (콘텐츠 등록 지점) */
  registerTurnOptions(provider: TurnOptionProvider, source?: string): void {
    this.turnProviders.push({ provider, ...(source !== undefined ? { source } : {}) });
  }

  /** FlowController가 턴 프롬프트를 만들 때 읽는다 */
  get turnOptionProviders(): readonly TurnOptionProvider[] {
    return this.turnProviders.map((e) => e.provider);
  }

  /** 증강이 리액션(후로) 프롬프트 확장을 등록한다 (콘텐츠 등록 지점) */
  registerReactionOptions(provider: ReactionOptionProvider, source?: string): void {
    this.reactionProviders.push({ provider, ...(source !== undefined ? { source } : {}) });
  }

  /** 증강 파괴(uninstallAugment) 시 그 인스턴스가 등록한 옵션 프로바이더를 걷어낸다 */
  removeOptionProvidersBySource(source: string): void {
    const drop = (list: { source?: string }[]): void => {
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i]?.source === source) list.splice(i, 1);
      }
    };
    drop(this.turnProviders);
    drop(this.reactionProviders);
  }

  /**
   * 증강이 스스로 등록하는 정리 훅 — uninstallAugment가 그 인스턴스의 훅을 전부 부른다.
   *
   * 코어가 모르는 곳(콘텐츠의 커스텀 역 보유자 집합 등)에 심어 둔 것을 걷어내는 통로다.
   * 코어가 소유한 것(규칙·효과·옵션 프로바이더)은 여기 쓰지 않아도 자동으로 지워진다.
   */
  registerUninstallHook(source: string, cleanup: () => void): void {
    const list = this.uninstallHooks.get(source);
    if (list === undefined) this.uninstallHooks.set(source, [cleanup]);
    else list.push(cleanup);
  }

  /** 해당 인스턴스의 정리 훅을 실행하고 목록을 비운다 (두 번 불러도 한 번만 돈다) */
  runUninstallHooks(source: string): void {
    const list = this.uninstallHooks.get(source);
    if (list === undefined) return;
    this.uninstallHooks.delete(source);
    for (const fn of list) fn();
  }

  /** FlowController가 리액션 프롬프트를 만들 때 읽는다 */
  get reactionOptionProviders(): readonly ReactionOptionProvider[] {
    return this.reactionProviders.map((e) => e.provider);
  }

  /** append-only. 초기 상태(시드 포함) + 이 로그 = 리플레이 */
  get eventLog(): readonly GameEvent[] {
    return this.log;
  }

  /**
   * 요청 하나의 일생. 거부(정상 흐름)든 예외(버그·폭주)든
   * 실패 시 상태는 조금도 변하지 않는다.
   */
  submit(request: ActionRequest): SubmitResult {
    const def = this.actions.get(request.type);
    if (def === undefined) {
      return { ok: false, reason: `Unknown action: ${request.type}` };
    }

    try {
      const ctx = { state: this.currentState, rules: this.rules };

      const reason = def.validate(request, ctx);
      if (reason !== null) {
        return { ok: false, reason };
      }

      const roots = def.toEvents(request, ctx);

      let state = this.currentState;
      let lastSeq = state.lastEventSeq;
      const events: GameEvent[] = [];
      const canceled: CanceledEvent[] = [];
      const failures: EffectFailure[] = [];

      for (const root of roots) {
        const result = this.processor.process(state, this.rules, root, lastSeq);
        state = result.state;
        events.push(...result.events);
        canceled.push(...result.canceled);
        failures.push(...result.failures);
        const last = result.events[result.events.length - 1];
        if (last !== undefined) lastSeq = last.seq;
      }

      // 성공했을 때만 새 상태 채택 (트랜잭션)
      this.currentState = { ...state, lastEventSeq: lastSeq };
      this.log.push(...events);
      return { ok: true, events, canceled, failures };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, reason: `Action failed: ${message}` };
    }
  }
}
