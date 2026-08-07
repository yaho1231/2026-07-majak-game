/**
 * 네트워크 프로토콜 타입 — 클라이언트·서버 공유.
 *
 * @majak/core 에 위치하므로 I/O 없음. 순수 타입 정의만.
 * 실제 WebSocket 코드는 @majak/server 에 있다.
 *
 * 설계: docs/12_NETWORK_REPLAY.md §2
 */

import type { PlayerId } from "../engine/zones/Zone.js";
import type { PlayerView, PublicTileView } from "../information/PlayerView.js";
import type { TileId } from "../mahjong/tiles/Tile.js";
import type { DecisionPrompt, ActionOption } from "../mahjong/flow/FlowController.js";
import type { RoundSettledPayload } from "../mahjong/flow/flowEvents.js";
import type { AugmentCategory, AugmentDef, AugmentTier } from "../augment/Augment.js";
import type { PlayerStatsView } from "../stats/PlayerStats.js";

// ─────────────────────────── 클라이언트 → 서버 ───────────────────────────

export type DraftStage =
  | "gameStart"
  | "eastThird"
  | "eastFourth"
  | "southEntry"
  | "southThird";

/** 게임 모드 — 반장전(hanchan)·동풍전(tonpuu). */
export type GameMode = import("../engine/state/GameState.js").GameMode;

// ── 인증 (15) ──

/** 회원가입. adminCode가 서버 관리자 코드와 일치하면 관리자 계정이 된다. */
export interface RegisterMessage {
  type: "register";
  username: string;
  password: string;
  adminCode?: string;
  /** 가입 게이트 코드. 서버가 SIGNUP_CODE를 설정한 경우 일치해야 가입된다. */
  signupCode?: string;
}

/** 아이디·비밀번호 로그인. */
export interface LoginMessage {
  type: "login";
  username: string;
  password: string;
}

/** 저장된 세션 토큰으로 자동 로그인. */
export interface TokenLoginMessage {
  type: "tokenLogin";
  sessionToken: string;
}

/** 로그아웃 — 세션 토큰 무효화. */
export interface LogoutMessage {
  type: "logout";
}

// ── 방 생성·참가 (15) ──

/** 방 만들기 — 서버가 랜덤 코드를 생성하고 방장으로 입장시킨다. */
export interface CreateRoomMessage {
  type: "createRoom";
}

/** 방 코드로 참가. reconnectToken이 있으면 게임 중 재접속 시도. */
export interface JoinRoomMessage {
  type: "joinRoom";
  code: string;
  reconnectToken?: string;
}

/** 대기실에서 명시적으로 나가기. */
export interface LeaveRoomMessage {
  type: "leaveRoom";
}

// ── 리플레이 (15) ──

/** 내 리플레이 목록 요청. */
export interface ReplayListRequestMessage {
  type: "replayList";
}

/** 리플레이 이벤트 로그 요청 (본인 게임 또는 관리자). */
export interface ReplayGetMessage {
  type: "replayGet";
  gameId: number;
}

// ── 제보 게시판 (버그·증강 아이디어) ──

/** 제보 종류 — 버그 제보 / 증강 아이디어. */
export type FeedbackKind = "bug" | "idea";

/**
 * 제보 처리 상태 — 관리자만 바꾼다.
 * open(접수) → reviewing(검토 중) → done(반영 완료) / rejected(반려)
 */
export type FeedbackStatus = "open" | "reviewing" | "done" | "rejected";

/**
 * 제보 작성.
 *
 * **공개 범위**: 작성자 본인과 관리자만 읽는다 (서버가 조회 시점에 걸러 낸다).
 * 다른 사람의 글은 목록에 아예 실리지 않는다.
 */
export interface FeedbackSubmitMessage {
  type: "feedbackSubmit";
  kind: FeedbackKind;
  title: string;
  body: string;
}

/** 내가 볼 수 있는 제보 목록 요청 (본인 글 전부 / 관리자는 전체). */
export interface FeedbackListRequestMessage {
  type: "feedbackList";
}

/** 제보 상태 변경·답변 (관리자 전용). 둘 다 선택이며 준 항목만 바뀐다. */
export interface FeedbackUpdateMessage {
  type: "feedbackUpdate";
  id: number;
  status?: FeedbackStatus;
  /** 작성자에게 보이는 관리자 답변. 빈 문자열이면 답변 삭제. */
  reply?: string;
}

/** 제보 삭제 — 작성자 본인 또는 관리자. */
export interface FeedbackDeleteMessage {
  type: "feedbackDelete";
  id: number;
}

// ── 관리자 관전 (15) ──

/** 전체 플레이어 누적 통계(리더보드) 요청 — 로그인한 누구나. */
export interface LeaderboardRequestMessage {
  type: "leaderboard";
}

/** 전체 계정 목록 요청 (관리자 전용). */
export interface AdminUsersRequestMessage {
  type: "adminUsers";
}

/** 증강 파워 티어표 요청 (관리자 전용). */
export interface AdminAugmentTiersRequestMessage {
  type: "adminAugmentTiers";
}

/** 계정 삭제 (관리자 전용). */
export interface AdminDeleteUserMessage {
  type: "adminDeleteUser";
  userId: number;
}

/** 진행 중 게임 목록 요청 (관리자 전용). */
export interface LiveGamesRequestMessage {
  type: "liveGames";
}

/** 진행 중 게임 관전 시작 (관리자 전용). */
export interface SpectateMessage {
  type: "spectate";
  code: string;
}

/** 관전 종료. */
export interface SpectateStopMessage {
  type: "spectateStop";
}

// ── 증강 테스트(샌드박스) (49) ──

/**
 * 증강 테스트 게임 시작 (관리자 전용).
 * 봇 3명과 함께 드래프트 없이 즉시 시작하는 1인 전용 방을 만든다.
 * 이 방의 게임은 리플레이·게임 기록·누적 통계를 남기지 않는다(실데이터 오염 방지).
 */
export interface SandboxStartMessage {
  type: "sandboxStart";
  /** 게임 모드 (기본 반장전). 모드 전용 증강을 시험하려면 동풍전으로 연다. */
  mode?: GameMode;
}

/** 진행 중인 테스트 게임에서 증강 1개를 즉시 획득한다 (관리자 전용). */
export interface SandboxGrantMessage {
  type: "sandboxGrant";
  augmentId: string;
  /** 지급 대상 좌석 (생략 시 본인). 봇에게 줘서 상대 시점도 시험할 수 있다. */
  target?: PlayerId;
}

/**
 * 테스트 게임 초기화 — 지금 판을 버리고 지정한 증강만 지급된 새 판을 시작한다.
 * augments를 비우면 증강 없는 백지 상태가 된다.
 */
export interface SandboxResetMessage {
  type: "sandboxReset";
  /** 새 판 시작 시 좌석별로 미리 지급할 증강 (생략·빈 객체 = 증강 없음) */
  augments?: Record<string, string[]>;
  /**
   * 새 판 시작 시 좌석별로 강제 배패할 손패 (`kindKey` 표기 — "man5"·"wind1").
   * 생략·빈 배열이면 평소대로 무작위 배패. 지정한 장수만 앞에서 채우고 나머지는
   * 무작위로 채우므로, 일부만 지정해도 된다. **매 국** 이 손패로 다시 배패된다.
   * 배패 장수(13)보다 한 장 더(14장) 지정하면 마지막 한 장이 그 좌석의 **첫 쯔모**가 된다.
   */
  hands?: Record<string, string[]>;
  /** 새 판의 게임 모드 (생략 시 유지) */
  mode?: GameMode;
}

/**
 * 봇 행동 제약 (증강 테스트 전용) — 켜진 항목을 봇이 하지 않는다.
 * 특정 상황(내 리치를 아무도 안 깨는 판 등)을 재현하기 위한 시험용 스위치다.
 */
export interface SandboxBotRules {
  /** 후로(펑·치·대명깡) 금지 */
  noCall?: boolean;
  /** 리치 선언 금지 */
  noRiichi?: boolean;
  /** 화료(론·쯔모) 금지 */
  noWin?: boolean;
  /** 액티브 증강 발동 금지 */
  noAugment?: boolean;
}

/** 봇 행동 제약을 지금 즉시 갱신한다 (관리자 전용). 진행 중인 판에 바로 적용된다. */
export interface SandboxBotRulesMessage {
  type: "sandboxBotRules";
  rules: SandboxBotRules;
}

/**
 * 봇 좌석 직접 조작 모드 토글 (관리자 전용).
 * 켜면 `sandboxViewAs`로 봇 좌석을 보고 있는 동안 그 봇의 결정(버림·리치·후로·
 * 증강 발동)이 봇 대신 나에게 온다. 시점을 옮기거나 끄면 즉시 봇에게 돌아간다.
 */
export interface SandboxControlMessage {
  type: "sandboxControl";
  enabled: boolean;
}

/**
 * 증강 테스트에서 뷰 시점을 다른 좌석으로 전환한다 (관리자 전용).
 * seat에 다른 좌석 id를 주면 그 좌석이 실제로 보는 가시성 필터가 적용된 뷰를,
 * SPECTATOR_ID(`__spectator`)를 주면 전체 공개 뷰를 받는다. 본인 좌석 id로 되돌린다.
 * 기본은 관찰 전용이지만, `sandboxControl`이 켜져 있으면 관찰 중인 봇 좌석의
 * 결정이 나에게 와서 그 좌석을 직접 조작할 수 있다.
 */
export interface SandboxViewAsMessage {
  type: "sandboxViewAs";
  /** 관찰할 좌석 id (또는 SPECTATOR_ID). 본인 좌석 id면 원래 시점으로 복귀. */
  seat: PlayerId;
}

/** @deprecated 15차 이전 호환용 — joinRoom을 사용하라. */
export interface JoinMessage {
  type: "join";
  roomId: string;
  nickname: string;
  /** 재접속 토큰 (선택적) */
  token?: string;
}

export interface ActionMessage {
  type: "action";
  actionType: string;
  payload: unknown;
  /**
   * 이 결정이 어느 좌석의 것인가 (증강 테스트의 봇 좌석 조작 전용).
   * 생략하면 본인 좌석. 자기 좌석과 조종 중인 봇 좌석에 프롬프트가 동시에 떠 있을
   * 때 어느 쪽 응답인지 가른다.
   */
  seat?: PlayerId;
}

export interface DraftPickMessage {
  type: "draftPick";
  stage: DraftStage;
  augmentId: string;
}

export interface PingMessage {
  type: "ping";
}

/**
 * 내 손패 배치(왼→오른쪽 순서)를 서버에 알린다.
 *
 * 손패 배치는 실제 탁자에서 전원이 함께 보는 정보다 — 뒷면이라 내용은 안 보여도
 * "몇 번째 자리의 패"는 모두에게 같아야 한다. 그래서 배치를 서버로 올려
 * 관전·투시로 손패가 공개될 때 소유자가 실제로 쥔 순서 그대로 보이게 한다.
 *
 * 손패가 바뀌면(쯔모·버림) 클라이언트가 새 배치를 다시 보낸다. 서버는 낡은 배치도
 * 그대로 흡수한다(없는 패는 무시, 새 패는 맨 뒤) — 자세한 규약은 core arrangeHand.
 */
export interface HandOrderMessage {
  type: "handOrder";
  /** 손패 tile id를 왼→오른쪽 순서로 */
  tileIds: TileId[];
}

/**
 * 국 결과 화면을 닫고 다음 국으로 넘어갈 준비가 됐다는 신호.
 * 사람이 "닫기"를 누르거나 결과 화면이 자동으로 닫힐 때 전송한다.
 * 서버는 모든 사람이 이 신호를 보내면(또는 대기 상한 초과 시) 다음 국을 시작한다.
 */
export interface RoundContinueMessage {
  type: "roundContinue";
}

// ── 대기실(로비) 메시지 (14) ──

/** 준비 상태 토글 (방장 제외 플레이어). */
export interface ReadyMessage {
  type: "ready";
  ready: boolean;
}

/** 빈 자리에 봇 1명 추가 (방장 전용). */
export interface AddBotMessage {
  type: "addBot";
}

/** 봇 제거 (방장 전용). */
export interface RemoveBotMessage {
  type: "removeBot";
  playerId: PlayerId;
}

/**
 * 봇의 전략 성향을 바꾼다 (방장 전용, 대기 중에만).
 *
 * 기본 성향은 방 코드+좌석 시드로 뽑히는데, 그러면 "수비형 셋과 붙어 보고 싶다" 같은
 * 연습을 하려고 방을 만들었다 지웠다 해야 했다. 지정하면 그 자리는 판이 끝나 대기실로
 * 돌아와도 그 성향을 유지한다(봇 인스턴스는 매 판 새로 만들어지므로 방이 기억한다).
 */
export interface SetBotArchetypeMessage {
  type: "setBotArchetype";
  playerId: PlayerId;
  /** 원형 id (`attacker`·`defender`…). 서버가 모르는 값이면 무시한다. */
  archetype: string;
}

/**
 * 플레이어 강퇴 (방장 전용, 대기 중에만).
 *
 * 방장 자신은 대상이 될 수 없다. 강퇴된 사람은 **그 방에는 다시 들어올 수 없다** —
 * 코드만 알면 곧바로 되돌아올 수 있으면 강퇴가 아무 의미가 없기 때문이다.
 * (봇을 지정하면 `removeBot`과 같이 자리에서 빠진다.)
 */
export interface KickPlayerMessage {
  type: "kickPlayer";
  playerId: PlayerId;
}

/** 게임 시작 (방장 전용, 전원 준비 + 4인일 때만 유효). */
export interface StartGameMessage {
  type: "startGame";
}

/**
 * 자리 섞기 (방장 전용, 대기 중에만) — 네 자리(동남서북)를 무작위로 다시 뽑는다.
 *
 * 자리는 그대로 게임의 방위·친 순서가 되므로 판의 유불리에 직결된다. 방을 만든 순서가
 * 곧 자리였을 때는 방장이 늘 첫 동가(친)였다. 방이 4인으로 찰 때·판이 끝날 때 자동으로
 * 한 번 섞이고, 그 뒤로는 이 메시지로 몇 번이든 다시 뽑을 수 있다.
 */
export interface ShuffleSeatsMessage {
  type: "shuffleSeats";
}

/** 게임 모드 변경 (방장 전용, 대기 중에만). 대기실에서 반장전/동풍전을 고른다. */
export interface SetGameModeMessage {
  type: "setGameMode";
  mode: GameMode;
}

/** 통계 재전송 요청. */
export interface StatsRequestMessage {
  type: "statsRequest";
}

/**
 * 게임 무효(중단) 투표 — 게임 중 사람 전원이 동의하면 게임을 무효 처리한다.
 * 봇은 자동으로 동의한 것으로 친다.
 * - "agree": 무효에 동의(투표 시작 겸용) · "withdraw": 내 동의 철회
 * - "reject": 투표 거부 → 진행 중인 무효 투표를 전부 취소(만장일치가 불가하므로 즉시 정리)
 */
export interface VoteAbortMessage {
  type: "voteAbort";
  vote: "agree" | "withdraw" | "reject";
}

export type ClientMessage =
  | JoinMessage
  | ActionMessage
  | DraftPickMessage
  | PingMessage
  | HandOrderMessage
  | RoundContinueMessage
  | ReadyMessage
  | AddBotMessage
  | RemoveBotMessage
  | SetBotArchetypeMessage
  | KickPlayerMessage
  | StartGameMessage
  | SetGameModeMessage
  | ShuffleSeatsMessage
  | StatsRequestMessage
  | VoteAbortMessage
  | RegisterMessage
  | LoginMessage
  | TokenLoginMessage
  | LogoutMessage
  | CreateRoomMessage
  | JoinRoomMessage
  | LeaveRoomMessage
  | ReplayListRequestMessage
  | ReplayGetMessage
  | LeaderboardRequestMessage
  | FeedbackSubmitMessage
  | FeedbackListRequestMessage
  | FeedbackUpdateMessage
  | FeedbackDeleteMessage
  | AdminUsersRequestMessage
  | AdminAugmentTiersRequestMessage
  | AdminDeleteUserMessage
  | LiveGamesRequestMessage
  | SpectateMessage
  | SpectateStopMessage
  | SandboxStartMessage
  | SandboxGrantMessage
  | SandboxResetMessage
  | SandboxViewAsMessage
  | SandboxBotRulesMessage
  | SandboxControlMessage;

// ─────────────────────────── 서버 → 클라이언트 ───────────────────────────

export interface JoinedMessage {
  type: "joined";
  playerId: PlayerId;
  roomId: string;
  /** 재접속용 토큰 */
  token: string;
}

export interface ViewMessage {
  type: "view";
  view: PlayerView;
}

export interface PromptMessage {
  type: "prompt";
  prompt: DecisionPrompt;
  /**
   * 이 결정의 제한 시간(ms) — **초읽기(time_pressure)가 걸린 국에만** 실린다.
   * 평소의 30초 AFK 타임아웃은 게임 규칙이 아니라 진행 보호 장치라 싣지 않는다.
   * 값이 있으면 클라이언트가 카운트다운을 그리고, 넘기면 서버가 안전 폴백으로 진행한다.
   */
  deadlineMs?: number;
}

/**
 * 대기 중이던 프롬프트가 **내 응답 없이** 해소됐다 (제한 시간 초과·좌석 포기).
 * 서버는 안전 폴백으로 진행하지만, 클라이언트에는 아무 신호도 가지 않아
 * 선택 UI(버튼·영상패 선택 모달 등)가 내 차례가 지나간 뒤에도 계속 떠 있었다.
 * 이 메시지를 받으면 떠 있는 선택 UI를 즉시 닫는다.
 */
export interface PromptCancelMessage {
  type: "promptCancel";
  /**
   * 취소된 프롬프트의 좌석. 생략하면 떠 있는 선택 UI 전부를 닫는다(구 동작).
   * 증강 테스트에서 내 좌석과 조종 중인 봇 좌석에 프롬프트가 동시에 떠 있을 때,
   * 한쪽만 접히도록 가른다.
   */
  seat?: PlayerId;
}

export interface DraftOfferMessage {
  type: "draftOffer";
  stage: DraftStage;
  choices: Array<{
    id: string;
    tier: AugmentTier;
    name: string;
    description: string;
  }>;
  /** 자동 선택까지 남은 시간(ms) — 클라이언트 카운트다운 표시용. 없으면 표시 안 함. */
  deadlineMs?: number;
}

/** 증강 카탈로그 항목 (표시용 — 클라이언트가 id→이름을 얻는 유일한 경로) */
export interface AugmentCatalogEntry {
  id: string;
  tier: AugmentTier;
  /** 계열 (AugmentDef.category) — 카드·pill·컷인 색과 아이콘의 단일 소스 */
  category: AugmentCategory;
  name: string;
  description: string;
  /** 도감 상세 설명 (AugmentDef.detail). 없으면 도감은 description으로 대체 표시. */
  detail?: string;
  /** 드래프트 스테이지 제한 (없으면 전 스테이지). 도감 "획득 시점" 배지용. */
  draftStages?: readonly DraftStage[];
  /** 게임 모드 제한 (없으면 전 모드). 도감 "모드 전용" 배지용. */
  modes?: readonly GameMode[];
  /** 지급형 증강이면 함께 지급되는 등급 (도박사 계열). 도감 "연쇄 지급" 배지용. */
}

/** 게임 시작 시 1회 전송 — 증강 pill·드래프트 표시에 쓰는 정적 카탈로그 */
export interface CatalogMessage {
  type: "catalog";
  augments: AugmentCatalogEntry[];
}

/** 화료자 공개 손패 (결과 화면용) */
export interface RevealedHand {
  /** 손패 (화료패 포함, 정렬 전) */
  hand: PublicTileView[];
  /** 후로 묶음 */
  melds: { kind: string; tiles: PublicTileView[] }[];
}

export interface RoundOverMessage {
  type: "roundOver";
  outcome: "win" | "draw" | "abort";
  /** 정산 상세 — 점수 변동·화료 정보(역 목록·판·부·점수) 포함 */
  settle: RoundSettledPayload;
  /** 화료 시 공개되는 뒷도라 표시패 */
  uraDoraIndicators: TileId[];
  /** 이 메시지가 참조하는 패의 메타데이터 (뒷도라 표시패·화료패) */
  tiles: Record<TileId, PublicTileView>;
  /** 화료자별 공개 손패 */
  revealedHands: Record<PlayerId, RevealedHand>;
  /**
   * 결과 화면을 열어 둘 수 있는 **상한**(ms) — 서버의 국 사이 대기(interRoundDelayMs)와
   * 같은 값이다. 아무도 닫지 않으면 서버는 이 시간에 다음 국을 시작한다.
   *
   * 결과 화면은 스스로 닫히지 않으므로(사람이 "다음 국으로"를 누른다), 화면이 언제
   * 저절로 넘어가는지 알려 줄 유일한 근거가 이 값이다. 클라이언트가 자기 숫자를 따로
   * 들고 있으면 서버 상한과 어긋나 거짓 카운트다운이 되므로 **여기로만** 흘린다.
   * 0·미지정이면 대기가 없다(테스트·봇 게임) — 카운트다운도 띄우지 않는다.
   */
  autoContinueMs?: number;
}

export interface RankingEntry {
  playerId: PlayerId;
  nickname: string;
  /** 봇 여부 (순위표에서 봇 표기용) */
  isBot: boolean;
  /** 봇의 전략 원형 id (표시용, 사람이면 null) */
  archetype?: string | null;
  score: number;
  /** 우마·오카 적용 전 최종 점수 */
  rawScore: number;
  /** 우마 점수 (+20/+10/-10/-20) */
  uma: number;
  /** 오카 (1위에게만) */
  oka: number;
  rank: 1 | 2 | 3 | 4;
}

export interface GameOverMessage {
  type: "gameOver";
  rankings: RankingEntry[];
  /**
   * 방이 살아 있어 그대로 한 판 더 갈 수 있다 — 결과 화면의 "이어하기"가 이 값으로 뜬다.
   * 방은 종국과 함께 **대기실 상태**로 돌아가므로, 이어하기는 그 대기실로 되돌아가는 것이고
   * 다음 판은 평소처럼 전원 준비 + 방장 시작으로 열린다.
   */
  canContinue?: boolean;
}

/** 게임 무효 투표 현황 — 사람 중 몇 명이 동의했는지 (봇은 자동 동의라 제외). */
export interface AbortVoteMessage {
  type: "abortVote";
  /** 동의한 사람 수 */
  votes: number;
  /** 게임을 무효화하는 데 필요한 사람 수 (방의 사람 수) */
  needed: number;
  /** 동의한 사람들의 playerId */
  voters: PlayerId[];
}

/** 게임이 전원 합의로 무효 처리됨 — 정산·기록 없이 홈으로 돌아간다. */
export interface GameAbortedMessage {
  type: "gameAborted";
  reason: string;
}

export interface ErrorMessage {
  type: "error";
  code: string;
  message: string;
}

export interface PongMessage {
  type: "pong";
}

// ── 대기실(로비) 상태 (14) ──

/** 대기실의 플레이어 1명 (봇 포함). */
export interface LobbyPlayerEntry {
  playerId: PlayerId;
  nickname: string;
  isBot: boolean;
  /**
   * 봇의 전략 원형 id (사람이면 null). 대기실에서 미리 보여야 "어떤 셋과 붙는지"를
   * 알고 앉는다 — 방을 다시 만들지 않는 한 이 성향은 게임 내내 바뀌지 않는다.
   */
  archetype?: string | null;
  isHost: boolean;
  /**
   * 이 사람이 앉은 자리 (0=동 1=남 2=서 3=북) — 그대로 게임의 방위가 된다.
   *
   * `playerId`의 번호가 아니라 **좌석 배열 순서**다. 둘은 방을 만든 직후에만 같고,
   * 자리를 섞으면 갈라진다(p2가 동가일 수 있다). 대기실은 이 값으로 줄을 세운다.
   */
  seat: number;
  /** 준비 완료 여부. 방장·봇은 항상 true. */
  ready: boolean;
  /** 누적(career) 통계 — 신규 플레이어면 null. */
  stats: PlayerStatsView | null;
}

/**
 * 방장에게 강퇴당했다 — 클라이언트는 방 상태를 정리하고 홈으로 돌아간다.
 * (이 방에는 다시 들어올 수 없으므로 재입장 대상에서도 지운다.)
 */
export interface KickedMessage {
  type: "kicked";
  roomId: string;
}

/** 대기실 상태 스냅샷 — 참가·준비·봇 변화마다 브로드캐스트. */
export interface LobbyMessage {
  type: "lobby";
  roomId: string;
  hostId: PlayerId;
  /** 이 메시지를 받는 본인의 playerId. */
  youId: PlayerId;
  /** 방장이 지금 게임을 시작할 수 있는지 (4인 + 전원 준비). */
  canStart: boolean;
  /** 선택된 게임 모드 (반장전/동풍전). 방장만 바꿀 수 있다. */
  gameMode: GameMode;
  players: LobbyPlayerEntry[];
}

// ── 통계 (14) ──

/** 통계 1건 (플레이어 식별 + 파생 통계). */
export interface StatsEntry {
  /** 게임 내 식별자 (게임 통계에만 존재, career에는 없을 수 있음). */
  playerId?: PlayerId;
  nickname: string;
  isBot: boolean;
  stats: PlayerStatsView;
}

/** 통계 전송 — 게임 종료 시(이번 판 + 누적) 또는 요청 응답. */
export interface StatsMessage {
  type: "stats";
  /** 이번 반장전 통계 (게임 종료 시에만). */
  game?: StatsEntry[];
  /** 누적(career) 통계. */
  career: StatsEntry[];
}

// ── 전체 통계 · 계정 관리 (32) ──

/** 리더보드 항목 — 닉네임별 누적 통계(봇 제외). */
export interface LeaderboardEntry {
  nickname: string;
  stats: PlayerStatsView;
}

/** 전체 플레이어 통계 — 메인 화면에서 누구나 볼 수 있다. */
export interface LeaderboardMessage {
  type: "leaderboard";
  entries: LeaderboardEntry[];
}

// ── 제보 게시판 ──

/** 제보 1건. 목록에는 **내 글**(또는 관리자면 전체)만 실린다. */
export interface FeedbackEntry {
  id: number;
  kind: FeedbackKind;
  title: string;
  body: string;
  /** 작성자 닉네임. 계정이 삭제된 글은 작성 당시 닉네임이 그대로 남는다. */
  author: string;
  /** ISO 작성 시각 */
  createdAt: string;
  status: FeedbackStatus;
  /** 관리자 답변 (없으면 ""). 작성자와 관리자만 본다. */
  reply: string;
  /** ISO 답변·상태 변경 시각 (없으면 null) */
  repliedAt: string | null;
  /** 이 글을 내가 썼는가 (관리자 목록에서 내 글 구분용) */
  mine: boolean;
}

/** 제보 목록 응답 — 최신순. */
export interface FeedbackListMessage {
  type: "feedbackList";
  entries: FeedbackEntry[];
  /** 관리자 화면인가 (전체 글이 실렸는가) */
  isAdmin: boolean;
}

/** 계정 1건 (관리자 목록용). */
export interface AdminUserEntry {
  id: number;
  username: string;
  isAdmin: boolean;
  /** ISO 가입 시각 */
  createdAt: string;
  /** 참가한 게임 수 */
  games: number;
}

/** 전체 계정 목록 (관리자 전용 응답). */
export interface AdminUsersMessage {
  type: "adminUsers";
  users: AdminUserEntry[];
}

/**
 * 증강 파워 티어표 한 줄 (관리자 전용).
 * **실시간**: 서버가 살아 있는 카탈로그와 `AUGMENT_POWER_TIERS`를 매 요청마다 조인한다 —
 * 티어 표에 없는 증강은 `tier: null`(미분류)로 그대로 드러나고, 카탈로그에서 사라진
 * id는 애초에 나오지 않는다.
 */
export interface AugmentTierEntry {
  id: string;
  name: string;
  category: AugmentCategory;
  description: string;
  /** null이면 powerTier.ts에 아직 등재되지 않은 증강 (미분류) */
  tier: string | null;
  /** 타점 */
  p: number | null;
  /** 속도 */
  s: number | null;
  /** 무대응 */
  u: number | null;
  /** 빈도 */
  f: number | null;
  /** p*3 + s*3 + u*2 + f*2 */
  score: number | null;
  /** 드래프트 가중치 (1.0 = 균등 기준) */
  weight: number | null;
  /** 조건이 극단적으로 드물어 산식보다 한 단계 낮춘 항목 */
  rare: boolean;
  note: string;
}

/** 증강 파워 티어표 (관리자 전용 응답). */
export interface AdminAugmentTiersMessage {
  type: "adminAugmentTiers";
  entries: AugmentTierEntry[];
  /** 티어 순서 (강한 것부터) — 클라가 그룹 정렬에 쓴다 */
  order: string[];
  /** 티어별 한 줄 정의 */
  labels: Record<string, string>;
  /** 티어별 드래프트 가중치 */
  weights: Record<string, number>;
}

// ── 인증·방·리플레이·관전 응답 (15) ──

/** 로그인/가입/토큰로그인 성공. */
export interface AuthOkMessage {
  type: "authOk";
  username: string;
  isAdmin: boolean;
  /** 자동 로그인용 세션 토큰 (클라이언트가 저장) */
  sessionToken: string;
}

/** 방 생성 완료 — 이어서 joined·lobby가 온다. */
export interface RoomCreatedMessage {
  type: "roomCreated";
  code: string;
}

/** 리플레이 목록의 게임 1건 요약. */
export interface ReplayGameSummary {
  gameId: number;
  code: string;
  /** ISO 종료 시각 */
  endedAt: string;
  players: { nickname: string; isBot: boolean; rank: number; score: number }[];
}

export interface ReplayListMessage {
  type: "replayList";
  games: ReplayGameSummary[];
}

/** 리플레이 원본 — JSONL 라인들(첫 줄 __init__ + 확정 이벤트). 클라가 재구성한다. */
export interface ReplayDataMessage {
  type: "replayData";
  gameId: number;
  summary: ReplayGameSummary;
  lines: string[];
}

/** 진행 중 게임 1건 요약 (관리자 목록용). */
export interface LiveRoomSummary {
  code: string;
  startedAt: string;
  players: { nickname: string; isBot: boolean }[];
}

export interface LiveGamesMessage {
  type: "liveGames";
  rooms: LiveRoomSummary[];
}

/** 관전 시작 확인 — 이후 view(관전자 시점)·roundOver 등이 스트림된다. */
export interface SpectateStartedMessage {
  type: "spectateStarted";
  code: string;
}

/** 관전 종료 (게임 종료·방 소멸 등). */
export interface SpectateEndedMessage {
  type: "spectateEnded";
  code: string;
  reason: string;
}

/**
 * 증강 테스트 게임 상태 (관리자 전용) — 판이 시작·재시작될 때마다 전송한다.
 * 이 메시지를 받은 클라이언트는 증강 테스트 패널을 열고, 이전 판의 잔상
 * (프롬프트·결과 화면·순위)을 정리한 뒤 새 판의 뷰를 받는다.
 */
export interface SandboxMessage {
  type: "sandbox";
  code: string;
  mode: GameMode;
  /** 이 판 시작 시 좌석별로 미리 지급된 증강 */
  augments: Record<string, string[]>;
  /** 이 판 시작 시 좌석별로 강제 배패된 손패 (kindKey 목록). 비었으면 무작위 배패. */
  hands: Record<string, string[]>;
  /** 지금 걸려 있는 봇 행동 제약 */
  botRules: SandboxBotRules;
  /** 봇 좌석 직접 조작 모드가 켜져 있는가 */
  control: boolean;
  /** 이 테스트 방에서 관리자 본인이 실제로 앉은 좌석 id (조작·복귀 기준) */
  seat: PlayerId;
  /** 현재 관찰 중인 좌석 id (또는 SPECTATOR_ID). 본인 좌석이면 평소대로 조작 가능. */
  viewAs: PlayerId;
}

/**
 * 증강 테스트 설정 변경 알림 (관리자 전용) — 판을 갈아엎지 않고 바뀌는 값만 보낸다.
 * `sandbox` 메시지는 "새 판이 시작됐다"는 신호라 클라이언트가 프롬프트·결과 화면을
 * 통째로 정리한다. 봇 제약 토글·시점 전환처럼 판이 그대로인 변경은 이쪽으로 보낸다.
 */
export interface SandboxConfigMessage {
  type: "sandboxConfig";
  botRules: SandboxBotRules;
  /** 봇 좌석 직접 조작 모드 on/off */
  control: boolean;
  /** 지금 내가 실제로 조종 중인 봇 좌석 (없으면 null) */
  controlling: PlayerId | null;
}

/**
 * 액션 연출 트리거 — 표준 액션(버림·리치·후로 등)이 아닌 특수 액션
 * (액티브 증강 발동 등)이 실행될 때 전원에게 브로드캐스트된다.
 */
export interface ActionFxMessage {
  type: "actionFx";
  player: PlayerId;
  actionType: string;
}

export type ServerMessage =
  | JoinedMessage
  | ViewMessage
  | PromptMessage
  | PromptCancelMessage
  | DraftOfferMessage
  | CatalogMessage
  | RoundOverMessage
  | GameOverMessage
  | AbortVoteMessage
  | GameAbortedMessage
  | ErrorMessage
  | PongMessage
  | LobbyMessage
  | KickedMessage
  | StatsMessage
  | LeaderboardMessage
  | FeedbackListMessage
  | AdminUsersMessage
  | AdminAugmentTiersMessage
  | AuthOkMessage
  | RoomCreatedMessage
  | ReplayListMessage
  | ReplayDataMessage
  | LiveGamesMessage
  | SpectateStartedMessage
  | SpectateEndedMessage
  | SandboxMessage
  | SandboxConfigMessage
  | ActionFxMessage;
