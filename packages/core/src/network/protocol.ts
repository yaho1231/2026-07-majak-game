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
import type { AugmentDef, AugmentTier } from "../augment/Augment.js";
import type { PlayerStatsView } from "../stats/PlayerStats.js";

// ─────────────────────────── 클라이언트 → 서버 ───────────────────────────

export type DraftStage = "gameStart" | "southEntry";

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

// ── 관리자 관전 (15) ──

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

/** 게임 시작 (방장 전용, 전원 준비 + 4인일 때만 유효). */
export interface StartGameMessage {
  type: "startGame";
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
  | RoundContinueMessage
  | ReadyMessage
  | AddBotMessage
  | RemoveBotMessage
  | StartGameMessage
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
  | LiveGamesRequestMessage
  | SpectateMessage
  | SpectateStopMessage;

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
}

/** 증강 카탈로그 항목 (표시용 — 클라이언트가 id→이름을 얻는 유일한 경로) */
export interface AugmentCatalogEntry {
  id: string;
  tier: AugmentTier;
  name: string;
  description: string;
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
  /** 부로 묶음 */
  melds: { kind: string; tiles: PublicTileView[] }[];
}

export interface RoundOverMessage {
  type: "roundOver";
  outcome: "win" | "draw" | "abort";
  /** 정산 상세 — 점수 변동·화료 정보(역 목록·판·부·점수) 포함 */
  settle: RoundSettledPayload;
  /** 화료 시 공개되는 우라도라 표시패 */
  uraDoraIndicators: TileId[];
  /** 이 메시지가 참조하는 패의 메타데이터 (우라 표시패·화료패) */
  tiles: Record<TileId, PublicTileView>;
  /** 화료자별 공개 손패 */
  revealedHands: Record<PlayerId, RevealedHand>;
}

export interface RankingEntry {
  playerId: PlayerId;
  nickname: string;
  /** 봇 여부 (순위표에서 봇 표기용) */
  isBot: boolean;
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
  isHost: boolean;
  /** 준비 완료 여부. 방장·봇은 항상 true. */
  ready: boolean;
  /** 누적(career) 통계 — 신규 플레이어면 null. */
  stats: PlayerStatsView | null;
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
 * 액션 연출 트리거 — 표준 액션(버림·리치·부로 등)이 아닌 특수 액션
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
  | DraftOfferMessage
  | CatalogMessage
  | RoundOverMessage
  | GameOverMessage
  | AbortVoteMessage
  | GameAbortedMessage
  | ErrorMessage
  | PongMessage
  | LobbyMessage
  | StatsMessage
  | AuthOkMessage
  | RoomCreatedMessage
  | ReplayListMessage
  | ReplayDataMessage
  | LiveGamesMessage
  | SpectateStartedMessage
  | SpectateEndedMessage
  | ActionFxMessage;
