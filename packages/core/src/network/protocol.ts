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

/**
 * 게스트 체험 — 계정 없이 봇 3명과의 1인 게임을 즉시 시작한다.
 *
 * 가입 게이트(SIGNUP_CODE)를 우회하는 것이 **아니다**. 게스트는 "놀 수 있을 뿐"
 * 계정 공간에는 들어오지 못한다 — 서버가 임시 닉네임을 발급하고, 방 만들기·코드
 * 참가·리더보드·리플레이는 전부 막혀 있다 (서버 라우터의 게스트 화이트리스트).
 */
export interface GuestPlayMessage {
  type: "guestPlay";
  /** 동풍전(기본)·반장전. */
  mode?: GameMode;
  /**
   * **튜토리얼 판**으로 열어 달라 — 배우기 좋게 판을 고정한다 (`TUTORIAL_ROOM_NOTE`).
   *
   * 체험(그냥 `guestPlay`)과 다른 점은 셋이다: 손패·시작 증강이 고정이고, 봇이
   * 리치·화료를 하지 않으며, **결정에 시간 제한이 사실상 없다**. 마지막 하나가
   * 이 플래그를 만든 이유다 — 안내를 읽는 동안 30초가 지나 증강이 제멋대로
   * 뽑히면 그건 튜토리얼이 아니다 (2026-08-18 사용자 지시).
   */
  tutorial?: boolean;
}

/**
 * **체험 대국으로 돌아오기** — 끊긴 게스트가 자기 판을 되찾는다 (감사 §2-5).
 *
 * 예전에는 손님의 소켓이 닫히는 순간 방이 삭제됐다. 게스트에게는 세션 토큰이 없어
 * 재접속 수단이 **구조적으로 0**이었기 때문인데, 결과적으로 **모바일에서 앱을 한 번
 * 전환하면 첫인상이 그대로 증발**했다 — 이 게임을 처음 보는 사람에게 가장 나쁜 순간에
 * 가장 나쁜 일이 일어났다.
 *
 * 그래서 계정을 만들지 않고도 **그 판 하나만** 되찾을 수 있는 열쇠를 준다. 이 토큰은
 * 계정이 아니라 **방 하나**를 가리킨다: 그 방이 사라지면 같이 죽고, 다른 방·다른
 * 기능에는 쓸 수 없다. 세션 토큰(30일·계정 전체)과 섞이지 않도록 별도 필드·별도
 * 저장 키를 쓴다.
 */
export interface GuestResumeMessage {
  type: "guestResume";
  token: string;
}

/**
 * **증강 도감을 로그인 전에도 연다** (감사 §3-7).
 *
 * 예전에는 카탈로그를 인증 뒤에만 보냈다. 그런데 랜딩 → 규칙 → "증강이란" 탭의
 * `📖 증강 도감 열기` 버튼은 인증과 **무관하게** 렌더된다 — 누르면 "0/0종 ·
 * 증강이 없습니다"가 떴다. 이 게임의 유일한 차별점을 보러 온 사람에게 가장
 * 나쁜 대답이다.
 *
 * **`serverInfo`에 얹지 않은 이유**: 카탈로그는 상세 설명까지 포함해 수십 KB다.
 * 모든 연결이 자동으로 받으면 도감을 안 여는 사람까지 그 비용을 낸다. 요청은
 * 도감을 실제로 열 때 한 번만 나간다.
 *
 * 감출 것이 없는 정보다 — 랜딩이 종수를 광고하고, 게임에 들어가면 어차피 전부
 * 받는다. 그래도 비싼 조회 목록(`HEAVY_MESSAGES`)에 넣어 연타를 막는다.
 */
export interface CatalogRequestMessage {
  type: "catalogRequest";
}

/**
 * **연습 대국** — 로그인한 사람이 봇 3명과 곧바로 한 판.
 *
 * 게스트 체험(`guestPlay`)과 같은 방을 계정 있는 사람에게 준다: 방 코드를 만들고
 * 사람을 기다리는 단계가 통째로 없고, **기록도 남지 않는다**(리플레이·리더보드·증강
 * 통계 어디에도 안 들어간다).
 *
 * 이걸 따로 둔 이유는 **첫 사용자 튜토리얼** 때문이다. 갓 가입한 사람에게 필요한 것은
 * "방을 만들고 봇을 채우고 시작을 누르세요"가 아니라 **지금 당장 한 판**이다
 * (`client/src/tutorial.ts`). `guestPlay`는 로그인한 연결을 거절하므로(계정 좌석을
 * 임시 신원으로 갈아 끼우면 진행 중인 게임의 주인이 바뀐다) 그 길을 쓸 수 없었다.
 */
export interface PracticePlayMessage {
  type: "practicePlay";
  /** 동풍전(기본)·반장전. */
  mode?: GameMode;
  /** 튜토리얼 판으로 열기 — `GuestPlayMessage.tutorial`과 같은 뜻이다. */
  tutorial?: boolean;
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

// ── 정형구 (2026-08-18) ──

/**
 * 정형구 — 미리 정해진 문구 하나를 같은 방 사람들에게 보낸다.
 *
 * **자유 입력이 아니다.** 4인 대전인데 "리치", "감사합니다", "좋은 판" 같은 최소한의
 * 사교 신호조차 없어서 외부 음성채팅이 사실상 필수였다(감사 2026-08-17 §4-9).
 * 그렇다고 자유 채팅을 열면 욕설·인신공격을 걸러야 하는데, 그건 이 규모의 운영이
 * 감당할 일이 아니다. 고정 문구 세트는 그 둘 사이의 답이다 — 사교는 되고
 * 모더레이션은 필요 없다.
 *
 * `id`는 `EMOTES`의 것만 유효하다. 서버가 목록에 없는 값을 거른다 —
 * 클라이언트가 보낸 문자열을 그대로 남에게 뿌리는 길은 열어 두지 않는다.
 */
export interface EmoteMessage {
  type: "emote";
  id: string;
}

/**
 * 보낼 수 있는 문구 전부. 클라이언트가 버튼을 그리고, 서버가 검증에 쓴다 —
 * **목록이 한 벌이어야** 화면에 없는 문구가 남에게 도착하는 일이 없다.
 *
 * 고른 기준: 마작 자리에서 실제로 오가는 말이면서, **상대를 몰아붙이는 데 쓸 수 없는**
 * 것. "빨리 두세요"·"?" 같은 재촉·조롱은 넣지 않는다 — 고정 문구의 장점은 나쁜 말을
 * 애초에 만들 수 없다는 것인데, 목록에 넣으면 그 장점을 스스로 버린다.
 */
export const EMOTES: readonly { id: string; text: string }[] = [
  { id: "greet", text: "잘 부탁드립니다" },
  { id: "thanks", text: "감사합니다" },
  { id: "sorry", text: "미안합니다" },
  { id: "nice", text: "좋은 판이었습니다" },
  { id: "wow", text: "대단하네요" },
  { id: "lucky", text: "운이 좋았습니다" },
  { id: "wait", text: "잠깐만요" },
  { id: "gg", text: "수고하셨습니다" },
] as const;

/** 이 문구가 목록에 있는가 — 서버가 받은 값을 그대로 믿지 않으려고 쓴다. */
export function isEmoteId(id: string): boolean {
  return EMOTES.some((e) => e.id === id);
}


// ── 리플레이 (15) ──

/** 내 리플레이 목록 요청. */
export interface ReplayListRequestMessage {
  type: "replayList";
}

/**
 * 리플레이 이벤트 로그 요청 (본인 게임 또는 관리자).
 *
 * `shareToken`이 오면 **그 토큰이 곧 권한**이다 (감사 §4-8, 사용자 결정 "링크 있는
 * 사람만"). 그때는 `gameId`를 보지 않는다 — 토큰이 어느 판을 가리키는지 서버가
 * 안다. 로그인하지 않은 연결도 이 경로로만 리플레이 하나를 볼 수 있다.
 */
export interface ReplayGetMessage {
  type: "replayGet";
  gameId?: number;
  /** 공유 링크의 토큰. 있으면 계정 대신 이 값이 권한이 된다. */
  shareToken?: string;
}

/**
 * **이 판의 공유 링크를 만든다** (참가자·관리자 전용, §4-8).
 *
 * 이미 있으면 그 토큰을 그대로 돌려준다 — 누를 때마다 새 링크가 나오면 앞서
 * 뿌린 링크가 조용히 죽는다. 내리고 싶으면 `revoke`를 준다.
 *
 * **왜 "공개/비공개" 두 상태가 아니라 토큰인가**: 이 게임의 최대 무기는 "이 증강
 * 조합 봐라"인데(감사 §4-8), 그걸 자랑하려면 **계정이 없는 사람에게도** 보여 줄 수
 * 있어야 한다. 반대로 전체 공개 목록을 만들면 남의 판이 검색·목록에 노출되므로
 * 그건 다른 결정이 필요하다. 토큰은 그 사이의 답이다 — 링크를 받은 사람만 본다.
 */
export interface ReplayShareMessage {
  type: "replayShare";
  gameId: number;
  /** 참이면 링크를 **내린다** (기존 토큰이 죽는다). */
  revoke?: boolean;
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

// ── 친구 (§4-6) ──

/**
 * 친구 추가·삭제 (§4-6).
 *
 * **무엇을 풀려는 문제인가**: 방을 만들고 코드를 부를 사람이 지금 접속해 있는지
 * 알 방법이 없었다. 그래서 사람들은 방을 만들어 두고(TTL 30분) 기다리다 닫았다.
 * 필요한 것은 소셜 그래프가 아니라 **"지금 있나?" 한 줄**이다.
 *
 * 그래서 이 기능에는 **승인 절차가 없다.** 맞팔 개념도, 요청 알림도 없다 —
 * 여기서 얻는 것은 상대의 온라인 여부뿐이고, 그건 방 코드를 나눌 사이라면
 * 이미 서로 아는 사실이다. 승인 흐름을 만들면 그 대가로 화면과 상태가 배로 는다.
 */
export interface FriendAddMessage {
  type: "friendAdd";
  nickname: string;
}

export interface FriendRemoveMessage {
  type: "friendRemove";
  nickname: string;
}

/** 내 친구 목록 요청. */
export interface FriendListRequestMessage {
  type: "friendList";
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

/**
 * 자체 집계 요청 (관리자 전용, §8-6).
 *
 * 이 서버는 외부 분석 스크립트를 넣지 않는다(CSP `script-src 'self'`를 손대야 하고,
 * 그 한 줄이 곧 제3자에게 우리 화면의 실행 권한을 주는 일이다). 대신 서버가 직접
 * 센 수를 관리자에게만 돌려준다.
 */
export interface AdminAnalyticsRequestMessage {
  type: "adminAnalytics";
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

/**
 * 증강 선택창의 **슬롯 하나를 새로고침**한다 — 그 자리의 카드를 미리 뽑아 둔 교체분으로
 * 갈아 끼운다. 슬롯당 1회뿐이고, 교체분은 좌석별 후보 칸에서 제시와 함께 뽑혀 있어
 * 다른 사람의 카드·보유 증강과 겹치지 않는다(DraftController.rollWithRerolls).
 *
 * 서버는 성공하면 `draftRerolled`로 새 카드를 돌려준다. 이미 쓴 슬롯·범위 밖 슬롯은
 * 조용히 무시한다 — 화면이 이미 버튼을 잠갔으므로 정상 흐름에서 올 수 없는 요청이다.
 */
export interface DraftRerollMessage {
  type: "draftReroll";
  stage: DraftStage;
  /** 갈아 끼울 슬롯 (0-based, 화면 왼쪽부터) */
  slot: number;
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
 * 봇 난이도를 바꾼다 (방장 전용, 대기 중에만).
 *
 * 성향(원형)과는 다른 축이다 — 원형은 **어떻게 두는가**, 난이도는 **얼마나 잘 두는가**다.
 * 기본은 `hard`(= 종전 봇 그대로)이고 그 위로는 열지 않는다. 적용은 판이 시작될 때다.
 */
export interface SetBotDifficultyMessage {
  type: "setBotDifficulty";
  /** `easy` · `normal` · `hard`. 서버가 모르는 값이면 무시한다. */
  difficulty: string;
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
  | DraftRerollMessage
  | PingMessage
  | HandOrderMessage
  | RoundContinueMessage
  | ReadyMessage
  | AddBotMessage
  | RemoveBotMessage
  | SetBotArchetypeMessage
  | SetBotDifficultyMessage
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
  | GuestPlayMessage
  | GuestResumeMessage
  | CatalogRequestMessage
  | PracticePlayMessage
  | CreateRoomMessage
  | JoinRoomMessage
  | LeaveRoomMessage
  | EmoteMessage
  | ReplayListRequestMessage
  | ReplayGetMessage
  | ReplayShareMessage
  | LeaderboardRequestMessage
  | FriendAddMessage
  | FriendRemoveMessage
  | FriendListRequestMessage
  | FeedbackSubmitMessage
  | FeedbackListRequestMessage
  | FeedbackUpdateMessage
  | FeedbackDeleteMessage
  | AdminSetNoticeMessage
  | AdminUsersRequestMessage
  | AdminAugmentTiersRequestMessage
  | AdminAnalyticsRequestMessage
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
  /**
   * 왜 접혔는가 — 생략하면 이유를 모른다(구 동작).
   *
   * 예전에는 이 메시지가 UI를 **말없이** 닫기만 했다. 그래서 "제한 시간이 지나 서버가
   * 대신 골랐다"와 "더 높은 선언이 확정돼 내 선택이 결과를 못 바꾼다"가 화면에서 똑같이
   * 보였고, 플레이어에게는 둘 다 "누르려던 론 버튼이 그냥 사라졌다"였다. 초읽기
   * (time_pressure) 국은 제한이 5초라 이 일이 상시로 일어난다.
   *
   * - `timeout`  : 마감을 넘겨 `safeFallbackOption`으로 대신 진행했다.
   * - `preempted`: 우선순위가 더 높은 선언이 이미 확정됐다.
   */
  reason?: "timeout" | "preempted";
  /** 서버가 대신 고른 선택의 표시 이름 (`timeout`일 때만, 예: "쯔모기리"·"패스") */
  chosen?: string;
}

/**
 * 증강 선택 시간이 다 되어 서버가 대신 골랐다 — **무엇이 뽑혔는지** 알린다.
 *
 * 선택창은 "시간이 다 되면 랜덤으로 결정된다"고 미리 적어 두면서 결과는 말하지 않았다.
 * 그래서 자리를 잠깐 비운 사람에게는 "안 고른 증강이 생겼다"로만 보였다.
 */
export interface DraftAutoPickedMessage {
  type: "draftAutoPicked";
  augmentId: string;
  /** 표시 이름 — 클라이언트가 카탈로그를 못 찾는 경우에도 이름은 말할 수 있게 함께 보낸다 */
  name: string;
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
  /**
   * 슬롯별 **새로고침이 아직 남았는가** (choices와 같은 길이·순서).
   *
   * 재접속 복원에도 그대로 실려 나가므로, 끊겼다 돌아와도 이미 쓴 슬롯의 버튼은
   * 잠긴 채로 뜬다. 없으면(구 서버) 새로고침 자체가 없는 것으로 본다.
   */
  rerollable?: boolean[];
}

/**
 * 새로고침 결과 — 그 슬롯의 카드를 이것으로 갈아 끼운다. 요청한 본인에게만 간다.
 * 이 메시지를 받은 슬롯의 새로고침은 소진된 것으로 본다(슬롯당 1회).
 */
export interface DraftRerolledMessage {
  type: "draftRerolled";
  /** 갈아 끼운 슬롯 (0-based) */
  slot: number;
  choice: {
    id: string;
    tier: AugmentTier;
    name: string;
    description: string;
  };
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
  /**
   * 표도라 표시패 — 결과 화면이 `도라 N판`만 적고 표시패를 안 보여 줘서, 판수의 근거를
   * 그 자리에서 확인할 수 없었다(결과 오버레이가 판을 완전히 덮어 뒤의 도라 줄도 못 본다).
   * 구 리플레이에는 없으므로 선택 필드다.
   */
  doraIndicators?: TileId[];
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

/**
 * 판이 끝난 이유 — 결과 화면이 한 줄로 말해 준다.
 *
 * 예전에는 "대국 종료"뿐이라, 남2국에서 갑자기 순위표가 뜨면(도비) 버그로 읽혔다.
 * 아가리야메는 오야가 한 국 더 있는 줄 알고 노린 연장이 그대로 종국이 되는 경우가 있어,
 * 설명이 없으면 특히 억울하다.
 *
 * - `normal`           : 정규 구간을 다 쳤다.
 * - `dobi`             : 누군가 0점 아래로 떨어졌다.
 * - `agariYame`        : 오라스에서 오야가 연장하며 단독 1위라 그대로 끝냈다.
 * - `westEntryDecided` : 서든데스 구간에서 반환점을 넘겼다.
 * - `instantWin`       : 즉시 종료 증강(천하통일)의 문턱 점수에 닿았다.
 */
export type GameEndReason =
  | "normal"
  | "dobi"
  | "agariYame"
  | "westEntryDecided"
  | "instantWin";

export interface GameOverMessage {
  type: "gameOver";
  rankings: RankingEntry[];
  /** 왜 끝났는가 (생략되면 평범한 종국으로 본다 — 구 리플레이 호환) */
  reason?: GameEndReason;
  /**
   * 방이 살아 있어 그대로 한 판 더 갈 수 있다 — 결과 화면의 "이어하기"가 이 값으로 뜬다.
   * 방은 종국과 함께 **대기실 상태**로 돌아가므로, 이어하기는 그 대기실로 되돌아가는 것이고
   * 다음 판은 평소처럼 전원 준비 + 방장 시작으로 열린다.
   */
  canContinue?: boolean;
  /**
   * 방금 끝난 이 판의 리플레이 id — 결과 화면의 "이 판 다시 보기"가 쓴다.
   * 기록을 남기지 않는 판(증강 테스트·게스트 체험)에는 없다.
   */
  gameId?: number;
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

/**
 * 정형구가 도착했다 — 같은 방 사람들에게 나간다(보낸 사람 포함).
 *
 * ⚠ **서버 → 클라이언트 구간에 있어야 한다.** 앞 구간에 두면 재전송 정책 테스트가
 * 이걸 클라이언트 메시지로 세어 "분류되지 않았다"고 잡는다(실제로 그렇게 잡혔다).
 */
export interface EmoteBroadcastMessage {
  type: "emoteFrom";
  player: PlayerId;
  nickname: string;
  id: string;
}

export interface PongMessage {
  type: "pong";
}

/**
 * 서버 안내 — 연결 직후(인증 전) 서버가 먼저 한 번 보낸다.
 *
 * 로그인 화면이 **거짓말을 하지 않기 위해** 필요하다. 예전에는 클라이언트가
 * 가입 게이트가 켜졌는지 알 수 없어 가입 코드 칸에 "서버에 설정된 경우 필요"
 * 라고 얼버무렸고, 게이트가 켜진 공개 서버에서는 방문자가 폼을 다 채운 뒤에야
 * 3.2초짜리 토스트로 거절당했다. 이제 폼이 미리 안다.
 */
export interface ServerInfoMessage {
  type: "serverInfo";
  /** 가입 코드가 필요한 서버인가 (SIGNUP_CODE 설정 여부). */
  signupGate: boolean;
  /** 게스트 체험을 받는 서버인가. */
  guestPlay: boolean;
  /**
   * 이 서버가 굴리는 증강 종수.
   *
   * 도움말이 "N종"을 말할 때 쓴다. 클라이언트가 직접 세지 않는 이유는 그 한 줄
   * (`contentAugments.length`) 때문에 증강 구현 전체가 번들에 딸려 들어왔기
   * 때문이다(감사 §7-1). **인증 전에도** 오는 값이라 랜딩에서 규칙을 펼친
   * 사람에게도 올바른 숫자가 보인다.
   */
  augmentKinds: number;
  /**
   * 운영자 공지 (없으면 필드 자체가 붙지 않는다) — 감사 §4-3.
   *
   * **왜 `serverInfo`에 얹었나**: 이 메시지는 소켓이 열리는 즉시, **인증 전에**
   * 나간다. 공지가 필요한 순간(점검 예고·규칙 변경·서버 이전)은 대개 사람들이
   * 로그인하기 **전에** 알아야 하는 순간이다. 별도 요청으로 두면 그 순간에만
   * 딱 안 오는 값이 된다.
   *
   * 길이 상한이 있고(`NOTICE_MAX`) 서버가 자른다 — 여기 담기는 값은 매 연결에
   * 나가므로, 누가 실수로 긴 글을 넣으면 전원의 첫 프레임이 무거워진다.
   */
  notice?: ServerNotice;
}

/**
 * 공지 한 건. 증강 117종이 20판마다 자동 티어 조정되는 게임인데 "뭐가 바뀌었는지"를
 * 알릴 채널이 하나도 없었다(감사 §4-3). 저장소는 이미 있던 `config` 테이블이다.
 */
export interface ServerNotice {
  /** 한 줄 제목 — 홈 상단 띠에 그대로 뜬다. */
  title: string;
  /** 본문 (여러 줄 가능). 비어 있으면 제목만 보여 준다. */
  body: string;
  /** 마지막으로 고친 시각(ISO). 사람이 "언제 적인 공지인가"를 판단하는 근거다. */
  updatedAt: string;
}

/** 공지 길이 상한 — 매 연결에 나가는 값이라 서버가 자른다. */
export const NOTICE_TITLE_MAX = 120;
export const NOTICE_BODY_MAX = 2000;

/**
 * 공지 설정 (관리자 전용). 제목을 비우면 공지를 **내린다**.
 *
 * 삭제를 별도 메시지로 두지 않은 이유: "제목 없는 공지"는 존재할 수 없으므로
 * 빈 제목이 곧 삭제다. 두 경로를 두면 한쪽만 고쳐진 자리가 생긴다.
 */
export interface AdminSetNoticeMessage {
  type: "adminSetNotice";
  title: string;
  body: string;
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
  /** 봇 난이도 (`easy`·`normal`·`hard`). 방장만 바꿀 수 있다. */
  botDifficulty: string;
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

/**
 * 기간 성적 한 칸 (감사 §4-7).
 *
 * **왜 별도 구조인가**: `PlayerStatsRaw`에는 타임스탬프가 **한 개도 없다**. 그래서
 * "이번 주 성적"·"오늘 세 판" 같은 기간 기반 동기가 구조적으로 불가능했다. 누적
 * 통계에 시간을 넣으려면 기록 형식을 바꿔야 하고 그건 과거 데이터를 못 살린다 —
 * 대신 **이미 시각을 갖고 있는 `games.ended_at`에서 되만든다.** 판수·순위 분포처럼
 * 게임 인덱스만으로 셀 수 있는 것만 담는 이유가 이것이다(화료율·방총률은 그 표에 없다).
 */
export interface PeriodStats {
  /** 며칠 치인가 (7·30). */
  days: number;
  /** 그 기간의 완료 판수. */
  games: number;
  /** 1~4위 횟수 (인덱스 0이 1위). */
  placements: [number, number, number, number];
  /** 평균 순위 (판수 0이면 0). */
  avgRank: number;
}

/** 통계 전송 — 게임 종료 시(이번 판 + 누적) 또는 요청 응답. */
export interface StatsMessage {
  type: "stats";
  /** 이번 반장전 통계 (게임 종료 시에만). */
  game?: StatsEntry[];
  /** 누적(career) 통계. */
  career: StatsEntry[];
  /**
   * **요청한 본인의** 기간 성적 (§4-7). 로그인한 요청에만 실린다.
   * 최근 것부터 — 지금은 7일·30일 둘이다.
   */
  periods?: PeriodStats[];
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
  /**
   * 자동 로그인용 세션 토큰 (클라이언트가 저장).
   * 게스트는 빈 문자열 — 게스트에게는 계정이 없으므로 계정 세션도 없다.
   */
  sessionToken: string;
  /**
   * 게스트 체험 세션인가. 참이면 클라이언트는 홈·통계·리플레이를 요청하지 않고
   * (서버가 어차피 거부한다) 게임이 끝나면 가입 안내를 보여 준다.
   */
  guest?: boolean;
  /**
   * **그 체험 판 하나로 돌아오는 열쇠** (`guestResume`에 그대로 되돌려 보낸다).
   *
   * 계정 세션과 뜻이 완전히 다르다 — 가리키는 것이 사람이 아니라 **방 하나**이고,
   * 그 방이 끝나면 함께 죽는다. 그래서 `sessionToken`에 얹지 않고 별도 필드로 둔다:
   * 한 필드에 두 가지 수명·두 가지 권한을 담으면 언젠가 한쪽 규칙이 다른 쪽에 샌다.
   */
  guestToken?: string;
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

/**
 * 공유 링크 상태 — `replayShare` 의 응답.
 *
 * ⚠ **서버 → 클라이언트 메시지다.** 클라이언트 구간에 두면 재전송 정책 테스트가
 * 이걸 "분류되지 않은 클라이언트 메시지"로 잡는다(2026-08-18 `EmoteBroadcastMessage`가
 * 같은 함정에 걸렸다). 정의 위치가 곧 방향이다.
 */
export interface ReplayShareTokenMessage {
  type: "replayShareToken";
  gameId: number;
  /** null이면 링크가 없다(내려갔거나 아직 안 만들었다). */
  token: string | null;
}

/**
 * 친구 한 명의 지금 상태 (§4-6).
 *
 * ⚠ **서버 → 클라이언트 메시지 구간이다** — 클라이언트 구간에 두면 재전송 정책
 * 테스트가 "분류되지 않은 클라이언트 메시지"로 잡는다.
 */
export interface FriendEntry {
  nickname: string;
  /** 지금 이 서버에 붙어 있는가. */
  online: boolean;
  /** 지금 대국 중인가 (온라인이면서 방에 앉아 있다). */
  playing: boolean;
}

export interface FriendListMessage {
  type: "friendList";
  friends: FriendEntry[];
}

/** 하루치 집계 한 줄 (§8-6). IP·UA는 어디에도 남지 않는다 — 서버 analytics.ts 참고. */
export interface AnalyticsDayEntry {
  /** YYYY-MM-DD */
  date: string;
  /** 첫 화면 문서 요청 수 */
  views: number;
  /** 그날의 서로 다른 방문자 수 (날짜가 바뀌면 키가 갈려 추적이 이어지지 않는다) */
  visitors: number;
  /** WebSocket 연결 수 — 실제로 게임까지 간 사람의 하한 */
  sockets: number;
}

export interface AdminAnalyticsMessage {
  type: "adminAnalytics";
  days: AnalyticsDayEntry[];
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
  | DraftAutoPickedMessage
  | DraftRerolledMessage
  | CatalogMessage
  | RoundOverMessage
  | GameOverMessage
  | AbortVoteMessage
  | GameAbortedMessage
  | ErrorMessage
  | EmoteBroadcastMessage
  | PongMessage
  | ServerInfoMessage
  | LobbyMessage
  | KickedMessage
  | StatsMessage
  | LeaderboardMessage
  | FeedbackListMessage
  | AdminUsersMessage
  | AdminAugmentTiersMessage
  | AdminAnalyticsMessage
  | AuthOkMessage
  | RoomCreatedMessage
  | ReplayListMessage
  | ReplayDataMessage
  | ReplayShareTokenMessage
  | FriendListMessage
  | LiveGamesMessage
  | SpectateStartedMessage
  | SpectateEndedMessage
  | SandboxMessage
  | SandboxConfigMessage
  | ActionFxMessage;
