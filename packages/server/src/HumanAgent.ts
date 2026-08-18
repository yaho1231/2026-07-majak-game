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
import type { PlayerView, SeatConnection } from "@majak/core/information/PlayerView.js";
import type { ActionOption, DecisionPrompt } from "@majak/core/mahjong/flow/FlowController.js";
import type { AugmentDef } from "@majak/core/augment/Augment.js";
import type { DraftStage, ServerMessage, ClientMessage } from "@majak/core/network/protocol.js";
import type { PlayerId } from "@majak/core/engine/zones/Zone.js";
import { TIME_PRESSURE_CHANNEL } from "@majak/content";

export const DECISION_TIMEOUT_MS = 30_000;

/**
 * 소켓이 끊긴 좌석의 결정 유예(ms).
 *
 * 탭을 닫으면 좌석은 그대로 남고(재접속을 위해) 게임 루프는 그 사실을 모른 채
 * 매 결정마다 30초를 꽉 채워 기다렸다 — 한 국에 결정 지점이 60~70개라 남은 셋에게
 * 게임이 사실상 멈춘 것으로 보였다(2026-08-07 QA P0-3).
 *
 * 그래서 소켓이 닫혀 있으면 짧게만 기다린다. 0이 아니라 5초인 이유:
 * 새로고침·모바일 전환처럼 몇 초 안에 돌아오는 끊김이 흔한데, 그 사이의 리액션
 * 프롬프트를 즉시 패스로 날려 버리면 돌아와도 이미 론이 사라진 뒤다.
 * 유예 안에 돌아오면 `reconnect`가 타이머를 정상 제한 시간으로 되돌린다.
 */
export const DISCONNECT_GRACE_MS = 5_000;

/**
 * 유예 타임아웃을 **연속으로** 이만큼 흘리면 그 좌석을 이탈로 확정한다.
 *
 * 유예는 "몇 초 안에 돌아온다"는 가정이다. 돌아오지 않는 사람에게 그 가정을
 * 끝까지 적용하면 매 결정이 5초씩 걸려 국이 24초 → 72초로 늘어나고(실측),
 * 무엇보다 `handleVoteAbort`가 그 좌석을 정족수에 세는 동안 남은 사람은 판을
 * 끝낼 방법이 없다(2026-08-08 QA BLOCKER-2·3). 이탈로 확정되면 이후 결정은
 * 봇처럼 즉시 처리되고 중단 투표에서도 자동 동의로 빠진다.
 *
 * 좌석 자체는 그대로 남으므로 **재접속은 계속 가능하다** — 돌아오면 그 시점부터
 * 다시 직접 두면 된다. 8회면 한 사람 기준 두 순 남짓이라, 새로고침·모바일
 * 전환 같은 짧은 끊김은 여전히 여유롭게 통과한다.
 */
export const GRACE_TIMEOUTS_BEFORE_ABANDON = 8;

/**
 * **판을 세워 두고 기다리는** 시간(ms) — 1인 방(게스트 체험·연습)에서만 쓴다.
 *
 * 유예(`DISCONNECT_GRACE_MS`)가 5초로 짧은 이유는 **남은 사람들**이 기다리기
 * 때문이다. 사람이 한 명뿐인 방에는 그 이유가 없다 — 봇 셋은 기다려도 아무것도
 * 잃지 않는다. 그런데 예전에는 그 방이 오히려 가장 가혹했다: 소켓이 닫히는
 * 즉시 방을 삭제했다(감사 §2-5). 모바일에서 알림 하나 확인하고 돌아오면 판이
 * 없어져 있었고, 그 사람은 대개 이 게임을 **처음 보는 사람**이었다.
 *
 * 3분인 이유: 앱 전환·전화·잠금화면은 대개 1분 안쪽이고, 그보다 길어지면 돌아와도
 * 무슨 상황이었는지 기억나지 않는다. 그 사이 방 하나가 자리를 잡고 있지만
 * `MAX_GUEST_ROOMS`·`MAX_GUEST_ROOMS_PER_IP`가 이미 총량을 묶고 있다.
 */
export const SOLO_HOLD_MS = 180_000;

/**
 * 연결당 송신 버퍼 상한(bytes) — 수신자가 응답을 제때 읽지 않아(느린/악의적
 * 소비자) ws 송신 큐가 이 상한을 넘으면 그 연결을 끊는다.
 *
 * RoomManager.send와 **HumanAgent.send 양쪽**에 걸어야 한다. 예전에는
 * RoomManager에만 있었는데, 인게임 프레임(view·prompt·roundOver…)은 전부
 * HumanAgent.send를 지나가므로 소켓을 읽지 않으면서 하트비트 pong만 답하면
 * 서버 메모리가 프레임 생산 속도로 무한히 늘었다(2026-08-08 QA BLOCKER-6).
 */
export const MAX_BUFFERED_BYTES = 4 * 1024 * 1024;

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
 * **상대의 손패를 조작하는** 액션 — 리치를 선언한 상대에게는 쓸 수 없다.
 *
 * 리치는 "이 손으로 텐파이 고정"이 전제라, 남이 그 손패를 건드리면 리치 플레이어는
 * 아무 대응도 못 한 채(강제 쯔모기리) 손이 망가진다. 그래서 리치 선언자는 이 간섭의
 * 대상에서 빠진다 — 판정 자체는 각 증강의 `validate`(riichiBlocksSwap)가 하고,
 * FlowController가 validate를 통과한 후보만 프롬프트에 담으므로 **리치 상대는 애초에
 * 대상 목록에 뜨지 않는다.** 여기 있는 표는 그래도 요청이 들어왔을 때(구 화면·조작된
 * 클라이언트) 무엇이 막혔는지 **한국어로 말해 주기 위한 것**이다.
 *
 * ⚠ 숨은 리치(스텔스)는 여기 걸리지 않는다 — `riichiDeclared`는 남의 뷰에서 false라
 * 이 문구가 나갈 일이 없고, 나가서도 안 된다(그 문구가 곧 "저 사람 리치다"가 된다).
 */
const HAND_MANIP_ACTION_TYPES = new Set(["hand_swap", "swap3", "seat_swap"]);

/** 후보 목록에서 뽑는 결정론적 해시 (FNV-1a) — 같은 상황이면 항상 같은 값 */
function hashOptions(options: ActionOption[]): number {
  const text = JSON.stringify(options);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 타임아웃/접속 끊김 시 안전한 폴백 선택.
 * 절대 능동적 선언(론·펑·치·깡·리치)을 하지 않는다:
 * 강제 마무리 선택 > 패스 > 마지막 버림 옵션(쯔모기리에 해당) > 첫 옵션 순.
 */
export function safeFallbackOption(options: ActionOption[]): ActionOption {
  // 되돌릴 수 없는 발동의 마무리 단계 — 예측하기 어려운 하나를 골라 끝맺는다.
  //
  // ⚠ 예전에는 `Math.random()`이었다. 게임 경로에서 유일한 비결정 지점이라,
  // 타임아웃이 한 번이라도 끼면 **그 판을 리플레이·resume으로 재현할 수 없었다**
  // (docs/25 시스템 횡단 #14). 지금은 후보 목록 자체를 해시해 고른다 — 후보는
  // 상태에서 파생되므로 같은 상황이면 같은 선택이 나오고(재현 가능), 상대가
  // 내다볼 수 있는 "항상 첫 번째"도 아니다.
  const forced = options.filter((o) => FORCED_ACTION_TYPES.has(o.type));
  if (forced.length > 0) {
    return forced[hashOptions(forced) % forced.length]!;
  }
  const pass = options.find((o) => o.type === "pass");
  if (pass !== undefined) return pass;
  const discards = options.filter((o) => o.type === "discard");
  const last = discards[discards.length - 1];
  if (last !== undefined) return last;
  return options[0]!;
}

/**
 * 폴백으로 대신 고른 선택을 사람 말로 — 클라이언트 토스트에 그대로 실린다.
 *
 * 액션 표시 이름의 단일 진실은 클라이언트(`ACTION_LABEL`)지만 여기서는 **폴백이 고를 수
 * 있는 세 가지**뿐이라(safeFallbackOption 참고) 그 셋만 적는다. 그 밖은 이름을 지어내지
 * 말고 비워 둔다 — 틀린 이름을 알리느니 "자동 진행"까지만 말하는 편이 낫다.
 */
function fallbackLabel(o: ActionOption): string | undefined {
  if (o.type === "pass") return "패스";
  if (o.type === "discard") return "쯔모기리";
  return undefined;
}

type ResolveDecision = (option: ActionOption) => void;
type ResolveDraft = (id: string) => void;

/** 좌석 하나에 대해 응답을 기다리는 중인 결정 */
interface PendingDecision {
  prompt: DecisionPrompt;
  resolve: ResolveDecision;
  timer: ReturnType<typeof setTimeout>;
  /** 자동 폴백이 터질 시각(epoch ms) — 재접속 시 남은 시간을 그대로 알려 주려고 둔다 */
  deadlineAt: number;
  /**
   * 이 타이머가 **끊김 유예**로 짧게 걸린 것인가.
   * 그렇다면 재접속 시 정상 제한 시간으로 되돌린다(못 본 프롬프트에 5초는 부당하다).
   * 접속 상태에서 걸린 타이머는 재접속으로도 늘려 주지 않는다 — 늘려 주면
   * 초읽기 국에서 껐다 켜기가 시간 연장 수단이 된다.
   */
  graced: boolean;
}

export class HumanAgent implements PlayerAgent {
  readonly id: PlayerId;
  readonly nickname: string;
  readonly isBot = false;
  /**
   * 이 좌석이 앉아 있는 방 코드 — 로그에만 쓴다. 타임아웃 폴백이 어느 판에서
   * 났는지 없이는 "판이 저절로 진행됐다"는 제보를 확인할 방법이 없다.
   */
  roomCode = "";

  /**
   * 끊긴 채로 유예 타임아웃을 **연속으로** 흘린 횟수. 재접속하면 0으로 돌아간다.
   * `GRACE_TIMEOUTS_BEFORE_ABANDON`에 닿으면 좌석을 이탈로 확정한다.
   */
  private graceTimeouts = 0;

  /**
   * 좌석이 이탈로 확정됐을 때 방에 알리는 콜백 (RoomManager가 꽂는다).
   * 남은 사람들의 이름표를 갱신하고, 중단 투표가 걸려 있으면 다시 집계하게 한다.
   */
  private onAbandoned: (() => void) | null = null;

  /**
   * 응답을 기다리는 결정들 — **좌석 id → 대기**.
   *
   * 평소에는 본인 좌석 하나뿐이지만, 증강 테스트에서 봇 좌석을 조종하면 내 좌석과
   * 그 봇 좌석에 리액션 프롬프트가 **동시에** 뜰 수 있다. 그래서 단일 슬롯이 아니라
   * 좌석별로 들고, 클라이언트 응답의 `seat`으로 짝을 맞춘다.
   */
  private readonly pending = new Map<PlayerId, PendingDecision>();
  private pendingDraft: ResolveDraft | null = null;
  /**
   * 지금 **화면에 서 있는** 후보 — 새로고침으로 갈아 낀 슬롯은 교체분으로 바뀐다.
   * 픽 검증·자동 선택·재접속 복원이 전부 이 배열 하나를 본다.
   */
  private pendingDraftChoices: AugmentDef[] | null = null;
  /** 슬롯별 새로고침 교체분 (컨트롤러가 제시와 함께 미리 뽑아 넘긴 것) */
  private pendingDraftRerolls: readonly AugmentDef[] = [];
  /** 이번 드래프트에 이미 새로고침을 쓴 슬롯 — 슬롯당 1회뿐이다 */
  private draftRerollUsed = new Set<number>();
  private pendingDraftStage: DraftStage | null = null;
  private draftTimeout: ReturnType<typeof setTimeout> | null = null;
  /** 드래프트 자동 선택 시각(epoch ms) — 재접속 시 남은 시간을 알려 준다 */
  private draftDeadlineAt = 0;
  /** 이 드래프트 타이머가 끊김 유예로 짧게 걸렸는가 (재접속 시 정상 시간으로 복구) */
  private draftGraced = false;
  /** 국 사이 "다음 국으로" 대기 resolver (결과 화면 닫힘 신호 대기) */
  private pendingContinue: (() => void) | null = null;
  private continueTimeout: ReturnType<typeof setTimeout> | null = null;
  /** 게임 중 포기(중도 이탈) — 이후 모든 결정을 즉시 안전 폴백으로 자동 처리한다 */
  private abandoned = false;
  /**
   * **왜** 이탈했는가. 돌아올 수 있는지가 여기서 갈린다 (감사 2026-08-17 §2-2).
   *
   * - `"left"`   스스로 나가기를 눌렀다 → 돌아오지 않는다. 그게 그 사람의 결정이다.
   * - `"evicted"` 계정이 삭제됐다 → 돌아올 계정이 없다.
   * - `"timeout"` 끊긴 채 유예를 연속으로 흘렸다 → **돌아올 수 있다.**
   *
   * 예전에는 셋을 구분하지 않았고 `joinRoom`이 `!isAbandoned`로 걸러서, 지하철·
   * 엘리베이터에서 2~3분 끊긴 사람이 **영영 못 돌아왔다**. 좌석은 봇처럼 자동
   * 진행돼 판은 완주되고, 그 사람 이름으로 순위·전적까지 기록됐다.
   * `GRACE_TIMEOUTS_BEFORE_ABANDON`의 주석은 줄곧 "재접속은 계속 가능하다"고
   * 적고 있었다 — 의도는 처음부터 이쪽이었고 구현만 어긋나 있었다.
   */
  private abandonReason: "left" | "evicted" | "timeout" | null = null;
  /**
   * **판을 세워 둔 상태**의 만료 시각(epoch ms). 0이면 세워 두지 않았다.
   *
   * `suspend()`가 켜고 `reconnect()`가 끈다. 켜져 있는 동안 이 좌석의 모든 결정은
   * 5초 유예가 아니라 남은 대기 시간을 그대로 제한 시간으로 받는다 — 그동안
   * 기다리는 사람이 아무도 없기 때문이다(1인 방 전용, `SOLO_HOLD_MS` 참고).
   */
  private heldUntil = 0;
  /** 국 사이 대기의 원래 상한 — 세워 뒀다 돌아왔을 때 그대로 다시 건다. */
  private continueMaxWaitMs = 0;
  /** 재접속 시 즉시 복원해 줄 마지막 뷰 */
  private lastView: PlayerView | null = null;
  /**
   * 마지막으로 **실제로 내보낸** 뷰 프레임의 직렬화 결과 (§7-6 무변경 스킵).
   *
   * 재접속·소켓 교체 때는 반드시 비운다 — 새 소켓은 그 프레임을 받은 적이 없다.
   * 안 비우면 돌아온 사람이 "같은 뷰라서" 아무 화면도 못 받는다.
   */
  private lastViewFrame: string | null = null;
  /**
   * 증강 테스트 시점 전환 — 이 좌석(또는 SPECTATOR_ID) 시점으로 뷰를 받는다.
   * null이면 본인 좌석 기준(평소). 관찰 전용이며 결정(decide)에는 영향이 없다.
   */
  private viewSeat: PlayerId | null = null;
  /** 재접속 시 재전송할 증강 카탈로그 */
  private lastCatalog: ServerMessage | null = null;
  /** 방의 좌석별 접속 상태 조회 (RoomManager가 꽂는다). 없으면 뷰를 그대로 보낸다. */
  private seatConnections: (() => Record<PlayerId, SeatConnection>) | null = null;

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
    // 새 소켓은 지금까지의 뷰 프레임을 하나도 받은 적이 없다 — 무변경 스킵(§7-6)의
    // 기준을 비워야 아래 복원 전송이 "같은 뷰라서" 조용히 잘리지 않는다.
    this.lastViewFrame = null;
    // 돌아왔으니 유예 연속 카운터는 처음부터 다시 센다 — 끊김이 여러 번 있어도
    // 그때마다 돌아오는 사람은 이탈로 확정되지 않는다.
    this.graceTimeouts = 0;
    // 세워 뒀던 판을 다시 돌린다. 아래 복원 로직이 `graced`를 보고 정상 제한
    // 시간으로 되돌리므로 여기서는 표식만 걷으면 된다 — `suspend()`가 세워 둘 때
    // 그 표식을 남긴 이유가 이것이다(재접속 복원 경로를 새로 만들지 않는다).
    this.heldUntil = 0;
    if (this.pendingContinue !== null && this.continueTimeout === null) {
      // 결과 화면에서 멈춰 있었다 — 원래 상한으로 다시 건다.
      this.continueTimeout = setTimeout(() => this.resolveContinue(), this.continueMaxWaitMs);
    }
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
      // 대기 중인 프롬프트 전부 재전송 — 봇 좌석 조종 중이면 두 자리가 동시에 떠 있다.
      //
      // 예전에는 프롬프트만 다시 보내고 서버 타이머는 그대로 뒀다. 끊긴 사이 시간이
      // 흘러 갓 뜬 것처럼 보이는 프롬프트에 2초만 남아 있는 일이 생겼다. 지금은:
      // - 끊김 유예(5초)로 걸렸던 것은 정상 제한 시간으로 **되돌리고**,
      // - 접속 상태에서 걸렸던 것은 남은 시간을 그대로 유지해 정확히 알려 준다.
      for (const [seat, p] of [...this.pending]) {
        let leftMs: number;
        if (p.graced) {
          leftMs = this.decisionTimeoutMs();
          clearTimeout(p.timer);
          this.armDecision(seat, p.prompt, p.resolve, leftMs, false);
        } else {
          leftMs = Math.max(0, p.deadlineAt - Date.now());
        }
        this.send({ type: "prompt", prompt: p.prompt, deadlineMs: leftMs });
      }
    } else if (this.pendingDraft !== null && this.pendingDraftChoices !== null) {
      // 결정과 같은 규칙 — 유예로 걸렸던 타이머는 정상 시간으로 되돌리고,
      // 아니면 실제 남은 시간을 알려 준다.
      let leftMs: number;
      if (this.draftGraced) {
        leftMs = DECISION_TIMEOUT_MS;
        this.clearDraftTimeout();
        this.draftGraced = false;
        this.armDraft(leftMs);
      } else {
        leftMs = Math.max(0, this.draftDeadlineAt - Date.now());
      }
      this.send(this.draftOfferMessage(leftMs));
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
   * 이 좌석으로 돌아올 수 있는가.
   *
   * 끊겨서 확정된 이탈만 해당한다. 스스로 나간 사람과 계정이 지워진 사람은
   * 돌아오지 않는다 — 전자는 그게 본인의 결정이고, 후자는 돌아올 계정이 없다.
   */
  get canRejoin(): boolean {
    return this.abandoned && this.abandonReason === "timeout";
  }

  /**
   * 끊겨서 확정됐던 좌석을 되돌린다 — 그 사람이 돌아왔다.
   *
   * `abandon()`은 대기 중이던 결정을 이미 폴백으로 해소했으므로 남아 있는
   * 찌꺼기가 없다. 여기서 표식만 걷으면 다음 결정부터 다시 사람이 둔다.
   */
  reinstate(): void {
    if (!this.canRejoin) return;
    this.abandoned = false;
    this.abandonReason = null;
    this.graceTimeouts = 0;
    console.log(`[room ${this.roomCode}] ${this.nickname}(${this.id}) 복귀 — 좌석을 되돌린다`);
  }

  /** 이 좌석의 접속 상태 — 뷰의 이름표에 실려 남들에게 보인다. */
  connectionState(): SeatConnection {
    if (this.abandoned) return "abandoned";
    return this.isConnected() ? "connected" : "disconnected";
  }

  /**
   * 소켓이 끊긴 것을 알았을 때 호출한다 (RoomManager.handleClose).
   *
   * 이미 걸려 있는 대기는 30초 그대로라, 하필 내 차례에 끊기면 그 한 번은 여전히
   * 판을 30초 세운다. 남은 시간을 유예로 줄여 그 구멍을 막는다. `graced`로 표시해
   * 두면 유예 안에 돌아왔을 때 `reconnect`가 정상 시간으로 되돌린다.
   */
  noticeDisconnect(): void {
    if (this.abandoned || this.isConnected()) return;
    const now = Date.now();
    // 국 사이 결과 화면 대기는 유예가 아니라 **즉시** 해소한다. 예전에는
    // awaitContinue가 호출 시점에만 연결을 봐서, 결과 화면이 뜬 뒤에 탭을 닫으면
    // 남은 셋이 interRoundDelayMs(운영 20초)를 꽉 채워 기다렸다. 화면 뒤에
    // 아무도 없는데 기다릴 이유가 없다(2026-08-08 QA 2-6).
    if (this.pendingContinue !== null) this.resolveContinue();
    for (const [seat, p] of [...this.pending]) {
      if (p.graced || p.deadlineAt - now <= DISCONNECT_GRACE_MS) continue;
      clearTimeout(p.timer);
      this.armDecision(seat, p.prompt, p.resolve, DISCONNECT_GRACE_MS, true);
    }
    if (
      this.pendingDraft !== null &&
      this.pendingDraftChoices !== null &&
      !this.draftGraced &&
      this.draftDeadlineAt - now > DISCONNECT_GRACE_MS
    ) {
      this.clearDraftTimeout();
      this.draftGraced = true;
      this.armDraft(DISCONNECT_GRACE_MS);
    }
  }

  /**
   * **판을 세워 두고 이 좌석을 기다린다** — 1인 방(게스트 체험·연습) 전용.
   *
   * `noticeDisconnect()`의 정반대다. 저쪽은 "남은 셋을 위해 이 자리를 5초로
   * 줄인다"이고, 이쪽은 "기다리는 사람이 없으니 돌아올 때까지 세워 둔다"이다
   * (감사 §2-5 — 예전에는 이 자리에서 방을 즉시 삭제했다).
   *
   * 대기 중이던 것들은 **폴백으로 해소하지 않고** 타이머만 뗀다. 돌아오면
   * `reconnect()`가 그 프롬프트·선택창을 그대로 다시 세운다 — 손님이 보던 화면이
   * 그 자리에 있다는 것이 이 기능의 전부다.
   *
   * `graced`로 표시해 두는 이유: 재접속 복원 경로가 이미 "유예로 짧게 걸렸던 것은
   * 정상 시간으로 되돌린다"를 하고 있다. 세워 둔 것도 정확히 그 처지다.
   */
  suspend(holdMs: number = SOLO_HOLD_MS): void {
    if (this.abandoned) return;
    this.heldUntil = Date.now() + holdMs;
    for (const [seat, p] of [...this.pending]) {
      clearTimeout(p.timer);
      this.armDecision(seat, p.prompt, p.resolve, this.holdLeftMs(), true);
    }
    if (this.pendingDraft !== null && this.pendingDraftChoices !== null) {
      this.clearDraftTimeout();
      this.draftGraced = true;
      this.armDraft(this.holdLeftMs());
    }
    if (this.continueTimeout !== null) {
      // 결과 화면은 아예 멈춰 세운다 — 돌아왔을 때 무엇을 놓쳤는지 읽을 수 있어야
      // 한다. `pendingContinue`는 남겨 두고 타이머만 뗀다(reconnect가 다시 건다).
      clearTimeout(this.continueTimeout);
      this.continueTimeout = null;
    }
  }

  /** 세워 둔 판이 아직 유효하면 남은 시간, 아니면 0. */
  private holdLeftMs(): number {
    return Math.max(0, this.heldUntil - Date.now());
  }

  /** 지금 이 좌석 때문에 판이 세워져 있는가. */
  get isHeld(): boolean {
    return this.holdLeftMs() > 0 && !this.isConnected();
  }

  /**
   * 이 방의 좌석별 접속 상태를 읽는 함수 (RoomManager가 게임 시작 시 꽂는다).
   *
   * 접속 상태는 엔진 상태가 아니라 방의 상태라 GameState·PlayerView 생성기에는
   * 없다. 새 소켓 메시지를 만드는 대신, 어차피 결정마다 나가는 뷰에 얹는다.
   */
  setSeatConnectionSource(source: () => Record<PlayerId, SeatConnection>): void {
    this.seatConnections = source;
  }

  /** 이탈 확정 시 방에 알릴 콜백을 꽂는다 (RoomManager 전용). */
  setAbandonedListener(fn: () => void): void {
    this.onAbandoned = fn;
  }

  /**
   * 끊긴 채로 유예를 흘렸다 — 연속 횟수를 세고, 상한에 닿으면 이탈로 확정한다.
   * 돌아올 사람은 `reconnect`에서 카운터가 0으로 돌아가므로 여기 닿지 않는다.
   */
  private noteGraceTimeout(): void {
    if (this.abandoned || this.isConnected()) return;
    this.graceTimeouts += 1;
    if (this.graceTimeouts < GRACE_TIMEOUTS_BEFORE_ABANDON) return;
    console.log(
      `[room ${this.roomCode}] ${this.nickname}(${this.id}) 유예 ${this.graceTimeouts}회 연속 초과 — 이탈로 확정`,
    );
    // 끊겨서 확정된 이탈 — 돌아오면 좌석을 되돌려 준다(reinstate).
    this.abandon("timeout");
    this.onAbandoned?.();
  }

  /**
   * 게임 중 포기 — 좌석은 유지하되 이후 결정을 봇처럼 즉시 자동 처리한다.
   * 대기 중이던 결정/드래프트가 있으면 지금 바로 안전 폴백으로 해소해
   * 남은 사람들의 게임이 30초 타임아웃마다 멈추지 않게 한다.
   */
  abandon(reason: "left" | "evicted" | "timeout" = "left"): void {
    if (this.abandoned) return;
    this.abandoned = true;
    this.abandonReason = reason;
    // 국 사이 대기 중이었다면 즉시 해소 (봇처럼 다음 국으로 넘어가게)
    if (this.pendingContinue !== null) this.resolveContinue();
    for (const seat of [...this.pending.keys()]) this.cancelDecisionFor(seat);
    if (this.pendingDraft !== null && this.pendingDraftChoices !== null) {
      const resolve = this.pendingDraft;
      const firstId = this.pendingDraftChoices[0]!.id;
      this.clearDraftTimeout();
      this.pendingDraft = null;
      this.pendingDraftChoices = null;
      this.pendingDraftRerolls = [];
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
    this.pendingDraftRerolls = [];
    this.draftRerollUsed = new Set();
    this.pendingDraftStage = null;
    this.pendingContinue = null;
    this.lastView = null;
    this.lastViewFrame = null;
    this.viewSeat = null; // 새 판은 본인 시점에서 시작
  }

  sendView(view: PlayerView): void {
    const decorated = this.withSeatConnections(view);
    this.lastView = decorated;
    /*
     * **아무것도 안 바뀐 뷰는 보내지 않는다** (감사 2026-08-17 §7-6).
     *
     * `broadcastViews()`는 11곳에서 불리고, 접속 상태가 바뀌면 `resendViewTo`가
     * 또 부른다. 중반 이후 한 뷰가 수 KB~10KB대인데 그중 상당수가 **직전과 완전히
     * 같은 프레임**이다 — 리액션 프롬프트가 여러 명에게 나갈 때, 자기 차례가 아닌
     * 좌석은 남의 결정이 확정될 때까지 보이는 것이 하나도 달라지지 않는다.
     *
     * **델타를 만들지 않은 이유**: 델타는 클라이언트에 "이전 상태"라는 새 개념을
     * 들여오고, 그 상태가 어긋나는 순간(재접속·프레임 유실) 화면이 조용히 거짓말을
     * 한다. 지금 이 프로토콜은 매 프레임이 **완결된 진실**이라는 성질로 재접속
     * 복원을 공짜로 얻고 있다(`reconnect`가 `lastView`를 그대로 다시 보낸다).
     * 그 성질을 지키면서 얻을 수 있는 것만 가져간다 — 같으면 안 보낸다.
     *
     * 직렬화 비용은 새로 생기지 않는다: 어차피 `send`가 `JSON.stringify`를 한다.
     * 여기서 한 번 만들어 비교하고, 다를 때만 그 문자열을 그대로 흘려보낸다.
     */
    const frame = JSON.stringify({ type: "view", view: decorated });
    if (frame === this.lastViewFrame) return;
    this.lastViewFrame = frame;
    this.sendRaw(frame);
  }

  /**
   * 이름표에 세울 좌석별 접속 상태를 뷰에 덧입힌다.
   *
   * 뷰는 좌석마다 새로 만들어지지만(buildPlayerView) 관전자 뷰처럼 공유되는 경우가
   * 있어 원본을 건드리지 않고 얕은 복사로 얹는다. 값이 전부 connected면 그대로 둔다.
   */
  private withSeatConnections(view: PlayerView): PlayerView {
    const map = this.seatConnections?.();
    if (map === undefined) return view;
    if (!view.players.some((p) => (map[p.id] ?? "connected") !== "connected")) return view;
    return {
      ...view,
      players: view.players.map((p) => ({ ...p, connection: map[p.id] ?? "connected" })),
    };
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
    // 소켓이 닫혀 있으면 짧은 유예만 준다 — 어차피 이 프롬프트는 전송되지 않는다.
    // **판이 세워져 있을 때만 예외**다(1인 방): 그때는 기다리는 사람이 없으므로
    // 남은 대기 시간을 그대로 준다. 5초로 잘라 폴백을 흘리면 손님이 돌아왔을 때
    // 세워 둔 화면 대신 이미 지나간 판을 보게 된다.
    const graced = !this.isConnected();
    const held = this.isHeld;
    const timeoutMs = held
      ? this.holdLeftMs()
      : graced
        ? Math.min(this.decisionTimeoutMs(), DISCONNECT_GRACE_MS)
        : this.decisionTimeoutMs();
    // 마감은 **항상** 실어 보낸다. 예전에는 초읽기 국에만 실어서, 평소 30초 제한이
    // 화면에 전혀 안 보였다 — 자리를 비운 사람이 론을 조용히 흘렸다(QA P0-5).
    this.send({ type: "prompt", prompt, deadlineMs: timeoutMs });
    return new Promise<ActionOption>((resolve) => {
      this.armDecision(seat, prompt, resolve, timeoutMs, graced);
    });
  }

  /**
   * 좌석의 결정 타이머를 (다시) 건다. 최초 요청과 재접속 복원이 공유한다.
   * 만료되면 안전 폴백으로 resolve 하고 클라이언트에 취소를 알린다.
   */
  private armDecision(
    seat: PlayerId,
    prompt: DecisionPrompt,
    resolve: ResolveDecision,
    timeoutMs: number,
    graced: boolean,
  ): void {
    const timer = setTimeout(() => {
      // 제한 시간 초과 — 서버는 안전 폴백으로 진행한다. 클라이언트가 이걸 모르면
      // 내 차례가 지나간 뒤에도 선택 모달·버튼이 계속 떠 있으므로 취소를 알린다.
      console.log(
        `[room ${this.roomCode}] ${this.nickname}(${seat}) 응답 없음 ${timeoutMs}ms — 안전 폴백으로 진행`,
      );
      this.pending.delete(seat);
      const picked = safeFallbackOption(prompt.options);
      // 무엇이 대신 골라졌는지까지 알린다 — "안 눌렀는데 패가 나갔다"의 정체가 이것이다.
      const label = fallbackLabel(picked);
      this.send({
        type: "promptCancel",
        seat,
        reason: "timeout",
        ...(label !== undefined ? { chosen: label } : {}),
      });
      resolve(picked);
      // 유예로 흘린 것만 센다. 접속한 채로 시간을 넘긴 것은 자리를 비운 것이지
      // 연결이 끊긴 것이 아니므로 이탈로 확정하면 안 된다.
      if (graced) this.noteGraceTimeout();
    }, timeoutMs);
    this.pending.set(seat, {
      prompt,
      resolve,
      timer,
      deadlineAt: Date.now() + timeoutMs,
      graced,
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
    // 시간이 남았는데 접힌 것이므로 사유가 다르다 — 더 높은 선언이 이미 확정됐다.
    this.send({ type: "promptCancel", seat, reason: "preempted" });
    p.resolve(safeFallbackOption(p.prompt.options));
  }

  /** 이 좌석의 결정을 지금 기다리고 있는가 (조종 해제 시 판별용). */
  hasPendingFor(seat: PlayerId): boolean {
    return this.pending.has(seat);
  }

  async decideDraft(
    stage: DraftStage,
    choices: AugmentDef[],
    rerolls: readonly AugmentDef[] = [],
  ): Promise<string> {
    if (this.abandoned) return choices[0]!.id;
    // 화면에 서는 배열은 **여기서 복사**한다 — 새로고침이 이 배열을 제자리에서 갈아 끼우는데,
    // 원본은 컨트롤러가 오퍼 기록에 쓰는 것이라 건드리면 안 된다.
    this.pendingDraftChoices = [...choices];
    this.pendingDraftRerolls = rerolls;
    this.draftRerollUsed = new Set();
    this.pendingDraftStage = stage;
    // 드래프트는 네 사람이 다 고를 때까지 판 전체가 멈춘다 — 끊긴 좌석은 결정과
    // 같은 이유로 짧게만 기다린다. 유예 안에 돌아오면 reconnect가 되돌린다.
    this.draftGraced = !this.isConnected();
    // 결정과 같은 규칙 — 판이 세워져 있으면(1인 방) 남은 대기 시간을 그대로 준다.
    const timeoutMs = this.isHeld
      ? this.holdLeftMs()
      : this.draftGraced
        ? DISCONNECT_GRACE_MS
        : DECISION_TIMEOUT_MS;
    this.send(this.draftOfferMessage(timeoutMs));

    return new Promise<string>((resolve) => {
      this.pendingDraft = resolve;
      this.armDraft(timeoutMs);
    });
  }

  /** 이번 스테이지에 새로고침으로 갈아 낀 슬롯 (컨트롤러가 픽 직후에 읽는다). */
  rerolledDraftSlots(): readonly number[] {
    return [...this.draftRerollUsed].sort((a, b) => a - b);
  }

  /**
   * 지금 화면에 서야 할 증강 선택창 메시지. 최초 제안과 재접속 복원이 공유한다 —
   * 그래서 끊겼다 돌아와도 **갈아 낀 카드와 소진된 새로고침 버튼**이 그대로 복원된다.
   */
  private draftOfferMessage(deadlineMs: number): ServerMessage {
    const choices = this.pendingDraftChoices ?? [];
    return {
      type: "draftOffer",
      stage: this.pendingDraftStage ?? "gameStart",
      choices: choices.map((c) => ({
        id: c.id,
        tier: c.tier,
        name: c.name,
        description: c.description,
      })),
      deadlineMs,
      rerollable: choices.map(
        (_, i) => !this.draftRerollUsed.has(i) && this.pendingDraftRerolls[i] !== undefined,
      ),
    };
  }

  /**
   * 슬롯 하나를 새로고침한다 — 미리 뽑아 둔 교체분으로 갈아 끼우고 본인에게만 알린다.
   *
   * 조용히 무시하는 경우(대기 중이 아님·범위 밖·이미 쓴 슬롯·교체분 없음)에 오류를
   * 돌려주지 않는 이유: 화면이 이미 버튼을 잠갔으므로 정상 흐름에서는 올 수 없는
   * 요청이고, 여기서 에러 토스트를 띄우면 30초짜리 선택창 위에 잡음만 얹는다.
   */
  private handleDraftReroll(slot: number): void {
    if (this.pendingDraft === null || this.pendingDraftChoices === null) return;
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.pendingDraftChoices.length) return;
    if (this.draftRerollUsed.has(slot)) return;
    const swap = this.pendingDraftRerolls[slot];
    if (swap === undefined) return;
    this.draftRerollUsed.add(slot);
    this.pendingDraftChoices[slot] = swap;
    this.send({
      type: "draftRerolled",
      slot,
      choice: {
        id: swap.id,
        tier: swap.tier,
        name: swap.name,
        description: swap.description,
      },
    });
  }

  /**
   * 드래프트 자동 선택 타이머를 (다시) 건다. 최초 제안과 재접속 복원이 공유한다.
   *
   * 시간이 다 되면 **후보 중 하나를 랜덤으로** 고른다. 예전에는 언제나 `choices[0]`
   * ─ 화면 맨 왼쪽 카드 ─ 였는데, 자리를 비운 사람이 매번 같은 자리 증강을 받아
   * 가는 것은 결정이라기보다 사고였다(2026-08-12 사용자 지시: 선택창에도 "시간이
   * 다 되면 랜덤으로 결정된다"고 적는다 — 화면 문구와 실제 동작을 맞춘다).
   * 재현성이 필요한 경로가 아니다(게임 PRNG가 아니라 사람의 부재를 메우는 자리다).
   *
   * 후보는 인자로 받지 않고 **터지는 순간의 `pendingDraftChoices`**를 읽는다 —
   * 새로고침으로 갈아 낀 뒤 시간이 다 되면 화면에 없는 옛 카드가 아니라 지금 보이는
   * 카드 중에서 골라야 한다.
   */
  private armDraft(timeoutMs: number): void {
    this.draftDeadlineAt = Date.now() + timeoutMs;
    this.draftTimeout = setTimeout(() => {
      const choices = this.pendingDraftChoices ?? [];
      const resolve = this.pendingDraft;
      this.pendingDraft = null;
      this.pendingDraftChoices = null;
      this.pendingDraftRerolls = [];
      this.pendingDraftStage = null;
      this.draftTimeout = null;
      // 후보가 비었을 리는 없지만(컨트롤러가 빈 목록으로는 부르지 않는다), 그래도
      // resolve는 반드시 한다 — 안 하면 이 좌석 하나가 판 전체를 세운다.
      const pick = choices[Math.floor(Math.random() * choices.length)] ?? choices[0];
      // 무엇이 뽑혔는지 알린다 — 선택창은 "랜덤으로 결정된다"를 미리 적어 두면서
      // 결과는 말하지 않아, 돌아온 사람에게는 안 고른 증강이 그냥 생겨 있었다.
      if (pick !== undefined) {
        this.send({ type: "draftAutoPicked", augmentId: pick.id, name: pick.name });
      }
      resolve?.(pick?.id ?? "");
    }, timeoutMs);
  }

  /**
   * 국 결과 화면 닫힘 신호(roundContinue)를 기다린다.
   * 클라이언트가 "닫기"를 보내거나 자동으로 닫힐 때 resolve.
   * maxWaitMs 초과 시(AFK) 자동 resolve — 남은 사람들의 진행이 막히지 않게.
   *
   * 이미 포기한 좌석, 그리고 **소켓이 끊긴 좌석은 즉시 resolve**한다. 결과 화면을
   * 읽을 시간을 주려고 상한을 넉넉히 잡은 만큼(index.ts INTER_ROUND_DELAY_MS),
   * 아무도 안 보고 있는 자리 하나가 매 국 그 시간을 통째로 세우면 나머지 셋이
   * 대가를 치른다. 끊긴 좌석에는 애초에 닫을 화면이 없다 — 결정·드래프트에서
   * 끊긴 좌석을 유예로 줄이는 것과 같은 이유다.
   */
  awaitContinue(maxWaitMs: number): Promise<void> {
    if (this.abandoned) return Promise.resolve();
    // 세워 둔 1인 방은 예외 — 끊겨 있어도 기다린다. 여기서 즉시 resolve하면 손님이
    // 자리를 비운 사이 국이 계속 넘어가, 돌아왔을 때 판이 통째로 지나가 있다.
    if (!this.isConnected() && !this.isHeld) return Promise.resolve();
    this.continueMaxWaitMs = maxWaitMs;
    return new Promise<void>((resolve) => {
      this.pendingContinue = resolve;
      // 세워 둔 동안에는 타이머를 걸지 않는다 — `reconnect()`가 돌아온 시점에
      // 원래 상한으로 다시 건다. 아무도 안 돌아오면 방 쪽 보유 시한이 판을 접는다.
      this.continueTimeout = this.isHeld ? null : setTimeout(() => this.resolveContinue(), maxWaitMs);
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
   * 거절된 액션이 **리치를 선언한 상대의 손패를 건드리려는 것**이었는가.
   * 맞으면 그 상대의 좌석을, 아니면 null을 돌려준다.
   *
   * 판단은 마지막으로 내보낸 뷰의 `riichiDeclared` 하나만 본다 — 이건 공개 정보이고,
   * 숨은 리치는 남의 뷰에서 false라 여기 걸리지 않는다(걸리면 그 문구가 은닉을 깬다).
   */
  private riichiTargetOf(msg: ClientMessage): PlayerId | null {
    if (msg.type !== "action") return null;
    if (!HAND_MANIP_ACTION_TYPES.has(msg.actionType)) return null;
    const target = (msg.payload as { target?: unknown } | undefined)?.target;
    if (typeof target !== "string") return null;
    const view = this.lastView;
    if (view === null) return null;
    return view.round.byPlayer[target]?.riichiDeclared === true ? target : null;
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
      } else if (this.riichiTargetOf(msg) !== null) {
        // 리치를 선언한 상대의 손패를 건드리려 했다 — 무엇이 막혔는지 그대로 말한다.
        // (일반 문구 "화면을 새로 받아 주세요"는 여기서 거짓말이 된다. 화면을 새로
        //  받아도 그 상대는 리치가 풀리기 전까지 영영 대상이 되지 않는다.)
        this.send({
          type: "error",
          code: "TARGET_IN_RIICHI",
          message: "리치를 선언한 상대의 손패는 건드릴 수 없습니다.",
        });
      } else {
        this.send({
          type: "error",
          code: "INVALID_ACTION",
          // "화면을 새로 받아 주세요"라고 적어 두었었는데, **화면을 새로 받는
          // 방법이 프로토콜에 없었다** — 사용자가 할 수 있는 일이 아닌 것을
          // 지시하는 문장이었다(감사 §2-4). 지금은 재접속 시 클라이언트가 낡은
          // 선택지를 스스로 비우므로 이 오류 자체가 거의 나지 않지만, 남는
          // 경우(연타·시차)에는 무엇이 일어났는지만 사실대로 말한다.
          message: "이미 지나간 선택입니다 — 다음 차례를 기다려 주세요.",
        });
      }
      return;
    }

    if (msg.type === "draftReroll") {
      this.handleDraftReroll(msg.slot);
      return;
    }

    if (msg.type === "draftPick" && this.pendingDraft !== null) {
      // 지금 **화면에 서 있는** 후보만 유효하다 — 새로고침으로 갈아 낸 옛 카드는
      // pendingDraftChoices에서 이미 빠졌으므로 여기서 자동으로 거부된다.
      const choices = this.pendingDraftChoices ?? [];
      const valid = choices.find((c) => c.id === msg.augmentId);
      if (valid) {
        this.clearDraftTimeout();
        const resolve = this.pendingDraft;
        this.pendingDraft = null;
        this.pendingDraftChoices = null;
        this.pendingDraftRerolls = [];
        this.pendingDraftStage = null;
        resolve(valid.id);
      } else {
        this.send({
          type: "error",
          code: "INVALID_DRAFT_PICK",
          message: "제시되지 않은 증강입니다 — 화면을 새로 받아 주세요.",
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
    this.sendRaw(JSON.stringify(msg));
  }

  /** 이미 직렬화된 프레임을 그대로 보낸다 (뷰 무변경 스킵이 문자열을 재사용한다). */
  private sendRaw(frame: string): void {
    if (this.ws.readyState !== 1 /* OPEN */) return;
    // 백프레셔 가드 — RoomManager.send와 같은 상한. 인게임 프레임은 전부 여기를
    // 지나가므로 이 가드가 없으면 안 읽는 소켓 하나가 서버 메모리를 무한히 먹는다.
    if (this.ws.bufferedAmount > MAX_BUFFERED_BYTES) {
      try {
        this.ws.terminate();
      } catch {
        /* 이미 닫힘 */
      }
      return;
    }
    this.ws.send(frame);
  }

  private clearDraftTimeout(): void {
    if (this.draftTimeout !== null) {
      clearTimeout(this.draftTimeout);
      this.draftTimeout = null;
    }
  }
}
