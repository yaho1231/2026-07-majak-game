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

export const DECISION_TIMEOUT_MS = 30_000;

/**
 * 타임아웃/접속 끊김 시 안전한 폴백 선택.
 * 절대 능동적 선언(론·펑·치·깡·리치)을 하지 않는다:
 * 패스 > 마지막 버림 옵션(쯔모기리에 해당) > 첫 옵션 순.
 */
export function safeFallbackOption(options: ActionOption[]): ActionOption {
  const pass = options.find((o) => o.type === "pass");
  if (pass !== undefined) return pass;
  const discards = options.filter((o) => o.type === "discard");
  const last = discards[discards.length - 1];
  if (last !== undefined) return last;
  return options[0]!;
}

type ResolveDecision = (option: ActionOption) => void;
type ResolveDraft = (id: string) => void;

export class HumanAgent implements PlayerAgent {
  readonly id: PlayerId;
  readonly nickname: string;
  readonly isBot = false;

  private pendingDecision: ResolveDecision | null = null;
  private pendingDraft: ResolveDraft | null = null;
  private pendingPrompt: DecisionPrompt | null = null;
  private pendingDraftChoices: AugmentDef[] | null = null;
  private pendingDraftStage: DraftStage | null = null;
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;
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
    if (this.pendingDecision !== null && this.pendingPrompt !== null) {
      this.send({ type: "prompt", prompt: this.pendingPrompt });
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
    this.clearTimeout();
    // 국 사이 대기 중이었다면 즉시 해소 (봇처럼 다음 국으로 넘어가게)
    if (this.pendingContinue !== null) this.resolveContinue();
    if (this.pendingDecision !== null && this.pendingPrompt !== null) {
      const resolve = this.pendingDecision;
      const options = this.pendingPrompt.options;
      this.pendingDecision = null;
      this.pendingPrompt = null;
      this.send({ type: "promptCancel" });
      resolve(safeFallbackOption(options));
    }
    if (this.pendingDraft !== null && this.pendingDraftChoices !== null) {
      const resolve = this.pendingDraft;
      const firstId = this.pendingDraftChoices[0]!.id;
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
    this.clearTimeout();
    if (this.continueTimeout !== null) {
      clearTimeout(this.continueTimeout);
      this.continueTimeout = null;
    }
    this.pendingDecision = null;
    this.pendingPrompt = null;
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

  async decide(prompt: DecisionPrompt): Promise<ActionOption> {
    if (this.abandoned) return safeFallbackOption(prompt.options);
    this.pendingPrompt = prompt;
    this.send({ type: "prompt", prompt });

    return new Promise<ActionOption>((resolve) => {
      this.pendingDecision = resolve;
      this.scheduleTimeout(() => {
        // 제한 시간 초과 — 서버는 안전 폴백으로 진행한다. 클라이언트가 이걸 모르면
        // 내 차례가 지나간 뒤에도 선택 모달·버튼이 계속 떠 있으므로 취소를 알린다.
        this.send({ type: "promptCancel" });
        resolve(safeFallbackOption(prompt.options));
      });
    });
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
      this.scheduleTimeout(() => {
        const fallback = choices[0]!.id;
        resolve(fallback);
      });
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
    if (msg.type === "action" && this.pendingDecision !== null) {
      const opts = this.pendingPrompt?.options ?? [];
      // 클라이언트가 보낸 payload(공격자 제어, 최대 프레임 크기)는 옵션마다가 아니라
      // **한 번만** 직렬화한다. 옵션 N개 × 큰 payload 재직렬화로 이벤트 루프를
      // 점유시키는 것을 막는다. 서버측 옵션 payload는 작으므로 그쪽은 반복해도 싸다.
      const wantPayload = JSON.stringify(msg.payload);
      const matched = opts.find(
        (o) => o.type === msg.actionType && JSON.stringify(o.payload) === wantPayload,
      );
      if (matched) {
        this.clearTimeout();
        const resolve = this.pendingDecision;
        this.pendingDecision = null;
        this.pendingPrompt = null;
        resolve(matched);
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
        this.clearTimeout();
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

  private scheduleTimeout(fallback: () => void): void {
    this.clearTimeout();
    this.timeoutHandle = setTimeout(() => {
      this.pendingDecision = null;
      this.pendingDraft = null;
      this.pendingPrompt = null;
      this.pendingDraftChoices = null;
      this.pendingDraftStage = null;
      this.timeoutHandle = null;
      fallback();
    }, DECISION_TIMEOUT_MS);
  }

  private clearTimeout(): void {
    if (this.timeoutHandle !== null) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }
}
