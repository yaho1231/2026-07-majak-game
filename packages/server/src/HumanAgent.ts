/**
 * HumanAgent — WebSocket 소켓에 연결된 사람 플레이어.
 *
 * decide() 호출 시 DecisionPrompt를 소켓으로 전송하고
 * 클라이언트 응답을 Promise로 기다린다.
 * 타임아웃(기본 30초) 초과 시 첫 번째 옵션으로 자동 선택.
 *
 * 설계: docs/12_NETWORK_REPLAY.md §3
 */

import type { WebSocket } from "ws";
import type { PlayerAgent } from "@majak/core/match/PlayerAgent.js";
import type { PlayerView } from "@majak/core/information/PlayerView.js";
import type { ActionOption, DecisionPrompt } from "@majak/core/mahjong/flow/FlowController.js";
import type { AugmentDef } from "@majak/core/augment/Augment.js";
import type { DraftStage, ServerMessage, ClientMessage } from "@majak/core/network/protocol.js";
import type { PlayerId } from "@majak/core/engine/zones/Zone.js";
import { TIME_PRESSURE_CHANNEL } from "@majak/content";

export const DECISION_TIMEOUT_MS = 30_000;

/**
 * **반드시 끝맺어야 하는 다단계 선택**의 액션 타입.
 *
 * 등가교환은 대상을 지정하는 순간 상대 손패가 공개된다 — 거기서 빠져나올 길이 있으면
 * "정보만 챙기고 교환은 안 한다"가 성립해 버린다. 그래서 클라이언트에서 닫기 버튼을
 * 없앴고(2026-08-02 사용자 지시), 시간이 다 되면 여기서 **남은 조합 중 무작위로**
 * 하나를 골라 교환을 끝낸다 — 패스하거나 그냥 버려서 능력을 흘리지 않는다.
 */
const FORCED_ACTION_TYPES = new Set(["swap3_give", "swap3_take"]);

/**
 * 타임아웃/접속 끊김 시 안전한 폴백 선택.
 * 절대 능동적 선언(론·펑·치·깡·리치)을 하지 않는다:
 * 강제 마무리 선택 > 패스 > 마지막 버림 옵션(쯔모기리에 해당) > 첫 옵션 순.
 */
export function safeFallbackOption(options: ActionOption[]): ActionOption {
  // 되돌릴 수 없는 발동의 마무리 단계 — 무작위로라도 끝맺는다
  const forced = options.filter((o) => FORCED_ACTION_TYPES.has(o.type));
  if (forced.length > 0) {
    return forced[Math.floor(Math.random() * forced.length)]!;
  }
  const pass = options.find((o) => o.type === "pass");
  if (pass !== undefined) return pass;
  const discards = options.filter((o) => o.type === "discard");
  const last = discards[discards.length - 1];
  if (last !== undefined) return last;
  return options[0]!;
}

type ResolveDecision = (option: ActionOption) => void;
type ResolveDraft = (id: string) => void;

/** 좌석 하나에 대해 응답을 기다리는 중인 결정 */
interface PendingDecision {
  prompt: DecisionPrompt;
  resolve: ResolveDecision;
  timer: ReturnType<typeof setTimeout>;
}

export class HumanAgent implements PlayerAgent {
  readonly id: PlayerId;
  readonly nickname: string;
  readonly isBot = false;

  /**
   * 응답을 기다리는 결정들 — **좌석 id → 대기**.
   *
   * 평소에는 본인 좌석 하나뿐이지만, 증강 테스트에서 봇 좌석을 조종하면 내 좌석과
   * 그 봇 좌석에 리액션 프롬프트가 **동시에** 뜰 수 있다. 그래서 단일 슬롯이 아니라
   * 좌석별로 들고, 클라이언트 응답의 `seat`으로 짝을 맞춘다.
   */
  private readonly pending = new Map<PlayerId, PendingDecision>();
  private pendingDraft: ResolveDraft | null = null;
  private pendingDraftChoices: AugmentDef[] | null = null;
  private pendingDraftStage: DraftStage | null = null;
  private draftTimeout: ReturnType<typeof setTimeout> | null = null;
  /** 국 사이 "다음 국으로" 대기 resolver (결과 화면 닫힘 신호 대기) */
  private pendingContinue: (() => void) | null = null;
  private continueTimeout: ReturnType<typeof setTimeout> | null = null;
  /** 게임 중 포기(중도 이탈) — 이후 모든 결정을 즉시 안전 폴백으로 자동 처리한다 */
  private abandoned = false;
  /** 재접속 시 즉시 복원해 줄 마지막 뷰 */
  private lastView: PlayerView | null = null;
  /**
   * 증강 테스트 시점 전환 — 이 좌석(또는 SPECTATOR_ID) 시점으로 뷰를 받는다.
   * null이면 본인 좌석 기준(평소). 관찰 전용이며 결정(decide)에는 영향이 없다.
   */
  private viewSeat: PlayerId | null = null;
  /** 재접속 시 재전송할 증강 카탈로그 */
  private lastCatalog: ServerMessage | null = null;

  constructor(
    id: PlayerId,
    nickname: string,
    private ws: WebSocket,
  ) {
    this.id = id;
    this.nickname = nickname;
  }

  /**
   * 소켓 교체 (재접속) 후 현재 게임 상태를 즉시 복원 전송한다.
   * - 마지막 PlayerView
   * - 응답 대기 중이던 프롬프트/드래프트 (있으면 재전송해 진행이 막히지 않게)
   */
  reconnect(ws: WebSocket, afterAttach?: () => void): void {
    this.ws = ws;
    // 소켓을 붙인 뒤, 뷰·프롬프트를 복원하기 **전에** 호출자가 끼워 넣는 훅.
    // 증강 테스트에서 sandbox 상태 메시지를 여기서 보내야 한다 — 그 메시지는
    // 클라이언트에서 프롬프트·결과를 초기화하므로, 복원 전송보다 먼저 나가야
    // 복원된 프롬프트가 지워지지 않는다.
    afterAttach?.();
    if (this.lastCatalog !== null) {
      this.send(this.lastCatalog);
    }
    if (this.lastView !== null) {
      this.send({ type: "view", view: this.lastView });
    }
    if (this.pending.size > 0) {
      // 대기 중인 프롬프트 전부 재전송 — 봇 좌석 조종 중이면 두 자리가 동시에 떠 있다
      for (const p of this.pending.values()) this.send({ type: "prompt", prompt: p.prompt });
    } else if (this.pendingDraft !== null && this.pendingDraftChoices !== null) {
      this.send({
        type: "draftOffer",
        stage: this.pendingDraftStage ?? "gameStart",
        choices: this.pendingDraftChoices.map((c) => ({
          id: c.id,
          tier: c.tier,
          name: c.name,
          description: c.description,
        })),
        deadlineMs: DECISION_TIMEOUT_MS,
      });
    }
  }

  /** 주어진 소켓이 이 에이전트의 현재 소켓인지 (재접속으로 교체됐는지 판별). */
  isSocket(ws: WebSocket): boolean {
    return this.ws === ws;
  }

  /**
   * 이 좌석의 소켓이 지금 살아 있는지.
   *
   * 대기실에는 재접속 개념이 없다(끊기면 그 자리에서 빠진다) — 그래서 대기 중인 방에
   * 소켓이 닫힌 사람 좌석이 남아 있다면 그건 전부 유령이다. 게임 중에 끊긴 채로
   * 종국을 맞은 좌석이 여기로 흘러들며, RoomManager가 이 값으로 걷어낸다.
   */
  isConnected(): boolean {
    return this.ws.readyState === 1 /* OPEN */;
  }

  /** 이 플레이어가 게임을 포기했는지 (좌석은 남되 봇처럼 자동 진행). */
  get isAbandoned(): boolean {
    return this.abandoned;
  }

  /**
   * 게임 중 포기 — 좌석은 유지하되 이후 결정을 봇처럼 즉시 자동 처리한다.
   * 대기 중이던 결정/드래프트가 있으면 지금 바로 안전 폴백으로 해소해
   * 남은 사람들의 게임이 30초 타임아웃마다 멈추지 않게 한다.
   */
  abandon(): void {
    if (this.abandoned) return;
    this.abandoned = true;
    // 국 사이 대기 중이었다면 즉시 해소 (봇처럼 다음 국으로 넘어가게)
    if (this.pendingContinue !== null) this.resolveContinue();
    for (const seat of [...this.pending.keys()]) this.cancelDecisionFor(seat);
    if (this.pendingDraft !== null && this.pendingDraftChoices !== null) {
      const resolve = this.pendingDraft;
      const firstId = this.pendingDraftChoices[0]!.id;
      this.clearDraftTimeout();
      this.pendingDraft = null;
      this.pendingDraftChoices = null;
      this.pendingDraftStage = null;
      resolve(firstId);
    }
  }

  /**
   * 같은 좌석으로 새 판을 시작하기 전 정리 (증강 테스트 초기화 전용).
   * 이전 판의 컨트롤러는 이미 무효 종료돼 결정을 기다리지 않으므로, 대기 중이던
   * resolver·타이머를 resolve 없이 버린다. 남겨 두면 지난 판의 타임아웃이 뒤늦게
   * 터지거나, 클라이언트의 늦은 응답이 폐기된 프롬프트에 매칭된다.
   */
  resetForNewGame(): void {
    for (const p of this.pending.values()) clearTimeout(p.timer);
    this.pending.clear();
    this.clearDraftTimeout();
    if (this.continueTimeout !== null) {
      clearTimeout(this.continueTimeout);
      this.continueTimeout = null;
    }
    this.pendingDraft = null;
    this.pendingDraftChoices = null;
    this.pendingDraftStage = null;
    this.pendingContinue = null;
    this.lastView = null;
    this.viewSeat = null; // 새 판은 본인 시점에서 시작
  }

  sendView(view: PlayerView): void {
    this.lastView = view;
    this.send({ type: "view", view });
  }

  /**
   * 증강 테스트 관찰 시점을 지정한다 (본인 좌석 id면 원래 시점으로 복귀).
   * 컨트롤러가 broadcastViews·resendViewTo에서 viewSeatOverride를 통해 참조한다.
   */
  setViewSeat(seat: PlayerId | null): void {
    this.viewSeat = seat;
  }

  /** 현재 관찰 시점 (본인 좌석 기준이면 null). */
  get viewSeatId(): PlayerId | null {
    return this.viewSeat;
  }

  viewSeatOverride(): PlayerId | null {
    return this.viewSeat;
  }

  /** 서버 → 클라이언트 임의 메시지 전송 (catalog·roundOver·gameOver) */
  notify(msg: ServerMessage): void {
    if (msg.type === "catalog") this.lastCatalog = msg;
    this.send(msg);
  }

  decide(prompt: DecisionPrompt): Promise<ActionOption> {
    return this.decideFor(this.id, prompt);
  }

  /**
   * **다른 좌석의 결정을 대신 받는다** (증강 테스트의 봇 좌석 조종 전용).
   * 프롬프트를 그대로 내 소켓으로 보내고, 클라이언트는 `action.seat`에 그 좌석을
   * 실어 답한다. 내 좌석 결정과 동시에 떠 있어도 서로 섞이지 않는다.
   */
  decideAs(seat: PlayerId, prompt: DecisionPrompt): Promise<ActionOption> {
    return this.decideFor(seat, prompt);
  }

  /**
   * 이 결정의 제한 시간(ms).
   *
   * 평소에는 AFK 방지용 30초지만, **초읽기(time_pressure)**가 걸린 국에는 그 증강이
   * 뷰에 실어 보낸 초를 그대로 쓴다. 제한 시간은 게임 규칙이 아니라 접속·진행의
   * 문제라 엔진이 아니라 여기서 다룬다 — 증강 쪽은 공개 채널에 숫자 하나만 싣는다.
   * 국이 끝나면 채널이 국 스코프로 자동 소멸해 30초로 돌아온다.
   */
  private decisionTimeoutMs(): number {
    const limit = this.lastView?.augmentView?.[TIME_PRESSURE_CHANNEL];
    if (typeof limit !== "number" || limit <= 0) return DECISION_TIMEOUT_MS;
    return Math.min(DECISION_TIMEOUT_MS, Math.round(limit * 1000));
  }

  private decideFor(seat: PlayerId, prompt: DecisionPrompt): Promise<ActionOption> {
    if (this.abandoned) return Promise.resolve(safeFallbackOption(prompt.options));
    // 같은 좌석에 이전 대기가 남아 있으면(정상 흐름에는 없다) 폴백으로 정리한다
    this.cancelDecisionFor(seat);
    const timeoutMs = this.decisionTimeoutMs();
    // 초읽기가 걸린 국에만 마감을 실어 보낸다 — 클라이언트가 카운트다운을 그린다.
    this.send(
      timeoutMs < DECISION_TIMEOUT_MS
        ? { type: "prompt", prompt, deadlineMs: timeoutMs }
        : { type: "prompt", prompt },
    );
    return new Promise<ActionOption>((resolve) => {
      const timer = setTimeout(() => {
        // 제한 시간 초과 — 서버는 안전 폴백으로 진행한다. 클라이언트가 이걸 모르면
        // 내 차례가 지나간 뒤에도 선택 모달·버튼이 계속 떠 있으므로 취소를 알린다.
        this.pending.delete(seat);
        this.send({ type: "promptCancel", seat });
        resolve(safeFallbackOption(prompt.options));
      }, timeoutMs);
      this.pending.set(seat, { prompt, resolve, timer });
    });
  }

  /**
   * 대기 중인 결정을 지금 안전 폴백(패스)으로 끝낸다 — 우선순위가 더 높은 선언이
   * 이미 확정돼 이 선택이 결과를 바꿀 수 없을 때 컨트롤러가 부른다.
   * 클라이언트에는 취소를 알려 버튼·모달이 남지 않게 한다.
   */
  cancelDecision(): void {
    this.cancelDecisionFor(this.id);
  }

  /** 특정 좌석의 대기 결정만 폴백으로 끝낸다 (봇 좌석 조종 해제·취소용). */
  cancelDecisionFor(seat: PlayerId): void {
    const p = this.pending.get(seat);
    if (p === undefined) return;
    clearTimeout(p.timer);
    this.pending.delete(seat);
    this.send({ type: "promptCancel", seat });
    p.resolve(safeFallbackOption(p.prompt.options));
  }

  /** 이 좌석의 결정을 지금 기다리고 있는가 (조종 해제 시 판별용). */
  hasPendingFor(seat: PlayerId): boolean {
    return this.pending.has(seat);
  }

  async decideDraft(stage: DraftStage, choices: AugmentDef[]): Promise<string> {
    if (this.abandoned) return choices[0]!.id;
    this.pendingDraftChoices = choices;
    this.pendingDraftStage = stage;
    this.send({
      type: "draftOffer",
      stage,
      choices: choices.map((c) => ({
        id: c.id,
        tier: c.tier,
        name: c.name,
        description: c.description,
      })),
      deadlineMs: DECISION_TIMEOUT_MS,
    });

    return new Promise<string>((resolve) => {
      this.pendingDraft = resolve;
      this.draftTimeout = setTimeout(() => {
        this.pendingDraft = null;
        this.pendingDraftChoices = null;
        this.pendingDraftStage = null;
        this.draftTimeout = null;
        resolve(choices[0]!.id);
      }, DECISION_TIMEOUT_MS);
    });
  }

  /**
   * 국 결과 화면 닫힘 신호(roundContinue)를 기다린다.
   * 클라이언트가 "닫기"를 보내거나 자동으로 닫힐 때 resolve.
   * maxWaitMs 초과 시(AFK·끊김) 자동 resolve — 남은 사람들의 진행이 막히지 않게.
   * 이미 포기한 좌석은 즉시 resolve.
   */
  awaitContinue(maxWaitMs: number): Promise<void> {
    if (this.abandoned) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.pendingContinue = resolve;
      this.continueTimeout = setTimeout(() => this.resolveContinue(), maxWaitMs);
    });
  }

  /** 대기 중인 다음-국 신호를 해소한다 (신호 수신·타임아웃·포기 공용). */
  private resolveContinue(): void {
    if (this.continueTimeout !== null) {
      clearTimeout(this.continueTimeout);
      this.continueTimeout = null;
    }
    const resolve = this.pendingContinue;
    this.pendingContinue = null;
    resolve?.();
  }

  /**
   * 클라이언트 메시지 수신 처리.
   * Room이 소켓 메시지를 받으면 이 메서드를 호출한다.
   */
  handleMessage(msg: ClientMessage): void {
    if (msg.type === "action" && this.pending.size > 0) {
      // 어느 좌석의 응답인가 — seat이 오면 그 좌석, 없으면(구 클라이언트·평소)
      // 본인 좌석, 그것도 없으면 대기가 하나뿐일 때 그것으로 본다.
      const only = this.pending.size === 1 ? [...this.pending.keys()][0]! : null;
      const seat =
        msg.seat !== undefined && this.pending.has(msg.seat)
          ? msg.seat
          : this.pending.has(this.id)
            ? this.id
            : only;
      const entry = seat === null ? undefined : this.pending.get(seat);
      const opts = entry?.prompt.options ?? [];
      // 클라이언트가 보낸 payload(공격자 제어, 최대 프레임 크기)는 옵션마다가 아니라
      // **한 번만** 직렬화한다. 옵션 N개 × 큰 payload 재직렬화로 이벤트 루프를
      // 점유시키는 것을 막는다. 서버측 옵션 payload는 작으므로 그쪽은 반복해도 싸다.
      const wantPayload = JSON.stringify(msg.payload);
      const matched = opts.find(
        (o) => o.type === msg.actionType && JSON.stringify(o.payload) === wantPayload,
      );
      if (matched && entry !== undefined && seat !== null) {
        clearTimeout(entry.timer);
        this.pending.delete(seat);
        entry.resolve(matched);
      } else {
        this.send({
          type: "error",
          code: "INVALID_ACTION",
          message: "Not a valid option for this prompt",
        });
      }
      return;
    }

    if (msg.type === "draftPick" && this.pendingDraft !== null) {
      const choices = this.pendingDraftChoices ?? [];
      const valid = choices.find((c) => c.id === msg.augmentId);
      if (valid) {
        this.clearDraftTimeout();
        const resolve = this.pendingDraft;
        this.pendingDraft = null;
        this.pendingDraftChoices = null;
        this.pendingDraftStage = null;
        resolve(valid.id);
      } else {
        this.send({
          type: "error",
          code: "INVALID_DRAFT_PICK",
          message: "Augment not in choices",
        });
      }
      return;
    }

    if (msg.type === "roundContinue") {
      this.resolveContinue();
      return;
    }

    if (msg.type === "ping") {
      this.send({ type: "pong" });
    }
  }

  // ─────────────────────────── 내부 ───────────────────────────

  private send(msg: ServerMessage): void {
    if (this.ws.readyState === 1 /* OPEN */) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private clearDraftTimeout(): void {
    if (this.draftTimeout !== null) {
      clearTimeout(this.draftTimeout);
      this.draftTimeout = null;
    }
  }
}
