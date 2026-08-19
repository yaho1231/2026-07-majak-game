/**
 * RoomManager — 서버 연결 허브: 인증 → 방(코드) → 게임 → 기록.
 *
 * 흐름:
 * 1. 모든 연결은 먼저 register/login/tokenLogin으로 인증해야 한다.
 * 2. 방장이 createRoom을 누르면 랜덤 6자 코드가 생성되고, 나머지는
 *    joinRoom{code}로 참가한다. 방장 외 전원 준비 → 방장이 startGame.
 * 3. 게임 중 끊긴 사람은 같은 계정으로 joinRoom{code}만 하면
 *    신원(닉네임) 기준으로 재접속된다 (별도 토큰 불필요).
 * 4. 게임이 끝나면 리플레이 경로·참가자·순위를 SQLite에 기록하고
 *    통계를 닉네임(=계정) 키로 영속화한다.
 * 5. 관리자는 liveGames/spectate로 진행 중 게임을 실시간 관전한다.
 *
 * 설계: docs/12_NETWORK_REPLAY.md §6, docs/15_ACCOUNTS_SITE.md
 */

import { randomUUID, randomInt, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { WebSocket } from "ws";
import { contentAugments } from "@majak/content";
import { AugmentRegistry } from "@majak/core/augment/AugmentRegistry.js";
import { standardAugments } from "@majak/core/augment/standardAugments.js";
import {
  AUGMENT_POWER_TIERS,
  POWER_TIER_LABEL,
  POWER_TIER_ORDER,
  POWER_TIER_WEIGHT,
  powerScore,
} from "@majak/core/augment/powerTier.js";
import { HanchanController, hanchanConfigForMode } from "@majak/core/match/HanchanController.js";
import type { SpectatorSink } from "@majak/core/match/HanchanController.js";
import type { GameMode } from "@majak/core/engine/state/GameState.js";
import type { PlayerAgent } from "@majak/core/match/PlayerAgent.js";
import { SPECTATOR_ID } from "@majak/core/information/PlayerView.js";
import type { SeatConnection } from "@majak/core/information/PlayerView.js";
import { kindKey, standardKinds } from "@majak/core/mahjong/tiles/Tile.js";
import { handKindsOf, meldCountOf } from "@majak/core/mahjong/flow/helpers.js";
import { winningKinds } from "@majak/core/mahjong/scoring/waits.js";
import { isEmoteId } from "@majak/core/network/protocol.js";
import type { PlayerId } from "@majak/core/engine/zones/Zone.js";
import type {
  ClientMessage,
  ServerMessage,
  GameEndReason,
  RankingEntry,
  LobbyPlayerEntry,
  ReplayGameSummary,
  StatsEntry,
  LeaderboardEntry,
  AugmentCatalogEntry,
  AugmentTierEntry,
  AnalyticsDayEntry,
  FeedbackEntry,
  FriendListMessage,
  PeriodStats,
  SandboxBotRules,
  ServerNotice,
} from "@majak/core/network/protocol.js";
import { StatsTracker, deriveStats, createEmptyStats } from "@majak/core/stats/PlayerStats.js";
import type { AugmentStatsStore } from "./AugmentStatsStore.js";
import type { PlayerStatsRaw } from "@majak/core/stats/PlayerStats.js";
import {
  DISCONNECT_GRACE_MS,
  HumanAgent,
  MAX_BUFFERED_BYTES,
  SOLO_HOLD_MS,
  TUTORIAL_DECISION_TIMEOUT_MS,
} from "./HumanAgent.js";
import { Prng } from "@majak/core/engine/random/Prng.js";
import { BotAgent, seedFromId } from "./BotAgent.js";
import { isArchetypeName, isBotDifficulty, rollTableProfiles, withDifficulty } from "./bot/profile.js";
import type { ArchetypeName, BotDifficulty } from "./bot/profile.js";
import { SandboxBotAgent } from "./SandboxBotAgent.js";
import { ReplayWriter } from "./ReplayWriter.js";
import { reconstructGameFromFile } from "./ReplayReader.js";
import type { ResumeReconstruction } from "./ReplayReader.js";
import type { StatsStore } from "./StatsStore.js";
import { safeEqual } from "./SiteDb.js";
import type { AuthResult, LiveGameRecord, SiteDb, UserRow } from "./SiteDb.js";

/**
 * 봇의 액티브 증강 정책 조회용 전체 증강 정의(standard + content).
 * buildAugmentCatalog와 달리 install·bot 등 원본 필드가 살아 있어 BotAgent가 정책을 읽는다.
 */
const ALL_AUGMENT_DEFS = [...standardAugments, ...contentAugments];

/** 게임 레지스트리와 동일 구성(standard + content)의 정적 증강 카탈로그를 만든다. */
function buildAugmentCatalog(): AugmentCatalogEntry[] {
  const registry = new AugmentRegistry();
  registry.addAll(standardAugments);
  registry.addAll(contentAugments);
  return registry.all().map((a) => ({
    id: a.id,
    tier: a.tier,
    category: a.category,
    name: a.name,
    description: a.description,
    ...(a.detail !== undefined ? { detail: a.detail } : {}),
    ...(a.draftStages !== undefined ? { draftStages: a.draftStages } : {}),
    ...(a.modes !== undefined ? { modes: a.modes } : {}),
  }));
}

/**
 * handOrder로 받아들일 tile id 최대 개수. 손패는 진짜 용(17장)이 최대라
 * 넉넉히 잡아도 이 정도면 충분하다 — 넘치면 통째로 버린다.
 */
const MAX_HAND_ORDER = 24;

/**
 * 한 좌석이 손패 배치를 다시 뿌릴 수 있는 최소 간격(ms).
 *
 * `setHandOrder`는 **완전히 같은** 배치만 걸러낸다 — 두 배치를 번갈아 보내면
 * 전부 통과해서, 40msg/s 버킷을 꽉 채운 소켓 하나가 초당 ~160회 4좌석 뷰 생성 +
 * ~160프레임을 방 전체에 밀어 넣었다. `handOrder`는 게스트에게도 열려 있어
 * **계정 없이** 같은 방 사람들을 리렌더 폭풍에 빠뜨릴 수 있었다.
 *
 * 사람이 패를 끌어다 놓는 속도에는 250ms면 넉넉하고, 폭주는 초당 4회로 접힌다.
 */
const HAND_ORDER_MIN_INTERVAL_MS = 250;

/** 좌석 하나의 손패 배치 스로틀 상태. */
interface HandOrderThrottle {
  /** 실제로 컨트롤러에 반영한 마지막 시각(ms). */
  lastAt: number;
  /** 대기 중인 마무리 반영 타이머 (없으면 null). */
  timer: ReturnType<typeof setTimeout> | null;
  /** 아직 반영되지 않은 **가장 최근** 배치. 마지막 배치는 반드시 도착해야 한다. */
  pending: number[] | null;
}

type RoomPhase = "waiting" | "playing";

/**
 * 이 방, 이 좌석의 봇 시드.
 *
 * 시드를 안 넘기면 `BotAgent`가 **좌석 id만으로** 시드를 만든다. 그런데 방의 봇
 * 좌석은 언제나 `p1`·`p2`·`p3`이라, 그러면 세상의 모든 방이 **똑같은 성격 조합**을
 * 받았다 — 실제로 p1 공격형 · p2·p3 속공형으로 고정이었다. 원형 6종을 만들어 두고
 * 실대국에는 2종만 나왔고, 수비형·균형형·타점형·변덕형은 아레나에서만 살아 있었다.
 *
 * 방 코드는 방을 만들 때마다 새로 뽑히므로 그걸 섞으면 방마다 성격이 달라진다.
 * 그러면서도 **같은 방 코드 + 같은 좌석은 늘 같은 성격**이라 재현성은 그대로다
 * (`bot/profile.ts`가 성격을 시드 PRNG로 뽑는 이유가 그것이다).
 */
function botSeed(code: string, id: PlayerId): number {
  return seedFromId(`${code}:${id}`);
}

/**
 * 한 판의 봇 성격을 통째로 뽑는 시드.
 *
 * 방 코드만 쓰면 **같은 방에서는 영원히 같은 셋**이 나온다 — 이어하기로 열 판을
 * 해도 상대가 한 번도 안 바뀐다(`resetRoomAfterGame`이 같은 시드로 다시 만든다).
 * 판 번호를 섞어 판마다 새로 뽑되, (방 코드 + 판 번호)가 같으면 결과도 같으므로
 * 리플레이 재현성은 그대로다.
 */
function tableSeed(code: string, generation: number): number {
  return seedFromId(`${code}#${generation}`);
}

interface Room {
  code: string;
  agents: PlayerAgent[];
  /** 방장 playerId (첫 사람). */
  hostId: PlayerId | null;
  /** 준비 완료한 사람 playerId 집합 (봇·방장은 항상 준비된 것으로 취급). */
  ready: Set<PlayerId>;
  phase: RoomPhase;
  controller: HanchanController | null;
  writer: ReplayWriter | null;
  startedAt: string | null;
  /** 이 방을 관전 중인 연결들 (관리자) */
  spectators: Set<Conn>;
  /** 게임 무효(중단)에 동의한 사람 playerId 집합 (게임 중에만 의미). */
  abortVotes: Set<PlayerId>;
  /**
   * 방장이 강퇴한 사람들의 username. 이 방이 살아 있는 동안 재입장을 막는다 —
   * 코드만 알면 곧바로 되돌아올 수 있으면 강퇴가 아무 의미가 없다.
   */
  kicked: Set<string>;
  /** 선택된 게임 모드 (반장전/동풍전). 방장이 대기실에서 바꾼다. 기본 hanchan. */
  gameMode: GameMode;
  /**
   * 방장이 대기실에서 지정한 좌석별 봇 성향. 없는 자리는 시드에서 뽑은 그대로다.
   *
   * 봇 인스턴스는 판이 끝날 때마다 새로 만들어지므로(`newBot`) 지정을 봇이 아니라
   * **방이** 들고 있어야 한다 — 안 그러면 한 판 두고 오면 성향이 원래대로 돌아간다.
   */
  botArchetypes: Map<PlayerId, ArchetypeName>;
  /** 이 방에서 시작한 판의 수 — 판마다 봇 성격을 다시 뽑는 데 쓴다(tableSeed). */
  botGeneration: number;
  /** 봇 난이도. 기본 hard = skill 1.0 = 종전 봇 그대로. */
  botDifficulty: BotDifficulty;
  /**
   * 증강 테스트(샌드박스) 방 — 관리자 1명 + 봇 3명, 드래프트 없음.
   * 리플레이 파일·게임 인덱스·누적 통계를 남기지 않는다(실대국 데이터 오염 방지).
   */
  sandbox: boolean;
  /**
   * 게스트 체험 방 — 계정 없는 손님 1명 + 봇 3명. 드래프트는 실전 그대로다
   * (증강이 이 게임의 정체라 빼면 체험이 아니다).
   *
   * 샌드박스와 같은 이유로 **아무 기록도 남기지 않는다** — 리플레이 파일·게임
   * 인덱스·누적 통계·증강 집계 전부. 손님의 판이 리더보드와 도감의 근거 데이터를
   * 흔들면 계정 공간을 지키는 가입 게이트가 반쪽이 된다.
   */
  guest: boolean;
  /**
   * **튜토리얼 방** — 게스트 방(`guest: true`)의 특수형이다. 무엇이 다른지는
   * `TUTORIAL_ROOM_NOTE`에 한자리에 적어 두었다.
   */
  tutorial: boolean;
  /**
   * **이 체험 판으로 돌아오는 열쇠** (게스트 방 전용, 그 외에는 null).
   *
   * 손님에게는 계정이 없어 `joinRoom`이 쓰는 신원(username)을 다음 접속까지
   * 가져갈 방법이 없었다 — 그래서 재접속 수단이 구조적으로 0이었고, 소켓이
   * 닫히면 방을 지우는 것 말고 할 수 있는 일이 없었다(감사 §2-5).
   *
   * 이 토큰은 **방 하나만** 가리킨다. 방이 사라지면 함께 죽고, 다른 방·다른
   * 기능에는 통하지 않는다. `guestResume`이 이걸 받아 그 방의 좌석 이름으로
   * 임시 신원을 복원하면, 그다음은 기존 `joinRoom` 재접속 경로가 그대로 받는다.
   */
  guestToken: string | null;
  /**
   * 사람이 돌아오기를 기다리며 **판을 세워 둔** 시한(epoch ms). null이면 안 세웠다.
   *
   * 1인 방(게스트 체험·연습)에서만 켜진다 — 봇 셋은 기다려도 잃는 것이 없다.
   * 시한이 지나면 유휴 청소가 방을 접는다. 돌아오면 `joinRoom`/`guestResume`이
   * null로 되돌린다.
   */
  holdUntil: number | null;
  /**
   * 이어하기로 연 방이 **이어 쓸** 리플레이 파일 경로 (평소에는 null).
   * 새 파일을 열면 `__init__` 없는 반쪽 파일이 생기고 원본은 고아가 된다.
   */
  resumePath: string | null;
  /**
   * 무효 종료 시 리플레이 파일을 **지우지 않는다** (되살렸는데 아무도 안 돌아온 판).
   *
   * 평소의 무효 처리(전원 합의)는 "이 판은 없던 것으로 하자"는 사람들의 결정이라
   * 파일을 지우는 것이 맞다. 그런데 되살린 판을 아무도 찾아오지 않아 접는 것은
   * 그 결정이 아니다 — 40분짜리 반장전을 서버가 혼자 판단해 없애는 셈이 된다.
   * 그때는 `shutdown()`과 같은 처지로 본다: 파일은 남기고, 보존 기간이 지나면
   * 고아 청소가 가져간다.
   */
  preserveReplayOnAbort: boolean;
  /** 다음 판 시작 시 좌석별로 미리 지급할 증강 (샌드박스 전용) */
  sandboxAugments: Record<PlayerId, string[]>;
  /** 다음 판 시작 시 좌석별로 강제 배패할 손패 (kindKey 목록, 샌드박스 전용) */
  sandboxHands: Record<PlayerId, string[]>;
  /** 봇 행동 제약 (후로·리치·화료·증강 금지, 샌드박스 전용) */
  sandboxBotRules: SandboxBotRules;
  /** 봇 좌석 직접 조작 모드 — 켜면 관찰 중인 봇 좌석을 내가 둔다 (샌드박스 전용) */
  sandboxControl: boolean;
  /**
   * 샌드박스 재시작 대기 — 무효 종료 콜백이 방을 지우는 대신 새 판을 시작하게 한다.
   * (판 교체는 컨트롤러 abort → onGameAborted → startGame 순서로 일어난다)
   */
  sandboxRestarting: boolean;
  /**
   * 이 방에 마지막으로 "무슨 일이 일어난" 시각(epoch ms) — 유휴 방 청소의 기준.
   *
   * 방 생성·참가·대기실 조작·게임 시작/종료가 이 값을 갱신한다. 게임이 실제로
   * 돌고 있는 방(phase playing + controller 있음)은 시각과 무관하게 청소 대상이
   * 아니므로, 긴 반장전이 도중에 지워질 일은 없다.
   */
  lastActivityAt: number;
  /**
   * 좌석별 손패 배치 스로틀 상태 (`HAND_ORDER_MIN_INTERVAL_MS` 참고).
   * 방이 사라져도 남은 타이머는 한 번 깨어나 자기 방이 아직 살아 있는지 보고 그만둔다.
   */
  handOrderThrottle: Map<PlayerId, HandOrderThrottle>;
  /**
   * **판을 세워 둔 시한**(epoch ms) — 튜토리얼 코치가 말풍선을 띄우고 있는 동안
   * 봇의 결정을 멈춰 둔다 (`TUTORIAL_HOLD_NOTE`). 0이면 안 세웠다.
   */
  tutorialHoldUntil: number;
}

/** 연결 1개의 상태 — 인증·방 참가·관전을 소켓 단위로 추적한다 */
interface Conn {
  id: string;
  ws: WebSocket;
  /**
   * 이 소켓이 열린 시각(epoch ms). 익명 슬롯이 넘칠 때 **가장 오래 익명으로 앉아
   * 있던 연결부터** 회수하는 기준이다(`ANON_EVICT_GRACE_MS`).
   */
  openedAt: number;
  user: UserRow | null;
  /**
   * 계정 없는 게스트 세션인가. `user`는 DB에 없는 임시 신원(id = GUEST_USER_ID)이라
   * 이 플래그로만 구별된다 — 라우터가 이걸 보고 허용 메시지를 좁힌다.
   */
  guest: boolean;
  sessionToken: string | null;
  room: Room | null;
  agent: HumanAgent | null;
  spectating: Room | null;
  /** 최근 인증 시도 타임스탬프(ms) — 레이트리밋용 슬라이딩 윈도우 */
  authAttempts: number[];
  /** 최근 정형구 전송 시각(ms) — 도배 방지용 슬라이딩 윈도우 */
  emoteHits: number[];
  /** 이 연결의 원격 IP (핸드셰이크 시점). 로그·표시용. */
  ip: string;
  /** 남용 방어 버킷 키 (IPv4=주소, IPv6=/64 프리픽스). 상한·스로틀은 전부 이 키로 센다. */
  key: string;
  /**
   * 원격 남용 방어 면제 여부 — **소켓 상대가 진짜 루프백일 때만** 참.
   * 헤더에서 복원한 IP는 아무리 `127.0.0.1`처럼 보여도 면제되지 않는다.
   */
  exempt: boolean;
  /** 메시지 레이트리밋 토큰 버킷 상태. */
  msgTokens: number;
  msgLastRefill: number;
  /** 미인증 유예 타이머 — 인증에 성공하거나 연결이 닫히면 해제한다. */
  authDeadline: ReturnType<typeof setTimeout> | null;
  /** 누적 프로토콜 위반 횟수 (기형 프레임·형식 위반). 상한 초과 시 연결 종료. */
  violations: number;
}

const MAX_PLAYERS = 4;

/**
 * 연출용 지연(ms) 환경변수를 **검증해서** 읽는다.
 *
 * 예전에는 `Number(process.env.X ?? 기본값)`이었다. 오타 하나(`BOT_THINK_MS=1s`)면
 * `NaN`이 되는데, 이 값은 전부 `delay > 0` 꼴로만 쓰여서 `NaN > 0`이 false —
 * **경고 한 줄 없이 봇이 즉답하고 강제 수가 앞 버림과 같은 프레임에 나갔다.**
 * "봇이 기계 같다"는 제보의 원인이 설정 오타일 수 있는데 확인할 방법이 없었다
 * (2026-08-08 QA §2-10). 음수도 같은 이유로 막는다.
 *
 * 못 읽으면 **기본값으로 되돌리고 반드시 로그를 남긴다** — 조용히 0이 되는 것보다
 * 낫다. 상한도 둔다: 한 수에 1분을 기다리는 설정은 오타지 의도가 아니다.
 */
/**
 * 개수 환경변수를 **검증해서** 읽는다 (`delayEnv`의 개수 판, 문구만 다르다).
 * 못 읽으면 기본값으로 되돌리고 경고를 남긴다 — 남용 방어의 상한이 오타 하나로
 * 조용히 사라지는 것보다 시끄럽게 기본값으로 도는 편이 낫다.
 */
function countEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    console.warn(
      `[config] ${name}="${raw}" 는 ${min}~${max} 범위의 정수가 아닙니다 — 기본값 ${fallback} 을 씁니다.`,
    );
    return fallback;
  }
  return n;
}

const MAX_DELAY_MS = 60_000;
function delayEnv(name: string, fallback: number, min = 0, max = MAX_DELAY_MS): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) {
    console.warn(
      `[config] ${name}="${raw}" 는 ${min}~${max}ms 범위의 수가 아닙니다 — 기본값 ${fallback}ms 를 씁니다.`,
    );
    return fallback;
  }
  return n;
}

/**
 * 봇 행동 전 생각 시간(ms) — 즉시 타패하면 진행이 부자연스러워 한 박자 둔다.
 * 테스트(vitest)는 실제 대기를 피하려고 0, BOT_THINK_MS 환경변수로 덮어쓸 수 있다.
 */
const BOT_THINK_MS = delayEnv("BOT_THINK_MS", process.env.VITEST ? 0 : 1000);
/**
 * 강제 수(리치 쯔모기리)를 서버가 대신 두기 전의 한 박자(ms) — 고민이 아니라
 * "패가 놓이는 것을 보는" 시간이라 봇 생각 시간보다 짧다. 이게 0이면 앞 사람의
 * 버림과 같은 프레임에 나가 리치가 무엇을 흘렸는지 화면에서 사라진다.
 */
const AUTO_MOVE_MS = delayEnv("AUTO_MOVE_MS", process.env.VITEST ? 0 : 450);
/** 방 코드 문자 집합 — 혼동 문자는 제외 (O/0, I/1) */
export const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LEN = 6;

/** 방 코드로 **생길 수 있는** 문자열인가 — 공유 카드 경로처럼 밖에서 온 코드를 거를 때 쓴다. */
export function isRoomCodeShape(code: string): boolean {
  return code.length === CODE_LEN && [...code].every((ch) => CODE_CHARS.includes(ch));
}
/** 인증 레이트리밋: AUTH_WINDOW_MS 창에서 연결당 최대 AUTH_MAX_ATTEMPTS회 */
const AUTH_WINDOW_MS = 60_000;
const AUTH_MAX_ATTEMPTS = 12;
/**
 * IP 기준 인증 시도 창·상한 — 매번 새 WS 연결을 열어 연결 단위 리밋을 우회하는
 * 온라인 무차별 대입을 막는다(연결을 재생성해도 원격 IP는 그대로다).
 */
const AUTH_IP_WINDOW_MS = 60_000;
const AUTH_IP_MAX_ATTEMPTS = 30;
/** 전체 동시 WS 연결 상한 (자원 고갈 방지). */
const MAX_CONNECTIONS = 300;
/**
 * **익명 연결**(로그인 전 + 게스트)이 동시에 쥘 수 있는 슬롯 상한.
 *
 * **왜 따로 세는가** (감사 2026-08-12 §H-1). `UNAUTH_TIMEOUT_MS`가 30초에서 10분으로
 * 오른 것은 정당했다 — 30초는 스쿼터가 아니라 로그인 화면을 읽는 손님을 잡고 있었다.
 * 그런데 그러면서 미인증 스쿼팅의 비용이 **20배** 싸졌는데, 그걸 받아 주는 전역
 * 상한(`MAX_CONNECTIONS`)은 인증 여부를 구분하지 않았다.
 *
 * 그래서 IPv6 `/64` 19개에서 16개씩(=IP당 상한) 열어 두기만 하면 300칸이 전부 찬다.
 * 신규 연결 속도 제한에도 걸리지 않는다 — 버킷당 16개를 열 뿐이다. 잃는 것은 신규
 * 접속만이 아니다: **진행 중인 반장전에서 잠깐 끊긴 사람이 재접속할 자리가 없어져**
 * 유예 8회 초과로 이탈 확정되고, 40분짜리 판이 봇 자동 진행으로 흘러간다.
 *
 * 이 상한이 있으면 최소 `MAX_CONNECTIONS - MAX_ANON_CONNECTIONS`칸은 **언제나**
 * 로그인한 사람 몫으로 남는다 — 재접속이 익명 소켓에 밀리지 않는다.
 *
 * 게스트를 익명으로 세는 것이 중요하다. 게스트는 `conn.user`에 DB에 없는 임시 신원이
 * 들어가므로 "인증됨"처럼 보이지만, 실제로는 계정 없이 누구나 될 수 있는 상태다 —
 * 안 세면 `guestPlay` 한 번으로 이 상한을 통째로 빠져나간다.
 */
const MAX_ANON_CONNECTIONS_DEFAULT = Math.floor(MAX_CONNECTIONS * 0.4);
/** 상한은 **호출할 때** 읽는다 — 테스트가 값을 바꿔 가며 회수 동작을 검증할 수 있게. */
function maxAnonConnections(): number {
  return countEnv("MAX_ANON_CONNECTIONS", MAX_ANON_CONNECTIONS_DEFAULT, 1, MAX_CONNECTIONS);
}
/**
 * 익명 슬롯이 꽉 찼을 때 **오래된 익명 연결부터 회수**하되, 갓 들어온 연결은 이만큼
 * 보호한다(ms).
 *
 * 상한만 두면 공격자가 익명 슬롯을 붙들고 있는 동안 **아무도 로그인 화면에 못 온다** —
 * 새 손님도 로그인 전에는 익명이라 같은 슬롯이 필요하기 때문이다. 그래서 익명 슬롯을
 * "고정 자리"가 아니라 **회전하는 풀**로 만든다: 넘치면 가장 오래 익명으로 앉아 있던
 * 연결을 끊고 자리를 내준다. 붙들고만 있는 소켓이 먼저 나가고, 실제로 로그인하는
 * 사람은 몇 초 만에 인증되어 이 풀을 빠져나가므로 회수 대상이 되지 않는다.
 *
 * 유예가 필요한 이유: 이게 없으면 연결 폭주가 **방금 도착한 정상 손님**을 로그인
 * 화면을 그리기도 전에 밀어낸다. 유예보다 젊은 연결밖에 없으면 회수하지 않고
 * 새 연결을 거절한다.
 */
function anonEvictGraceMs(): number {
  return delayEnv("ANON_EVICT_GRACE_MS", 15_000, 0);
}
/** IP당 동시 WS 연결 상한 (연결 폭주·레이트리밋 우회 방지). 루프백/로컬은 예외. */
const MAX_CONNECTIONS_PER_IP = 16;
/** 연결당 메시지 토큰 버킷 — 한 연결이 메시지로 이벤트 루프를 폭주시키지 못하게. 루프백은 예외. */
const MSG_BUCKET_CAPACITY = 80;
const MSG_BUCKET_REFILL_PER_SEC = 40;
/**
 * **비싼 조회**들 — 종류마다 따로 세는 별도 창을 둔다 (감사 2026-08-12 §M-1).
 *
 * 토큰버킷은 메시지 **개수**만 센다. 그런데 실제 비용은 세 자릿수로 갈린다:
 *
 * | 메시지 | 1회 비용 |
 * |---|---|
 * | `ping` | 무시할 수준 |
 * | `replayList`(일반) | **동기** SQLite 쿼리 51회 (목록 1 + hydrate 50) |
 * | `replayList`(관리자) | **동기** SQLite 쿼리 201회 |
 * | `replayGet` | 최대 수백 KB 파일 읽기 + split + 배열 직렬화 |
 * | `adminUsers` | 계정마다 상관 서브쿼리, 동기 |
 *
 * `node:sqlite`는 **동기**다. 계정 하나가 `replayList`를 초당 40회 보내면 초당 약
 * 2,000회(관리자면 8,000회)의 동기 쿼리가 이벤트 루프에서 돈다. 이벤트 루프가 멈추면
 * **그 서버에서 진행 중인 모든 대국이 함께 멈춘다** — 봇 판단·타이머·뷰 브로드캐스트가
 * 전부 같은 루프에 있기 때문이다. 백프레셔 가드는 도움이 안 된다: 공격자가 응답을
 * 정상적으로 읽으면 버퍼가 차지 않고, 비용은 이미 서버가 다 치른 뒤다.
 *
 * 사람의 실제 사용은 화면을 열 때 종류별로 1회다(클라이언트가 인증 직후 한 번씩 보낸다).
 * 창당 5회면 재연결·새로고침이 겹쳐도 넉넉하고, 폭주는 40/s → 0.5/s로 접힌다.
 */
const HEAVY_MESSAGES: ReadonlySet<string> = new Set([
  "replayList",
  "replayGet",
  "leaderboard",
  "feedbackList",
  "adminUsers",
  "adminAugmentTiers",
  "liveGames",
  // 인증 **전에도** 받는 유일한 비싼 조회 (§3-7 도감). 목록 자체는 메모리에 있지만
  // 상세 설명까지 담아 수십 KB를 직렬화하므로, 연타는 여기서 접는다.
  "catalogRequest",
]);
const HEAVY_WINDOW_MS = 10_000;
const HEAVY_MAX_PER_WINDOW = 5;
/**
 * 같은 친구에게 초대장을 다시 보낼 수 있게 되기까지의 시간 (2026-08-19).
 *
 * 초대는 받는 쪽 **메인 화면에 카드로** 뜬다 — 단추 연타를 막지 않으면 그게 곧
 * 남의 화면 도배가 된다. 20초는 "안 들어오네, 한 번 더" 가 자연스럽게 되는
 * 간격이면서 연타는 접히는 길이다.
 */
const INVITE_COOLDOWN_MS = 20_000;
/**
 * `replayGet`이 한 프레임으로 내보낼 수 있는 리플레이 파일 크기 상한(bytes).
 * 운영 실측 최대는 250KB 남짓이라 정상 리플레이는 근처에도 오지 않는다 —
 * 어딘가 비정상적으로 커진 파일을 split·직렬화해 소켓에 밀어 넣지 않기 위한 그물이다.
 */
const MAX_REPLAY_BYTES = 4 * 1024 * 1024;
/** 동시 scrypt 상한 — 인증 폭주가 libuv 스레드풀을 독점해 게임 fs I/O를 굶기지 못하게. */
const MAX_SCRYPT_CONCURRENCY = 4;
/**
 * scrypt 대기 큐 상한 — 인증이 몰려 슬롯이 없을 때 무한정 큐에 쌓지 않는다.
 * 상한을 넘으면 즉시 거부해 메모리 증가와 정상 로그인 무기한 지연을 막는다.
 */
const MAX_SCRYPT_QUEUE = 64;
// 송신 버퍼 상한은 HumanAgent와 공유한다 — 예전에는 여기에만 있어서, 인게임
// 프레임(view·prompt·roundOver…)이 전부 지나가는 HumanAgent.send가 가드 없이
// 남아 있었다(2026-08-08 QA BLOCKER-6).
/**
 * 전체 동시 방 개수 상한 — 방은 코드·좌석·타이머를 붙들므로 무제한 생성은
 * 메모리 고갈과 방 코드 공간(32^6) 잠식으로 이어진다.
 */
const MAX_ROOMS = 200;
/**
 * IP당 방 생성 창·상한 — 계정을 여러 개 만들어 방만 대량으로 찍어내는 남용을
 * 막는다(계정당 동시 1방 제한은 이미 있으나, 만들고 나가기를 반복하면 우회된다).
 * 루프백/로컬은 예외.
 */
const ROOM_CREATE_WINDOW_MS = 600_000; // 10분
const ROOM_CREATE_MAX_PER_IP = 20;
/**
 * 유휴 방 청소 주기·상한(ms).
 *
 * **왜 필요한가**: 방은 만들어지고 나면 사람이 나가거나 소켓이 끊길 때만 사라졌다.
 * 그런데 브라우저 탭을 열어 둔 채 잊어버리면 소켓은 살아 있으므로 대기실이 영원히
 * 남는다 — `MAX_ROOMS`(200)는 서버 전역 상한이라, 잊힌 방 200개면 **아무도 방을
 * 만들 수 없다**(SERVER_BUSY). 그래서 "아무 일도 일어나지 않은" 대기실만 시간으로
 * 걷어낸다.
 *
 * 진행 중인 게임은 대상이 아니다. 끊긴 사람의 재접속용 좌석도 게임 중인 방에
 * 들어 있으므로 함께 보호된다.
 */
// ⚠ NaN이면 setInterval이 즉시·반복 발화한다 — 1000ms 아래는 거부한다.
const ROOM_SWEEP_INTERVAL_MS = delayEnv("ROOM_SWEEP_INTERVAL_MS", 60_000, 1000);
/** 유휴 상한은 **호출할 때** 읽는다 — 테스트가 값을 바꿔 가며 청소를 검증할 수 있게. */
function roomIdleTtlMs(): number {
  // 유휴 상한은 시(hour) 단위까지 정당하므로 연출 지연 상한(MAX_DELAY_MS)을 쓰지 않는다.
  return delayEnv("ROOM_IDLE_TTL_MS", 30 * 60_000, 0, 24 * 60 * 60_000);
}
/**
 * 컨트롤러 없이 `phase:"playing"`으로 굳은 방을 걷어내는 상한(ms).
 * 게임 시작이 실패하면 롤백이 처리하지만(startGame), 어떤 경로로든 이 상태가
 * 남으면 그 방의 네 사람은 영영 새 방을 만들 수 없다 — 마지막 그물이다.
 */
const ZOMBIE_ROOM_TTL_MS = 60_000;
/**
 * 끊긴 대국을 되살릴 수 있는 최대 경과 시간(ms) — 기본 6시간 (감사 §2-10).
 *
 * 이어하기의 값어치는 "**방금** 끊긴 판으로 돌아간다"에 있다. 하루 지난 판을
 * 되살려도 아무도 그 상황을 기억하지 못하고 방 예산만 물고 있는다. 6시간은
 * "밤에 서버가 죽었고 아침에 켰다"까지는 포기하고, "배포 중 재시작"과 "낮에 맥이
 * 잠깐 잠들었다"는 살리는 선이다. 되살리지 않아도 리플레이 파일은 그대로 남는다.
 */
const RESUME_MAX_AGE_MS = delayEnv("RESUME_MAX_AGE_MS", 6 * 60 * 60_000, 0, 24 * 60 * 60_000);
/**
 * 되살린 판이 사람을 기다리며 **세워져 있는** 시간(ms) — 기본 3분.
 *
 * 재시작 직후에는 네 사람이 **전부** 끊겨 있다. 평소의 끊김 유예(5초 × 8회)를
 * 그대로 적용하면 아무도 화면을 새로고침하기 전에 네 좌석이 다 이탈로 확정되고,
 * 그러면 되살린 보람이 없다. §2-5에서 만든 "판 세워 두기"를 그대로 쓴다.
 */
const RESUME_HOLD_MS = delayEnv("RESUME_HOLD_MS", 180_000, 1000, 30 * 60_000);

/**
 * 소켓 없이 앉는 좌석용 **이미 닫힌 소켓**.
 *
 * `HumanAgent`는 소켓을 반드시 하나 들고 있어야 하는데(생성자 인자), 되살린
 * 좌석에는 아직 붙을 소켓이 없다. null을 허용하도록 고치는 대신 "닫힌 소켓"을
 * 준다 — `send`는 `readyState !== 1`에서 그냥 돌아가고 `isConnected()`는 false다.
 * 즉 **기존 끊김 처리 경로가 그대로 적용된다**. 새 상태를 만들지 않는 것이 요점이다.
 */
function closedSocket(): WebSocket {
  return {
    readyState: 3 /* CLOSED */,
    bufferedAmount: 0,
    send: () => undefined,
    close: () => undefined,
    terminate: () => undefined,
    on: () => undefined,
  } as unknown as WebSocket;
}
/** 리더보드 캐시의 안전 수명(ms) — 명시적 무효화가 어긋나도 이 시간이면 새로 만든다. */
const LEADERBOARD_CACHE_TTL_MS = 30_000;
/**
 * 미인증 연결 유예(ms) — 이 시간 안에 로그인하지 않으면 연결을 끊는다.
 * 인증 없이 소켓만 열어 두고 연결 상한 슬롯을 점유하는 스쿼팅을 막는다.
 * (게임 기능은 이미 인증 게이트 뒤에 있지만, 소켓 자체가 자원이다.)
 *
 * ⚠ **30초는 스쿼터가 아니라 손님을 잡고 있었다** (2026-08-07 확인).
 * 로그인 화면은 아직 인증 전이다 — 계정을 찾거나 규칙을 읽는 사람은 30초를 훌쩍 넘긴다.
 * 그때마다 서버가 소켓을 회수하고 클라가 곧바로 다시 붙어, 로그인 화면에 앉아 있기만 해도
 * **30초 주기로 끊김/재연결이 무한 반복**됐다(서버 로그에 정확히 30.00초 간격 열림/닫힘).
 * 눈에 보이는 피해는 두 가지였다: "⟳ 서버와 재연결 중…" 배너가 주기적으로 번쩍였고,
 * 끊긴 그 짧은 틈에 누른 버튼은 `send()`가 조용히 버려 **아무 일도 일어나지 않았다**.
 *
 * 그래서 사람이 화면 하나를 읽는 시간을 넉넉히 넘기는 값으로 올린다. 스쿼팅 방어는
 * 그대로다 — 무한정 열어 두지 못하고, IP당 동시 연결 상한과 연결 속도 제한이 함께 막는다.
 */
const UNAUTH_TIMEOUT_MS = 10 * 60_000;
/**
 * 프로토콜 위반 허용 횟수 — 초과하면 즉시 연결을 끊는다.
 * 정상 클라이언트는 JSON 객체에 문자열 type을 담아서만 보내므로, 파싱 실패나
 * 형식 위반은 사실상 퍼징·탐색이다. 다만 클라이언트 버그로 게임 중인 사람을
 * 한 번에 끊지 않도록 아주 작은 여유만 둔다.
 */
const MAX_PROTOCOL_VIOLATIONS = 3;
/**
 * 인증 필드 길이 상한 — maxPayload(512KB) 안에서 거대한 문자열을 보내
 * scrypt·DB 조회 비용을 부풀리지 못하게 한다. SiteDb의 정책(비밀번호 8~72자)보다
 * 느슨하게 두되, 명백한 남용만 입구에서 자른다.
 */
const MAX_AUTH_FIELD_LEN = 256;
/**
 * 제보 본문·답변의 입구 상한. SiteDb가 실제 규칙(제목 80·본문 4000)을 판정하므로
 * 여기는 "거대한 문자열을 DB까지 들여보내지 않는" 여유 있는 방벽이다.
 */
const MAX_FEEDBACK_FIELD = 8000;
/**
 * 증강 테스트에서 한 좌석에 미리 지급할 수 있는 증강 수 상한.
 * 실전(1인 동풍전 3개·반장전 4개)보다 훨씬 넉넉하되, 무한정 쌓아 판을 못 돌리게 되는 것은 막는다.
 */
const MAX_SANDBOX_AUGMENTS = 40;
/** 강제 배패로 지정할 수 있는 장수 상한 (배패 13 + 여유). 넘치면 잘라 낸다. */
const MAX_SANDBOX_HAND = 14;

/**
 * 게스트의 가짜 user id. DB의 `users.id`는 1부터 증가하므로 음수는 절대 실계정과
 * 겹치지 않는다 — 어떤 코드가 실수로 이 신원을 DB 조회에 쓰더라도 아무 행에도
 * 닿지 않는다(`evictUser`·`recordGame`의 userId 조회 등).
 */
const GUEST_USER_ID = -1;
/**
 * 게스트 닉네임 접두사. `#`는 계정 닉네임 정규식(한글·영문·숫자·_-)에 없는 문자라
 * **게스트 이름으로 가입할 수 없다** — 손님이 실계정을 사칭하거나 그 반대가 되는
 * 길이 처음부터 닫혀 있다.
 */
const GUEST_NAME_PREFIX = "손님#";
/**
 * 동시 게스트 방 상한. 게스트 방도 MAX_ROOMS를 먹지만, 그 200칸을 손님이 통째로
 * 채워 실제 친구들이 방을 못 만드는 상황은 따로 막는다.
 *
 * **CPU가 진짜 상한이다.** 방 하나는 코드·좌석·타이머 정도만 붙들어 메모리는
 * 무시할 수준이지만, 봇 3명의 판단은 이 서버의 **단일 이벤트 루프**에서 돈다.
 * 이 저장소의 arena로 잰 값이 반장전 한 판(봇 4)에 CPU 13.6초 — 봇 3명이면
 * 판당 약 10초다. 실제 판은 봇 생각 딜레이 때문에 벽시계로 10~15분이 걸리므로,
 * 동시에 도는 게스트 판 하나가 코어의 약 1.5%를 계속 먹는 셈이다. 40판은
 * 코어의 60%로, 실계정 대국·리더보드·정적 서빙이 쓸 몫을 손님이 가져간다.
 * 16판이면 약 25% — 여기가 "손님을 받되 판을 굶기지 않는" 선이다.
 */
const MAX_GUEST_ROOMS = 16;
/**
 * IP당 동시 게스트 방 상한.
 *
 * 전역 상한만으로는 **한 사람이 손님 자리를 통째로 먹는 것**을 못 막는다.
 * 연결당 게스트 방은 하나지만(새 `guestPlay`는 앞 판을 접는다) IP당 동시 연결은
 * 16개까지 열리므로, 탭 16개면 게스트 슬롯 전부가 한 사람 것이 된다.
 * 레이트리밋(10분 20회)도 여기엔 안 듣는다 — 만들고 **유지**하는 것이지
 * 만들고 버리기를 반복하는 게 아니기 때문이다.
 *
 * 3으로 둔다: 폰·노트북으로 번갈아 보거나 탭을 하나 더 여는 정상 사용은 살리고,
 * 한 사람이 손님 자리의 절반 이상을 붙드는 것만 막는다. 루프백/로컬은 예외.
 */
const MAX_GUEST_ROOMS_PER_IP = 3;

/**
 * ## 튜토리얼 방 — 왜 체험판과 갈랐나 (TUTORIAL_ROOM_NOTE, 2026-08-18)
 *
 * 게스트 체험은 **진짜 판**이다: 무작위 배패, 무작위 증강, 최선을 다하는 봇.
 * 그게 맞다 — 체험은 "이 게임이 어떤 게임인지" 보여 주는 자리다.
 *
 * 그런데 **가르치는** 자리에는 그 무작위가 정면으로 방해가 된다. "액티브 증강
 * 버튼에 손을 올려 보세요"라고 말하려면 액티브 증강이 손에 있어야 하고, "보라색
 * 패는 증강이 만든 패입니다"를 보여 주려면 그 패를 만들 수단이 있어야 한다.
 * 무작위 드래프트에 맡기면 그 강의는 열 판에 한 번 나온다. 사용자도 같은 말을
 * 했다 — "튜토리얼은 게스트체험이랑은 다르게 증강이랑 손패를 튜토리얼용으로
 * 설명하기 쉽게 고정해둬도 괜찮아".
 *
 * 그래서 튜토리얼 방은 게스트 방을 그대로 상속하되(기록 없음, 끊기면 §2-5의 '판
 * 세워 두기'로 3분간 기다린다) 다섯을 고정한다:
 *
 * 1. **증강 = 연금술사 하나.** 액티브(내 턴에 직접 발동)이면서 손패의 수패를
 *    ±1 바꿔 **생성패(보라)** 를 그 자리에서 만든다. "⚡ 버튼", "발광", "보라 패"
 *    세 강의가 이 하나로 전부 선다. 게임 5회라 실컷 눌러 봐도 남는다.
 * 2. **고정 배패.** 아래 `TUTORIAL_HAND` — 코치의 대본이 그대로 성립하도록 짠 손이다.
 * 3. **봇은 리치도 화료도 하지 않는다.** 배우는 중에 봇이 3순 만에 판을 끝내면
 *    "화료" 강의는 영영 안 나온다. 후로와 타패는 그대로 두어 판은 살아 있게 한다.
 * 4. **결정에 사실상 시간 제한이 없다** (`TUTORIAL_DECISION_TIMEOUT_MS`).
 * 5. **사람이 리치를 걸면 봇이 그 대기패를 쏴 준다** (`TUTORIAL_FEED_NOTE`).
 *
 * 드래프트는 **끄지 않는다.** 증강을 고르는 것이 이 게임의 첫 조작이고, 그걸
 * 빼면 정작 가장 먼저 가르쳐야 할 화면을 안 보여 주는 셈이 된다.
 *
 * ## 증강은 드래프트로 **한 개만** 들어온다 (2026-08-19 사용자 지시)
 *
 * 예전에는 연금술사를 배패 전에 지급해 두고(`presetAugments`) 드래프트는 무작위로
 * 열어 두었다. 그러면 첫 국부터 증강이 **둘**이 된다 — 코치는 "내 증강 «연금술사»"
 * 하나만 이야기하는데 이름표에는 알약이 둘 붙고, «✦ 액티브 증강»을 누르면 고르는
 * 줄이 한 번 더 떠서 "무엇을 눌러야 하는가"가 그 자리에서 흐려진다. 사용자 지시가
 * 그대로 이것이다: "이제 고정할거니까 연금술사 한개만 있게 해줘."
 *
 * 그래서 지급을 걷고 **드래프트 쪽을 못 박는다**:
 * - 카드 석 장이 판마다 똑같이 선다 (`TUTORIAL_DRAFT_CHOICES`) — 새로고침은 없다.
 * - 그중 **연금술사만 눌린다** (`TUTORIAL_DRAFT_PICK`). 화면이 나머지를 잠그고
 *   (`DraftOfferMessage.lockedId`), 서버도 같은 값으로 답을 검증한다.
 *
 * 결과는 같다 — 배패 직후 손에 연금술사 하나. 다만 그 하나가 **사람이 직접 고른
 * 것**이라, 증강 선택 화면이라는 첫 조작을 가르치면서도 손이 흐려지지 않는다.
 */
/**
 * 튜토리얼 드래프트에 세우는 카드 석 장 — **연금술사가 첫 장**이다.
 *
 * 나머지 둘은 고르지 못하지만 아무거나가 아니다: 둘 다 난도 1(첫 드래프트에 실제로
 * 나올 수 있는 급)이고 계열이 달라, "카드마다 색과 아이콘이 다르다"는 것이 화면에서
 * 그냥 보인다. 잠긴 카드도 읽을거리이지 장식이 아니다.
 */
const TUTORIAL_DRAFT_CHOICES: readonly string[] = [
  "alchemist",
  "danger_sense",
  "triple_peek",
];

/** 튜토리얼에서 **유일하게 고를 수 있는** 증강 (`TUTORIAL_DRAFT_CHOICES`의 첫 장) */
const TUTORIAL_DRAFT_PICK = "alchemist";

/**
 * 튜토리얼 고정 배패 (kindKey 13장 + 첫 쯔모 1장).
 *
 * **대본을 손패로 적어 둔 것**이다 (클라이언트 `tutorial.ts`의 `SCRIPT_*`와 한 쌍).
 * 코치가 "필요 없는 패를 버리세요"가 아니라 "이번에는 **9삭**입니다"라고 말할 수
 * 있으려면, 버릴 패가 판마다 달라져서는 안 된다 (2026-08-18 사용자 지시).
 *
 *   배패 13장: 234m 567m 456p 7p 22s 9s   /   첫 쯔모: 1s
 *
 * 한 순씩 따라가면 이렇게 된다:
 *
 * 1. **첫 순 — 9삭을 버린다.** 손에 남는 쓸모없는 패는 9삭과 1삭 둘인데, 1삭은
 *    2삭 두 장에 붙어 있고 9삭은 아무 데도 안 붙는다. 그래서 "왜 이 패인가"까지
 *    한 줄로 가르칠 수 있는 자리가 된다 — 버릴 패가 뻔한 것만이 목적이 아니다.
 * 2. **둘째 순 — 연금술사로 1삭을 2삭으로.** 1삭은 수패 중 유일하게 방향이 하나뿐이라
 *    (0삭은 없다) 후보가 **한 개**로 떨어진다 = 패를 누르면 되묻는 창 없이 그대로
 *    발동한다. 222s가 서면서 234m 567m 222s + 4567p, 즉 **4통·7통 텐파이**다.
 * 3. **그 순에 그대로 리치.** 가져온 패를 버리면 텐파이가 유지되므로 리치가 뜬다.
 * 4. **론.** 대기 두 종류가 각각 세 장씩 살아 있고, 리치를 걸면 봇이 그중 하나를
 *    쏴 준다(`TUTORIAL_FEED_NOTE`). 대기가 넓은 것도 의도다 — 좁을수록 배우는
 *    사람이 기다리는 시간이 길어진다.
 *
 * 대본을 벗어나도(건너뛰기·다른 패를 버림) 판은 그냥 평범하게 이어진다 — 코치가
 * 일반 강의로 물러설 뿐이다.
 */
const TUTORIAL_HAND: readonly string[] = [
  "man2", "man3", "man4",
  "man5", "man6", "man7",
  "pin4", "pin5", "pin6",
  "pin7",
  "sou2", "sou2",
  "sou9",
  // ↓ 배패 13장을 넘긴 한 장 = 첫 쯔모
  "sou1",
];

/** 튜토리얼 봇 제약 — 판을 일찍 끝내지 않는다 (`TUTORIAL_ROOM_NOTE` 3). */
const TUTORIAL_BOT_RULES: SandboxBotRules = { noWin: true, noRiichi: true };

/** "쏠 것 없음" — 매 결정마다 빈 Set을 새로 만들지 않으려고 하나만 둔다. */
const EMPTY_FEED: ReadonlySet<string> = new Set<string>();

/**
 * ## 판 세워 두기 (TUTORIAL_HOLD_NOTE, 2026-08-18)
 *
 * 코치가 "증강 이름을 눌러 고정해 보세요"라고 말하는 동안에도 봇 셋은 제 차례가
 * 오면 패를 버린다. 배우는 사람이 한 문단을 읽는 사이 판이 두세 순 지나가고,
 * 가리키던 것이 화면에서 사라지기까지 한다 (2026-08-18 사용자 보고: "계속 봇이
 * 타패하니까 움직여버려"). 튜토리얼에서는 **화면이 먼저고 판이 뒤**여야 한다.
 *
 * 그래서 클라이언트가 말풍선을 띄우는 동안 `tutorialHold`를 보내고, 그 사이 봇은
 * 결정을 **내지 않고 들고 있는다**(`BotAgent.waitWhileHeld`). 사람의 차례는 원래도
 * 사람을 기다리므로 이 신호가 막는 것은 봇뿐이다.
 *
 * 신호가 끊겨도 판이 영영 멈추지 않도록 **시한**으로 건다 — 창을 닫고 사라진 손님의
 * 방이 그대로 굳어 버리면 그건 세워 둔 것이 아니라 고장이다. 한 말풍선을 읽는 데
 * 3분을 넘길 일은 없지만, 넘겨도 판이 다시 돌 뿐이라 손해가 없는 쪽으로 둔다.
 */
const TUTORIAL_HOLD_TTL_MS = 3 * 60_000;

/**
 * 튜토리얼 방에서 **컨트롤러의 최후 그물**을 얼마나 늘릴 것인가
 * (`HanchanConfig.agentDecideTimeoutMs`, 기본 90초).
 *
 * 그 그물은 "답이 영영 안 오는 에이전트"용인데, 튜토리얼에서는 둘 다 정상적으로
 * 오래 끈다 — 사람은 사실상 무제한이고(`TUTORIAL_DECISION_TIMEOUT_MS`), 봇은
 * 말풍선이 떠 있는 동안 답을 미룬다(`TUTORIAL_HOLD_NOTE`). 90초를 그대로 두면
 * **배우는 사람의 차례가 대신 두어지고**(로그: `p0 decide 무응답 90000ms`),
 * 봇의 결정도 안전 폴백으로 갈아치워져 리치 대기패 배급이 통째로 사라진다 —
 * 실제로 그렇게 유국이 났다(2026-08-18 실측).
 *
 * 끄지 않고 늘린다: 사람의 제한(30분)보다 넉넉해야 "에이전트 자신의 타이머가 먼저
 * 터진다"는 그물의 전제가 지켜지고, 그러면서도 유한해서 소프트락은 여전히 없다.
 */
const TUTORIAL_AGENT_TIMEOUT_MS = TUTORIAL_DECISION_TIMEOUT_MS + 60_000;

/**
 * 게스트 연결이 인증 뒤에 보낼 수 있는 메시지. **여기 없는 것은 전부 거부**다.
 *
 * 판을 두는 데 필요한 것(액션·드래프트·손패 배치·결과 넘기기·나가기)만 들어 있다.
 * `createRoom`/`joinRoom`이 빠져 있는 것이 핵심이다 — 게스트 게임은 서버가
 * `guestPlay` 하나로 만들어 주며, 손님은 방을 만들지도 남의 방에 들어가지도 못한다.
 */
/**
 * 정형구 속도 제한 — 10초에 5번.
 *
 * 넉넉해 보이지만 이 정도가 대화의 리듬이다("잘 부탁드립니다" → 화료 → "대단하네요").
 * 도배는 그보다 훨씬 빠른 속도로 일어나므로 이 선에서 걸린다.
 */
const EMOTE_WINDOW_MS = 10_000;
const EMOTE_MAX_IN_WINDOW = 5;

const GUEST_ALLOWED_MESSAGES: ReadonlySet<string> = new Set([
  "action",
  "draftPick",
  "draftReroll",
  "roundContinue",
  "handOrder",
  "leaveRoom",
  // 튜토리얼 손님이 "설명을 읽는 중이니 기다려 달라"고 말하는 통로 (`TUTORIAL_HOLD_NOTE`).
  // 튜토리얼 방이 아니면 서버가 무시하므로 체험 손님에게는 아무 힘이 없다.
  "tutorialHold",
  // 손님도 인사는 할 수 있어야 한다. 봇전이라 받는 사람이 없을 때도 있지만,
  // 사람이 낀 판을 나중에 열더라도 이 목록을 다시 손보지 않게 지금 넣어 둔다.
  "emote",
]);

/** 강제 배패에 쓸 수 있는 패 종류 (kindKey) — 표준 34종만. */
const VALID_TILE_KEYS = new Set(
  standardKinds().map((k) => `${k.suit}${k.rank}`),
);

/**
 * 클라이언트가 보낸 강제 배패 지정을 정제한다 —
 * 실재하는 좌석, 표준 34종 kindKey, 같은 종류 4장 이하, 좌석당 상한까지.
 * (같은 종류를 5장 요구하면 어차피 패산에 없어 조용히 무시되지만, 입구에서 자른다.)
 */
export function sanitizeSandboxHands(
  agents: readonly PlayerAgent[],
  hands?: Record<string, string[]>,
): Record<PlayerId, string[]> {
  const clean: Record<PlayerId, string[]> = {};
  if (hands === null || typeof hands !== "object") return clean;
  for (const [seat, keys] of Object.entries(hands ?? {})) {
    if (!agents.some((a) => a.id === seat) || !Array.isArray(keys)) continue;
    const picked: string[] = [];
    const used = new Map<string, number>();
    for (const key of keys) {
      if (typeof key !== "string" || !VALID_TILE_KEYS.has(key)) continue;
      const n = used.get(key) ?? 0;
      if (n >= 4) continue; // 한 종류는 4장뿐
      used.set(key, n + 1);
      picked.push(key);
      if (picked.length >= MAX_SANDBOX_HAND) break;
    }
    if (picked.length > 0) clean[seat as PlayerId] = picked;
  }
  return clean;
}

/**
 * 튜토리얼 판의 고정분 — **사람 좌석에만** 건다 (`TUTORIAL_ROOM_NOTE`).
 *
 * 좌석 id를 상수로 박지 않고 명단에서 찾는 이유: 사람이 언제나 `p0`이라는 보장이
 * 없고(좌석 배치는 `seat`이 정한다), 어긋나면 봇에게 튜토리얼 손패가 가는 조용한
 * 버그가 된다. 사람이 없으면(있을 수 없지만) 아무것도 걸지 않는다.
 */
export function tutorialPresets(agents: readonly PlayerAgent[]): {
  presetHands?: Record<PlayerId, readonly string[]>;
  presetDraftChoices?: Record<PlayerId, readonly string[]>;
} {
  const me = agents.find((a) => !a.isBot);
  if (me === undefined) return {};
  return {
    presetHands: { [me.id]: TUTORIAL_HAND },
    // 증강은 지급하지 않는다 — 드래프트에서 **직접 고른 한 개**가 전부다.
    presetDraftChoices: { [me.id]: TUTORIAL_DRAFT_CHOICES },
  };
}

/** 봇 제약 플래그를 boolean 4개로 정제한다 (클라이언트가 뭘 보내든 형태 고정). */
export function sanitizeBotRules(rules: SandboxBotRules | undefined): SandboxBotRules {
  const r = rules ?? {};
  return {
    noCall: r.noCall === true,
    noRiichi: r.noRiichi === true,
    noWin: r.noWin === true,
    noAugment: r.noAugment === true,
  };
}

/**
 * 루프백(로컬)·테스트 연결인지. 직접 노출 배포에서 원격 클라이언트는 실제 공인 IP로
 * 도달하므로, 로컬/테스트만 원격 남용 방어(연결 상한·IP 스로틀·메시지 버킷)에서 제외한다.
 *
 * ⚠ **이 판정만으로 면제를 결정하면 안 된다.** 프록시 뒤에서 IP는 헤더에서 복원되므로
 * (`clientIpOf`), 헤더에 `127.0.0.1`을 실을 수 있는 경로가 하나라도 있으면 모든 방어가
 * 통째로 꺼진다. 실제 면제 여부는 **소켓 상대가 진짜 루프백일 때만** 참인 플래그를
 * 연결 수립 시점에 받아서 쓴다(`Conn.exempt`) — 여기 함수는 그 기본값 계산용이다.
 */
function isLoopbackIp(ip: string): boolean {
  return ip === "local" || ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

/**
 * 남용 방어의 **버킷 키**. IPv4는 주소 그대로, IPv6는 `/64` 프리픽스로 묶는다.
 *
 * **왜**: IPv6를 쓰는 공격자는 보통 `/64`를 통째로 할당받는다 — 주소를 하나씩 갈아
 * 가며 붙으면 "IP당 동시 연결 16"·"IP당 인증 30회/분"·"IP당 방 20개/10분"이 전부
 * 사실상 무제한이 되고, 전역 300 연결 슬롯도 혼자 비울 수 있다. 실제 배분 단위인
 * `/64`로 묶으면 그 우회가 닫힌다.
 */
export function abuseKeyOf(ip: string): string {
  // IPv4-mapped IPv6(::ffff:1.2.3.4)는 IPv4로 취급한다.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped !== null) return mapped[1] as string;
  /*
   * 같은 주소의 **16진 표기**(`::ffff:0102:0304`)도 IPv4로 푼다.
   *
   * 안 풀면 IPv6 경로로 흘러가는데, 그 주소들은 앞 4그룹이 전부 0이라 **모든
   * IPv4 클라이언트가 `0:0:0:0::/64` 한 버킷으로 뭉친다**. 그러면 서로 모르는
   * 사용자들이 IP당 동시 연결 16·인증 30회/분·방 20개/10분을 나눠 쓰게 되어
   * 서로를 밀어낸다 — 뚫리는 쪽이 아니라 **과도 차단** 쪽 고장이다.
   * Node는 점 표기를 주지만 프록시 헤더에서 오는 값은 우리가 정하지 않는다.
   */
  const hexMapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip);
  if (hexMapped !== null) {
    const hi = parseInt(hexMapped[1] as string, 16);
    const lo = parseInt(hexMapped[2] as string, 16);
    return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
  }
  if (!ip.includes(":")) return ip; // IPv4 또는 "local" 등 비-IP 라벨
  const zoneless = (ip.split("%")[0] as string).toLowerCase();
  // 축약(`::`)을 먼저 편다 — 실제 배포에서 들어오는 주소는 대부분 축약형이라,
  // 펴지 않고 앞 4그룹을 자르면 서로 다른 /64가 같은 키로 뭉치거나 그 반대가 된다.
  const halves = zoneless.split("::");
  if (halves.length > 2) return zoneless; // 기형 주소 — 통째로 키로 쓴다
  const head = (halves[0] ?? "").split(":").filter((g) => g !== "");
  const tail = halves.length === 2 ? (halves[1] ?? "").split(":").filter((g) => g !== "") : [];
  const fill = 8 - head.length - tail.length;
  if (halves.length === 2 && fill < 0) return zoneless;
  const groups =
    halves.length === 2 ? [...head, ...Array<string>(fill).fill("0"), ...tail] : head;
  if (groups.length !== 8) return zoneless; // 판독 불가 — 안전하게 주소 전체를 키로
  return groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":") + "::/64";
}

/**
 * 인증 관련 문자열 필드가 모두 상한 이내인지. 문자열이 아닌 값(undefined 등)은
 * 각 케이스의 타입 검사가 따로 처리하므로 여기서는 통과시킨다.
 * 거대 문자열로 scrypt·DB 조회 비용을 부풀리는 남용을 입구에서 차단한다.
 */
function withinAuthFieldLimit(...fields: unknown[]): boolean {
  return fields.every((f) => typeof f !== "string" || f.length <= MAX_AUTH_FIELD_LEN);
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  /** 모든 활성 연결 — 계정 삭제·세션 무효화 시 강제 로그아웃 대상 조회용. */
  private conns = new Set<Conn>();
  /** IP별 동시 연결 수 (연결 상한 판정용). */
  private ipConnCount = new Map<string, number>();
  /** IP별 인증 시도 슬라이딩 윈도우 (연결 우회 무차별 대입 차단). */
  private authIpHits = new Map<string, number[]>();
  /** IP별 방 생성 슬라이딩 윈도우 (방 대량 생성 남용 차단). */
  private roomCreateIpHits = new Map<string, number[]>();
  /**
   * 친구 초대를 마지막으로 보낸 시각 — 키는 `보낸사람id>받는사람id` (ms).
   * `INVITE_COOLDOWN_MS` 가 지난 항목은 다음 초대 때 함께 치운다(무한 증식 방지).
   */
  private inviteSentAt = new Map<string, number>();
  /** 진행 중 scrypt 수 + 대기 큐 (동시 실행 상한). */
  private scryptActive = 0;
  private scryptQueue: Array<() => void> = [];
  /** 유휴 방 청소 타이머 (프로세스 종료를 막지 않게 unref). */
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  /** 서버 종료 중인가 — 종료 뒤에 들어온 시작 요청을 받지 않는다. */
  private shuttingDown = false;
  /** 리더보드 캐시 — 통계·계정 세대가 그대로면 재계산하지 않는다. */
  private leaderboardCache: {
    statsRev: number;
    usersRev: number;
    at: number;
    named: LeaderboardEntry[];
    anonymous: LeaderboardEntry[];
  } | null = null;

  constructor(
    private replayDir: string,
    private statsStore?: StatsStore,
    /** 국 사이 결과 화면 노출 대기(ms). 기본 0 (테스트는 지연 없음). */
    private interRoundDelayMs = 0,
    /** 계정·세션·게임 인덱스 DB. 없으면 인증이 항상 실패한다. */
    private db?: SiteDb,
    /**
     * 가입 코드. 설정되면 이 코드를 제출한 사람만 회원가입할 수 있다(가입 게이트).
     * 비어 있으면 가입 개방(로컬·개발 기본). 공개 배포에서 무단 가입·계정 탐색을 막는다.
     */
    private signupCode = "",
    /**
     * 증강별 실전 성적 — 20판마다 드래프트 가중치를 자동 조정한다.
     * 없으면 정적 티어표를 그대로 쓴다(테스트·로컬 기본).
     */
    private augmentStats?: AugmentStatsStore,
    /**
     * 자체 집계 (§8-6). 없으면 관리자 조회가 빈 목록을 돌려준다 — 테스트·로컬 기본.
     */
    private analytics?: { recent: (days?: number) => AnalyticsDayEntry[] },
  ) {
    // 유휴 방 청소 — 타이머가 프로세스 종료(테스트 포함)를 붙잡지 않게 unref한다.
    this.sweepTimer = setInterval(() => this.sweepIdleRooms(), ROOM_SWEEP_INTERVAL_MS);
    this.sweepTimer.unref?.();
    // 공지는 부팅 때 한 번 읽어 들고 있는다 (§4-3) — 연결마다 DB를 두드리지 않는다.
    this.notice = this.db?.notice() ?? null;
  }

  // ─────────────────────────── 운영 로그 ───────────────────────────

  /**
   * 운영 로그 한 줄. **어느 방인지를 항상 함께 남긴다** — 코드가 없는 로그
   * ("Game crashed:")는 여러 판이 동시에 도는 서버에서 사실상 쓸모가 없다.
   * (시각은 index.ts가 모든 console 호출 앞에 붙인다.)
   */
  private log(room: Room | null, msg: string): void {
    console.log(room === null ? `[srv] ${msg}` : `[room ${room.code}] ${msg}`);
  }

  private logError(room: Room | null, msg: string, err?: unknown): void {
    const where = room === null ? "[srv]" : `[room ${room.code}]`;
    if (err === undefined) console.error(`${where} ${msg}`);
    else console.error(`${where} ${msg}`, err);
  }

  /** 이 방에 방금 무슨 일이 있었다 — 유휴 청소 시계를 되돌린다. */
  private touch(room: Room): void {
    room.lastActivityAt = Date.now();
  }

  /**
   * 상태 점검용 스냅샷 (헬스 엔드포인트). 개인정보는 담지 않는다 — 개수뿐이다.
   */
  healthSnapshot(): {
    connections: number;
    /** 그중 익명(로그인 전 + 게스트) — 익명 슬롯 고갈 공격이 눈에 보이게 한다. */
    anonymous: number;
    anonymousMax: number;
    rooms: number;
    playing: number;
    waiting: number;
  } {
    let playing = 0;
    for (const r of this.rooms.values()) if (r.phase === "playing") playing++;
    return {
      connections: this.conns.size,
      anonymous: this.anonCount(),
      anonymousMax: maxAnonConnections(),
      rooms: this.rooms.size,
      playing,
      waiting: this.rooms.size - playing,
    };
  }

  // ─────────────────────────── 유휴 방 청소 ───────────────────────────

  /**
   * 아무 일도 일어나지 않은 대기실과, 컨트롤러 없이 굳은 방을 걷어낸다.
   *
   * **건드리지 않는 것**: 실제로 돌고 있는 게임(phase playing + controller). 그 방에는
   * 끊긴 사람의 재접속용 좌석도 함께 들어 있으므로, 재접속 중인 사람도 같이 보호된다.
   */
  sweepIdleRooms(): void {
    const now = Date.now();
    this.pruneHeavyHits(now);
    const ttl = roomIdleTtlMs();
    for (const room of [...this.rooms.values()]) {
      if (room.phase === "playing") {
        // 진행 중인 게임은 손대지 않는다. 다만 컨트롤러가 없는 "playing"은
        // 게임이 아니라 잔해다 — 방치하면 그 사람들이 영영 방을 못 만든다.
        if (room.controller !== null) {
          // 사람을 기다리며 세워 둔 판(§2-5 체험 방 · §2-10 되살린 방)은 시한이
          // 있다. 안 돌아오면 접는다 — 안 그러면 방 예산을 영구히 물고 있는다.
          if (room.holdUntil !== null && now > room.holdUntil) {
            this.log(room, "세워 둔 판의 보유 시한 초과 — 접는다");
            // 되살린 판은 파일을 남긴다. 아무도 안 온 것이 "없던 일로 하자"는
            // 뜻은 아니고, 그 파일이 그 40분의 유일한 흔적이다.
            if (room.resumePath !== null) room.preserveReplayOnAbort = true;
            room.holdUntil = null;
            room.controller.requestAbort();
            this.detachRoomConns(room);
            this.rooms.delete(room.code);
            continue;
          }
          // 진행 중인 판의 "마지막 소식" 시각을 갱신한다 — 이 값이 없으면 부팅 때
          // 며칠 묵은 잔해와 방금 끊긴 판을 구분할 수 없다(§2-10).
          this.rememberLiveGame(room);
          continue;
        }
        if (now - room.lastActivityAt < ZOMBIE_ROOM_TTL_MS) continue;
        this.logError(room, "컨트롤러 없이 playing으로 굳은 방을 회수한다");
        this.closeRoom(room, "ROOM_CLOSED", "방이 정리되었습니다 — 홈에서 다시 시작하세요");
        continue;
      }
      if (now - room.lastActivityAt < ttl) continue;
      this.log(room, `유휴 ${Math.round((now - room.lastActivityAt) / 60_000)}분 — 방을 닫는다`);
      this.closeRoom(room, "ROOM_IDLE_CLOSED", "오래 비어 있어 방이 닫혔습니다");
    }
  }

  /**
   * 방을 닫고 그 방을 붙들고 있던 연결을 전부 떼어 낸다.
   *
   * 방만 지우고 `conn.room`/`conn.agent`를 남겨 두면, 그 연결은 이미 버려진 방
   * 객체를 계속 가리킨 채 `phase:"playing"` 가드를 통과해 폐기된 컨트롤러로
   * 들어간다(무효 투표 경로에서 실제로 그랬다).
   */
  private closeRoom(room: Room, code: string, message: string): void {
    // 서버가 스스로 접은 방은 이어하기 후보가 아니다 (§2-10).
    this.forgetLiveGame(room);
    for (const a of room.agents) {
      if (a instanceof HumanAgent) a.notify({ type: "error", code, message });
    }
    this.endSpectating(room, message);
    this.detachRoomConns(room);
    this.rooms.delete(room.code);
  }

  /**
   * 공지가 바뀌었다 — 접속 중인 **모든** 연결에 `serverInfo`를 다시 보낸다 (§4-3).
   *
   * 새 메시지 타입을 만들지 않는다. 이미 "이 서버가 지금 어떤 상태인가"를 말하는
   * 메시지가 있고, 공지는 정확히 그 종류의 사실이다. 클라이언트도 그 하나만
   * 처리하면 되므로 "공지가 오는 길"이 둘로 갈리지 않는다.
   */
  private broadcastServerInfo(): void {
    const msg: ServerMessage = {
      type: "serverInfo",
      signupGate: this.signupCode !== "",
      guestPlay: true,
      augmentKinds: this.augmentCatalog.length,
      ...(this.notice !== null ? { notice: this.notice } : {}),
    };
    for (const c of this.conns) this.send(c.ws, msg);
  }

  /** 이 방을 가리키던 연결의 방·좌석 링크를 끊는다 (방 객체는 건드리지 않는다). */
  private detachRoomConns(room: Room): void {
    for (const c of this.conns) {
      if (c.room === room) {
        c.room = null;
        c.agent = null;
      }
      if (c.spectating === room) c.spectating = null;
    }
  }

  /**
   * 서버 종료 — 진행 중인 판을 사람들에게 **알리고** 정리한다.
   *
   * 알림이 없으면 클라이언트는 소켓이 끊긴 것으로 보고 무한 재접속을 돌다가
   * 서버가 돌아온 뒤 `ROOM_NOT_FOUND`를 받는다(40분짜리 반장전이 아무 설명 없이
   * 사라진다). 여기서 gameAborted를 먼저 보내면 최소한 "무슨 일이 있었는지"는 남는다.
   */
  /**
   * @returns 진행 중이던 판의 리플레이가 **디스크에 다 나갈 때까지**의 프로미스.
   *   기다리지 않아도 동작은 같지만, 기다리지 않으면 마지막 몇 줄이 사라질 수
   *   있고 그 꼬리가 곧 이어하기의 "어디까지 뒀는가"다 (§2-10).
   */
  shutdown(reason = "서버가 재시작합니다 — 잠시 후 다시 접속해 주세요"): Promise<void> {
    this.shuttingDown = true;
    const flushing: Promise<void>[] = [];
    if (this.sweepTimer !== null) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    for (const room of [...this.rooms.values()]) {
      const msg: ServerMessage =
        room.phase === "playing"
          ? { type: "gameAborted", reason }
          : { type: "error", code: "SERVER_SHUTDOWN", message: reason };
      for (const a of room.agents) {
        if (a instanceof HumanAgent) a.notify(msg);
      }
      this.endSpectating(room, reason, room.phase === "playing" ? msg : undefined);
      // 컨트롤러 루프를 깨워 대기 중인 결정 프로미스를 붙들고 있지 않게 한다.
      room.controller?.requestAbort();
      // 여기서는 **지우지 않고 닫기만** 한다 — 재시작에 끊긴 진짜 판이라, 이어하기를
      // 붙인다면 유일한 근거가 이 파일이다. 인덱스에 없어 쌓이기만 하는 문제는
      // index.ts의 `pruneOldReplays`가 보존 기간이 지난 뒤 쓸어 담는다.
      if (room.writer !== null) flushing.push(room.writer.close());
      this.detachRoomConns(room);
      this.rooms.delete(room.code);
    }
    this.log(null, "종료 알림 전송 완료 — 모든 방을 정리했다");
    return Promise.all(flushing).then(() => undefined);
  }

  /** 청소 타이머만 멈춘다 (테스트 정리용). */
  stop(): void {
    if (this.sweepTimer !== null) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  /**
   * 정적 증강 카탈로그(게임의 레지스트리와 동일 구성). 인증 직후 1회 보내
   * 홈 화면 통계가 증강 id→이름·등급을 게임 전에도 표시할 수 있게 한다.
   */
  private readonly augmentCatalog: AugmentCatalogEntry[] = buildAugmentCatalog();

  /**
   * 지금 걸려 있는 운영자 공지 (§4-3). 메모리에 들고 있는 이유는 이 값이
   * **연결마다** 나가기 때문이다 — 접속 폭주에 DB 조회를 곱하지 않는다.
   * 관리자가 바꿀 때만 갱신되고, 그 순간 접속 중인 사람들에게도 바로 밀어 준다.
   */
  private notice: ServerNotice | null = null;

  /** 카탈로그 id 집합 — 증강 테스트 요청의 id 검증용. */
  private readonly augmentIds: Set<string> = new Set(
    this.augmentCatalog.map((a) => a.id),
  );

  // ─────────────────────────── 연결 수립 ───────────────────────────

  /**
   * 새 WebSocket 연결 — 이후 모든 메시지를 이 핸들러가 라우팅한다.
   *
   * @param exempt 원격 남용 방어에서 면제할지. **소켓 상대가 진짜 루프백일 때만**
   *   호출자가 참을 넘긴다(index.ts). 생략하면 ip 문자열로 추정한다 — 프록시가
   *   없는 직접 노출·테스트 경로의 기존 동작 그대로다.
   */
  handleConnection(ws: WebSocket, ip = "local", exempt = isLoopbackIp(ip)): void {
    const key = abuseKeyOf(ip);
    // 동시 연결 상한 (전체·버킷별) — 루프백/로컬은 제외한다.
    const perIp = this.ipConnCount.get(key) ?? 0;
    if (
      this.conns.size >= MAX_CONNECTIONS ||
      (!exempt && perIp >= MAX_CONNECTIONS_PER_IP)
    ) {
      try {
        ws.close(1013, "server busy");
      } catch {
        /* 이미 닫힘 */
      }
      return;
    }
    // 익명 슬롯 확보 — 로그인한 사람 몫의 자리를 익명 소켓이 먹지 못하게 한다.
    // 회수할 자리도 없으면 이 연결은 받지 않는다.
    if (!exempt && !this.makeRoomForAnonConn()) {
      try {
        ws.close(1013, "too many anonymous connections");
      } catch {
        /* 이미 닫힘 */
      }
      return;
    }

    const conn: Conn = {
      id: randomUUID(),
      ws,
      openedAt: Date.now(),
      user: null,
      guest: false,
      sessionToken: null,
      room: null,
      agent: null,
      spectating: null,
      authAttempts: [],
      emoteHits: [],
      ip,
      key,
      exempt,
      msgTokens: MSG_BUCKET_CAPACITY,
      msgLastRefill: Date.now(),
      authDeadline: null,
      violations: 0,
    };
    this.conns.add(conn);
    this.ipConnCount.set(key, perIp + 1);
    this.log(null, `연결 열림 ${key} (동시 ${this.conns.size})`);

    // 미인증 스쿼팅 차단 — 유예 안에 로그인하지 않으면 소켓을 회수한다.
    this.armAuthDeadline(conn);

    // 로그인 화면이 이 서버의 실제 정책(가입 게이트 여부)을 알고 그리도록 먼저 알린다.
    // 인증 정보가 아니라 "이 서버가 지금 가입을 받는가"라는 공개 사실이다.
    this.send(ws, {
      type: "serverInfo",
      signupGate: this.signupCode !== "",
      guestPlay: true,
      // 도움말이 "N종"을 말할 때 쓴다 — 클라가 직접 세면 증강 구현 전체가
      // 번들에 딸려 들어온다(감사 §7-1). 카탈로그와 같은 출처라 어긋나지 않는다.
      augmentKinds: this.augmentCatalog.length,
      // 운영자 공지 (§4-3). 인증 **전에** 나가는 자리라, 로그인하기 전에 알아야
      // 하는 순간(점검 예고·서버 이전)에도 제때 닿는다.
      ...(this.notice !== null ? { notice: this.notice } : {}),
    });

    ws.on("message", (data) => {
      // 연결당 메시지 토큰 버킷 — 초과분은 조용히 버린다(응답 증폭 방지). 루프백은 제외.
      if (!exempt && !this.consumeMsgToken(conn)) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        // 기형 프레임 — 정상 클라이언트는 보내지 않는다. 위반으로 계상한다.
        this.protocolViolation(conn);
        return;
      }
      // 형식 검증: 객체 + 문자열 type 이어야 라우팅한다. 배열·null·원시값·
      // type 없는 객체는 전부 위반으로 계상해 퍼징을 빠르게 끊는다.
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed) ||
        typeof (parsed as { type?: unknown }).type !== "string"
      ) {
        this.protocolViolation(conn);
        return;
      }
      try {
        this.route(conn, parsed as ClientMessage);
      } catch (err) {
        // 어느 방·누구의 어떤 메시지였는지 없이는 재현할 수가 없다.
        this.logError(
          conn.room,
          `메시지 처리 오류 (${conn.user?.username ?? "미인증"} · ${String(
            (parsed as { type?: unknown }).type,
          )}):`,
          err,
        );
        this.send(conn.ws, { type: "error", code: "INTERNAL", message: "서버 오류가 발생했습니다" });
      }
    });

    ws.on("close", () => this.handleClose(conn));
    ws.on("error", () => {
      /* close가 뒤따른다 */
    });
  }

  /**
   * 이 연결이 **익명**인가 — 로그인 전이거나 게스트 체험 중.
   *
   * 게스트를 익명으로 세는 것이 핵심이다. 게스트는 `conn.user`에 DB에 없는 임시
   * 신원(`GUEST_USER_ID`)이 들어가 있어 "인증됨"처럼 보이지만, 실제로는 계정 없이
   * 누구나 될 수 있는 상태다 — 안 세면 `guestPlay` 한 번으로 익명 상한을 빠져나간다.
   */
  private isAnon(conn: Conn): boolean {
    return conn.user === null || conn.guest;
  }

  /** 지금 익명 상태인 연결 수. */
  private anonCount(): number {
    let n = 0;
    for (const c of this.conns) if (this.isAnon(c)) n++;
    return n;
  }

  /**
   * 새 익명 연결을 받을 자리를 만든다 (만들었으면 true, 못 만들면 false).
   *
   * 상한에 여유가 있으면 그대로 통과. 꽉 찼으면 **가장 오래 익명으로 앉아 있던**
   * 연결 하나를 회수한다 — 단, 유예(`ANON_EVICT_GRACE_MS`)보다 젊은 연결은 건드리지
   * 않는다. 갓 도착한 손님이 로그인 화면을 그리기도 전에 밀려나면 상한이 공격자가
   * 아니라 손님을 잡는 장치가 되기 때문이다.
   *
   * 회수 대상이 전부 유예 안이면 새 연결을 거절한다 — 그 상황은 "지금 막 몰려들었다"는
   * 뜻이고, 이미 앉은 쪽을 지키는 편이 무작정 자리를 바꾸는 것보다 낫다.
   */
  private makeRoomForAnonConn(): boolean {
    const limit = maxAnonConnections();
    if (this.anonCount() < limit) return true;
    const now = Date.now();
    const grace = anonEvictGraceMs();
    let oldest: Conn | null = null;
    for (const c of this.conns) {
      if (!this.isAnon(c)) continue;
      if (now - c.openedAt < grace) continue;
      if (oldest === null || c.openedAt < oldest.openedAt) oldest = c;
    }
    if (oldest === null) return false;
    this.log(
      null,
      `익명 연결 상한(${limit}) — ${oldest.key} 의 오래된 익명 연결을 회수한다`,
    );
    try {
      oldest.ws.close(1013, "anonymous slot recycled");
    } catch {
      /* 이미 닫힘 */
    }
    // 소켓의 close 이벤트는 비동기로 온다 — 그때까지 기다리면 같은 연결이 여러 번
    // 회수 대상으로 뽑히므로 지금 정리한다. `handleClose`는 두 번 불려도 안전하다.
    this.handleClose(oldest);
    return true;
  }

  /**
   * 미인증 유예 타이머를 (재)설정한다. 유예 안에 인증하지 않으면 소켓을 끊어
   * 연결 상한 슬롯을 회수한다. unref로 프로세스 종료를 막지 않게 한다.
   */
  private armAuthDeadline(conn: Conn): void {
    if (conn.authDeadline !== null) clearTimeout(conn.authDeadline);
    const timer = setTimeout(() => {
      conn.authDeadline = null;
      if (conn.user !== null) return; // 그사이 인증됨
      try {
        conn.ws.close(1008, "authentication timeout");
      } catch {
        /* 이미 닫힘 */
      }
    }, UNAUTH_TIMEOUT_MS);
    timer.unref?.();
    conn.authDeadline = timer;
  }

  /**
   * 프로토콜 위반 1회를 계상하고, 상한을 넘으면 연결을 끊는다.
   * 조용히 무시만 하면 공격자가 같은 소켓으로 계속 탐색할 수 있으므로,
   * 위반이 쌓이면 소켓 자체를 회수한다.
   */
  private protocolViolation(conn: Conn): void {
    conn.violations += 1;
    if (conn.violations < MAX_PROTOCOL_VIOLATIONS) return;
    try {
      conn.ws.close(1008, "protocol violation");
    } catch {
      /* 이미 닫힘 */
    }
  }

  /** 토큰 버킷 — 여유 토큰이 있으면 소비하고 true, 없으면 false. */
  private consumeMsgToken(conn: Conn): boolean {
    const now = Date.now();
    const elapsedSec = (now - conn.msgLastRefill) / 1000;
    if (elapsedSec > 0) {
      conn.msgTokens = Math.min(
        MSG_BUCKET_CAPACITY,
        conn.msgTokens + elapsedSec * MSG_BUCKET_REFILL_PER_SEC,
      );
      conn.msgLastRefill = now;
    }
    if (conn.msgTokens < 1) return false;
    conn.msgTokens -= 1;
    return true;
  }

  private handleClose(conn: Conn): void {
    // 두 번 불릴 수 있다 — 익명 슬롯 회수(`makeRoomForAnonConn`)가 소켓을 닫으면서
    // 여기를 먼저 부르고, 잠시 뒤 소켓의 close 이벤트가 한 번 더 부른다. 그때
    // 좌석 정리·IP 카운터 감소를 두 번 하면 안 된다(카운터가 음수로 새면 IP당
    // 동시 연결 상한이 조용히 헐거워진다). Set에서 실제로 빠진 첫 호출만 진행한다.
    if (!this.conns.delete(conn)) return;
    this.log(
      conn.room,
      `연결 닫힘 ${conn.user?.username ?? conn.key} (동시 ${this.conns.size})`,
    );
    // 미인증 유예 타이머 해제 — 닫힌 연결에 대고 타이머가 남지 않게 한다.
    if (conn.authDeadline !== null) {
      clearTimeout(conn.authDeadline);
      conn.authDeadline = null;
    }
    const left = (this.ipConnCount.get(conn.key) ?? 1) - 1;
    if (left <= 0) this.ipConnCount.delete(conn.key);
    else this.ipConnCount.set(conn.key, left);
    this.stopSpectating(conn);
    const room = conn.room;
    if (room === null || conn.agent === null) return;
    // 재접속으로 이미 새 소켓이 붙었으면 이 close는 오래된 소켓 → 무시
    if (!conn.agent.isSocket(conn.ws)) return;
    if (room.guest && room.phase === "playing" && room.controller !== null) {
      /*
       * 1인 방(체험·연습)은 **판을 세워 두고 기다린다** (감사 §2-5).
       *
       * 예전에는 여기서 방을 즉시 지웠다. 근거는 "게스트는 재접속할 수단이 없다"
       * 였고 그건 사실이었다 — 세션 토큰이 없으니 `joinRoom`이 쓸 신원이 없다.
       * 그래서 **모바일에서 알림 하나 확인하고 돌아오면 판이 없었다.** 이 게임을
       * 처음 보는 사람에게, 가장 중요한 첫 판에서.
       *
       * 이제 그 수단을 준다(`room.guestToken` → `guestResume`). 그리고 기다리는
       * 쪽도 바꿨다: 남은 셋이 없는 방이라 유예를 5초로 줄일 이유가 없다 —
       * 봇은 기다려도 아무것도 잃지 않는다. 세워 둔 시한이 지나면 유휴 청소가
       * 접는다(`sweepIdleRooms`).
       */
      conn.agent.suspend(SOLO_HOLD_MS);
      room.holdUntil = Date.now() + SOLO_HOLD_MS;
      // 말풍선을 띄운 채 나갔을 수 있다 — 그 신호를 여기서 놓아 준다. 안 놓으면
      // 돌아올 사람도 없는 방에서 봇 셋이 시한이 다할 때까지 서 있는다.
      room.tutorialHoldUntil = 0;
      this.log(
        room,
        `${conn.agent.nickname} 접속 끊김 — 판을 ${Math.round(SOLO_HOLD_MS / 1000)}초간 세워 두고 기다린다`,
      );
    } else if (room.guest) {
      // 아직 시작 전이거나 컨트롤러가 없는 체험 방 — 세워 둘 판 자체가 없다.
      room.controller?.requestAbort();
      this.rooms.delete(room.code);
    } else if (room.phase === "waiting") {
      this.leaveWaiting(room, conn.agent);
    } else {
      // 지금 이 좌석이 붙들고 있는 결정이 있으면 30초를 다 기다리지 않게 줄인다.
      conn.agent.noticeDisconnect();
      this.log(room, `${conn.agent.nickname} 접속 끊김 — 좌석은 재접속용으로 남긴다`);
      // 게임 중이면 좌석은 유지 — 같은 계정으로 joinRoom하면 재접속된다.
      // 다만 **남은 사람들에게 알린다**: 이름표가 "생각 중"과 구분되지 않으면
      // 자동 폴백까지의 몇 초가 그냥 멈춘 게임으로 보인다(QA P0-3b).
      this.refreshSeatStatus(room);
      // 끊긴 좌석은 중단 투표 정족수에서 빠진다 — 걸려 있던 투표를 바로 다시 센다.
      this.retallyAbortVotes(room);
    }
    conn.room = null;
    conn.agent = null;
  }

  /**
   * 좌석별 접속 상태 스냅샷 — 이름표에 실어 보낸다.
   * 봇은 언제나 connected(끊길 소켓이 없다).
   */
  private seatConnections(room: Room): Record<PlayerId, SeatConnection> {
    const out: Record<PlayerId, SeatConnection> = {};
    for (const a of room.agents) {
      out[a.id] = a instanceof HumanAgent ? a.connectionState() : "connected";
    }
    return out;
  }

  /**
   * 접속 상태가 바뀐 직후, 게임 중인 방의 사람들에게 뷰를 다시 밀어 준다.
   *
   * 새 메시지 타입을 만들지 않는다 — 상태는 이미 뷰의 이름표에 실려 있고
   * (HumanAgent.sendView), 여기서는 그 뷰를 지금 한 번 더 보낼 뿐이다.
   */
  private refreshSeatStatus(room: Room): void {
    const controller = room.controller;
    if (controller === null || room.phase !== "playing") return;
    for (const a of room.agents) {
      if (a instanceof HumanAgent && a.isConnected()) controller.resendViewTo(a.id);
    }
  }

  // ─────────────────────────── 메시지 라우팅 ───────────────────────────

  private route(conn: Conn, msg: ClientMessage): void {
    switch (msg.type) {
      case "ping":
        this.send(conn.ws, { type: "pong" });
        return;
      // ── 인증 ──
      case "register": {
        const db = this.db;
        if (db === undefined) return this.fail(conn, "NO_DB", "서버에 계정 저장소가 없습니다");
        if (
          typeof msg.username !== "string" ||
          typeof msg.password !== "string" ||
          !withinAuthFieldLimit(msg.username, msg.password, msg.signupCode, msg.adminCode)
        ) {
          return this.fail(conn, "BAD_REQUEST", "잘못된 요청입니다");
        }
        if (this.rateLimited(conn)) return;
        // 가입 게이트: 코드가 설정돼 있으면 일치해야만 가입 허용.
        // 비교는 상수 시간으로 — `!==`는 첫 불일치에서 빠져나와 응답 시간에
        // "몇 글자까지 맞았는지"가 실린다(느리지만 원격에서도 재는 게 가능하다).
        if (
          this.signupCode !== "" &&
          (typeof msg.signupCode !== "string" || !safeEqual(msg.signupCode, this.signupCode))
        ) {
          return this.fail(conn, "SIGNUP_CODE_REQUIRED", "가입 코드가 필요합니다");
        }
        const { username, password, adminCode } = msg;
        void this.doAuth(conn, "REGISTER_FAILED", () => db.register(username.trim(), password, adminCode));
        return;
      }
      case "login": {
        const db = this.db;
        if (db === undefined) return this.fail(conn, "NO_DB", "서버에 계정 저장소가 없습니다");
        if (
          typeof msg.username !== "string" ||
          typeof msg.password !== "string" ||
          !withinAuthFieldLimit(msg.username, msg.password)
        ) {
          return this.fail(conn, "BAD_REQUEST", "잘못된 요청입니다");
        }
        if (this.rateLimited(conn)) return;
        const { username, password } = msg;
        void this.doAuth(conn, "LOGIN_FAILED", () => db.login(username.trim(), password));
        return;
      }
      case "tokenLogin": {
        if (typeof msg.sessionToken === "string" && msg.sessionToken.length > MAX_AUTH_FIELD_LEN) {
          return this.fail(conn, "TOKEN_INVALID", "세션이 만료되었습니다");
        }
        if (typeof msg.sessionToken !== "string") {
          return this.fail(conn, "TOKEN_INVALID", "세션이 만료되었습니다");
        }
        if (this.rateLimited(conn)) return;
        const user = this.db?.loginByToken(msg.sessionToken) ?? null;
        if (user === null) return this.fail(conn, "TOKEN_INVALID", "세션이 만료되었습니다");
        this.applyAuth(conn, user, msg.sessionToken);
        return;
      }
      case "logout": {
        // 아직 로그인한 적 없는 연결의 logout은 아무것도 하지 않는다.
        //
        // ⚠ 예전에는 여기서 미인증 유예 타이머를 무조건 **되걸었다**. 그래서 인증
        // 없이 소켓만 열어 두고 29초마다 `logout`을 한 번씩 보내면 30초 유예가
        // 영원히 갱신되어, 인증 없이 연결 슬롯을 무기한 점유할 수 있었다
        // (미인증 스쿼팅 차단을 스스로 무력화하는 경로).
        if (conn.user === null) return;
        // 게스트가 로그아웃하면(=가입하러 나가면) 체험 판도 함께 접는다 —
        // 돌아올 신원이 없는 좌석을 봇 셋과 남겨 둘 이유가 없다.
        if (conn.guest) this.dropGuestRoom(conn);
        conn.guest = false;
        if (conn.sessionToken !== null) this.db?.logout(conn.sessionToken);
        // 방·관전 상태를 정리한다 — 안 그러면 좌석/방장이 유령으로 남아
        // 대기실이 소프트락된다 (인증 게이트에 걸려 leaveRoom도 못 보냄).
        this.detachSeat(conn);
        conn.user = null;
        conn.sessionToken = null;
        // 다시 미인증 상태이므로 유예 타이머를 되건다 — 로그인 후 로그아웃으로
        // 타이머만 소모하고 소켓을 계속 붙들고 있는 우회를 막는다.
        this.armAuthDeadline(conn);
        return;
      }
      /*
       * 비밀번호 변경 · 다른 기기 로그아웃 (감사 §10-2).
       *
       * 인증 게이트 **뒤**에 두지 않고 여기 둔 이유는 없다 — 아래 `user === null`
       * 검사를 지나야 하므로 로그인 상태에서만 온다. 다만 인증과 같은 레이트리밋
       * 창을 태워야 한다: 지금 비밀번호를 맞히는 시도가 여기로도 들어온다.
       */
      case "changePassword": {
        if (conn.user === null || conn.guest) {
          return this.fail(conn, "AUTH_REQUIRED", "로그인이 필요합니다");
        }
        const db = this.db;
        if (db === undefined) return this.fail(conn, "NO_DB", "서버에 계정 저장소가 없습니다");
        if (this.rateLimited(conn)) return;
        const userId = conn.user.id;
        void db
          .changePassword(userId, msg.currentPassword, msg.newPassword)
          .then((res) => {
            if (!res.ok || res.user === undefined || res.sessionToken === undefined) {
              return this.fail(conn, "PASSWORD_CHANGE_FAILED", res.error ?? "바꾸지 못했습니다");
            }
            // 이 연결의 세션도 갈렸다 — 새 토큰을 쥐여 주지 않으면 다음 재연결에서
            // 자기 자신이 로그아웃된다.
            conn.sessionToken = res.sessionToken;
            this.send(conn.ws, {
              type: "authOk",
              username: res.user.username,
              isAdmin: res.user.isAdmin,
              sessionToken: res.sessionToken,
            });
            this.log(null, `${res.user.username} 비밀번호 변경 — 다른 세션을 전부 끊었다`);
          })
          .catch((err: unknown) => {
            this.logError(null, "비밀번호 변경 실패:", err);
            this.fail(conn, "INTERNAL", "비밀번호를 바꾸지 못했습니다");
          });
        return;
      }
      case "logoutOthers": {
        if (conn.user === null || conn.guest) {
          return this.fail(conn, "AUTH_REQUIRED", "로그인이 필요합니다");
        }
        const db = this.db;
        if (db === undefined) return this.fail(conn, "NO_DB", "서버에 계정 저장소가 없습니다");
        const removed = db.logoutOthers(conn.user.id, conn.sessionToken ?? "");
        this.fail(
          conn,
          "SESSIONS_CLEARED",
          removed === 0
            ? "다른 기기에 로그인된 세션이 없습니다"
            : `다른 기기 ${removed}곳의 로그인을 끊었습니다`,
        );
        return;
      }
      // ── 게스트 체험 (계정 없이 봇 3명과 1인 게임) ──
      case "guestPlay":
        return this.guestPlay(conn, msg.mode, msg.tutorial === true);
      // 끊겼던 손님이 자기 판으로 돌아온다 — 인증 **전에** 오는 메시지다
      // (그 토큰이 곧 이 연결의 신원이 된다).
      case "guestResume":
        return this.guestResume(conn, msg.token);
      /*
       * 증강 도감 — **로그인 전에도 준다** (감사 §3-7).
       *
       * 랜딩의 "📖 증강 도감 열기"는 인증과 무관하게 렌더되는데 카탈로그는 인증
       * 뒤에만 갔다. 그래서 이 게임의 유일한 차별점을 보러 온 사람이 "0/0종 ·
       * 증강이 없습니다"를 봤다. 감출 것이 없는 정보다 — 랜딩이 종수를 광고하고,
       * 판에 들어가면 어차피 전부 받는다.
       *
       * 인증 게이트 뒤의 `heavyLimited`가 여기까지 오지 않으므로 직접 건다.
       */
      /*
       * 공유 링크로 열린 리플레이 (§4-8, 사용자 결정 "링크 있는 사람만").
       *
       * **인증 전에 받는다.** 이 게임의 최대 무기는 "이 증강 조합 봐라"인데, 그걸
       * 자랑하려면 계정이 없는 사람에게도 보여 줄 수 있어야 한다. 토큰이 곧
       * 권한이고, 목록이 없으므로 추측이 유일한 공격 경로다 — 128비트 토큰 +
       * 비싼 조회 제한으로 막는다.
       *
       * `shareToken`이 없는 `replayGet`은 여기서 처리하지 않는다 — 그건 계정
       * 기반 조회라 아래 인증 게이트를 지나야 한다.
       */
      case "replayGet": {
        if (typeof msg.shareToken !== "string" || msg.shareToken === "") break;
        if (this.heavyLimited(conn, msg.type)) {
          return this.fail(conn, "RATE_LIMITED", "조회가 너무 잦습니다. 잠시 후 다시 시도하세요");
        }
        void this.sendSharedReplay(conn, msg.shareToken).catch((err: unknown) => {
          console.error("replayGet(share) error:", err);
          this.fail(conn, "INTERNAL", "리플레이 조회 중 오류가 발생했습니다");
        });
        return;
      }
      case "catalogRequest": {
        if (this.heavyLimited(conn, msg.type)) {
          return this.fail(conn, "RATE_LIMITED", "조회가 너무 잦습니다. 잠시 후 다시 시도하세요");
        }
        return this.send(conn.ws, { type: "catalog", augments: this.augmentCatalog });
      }
      default:
        break;
    }

    // ── 이하 전부 로그인 필요 ──
    const user = conn.user;
    if (user === null) {
      return this.fail(conn, "AUTH_REQUIRED", "로그인이 필요합니다");
    }

    // ── 게스트는 "제 판을 두는 것"만 할 수 있다 ──
    //
    // 허용 목록을 화이트리스트로 둔 이유: 앞으로 새 메시지가 늘어도 **기본이 거부**여야
    // 손님이 계정 공간(가입·리더보드·리플레이·제보)이나 남의 방에 새 나갈 길이 생기지
    // 않는다. 특히 `createRoom`·`joinRoom`이 막혀 있어야 게스트가 방 코드 공간을 파거나
    // 실계정들의 방에 익명으로 끼어들 수 없다.
    if (conn.guest && !GUEST_ALLOWED_MESSAGES.has(msg.type)) {
      return this.fail(
        conn,
        "GUEST_FORBIDDEN",
        "게스트 체험에서는 사용할 수 없습니다 — 계정을 만들면 모든 기능이 열립니다",
      );
    }

    // ── 비싼 조회는 개수가 아니라 비용으로 막는다 ──
    if (this.heavyLimited(conn, msg.type)) {
      return this.fail(conn, "RATE_LIMITED", "조회가 너무 잦습니다. 잠시 후 다시 시도하세요");
    }

    switch (msg.type) {
      case "createRoom":
        return this.createRoom(conn, user);
      case "practicePlay":
        return this.practicePlay(conn, user, msg.mode, msg.tutorial === true);
      case "joinRoom":
        return this.joinRoom(conn, user, msg.code);
      case "emote": {
        this.handleEmote(conn, msg.id);
        return;
      }
      case "leaveRoom": {
        const room = conn.room;
        // 체험 판에서 나가기 = 그 판의 끝. 남겨 두어도 손님은 돌아올 수 없다.
        if (conn.guest) {
          this.dropGuestRoom(conn);
          return;
        }
        if (room !== null && conn.agent !== null) {
          if (room.phase === "waiting") this.leaveWaiting(room, conn.agent);
          // 게임 중 나가기 = 포기: 좌석은 봇처럼 자동 진행되어 게임이 완주된다.
          // 남은 사람들의 이름표에 "기권"을 세워, 저 자리가 왜 즉답하는지 보이게 한다.
          else {
            // 스스로 누른 나가기 — 되돌리지 않는다. 그게 이 사람의 결정이다.
            conn.agent.abandon("left");
            this.refreshSeatStatus(room);
            // 마지막 사람이 나갔으면 판을 무효로 접는다 — 남는 건 봇뿐이라 볼 사람도,
            // 기록할 이유도 없다. 예전에는 그 판이 계속 돌면서, 홈으로 나온 화면 위로
            // 그 게임의 연출과 소리가 계속 튀어나왔다(봇전·증강 테스트에서 특히).
            this.abortIfNoHumansLeft(room);
          }
        }
        conn.room = null;
        conn.agent = null;
        return;
      }
      // ── 대기실 ──
      case "ready":
      case "addBot":
      case "removeBot":
      case "setBotArchetype":
      case "setBotDifficulty":
      case "kickPlayer":
      case "setGameMode":
      case "shuffleSeats":
      case "startGame": {
        if (conn.room === null || conn.agent === null) return;
        this.handleLobbyMessage(conn.room, conn.agent, msg);
        return;
      }
      // ── 손패 배치 ──
      // 게임 상태를 바꾸지 않는 표시용 정보라 프롬프트 대기와 무관하게 언제든 받는다.
      case "handOrder": {
        if (conn.room === null || conn.agent === null) return;
        const ids = Array.isArray(msg.tileIds)
          ? msg.tileIds.filter((n): n is number => Number.isInteger(n))
          : [];
        // 손패는 아무리 커도 20장 남짓 — 그 이상은 버린다 (프레임 낭비 방지)
        if (ids.length > MAX_HAND_ORDER) return;
        // 증강 테스트에서 다른 좌석 시점을 보고 있으면 화면에 뜬 손패도 그 좌석의 것이다 —
        // 배치는 **지금 보고 있는 좌석**에 붙여야 맞다 (전체공개 시점은 클라이언트가 안 보낸다).
        const seat = conn.agent.viewSeatOverride?.() ?? conn.agent.id;
        this.applyHandOrder(conn.room, seat, ids);
        return;
      }
      // ── 게임 액션 · 결과 화면 닫기 ──
      case "action":
      case "draftPick":
      case "draftReroll":
      case "roundContinue": {
        conn.agent?.handleMessage(msg);
        return;
      }
      // ── 튜토리얼: 말풍선을 읽는 동안 판을 세워 둔다 (`TUTORIAL_HOLD_NOTE`) ──
      case "tutorialHold": {
        const room = conn.room;
        // 튜토리얼 방에서만 듣는다. 다른 방에서 이 신호가 먹히면 아무나 판을
        // 멈춰 세울 수 있는 손잡이가 된다 — 그건 그냥 방해 도구다.
        if (room === null || !room.tutorial) return;
        room.tutorialHoldUntil = msg.hold === true ? Date.now() + TUTORIAL_HOLD_TTL_MS : 0;
        return;
      }
      // ── 게임 무효(중단) 투표 ──
      case "voteAbort": {
        // 경계 검증 — 여기만 값을 그대로 흘려보내고 있었다. 모르는 값이 오면
        // "철회"로 해석되어, 오타 하나가 조용히 내 동의를 취소했다.
        const vote: unknown = msg.vote;
        if (vote !== "agree" && vote !== "withdraw" && vote !== "reject") {
          return this.fail(conn, "BAD_REQUEST", "잘못된 투표 값입니다");
        }
        return this.handleVoteAbort(conn, vote);
      }
      // ── 통계·리플레이 ──
      case "statsRequest":
        return this.sendCareerStats(conn);
      case "replayList":
        return this.sendReplayList(conn, user);
      case "replayGet": {
        const gameId = msg.gameId;
        if (!Number.isInteger(gameId)) {
          return this.fail(conn, "BAD_REQUEST", "잘못된 게임 ID입니다");
        }
        // 떠 있는(floating) Promise의 거부가 프로세스를 죽이지 않도록 반드시 잡는다
        void this.sendReplayData(conn, user, gameId as number).catch((err: unknown) => {
          console.error("replayGet error:", err);
          this.fail(conn, "INTERNAL", "리플레이 조회 중 오류가 발생했습니다");
        });
        return;
      }
      /*
       * 공유 링크 만들기·내리기 (§4-8). **참가자와 관리자만** 만들 수 있다 —
       * 남의 판을 대신 공개하는 길을 열지 않는다.
       */
      case "replayShare": {
        if (!Number.isInteger(msg.gameId)) {
          return this.fail(conn, "BAD_REQUEST", "잘못된 게임 ID입니다");
        }
        const db = this.db;
        if (db === undefined) return this.fail(conn, "NO_DB", "서버에 저장소가 없습니다");
        const game = db.getGame(msg.gameId);
        // "없다"와 "권한이 없다"를 합친다 — `sendReplayData`와 같은 이유다(§L-4).
        if (game === null || (!user.isAdmin && !game.participantUserIds.includes(user.id))) {
          return this.fail(conn, "REPLAY_NOT_FOUND", "리플레이를 찾을 수 없습니다");
        }
        if (msg.revoke === true) {
          db.unshareGame(msg.gameId);
          this.send(conn.ws, { type: "replayShareToken", gameId: msg.gameId, token: null });
          return;
        }
        this.send(conn.ws, {
          type: "replayShareToken",
          gameId: msg.gameId,
          token: db.shareGame(msg.gameId),
        });
        return;
      }
      // ── 전체 통계 (누구나) ──
      case "leaderboard":
        return this.sendLeaderboard(conn);
      // ── 친구 (§4-6) ──
      case "friendRequest": {
        const db = this.db;
        if (db === undefined) return this.fail(conn, "NO_DB", "서버에 저장소가 없습니다");
        if (typeof msg.nickname !== "string" || msg.nickname.trim() === "") {
          return this.fail(conn, "BAD_REQUEST", "닉네임을 입력해 주세요");
        }
        const res = db.requestFriend(user.id, msg.nickname.trim());
        if (!res.ok || res.nickname === undefined) {
          return this.fail(conn, "FRIEND_ADD_FAILED", res.error ?? "보내지 못했습니다");
        }
        // 상대 화면도 지금 갱신한다 — 편지함은 "요청이 왔다"를 늦게 알면 뜻이 없다.
        this.pushFriends(res.nickname);
        this.fail(
          conn,
          res.accepted === true ? "FRIEND_ADDED" : "FRIEND_REQUESTED",
          res.accepted === true
            ? `${res.nickname} 님과 친구가 되었습니다 — 서로 요청을 보냈습니다`
            : `${res.nickname} 님에게 친구 요청을 보냈습니다`,
        );
        return this.sendFriends(conn, user);
      }
      case "friendRespond": {
        const db = this.db;
        if (db === undefined) return this.fail(conn, "NO_DB", "서버에 저장소가 없습니다");
        if (typeof msg.nickname !== "string" || typeof msg.accept !== "boolean") return;
        const res = db.respondFriendRequest(user.id, msg.nickname, msg.accept);
        if (!res.ok || res.nickname === undefined) {
          this.sendFriends(conn, user); // 낡은 편지함을 들고 있다 — 바른 상태로 되돌린다
          return this.fail(conn, "FRIEND_RESPOND_FAILED", res.error ?? "처리하지 못했습니다");
        }
        if (msg.accept) {
          // 수락은 보낸 쪽에도 알린다. 거절은 알리지 않는다 — 거절당했다는 통보는
          // 아무 행동으로도 이어지지 않고 사람만 상하게 한다(편지함에서 조용히 사라진다).
          this.pushFriends(res.nickname, `${user.username} 님이 친구 요청을 수락했습니다`);
        } else {
          this.pushFriends(res.nickname);
        }
        return this.sendFriends(conn, user);
      }
      case "friendCancel": {
        const db = this.db;
        if (db === undefined) return this.fail(conn, "NO_DB", "서버에 저장소가 없습니다");
        if (typeof msg.nickname !== "string") return;
        db.cancelFriendRequest(user.id, msg.nickname);
        this.pushFriends(msg.nickname);
        return this.sendFriends(conn, user);
      }
      case "friendRemove": {
        const db = this.db;
        if (db === undefined) return this.fail(conn, "NO_DB", "서버에 저장소가 없습니다");
        if (typeof msg.nickname !== "string") return;
        db.removeFriend(user.id, msg.nickname);
        // 끊기는 쌍방이다 — 상대 화면에서도 사라져야 한다.
        this.pushFriends(msg.nickname);
        return this.sendFriends(conn, user);
      }
      case "friendList":
        return this.sendFriends(conn, user);
      case "friendInvite":
        return this.inviteFriend(conn, user, msg.nickname);
      // ── 제보 게시판 ──
      case "feedbackSubmit":
        return this.submitFeedback(conn, user, msg.kind, msg.title, msg.body);
      case "feedbackList":
        return this.sendFeedback(conn, user);
      case "feedbackUpdate": {
        if (!user.isAdmin) return this.fail(conn, "FORBIDDEN", "관리자 전용입니다");
        return this.updateFeedback(conn, user, msg.id, msg.status, msg.reply);
      }
      case "feedbackDelete":
        return this.deleteFeedback(conn, user, msg.id);
      // ── 계정 관리 (관리자) ──
      case "adminUsers": {
        if (!user.isAdmin) return this.fail(conn, "FORBIDDEN", "관리자 전용입니다");
        return this.sendAdminUsers(conn);
      }
      case "adminAugmentTiers": {
        if (!user.isAdmin) return this.fail(conn, "FORBIDDEN", "관리자 전용입니다");
        return this.sendAugmentTiers(conn);
      }
      // 자체 집계 (§8-6) — 외부 스크립트 없이 서버가 직접 센 수.
      case "adminAnalytics": {
        if (!user.isAdmin) return this.fail(conn, "FORBIDDEN", "관리자 전용입니다");
        this.send(conn.ws, { type: "adminAnalytics", days: this.analytics?.recent(30) ?? [] });
        return;
      }
      case "adminDeleteUser": {
        if (!user.isAdmin) return this.fail(conn, "FORBIDDEN", "관리자 전용입니다");
        return this.adminDeleteUser(conn, user, msg.userId);
      }
      /*
       * 공지 세우기·내리기 (§4-3).
       *
       * 바꾼 즉시 **접속 중인 모두에게** 다시 밀어 준다. 다음 접속까지 기다리게
       * 하면 정작 공지가 필요한 순간(점검 5분 전)에 아무에게도 닿지 않는다.
       * 대기실·게임 중인 사람도 받는다 — `serverInfo`는 화면을 갈아엎지 않고
       * 상단 띠만 바꾸는 메시지라 판을 방해하지 않는다.
       */
      case "adminSetNotice": {
        if (!user.isAdmin) return this.fail(conn, "FORBIDDEN", "관리자 전용입니다");
        const db = this.db;
        if (db === undefined) return this.fail(conn, "NO_DB", "서버에 저장소가 없습니다");
        if (typeof msg.title !== "string" || typeof msg.body !== "string") {
          return this.fail(conn, "BAD_REQUEST", "공지 형식이 올바르지 않습니다");
        }
        this.notice = db.setNotice(msg.title, msg.body);
        this.log(null, this.notice === null ? "공지를 내렸다" : `공지 갱신: ${this.notice.title}`);
        this.broadcastServerInfo();
        return;
      }
      // ── 관리자 관전 ──
      case "liveGames": {
        if (!user.isAdmin) return this.fail(conn, "FORBIDDEN", "관리자 전용입니다");
        this.send(conn.ws, {
          type: "liveGames",
          rooms: [...this.rooms.values()]
            // 증강 테스트·게스트 체험 방은 실대국이 아니므로 관전 목록에서 제외한다
            .filter((r) => r.phase === "playing" && !r.sandbox && !r.guest)
            .map((r) => ({
              code: r.code,
              startedAt: r.startedAt ?? "",
              players: r.agents.map((a) => ({
                nickname: a.nickname,
                isBot: this.isBot(a),
              })),
            })),
        });
        return;
      }
      case "spectate":
        return this.spectate(conn, user, msg.code);
      case "spectateStop":
        return this.stopSpectating(conn);
      // ── 증강 테스트 (관리자) ──
      case "sandboxStart": {
        if (!user.isAdmin) return this.fail(conn, "FORBIDDEN", "관리자 전용입니다");
        return this.sandboxStart(conn, user, msg.mode);
      }
      case "sandboxGrant": {
        if (!user.isAdmin) return this.fail(conn, "FORBIDDEN", "관리자 전용입니다");
        return this.sandboxGrant(conn, msg.augmentId, msg.target);
      }
      case "sandboxReset": {
        if (!user.isAdmin) return this.fail(conn, "FORBIDDEN", "관리자 전용입니다");
        return this.sandboxReset(conn, msg.augments, msg.mode, msg.hands);
      }
      case "sandboxViewAs": {
        if (!user.isAdmin) return this.fail(conn, "FORBIDDEN", "관리자 전용입니다");
        return this.sandboxViewAs(conn, msg.seat);
      }
      case "sandboxBotRules": {
        if (!user.isAdmin) return this.fail(conn, "FORBIDDEN", "관리자 전용입니다");
        return this.sandboxSetBotRules(conn, msg.rules);
      }
      case "sandboxControl": {
        if (!user.isAdmin) return this.fail(conn, "FORBIDDEN", "관리자 전용입니다");
        return this.sandboxSetControl(conn, msg.enabled === true);
      }
      default:
        return;
    }
  }

  /**
   * 인증(register/login) 공통 실행 — scrypt는 비동기(스레드풀)라 이 호출은
   * 떠 있는(floating) Promise다. 거부가 프로세스를 죽이지 않도록 여기서 잡는다.
   */
  private async doAuth(
    conn: Conn,
    failCode: string,
    run: () => Promise<AuthResult>,
  ): Promise<void> {
    try {
      const r = await this.withScryptSlot(run);
      if (!r.ok || r.user === undefined || r.sessionToken === undefined) {
        return this.fail(conn, failCode, r.error ?? "인증 실패");
      }
      this.applyAuth(conn, r.user, r.sessionToken);
    } catch (err) {
      // 큐 과포화는 남용 신호이므로 로그 없이 조용히 레이트리밋으로 응답한다
      // (공격 시 로그 스팸 방지). 그 외 예기치 못한 오류만 기록한다.
      if (err instanceof Error && err.message === "auth queue full") {
        return this.fail(conn, "RATE_LIMITED", "인증 요청이 많습니다. 잠시 후 다시 시도하세요");
      }
      console.error("auth error:", err);
      this.fail(conn, "INTERNAL", "인증 처리 중 오류가 발생했습니다");
    }
  }

  /**
   * 동시 scrypt 실행을 MAX_SCRYPT_CONCURRENCY로 제한한다. 인증 폭주가 libuv
   * 스레드풀을 독점해 진행 중 게임의 리플레이 fs I/O를 굶기지 못하게 한다.
   */
  private async withScryptSlot<T>(fn: () => Promise<T>): Promise<T> {
    if (this.scryptActive >= MAX_SCRYPT_CONCURRENCY) {
      // 큐가 이미 가득 차 있으면 더 쌓지 않고 거부한다 — 무한 큐 증가와
      // 정상 로그인 무기한 지연을 막는다. doAuth가 이 오류를 잡아 실패로 응답한다.
      if (this.scryptQueue.length >= MAX_SCRYPT_QUEUE) {
        throw new Error("auth queue full");
      }
      await new Promise<void>((resolve) => this.scryptQueue.push(resolve));
    }
    this.scryptActive++;
    try {
      return await fn();
    } finally {
      this.scryptActive--;
      const next = this.scryptQueue.shift();
      if (next !== undefined) next();
    }
  }

  /**
   * 연결당 인증 시도 레이트리밋. 창(AUTH_WINDOW_MS) 내 시도가 한도를 넘으면
   * true를 반환하고 RATE_LIMITED로 거부한다. 비동기 scrypt가 이벤트 루프를
   * 막지는 않지만, 한 연결이 CPU(스레드풀)를 독점하지 못하게 한다.
   */
  private rateLimited(conn: Conn): boolean {
    const now = Date.now();
    // 연결 단위 슬라이딩 윈도우.
    conn.authAttempts = conn.authAttempts.filter((t) => now - t < AUTH_WINDOW_MS);
    // IP 단위 슬라이딩 윈도우 — 새 연결을 열어 연결 단위 리밋을 우회하는 무차별 대입을 막는다.
    // 루프백/로컬은 제외한다(원격 클라는 직접 노출 배포에서 실제 IP로 도달한다).
    const exempt = conn.exempt;
    const ipHits = exempt
      ? []
      : (this.authIpHits.get(conn.key) ?? []).filter((t) => now - t < AUTH_IP_WINDOW_MS);

    if (
      conn.authAttempts.length >= AUTH_MAX_ATTEMPTS ||
      (!exempt && ipHits.length >= AUTH_IP_MAX_ATTEMPTS)
    ) {
      this.fail(conn, "RATE_LIMITED", "인증 시도가 너무 많습니다. 잠시 후 다시 시도하세요");
      return true;
    }
    conn.authAttempts.push(now);
    if (!exempt) {
      ipHits.push(now);
      this.authIpHits.set(conn.key, ipHits);
      this.pruneAuthIpHits(now);
    }
    return false;
  }

  /**
   * 비싼 조회의 종류별 슬라이딩 윈도우. 한도를 넘으면 true(거부).
   *
   * **왜 종류별인가**: 클라이언트는 인증 직후 `replayList`·`leaderboard`·`feedbackList`를
   * (관리자면 셋 더) **한꺼번에** 보낸다. 하나의 공용 창으로 묶으면 정상 로그인 한 번이
   * 창을 다 먹어 버려, 그 뒤 사람이 누른 조회가 거부된다. 종류마다 따로 세면 정상
   * 사용은 종류당 1회씩이라 여유가 그대로 남고, 폭주만 접힌다.
   *
   * 루프백/로컬(개발·테스트)은 면제한다 — 다른 남용 방어와 같은 기준이다.
   */
  private heavyLimited(conn: Conn, type: string): boolean {
    if (conn.exempt || !HEAVY_MESSAGES.has(type)) return false;
    const now = Date.now();
    const bucket = this.heavyBucketOf(conn);
    const hits = (bucket.get(type) ?? []).filter((t) => now - t < HEAVY_WINDOW_MS);
    if (hits.length >= HEAVY_MAX_PER_WINDOW) {
      bucket.set(type, hits);
      return true;
    }
    hits.push(now);
    bucket.set(type, hits);
    return false;
  }

  /**
   * 이 요청을 **무엇 단위로** 셀 것인가 (감사 2026-08-17 §10-4).
   *
   * 예전에는 `conn.heavyHits` — 연결마다 따로 셌다. 그런데 IP당 동시 연결이 16개
   * 허용되므로 탭을 열기만 하면 상한이 **연결 수만큼 곱해졌다**: 16 × 5회/10초 =
   * 8 req/s, 그리고 `replayList` 한 번이 동기 SQLite 51쿼리다. 이벤트 루프가 멈추면
   * 그 서버의 **모든 대국이 함께 멈춘다** — 상한이 있는데 없는 것과 같았다.
   *
   * 이제 로그인한 요청은 **계정 단위**로 센다. 탭을 몇 개 열어도 한 사람은 한 몫이다.
   * 인증 전 요청(`catalogRequest`)은 계정이 없으므로 **남용 방어 키(IP)** 로 센다 —
   * 연결 단위로 두면 그쪽이 같은 구멍으로 남는다.
   *
   * 사람의 실제 사용은 화면을 열 때 종류별 1회다. 계정 단위 5회/10초는 여러 탭을
   * 동시에 새로고침해도 넉넉하다.
   */
  private heavyBucketOf(conn: Conn): Map<string, number[]> {
    const key = conn.user !== null && !conn.guest ? `u:${conn.user.id}` : `k:${conn.key}`;
    let bucket = this.heavyHits.get(key);
    if (bucket === undefined) {
      bucket = new Map<string, number[]>();
      this.heavyHits.set(key, bucket);
    }
    return bucket;
  }

  /**
   * 비싼 조회 창을 **계정·IP 단위로** 모아 둔다 (§10-4). 연결이 닫혀도 남으므로
   * 주기적으로 완전히 지난 항목을 걷어낸다 — 유휴 방 청소와 같은 시계를 쓴다.
   */
  private readonly heavyHits = new Map<string, Map<string, number[]>>();

  /** 창이 완전히 지난 비싼 조회 항목을 걷어낸다 (메모리 상한). */
  private pruneHeavyHits(now: number): void {
    if (this.heavyHits.size < 1024) return;
    for (const [key, bucket] of this.heavyHits) {
      for (const [type, hits] of bucket) {
        if (hits.every((t) => now - t >= HEAVY_WINDOW_MS)) bucket.delete(type);
      }
      if (bucket.size === 0) this.heavyHits.delete(key);
    }
  }

  /** authIpHits 맵이 커지면 창이 완전히 지난 IP 항목을 정리한다(메모리 상한). */
  private pruneAuthIpHits(now: number): void {
    if (this.authIpHits.size < 2048) return;
    for (const [ip, hits] of this.authIpHits) {
      if (hits.every((t) => now - t >= AUTH_IP_WINDOW_MS)) this.authIpHits.delete(ip);
    }
  }

  /**
   * IP 단위 방 생성 슬라이딩 윈도우. 한도를 넘으면 true(거부).
   * 계정당 동시 1방 제한은 만들고 나가기를 반복하면 우회되므로, IP를 키로
   * 생성 빈도 자체를 제한한다. 루프백/로컬(테스트·개발)은 제외.
   */
  private roomCreateLimited(conn: Conn): boolean {
    if (conn.exempt) return false;
    const now = Date.now();
    const hits = (this.roomCreateIpHits.get(conn.key) ?? []).filter(
      (t) => now - t < ROOM_CREATE_WINDOW_MS,
    );
    if (hits.length >= ROOM_CREATE_MAX_PER_IP) {
      this.roomCreateIpHits.set(conn.key, hits);
      return true;
    }
    hits.push(now);
    this.roomCreateIpHits.set(conn.key, hits);
    // 메모리 상한 — 창이 완전히 지난 IP 항목을 정리한다.
    if (this.roomCreateIpHits.size >= 2048) {
      for (const [ip, ts] of this.roomCreateIpHits) {
        if (ts.every((t) => now - t >= ROOM_CREATE_WINDOW_MS)) this.roomCreateIpHits.delete(ip);
      }
    }
    return false;
  }

  /**
   * 연결을 방·좌석·관전에서 분리한다(신원·세션 토큰은 건드리지 않는다).
   * 로그아웃과 재인증이 공유하는 정리 로직. 대기실이면 좌석을 비우고,
   * 게임 중이면 좌석은 재접속용으로 남겨 둔다(신원=닉네임 기준 재접속).
   */
  private detachSeat(conn: Conn): void {
    if (conn.room !== null && conn.agent !== null && conn.room.phase === "waiting") {
      this.leaveWaiting(conn.room, conn.agent);
    }
    this.stopSpectating(conn);
    conn.room = null;
    conn.agent = null;
  }

  private applyAuth(conn: Conn, user: UserRow, sessionToken: string): void {
    // 재인증 방어 — 이미 인증돼 방/좌석을 가진 연결이 (같은/다른 신원으로) 다시
    // 로그인하면 이전 좌석 링크가 끊어져 대기실에 유령 좌석이 영구히 남는다.
    // 새 신원을 적용하기 전에 이전 좌석을 분리한다.
    if (conn.user !== null || conn.room !== null) {
      this.detachSeat(conn);
    }
    conn.user = user;
    conn.sessionToken = sessionToken;
    // 인증 완료 — 미인증 유예 타이머를 해제한다.
    if (conn.authDeadline !== null) {
      clearTimeout(conn.authDeadline);
      conn.authDeadline = null;
    }
    this.log(null, `로그인 ${user.username}${user.isAdmin ? " (관리자)" : ""} — ${conn.key}`);
    this.send(conn.ws, {
      type: "authOk",
      username: user.username,
      isAdmin: user.isAdmin,
      sessionToken,
      // 홈의 "진행하던 방으로 재접속"은 이 값만 보고 뜬다 (protocol.ts 주석).
      resumeRoom: this.resumableRoomFor(user.username),
    });
    // 홈 통계에서 증강 이름·등급을 게임 시작 전에도 쓸 수 있도록 정적 카탈로그를 보낸다.
    this.send(conn.ws, { type: "catalog", augments: this.augmentCatalog });
  }

  private fail(conn: Conn, code: string, message: string): void {
    this.send(conn.ws, { type: "error", code, message });
  }

  // ─────────────────────────── 방 생성·참가 ───────────────────────────

  private generateCode(): string {
    for (;;) {
      let code = "";
      for (let i = 0; i < CODE_LEN; i++) {
        code += CODE_CHARS[randomInt(CODE_CHARS.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
  }

  /** username이 이미 참가 중인 방 (관전·포기한 좌석 제외) */
  private membershipOf(username: string): Room | null {
    for (const room of this.rooms.values()) {
      if (room.agents.some((a) => this.isActiveHuman(a, username))) {
        return room;
      }
    }
    return null;
  }

  /**
   * **이 계정이 지금 돌아갈 수 있는 방 코드** (없으면 null).
   *
   * 판정은 `joinRoom`이 실제로 통과시키는 조건과 같아야 한다 — 여기서 알려 준
   * 코드를 클라이언트가 그대로 눌렀을 때 "존재하지 않는 방"이 돌아오면 고치려던
   * 문제가 그대로 남는다. 그래서 같은 세 가지를 본다: 강퇴 여부, 1인 전용 방
   * (체험·연습·증강 테스트)은 그 방 주인만, 진행 중이면 되돌릴 수 있는 좌석.
   */
  private resumableRoomFor(username: string): string | null {
    for (const room of this.rooms.values()) {
      if (room.kicked.has(username)) continue;
      const mineActive = room.agents.some((a) => this.isActiveHuman(a, username));
      // 1인 전용 방은 남에게 존재 자체를 감춘다(joinRoom과 같은 규칙)
      if ((room.sandbox || room.guest) && !mineActive) continue;
      if (room.phase === "playing") {
        const canReturn = room.agents.some(
          (a): a is HumanAgent =>
            a instanceof HumanAgent &&
            (!a.isAbandoned || a.canRejoin) &&
            a.nickname === username,
        );
        if (canReturn) return room.code;
      } else if (mineActive) {
        return room.code;
      }
    }
    return null;
  }

  /** 포기하지 않은 현역 사람 좌석인지 (username 일치). 포기한 좌석은 봇 취급. */
  private isActiveHuman(agent: PlayerAgent, username: string): boolean {
    return agent instanceof HumanAgent && !agent.isAbandoned && agent.nickname === username;
  }

  /**
   * 손패 배치를 좌석당 `HAND_ORDER_MIN_INTERVAL_MS` 간격으로 눌러서 반영한다.
   *
   * 첫 배치는 곧바로 반영해 끌어다 놓는 손맛을 유지하고, 그 뒤 창 안에 들어온
   * 것들은 **가장 마지막 하나만** 남겨 창이 끝날 때 한 번 더 반영한다. 그래서
   * 아무리 빠르게 밀어 넣어도 브로드캐스트는 초당 4회로 접히지만, 최종 배치는
   * 언제나 도착한다 — 마지막 것을 버리면 다른 사람 화면의 내 손패가 어긋난다.
   */
  private applyHandOrder(room: Room, seat: PlayerId, ids: number[]): void {
    let st = room.handOrderThrottle.get(seat);
    if (st === undefined) {
      st = { lastAt: 0, timer: null, pending: null };
      room.handOrderThrottle.set(seat, st);
    }
    const now = Date.now();
    const wait = HAND_ORDER_MIN_INTERVAL_MS - (now - st.lastAt);
    if (wait <= 0 && st.timer === null) {
      st.lastAt = now;
      room.controller?.setHandOrder(seat, ids);
      return;
    }
    // 창 안 — 최신 배치만 들고 있다가 창이 끝나면 그것 하나만 반영한다.
    st.pending = ids;
    if (st.timer !== null) return;
    const state = st;
    const timer = setTimeout(() => {
      state.timer = null;
      const next = state.pending;
      state.pending = null;
      if (next === null) return;
      state.lastAt = Date.now();
      // 기다리는 사이에 방이 사라졌을 수 있다 (게임 종료·청소).
      if (this.rooms.get(room.code) !== room) return;
      room.controller?.setHandOrder(seat, next);
    }, Math.max(wait, 0));
    // 이 타이머가 프로세스를 붙들어 둘 이유는 없다.
    timer.unref?.();
    state.timer = timer;
  }

  /**
   * 이 좌석을 붙들고 있던 **다른** 연결들에서 좌석을 떼어낸다 (`keep`은 남긴다).
   *
   * 한 좌석은 언제나 연결 하나만 몰아야 한다. 안 그러면 나가기·중단 투표 같은
   * "좌석 단위" 행동을 유령이 된 예전 탭이 대신 저질러 버린다.
   */
  private detachStaleConns(agent: HumanAgent, keep: Conn): void {
    for (const c of this.conns) {
      if (c.agent === agent && c !== keep) {
        c.room = null;
        c.agent = null;
      }
    }
  }

  /** 이 좌석을 지금 붙들고 있는 연결 (없으면 null). */
  private connOf(agent: HumanAgent): Conn | null {
    for (const c of this.conns) {
      if (c.agent === agent) return c;
    }
    return null;
  }

  /**
   * 대기실에 남은 **끊긴 좌석(유령)** 을 걷어낸다.
   *
   * 대기 중에는 재접속 개념이 없다 — 끊기면 `handleClose`가 그 자리에서 빼 준다.
   * 그래서 대기 중인 방에 소켓이 닫힌 사람 좌석이 남아 있다면 전부 유령이다.
   * 유령은 두 가지를 망가뜨렸다:
   * - 대기실에 **접속하지도 않은 사람이 앉아 있는 것처럼** 보이고, 준비를 하지 않아
   *   방장이 게임을 시작할 수 없다.
   * - `membershipOf`에 걸려 그 사람이 **새 방을 만들지도, 다른 방에 들어가지도** 못한다
   *   ("이미 방에 참가 중입니다"). 새로고침해야 풀리던 증상의 정체다.
   *
   * 유령이 생기는 길: 게임 중에 끊긴 좌석은 재접속용으로 남겨 두는데(설계), 그 사람이
   * 돌아오지 않은 채로 판이 끝나면 남겨 둘 근거가 사라진 좌석이 대기실로 넘어온다.
   */
  private pruneGhostSeats(room: Room): void {
    if (room.phase !== "waiting") return;
    for (const a of [...room.agents]) {
      if (!(a instanceof HumanAgent)) continue;
      if (a.isConnected() && !a.isAbandoned) continue;
      const c = this.connOf(a);
      if (c !== null) {
        c.room = null;
        c.agent = null;
      }
      this.leaveWaiting(room, a);
    }
  }

  /** 모든 대기실의 유령 좌석을 훑어 치운다 (방 생성·참가 직전의 지연 청소). */
  private sweepGhostSeats(): void {
    for (const room of [...this.rooms.values()]) this.pruneGhostSeats(room);
  }

  /**
   * **이 연결이 붙들고 있던 옛 좌석**을 놓아 준다 (놓았으면 true).
   *
   * 홈 화면은 방에 앉아 있는 동안 뜨지 않으므로, 이 연결에서 `createRoom`이나 다른
   * 코드의 `joinRoom`이 왔다는 것은 클라이언트가 이미 방을 떠난 것으로 알고 있다는
   * 뜻이다 — 서버 좌석만 남은 상태 어긋남이라 붙들고 있을 이유가 없다.
   * (예전에는 결과 화면에서 홈으로 나갈 때 클라이언트가 `leaveRoom`을 보내지 않아
   *  이 어긋남이 실제로 생겼다. 클라이언트를 고쳤지만, 캐시된 옛 클라이언트와
   *  아직 모르는 경로를 위해 서버에서도 스스로 풀리게 둔다.)
   *
   * 다른 탭·다른 연결이 실제로 쓰고 있는 좌석은 건드리지 않는다(중복 참가 방어 유지).
   * 게임 중인 방도 건드리지 않는다 — 그건 재접속으로 돌아가야 할 좌석이다.
   */
  private releaseOwnStaleSeat(conn: Conn, room: Room, username: string): boolean {
    if (room.phase !== "waiting") return false;
    const mine = room.agents.find(
      (a): a is HumanAgent => this.isActiveHuman(a, username),
    );
    if (mine === undefined) return false;
    if (!mine.isSocket(conn.ws) && mine.isConnected()) return false; // 다른 연결이 쓰는 좌석
    if (conn.agent === mine) {
      conn.room = null;
      conn.agent = null;
    }
    this.leaveWaiting(room, mine);
    return true;
  }

  private createRoom(conn: Conn, user: UserRow): void {
    this.sweepGhostSeats();
    let existing = this.membershipOf(user.username);
    if (existing !== null && existing.phase === "playing") {
      return this.fail(conn, "ALREADY_IN_GAME", `진행 중인 게임(${existing.code})이 있습니다 — 코드로 재접속하세요`);
    }
    // 이 연결이 붙들고 있던 대기실 좌석이면 놓아 준다 — 홈에서 방을 만들려는
    // 사람에게 "이미 방에 참가 중입니다"를 돌려주는 상태 어긋남을 스스로 푼다.
    if (existing !== null && this.releaseOwnStaleSeat(conn, existing, user.username)) {
      existing = this.membershipOf(user.username);
    }
    if (existing !== null) {
      return this.fail(conn, "ALREADY_IN_ROOM", `이미 방(${existing.code})에 참가 중입니다`);
    }
    // 전체 방 개수 상한 — 서버 전체 자원 보호.
    if (this.rooms.size >= MAX_ROOMS) {
      return this.fail(conn, "SERVER_BUSY", "서버가 혼잡합니다. 잠시 후 다시 시도하세요");
    }
    // IP당 방 생성 레이트리밋 — 계정을 갈아타며 방을 대량 생성하는 남용을 막는다.
    if (this.roomCreateLimited(conn)) {
      return this.fail(conn, "RATE_LIMITED", "방 생성이 너무 잦습니다. 잠시 후 다시 시도하세요");
    }
    const room = this.newRoom();
    this.send(conn.ws, { type: "roomCreated", code: room.code });
    this.seat(conn, user, room);
  }

  /** 새 방을 만들어 등록한다 (일반 방·샌드박스 공통 초기값). */
  private newRoom(
    options: {
      sandbox?: boolean;
      guest?: boolean;
      tutorial?: boolean;
      gameMode?: GameMode;
      botDifficulty?: BotDifficulty;
      /**
       * 방 코드를 지정한다 (이어하기 전용). 되살린 판은 **그 방 코드 그대로**
       * 서야 한다 — 사람들의 브라우저에 `majak.lastRoomCode`로 남아 있는 값이고,
       * "진행하던 방으로 재접속"이 그 값을 그대로 보낸다.
       */
      code?: string;
    } = {},
  ): Room {
    const code = options.code ?? this.generateCode();
    const room: Room = {
      code,
      agents: [],
      hostId: null,
      ready: new Set(),
      phase: "waiting",
      controller: null,
      writer: null,
      startedAt: null,
      spectators: new Set(),
      abortVotes: new Set(),
      kicked: new Set(),
      // 새 방의 기본은 **동풍전**이다 (2026-08-14 사용자 지시) — 한 판이 짧아
      // 처음 온 사람이 끝까지 가 보기 쉽다. 방장은 대기실에서 반장전으로 바꿀 수 있다.
      gameMode: options.gameMode ?? "tonpuu",
      sandbox: options.sandbox ?? false,
      guest: options.guest ?? false,
      tutorial: options.tutorial ?? false,
      guestToken: null,
      holdUntil: null,
      resumePath: null,
      preserveReplayOnAbort: false,
      sandboxAugments: {},
      sandboxHands: {},
      botArchetypes: new Map(),
      botGeneration: 0,
      // 방을 직접 만든 사람은 대기실에서 난이도를 고른다 — 기본은 지금까지대로
      // 봇의 최선(hard)이다. 다만 **게스트 체험만은 예외**로 낮춰 들어온다:
      // 그 사람은 대기실을 거치지 않아 고를 화면 자체가 없고, 마작을 처음 보는
      // 사람의 첫 판이 최선을 두는 봇 셋이면 배우기 전에 끝난다 (감사 §3-3).
      botDifficulty: options.botDifficulty ?? "hard",
      sandboxBotRules: {},
      sandboxControl: true,
      sandboxRestarting: false,
      lastActivityAt: Date.now(),
      handOrderThrottle: new Map(),
      tutorialHoldUntil: 0,
    };
    this.rooms.set(code, room);
    return room;
  }

  private joinRoom(conn: Conn, user: UserRow, rawCode: string): void {
    if (typeof rawCode !== "string") {
      return this.fail(conn, "ROOM_NOT_FOUND", "존재하지 않는 방 코드입니다");
    }
    this.sweepGhostSeats();
    const code = rawCode.trim().toUpperCase();
    const room = this.rooms.get(code);
    if (room === undefined) {
      return this.fail(conn, "ROOM_NOT_FOUND", "존재하지 않는 방 코드입니다");
    }

    // 증강 테스트·게스트 체험 방은 1인 전용 — 방 주인의 재접속만 허용하고,
    // 남에게는 방의 존재 자체를 감춘다(코드를 찍어 맞혀도 들어올 수 없다).
    if ((room.sandbox || room.guest) && !room.agents.some((a) => this.isActiveHuman(a, user.username))) {
      return this.fail(conn, "ROOM_NOT_FOUND", "존재하지 않는 방 코드입니다");
    }

    // 방장이 내보낸 사람은 이 방에 다시 들어올 수 없다
    if (room.kicked.has(user.username)) {
      return this.fail(conn, "KICKED", "방장이 내보낸 방입니다");
    }

    /*
     * 게임 중 — 같은 계정이면 신원 기준 재접속.
     *
     * **끊겨서 확정된 이탈은 되돌린다** (감사 §2-2). 예전에는 `!isAbandoned`로
     * 걸러서, 2~3분 끊긴 사람이 영영 못 돌아왔다 — 지하철·엘리베이터·와이파이↔LTE
     * 전환 한 번에 반장전 하나가 통째로 날아갔고, 좌석은 봇처럼 자동 진행돼 그
     * 사람 이름으로 순위와 전적까지 남았다.
     *
     * 스스로 나간 사람과 계정이 지워진 사람은 여전히 못 돌아온다(`canRejoin`).
     * 전자는 그게 본인의 결정이고, 후자는 돌아올 계정이 없다.
     */
    if (room.phase === "playing") {
      const mine = room.agents.find(
        (a): a is HumanAgent =>
          a instanceof HumanAgent &&
          (!a.isAbandoned || a.canRejoin) &&
          a.nickname === user.username,
      );
      if (mine === undefined) {
        // 왜 못 들어오는지 구분해 말한다. 이 문구는 클라이언트가 그대로 보여 준다.
        const left = room.agents.some(
          (a): a is HumanAgent =>
            a instanceof HumanAgent && a.isAbandoned && a.nickname === user.username,
        );
        return this.fail(
          conn,
          "ROOM_PLAYING",
          left
            ? "이 방에서 이미 나갔습니다 — 그 대국에는 다시 들어갈 수 없습니다"
            : "이미 게임이 시작된 방입니다",
        );
      }
      // 끊겨서 확정됐던 좌석이면 여기서 되돌린다 — 다음 결정부터 다시 직접 둔다.
      mine.reinstate();
      // 이 사람을 기다리며 세워 둔 판이었다면 시한을 푼다 (§2-5). `mine.reconnect`가
      // 아래에서 타이머를 정상 시간으로 되돌리므로 방 쪽 표식만 걷으면 된다.
      room.holdUntil = null;
      /*
       * **다른 좌석의 대기도 짧게 줄인다** (§2-10 되살린 판).
       *
       * 재시작 직후에는 네 사람이 전부 끊겨 있어 전 좌석이 세워져 있다. 그중
       * 한 명이 돌아왔는데 나머지 셋의 시한이 3분 그대로면, **돌아온 사람이
       * 아무 설명 없이 3분을 본다.** 이제는 기다리는 사람이 생겼으므로 평소의
       * 끊김 처리로 돌려보낸다 — 짧은 유예 뒤 자동 진행이고, 그 셋도 여전히
       * 언제든 돌아올 수 있다(좌석은 그대로 남는다).
       */
      for (const other of room.agents) {
        if (other === mine || !(other instanceof HumanAgent)) continue;
        // 세워 둔 시한을 **평소의 끊김 유예 길이로 줄인다** — 새 상태를 만들지
        // 않고 기존 처리로 돌려보내는 가장 짧은 길이다.
        if (other.isHeld) other.suspend(DISCONNECT_GRACE_MS);
      }
      // 이 좌석을 아직 붙들고 있는 **예전 연결**을 먼저 떼어낸다.
      //
      // 대기실 경로(`reseat`)는 이걸 하는데 여기만 빠져 있어서, 두 번째 탭으로
      // 들어오면 소켓 둘이 한 좌석을 몰았다. 예전 탭에서 "나가기"를 누르면
      // 그쪽 `conn.agent.abandon()`이 **지금 앉아 있는 사람의 자리**를 포기시키고,
      // 포기한 좌석은 재접속이 막혀(`ROOM_PLAYING`) 그 사람이 영영 못 들어왔다.
      // 중단 투표도 예전 탭이 그 좌석 이름으로 던질 수 있었다.
      this.detachStaleConns(mine, conn);
      conn.room = room;
      conn.agent = mine;
      /*
       * `joined` 를 **복원 전송보다 먼저** 보낸다.
       *
       * 클라이언트는 `joined` 를 "여기부터가 진짜다 — 지금 떠 있는 선택지는 전부
       * 낡았다"는 신호로 쓰고 프롬프트를 비운다(감사 §2-4: 재접속 뒤 남아 있던
       * 유령 프롬프트). 순서가 뒤집히면 방금 복원한 프롬프트가 그 초기화에
       * 지워져, 진짜로 기다리는 중인 선택지가 화면에서 사라진다.
       */
      this.send(conn.ws, { type: "joined", playerId: mine.id, roomId: code, token: "" });
      // 증강 테스트 방이면, 뷰·프롬프트 복원 전에 sandbox 패널 상태를 먼저 보낸다
      // (sandbox 메시지가 클라이언트에서 프롬프트를 초기화하므로 순서가 중요하다).
      mine.reconnect(conn.ws, room.sandbox ? () => this.sendSandboxState(room) : undefined);
      this.touch(room);
      this.log(room, `${user.username} 재접속 (${mine.id})`);
      // 돌아왔다는 사실을 나머지 좌석의 이름표에도 반영한다.
      // (본인에게도 다시 나간다 — reconnect가 복원해 준 뷰에는 "접속 끊김"이 박혀 있다.)
      this.refreshSeatStatus(room);
      // 진행 중인 중단 투표를 다시 집계해 전원에게 보낸다.
      //
      // `needed`는 접속한 사람 수라 재접속과 동시에 조용히 +1 된다. 여기서 다시 보내지
      // 않으면 ① 돌아온 사람은 걸려 있는 투표를 아예 못 보고(클라 상태는 비어 있다)
      // ② 남은 사람들의 화면은 낡은 정족수를 계속 띄운다 — 판을 접자는 합의가 아무
      // 설명 없이 성립하지 않는다.
      this.retallyAbortVotes(room);
      return;
    }

    // 대기실 — 중복 참가·정원 확인
    const mineHere = room.agents.find(
      (a): a is HumanAgent => this.isActiveHuman(a, user.username),
    );
    if (mineHere !== undefined) {
      /*
       * 내 계정의 좌석이면 **언제나 그 자리에 도로 앉힌다** — 새 자리를 주지 않는다.
       *
       * 예전에는 예전 소켓이 아직 살아 있으면 `DUPLICATE_JOIN`으로 거절했다. 그래서
       * **폰에서 대기실에 앉아 있다가 컴퓨터로 옮겨 앉는 것이 불가능했다** —
       * "이미 이 방에 참가 중입니다 (다른 탭 확인)"만 돌아왔다. 폰 브라우저를 닫아도
       * 소켓이 바로 죽지 않아(백그라운드 유지) 한참을 기다려야 했고, 기다렸는지
       * 아닌지도 화면에 안 보였다 (2026-08-18 사용자 보고).
       *
       * **게임 중 경로는 이미 이렇게 동작한다**(위 `detachStaleConns` → 재접속).
       * 같은 계정이 같은 방에 들어오는 같은 의도인데 대기 중이냐 진행 중이냐로
       * 결과가 갈릴 이유가 없다. 늦게 온 연결이 자리를 가져가고 예전 연결은
       * 떨어져 나간다(`reseat`이 `detachStaleConns`를 부른다).
       *
       * 남의 자리를 뺏는 길이 열리는 것은 아니다 — `isActiveHuman`이 닉네임(=계정)이
       * 같은 좌석만 고른다.
       */
      return this.reseat(conn, room, mineHere);
    }
    let other = this.membershipOf(user.username);
    // 이 연결이 붙들고 있던 다른 방의 대기실 좌석이면 놓아 주고 진행한다
    if (other !== null && this.releaseOwnStaleSeat(conn, other, user.username)) {
      other = this.membershipOf(user.username);
    }
    if (other !== null) {
      return this.fail(conn, "ALREADY_IN_ROOM", `이미 다른 방(${other.code})에 참가 중입니다`);
    }
    if (room.agents.length >= MAX_PLAYERS) {
      return this.fail(conn, "ROOM_FULL", "방이 가득 찼습니다");
    }
    this.seat(conn, user, room);
  }

  /**
   * 이미 있는 대기실 좌석에 이 연결을 도로 붙인다 (자리·방장·준비는 그대로).
   * 클라이언트가 방 상태만 잃었을 때 코드로 다시 들어오면 여기로 온다.
   */
  private reseat(conn: Conn, room: Room, agent: HumanAgent): void {
    this.detachStaleConns(agent, conn);
    agent.reconnect(conn.ws);
    conn.room = room;
    conn.agent = agent;
    this.send(conn.ws, { type: "joined", playerId: agent.id, roomId: room.code, token: "" });
    this.broadcastLobby(room);
  }

  /** 대기실 자리 배정 + joined/lobby 전송 */
  private seat(conn: Conn, user: UserRow, room: Room): void {
    const playerId = this.freeSlot(room);
    if (playerId === null) {
      return this.fail(conn, "ROOM_FULL", "방이 가득 찼습니다");
    }
    const agent = new HumanAgent(playerId, user.username, conn.ws);
    agent.roomCode = room.code; // 타임아웃 폴백 로그에 방 코드를 싣는다
    room.agents.push(agent);
    if (room.hostId === null) room.hostId = playerId;
    conn.room = room;
    conn.agent = agent;
    this.touch(room);
    this.log(room, `${user.username} 착석 (${playerId}, ${room.agents.length}/4)`);
    this.send(conn.ws, { type: "joined", playerId, roomId: room.code, token: "" });
    this.broadcastLobby(room);
  }

  /**
   * 대기실에서 나간 사람 정리: 자리·준비를 비우고, 방장이 나가면
   * 다른 사람에게 방장을 넘긴다. 사람이 아무도 안 남으면 방을 삭제한다.
   */
  private leaveWaiting(room: Room, agent: HumanAgent): void {
    const idx = room.agents.indexOf(agent);
    if (idx < 0) return;
    room.agents.splice(idx, 1);
    room.ready.delete(agent.id);

    if (room.hostId === agent.id) {
      const nextHost = room.agents.find((a) => a instanceof HumanAgent);
      room.hostId = nextHost ? nextHost.id : null;
    }

    const humansLeft = room.agents.some((a) => a instanceof HumanAgent);
    if (!humansLeft) {
      this.log(room, `${agent.nickname} 퇴장 — 사람이 없어 방을 닫는다`);
      this.rooms.delete(room.code);
      return;
    }
    this.touch(room);
    this.log(room, `${agent.nickname} 퇴장 (${room.agents.length}/4)`);
    this.broadcastLobby(room);
  }

  /**
   * 봇 채우기 (디버깅/테스트용) — 4명을 맞추고 **즉시** 게임을 시작한다.
   */
  async fillWithBots(code: string): Promise<void> {
    const room = this.rooms.get(code);
    if (!room || room.phase === "playing") return;
    this.addBots(room, MAX_PLAYERS - room.agents.length);
    this.shuffleSeatsIfFull(room); // 자리는 대기실 단계에서 정해진다 (startGame은 안 섞는다)
    await this.startGame(room);
  }

  // ─────────────────────────── 대기실 로직 ───────────────────────────

  private freeSlot(room: Room): PlayerId | null {
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const id = `p${i}` as PlayerId;
      if (!room.agents.some((a) => a.id === id)) return id;
    }
    return null;
  }

  private addBots(room: Room, n: number): void {
    for (let k = 0; k < n; k++) {
      const id = this.freeSlot(room);
      if (id === null) break;
      room.agents.push(this.newBot(room, id));
    }
    // 봇은 한 명씩 만들어지고 `BotAgent` 생성자는 제 시드에서 혼자 원형을 뽑는다 —
    // 옆자리를 모르니 겹친다. 명단이 바뀔 때마다 탁 전체를 다시 앉힌다.
    this.seatBotProfiles(room);
  }

  /**
   * 봇 1명 생성. 증강 테스트 방은 조작 가능한 봇(SandboxBotAgent)을 쓰고,
   * 지금 걸린 봇 제약을 곧바로 물려준다. 실대국 방은 종전 그대로 BotAgent다.
   */
  private newBot(room: Room, id: PlayerId): BotAgent {
    const seed = botSeed(room.code, id);
    // 방장이 이 자리의 성향을 지정했으면 그걸 물려준다 (없으면 시드에서 뽑는다)
    const forced = room.botArchetypes.get(id);
    if (!room.sandbox) {
      const bot = new BotAgent(id, `Bot_${id}`, seed, ALL_AUGMENT_DEFS, BOT_THINK_MS, forced);
      // 튜토리얼 봇은 리치도 화료도 하지 않는다 (`TUTORIAL_ROOM_NOTE` 3) — 제약을
      // 거는 배관(`restrictOptions`)은 샌드박스와 같은 것을 그대로 쓴다.
      if (room.tutorial) {
        bot.setRestrictions(TUTORIAL_BOT_RULES);
        // 그리고 사람이 리치를 걸면 그 대기패를 쏴 준다 (`TUTORIAL_FEED_NOTE`).
        bot.setTutorialFeed(() => this.tutorialFeedKinds(room));
        // 말풍선이 떠 있는 동안에는 아무도 패를 버리지 않는다 (`TUTORIAL_HOLD_NOTE`).
        bot.setTutorialHold(() => room.tutorialHoldUntil > Date.now());
      }
      return bot;
    }
    const bot = new SandboxBotAgent(id, `Bot_${id}`, seed, ALL_AUGMENT_DEFS, BOT_THINK_MS, forced);
    bot.setRestrictions(room.sandboxBotRules);
    return bot;
  }

  /**
   * ## 튜토리얼 배급 — 봇이 지금 쏴 주어야 할 패 종류 (TUTORIAL_FEED_NOTE, 2026-08-18)
   *
   * 리치를 걸고 나면 배우는 사람이 할 일은 **기다리는 것뿐**이다. 그런데 상대는
   * 봇 셋이고, 봇은 리치를 피해 안전패를 돌리는 것이 옳은 판단이다 — 그래서 그
   * 기다림은 대개 유국으로 끝난다. 론이라는 이 게임의 절반이 튜토리얼에서 영영
   * 안 나오는 셈이다. 사용자 지시도 그것이었다: "플레이어가 리치 이후 론을 할 때까지
   * 튜토리얼을 진행해."
   *
   * 그래서 튜토리얼 방에서만, 사람이 **리치를 선언한 뒤**에 그 대기패를 봇의
   * 버림 후보에서 우선한다. 지키는 선 셋:
   *
   * - **리치 전에는 한 장도 쏘지 않는다.** 리치를 걸기 전에 화료가 나 버리면
   *   정작 가르치려던 "리치 → 론"이 통째로 사라진다.
   * - **후리텐이면 쏘지 않는다.** 못 먹는 패를 던져 봐야 화면에는 아무 일도 안
   *   일어나고, 배우는 사람은 "리치를 걸었는데 아무도 안 버린다"로 읽는다.
   *   (`discardedKinds` — 코어의 후리텐 판정이 보는 것과 같은 기록이다.)
   * - **없는 패를 만들지는 않는다.** 봇 손에 그 종류가 있을 때만 나간다
   *   (`BotAgent.feedOption`). 대본대로 왔으면 대기가 여섯 장이라 몇 순 안에 나온다.
   *
   * 봇의 판단 자체는 손대지 않는다 — 이 함수가 답을 주지 않으면(튜토리얼이 아니거나
   * 리치 전이면) 봇은 종전과 한 치도 다르지 않게 둔다.
   */
  private tutorialFeedKinds(room: Room): ReadonlySet<string> {
    const none: ReadonlySet<string> = EMPTY_FEED;
    const state = room.controller?.gameState ?? null;
    if (state === null) return none;
    const me = room.agents.find((a) => !this.isBot(a));
    if (me === undefined) return none;
    // 뷰의 `riichiDeclared`가 아니라 판 상태의 `riichi`를 본다 — 숨은 리치(스텔스)도
    // 리치는 리치이므로, 공개 여부로 배급이 갈리면 그 증강을 든 판만 조용해진다.
    const rs = state.round.byPlayer[me.id];
    if (rs === undefined || rs.riichi === null) return none;

    /*
     * 지금이 사람의 차례면 손패가 14장이라 "무엇을 빼고 기다리는가"가 아직 안
     * 정해져 있다. 봇이 결정하는 순간은 사람의 차례가 아니므로 평소에는 걸리지
     * 않지만, 어긋난 순간에 엉뚱한 대기를 쏘느니 그 프레임은 그냥 쉰다.
     */
    const hand = handKindsOf(state, me.id);
    const melds = meldCountOf(state, me.id);
    if (hand.length !== 13 - melds * 3) return none;

    const waits = winningKinds(hand, melds);
    if (waits.length === 0) return none;
    // 후리텐 — 내가 이미 버린 종류로는 론이 안 된다. 쏴도 화면에 아무 일도 없다.
    const mine = new Set(rs.discardedKinds ?? []);
    const live = waits.map(kindKey).filter((k) => !mine.has(k));
    return live.length === 0 ? none : new Set(live);
  }

  private isBot(agent: PlayerAgent): boolean {
    return agent instanceof BotAgent;
  }

  /** 방장이 지금 시작할 수 있는가: 4인 + 방장 외 모든 사람이 준비. */
  private canStart(room: Room): boolean {
    if (room.agents.length !== MAX_PLAYERS) return false;
    return room.agents.every(
      (a) => this.isBot(a) || a.id === room.hostId || room.ready.has(a.id),
    );
  }

  private handleLobbyMessage(room: Room, agent: HumanAgent, msg: ClientMessage): void {
    // 대기실에서 무엇이든 눌렸다면 이 방은 살아 있다 — 유휴 청소 시계를 되돌린다.
    this.touch(room);
    switch (msg.type) {
      case "ready": {
        if (room.phase !== "waiting") return;
        if (agent.id === room.hostId) return; // 방장은 준비 개념 없음
        if (msg.ready) room.ready.add(agent.id);
        else room.ready.delete(agent.id);
        this.broadcastLobby(room);
        return;
      }
      case "addBot": {
        if (room.phase !== "waiting" || agent.id !== room.hostId) return;
        this.addBots(room, 1);
        this.broadcastLobby(room);
        return;
      }
      case "removeBot": {
        if (room.phase !== "waiting" || agent.id !== room.hostId) return;
        const idx = room.agents.findIndex((a) => a.id === msg.playerId && this.isBot(a));
        if (idx >= 0) {
          room.agents.splice(idx, 1);
          // 지정도 같이 지운다 — 안 그러면 나중에 그 좌석 id로 들어온 봇이
          // 지운 봇의 성향을 물려받는다
          room.botArchetypes.delete(msg.playerId);
          // 남은 봇을 다시 앉힌다 — 자리가 하나 빠진 탁은 다른 탁이다
          this.seatBotProfiles(room);
          this.broadcastLobby(room);
        }
        return;
      }
      case "setBotDifficulty": {
        if (room.phase !== "waiting" || agent.id !== room.hostId) return;
        if (typeof msg.difficulty !== "string" || !isBotDifficulty(msg.difficulty)) return;
        room.botDifficulty = msg.difficulty;
        // 실제 적용은 판 시작 때(seatBotProfiles) — 대기실에서는 표시만 바뀐다.
        this.broadcastLobby(room);
        return;
      }
      case "setBotArchetype": {
        if (room.phase !== "waiting" || agent.id !== room.hostId) return;
        if (typeof msg.playerId !== "string" || typeof msg.archetype !== "string") return;
        if (!isArchetypeName(msg.archetype)) return; // 모르는 원형은 무시
        const idx = room.agents.findIndex((a) => a.id === msg.playerId && this.isBot(a));
        if (idx < 0) return;
        room.botArchetypes.set(msg.playerId, msg.archetype);
        // 성향은 생성 시점에 정해지므로 그 자리의 봇을 새로 만든다 (대기 중이라 안전하다)
        room.agents[idx] = this.newBot(room, msg.playerId);
        // 지정된 원형이 나머지 후보에서 빠지도록 탁 전체를 다시 앉힌다
        this.seatBotProfiles(room);
        if (room.sandbox) this.syncSandboxControl(room);
        this.broadcastLobby(room);
        return;
      }
      case "kickPlayer": {
        if (room.phase !== "waiting" || agent.id !== room.hostId) return;
        if (typeof msg.playerId !== "string" || msg.playerId === room.hostId) return;
        const target = room.agents.find((a) => a.id === msg.playerId);
        if (target === undefined) return;
        if (!(target instanceof HumanAgent)) {
          // 봇을 지정했으면 removeBot과 같은 처리
          room.agents.splice(room.agents.indexOf(target), 1);
          this.broadcastLobby(room);
          return;
        }
        // 코드만 알면 곧바로 돌아올 수 있으면 강퇴가 아니다 — 이 방 한정으로 막는다
        room.kicked.add(target.nickname);
        target.notify({ type: "kicked", roomId: room.code });
        const c = this.connOf(target);
        if (c !== null) {
          c.room = null;
          c.agent = null;
        }
        this.leaveWaiting(room, target); // 자리·준비 정리 + 대기실 갱신 브로드캐스트
        return;
      }
      case "shuffleSeats": {
        if (room.phase !== "waiting" || agent.id !== room.hostId) return;
        if (room.sandbox) return; // 증강 테스트 방은 자리를 고정한다
        this.shuffleSeats(room);
        this.broadcastLobby(room);
        return;
      }
      case "setGameMode": {
        if (room.phase !== "waiting" || agent.id !== room.hostId) return;
        if (msg.mode !== "hanchan" && msg.mode !== "tonpuu") return;
        room.gameMode = msg.mode;
        this.broadcastLobby(room);
        return;
      }
      case "startGame": {
        if (room.phase !== "waiting" || agent.id !== room.hostId) return;
        if (!this.canStart(room)) {
          agent.notify({ type: "error", code: "NOT_READY", message: "4인 + 전원 준비가 필요합니다" });
          return;
        }
        void this.startGame(room);
        return;
      }
      default:
        return;
    }
  }

  private broadcastLobby(room: Room): void {
    if (room.phase !== "waiting") return;
    // 좌석(방위)은 agents 배열의 **순서**다 — 0번이 첫 동가(친).
    const players: LobbyPlayerEntry[] = room.agents.map((a, seat) => {
      const isBot = this.isBot(a);
      const isHost = a.id === room.hostId;
      const career = !isBot && this.statsStore ? this.statsStore.get(a.nickname) : null;
      return {
        playerId: a.id,
        seat,
        nickname: a.nickname,
        isBot,
        archetype: a.botArchetype ?? null,
        isHost,
        ready: isBot || isHost || room.ready.has(a.id),
        stats: career !== null ? deriveStats(career) : null,
      };
    });
    const canStart = this.canStart(room);
    for (const a of room.agents) {
      if (a instanceof HumanAgent) {
        a.notify({
          type: "lobby",
          roomId: room.code,
          hostId: room.hostId ?? a.id,
          youId: a.id,
          canStart,
          gameMode: room.gameMode,
          botDifficulty: room.botDifficulty,
          players,
        });
      }
    }
  }

  // ─────────────────────────── 정형구 ───────────────────────────

  /**
   * 정형구 하나를 같은 방 사람들에게 보낸다 (감사 2026-08-17 §4-9).
   *
   * 지키는 것 셋:
   *  · **목록에 있는 id만** 나간다. 클라이언트가 보낸 문자열을 남에게 그대로
   *    뿌리는 길을 만들지 않는다 — 그 길이 곧 자유 채팅이고, 그러면 고정 문구를
   *    고른 이유가 사라진다.
   *  · 같은 방 사람에게만 간다. 방 밖으로는 한 글자도 나가지 않는다.
   *  · 속도를 제한한다. 문구가 여덟 개뿐이어도 초당 스무 번이면 그건 도배다.
   */
  private handleEmote(conn: Conn, id: unknown): void {
    const room = conn.room;
    const agent = conn.agent;
    if (room === null || agent === null) {
      return this.fail(conn, "NOT_IN_ROOM", "방에 있지 않습니다");
    }
    if (typeof id !== "string" || !isEmoteId(id)) {
      return this.fail(conn, "INVALID_ACTION", "없는 문구입니다");
    }
    const now = Date.now();
    const recent = conn.emoteHits.filter((t) => now - t < EMOTE_WINDOW_MS);
    if (recent.length >= EMOTE_MAX_IN_WINDOW) {
      conn.emoteHits = recent;
      // 조용히 버리지 않고 말해 준다 — 눌렀는데 아무 일도 안 일어나면 고장으로 읽는다.
      return this.fail(conn, "RATE_LIMITED", "잠시 후에 다시 보낼 수 있습니다");
    }
    recent.push(now);
    conn.emoteHits = recent;

    const out = {
      type: "emoteFrom" as const,
      player: agent.id,
      nickname: agent.nickname,
      id,
    };
    for (const a of room.agents) {
      if (a instanceof HumanAgent) a.notify(out);
    }
    // 관전자에게도 보인다 — 자리에 앉은 사람들이 무슨 말을 주고받는지 보이지 않으면
    // 관전은 소리 없는 화면이 된다.
    for (const s of room.spectators) this.send(s.ws, out);
    this.touch(room);
  }

  /**
   * 친구 목록 + **지금 상태** (§4-6).
   *
   * 온라인 판정은 DB가 아니라 **살아 있는 연결 집합**에서 나온다 — 그게 유일한
   * 진실이다. "마지막 접속 시각"을 DB에 쓰는 방식은 갱신 지점이 여러 곳(접속·끊김·
   * 크래시)이고 크래시에서 반드시 어긋난다.
   *
   * 이 목록은 요청할 때만 나간다. 친구가 접속·이탈할 때마다 밀어 주는 실시간
   * 프레즌스는 만들지 않았다 — 사람이 서른 명대인 서버에서 그 스트림이 벌 값보다,
   * 홈에서 한 번 보고 방을 만드는 흐름이 충분하다. (새로 고침 버튼이 있다.)
   */
  private sendFriends(conn: Conn, user: UserRow): void {
    const payload = this.friendPayload(user.id);
    if (payload !== null) this.send(conn.ws, payload);
  }

  /** 닉네임 → 지금 접속해 있는가 / 그중 대국 중인가. */
  private onlineMap(): Map<string, boolean> {
    const online = new Map<string, boolean>();
    for (const c of this.conns) {
      if (c.user === null || c.guest) continue;
      // 한 사람이 여러 탭을 열어 뒀으면 **하나라도 대국 중이면** 대국 중으로 본다.
      const playing = c.room !== null && c.room.phase === "playing";
      online.set(c.user.username, (online.get(c.user.username) ?? false) || playing);
    }
    return online;
  }

  private friendPayload(userId: number): FriendListMessage | null {
    const db = this.db;
    if (db === undefined) return null;
    const online = this.onlineMap();
    return {
      type: "friendList",
      friends: db.friendNames(userId).map((nickname) => ({
        nickname,
        online: online.has(nickname),
        playing: online.get(nickname) === true,
      })),
      incoming: db.incomingFriendRequests(userId),
      outgoing: db.outgoingFriendRequests(userId),
    };
  }

  /**
   * 관계가 바뀐 **상대**의 화면을 지금 갱신한다 (요청 도착·수락·취소·절교).
   *
   * 목록 자체는 여전히 요청할 때만 나가지만(상시 프레즌스는 없다), 관계 변화는
   * 다르다 — 편지함에 요청이 왔다는 사실을 상대가 새로 고칠 때까지 모르면
   * 승인제 자체가 반쪽이 된다. 접속해 있지 않으면 아무 일도 하지 않는다:
   * 다음 접속 때 목록을 받으면서 자연히 보인다.
   */
  private pushFriends(username: string, toast?: string): void {
    const db = this.db;
    if (db === undefined) return;
    const target = db.userByName(username);
    if (target === null) return;
    const payload = this.friendPayload(target.id);
    if (payload === null) return;
    for (const c of this.conns) {
      if (c.user === null || c.guest || c.user.id !== target.id) continue;
      this.send(c.ws, payload);
      if (toast !== undefined) this.send(c.ws, { type: "error", code: "FRIEND_INFO", message: toast });
    }
  }

  /**
   * 친구를 지금 내 대기실로 부른다 (2026-08-19).
   *
   * 코드는 **서버가 붙인다** — 클라이언트가 실어 보내게 하면 아무 방에나 남을
   * 부르는 초대장을 찍어 낼 수 있다. 조건은 셋: 내가 대기실에 있을 것, 쌍방
   * 친구일 것, 상대가 접속해 있을 것.
   */
  private inviteFriend(conn: Conn, user: UserRow, nickname: unknown): void {
    const db = this.db;
    if (db === undefined) return this.fail(conn, "NO_DB", "서버에 저장소가 없습니다");
    if (typeof nickname !== "string" || nickname.trim() === "") return;
    const room = conn.room;
    if (room === null) return this.fail(conn, "NOT_IN_ROOM", "대기실에서만 부를 수 있습니다");
    if (room.phase !== "waiting") {
      return this.fail(conn, "ROOM_PLAYING", "이미 시작한 판에는 부를 수 없습니다");
    }
    const target = db.userByName(nickname.trim());
    if (target === null) return this.fail(conn, "FRIEND_INVITE_FAILED", "그런 계정이 없습니다");
    if (!db.areFriends(user.id, target.id)) {
      return this.fail(conn, "FRIEND_INVITE_FAILED", "친구에게만 보낼 수 있습니다");
    }
    if (room.kicked.has(target.username)) {
      return this.fail(conn, "FRIEND_INVITE_FAILED", "이 방에서 내보낸 사람입니다");
    }
    /*
     * 도배 방지 — 같은 사람에게 연달아 보내지 못하게 한다. 초대는 받는 쪽 메인
     * 화면에 카드로 뜨므로, 막지 않으면 단추 연타가 곧 상대 화면 도배가 된다.
     */
    const now = Date.now();
    const key = `${user.id}>${target.id}`;
    const last = this.inviteSentAt.get(key) ?? 0;
    if (now - last < INVITE_COOLDOWN_MS) {
      return this.fail(conn, "FRIEND_INVITE_FAILED", "방금 보냈습니다 — 잠시 후에 다시 보내세요");
    }
    const out = {
      type: "friendInviteFrom" as const,
      from: user.username,
      code: room.code,
      at: new Date(now).toISOString(),
    };
    let sent = 0;
    for (const c of this.conns) {
      // 이미 어느 방엔가 앉아 있는 탭에는 보내지 않는다 — 초대장은 "지금 갈 수
      // 있는 사람"에게만 뜻이 있고, 대국 중인 화면 위에 뜨면 방해일 뿐이다.
      if (c.user === null || c.guest || c.user.id !== target.id) continue;
      if (c.room !== null) continue;
      this.send(c.ws, out);
      sent++;
    }
    if (sent === 0) {
      return this.fail(conn, "FRIEND_INVITE_FAILED", `${target.username} 님은 지금 부를 수 없습니다`);
    }
    this.inviteSentAt.set(key, now);
    for (const [k, t] of this.inviteSentAt) if (now - t >= INVITE_COOLDOWN_MS) this.inviteSentAt.delete(k);
    this.fail(conn, "FRIEND_INVITED", `${target.username} 님을 불렀습니다`);
  }

  // ─────────────────────────── 통계·리플레이 ───────────────────────────

  /** 요청한 본인의 누적(career) 통계만 전송. */
  private sendCareerStats(conn: Conn): void {
    if (conn.user === null || !this.statsStore) return;
    const raw = this.statsStore.get(conn.user.username);
    const career: StatsEntry[] =
      raw !== null
        ? [{ nickname: conn.user.username, isBot: false, stats: deriveStats(raw) }]
        : [];
    this.send(conn.ws, { type: "stats", career, periods: this.periodsFor(conn.user) });
  }

  /**
   * 이 사람의 기간 성적 (§4-7) — 게스트·저장소 없음이면 빈 배열.
   *
   * 7일·30일 둘만 낸다. 더 잘게 쪼개면(오늘/어제/이번 주…) 판수가 적은 이 서버에서는
   * 대부분 0이 되어, 화면이 "아무것도 안 했다"고 말하는 칸으로 덮인다.
   */
  private periodsFor(user: UserRow): PeriodStats[] {
    const db = this.db;
    if (db === undefined || user.id === GUEST_USER_ID) return [];
    try {
      return [7, 30].map((days) => {
        const { games, placements } = db.periodStats(user.id, days);
        const sum = placements.reduce((acc, n, i) => acc + n * (i + 1), 0);
        return { days, games, placements, avgRank: games === 0 ? 0 : sum / games };
      });
    } catch (err) {
      // 기간 성적을 못 세는 것이 누적 통계까지 막을 이유는 없다.
      this.logError(null, "기간 성적 집계 실패:", err);
      return [];
    }
  }

  /**
   * 전체 플레이어 누적 통계(리더보드).
   * 닉네임별 성적은 **관리자 전용** — 비관리자에게는 닉네임을 빈 문자열로 지워 보낸다.
   * (증강 메타·도감 전체 통계는 이 데이터의 익명 집계라 누구나 계속 볼 수 있어야 하므로
   *  요청 자체를 막지 않고 신원만 제거한다. 클라는 nickname==="" 을 익명으로 취급.)
   */
  private sendLeaderboard(conn: Conn): void {
    if (!this.statsStore) {
      this.send(conn.ws, { type: "leaderboard", entries: [] });
      return;
    }
    const anonymize = conn.user === null || !conn.user.isAdmin;
    const cache = this.leaderboardTable();
    this.send(conn.ws, {
      type: "leaderboard",
      entries: anonymize ? cache.anonymous : cache.named,
    });
  }

  /**
   * 리더보드 표를 만들고 캐시한다 (**누가 부를 수 있는지는 그대로** — 비용만 고친다).
   *
   * 예전에는 요청마다 전체 통계표를 깊은 복사(JSON 왕복)하고, 계정마다 상관
   * 서브쿼리가 도는 `listUsers()`를 돌리고, 항목마다 `deriveStats`를 계산해 정렬했다.
   * 전부 **동기**라 그 시간 동안 이벤트 루프가 멈춘다 — 즉 서버의 모든 대국이 멈춘다.
   * 클라이언트는 로그인할 때마다·홈으로 돌아올 때마다 이걸 부르고, 연결당 40 req/s까지
   * 허용된다. 이제 통계·계정 세대(rev)가 그대로면 만들어 둔 표를 그대로 돌려준다.
   */
  private leaderboardTable(): { named: LeaderboardEntry[]; anonymous: LeaderboardEntry[] } {
    const store = this.statsStore;
    if (!store) return { named: [], anonymous: [] };
    const statsRev = store.version();
    const usersRev = this.db?.usersVersion() ?? 0;
    const now = Date.now();
    const c = this.leaderboardCache;
    if (
      c !== null &&
      c.statsRev === statsRev &&
      c.usersRev === usersRev &&
      now - c.at < LEADERBOARD_CACHE_TTL_MS
    ) {
      return c;
    }
    // 삭제된 계정의 "유령 통계"를 거른다 — stats.json은 닉네임 키라 계정을 지워도
    // 예전 통계가 남을 수 있다(과거 삭제·통계 파일 미정리분). 현재 존재하는 계정의
    // 닉네임만 리더보드에 포함해, 삭제가 stats 파일 정리 타이밍과 무관하게 즉시 반영되게 한다.
    const known = this.db ? new Set(this.db.listUsernames()) : null;
    const named: LeaderboardEntry[] = [];
    for (const [nickname, raw] of store.entries()) {
      if (known !== null && !known.has(nickname)) continue;
      named.push({ nickname, stats: deriveStats(raw) });
    }
    // 게임 수(활동량) 내림차순, 동률이면 평균 순위 오름차순으로 정렬한다.
    named.sort(
      (a, b) => b.stats.games - a.stats.games || a.stats.avgPlacement - b.stats.avgPlacement,
    );
    // 비관리자에게는 닉네임을 지운 사본을 준다(순서·통계는 동일).
    const anonymous = named.map((e) => ({ nickname: "", stats: e.stats }));
    this.leaderboardCache = { statsRev, usersRev, at: now, named, anonymous };
    return this.leaderboardCache;
  }

  // ─────────────────────────── 제보 게시판 ───────────────────────────

  /**
   * 볼 수 있는 제보 목록을 보낸다.
   * **비관리자에게는 SiteDb가 본인 글만 조회해 준다** — 여기서 다시 거르지 않아도
   * 남의 글이 실릴 수 없다(공개 범위가 쿼리 자체에 박혀 있다).
   */
  private sendFeedback(conn: Conn, user: UserRow): void {
    if (this.db === undefined) return this.fail(conn, "NO_DB", "서버에 계정 저장소가 없습니다");
    const rows = this.db.listFeedback(user);
    const entries: FeedbackEntry[] = rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      body: r.body,
      author: r.author,
      createdAt: r.createdAt,
      status: r.status,
      reply: r.reply,
      repliedAt: r.repliedAt,
      mine: r.userId !== null && r.userId === user.id,
    }));
    this.send(conn.ws, { type: "feedbackList", entries, isAdmin: user.isAdmin });
  }

  /** 제보 작성 — 성공하면 갱신된 목록을 되돌려준다. */
  private submitFeedback(
    conn: Conn,
    user: UserRow,
    kind: unknown,
    title: unknown,
    body: unknown,
  ): void {
    if (this.db === undefined) return this.fail(conn, "NO_DB", "서버에 계정 저장소가 없습니다");
    if (typeof kind !== "string" || typeof title !== "string" || typeof body !== "string") {
      return this.fail(conn, "BAD_REQUEST", "잘못된 요청입니다");
    }
    // 길이 상한은 SiteDb가 최종 판정하지만, 거대한 문자열이 DB까지 가지 않게 입구에서 자른다.
    if (title.length > MAX_FEEDBACK_FIELD || body.length > MAX_FEEDBACK_FIELD) {
      return this.fail(conn, "BAD_REQUEST", "내용이 너무 깁니다");
    }
    const res = this.db.addFeedback(user, kind, title, body);
    if (!res.ok) return this.fail(conn, "FEEDBACK_FAILED", res.error ?? "제보 등록에 실패했습니다");
    this.sendFeedback(conn, user);
  }

  /** 제보 상태·답변 변경 (관리자 전용 — 호출 전에 권한 확인됨). */
  private updateFeedback(
    conn: Conn,
    user: UserRow,
    id: unknown,
    status: unknown,
    reply: unknown,
  ): void {
    if (this.db === undefined) return this.fail(conn, "NO_DB", "서버에 계정 저장소가 없습니다");
    if (!Number.isInteger(id)) return this.fail(conn, "BAD_REQUEST", "잘못된 제보 ID입니다");
    if (status !== undefined && typeof status !== "string") {
      return this.fail(conn, "BAD_REQUEST", "잘못된 요청입니다");
    }
    if (reply !== undefined && (typeof reply !== "string" || reply.length > MAX_FEEDBACK_FIELD)) {
      return this.fail(conn, "BAD_REQUEST", "잘못된 요청입니다");
    }
    const res = this.db.updateFeedback(id as number, {
      ...(status !== undefined ? { status: status as string } : {}),
      ...(reply !== undefined ? { reply: reply as string } : {}),
    });
    if (!res.ok) return this.fail(conn, "FEEDBACK_FAILED", res.error ?? "제보 수정에 실패했습니다");
    this.sendFeedback(conn, user);
  }

  /** 제보 삭제 — 작성자 본인 또는 관리자 (권한 판정은 SiteDb). */
  private deleteFeedback(conn: Conn, user: UserRow, id: unknown): void {
    if (this.db === undefined) return this.fail(conn, "NO_DB", "서버에 계정 저장소가 없습니다");
    if (!Number.isInteger(id)) return this.fail(conn, "BAD_REQUEST", "잘못된 제보 ID입니다");
    const res = this.db.deleteFeedback(id as number, user);
    if (!res.ok) return this.fail(conn, "FEEDBACK_FAILED", res.error ?? "제보 삭제에 실패했습니다");
    this.sendFeedback(conn, user);
  }

  /** 전체 계정 목록 (관리자 전용). */
  private sendAdminUsers(conn: Conn): void {
    const users = this.db?.listUsers() ?? [];
    this.send(conn.ws, {
      type: "adminUsers",
      users: users.map((u) => ({
        id: u.id,
        username: u.username,
        isAdmin: u.isAdmin,
        createdAt: u.createdAt,
        games: u.games,
      })),
    });
  }

  /**
   * 증강 파워 티어표 (관리자 전용).
   *
   * **실시간**: 살아 있는 카탈로그(`this.augmentCatalog`)를 기준으로 매 요청마다
   * `AUGMENT_POWER_TIERS`를 조인한다 — 새로 추가했는데 티어를 안 매긴 증강은
   * `tier: null`(미분류)로 표에 그대로 드러나고, 카탈로그에서 빠진 id는 나오지 않는다.
   * 티어 데이터를 고치고 서버만 다시 띄우면 화면이 곧바로 따라온다.
   */
  private sendAugmentTiers(conn: Conn): void {
    const entries: AugmentTierEntry[] = this.augmentCatalog.map((a) => {
      const t = AUGMENT_POWER_TIERS[a.id];
      if (t === undefined) {
        return {
          id: a.id,
          name: a.name,
          category: a.category,
          description: a.description,
          tier: null,
          p: null,
          s: null,
          u: null,
          f: null,
          score: null,
          weight: null,
          rare: false,
          note: "",
        };
      }
      return {
        id: a.id,
        name: a.name,
        category: a.category,
        description: a.description,
        tier: t.tier,
        p: t.p,
        s: t.s,
        u: t.u,
        f: t.f,
        score: powerScore(t),
        weight: POWER_TIER_WEIGHT[t.tier],
        rare: t.rare === true,
        note: t.note,
      };
    });
    // 티어 내림차순 → 같은 티어면 총점 내림차순 (미분류는 맨 뒤)
    const rank = (tier: string | null): number =>
      tier === null ? POWER_TIER_ORDER.length : POWER_TIER_ORDER.indexOf(tier as never);
    entries.sort(
      (a, b) => rank(a.tier) - rank(b.tier) || (b.score ?? 0) - (a.score ?? 0),
    );
    this.send(conn.ws, {
      type: "adminAugmentTiers",
      entries,
      order: [...POWER_TIER_ORDER],
      labels: { ...POWER_TIER_LABEL },
      weights: { ...POWER_TIER_WEIGHT },
    });
  }

  /** 계정 삭제 (관리자 전용) — 본인은 삭제 불가. 삭제 후 목록·리더보드를 갱신한다. */
  private adminDeleteUser(conn: Conn, admin: UserRow, userId: number): void {
    if (this.db === undefined) return this.fail(conn, "NO_DB", "서버에 계정 저장소가 없습니다");
    if (!Number.isInteger(userId)) return this.fail(conn, "BAD_REQUEST", "잘못된 사용자 ID입니다");
    if (userId === admin.id) return this.fail(conn, "CANNOT_DELETE_SELF", "본인 계정은 삭제할 수 없습니다");
    let res: { ok: boolean; username?: string; error?: string };
    try {
      res = this.db.deleteUser(userId);
    } catch (err) {
      console.error("deleteUser error:", err);
      return this.fail(conn, "DELETE_FAILED", "계정 삭제 중 오류가 발생했습니다");
    }
    if (!res.ok) return this.fail(conn, "DELETE_FAILED", res.error ?? "계정 삭제에 실패했습니다");
    // 삭제된 사용자의 이미 열린 연결을 강제 로그아웃한다 (캐시된 권한·신원이 남지 않게).
    this.evictUser(userId);
    // 갱신된 목록·리더보드를 되돌려준다. 통계 저장소(닉네임 키)는 비동기라
    // 삭제 완료를 기다린 뒤 리더보드를 보내 삭제가 반영되게 한다.
    const finish = (): void => {
      this.sendAdminUsers(conn);
      this.sendLeaderboard(conn);
    };
    if (res.username !== undefined && this.statsStore) {
      void this.statsStore
        .remove(res.username)
        .then(finish)
        .catch((err: unknown) => {
          console.error("stats remove error:", err);
          finish();
        });
    } else {
      finish();
    }
  }

  /**
   * 주어진 사용자 id의 열린 연결을 전부 강제 로그아웃한다. 계정 삭제 시 호출한다 —
   * conn.user(권한 포함)는 인증 시 1회 캐시되고 재검증되지 않으므로, 이 축출이 없으면
   * 삭제된 계정이 이미 열린 소켓으로 관리자 권한을 계속 행사할 수 있다.
   */
  private evictUser(userId: number): void {
    for (const c of this.conns) {
      if (c.user?.id !== userId) continue;
      if (c.room !== null && c.agent !== null) {
        if (c.room.phase === "waiting") this.leaveWaiting(c.room, c.agent);
        else {
          // 계정이 사라졌다 — 돌아올 계정이 없으므로 재입장 대상이 아니다.
          c.agent.abandon("evicted"); // 게임 중이면 좌석을 봇처럼 자동 진행시켜 완주하게 둔다
          this.refreshSeatStatus(c.room); // 남은 사람 이름표에 "기권"을 세운다
        }
      }
      this.stopSpectating(c);
      c.room = null;
      c.agent = null;
      c.user = null;
      c.sessionToken = null;
      this.fail(c, "SESSION_REVOKED", "계정이 삭제되어 로그아웃되었습니다");
      try {
        c.ws.close();
      } catch {
        /* 이미 닫힘 */
      }
    }
  }

  private sendReplayList(conn: Conn, user: UserRow): void {
    // 관리자는 모든 게임 리플레이를, 일반 사용자는 본인 참가 게임만 본다.
    const rows = user.isAdmin
      ? this.db?.listAllGames() ?? []
      : this.db?.listGamesFor(user.id) ?? [];
    const games: ReplayGameSummary[] = rows.map((g) => ({
      gameId: g.gameId,
      code: g.code,
      endedAt: g.endedAt,
      players: g.players,
    }));
    this.send(conn.ws, { type: "replayList", games });
  }

  /**
   * 공유 토큰으로 리플레이를 내준다 — **계정을 보지 않는다** (§4-8).
   *
   * 토큰이 통하지 않는 모든 경우를 한 문구로 묶는다(없는 토큰·내려간 링크·지워진
   * 판). 구분해 답하면 그 자체가 "이 토큰은 존재한다"는 정보가 된다.
   */
  private async sendSharedReplay(conn: Conn, token: string): Promise<void> {
    const db = this.db;
    const gameId = db?.gameIdByShareToken(token) ?? null;
    if (db === undefined || gameId === null) {
      return this.fail(conn, "REPLAY_NOT_FOUND", "리플레이를 찾을 수 없습니다");
    }
    const game = db.getGame(gameId);
    if (game === null) {
      return this.fail(conn, "REPLAY_NOT_FOUND", "리플레이를 찾을 수 없습니다");
    }
    return this.deliverReplay(conn, gameId, game);
  }

  private async sendReplayData(conn: Conn, user: UserRow, gameId: number): Promise<void> {
    const game = this.db?.getGame(gameId) ?? null;
    // "없다"와 "볼 권한이 없다"를 **같은 응답으로 합친다** (감사 2026-08-12 §L-4).
    //
    // 예전에는 없는 id에 REPLAY_NOT_FOUND, 남의 판에 FORBIDDEN을 돌려줬다. 판 내용은
    // 새지 않지만 id를 훑으면 "지금까지 몇 판이 치러졌는가"와 "어느 id가 실재하는가"를
    // 알 수 있었다. 볼 수 없는 것은 없는 것과 구분되지 않아야 한다.
    if (game === null || (!user.isAdmin && !game.participantUserIds.includes(user.id))) {
      return this.fail(conn, "REPLAY_NOT_FOUND", "리플레이를 찾을 수 없습니다");
    }
    return this.deliverReplay(conn, gameId, game);
  }

  /** 권한 판정이 끝난 리플레이를 실제로 읽어 보낸다 (계정 경로·공유 경로 공용). */
  private async deliverReplay(
    conn: Conn,
    gameId: number,
    game: NonNullable<ReturnType<SiteDb["getGame"]>>,
  ): Promise<void> {
    let text: string;
    try {
      text = await readFile(game.replayPath, "utf-8");
    } catch {
      return this.fail(conn, "REPLAY_FILE_MISSING", "리플레이 파일이 유실되었습니다");
    }
    // 파일 하나가 통째로 프레임 하나가 된다 — 어디선가 비정상적으로 커졌다면
    // 그걸 split·직렬화해서 소켓에 밀어 넣는 대신 여기서 멈춘다. 실측 최대는
    // 250KB 남짓이라 정상 리플레이는 이 상한 근처에도 오지 않는다.
    if (text.length > MAX_REPLAY_BYTES) {
      this.logError(null, `리플레이가 너무 크다 (${text.length}B): ${game.replayPath}`);
      return this.fail(conn, "REPLAY_TOO_LARGE", "리플레이가 너무 커서 열 수 없습니다");
    }
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    this.send(conn.ws, {
      type: "replayData",
      gameId,
      summary: {
        gameId: game.gameId,
        code: game.code,
        endedAt: game.endedAt,
        players: game.players,
      },
      lines,
    });
  }

  // ─────────────────────────── 관전 (관리자) ───────────────────────────

  private spectate(conn: Conn, user: UserRow, rawCode: string): void {
    if (!user.isAdmin) return this.fail(conn, "FORBIDDEN", "관리자 전용입니다");
    if (typeof rawCode !== "string") {
      return this.fail(conn, "NOT_PLAYING", "진행 중인 게임이 아닙니다");
    }
    const code = rawCode.trim().toUpperCase();
    const room = this.rooms.get(code);
    if (room === undefined || room.phase !== "playing" || room.controller === null) {
      return this.fail(conn, "NOT_PLAYING", "진행 중인 게임이 아닙니다");
    }
    // 본인이 참가 중인 방은 관전 불가 — 관전 뷰는 전원의 손패·산·도라를 그대로
    // 노출하므로, 대국 중인 참가자(관리자여도)가 자기 방을 관전하면 완전정보
    // 치트가 된다. (다른 방 관전은 그대로 허용.)
    if (room.agents.some((a) => this.isActiveHuman(a, user.username))) {
      return this.fail(conn, "FORBIDDEN", "본인이 참가 중인 게임은 관전할 수 없습니다");
    }
    this.stopSpectating(conn); // 기존 관전 정리 (동시 1개)
    const sink: SpectatorSink = {
      id: conn.id,
      sendView: (view) => this.send(conn.ws, { type: "view", view }),
      notify: (msg) => this.send(conn.ws, msg),
    };
    room.spectators.add(conn);
    conn.spectating = room;
    this.send(conn.ws, { type: "spectateStarted", code });
    room.controller.addSpectator(sink); // 현재 뷰·카탈로그 즉시 전송됨
  }

  private stopSpectating(conn: Conn): void {
    const room = conn.spectating;
    if (room === null) return;
    room.spectators.delete(conn);
    room.controller?.removeSpectator(conn.id);
    conn.spectating = null;
  }

  // ─────────────────────────── 게임 무효(중단) 투표 ───────────────────────────

  /**
   * 게임 중 무효 투표. 방의 사람 전원이 동의하면(봇·이탈 좌석은 자동 동의)
   * 컨트롤러에 무효를 요청해 정산·기록 없이 게임을 끝낸다.
   */
  private handleVoteAbort(conn: Conn, vote: "agree" | "withdraw" | "reject"): void {
    const room = conn.room;
    if (room === null || room.phase !== "playing" || conn.agent === null) return;
    // 이미 지워진 방(무효 종료·크래시 뒤 남은 참조)이면 아무것도 하지 않는다 —
    // 폐기된 컨트롤러에 투표를 던져 봐야 아무 일도 일어나지 않는다.
    if (this.rooms.get(room.code) !== room || room.controller === null) return;

    // 아직 게임에 남아 **있고 표를 낼 수 있는** 사람들.
    //
    // 이탈 좌석뿐 아니라 **연결이 끊긴 좌석도** 자동 동의로 친다. 예전에는
    // `!isAbandoned`만 봐서, 소켓이 죽은 사람이 정족수에는 세지면서 표는 못 내는
    // 상태가 됐다 — 남은 사람이 전원 찬성해도 `needed`에 영영 못 닿아 판을 끝낼
    // 방법이 없었다(2026-08-08 QA BLOCKER-2, 실서버 재현). 끊긴 사람은 그
    // 화면조차 못 보고 있으므로 붙잡아 둘 이유도 없다.
    const humans = room.agents.filter(
      (a): a is HumanAgent => a instanceof HumanAgent && !a.isAbandoned && a.isConnected(),
    );
    if (humans.length === 0) return; // 사람이 없으면 봇 게임이 알아서 완주한다

    /*
     * **혼자 두는 기록 대국은 무효로 지울 수 없다** (감사 §10-3).
     *
     * 정족수가 "표를 낼 수 있는 사람 수"라, 사람 1 + 봇 3인 방은 **한 표로** 무효가
     * 됐다. 무효는 정산·기록을 남기지 않으므로 지는 판마다 눌러 없애면 전적이
     * 세탁된다 — 실제로 그렇게 쓸 수 있는 상태였다.
     *
     * 나가는 길은 막지 않는다. "나가기"는 그대로 되고, 그 판은 봇 자동 진행으로
     * 완주해 **기록에 남는다.** 그게 무효와 나가기의 차이다.
     *
     * 기록하지 않는 방(연습·증강 테스트)은 예외다 — 세탁할 전적이 없고, 그 방들은
     * 무효로 접는 것이 유일한 정리 수단이다. (**체험 방은 여기까지 오지도 않는다** —
     * `voteAbort`가 게스트 화이트리스트에 없어 그 앞에서 걸린다. 손님은 창을 닫으면
     * 된다.)
     */
    if (humans.length < 2 && !room.guest && !room.sandbox) {
      return this.fail(
        conn,
        "SOLO_ABORT_FORBIDDEN",
        "혼자 두는 대국은 무효로 지울 수 없습니다 — 나가면 남은 판은 자동으로 진행되고 기록에 남습니다",
      );
    }

    if (vote === "reject") room.abortVotes.clear(); // 거부 = 투표 전체 취소 (만장일치 불가)
    else if (vote === "agree") room.abortVotes.add(conn.agent.id);
    else room.abortVotes.delete(conn.agent.id); // withdraw = 내 동의 철회

    this.retallyAbortVotes(room);
  }

  /**
   * 중단 투표를 다시 집계해 알리고, 정족수가 차면 무효를 요청한다.
   *
   * 투표가 들어올 때뿐 아니라 **정족수가 바뀔 때도** 불러야 한다 — 좌석 하나가
   * 이탈로 확정되면 그 사람은 자동 동의로 빠지므로, 이미 모인 표만으로 무효가
   * 성립할 수 있다. 다시 세지 않으면 남은 사람은 아무 일도 안 일어난 줄 안다.
   */
  private retallyAbortVotes(room: Room): void {
    if (room.phase !== "playing" || room.controller === null) return;
    if (this.rooms.get(room.code) !== room) return;

    const humans = room.agents.filter(
      (a): a is HumanAgent => a instanceof HumanAgent && !a.isAbandoned && a.isConnected(),
    );
    const needed = humans.length;
    if (needed === 0) return;

    // 떠난·끊긴 사람의 표는 무효 처리 (표를 낼 수 있는 사람 표만 센다)
    const voters = [...room.abortVotes].filter((id) => humans.some((h) => h.id === id));
    room.abortVotes = new Set(voters);

    const status: ServerMessage = {
      type: "abortVote",
      votes: voters.length,
      needed,
      voters,
    };
    for (const h of humans) h.notify(status);

    // 표를 낼 수 있는 사람 전원 동의 → 무효 종료 (onGameAborted가 정리한다)
    if (voters.length >= needed) room.controller?.requestAbort();
  }

  /**
   * 사람이 한 명도 남지 않은 판을 무효로 접는다 (기권으로 마지막 좌석이 빠졌을 때).
   *
   * 끊긴 좌석은 세어 준다 — 재접속하면 이어서 둘 사람이다. 나가기(abandon)로
   * 확정된 좌석만 빠진 것으로 본다.
   */
  private abortIfNoHumansLeft(room: Room): void {
    if (room.phase !== "playing" || room.controller === null) return;
    if (this.rooms.get(room.code) !== room) return;
    const humans = room.agents.filter(
      (a): a is HumanAgent => a instanceof HumanAgent && !a.isAbandoned,
    );
    if (humans.length > 0) return;
    this.log(room, "사람이 모두 나갔다 — 판을 무효로 접는다");
    room.controller.requestAbort();
  }

  // ─────────────────────────── 게스트 체험 ───────────────────────────

  /** 이 연결이 붙들고 있는 게스트 방을 접는다 (좌석 분리 + 방 삭제). */
  private dropGuestRoom(conn: Conn): void {
    const room = conn.room;
    conn.room = null;
    conn.agent = null;
    if (room === null || !room.guest) return;
    room.controller?.requestAbort();
    this.rooms.delete(room.code);
  }

  /**
   * 지금 쓰이고 있지 않은 게스트 닉네임을 뽑는다 (`손님#0000`~`손님#9999`).
   *
   * 실계정과는 `#` 때문에 애초에 겹칠 수 없고(가입 정규식에 없는 문자), 같은 시각의
   * 다른 손님과만 겹치지 않으면 된다. 그래서 검사 범위는 살아 있는 방의 좌석 이름뿐이다.
   */
  private newGuestName(): string {
    const taken = new Set<string>();
    for (const room of this.rooms.values()) {
      for (const a of room.agents) taken.add(a.nickname);
    }
    for (let i = 0; i < 50; i++) {
      const name = `${GUEST_NAME_PREFIX}${String(randomInt(10_000)).padStart(4, "0")}`;
      if (!taken.has(name)) return name;
    }
    // 만 자리가 사실상 다 찼다 — 충돌만 피하면 되므로 더 넓은 꼬리를 붙인다.
    return `${GUEST_NAME_PREFIX}${randomInt(1_000_000)}`;
  }

  /**
   * 계정 없이 봇 3명과의 1인 게임을 즉시 시작한다 — 방문자가 "무엇인지" 알아보는 길.
   *
   * **가입 게이트를 여는 것이 아니다.** 손님은 임시 신원(DB 행 없음, 세션 토큰 없음)을
   * 받아 제 판 하나만 둘 수 있고, 방 만들기·코드 참가·리더보드·리플레이·제보는
   * 라우터의 화이트리스트에서 막힌다. 이 판은 아무 기록도 남기지 않는다.
   *
   * 남용 방어는 **새 장치를 만들지 않고 기존 것을 그대로 쓴다**:
   * - `rateLimited` — 인증과 같은 창(연결당 12회/분, IP당 30회/분)
   * - `roomCreateLimited` — 방 생성과 같은 창(IP당 20회/10분)
   * - `MAX_ROOMS` + `MAX_GUEST_ROOMS` + `MAX_GUEST_ROOMS_PER_IP`
   *
   * `tutorial`이면 같은 손님 방을 **배우기 좋게 고정해서** 연다 (`TUTORIAL_ROOM_NOTE`).
   * 남용 방어는 한 글자도 달라지지 않는다 — 튜토리얼도 손님 방 예산을 그대로 쓴다.
   */
  private guestPlay(conn: Conn, mode?: GameMode, tutorial = false): void {
    // 이미 로그인한 연결은 게스트가 될 수 없다 — 계정 좌석을 임시 신원으로 갈아
    // 끼우면 진행 중인 게임의 좌석 주인이 바뀐다.
    if (conn.user !== null && !conn.guest) {
      return this.fail(conn, "ALREADY_AUTHED", "이미 로그인되어 있습니다");
    }
    // 인증과 같은 레이트리밋 창 — 게스트가 스로틀을 우회하는 옆문이 되지 않게.
    if (this.rateLimited(conn)) return;
    if (this.roomCreateLimited(conn)) {
      return this.fail(conn, "RATE_LIMITED", "체험 시작이 너무 잦습니다. 잠시 후 다시 시도하세요");
    }
    this.sweepGhostSeats();
    if (this.rooms.size >= MAX_ROOMS) {
      return this.fail(conn, "SERVER_BUSY", "서버가 혼잡합니다. 잠시 후 다시 시도하세요");
    }
    // 지금 이 연결이 붙들고 있는 판은 세지 않는다 — 바로 아래에서 접고 새로 여는
    // 자리 바꿈이라, 세면 "한 판 더"가 만석일 때 제 자리를 두고도 거부당한다.
    const mine = conn.guest && conn.room?.guest === true ? conn.room : null;
    let guestRooms = 0;
    for (const r of this.rooms.values()) if (r.guest && r !== mine) guestRooms++;
    if (guestRooms >= MAX_GUEST_ROOMS) {
      return this.fail(conn, "SERVER_BUSY", "체험 게임이 가득 찼습니다. 잠시 후 다시 시도하세요");
    }
    // IP당 동시 게스트 방 — 탭을 여러 개 열어 손님 자리를 통째로 먹는 것을 막는다.
    // 게스트 방은 언제나 그 방을 연 연결 하나가 붙들고 있으므로(끊기면 방도 사라진다)
    // 연결을 세는 것이 곧 방을 세는 것이다.
    if (!conn.exempt) {
      let sameIp = 0;
      for (const c of this.conns) {
        if (c !== conn && c.guest && c.key === conn.key && c.room !== null && c.room.guest) sameIp++;
      }
      if (sameIp >= MAX_GUEST_ROOMS_PER_IP) {
        return this.fail(
          conn,
          "SERVER_BUSY",
          `같은 곳에서 체험 게임을 ${MAX_GUEST_ROOMS_PER_IP}개까지 동시에 둘 수 있습니다 — 열어 둔 창을 닫고 다시 시도하세요`,
        );
      }
    }
    // 이 연결이 앞선 게스트 판을 붙들고 있으면 접는다 (연속 체험 — "한 판 더").
    if (conn.guest) this.dropGuestRoom(conn);

    const user: UserRow = {
      id: GUEST_USER_ID,
      username: this.newGuestName(),
      isAdmin: false,
    };
    conn.user = user;
    conn.guest = true;
    conn.sessionToken = null;
    if (conn.authDeadline !== null) {
      clearTimeout(conn.authDeadline);
      conn.authDeadline = null;
    }
    // 세션 토큰은 빈 문자열 — 손님에게는 계정이 없으므로 계정 세션도 없다.
    // 대신 **그 판 하나로 돌아오는 열쇠**(guestToken)를 준다 (감사 §2-5).
    const guestToken = randomBytes(16).toString("hex");
    this.send(conn.ws, {
      type: "authOk",
      username: user.username,
      isAdmin: false,
      sessionToken: "",
      guest: true,
      guestToken,
    });
    this.send(conn.ws, { type: "catalog", augments: this.augmentCatalog });

    const room = this.newRoom({
      guest: true,
      tutorial,
      // 안 적어 보내면 방 기본값과 같은 동풍전 (newRoom 참고)
      gameMode: mode === "hanchan" ? "hanchan" : "tonpuu",
      // 체험판은 봇을 한 칸 낮춘다(skill 1.0 → 0.7). easy(0.35)까지 내리지 않는 이유:
      // 마작을 아는 사람이 이 게임을 보러 왔을 때 봇이 헛수를 두면 게임 자체가
      // 얕아 보인다. normal은 초심자에게 이길 여지를 주면서 봇이 바보처럼 보이지는
      // 않는 자리다. 계정을 만들고 방을 열면 그때부터는 기본이 hard다.
      //
      // 튜토리얼만 한 칸 더 내린다 — 여기서는 봇의 수준이 아니라 **화면 조작**을
      // 보여 주는 것이 목적이고, 배우는 사이에 봇이 판을 접으면 뒤 강의가 전부 멎는다.
      botDifficulty: tutorial ? "easy" : "normal",
    });
    room.guestToken = guestToken;
    this.send(conn.ws, { type: "roomCreated", code: room.code });
    this.seat(conn, user, room);
    this.addBots(room, MAX_PLAYERS - room.agents.length);
    void this.startGame(room);
  }

  /**
   * 끊겼던 손님이 자기 체험 판으로 돌아온다 (감사 §2-5).
   *
   * **새 재접속 경로를 만들지 않는 것이 요점이다.** 여기서 하는 일은 토큰으로
   * "그 방의 손님이 누구였는지"를 되살리는 것뿐이고, 좌석 복구·뷰 복원·유령
   * 프롬프트 정리는 전부 기존 `joinRoom`의 게임 중 재접속 경로가 한다.
   *
   * 토큰이 통하지 않는 경우를 **하나의 문구로 묶는다** — 방이 이미 끝났는지,
   * 시한이 지났는지, 애초에 없는 토큰인지는 손님에게 아무 차이가 없고, 구분해
   * 답하면 그것 자체가 "이 토큰은 존재한다"는 정보가 된다.
   */
  private guestResume(conn: Conn, rawToken: string): void {
    if (conn.user !== null && !conn.guest) {
      return this.fail(conn, "ALREADY_AUTHED", "이미 로그인되어 있습니다");
    }
    // 인증과 같은 레이트리밋 창 — 토큰 추측을 인증 스로틀 밖으로 빼지 않는다.
    if (this.rateLimited(conn)) return;
    const token = typeof rawToken === "string" ? rawToken : "";
    const room =
      token.length > 0
        ? [...this.rooms.values()].find((r) => r.guest && r.guestToken === token)
        : undefined;
    const seat =
      room === undefined
        ? undefined
        : room.agents.find((a): a is HumanAgent => a instanceof HumanAgent);
    if (room === undefined || seat === undefined || room.phase !== "playing") {
      return this.fail(conn, "GUEST_SESSION_GONE", "체험 대국이 이미 끝났습니다");
    }
    const user: UserRow = { id: GUEST_USER_ID, username: seat.nickname, isAdmin: false };
    conn.user = user;
    conn.guest = true;
    conn.sessionToken = null;
    if (conn.authDeadline !== null) {
      clearTimeout(conn.authDeadline);
      conn.authDeadline = null;
    }
    this.send(conn.ws, {
      type: "authOk",
      username: user.username,
      isAdmin: false,
      sessionToken: "",
      guest: true,
      guestToken: token,
    });
    this.send(conn.ws, { type: "catalog", augments: this.augmentCatalog });
    this.send(conn.ws, { type: "roomCreated", code: room.code });
    this.joinRoom(conn, user, room.code);
  }

  // ─────────────────────────── 연습 대국 (튜토리얼) ───────────────────────────

  /**
   * 연습 대국 — 로그인한 사람에게 **게스트 체험과 같은 판**을 준다.
   *
   * 갓 가입한 사람이 처음 마주치는 홈 화면은 "방 만들기 / 코드로 참가"다. 마작을
   * 처음 보는 사람에게 그 둘은 아무 뜻이 없고, 방을 만들어도 봇을 채우고 시작을
   * 눌러야 한다 — 배우기도 전에 세 단계가 있다. 튜토리얼(`client/src/tutorial.ts`)이
   * 서려면 **지금 당장 시작하는 한 판**이 필요하다.
   *
   * `guestPlay`를 그대로 쓸 수 없는 이유: 그쪽은 로그인한 연결을 명시적으로
   * 거절한다(계정 좌석을 임시 신원으로 갈아 끼우면 진행 중인 게임의 주인이 바뀐다).
   * 그래서 신원은 그대로 두고 **방만** 게스트 방으로 연다.
   *
   * 방을 `guest: true`로 두는 것이 요점이다 — 리플레이·게임 인덱스·리더보드·증강
   * 집계 어디에도 안 들어간다(`openGame`·`onGameOver`가 그 플래그 하나를 본다).
   * 연습으로 둔 판이 통계에 섞이면 "내 전적"이 연습판으로 오염된다.
   *
   * 대신 게스트 방의 성질도 함께 따라온다 — 끊기면 손님 방과 같은 규칙으로
   * **판을 세워 두고 기다린다**(§2-5, `SOLO_HOLD_MS`). 봇 셋뿐인 방이라 기다려도
   * 잃는 사람이 없다. 시한이 지나면 유휴 청소가 접는다.
   */
  private practicePlay(conn: Conn, user: UserRow, mode?: GameMode, tutorial = false): void {
    this.sweepGhostSeats();
    let existing = this.membershipOf(user.username);
    if (existing !== null && this.releaseOwnStaleSeat(conn, existing, user.username)) {
      existing = this.membershipOf(user.username);
    }
    if (existing !== null) {
      return this.fail(
        conn,
        existing.phase === "playing" ? "ALREADY_IN_GAME" : "ALREADY_IN_ROOM",
        `이미 방(${existing.code})에 참가 중입니다 — 나간 뒤 다시 시도하세요`,
      );
    }
    // 방 생성과 같은 레이트리밋 창 — 연습 대국이 방 생성 스로틀의 옆문이 되지 않게.
    if (this.roomCreateLimited(conn)) {
      return this.fail(conn, "RATE_LIMITED", "연습 대국 시작이 너무 잦습니다. 잠시 후 다시 시도하세요");
    }
    if (this.rooms.size >= MAX_ROOMS) {
      return this.fail(conn, "SERVER_BUSY", "서버가 혼잡합니다. 잠시 후 다시 시도하세요");
    }
    /*
     * 연습 방도 `guest: true`라 **손님용 방 예산을 같이 쓴다.** 여기서 안 세면
     * 계정 사용자들의 연습 판이 그 예산을 통째로 먹고, 정작 처음 온 손님이
     * "체험 게임이 가득 찼습니다"를 본다 — 그건 이 게임이 가장 잃으면 안 되는
     * 첫 손님이다.
     */
    let guestRooms = 0;
    for (const r of this.rooms.values()) if (r.guest) guestRooms++;
    if (guestRooms >= MAX_GUEST_ROOMS) {
      return this.fail(conn, "SERVER_BUSY", "연습 대국이 가득 찼습니다. 잠시 후 다시 시도하세요");
    }
    const room = this.newRoom({
      guest: true,
      tutorial,
      gameMode: mode === "hanchan" ? "hanchan" : "tonpuu",
      // 체험판과 같은 이유로 한 칸 낮춘다 — 대기실을 안 거치므로 난이도를 고를
      // 화면 자체가 없고, 배우는 자리에서 봇이 최선을 두면 배우기 전에 끝난다.
      // 튜토리얼은 거기서 한 칸 더 (`guestPlay` 주석과 같은 이유).
      botDifficulty: tutorial ? "easy" : "normal",
    });
    this.send(conn.ws, { type: "roomCreated", code: room.code });
    this.seat(conn, user, room);
    this.addBots(room, MAX_PLAYERS - room.agents.length);
    void this.startGame(room);
  }

  // ─────────────────────────── 증강 테스트 (관리자) ───────────────────────────

  /**
   * 증강 테스트 방을 만들고 즉시 시작한다 — 관리자 1명 + 봇 3명, 드래프트 없음.
   * 증강은 테스트 패널에서 직접 지급하며, 이 방의 게임은 기록을 남기지 않는다.
   */
  private sandboxStart(conn: Conn, user: UserRow, mode?: GameMode): void {
    this.sweepGhostSeats();
    let existing = this.membershipOf(user.username);
    if (existing !== null && this.releaseOwnStaleSeat(conn, existing, user.username)) {
      existing = this.membershipOf(user.username);
    }
    if (existing !== null) {
      return this.fail(
        conn,
        existing.phase === "playing" ? "ALREADY_IN_GAME" : "ALREADY_IN_ROOM",
        `이미 방(${existing.code})에 참가 중입니다 — 나간 뒤 다시 시도하세요`,
      );
    }
    if (this.rooms.size >= MAX_ROOMS) {
      return this.fail(conn, "SERVER_BUSY", "서버가 혼잡합니다. 잠시 후 다시 시도하세요");
    }
    const room = this.newRoom({
      sandbox: true,
      // 안 적어 보내면 방 기본값과 같은 동풍전 (newRoom 참고)
      gameMode: mode === "hanchan" ? "hanchan" : "tonpuu",
    });
    this.send(conn.ws, { type: "roomCreated", code: room.code });
    this.seat(conn, user, room);
    this.addBots(room, MAX_PLAYERS - room.agents.length);
    // 상태 메시지를 먼저 보낸다 — startGame이 동기적으로 첫 뷰를 쏘기 때문에,
    // 나중에 보내면 클라이언트가 테스트 화면을 준비하기 전에 뷰가 도착한다.
    this.sendSandboxState(room);
    void this.startGame(room);
  }

  /** 진행 중인 테스트 게임에 증강 1개를 즉시 지급한다. */
  private sandboxGrant(conn: Conn, augmentId: string, target?: PlayerId): void {
    const room = conn.room;
    if (room === null || !room.sandbox || conn.agent === null) {
      return this.fail(conn, "NOT_SANDBOX", "증강 테스트 게임에서만 사용할 수 있습니다");
    }
    if (room.controller === null) {
      return this.fail(conn, "NOT_PLAYING", "진행 중인 게임이 아닙니다");
    }
    if (typeof augmentId !== "string" || !this.augmentIds.has(augmentId)) {
      return this.fail(conn, "UNKNOWN_AUGMENT", "존재하지 않는 증강입니다");
    }
    const seat =
      typeof target === "string" && room.agents.some((a) => a.id === target)
        ? target
        : conn.agent.id;
    const res = room.controller.grantAugment(seat, augmentId);
    if (!res.ok) {
      return this.fail(conn, "GRANT_FAILED", `증강 지급 실패: ${res.reason ?? "알 수 없음"}`);
    }
  }

  /**
   * 테스트 게임 초기화 — 지금 판을 버리고, 지정한 증강만 지급된 새 판을 시작한다.
   * 새 판은 증강·규칙 등록이 전부 새 엔진에 다시 깔리므로, 이전 판에서 설치한
   * 증강의 흔적이 남지 않는다(증강 개별 제거보다 확실한 초기화).
   */
  private sandboxReset(
    conn: Conn,
    augments?: Record<string, string[]>,
    mode?: GameMode,
    hands?: Record<string, string[]>,
  ): void {
    const room = conn.room;
    if (room === null || !room.sandbox) {
      return this.fail(conn, "NOT_SANDBOX", "증강 테스트 게임에서만 사용할 수 있습니다");
    }
    // 이미 끝나 정리된 방(게임 종료 후 결과 화면)에서의 요청 — 되살리지 않는다.
    // 안 막으면 폐기된 컨트롤러에 abort를 걸어 재시작 플래그만 남고 아무 일도 안 일어난다.
    if (this.rooms.get(room.code) !== room) {
      return this.fail(conn, "ROOM_CLOSED", "끝난 테스트 게임입니다 — 홈에서 새로 시작하세요");
    }
    if (room.sandboxRestarting) return; // 이미 재시작 중 — 중복 요청 무시
    room.sandboxAugments = this.sanitizeSandboxAugments(room, augments);
    room.sandboxHands = sanitizeSandboxHands(room.agents, hands);
    if (mode === "hanchan" || mode === "tonpuu") room.gameMode = mode;

    // 아직 게임이 없으면(시작 실패·종료 직후) 바로 새 판을 시작한다
    if (room.controller === null) {
      room.phase = "waiting";
      this.sendSandboxState(room);
      void this.startGame(room);
      return;
    }
    // 진행 중이면 무효 종료를 요청하고, onGameAborted가 새 판을 시작한다
    room.sandboxRestarting = true;
    room.controller.requestAbort();
  }

  /**
   * 클라이언트가 보낸 좌석별 증강 목록을 정제한다 —
   * 실재하는 좌석·카탈로그에 있는 id만, 중복 없이, 좌석당 상한까지.
   */
  private sanitizeSandboxAugments(
    room: Room,
    augments?: Record<string, string[]>,
  ): Record<PlayerId, string[]> {
    const clean: Record<PlayerId, string[]> = {};
    if (augments === null || typeof augments !== "object") return clean;
    for (const [seat, ids] of Object.entries(augments ?? {})) {
      if (!room.agents.some((a) => a.id === seat) || !Array.isArray(ids)) continue;
      const picked: string[] = [];
      for (const id of ids) {
        if (typeof id !== "string" || !this.augmentIds.has(id) || picked.includes(id)) continue;
        picked.push(id);
        if (picked.length >= MAX_SANDBOX_AUGMENTS) break;
      }
      if (picked.length > 0) clean[seat as PlayerId] = picked;
    }
    return clean;
  }

  /**
   * 봇 행동 제약(후로·리치·화료·증강 금지)을 갱신하고 즉시 봇들에게 물린다.
   * 판을 갈아엎지 않으므로 다음 결정부터 바로 먹는다.
   */
  private sandboxSetBotRules(conn: Conn, rules: SandboxBotRules): void {
    const room = conn.room;
    if (room === null || !room.sandbox) {
      return this.fail(conn, "NOT_SANDBOX", "증강 테스트 게임에서만 사용할 수 있습니다");
    }
    room.sandboxBotRules = sanitizeBotRules(rules);
    for (const a of room.agents) {
      if (a instanceof BotAgent) a.setRestrictions(room.sandboxBotRules);
    }
    this.sendSandboxConfig(room);
  }

  /** 봇 좌석 직접 조작 모드를 켜고 끈다 (지금 보고 있는 좌석에 즉시 반영). */
  private sandboxSetControl(conn: Conn, enabled: boolean): void {
    const room = conn.room;
    if (room === null || !room.sandbox) {
      return this.fail(conn, "NOT_SANDBOX", "증강 테스트 게임에서만 사용할 수 있습니다");
    }
    room.sandboxControl = enabled;
    this.syncSandboxControl(room);
    this.sendSandboxConfig(room);
  }

  /**
   * 지금 누가 어느 봇 좌석을 조종하는지 맞춘다 —
   * "조작 모드가 켜져 있고, 그 봇 좌석 시점을 보고 있는 사람"이 조종자다.
   * 조종에서 풀린 좌석은 대기 중이던 결정을 즉시 봇에게 돌려준다.
   */
  private syncSandboxControl(room: Room): void {
    if (!room.sandbox) return;
    for (const agent of room.agents) {
      if (!(agent instanceof SandboxBotAgent)) continue;
      const driver = room.sandboxControl
        ? room.agents.find(
            (a): a is HumanAgent => a instanceof HumanAgent && a.viewSeatId === agent.id,
          ) ?? null
        : null;
      agent.setController(driver);
    }
  }

  /** 판을 건드리지 않는 설정 변경(봇 제약·조작 모드·조종 좌석)만 알린다. */
  private sendSandboxConfig(room: Room): void {
    for (const a of room.agents) {
      if (!(a instanceof HumanAgent)) continue;
      const controlling =
        room.agents.find(
          (b) => b instanceof SandboxBotAgent && b.controlledBy === a,
        )?.id ?? null;
      a.notify({
        type: "sandboxConfig",
        botRules: room.sandboxBotRules,
        control: room.sandboxControl,
        controlling,
      });
    }
  }

  /**
   * 테스트 방의 사람(=관리자)에게 현재 테스트 설정을 알린다.
   * seat/viewAs는 사람마다 다르므로(각자의 좌석·관찰 시점) 개별로 만들어 보낸다.
   */
  private sendSandboxState(room: Room): void {
    for (const a of room.agents) {
      if (!(a instanceof HumanAgent)) continue;
      a.notify({
        type: "sandbox",
        code: room.code,
        mode: room.gameMode,
        augments: room.sandboxAugments,
        hands: room.sandboxHands,
        botRules: room.sandboxBotRules,
        control: room.sandboxControl,
        seat: a.id,
        viewAs: a.viewSeatId ?? a.id,
      });
    }
  }

  /**
   * 증강 테스트 관찰 시점을 전환한다 — 지정 좌석(또는 SPECTATOR_ID) 시점의 뷰를
   * 즉시 다시 보내고, 이후 브로드캐스트도 그 시점으로 나간다. 관찰 전용이라
   * 결정(버림·리치 등)은 그대로 본인 좌석으로 처리된다.
   */
  private sandboxViewAs(conn: Conn, seat: PlayerId): void {
    const room = conn.room;
    const agent = conn.agent;
    if (room === null || !room.sandbox || !(agent instanceof HumanAgent)) {
      return this.fail(conn, "NOT_SANDBOX", "증강 테스트 게임에서만 사용할 수 있습니다");
    }
    // 실재 좌석이거나 전체 공개(SPECTATOR_ID)만 허용한다.
    const valid = seat === SPECTATOR_ID || room.agents.some((a) => a.id === seat);
    if (typeof seat !== "string" || !valid) {
      return this.fail(conn, "BAD_SEAT", "존재하지 않는 좌석입니다");
    }
    // 본인 좌석이면 override를 해제해 평소 시점으로 되돌린다.
    agent.setViewSeat(seat === agent.id ? null : seat);
    // 시점이 바뀌었다 — 조종권도 따라 옮긴다(놓인 좌석의 대기 결정은 봇이 회수한다)
    this.syncSandboxControl(room);
    this.sendSandboxConfig(room);
    // 다음 상태 변화를 기다리지 않고 즉시 새 시점의 뷰를 보낸다. 클라이언트는
    // 이 뷰의 playerId로 현재 관찰 좌석을 판별하므로 sandbox 메시지 재전송은 불필요
    // (재전송하면 진행 중 프롬프트·결과 화면이 초기화된다).
    room.controller?.resendViewTo(agent.id);
  }

  /**
   * 테스트 판을 새로 시작한다 (이전 컨트롤러가 무효 종료된 뒤 호출).
   * 봇은 새 인스턴스로 교체하고 사람 좌석은 대기 중이던 결정을 버려,
   * 지난 판의 내부 상태가 새 판으로 새지 않게 한다.
   */
  private restartSandbox(room: Room): void {
    room.sandboxRestarting = false;
    room.phase = "waiting";
    room.controller = null;
    room.writer = null;
    room.abortVotes.clear();
    room.agents = room.agents.map((a) => (this.isBot(a) ? this.newBot(room, a.id) : a));
    this.rerollBotProfiles(room);
    for (const a of room.agents) {
      if (a instanceof HumanAgent) a.resetForNewGame();
    }
    // 새 판은 내 시점에서 시작한다(resetForNewGame가 viewSeat을 비운다) — 조종 대상도 없다
    this.syncSandboxControl(room);
    this.sendSandboxState(room);
    void this.startGame(room);
  }

  /**
   * 게임이 끝난 방을 **대기실 상태로 되돌린다** — 방·좌석·방장은 그대로 남는다.
   *
   * 예전에는 종국과 동시에 방을 지웠다. 그래서 같은 멤버로 한 판 더 하려면 전원이
   * 홈으로 나가 방을 새로 만들고 코드를 다시 나눠야 했다(2026-08-01 사용자 요청).
   * 지금은 결과 화면의 "이어하기"가 이 대기실로 돌아오게 하고, 평소처럼 **전원 준비 +
   * 방장 시작**으로 다음 판이 열린다 — 동의 절차를 새로 만들지 않고 대기실을 그대로 쓴다.
   *
   * 사람이 아무도 안 돌아오면 방은 저절로 사라진다: 마지막 사람이 나가거나(leaveWaiting)
   * 연결이 끊기는 순간 humansLeft가 false가 되어 방이 지워진다.
   * 증강 테스트 방도 같은 처리다 — 종국이 곧 방 퇴장이 아니라 **판 초기화**가 되어,
   * 테스트 패널의 "새 판"·"초기화"가 종국 뒤에도 그대로 먹는다.
   */
  private resetRoomAfterGame(room: Room): void {
    if (this.rooms.get(room.code) !== room) return; // 이미 정리된 방
    room.phase = "waiting";
    room.controller = null;
    room.writer = null;
    room.startedAt = null;
    room.abortVotes.clear();
    room.ready.clear();
    room.sandboxRestarting = false;
    this.touch(room);
    // 봇은 새 인스턴스로 — 지난 판의 내부 상태(프로필·기억)를 다음 판에 끌고 가지 않는다
    room.agents = room.agents.map((a) => (this.isBot(a) ? this.newBot(room, a.id) : a));
    // 새 인스턴스는 저마다 혼자 원형을 뽑았다 — 다음 판 몫으로 탁을 다시 앉힌다
    this.rerollBotProfiles(room);
    // 자리는 그대로 둔다 — 섞는 건 방장이 "자리 섞기"를 눌렀을 때만이다.
    for (const a of room.agents) {
      if (a instanceof HumanAgent) a.resetForNewGame();
    }
    // 포기했거나 이미 연결이 끊긴 좌석은 대기실에 유령으로 남기지 않는다.
    // 게임 중 끊긴 좌석은 재접속용으로 남겨 두지만(설계), 판이 끝나면 그 근거가 사라진다 —
    // 안 치우면 게임을 끄고 돌아오지 않은 사람이 대기실에 앉아 있는 것처럼 보이고
    // (준비를 안 하니 방장은 시작도 못 한다), 그 사람은 새 방을 만들지도 못한다.
    this.pruneGhostSeats(room);
    if (this.rooms.get(room.code) !== room) return; // 마지막 사람이 빠져 방이 사라졌다
    if (room.hostId === null || !room.agents.some((a) => a.id === room.hostId)) {
      room.hostId = room.agents.find((a) => a instanceof HumanAgent)?.id ?? null;
    }
    if (room.sandbox) {
      this.syncSandboxControl(room);
      this.sendSandboxState(room);
    }
    this.broadcastLobby(room);
  }

  // ─────────────────────────── 게임 시작·진행 ───────────────────────────

  /**
   * 좌석(방위) 무작위 배정 — `room.agents` 순서를 섞는다.
   *
   * 좌석은 `HanchanController`가 받는 배열의 **순서**로 정해진다(0번이 첫 동가=친).
   * 들어온 순서가 곧 자리였을 때는 방장이 늘 친으로 시작하고 늘 같은 상대가 하가에
   * 앉았다 — 자리는 판의 유불리에 직결되므로 무작위로 뽑는다.
   * 좌석 id(p0~p3)는 그대로라 재접속·관전·증강 지급 경로는 영향을 받지 않는다.
   *
   * ⚠ 예전에는 이걸 `startGame` 직전에 **몰래** 돌렸다. 그러면 대기실이 보여 주던
   * 동남서북(그때는 playerId 번호순이었다)과 실제 방위가 달라, 게임에 들어가서야
   * 자기 자리를 알 수 있었다.
   *
   * ⚠ 그 뒤에는 방이 4인으로 찰 때·판이 끝날 때도 자동으로 돌렸는데, 봇 추가 버튼으로
   * 마지막 자리를 채우는 순간 이미 보고 있던 자리가 통째로 뒤집혔다. 지금은 **방장이
   * `shuffleSeats`(자리 섞기)를 눌렀을 때만** 섞는다.
   *
   * 증강 테스트 방은 섞지 않는다 — 초기화할 때마다 내 방위가 바뀌면 시험이 어렵다.
   */
  private shuffleSeats(room: Room): void {
    if (room.sandbox) return;
    for (let i = room.agents.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      const a = room.agents[i] as PlayerAgent;
      room.agents[i] = room.agents[j] as PlayerAgent;
      room.agents[j] = a;
    }
  }

  /**
   * 방이 4인으로 찼을 때 자리를 한 번 섞는다.
   *
   * 대기실 경로에서는 쓰지 않는다(자리는 방장이 눌렀을 때만 바뀐다).
   * 남은 사용처는 `fillWithBots` — 대기실을 거치지 않고 곧바로 시작하는 디버깅 경로라
   * "자리가 눈앞에서 뒤집히는" 문제가 없고, 기본값이 무작위인 편이 낫다.
   */
  private shuffleSeatsIfFull(room: Room): void {
    if (room.agents.length < MAX_PLAYERS) return;
    this.shuffleSeats(room);
  }

  /**
   * 게임을 시작한다. **이 함수는 거부하지 않는다** — 실패는 안에서 잡아 방을
   * 대기실로 되돌린다(`rollbackFailedStart`).
   *
   * ⚠ 여기가 좀비 방의 산지였다. `phase = "playing"`을 먼저 세우고 그 뒤에
   * `writer.open()`(mkdir — EACCES·ENOSPC로 던진다)과 컨트롤러 생성(증강 레지스트리·
   * 가중치)을 했는데, 모든 호출부가 `void this.startGame(room)`이라 그 사이의 예외는
   * 전역 핸들러로 새 나갔다. 남은 방은 `phase:"playing"` + `controller:null`로 **영원히**
   * 굳었다 — 청소하는 곳이 없으니 네 사람은 그 뒤로 `createRoom`마다 ALREADY_IN_GAME을
   * 받고, `joinRoom`은 존재하지 않는 게임으로 "재접속"시켰다.
   */
  private async startGame(room: Room): Promise<void> {
    if (room.phase === "playing") return;
    if (this.shuttingDown) return;
    room.phase = "playing";
    room.startedAt = new Date().toISOString();
    this.touch(room);
    this.seatBotProfiles(room);
    try {
      await this.openGame(room);
    } catch (err) {
      this.rollbackFailedStart(room, err);
    }
  }

  /**
   * 봇 셋의 성격을 **한 번에** 뽑아 앉힌다 — 지금 판 번호(`botGeneration`) 그대로.
   *
   * 좌석마다 따로 뽑던 예전 방식에는 두 가지가 없었다.
   *
   * 1. **서로 겹치지 않는다는 보장** — 원형 6종에서 독립적으로 3번 뽑으면 둘이 겹칠
   *    확률이 약 44%다. 같은 원형끼리는 흔들림이 ±0.08뿐이라 사실상 같은 봇 둘을
   *    상대하게 된다. `rollTableProfiles`가 이미 앉은 원형을 후보에서 빼 준다.
   * 2. **판마다 달라진다는 보장** — 시드가 방 코드로만 정해져 있어 이어하기로 몇 판을
   *    두든 같은 셋이 나왔다(`rerollBotProfiles`).
   *
   * 방장이 지정한 자리는 그대로 존중하고, 지정된 원형만 나머지 후보에서 뺀다.
   *
   * ⚠ 예전에는 이걸 `startGame`에서**만** 불렀다. 그래서 대기실은 `BotAgent` 생성자가
   * 혼자 뽑은 원형을 보여 줬고 — 봇을 한 명씩 추가하니 서로를 몰라 겹쳤다(실제로
   * 남=변덕형·서=균형형·북=변덕형) — 게다가 판이 시작되면 그 표시와 다른 셋이 앉았다.
   * 지금은 **명단이 바뀔 때마다** 불러, 대기실에 보이는 성향이 곧 그 판에 앉을 성향이다.
   * 같은 판 번호로 여러 번 불러도 결과가 같으므로(순수 함수) 몇 번 불려도 안전하다.
   */
  private seatBotProfiles(room: Room): void {
    const bots = room.agents.filter((a): a is BotAgent => a instanceof BotAgent);
    if (bots.length === 0) return;
    const rng = new Prng(tableSeed(room.code, room.botGeneration));
    const forced = bots.map((b) => room.botArchetypes.get(b.id));
    const profiles = rollTableProfiles(rng, bots.length, forced);
    bots.forEach((bot, i) => {
      const profile = profiles[i];
      if (profile === undefined) return;
      bot.setProfile(withDifficulty(profile, room.botDifficulty));
    });
  }

  /**
   * 판 번호를 올리고 다시 앉힌다 — **다음 판에는 다른 사람이 앉는다.**
   *
   * 판이 끝나 대기실로 돌아올 때만 부른다. 여기서 올려 두면 대기실이 보여 주는 성향이
   * 곧 다음 판에 앉을 성향이 된다 — `startGame`에서 올리면 표시와 실제가 어긋난다.
   */
  private rerollBotProfiles(room: Room): void {
    room.botGeneration += 1;
    this.seatBotProfiles(room);
  }

  /**
   * 시작 실패 롤백 — 방을 대기실로 되돌리고 사람들에게 알린다.
   *
   * 게스트 체험 방은 되돌릴 대기실이 없다(손님은 `startGame`을 보낼 수 없다) —
   * 그 방은 접는다. 샌드박스 재시작 중이었다면 그 플래그도 함께 푼다.
   */
  /**
   * 기록으로 남지 않을 게임의 리플레이 파일을 지운다 (무효·예외·시작 실패).
   *
   * `recordGame`을 부르지 않는 경로는 `games` 인덱스에 행을 만들지 않는데,
   * `pruneOldReplays`는 **인덱스 행이 가리키는 파일만** 지운다. 그래서 예전에는
   * 이 경로마다 `.jsonl`이 하나씩 쌓여 아무도 못 보고 아무도 안 지우는 파일이 됐다.
   *
   * 지우기는 비동기라 기다리지 않는다 — 실패해도 게임 정리를 막지 않는다.
   */
  private discardReplay(room: Room, writer: ReplayWriter | null): void {
    if (writer === null) return;
    void writer.discard().catch((err: unknown) => {
      this.logError(room, "리플레이 파일 삭제 실패:", err);
    });
  }

  /**
   * **예외로 끝난 판의 기록은 지우지 않고 `replays/crashed/`로 옮긴다** (감사 §2-6).
   *
   * 위 `discardReplay`가 하던 일을 크래시 경로에서만 갈랐다. 고아 파일을 만들지
   * 않겠다는 원래 목적은 폴더를 나누는 것으로 달성되고(인덱스 밖에 있는 것이
   * 정상인 자리를 따로 둔다), 대신 **재현 증거가 남는다.** 예전에는 정확히
   * 크래시한 판만 골라 증거를 없애고 있었다.
   */
  private preserveCrashedReplay(room: Room, writer: ReplayWriter | null): void {
    if (writer === null) return;
    void writer
      .preserveCrashed()
      .then((dest) => {
        this.logError(room, `크래시한 판의 리플레이를 남겼다: ${dest}`);
      })
      .catch((err: unknown) => {
        this.logError(room, "크래시 리플레이 보존 실패(파일은 그대로 둔다):", err);
      });
  }

  // ─────────────────────────── 이어하기 (§2-10) ───────────────────────────

  /**
   * 이 판을 "진행 중"으로 적어 둔다 — 서버가 죽어도 다음 부팅이 되살릴 수 있게.
   *
   * 담는 것은 **바깥 정보**뿐이다(코드·좌석·모드·리플레이 경로). 판의 상태는
   * 리플레이 파일이 이미 완전하게 갖고 있고, 두 곳에 나눠 담으면 언젠가 어긋난다.
   *
   * 샌드박스·체험 방은 대상이 아니다 — 리플레이 파일 자체를 남기지 않으므로
   * 되살릴 근거가 없고, 애초에 기록으로 남기지 않기로 한 판이다.
   */
  private rememberLiveGame(room: Room): void {
    const db = this.db;
    if (db === undefined || room.writer === null || room.sandbox || room.guest) return;
    const now = new Date().toISOString();
    try {
      db.saveLiveGame({
        code: room.code,
        replayPath: room.writer.path,
        gameMode: room.gameMode,
        botDifficulty: room.botDifficulty,
        seats: room.agents.map((a) => ({
          id: a.id,
          nickname: a.nickname,
          isBot: a instanceof BotAgent,
          ...(a.botArchetype !== undefined ? { archetype: a.botArchetype } : {}),
        })),
        startedAt: room.startedAt ?? now,
        updatedAt: now,
      });
    } catch (err) {
      // 이어하기를 못 적는 것은 게임을 멈출 이유가 아니다 — 지금 도는 판은 멀쩡하다.
      this.logError(room, "진행 중 대국 기록 실패(이어하기만 못 하게 된다):", err);
    }
  }

  /** 이 판은 더 이상 진행 중이 아니다 (종료·무효·크래시·방 정리 공통). */
  private forgetLiveGame(room: Room): void {
    try {
      this.db?.clearLiveGame(room.code);
    } catch (err) {
      this.logError(room, "진행 중 대국 기록 삭제 실패:", err);
    }
  }

  /**
   * 부팅 직후 — 끊긴 채로 남아 있던 대국을 전부 되살린다 (감사 §2-10).
   *
   * 예전에는 서버를 재시작하면 진행 중이던 40분짜리 반장전이 **어디에도 남지 않고**
   * 사라졌다. 점수도 기록도 리플레이도 없이, 네 사람의 시간이 통째로.
   *
   * 되살린 방은 사람들의 좌석을 **비워 두지 않는다** — 이름 그대로 앉혀 두고,
   * 각자 `joinRoom`(홈의 "진행하던 방으로 재접속")으로 돌아오면 기존 재접속
   * 경로가 그대로 받는다. 아무도 안 돌아온 사이 판이 저 혼자 진행되지 않도록
   * §2-5에서 만든 "판을 세워 두기"를 그대로 쓴다.
   *
   * 한 판이 실패해도 **다음 판을 계속 시도한다.** 되살리기는 최선의 노력이고,
   * 실패한 판 하나가 나머지 셋까지 데려가면 안 된다.
   */
  async restoreLiveGames(): Promise<void> {
    const db = this.db;
    if (db === undefined) return;
    let rows: LiveGameRecord[];
    try {
      rows = db.listLiveGames();
    } catch (err) {
      this.logError(null, "진행 중 대국 목록을 읽지 못했다:", err);
      return;
    }
    if (rows.length === 0) return;
    this.log(null, `끊긴 대국 ${rows.length}건 — 이어하기를 시도한다`);
    for (const row of rows) {
      try {
        await this.restoreLiveGame(row);
      } catch (err) {
        this.logError(null, `[room ${row.code}] 이어하기 실패 — 이 판은 포기한다:`, err);
        // 반쯤 세워진 방을 남기지 않는다 — 컨트롤러 없이 `playing`으로 굳은 방은
        // 좀비 스위퍼가 1분 뒤에나 걷어가고, 그 사이 그 코드로 아무도 못 들어온다.
        this.rooms.delete(row.code);
        // 되살아나지 못한 판을 부팅마다 다시 시도하지 않는다. 리플레이 파일은
        // 그대로 남으므로 사람이 열어 볼 수는 있다.
        try {
          db.clearLiveGame(row.code);
        } catch {
          /* 지우지 못해도 다음 부팅이 다시 시도할 뿐이다 */
        }
      }
    }
  }

  /** 진행 중 대국 1건을 되살린다. 되살릴 수 없으면 던진다(호출부가 그 판만 포기한다). */
  private async restoreLiveGame(row: LiveGameRecord): Promise<void> {
    if (this.rooms.has(row.code)) return; // 이미 서 있다 (중복 호출 방어)
    if (row.seats.length !== MAX_PLAYERS) {
      throw new Error(`좌석이 ${row.seats.length}개다 (${MAX_PLAYERS}개여야 한다)`);
    }
    /*
     * **너무 오래된 판은 되살리지 않는다.**
     *
     * 이어하기의 값어치는 "방금 끊긴 판으로 돌아간다"에 있다. 하루 지난 판을
     * 되살려 봐야 아무도 그 상황을 기억하지 못하고, 방 예산만 물고 있는다.
     * 그때는 리플레이 파일이 남아 있으므로 되짚어 볼 수는 있다.
     */
    const age = Date.now() - Date.parse(row.updatedAt);
    if (!Number.isFinite(age) || age > RESUME_MAX_AGE_MS) {
      throw new Error(`${Math.round(age / 60_000)}분 전에 끊긴 판이다 — 되살리지 않는다`);
    }

    // 상태 재구성은 **동기**다 — 중간에 await가 끼면 그 틈에 같은 코드의 방이
    // 새로 생기거나 사람이 붙을 수 있다.
    const recon = reconstructGameFromFile(row.replayPath, {
      extraAugments: contentAugments,
      // 실시간 경로와 같은 로깅 — 이게 없으면 재개한 판에서만 증강 버그가
      // 아무 흔적 없이 사라진다(리플레이 재구성이 들어내진 이유 중 하나였다).
      processor: {
        onEffectError: (f) =>
          console.error(
            `[augment] ${f.source} ${f.phase} threw on ${f.eventType} (room ${row.code}): ${f.message}`,
          ),
      },
    });
    /*
     * 티어 자동 조정 결과는 **파일이 아니라 지금 값**을 건다.
     *
     * 실시간 경로는 `augmentWeights`를 `HanchanConfig`로 넘기지만, 재개 경로는
     * 카탈로그가 이미 만들어진 뒤라 그 길이 없다 — 레지스트리에 직접 건다.
     * 시작 시점의 표를 파일에 굳혀 담지 않은 이유: 티어는 20판마다 움직이는
     * 값이라, 재개한 판만 몇 시간 전 표로 드래프트하면 오히려 어긋난다.
     */
    if (this.augmentStats !== undefined) {
      recon.game.augments.setWeightOverrides(this.augmentStats.weights());
    }

    const room = this.newRoom({
      code: row.code,
      gameMode: row.gameMode === "hanchan" ? "hanchan" : "tonpuu",
      botDifficulty: row.botDifficulty as BotDifficulty,
    });
    room.resumePath = row.replayPath;
    room.phase = "playing";
    room.startedAt = row.startedAt;
    for (const seat of row.seats) {
      if (seat.isBot) {
        // 원형을 그대로 물려준다 — 안 주면 시드에서 다시 뽑혀, 재개 뒤 봇의
        // 성격이 바뀐다(같은 자리의 상대가 갑자기 다른 사람이 된 것처럼 보인다).
        if (seat.archetype !== undefined) {
          room.botArchetypes.set(seat.id, seat.archetype as ArchetypeName);
        }
        room.agents.push(this.newBot(room, seat.id));
        continue;
      }
      // 사람 좌석은 **소켓 없이** 앉힌다. 이 자리는 이름을 지키기 위한 것이고,
      // 그 이름으로 `joinRoom`이 들어오면 기존 재접속 경로가 소켓을 붙여 준다.
      const agent = new HumanAgent(seat.id, seat.nickname, closedSocket());
      // 아무도 돌아오지 않은 사이 판이 저 혼자 진행되지 않게 세워 둔다(§2-5).
      agent.suspend(RESUME_HOLD_MS);
      room.agents.push(agent);
    }
    room.hostId = room.agents.find((a) => !(a instanceof BotAgent))?.id ?? null;
    this.seatBotProfiles(room);
    room.holdUntil = Date.now() + RESUME_HOLD_MS;

    await this.openGame(room, recon);
    this.log(
      room,
      `이어하기 — ${recon.eventCount}개 이벤트에서 재개 ` +
        `(${row.seats.filter((s) => !s.isBot).map((s) => s.nickname).join(", ")})`,
    );
  }

  private rollbackFailedStart(room: Room, err: unknown): void {
    this.logError(room, "게임 시작 실패 — 방을 대기실로 되돌린다:", err);
    // 시작도 못 한 게임이지만 그 실패 자체가 결함이다 — 지우지 않고 남긴다(§2-6).
    // (배패·증강 지급까지의 줄만 들어 있어도 무엇이 던졌는지는 거기서 보인다.)
    this.preserveCrashedReplay(room, room.writer);
    room.writer = null;
    room.controller = null;
    room.startedAt = null;
    room.phase = "waiting";
    room.sandboxRestarting = false;
    this.touch(room);
    for (const a of room.agents) {
      if (a instanceof HumanAgent) {
        a.notify({
          type: "error",
          code: "GAME_START_FAILED",
          message: "게임을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        });
      }
    }
    if (room.guest) {
      this.endSpectating(room, "게임을 시작하지 못했습니다");
      this.detachRoomConns(room);
      this.rooms.delete(room.code);
      return;
    }
    this.broadcastLobby(room);
  }

  /**
   * 실제 시작 절차 — 던질 수 있다(호출자 startGame이 롤백한다).
   *
   * @param resume 서버 재시작 후 **이어하기**로 여는 경우 (감사 §2-10). 새 판을
   *   시작하는 것과 여기서부터의 배선(컨트롤러 콜백·기록·통계·정리)이 완전히
   *   같아야 하므로 분기를 만들지 않고 이 함수 하나로 모았다 — 두 벌로 두면
   *   한쪽에만 고쳐진 자리가 반드시 생긴다.
   */
  private async openGame(room: Room, resume?: ResumeReconstruction): Promise<void> {
    // 자리는 대기실에서 이미 정해져 보이고 있다 — 여기서 다시 섞으면 그 표시가 거짓이 된다.

    // 증강 테스트·게스트 체험 방은 리플레이 파일을 남기지 않는다 — 어차피 게임
    // 인덱스·통계에도 기록하지 않으므로 열어 볼 길 없는 파일만 쌓인다.
    //
    // 이어하기는 **같은 파일을 이어 쓴다**. 새로 열면 `__init__`도 지금까지의
    // 확정 이벤트도 없는 반쪽 파일이 생겨 리플레이로 열 수 없고, 원본은 인덱스에
    // 없는 고아로 남는다.
    const writer =
      room.sandbox || room.guest
        ? null
        : new ReplayWriter(this.replayDir, room.code, room.resumePath ?? undefined);
    if (writer !== null) await writer.open();
    room.writer = writer;

    const playerIds = room.agents.map((a) => a.id);
    const tracker = new StatsTracker(playerIds);
    if (resume !== undefined) {
      // 누적 통계를 되세운다 — `StatsTracker.consume`은 "리플레이 로그의 JSON도
      // 그대로 넣을 수 있다"가 계약이라, 읽은 줄을 다시 먹이면 끊긴 시점의 집계가
      // 그대로 복원된다. 이게 없으면 재개한 판의 통계가 **중간부터** 세어져,
      // 그 판에 참가한 네 사람의 전적이 조용히 깎인다.
      for (const line of resume.eventLines) {
        try {
          tracker.consume(JSON.parse(line) as { type: string; payload?: unknown });
        } catch {
          /* 한 줄이 상해도 나머지 집계는 살린다 (실시간 경로와 같은 규율) */
        }
      }
    }

    // 봇에게 이 게임이 몇 국짜리인지 알린다 — 뷰에 없는 정보다. 이게 있어야 봇이
    // "지금이 올라스인가"를 알고 순위를 지키거나 뒤집는 판단을 한다(bot/match.ts).
    // 대기실에서 만들어질 땐 모드가 아직 바뀔 수 있어 시작 시점에 준다.
    for (const agent of room.agents) {
      if (agent instanceof BotAgent) agent.setGameMode(room.gameMode);
      // 사람 좌석의 뷰에 좌석별 접속 상태를 실어 보내게 한다 (이름표 표시용).
      if (agent instanceof HumanAgent) {
        agent.setSeatConnectionSource(() => this.seatConnections(room));
        // 튜토리얼 좌석은 결정 제한 시간을 사실상 없앤다 (`TUTORIAL_ROOM_NOTE` 4).
        agent.setTutorial(room.tutorial);
        // 증강 선택은 연금술사 하나로 못 박는다 — 카드 목록 자체는 컨트롤러가
        // 고정하고(`presetDraftChoices`), 좌석은 **답**을 검증한다.
        agent.setForcedDraftPick(room.tutorial ? TUTORIAL_DRAFT_PICK : null);
        // 돌아오지 않아 이탈로 확정된 좌석 — 이름표를 갱신하고, 걸려 있던 중단
        // 투표를 다시 집계한다. 그 좌석이 정족수에서 빠지면서 이미 모인 표만으로
        // 무효가 성립할 수 있는데, 다시 세지 않으면 아무도 그걸 모른다.
        agent.setAbandonedListener(() => {
          this.refreshSeatStatus(room);
          this.retallyAbortVotes(room);
        });
      }
    }

    room.controller = new HanchanController(room.agents, {
      // 모드에 맞는 진행 설정(장 수·서입·드래프트 스케줄) 한 벌. 반장전/동풍전 분기.
      //
      // 이어하기는 **그 판이 시작될 때의 설정**을 파일에서 읽어 쓴다. 지금 코드가
      // 만드는 한 벌을 쓰면, 그 사이 규칙이 바뀐 경우 재개한 판이 시작할 때와
      // 다른 규칙으로 끝난다 — 점수가 조용히 달라진다.
      ...(resume !== undefined ? resume.hanchan : hanchanConfigForMode(room.gameMode)),
      extraAugments: contentAugments,
      interRoundDelayMs: this.interRoundDelayMs,
      autoMoveDelayMs: AUTO_MOVE_MS,
      // 매 게임 새 시드 — 안 넣으면 프로세스 내 모든 게임이 같은 시드를 써서
      // 배패·증강 선택지가 매번 똑같이 반복된다("증강이 초기화 안 됨"의 원인).
      seed: randomInt(0x1_0000_0000),
      // 티어 자동 조정 결과를 이 방의 드래프트에 건다 (없으면 정적 티어표)
      ...(this.augmentStats !== undefined
        ? { augmentWeights: this.augmentStats.weights() }
        : {}),
      // 증강 훅이 던지면 엔진이 그 source만 격리하고 게임을 계속한다. 격리가 없던
      // 시절에는 예외 하나가 방 삭제로 이어졌다. 대신 여기서 반드시 남겨야
      // 증강 버그가 흔적 없이 사라지지 않는다.
      onEffectError: (f) =>
        console.error(
          `[augment] ${f.source} ${f.phase} threw on ${f.eventType} (room ${room.code}): ${f.message}`,
        ),
      // 증강 테스트: 드래프트 없이 시작하고, 고른 증강만 배패 전에 지급한다
      ...(room.sandbox
        ? {
            draftSchedules: [],
            presetAugments: room.sandboxAugments,
            presetHands: room.sandboxHands,
          }
        : {}),
      // 튜토리얼: 사람 좌석의 손패와 증강 선택지를 고정한다 (`TUTORIAL_ROOM_NOTE`).
      // **드래프트는 끄지 않는다** — 증강을 고르는 것이 이 게임의 첫 조작이라,
      // 카드는 그대로 세우되 판마다 같은 석 장이 서고 연금술사만 눌린다.
      // 손패는 샌드박스와 같은 배관(`presetHands`)을 쓰므로 새 경로가 없다.
      ...(room.tutorial
        ? {
            ...tutorialPresets(room.agents),
            agentDecideTimeoutMs: TUTORIAL_AGENT_TIMEOUT_MS,
            // 말풍선이 떠 있으면 **국과 국 사이도** 붙든다. 마지막 안내를 읽는 중에
            // 다음 국이 시작되면 다 끝난 줄 알았던 판이 저 혼자 다시 시작한다
            // (2026-08-19 사용자 보고). `TUTORIAL_HOLD_NOTE`와 같은 신호를 쓴다.
            holdBetweenRounds: () => room.tutorialHoldUntil > Date.now(),
          }
        : {}),
    }, {
      onEvent: (eventJson: string) => {
        writer?.write(eventJson);
        try {
          tracker.consume(JSON.parse(eventJson) as { type: string; payload?: unknown });
        } catch {
          // 통계 집계 실패는 게임 진행을 막지 않는다
        }
      },
      // 국이 하나 끝날 때마다 "마지막 소식" 시각을 갱신한다 (§2-10). 유휴 청소도
      // 같은 일을 하지만 그쪽은 1분 주기라, 국 경계에서 죽는 경우가 가장 흔한
      // 만큼 여기서도 한 번 찍어 둔다.
      onRoundEnd: () => {
        this.rememberLiveGame(room);
      },
      onGameOver: (rankings: RankingEntry[], endReason: GameEndReason) => {
        // 방은 그대로 남는다 — 결과 화면에서 "이어하기"로 같은 멤버와 다음 판을 간다.
        // 게스트 판은 "이어하기"를 주지 않는다 — 대기실로 돌아가도 손님은 `startGame`을
        // 보낼 수 없다(화이트리스트). 대신 클라이언트가 체험 종료 화면에서
        // "한 판 더"(= 새 guestPlay)와 "계정 만들기"를 제시한다.
        /*
         * 기록을 **먼저** 남긴다 — 그래야 결과 화면에 "이 판 다시 보기"를 줄 수 있다
         * (감사 2026-08-17 §5-10: 방금 진 판을 보려면 로비로 나가 목록에서 찾아야 했다).
         * `recordGame` 은 리플레이 **경로만** 읽으므로 writer 를 닫기 전이어도 된다.
         * 샌드박스·게스트 판은 애초에 기록하지 않으므로 id 도 없다.
         */
        // 이 판은 더 이상 "진행 중"이 아니다 — 이어하기 후보에서 뺀다(§2-10).
        // 기록보다 **먼저** 지운다: recordGame이 던져도 이 코드가 부팅 때마다
        // 되살아나려 드는 일은 없어야 한다.
        this.forgetLiveGame(room);
        const recordedId =
          room.sandbox || room.guest ? undefined : this.recordGame(room, rankings);
        const msg: ServerMessage = {
          type: "gameOver",
          rankings,
          canContinue: !room.guest,
          reason: endReason,
          ...(recordedId === undefined ? {} : { gameId: recordedId }),
        };
        for (const agent of room.agents) {
          if (agent instanceof HumanAgent) agent.notify(msg);
        }
        writer?.close();
        this.touch(room);
        this.log(
          room,
          `게임 종료 — ${rankings.map((r) => `${r.rank}위 ${r.nickname}(${r.rawScore})`).join(", ")}`,
        );
        // 증강 테스트 결과는 기록하지 않는다 — 리플레이 목록·리더보드·증강 통계
        // (도감의 근거)가 시험용 판으로 오염되지 않게 한다.
        // 관전은 여기서 끊는다 — 다음 판은 새 게임이라 관전자가 새로 붙어야 한다.
        this.endSpectating(room, "게임이 종료되었습니다", msg);
        if (room.sandbox) {
          this.resetRoomAfterGame(room);
          return;
        }
        // 게스트 판도 아무 기록을 남기지 않는다 — 리플레이 인덱스·리더보드·증강 집계
        // 어디에도 손님의 판이 섞이지 않는다. 결과 화면에 띄울 **이번 판** 통계만
        // 만들어 보내고(영속화 없음), 방은 그대로 지운다.
        if (room.guest) {
          void this.finishStats(room, tracker, rankings, false)
            .catch((err: unknown) => {
              this.logError(room, "finishStats error:", err);
            })
            .finally(() => {
              this.detachRoomConns(room);
              this.rooms.delete(room.code);
            });
          return;
        }
        // recordGame 은 위(메시지 조립 전)에서 이미 불렀다 — id 를 결과 화면에 실어야 해서다.
        this.recordAugmentResults(room, rankings, tracker);
        // ⚠ 방 정리는 통계 전송이 끝난 **뒤**에 한다 — finishStats는 room.agents를 훑어
        //    이번 판 통계를 보내는데, 먼저 정리하면 그 사이 좌석이 갈려(봇 교체·포기한
        //    좌석 제거) 통계가 엉뚱한 명단으로 나가거나 아예 도달하지 않는다.
        void this.finishStats(room, tracker, rankings)
          .catch((err: unknown) => {
            this.logError(room, "finishStats error:", err);
          })
          .finally(() => {
            this.resetRoomAfterGame(room);
          });
      },
      onGameAborted: () => {
        /*
         * **서버 종료로 깨어난 abort는 무효 처리가 아니다** (감사 §2-10).
         *
         * `shutdown()`은 대기 중인 결정 프로미스를 붙들고 있지 않으려고
         * `requestAbort()`를 부르는데, 그 신호가 여기까지 흘러오면 아래 정리가
         * **이어하기의 유일한 근거인 리플레이 파일을 지운다.** 종료 중에는
         * 파일도 `live_games` 행도 그대로 둬야 다음 부팅이 그 판을 되살린다.
         */
        if (this.shuttingDown) {
          writer?.close();
          return;
        }
        this.forgetLiveGame(room);
        // 무효 처리는 기록하지 않는다 → 리플레이 파일도 남기지 않는다. close()만 하면
        // 인덱스에 없는 `.jsonl`이 디스크에 영원히 남는다(ReplayWriter.discard 주석).
        // **되살렸는데 아무도 안 돌아온 판만 예외**다 — 그건 사람들의 결정이 아니다.
        if (room.preserveReplayOnAbort) writer?.close();
        else this.discardReplay(room, writer);
        this.touch(room);
        // 증강 테스트 초기화 — 방·좌석을 유지한 채 새 판을 시작한다(무효 알림 없음)
        if (room.sandbox && room.sandboxRestarting) {
          this.restartSandbox(room);
          return;
        }
        this.log(room, "게임 무효 종료");
        // 전원 합의 무효 — 정산·기록·통계 없이 즉시 정리하고 홈으로 돌린다
        const msg: ServerMessage = {
          type: "gameAborted",
          reason: "전원 합의로 게임이 무효 처리되었습니다",
        };
        for (const agent of room.agents) {
          if (agent instanceof HumanAgent) agent.notify(msg);
        }
        this.endSpectating(room, "게임이 무효 처리되었습니다", msg);
        // 방을 지우면서 이 방을 가리키던 연결도 함께 끊는다 — 남겨 두면 그 연결은
        // 폐기된 방을 `phase:"playing"`인 채로 계속 가리켜, 무효 투표가 가드를
        // 통과해 버려진 컨트롤러로 들어갔다.
        //
        // 증강 테스트 방만 예외다: 관리자 패널은 무효 종료된 방을 그대로 가리킨 채
        // `sandboxReset`을 보내고, 서버는 거기에 "끝난 테스트 게임"(ROOM_CLOSED)이라고
        // 답해야 한다 — 좌석 링크를 끊으면 그 안내가 "샌드박스가 아니다"로 바뀐다.
        if (!room.sandbox) this.detachRoomConns(room);
        this.rooms.delete(room.code);
      },
    });

    // 이 판을 "진행 중"으로 적어 둔다 — 서버가 여기서 죽어도 다음 부팅이 되살린다.
    // 컨트롤러를 **돌리기 전에** 적는다: 첫 국 도중에 죽는 경우가 가장 흔하다.
    this.rememberLiveGame(room);

    // 백그라운드로 실행 (프롬프트 대기는 각 HumanAgent가 소켓으로 처리)
    const loop = resume === undefined ? room.controller.run() : room.controller.resume(resume.game);
    loop.catch((err: unknown) => {
      this.logError(room, "게임이 예외로 종료됐다:", err);
      // 되살아나지 못한 판을 부팅마다 다시 시도하지 않게 후보에서 뺀다.
      this.forgetLiveGame(room);
      // 예외 종료는 recordGame을 부르지 않는다. 그렇다고 지우면 **크래시한 판만
      // 골라 재현 증거를 없애는** 셈이라(감사 §2-6), 인덱스 밖이 정상인 자리
      // (`replays/crashed/`)로 옮겨 남긴다.
      this.preserveCrashedReplay(room, writer);
      // 플레이어들에게도 반드시 알린다 — 안 그러면 마지막 화면에서 무한 대기.
      const crashMsg: ServerMessage = {
        type: "error",
        code: "GAME_CRASHED",
        message: "게임 오류로 종료되었습니다. 홈으로 돌아갑니다.",
      };
      for (const agent of room.agents) {
        if (agent instanceof HumanAgent) agent.notify(crashMsg);
      }
      this.endSpectating(room, "게임 오류로 종료되었습니다");
      if (!room.sandbox) this.detachRoomConns(room); // 위 onGameAborted와 같은 이유
      this.rooms.delete(room.code);
    });

    this.log(
      room,
      `게임 시작 (${room.gameMode}${room.sandbox ? " · 샌드박스" : ""}${room.guest ? " · 체험" : ""}) — ` +
        room.agents.map((a) => `${a.id}:${a.nickname}`).join(" "),
    );
  }

  /** 게임 결과를 SQLite 인덱스에 기록 (내 리플레이 목록의 근거) */
  private recordGame(room: Room, rankings: RankingEntry[]): number | undefined {
    if (this.db === undefined || room.writer === null) return undefined;
    try {
      return this.db.recordGame({
        code: room.code,
        replayPath: room.writer.path,
        startedAt: room.startedAt ?? new Date().toISOString(),
        endedAt: new Date().toISOString(),
        players: rankings.map((r) => {
          const agent = room.agents.find((a) => a.id === r.playerId);
          const isBot = agent !== undefined && this.isBot(agent);
          const userId = isBot ? null : (this.db?.userByName(r.nickname)?.id ?? null);
          return {
            userId,
            nickname: r.nickname,
            isBot,
            rank: r.rank,
            score: r.rawScore,
          };
        }),
      });
    } catch (err) {
      console.error("Failed to record game:", err);
      return undefined;
    }
  }

  /**
   * 증강별 실전 성적을 기록한다 — 20판마다 티어 자동 조정이 돈다.
   *
   * 조정 결과는 **다음에 만들어지는 방**부터 적용된다. 진행 중인 게임의 카탈로그를
   * 중간에 갈아 끼우면 같은 판에서 확률이 바뀌어 리플레이가 어긋난다.
   */
  private recordAugmentResults(
    room: Room,
    rankings: RankingEntry[],
    tracker: StatsTracker,
  ): void {
    if (this.augmentStats === undefined) return;
    try {
      const state = room.controller?.gameState;
      if (state === undefined || state === null) return;
      const results = rankings.map((r) => ({
        augments: state.players.find((p) => p.id === r.playerId)?.augments ?? [],
        rank: r.rank,
      }));
      // 제시·선택 횟수는 좌석별 통계를 합쳐 얻는다 — 근거는 AUGMENT_OFFERED /
      // AUGMENT_DRAFTED 이벤트라 리플레이만으로 재구성된다(PlayerStats).
      const offers: Record<string, { offered: number; picked: number }> = {};
      for (const raw of tracker.snapshot().values()) {
        for (const [id, a] of Object.entries(raw.augments)) {
          const o = (offers[id] ??= { offered: 0, picked: 0 });
          o.offered += a.offered;
          o.picked += a.picked;
        }
      }
      if (this.augmentStats.record(results, offers)) {
        const p = this.augmentStats.progress();
        console.log(`[augment] 티어 자동 조정 #${p.adjustments} 적용 (${p.every}판 주기)`);
      }
    } catch (err) {
      console.error("Failed to record augment stats:", err);
    }
  }

  /** 관전자들에게 종료를 알리고 관전 상태를 정리한다 */
  private endSpectating(room: Room, reason: string, finalMsg?: ServerMessage): void {
    for (const conn of room.spectators) {
      if (finalMsg !== undefined) this.send(conn.ws, finalMsg);
      this.send(conn.ws, { type: "spectateEnded", code: room.code, reason });
      conn.spectating = null;
    }
    room.spectators.clear();
  }

  /**
   * 게임 종료 통계 처리: 순위 반영 → 사람 통계를 닉네임별로 영속화 →
   * 이번 판 + 갱신된 누적 통계를 사람들에게 전송.
   */
  private async finishStats(
    room: Room,
    tracker: StatsTracker,
    rankings: RankingEntry[],
    /** 누적 통계(리더보드의 근거)에 영속화할지. 게스트 판은 false — 보여만 주고 남기지 않는다. */
    persist = true,
  ): Promise<void> {
    tracker.recordGameEnd(rankings.map((r) => ({ playerId: r.playerId, rank: r.rank })));
    const snapshot = tracker.snapshot();

    // 이번 판 통계 (봇 포함, playerId별)
    const game: StatsEntry[] = room.agents.map((a) => ({
      playerId: a.id,
      nickname: a.nickname,
      isBot: this.isBot(a),
      stats: deriveStats(snapshot.get(a.id) ?? createEmptyStats()),
    }));

    // 사람 통계만 닉네임(=계정) 키로 영속화
    if (persist && this.statsStore) {
      const humanEntries: { nickname: string; raw: PlayerStatsRaw }[] = [];
      for (const a of room.agents) {
        if (this.isBot(a)) continue;
        const raw = snapshot.get(a.id);
        if (raw !== undefined) humanEntries.push({ nickname: a.nickname, raw });
      }
      if (humanEntries.length > 0) await this.statsStore.record(humanEntries);
    }

    // 갱신된 누적 통계 (사람만). 게스트에게는 누적이라는 개념이 없다.
    const career: StatsEntry[] = [];
    if (persist && this.statsStore) {
      for (const a of room.agents) {
        if (this.isBot(a)) continue;
        const raw = this.statsStore.get(a.nickname);
        if (raw !== null) {
          career.push({ playerId: a.id, nickname: a.nickname, isBot: false, stats: deriveStats(raw) });
        }
      }
    }

    const statsMsg: ServerMessage = { type: "stats", game, career };
    for (const a of room.agents) {
      if (a instanceof HumanAgent) a.notify(statsMsg);
    }
  }

  // ─────────────────────────── 전송 ───────────────────────────

  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState !== 1 /* OPEN */) return;
    // 백프레셔 가드 — 송신 큐가 상한을 넘으면 그 연결을 끊는다. 응답을 읽지 않는
    // 느린/악의적 소비자가 서버 메모리를 무한 증가시키지 못하게 한다. 정상
    // 클라이언트는 메시지를 즉시 소비하므로 이 상한(4MB)에 닿지 않는다.
    if (ws.bufferedAmount > MAX_BUFFERED_BYTES) {
      try {
        ws.terminate();
      } catch {
        /* 이미 닫힘 */
      }
      return;
    }
    ws.send(JSON.stringify(msg));
  }
}
