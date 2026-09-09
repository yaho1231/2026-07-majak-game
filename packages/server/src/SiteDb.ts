/**
 * SiteDb — 계정·세션·게임 인덱스 영속화 (SQLite, node:sqlite 내장 모듈).
 *
 * - 비밀번호: scrypt + 사용자별 랜덤 salt (평문 저장 금지)
 * - 세션: 랜덤 토큰 → user 매핑 (클라이언트 localStorage에 저장, 자동 로그인)
 * - 관리자: 서버가 생성한 관리자 코드를 가입 시 입력하면 is_admin=1
 *   (코드는 첫 부팅 때 생성되어 DB와 서버 콘솔에 남는다)
 * - 게임 인덱스: 리플레이 파일 경로 + 참가자·순위 (내 리플레이 목록 조회용)
 *
 * 설계: docs/15_ACCOUNTS_SITE.md
 */

import { createRequire } from "node:module";
import { chmodSync, existsSync, statSync } from "node:fs";
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { DatabaseSync as DatabaseSyncT, StatementSync } from "node:sqlite";
import { NOTICE_BODY_MAX, NOTICE_TITLE_MAX } from "@majak/core/network/protocol.js";
import type { ServerNotice } from "@majak/core/network/protocol.js";

// 비동기 scrypt — libuv 스레드풀에서 실행되어 공유 이벤트 루프를 블록하지 않는다.
// (동기 scryptSync는 인증 요청 하나가 모든 진행 게임을 수십 ms씩 멈춘다.)
const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

// vite(vitest)가 node:sqlite를 빌트인으로 인식하지 못해 정적 import가 깨진다 —
// createRequire로 런타임에 로드한다 (타입은 type-only import라 지워짐).
const { DatabaseSync } = createRequire(import.meta.url)(
  "node:sqlite",
) as typeof import("node:sqlite");

/**
 * DB 파일을 소유자만 읽을 수 있게 조인다.
 *
 * **왜** (감사 2026-08-17 §1-7): 이 파일에는 세션 토큰이 **평문**으로 들어 있고
 * (`sessions.token`은 그대로 `tokenLogin`에 넣으면 로그인된다, TTL 30일) 비밀번호
 * scrypt 해시도 있다. 그런데 실측 권한은 0644였다 — 같은 머신의 아무 프로세스나
 * 읽을 수 있었다. `deploy/majak.env`는 이미 0600으로 조이면서 정작 더 민감한 DB만
 * 열려 있었다.
 *
 * WAL·SHM 곁파일도 같이 조인다. 최근 커밋이 `-wal`에만 있는 구간이 있으므로
 * 본체만 조이면 구멍이 남는다. 실패는 치명적이지 않으므로(권한을 못 바꾸는
 * 파일시스템도 있다) 경고만 남기고 계속 간다.
 */
function tightenDbPermissions(path: string): void {
  for (const p of [path, `${path}-wal`, `${path}-shm`]) {
    try {
      if (!existsSync(p)) continue;
      const mode = statSync(p).mode & 0o777;
      if (mode !== 0o600) chmodSync(p, 0o600);
    } catch (err) {
      console.warn(`[db] 파일 권한을 조이지 못했습니다: ${p} — ${String(err)}`);
    }
  }
}

export interface UserRow {
  id: number;
  username: string;
  isAdmin: boolean;
}

export interface AuthResult {
  ok: boolean;
  user?: UserRow;
  sessionToken?: string;
  error?: string;
}

export interface GamePlayerRecord {
  userId: number | null;
  nickname: string;
  isBot: boolean;
  rank: number;
  score: number;
}

export interface GameRecord {
  code: string;
  replayPath: string;
  startedAt: string;
  endedAt: string;
  players: GamePlayerRecord[];
}

/** 진행 중인 대국의 좌석 하나 (이어하기용) */
export interface LiveSeatRecord {
  id: string;
  nickname: string;
  isBot: boolean;
  /** 봇 성향 — 재개할 때 같은 성향으로 다시 앉힌다(없으면 시드에서 뽑는다) */
  archetype?: string;
}

/**
 * 진행 중인 대국 1건 (감사 §2-10 이어하기).
 *
 * 판의 **상태**는 없다 — 그건 `replayPath`가 가리키는 확정 이벤트 로그가 갖고 있다.
 */
export interface LiveGameRecord {
  code: string;
  replayPath: string;
  gameMode: string;
  botDifficulty: string;
  /** 제한 시간 묶음(`RoomPace`). 열이 붙기 전에 쓰인 행은 null → 기본값으로 읽는다. */
  pace?: string | null;
  seats: LiveSeatRecord[];
  startedAt: string;
  updatedAt: string;
  /**
   * **운영자가 세워 둔 탁자인가** (docs/36 B1 · QA 2차 spectate 확정 6).
   *
   * "판의 상태는 여기 담지 않는다"(표 주석)의 예외가 아니다 — 정지는 **판의 상태가
   * 아니라 운영의 상태**다. 리플레이 이벤트 로그에는 들어 있지 않고(엔진은 정지를
   * 모른다) 들어 있어서도 안 된다. 그런데 프로세스 메모리에만 사니, 「심판 판정 중」
   * 이라고 세워 놓은 탁자가 배포·감시자 복구 한 번에 **그냥 다시 굴러갔다.**
   * 선수들이 돌아오는 순간 판이 진행되고, 목록에도 정지 표식이 없으니 운영자는
   * 다시 눌러야 한다는 것을 알 방법조차 없다.
   *
   * 이어하기 기능 자체가 "배포 중 재시작"을 살리려고 만들어진 것이므로, 그 재시작이
   * 운영자의 판단을 지우면 안 된다.
   */
  paused: boolean;
  /** 정지 사유 — 화면에 그대로 뜬다. 정지가 아니거나 사유가 없으면 null. */
  pauseReason: string | null;
  /** 그 탁자의 공지 본문. 없으면 null. */
  notice: string | null;
  /**
   * 그 공지의 **절대 만료 시각**(ISO). 시한 없는 공지면 null.
   *
   * 남은 시간(상대값)이 아니라 시각(절대값)으로 적는다. 재시작이 얼마나 걸릴지
   * 모르는데 남은 시간을 적으면 되살아난 공지가 그만큼 더 살아 있게 된다 —
   * 「5분 뒤 재개」가 재시작마다 5분씩 늘어나면 그건 예고가 아니다.
   * 이미 지난 공지는 복원 쪽에서 버린다.
   */
  noticeExpiresAt: string | null;
}

/**
 * 좌석 JSON을 푼다 — 깨져 있으면 빈 배열.
 *
 * 던지지 않는 이유: 이 값은 부팅 경로에서 읽힌다. 행 하나가 상해서 예외가 나면
 * **다른 멀쩡한 판까지** 못 되살린다. 빈 좌석은 호출부가 "되살릴 수 없는 판"으로
 * 보고 건너뛰며, 그 사실이 로그에 남는다.
 */
function parseSeats(raw: string): LiveSeatRecord[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is LiveSeatRecord =>
        typeof s === "object" &&
        s !== null &&
        typeof (s as LiveSeatRecord).id === "string" &&
        typeof (s as LiveSeatRecord).nickname === "string" &&
        typeof (s as LiveSeatRecord).isBot === "boolean",
    );
  } catch {
    return [];
  }
}

export interface AdminUserRow {
  id: number;
  username: string;
  isAdmin: boolean;
  createdAt: string;
  /** 참가한(봇 아닌) 게임 수 */
  games: number;
}

export interface GameSummaryRow {
  gameId: number;
  code: string;
  endedAt: string;
  replayPath: string;
  players: { nickname: string; isBot: boolean; rank: number; score: number }[];
}

/** 제보 게시판 한 줄 (조회 결과). 공개 범위 판정은 조회 쿼리가 이미 끝냈다. */
export interface FeedbackRow {
  id: number;
  userId: number | null;
  author: string;
  kind: FeedbackKind;
  title: string;
  body: string;
  status: FeedbackStatus;
  reply: string;
  createdAt: string;
  repliedAt: string | null;
}

export type FeedbackKind = "bug" | "idea";
export type FeedbackStatus = "open" | "reviewing" | "done" | "rejected";

const FEEDBACK_KINDS = new Set<string>(["bug", "idea"]);
const FEEDBACK_STATUSES = new Set<string>(["open", "reviewing", "done", "rejected"]);

/** 제보 길이 상한 — 화면·DB를 지키는 선. 넘으면 거부한다(조용히 자르지 않는다). */
const FEEDBACK_TITLE_MAX = 80;
const FEEDBACK_BODY_MAX = 4000;
const FEEDBACK_REPLY_MAX = 4000;

/**
 * 도배 방지 — 한 계정이 최근 1시간에 쓸 수 있는 제보 수.
 * 게시판은 로그인해야 쓸 수 있으므로 계정 단위로만 막으면 충분하다.
 */
const FEEDBACK_PER_HOUR = 10;

const USERNAME_RE = /^[A-Za-z0-9가-힣_-]{2,12}$/;

/** 예약어 — 봇 사칭·시스템 id·프로토타입 키(__proto__ 등)를 닉네임으로 못 쓰게 */
const RESERVED_NAMES = new Set([
  "__proto__", "constructor", "prototype", "tostring", "valueof", "hasownproperty",
  "__system", "__spectator", "system", "admin", "server", "bot",
]);

/** 기본 세션 수명 30일 — 이후 tokenLogin이 거부된다 (재로그인 필요). */
const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * 친구 목록 상한 (§4-6). 이 목록은 접속할 때마다 통째로 나가고, 온라인 판정이
 * 목록 크기만큼 돈다 — 이 규모의 서버에서 100명이면 넉넉하다.
 */
const MAX_FRIENDS = 100;

/** 사용자당 유지할 최대 세션 수 — 초과 시 오래된 세션부터 정리(무한 증식 방지). */
const MAX_SESSIONS_PER_USER = 10;

/**
 * 사용자 열거 타이밍 오라클 완화용 더미 salt. 존재하지 않는 계정으로 로그인해도
 * 실제 계정과 동일한 scrypt 비용을 치르게 해, 응답 시간으로 계정 유무를 구분하지 못하게 한다.
 */
const DUMMY_SALT = "00000000000000000000000000000000";

/**
 * 문자열 2개를 **길이 정보까지 포함해** 상수 시간에 비교한다.
 *
 * 관리자 코드·가입 코드처럼 "서버가 아는 비밀"을 `===`로 비교하면 첫 불일치
 * 바이트에서 곧바로 빠져나오므로, 원격에서도 이론상 앞자리부터 한 글자씩
 * 맞춰 나갈 수 있다(응답 시간 오라클). 길이가 달라도 같은 비용을 치르도록
 * 양쪽을 고정 길이 다이제스트로 만든 뒤 timingSafeEqual로 비교한다.
 */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

export class SiteDb {
  private readonly db: DatabaseSyncT;
  /** 계정 집합이 바뀔 때마다 오르는 세대 번호 (가입·삭제). */
  private usersRev = 0;
  /**
   * 준비된 구문 캐시 — SQL 문자열 하나당 한 번만 컴파일한다.
   *
   * **왜** (감사 2026-08-12 §M-1): 예전에는 호출마다 `db.prepare()`를 새로 했다.
   * 그런데 `hydrate`는 목록 조회 한 번에 게임 수만큼 불린다 — 리플레이 목록 1회가
   * 일반 사용자 51회, 관리자 201회의 **구문 컴파일 + 실행**이 됐다. `node:sqlite`는
   * 동기라 그 시간 동안 이벤트 루프가 멈추고, 곧 서버의 모든 대국이 함께 멈춘다.
   *
   * SQL 문자열은 전부 이 파일 안의 리터럴이고 값은 파라미터로만 들어가므로(인젝션
   * 없음) 캐시 키로 그대로 쓸 수 있다. `close()` 뒤에는 이 객체 자체가 버려진다.
   */
  private readonly stmts = new Map<string, StatementSync>();

  /** 같은 SQL이면 컴파일된 구문을 재사용한다. */
  private stmt(sql: string): StatementSync {
    let s = this.stmts.get(sql);
    if (s === undefined) {
      s = this.db.prepare(sql);
      this.stmts.set(sql, s);
    }
    return s;
  }

  constructor(
    path: string,
    private readonly sessionTtlMs: number = DEFAULT_SESSION_TTL_MS,
    /**
     * 관리자 코드를 환경변수로 고정한다(ADMIN_CODE). 설정하면 DB에 저장하지도,
     * 부팅 로그에 찍지도 않고, 쓰고 나서 회전하지도 않는다 — 운영자가 값을 쥔다.
     */
    private readonly adminCodeOverride: string = "",
  ) {
    this.db = new DatabaseSync(path);
    tightenDbPermissions(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        pass_salt TEXT NOT NULL,
        pass_hash TEXT NOT NULL,
        is_admin INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL,
        replay_path TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL
      );
      -- 공유 링크 토큰 (§4-8) — 아래 ALTER 로도 붙인다(기존 DB 이행용).
      CREATE TABLE IF NOT EXISTS game_players (
        game_id INTEGER NOT NULL REFERENCES games(id),
        user_id INTEGER,
        nickname TEXT NOT NULL,
        is_bot INTEGER NOT NULL,
        rank INTEGER NOT NULL,
        score INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_game_players_user ON game_players(user_id);
      -- 목록 조회(listAllGames·listGamesFor·getGame)는 게임마다 hydrate에서
      -- game_id 조건 조회를 한 번씩 돌린다. 이 인덱스가 없으면 200판 목록 한 번이
      -- game_players 전체 스캔 200회가 되고, node:sqlite는 동기라 그동안 진행 중인
      -- 모든 대국이 멈춘다. 게임 수에 따라 2차로 악화된다.
      CREATE INDEX IF NOT EXISTS idx_game_players_game ON game_players(game_id);
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        author TEXT NOT NULL,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        reply TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        replied_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id);
      -- 친구 (§4-6). **쌍방이고 승인이 있다** (2026-08-19 사용자 결정).
      --
      -- 예전에는 단방향이었다 — 닉네임만 알면 아무나 남을 제 목록에 담고 그 사람의
      -- 접속 여부를 상시로 볼 수 있었다. 얻는 것이 "지금 있나?" 한 줄뿐이라 해도
      -- 그건 **상대가 동의한 적 없는** 한 줄이고, 여기에 친구 초대(방으로 부르기)가
      -- 붙는 순간 일방적 관계가 곧 일방적 알림 권한이 된다.
      --
      -- 그래서 지금은 friend_requests 에 요청이 쌓이고, 받는 쪽이 수락해야
      -- friends 에 **두 줄**(a→b, b→a)이 함께 들어간다. 한 줄만 넣는 설계는
      -- 조회할 때마다 양쪽을 OR로 합쳐야 하고 언젠가 한쪽을 빠뜨린다.
      CREATE TABLE IF NOT EXISTS friends (
        user_id INTEGER NOT NULL REFERENCES users(id),
        friend_id INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL,
        PRIMARY KEY (user_id, friend_id)
      );
      -- 보류 중인 친구 요청. 수락·거절되면 지워진다 — 이 표에 남아 있는 것이 곧
      -- "받은 편지함에 떠 있는 것"이다(별도의 읽음 표시를 두지 않는 이유).
      CREATE TABLE IF NOT EXISTS friend_requests (
        from_id INTEGER NOT NULL REFERENCES users(id),
        to_id INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL,
        PRIMARY KEY (from_id, to_id)
      );
      CREATE INDEX IF NOT EXISTS idx_friend_requests_to ON friend_requests(to_id);
      -- 진행 중인 대국 (감사 §2-10 이어하기).
      --
      -- games 표가 **끝난** 판의 인덱스인 것과 대칭으로, 이 표는 **아직 도는** 판을
      -- 담는다. 예전에는 이 표가 없어서 서버를 재시작하면 진행 중이던 40분짜리
      -- 반장전이 어디에도 남지 않고 사라졌다 — 리플레이 파일은 디스크에 있었지만
      -- 그 파일이 어느 방의 것이고 누가 어느 자리에 앉아 있었는지를 아는 것이
      -- 프로세스 메모리뿐이었다.
      --
      -- 판의 **상태**는 여기 담지 않는다. 그건 리플레이 파일(확정 이벤트 로그)이
      -- 이미 완전하게 갖고 있고, 두 곳에 나눠 담으면 언젠가 둘이 어긋난다.
      -- 여기 있는 것은 그 파일을 다시 세우는 데 필요한 **바깥 정보**뿐이다.
      CREATE TABLE IF NOT EXISTS live_games (
        code TEXT PRIMARY KEY,
        replay_path TEXT NOT NULL,
        game_mode TEXT NOT NULL,
        bot_difficulty TEXT NOT NULL,
        -- 좌석 JSON: [{ id, nickname, isBot, archetype? }] — 자리 순서 그대로
        seats TEXT NOT NULL,
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    /*
     * 공유 링크 토큰 열 (§4-8) — **기존 DB에도 붙여야 한다.**
     *
     * `CREATE TABLE IF NOT EXISTS`는 이미 있는 표에 열을 더해 주지 않는다. 운영
     * DB에는 `games` 표가 이미 있으므로 ALTER가 유일한 길이고, 이미 있으면
     * SQLite가 던진다 — 그건 정상이므로 삼킨다. (마이그레이션 프레임워크를
     * 들이지 않은 이유: 지금까지 스키마 변경이 이 한 건이다.)
     */
    try {
      this.db.exec("ALTER TABLE games ADD COLUMN share_token TEXT");
    } catch {
      /* 이미 있다 */
    }
    /*
     * 세워 둔 탁자·방 공지 열 (docs/36 B1·B2 — QA 2차 spectate 확정 6).
     * 위 `share_token`과 **같은 방식**이다: 운영 DB에는 이미 표가 있으므로 ALTER가
     * 유일한 길이고, 두 번째 부팅부터는 SQLite가 던진다(정상이라 삼킨다).
     *
     * 왜 여기 담는가는 `LiveGameRecord.paused` 주석에 적었다 — 요약하면 정지는
     * 판의 상태가 아니라 **운영의 상태**라서 리플레이 로그에 없고, 그래서 재시작을
     * 넘길 곳이 여기밖에 없다.
     */
    for (const col of [
      "paused INTEGER",
      "pause_reason TEXT",
      "notice TEXT",
      "notice_expires_at TEXT",
      // 방이 고른 제한 시간 묶음(`ROOM_PACES`) — 2026-08-27. 이것도 리플레이 로그에
      // 없다(엔진은 제한 시간을 모른다). 안 담으면 되살아난 왕초보 판이 조용히
      // 숙련자 속도(30 + 10초)로 서서, 앉아 있던 사람의 차례가 대신 두어진다.
      "pace TEXT",
    ]) {
      try {
        this.db.exec(`ALTER TABLE live_games ADD COLUMN ${col}`);
      } catch {
        /* 이미 있다 */
      }
    }
    this.db.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_games_share ON games(share_token) WHERE share_token IS NOT NULL",
    );
    /*
     * 단방향 시절의 친구 목록을 **한 번** 비운다 (2026-08-19 사용자 결정).
     *
     * 기존 행은 "상대가 수락한 적 없는 관계"다. 그대로 두고 쌍방 규칙만 켜면
     * 목록의 절반이 한쪽에만 보이는 유령 관계로 남고, 그 관계에 초대 알림
     * 권한이 붙는다 — 승인제를 도입하는 이유가 그대로 무너진다.
     *
     * `config` 에 표식을 남겨 재기동마다 다시 지우지 않게 한다. 표식이 없으면
     * (= 아직 이행 안 한 DB) 한 번 비우고 표식을 쓴다.
     */
    const reset = this.stmt("SELECT value FROM config WHERE key = 'friends_mutual_reset'").get();
    if (reset === undefined) {
      this.db.exec("DELETE FROM friends");
      this.stmt("INSERT INTO config (key, value) VALUES ('friends_mutual_reset', ?)")
        .run(new Date().toISOString());
    }
    // WAL·SHM 곁파일은 위 `journal_mode = WAL` 이 실행된 **뒤에야** 생긴다.
    // 그래서 한 번 더 조인다 — 앞의 호출은 기존 파일용, 이쪽이 새로 생긴 곁파일용이다.
    tightenDbPermissions(path);
  }

  // ─────────────────────────── 관리자 코드 ───────────────────────────

  /**
   * 관리자 가입 코드 — 없으면 생성해 저장한다 (서버 부팅 로그로 확인).
   *
   * ⚠ 이 값은 **관리자 권한 그 자체**다: 관리자는 전 계정 조회·삭제, 모든 리플레이
   * 열람, 진행 중 대국 관전(전원 손패가 보이는 완전정보)을 할 수 있다. 그래서
   * 한 번 쓰이면 곧바로 회전하고(`consumeAdminCode`), 관리자가 이미 있으면 부팅
   * 로그에도 찍지 않는다(index.ts). 값을 운영자가 직접 쥐려면 ADMIN_CODE 환경변수.
   */
  adminCode(): string {
    if (this.adminCodeOverride !== "") return this.adminCodeOverride;
    const row = this.stmt("SELECT value FROM config WHERE key = 'admin_code'")
      .get() as { value: string } | undefined;
    if (row !== undefined) return row.value;
    // 48비트는 온라인 추측에는 충분하지만 유출 내성이 없다 — 128비트로 올린다.
    const code = randomBytes(16).toString("base64url");
    this.stmt("INSERT INTO config (key, value) VALUES ('admin_code', ?)")
      .run(code);
    return code;
  }

  /** 관리자 계정이 하나라도 있는지 (부팅 로그에 코드를 노출할지 판단용). */
  hasAdmin(): boolean {
    const row = this.stmt("SELECT 1 AS n FROM users WHERE is_admin = 1 LIMIT 1").get();
    return row !== undefined;
  }

  /**
   * 관리자 코드를 검증하고 **써 버린다**(일치했을 때만 회전).
   *
   * 예전에는 같은 코드가 영원히 유효했다 — 부팅 로그·스크린샷·백업에서 한 번
   * 새면 누구든 무기한으로 자기 계정을 관리자로 승급할 수 있었다. 지금은 쓰이는
   * 즉시 새 코드로 갈리므로, 유출된 값은 **이미 쓰였다면 죽은 값**이다.
   * (ADMIN_CODE 환경변수로 고정한 경우에는 운영자 소유이므로 회전하지 않는다.)
   */
  verifyAdminCode(code: string): boolean {
    return code !== "" && safeEqual(code, this.adminCode());
  }

  /** 관리자 코드를 새 값으로 회전한다 (승급이 실제로 일어난 뒤에 호출). */
  private rotateAdminCode(): void {
    if (this.adminCodeOverride !== "") return; // 운영자가 env로 고정한 값은 건드리지 않는다
    this.stmt("UPDATE config SET value = ? WHERE key = 'admin_code'")
      .run(randomBytes(16).toString("base64url"));
  }

  // ─────────────────────────── 친구 (§4-6) ───────────────────────────

  /** 두 사람이 (쌍방) 친구인가. */
  areFriends(a: number, b: number): boolean {
    return (
      this.stmt("SELECT 1 AS n FROM friends WHERE user_id = ? AND friend_id = ?").get(a, b) !==
      undefined
    );
  }

  private friendCount(userId: number): number {
    return (this.stmt("SELECT COUNT(*) AS n FROM friends WHERE user_id = ?").get(userId) as {
      n: number;
    }).n;
  }

  /**
   * 친구 **요청**을 보낸다. 성사는 상대가 수락할 때다.
   *
   * 한 경우만 예외로 곧바로 이어 준다: **상대가 이미 나에게 요청을 보내 둔 경우**.
   * 그때 요청을 하나 더 쌓으면 서로의 편지함에 서로를 기다리는 카드가 한 장씩
   * 남아 아무도 먼저 누르지 않는다 — 양쪽 의사가 이미 확인됐으므로 그 자리에서
   * 맺는다(`accepted: true` 로 호출자에게 알린다).
   */
  requestFriend(
    userId: number,
    nickname: string,
  ): { ok: boolean; nickname?: string; accepted?: boolean; error?: string } {
    const row = this.userByName(nickname);
    if (row === null) return { ok: false, error: "존재하지 않는 닉네임입니다" };
    if (row.id === userId) return { ok: false, error: "자기 자신에게는 보낼 수 없습니다" };
    if (this.areFriends(userId, row.id)) return { ok: false, error: "이미 친구입니다" };
    if (this.friendCount(userId) >= MAX_FRIENDS) {
      return { ok: false, error: `친구는 ${MAX_FRIENDS}명까지 맺을 수 있습니다` };
    }
    if (this.friendCount(row.id) >= MAX_FRIENDS) {
      return { ok: false, error: "상대의 친구 목록이 가득 찼습니다" };
    }
    // 상대가 먼저 보내 뒀다 → 그 요청을 수락하는 것과 같다
    const incoming = this.stmt(
      "SELECT 1 AS n FROM friend_requests WHERE from_id = ? AND to_id = ?",
    ).get(row.id, userId);
    if (incoming !== undefined) {
      this.linkFriends(userId, row.id);
      return { ok: true, nickname: row.username, accepted: true };
    }
    const already = this.stmt(
      "SELECT 1 AS n FROM friend_requests WHERE from_id = ? AND to_id = ?",
    ).get(userId, row.id);
    if (already !== undefined) return { ok: false, error: "이미 요청을 보냈습니다" };
    /*
     * 보낸 요청 수에도 같은 상한을 건다 — 안 그러면 요청만으로 남의 편지함을 채울 수 있다.
     *
     * **이미 맺은 친구와 합쳐 센다** (QA 2차 lobby 확정 2). 보류분만 세면 수락되어
     * 빠져나간 만큼 자리가 비어, «100건 보내고 → 수락되기를 기다렸다가 → 또 100건»을
     * 무한히 반복할 수 있었다. 상한의 뜻은 「보류함의 크기」가 아니라
     * 「이 사람이 벌일 수 있는 관계의 총량」이다.
     */
    const sent = (this.stmt("SELECT COUNT(*) AS n FROM friend_requests WHERE from_id = ?").get(
      userId,
    ) as { n: number }).n;
    if (sent + this.friendCount(userId) >= MAX_FRIENDS) {
      return { ok: false, error: `친구 수와 보낸 요청 수를 합해 ${MAX_FRIENDS}명을 넘을 수 없습니다` };
    }
    this.stmt(
      "INSERT INTO friend_requests (from_id, to_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING",
    ).run(userId, row.id, new Date().toISOString());
    return { ok: true, nickname: row.username, accepted: false };
  }

  /** 두 사람을 잇는다 — **양방향 두 줄**을 넣고 오가던 요청을 치운다. */
  private linkFriends(a: number, b: number): void {
    const now = new Date().toISOString();
    const ins = this.stmt(
      "INSERT INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING",
    );
    ins.run(a, b, now);
    ins.run(b, a, now);
    this.stmt(
      "DELETE FROM friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)",
    ).run(a, b, b, a);
  }

  /**
   * 받은 요청에 답한다. 수락이면 친구가 되고, 어느 쪽이든 요청은 편지함에서 사라진다.
   *
   * 존재하지 않는 요청에 답하면 실패로 돌려준다 — 화면이 낡은 목록을 들고 있을 때
   * 조용히 성공한 척하면 사용자는 무엇이 일어났는지 알 수 없다.
   */
  respondFriendRequest(
    userId: number,
    fromNickname: string,
    accept: boolean,
  ): { ok: boolean; nickname?: string; error?: string } {
    const row = this.userByName(fromNickname);
    if (row === null) return { ok: false, error: "존재하지 않는 닉네임입니다" };
    const req = this.stmt(
      "SELECT 1 AS n FROM friend_requests WHERE from_id = ? AND to_id = ?",
    ).get(row.id, userId);
    if (req === undefined) return { ok: false, error: "이미 처리된 요청입니다" };
    if (!accept) {
      this.stmt("DELETE FROM friend_requests WHERE from_id = ? AND to_id = ?").run(row.id, userId);
      return { ok: true, nickname: row.username };
    }
    /*
     * **양쪽을 다 본다** (QA 2차 lobby 확정 2).
     *
     * 예전에는 «수락하는 쪽»만 셌다. `requestFriend`는 처음부터 양쪽을 보므로
     * 설계 의도는 "누구도 100명을 넘지 않는다"였는데, 수락 경로가 그 절반만 지켰다.
     * 요청은 **보류로 쌓인다** — 보낸 뒤 그 사람의 친구가 늘어나 상한을 넘어도,
     * 이미 나가 있던 보류분이 나중에 수락되면 그대로 통과했다. 게다가 보낸-요청
     * 상한은 **보류 중인 것만** 세므로 수락된 만큼 자리가 비어 계속 새로 보낼 수 있다.
     * 반복하면 무제한이고, 재현에서 실제로 130명까지 갔다.
     *
     * 친구 목록은 `friendList`로 **통째로** 나가고 관계가 바뀔 때마다 `pushFriends`가
     * 전 목록을 다시 만다 — 상한이 조용히 사라지면 그 프레임이 그만큼 커진다.
     *
     * 문구를 «상대»로 갈라 적는다. 「당신이 100명입니다」와 「그쪽이 100명입니다」는
     * 할 수 있는 일이 다르다(전자는 내가 정리하면 되고, 후자는 아니다).
     */
    if (this.friendCount(userId) >= MAX_FRIENDS) {
      return { ok: false, error: `친구는 ${MAX_FRIENDS}명까지 맺을 수 있습니다` };
    }
    if (this.friendCount(row.id) >= MAX_FRIENDS) {
      return {
        ok: false,
        error: `${row.username} 님의 친구가 이미 ${MAX_FRIENDS}명이어서 수락할 수 없습니다`,
      };
    }
    this.linkFriends(userId, row.id);
    return { ok: true, nickname: row.username };
  }

  /** 내가 보낸 요청을 거둔다. */
  cancelFriendRequest(userId: number, toNickname: string): void {
    this.stmt(
      "DELETE FROM friend_requests WHERE from_id = ? AND to_id = (SELECT id FROM users WHERE username = ?)",
    ).run(userId, toNickname);
  }

  /** 친구를 끊는다 — **양쪽 다** 지운다. 한쪽만 남으면 유령 관계가 된다. */
  removeFriend(userId: number, nickname: string): void {
    const row = this.userByName(nickname);
    if (row === null) return;
    this.stmt(
      "DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)",
    ).run(userId, row.id, row.id, userId);
  }

  /** 내 친구들의 닉네임 (가나다순). 온라인 판정은 호출자가 붙인다. */
  friendNames(userId: number): string[] {
    const rows = this.stmt(
      `SELECT u.username AS username
         FROM friends f JOIN users u ON u.id = f.friend_id
        WHERE f.user_id = ?
        ORDER BY u.username`,
    ).all(userId) as { username: string }[];
    return rows.map((r) => r.username);
  }

  /** 내가 **받은** 보류 요청 (최근 것이 위). 이게 곧 편지함의 내용이다. */
  incomingFriendRequests(userId: number): { nickname: string; at: string }[] {
    const rows = this.stmt(
      `SELECT u.username AS username, r.created_at AS at
         FROM friend_requests r JOIN users u ON u.id = r.from_id
        WHERE r.to_id = ?
        ORDER BY r.created_at DESC`,
    ).all(userId) as { username: string; at: string }[];
    return rows.map((r) => ({ nickname: r.username, at: r.at }));
  }

  /** 내가 **보낸** 보류 요청의 닉네임 (가나다순). */
  outgoingFriendRequests(userId: number): string[] {
    const rows = this.stmt(
      `SELECT u.username AS username
         FROM friend_requests r JOIN users u ON u.id = r.to_id
        WHERE r.from_id = ?
        ORDER BY u.username`,
    ).all(userId) as { username: string }[];
    return rows.map((r) => r.username);
  }

  // ─────────────────────────── 리플레이 공유 링크 (§4-8) ───────────────────────────

  /**
   * 이 판의 공유 토큰을 만들거나(없으면) 그대로 돌려준다.
   *
   * **이미 있으면 새로 만들지 않는다.** 누를 때마다 새 값이 나오면 앞서 뿌린
   * 링크가 조용히 죽는다 — 공유는 "이미 남에게 건넨 문자열"이 살아 있어야 뜻이 있다.
   */
  shareGame(gameId: number): string | null {
    const row = this.stmt("SELECT share_token FROM games WHERE id = ?").get(gameId) as
      | { share_token: string | null }
      | undefined;
    if (row === undefined) return null;
    if (row.share_token !== null && row.share_token !== "") return row.share_token;
    // 128비트 — 목록이 없으므로 추측이 유일한 공격이고, 그 앞에서 충분한 길이다.
    const token = randomBytes(16).toString("base64url");
    this.stmt("UPDATE games SET share_token = ? WHERE id = ?").run(token, gameId);
    return token;
  }

  /** 공유 링크를 내린다 — 이미 뿌린 링크가 그 자리에서 죽는다. */
  unshareGame(gameId: number): void {
    this.stmt("UPDATE games SET share_token = NULL WHERE id = ?").run(gameId);
  }

  /** 지금 걸려 있는 공유 토큰 (없으면 null). */
  shareTokenOf(gameId: number): string | null {
    const row = this.stmt("SELECT share_token FROM games WHERE id = ?").get(gameId) as
      | { share_token: string | null }
      | undefined;
    const t = row?.share_token;
    return t === undefined || t === null || t === "" ? null : t;
  }

  /** 이 토큰이 가리키는 게임 id (없으면 null). */
  gameIdByShareToken(token: string): number | null {
    if (token === "") return null;
    const row = this.stmt("SELECT id FROM games WHERE share_token = ?").get(token) as
      | { id: number }
      | undefined;
    return row?.id ?? null;
  }

  // ─────────────────────────── 공지 (§4-3) ───────────────────────────

  /**
   * 운영자 공지 — 없으면 null.
   *
   * 새 테이블을 만들지 않고 `config`에 담는다. 공지는 언제나 **한 건**이고
   * (여러 건을 쌓으면 "어느 것이 지금 것인가"를 정하는 규칙이 새로 필요해진다)
   * 이 표는 정확히 그런 단일값을 담으려고 이미 있던 자리다.
   */
  notice(): ServerNotice | null {
    const row = this.stmt("SELECT value FROM config WHERE key = 'notice'").get() as
      | { value: string }
      | undefined;
    if (row === undefined) return null;
    try {
      const parsed = JSON.parse(row.value) as Partial<ServerNotice>;
      if (typeof parsed.title !== "string" || parsed.title === "") return null;
      return {
        title: parsed.title,
        body: typeof parsed.body === "string" ? parsed.body : "",
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
      };
    } catch {
      // 손으로 고치다 깨진 값 — 공지가 안 뜨는 것이지 서버가 죽을 일은 아니다.
      return null;
    }
  }

  /**
   * 공지를 세우거나(제목이 있으면) 내린다(제목이 비면).
   *
   * 삭제를 별도 경로로 두지 않은 이유: "제목 없는 공지"는 존재할 수 없으므로
   * 빈 제목이 곧 삭제다. 두 경로를 두면 한쪽만 고쳐진 자리가 생긴다.
   */
  setNotice(title: string, body: string): ServerNotice | null {
    const t = title.trim().slice(0, NOTICE_TITLE_MAX);
    if (t === "") {
      this.stmt("DELETE FROM config WHERE key = 'notice'").run();
      return null;
    }
    const notice: ServerNotice = {
      title: t,
      body: body.trim().slice(0, NOTICE_BODY_MAX),
      updatedAt: new Date().toISOString(),
    };
    this.stmt(
      "INSERT INTO config (key, value) VALUES ('notice', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(JSON.stringify(notice));
    return notice;
  }

  // ─────────────────────────── 계정 ───────────────────────────

  /**
   * 비밀번호 규칙 위반 사유 (없으면 null).
   *
   * **왜 함수로 뽑았나** (감사 §10-2): 비밀번호 변경이 생기면서 같은 규칙을 보는
   * 자리가 둘이 됐다. 두 벌로 두면 한쪽만 고쳐져 갈리고, 그 갈림은 **약한 쪽이
   * 통과되는 방향**으로만 드러난다.
   */
  private passwordProblem(username: string, password: string): string | null {
    if (typeof password !== "string" || password.length < 8 || password.length > 72) {
      return "비밀번호는 8자 이상이어야 합니다";
    }
    /*
     * 공백만으로 이루어진 비밀번호를 거부한다 (QA 2차 auth §6).
     *
     * `"        "`는 위 길이 검사를 통과하고 숫자도 아니라 그대로 계정이 됐다 —
     * 사실상 비밀번호가 없는 계정이다. 붙여넣기 사고로 만들어지기 쉽다.
     * **비밀번호 자체를 trim하지는 않는다** — 그건 기존 계정을 깨뜨린다.
     */
    if (password.trim() === "") {
      return "비밀번호는 공백만으로 이루어질 수 없습니다";
    }
    // 온라인 무차별 대입 완화 — 숫자로만 이루어진(PIN) 비밀번호를 거부한다.
    if (/^\d+$/.test(password)) {
      return "숫자로만 이루어진 비밀번호는 사용할 수 없습니다";
    }
    if (username.length >= 4 && password.toLowerCase().includes(username.toLowerCase())) {
      return "비밀번호에 닉네임을 포함할 수 없습니다";
    }
    return null;
  }

  /**
   * 비밀번호 변경 (감사 26·29가 두 번 지적, §10-2).
   *
   * **모든 세션을 함께 끊는다.** 비밀번호를 바꾸는 이유는 대개 "누가 내 계정을
   * 봤을지도 모른다"이고, 그때 필요한 것은 새 비밀번호가 아니라 **남의 손에 있는
   * 세션이 죽는 것**이다. 세션 TTL이 30일이라 안 끊으면 한 달 동안 그대로 열려 있다.
   *
   * 지금 쓰던 연결에는 새 세션 토큰을 돌려준다 — 비밀번호를 바꿨다고 자기 자신이
   * 로그아웃되면, 그 불편 때문에 사람들이 바꾸기를 미룬다.
   */
  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<AuthResult> {
    const row = this.stmt(
      "SELECT id, username, pass_salt, pass_hash, is_admin FROM users WHERE id = ?",
    ).get(userId) as
      | { id: number; username: string; pass_salt: string; pass_hash: string; is_admin: number }
      | undefined;
    if (row === undefined) return { ok: false, error: "계정을 찾을 수 없습니다" };

    const current = (await scryptAsync(currentPassword ?? "", row.pass_salt, 64)).toString("hex");
    if (!safeEqual(current, row.pass_hash)) {
      return { ok: false, error: "현재 비밀번호가 올바르지 않습니다" };
    }
    const problem = this.passwordProblem(row.username, newPassword);
    if (problem !== null) return { ok: false, error: problem };
    if (newPassword === currentPassword) {
      return { ok: false, error: "새 비밀번호가 현재 비밀번호와 같습니다" };
    }

    const salt = randomBytes(16).toString("hex");
    const hash = (await scryptAsync(newPassword, salt, 64)).toString("hex");
    this.db.exec("BEGIN");
    try {
      this.stmt("UPDATE users SET pass_salt = ?, pass_hash = ? WHERE id = ?").run(
        salt,
        hash,
        userId,
      );
      // 남의 손에 있을지 모르는 세션을 전부 끊는다.
      this.stmt("DELETE FROM sessions WHERE user_id = ?").run(userId);
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
    return {
      ok: true,
      user: { id: row.id, username: row.username, isAdmin: row.is_admin === 1 },
      sessionToken: this.createSession(userId),
    };
  }

  /**
   * 이 계정의 **다른 모든 세션**을 끊는다 (§10-2). 지금 쓰는 토큰만 남긴다.
   *
   * 비밀번호를 바꾸지 않고도 "다른 기기에서 로그아웃"을 할 수 있어야 한다 —
   * 공용 PC에서 로그아웃을 깜빡한 경우가 정확히 그 상황이고, 그때 비밀번호까지
   * 바꾸게 하면 그건 회수가 아니라 벌이다.
   */
  logoutOthers(userId: number, keepToken: string): number {
    const before = this.stmt("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?").get(userId) as {
      n: number;
    };
    this.stmt("DELETE FROM sessions WHERE user_id = ? AND token != ?").run(userId, keepToken);
    const after = this.stmt("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?").get(userId) as {
      n: number;
    };
    return before.n - after.n;
  }

  /**
   * 이 닉네임으로 가입할 수 있는가 — 못 쓰면 그 이유, 쓸 수 있으면 null.
   *
   * `register`가 쓰는 판정을 그대로 떼어 낸 것이다. 가입 폼의 «중복 확인»
   * 버튼(`checkUsername`)과 실제 가입이 **다른 규칙으로 답하지 않도록** 한 곳에
   * 둔다 — 갈라 두면 "확인은 통과했는데 가입은 거절"이 언젠가 반드시 생긴다.
   *
   * ⚠ 이 함수는 존재 여부를 **즉시** 알려 준다(register는 열거 오라클을 막으려고
   * scrypt 뒤로 미룬다). 호출부가 인증과 같은 레이트리밋을 태워야 한다.
   */
  usernameProblem(username: string): string | null {
    if (!USERNAME_RE.test(username)) {
      return "닉네임은 2~12자이며 한글, 영문, 숫자, _, - 만 사용할 수 있습니다";
    }
    // 봇 사칭·시스템 id·프로토타입 키 방지
    if (/^bot_/i.test(username) || RESERVED_NAMES.has(username.toLowerCase())) {
      return "사용할 수 없는 닉네임입니다";
    }
    const exists = this.stmt("SELECT id FROM users WHERE username = ?").get(username);
    return exists === undefined ? null : "이미 사용 중인 닉네임입니다";
  }

  async register(username: string, password: string, adminCode?: string): Promise<AuthResult> {
    if (!USERNAME_RE.test(username)) {
      return { ok: false, error: "닉네임은 2~12자이며 한글, 영문, 숫자, _, - 만 사용할 수 있습니다" };
    }
    // 봇 사칭·시스템 id·프로토타입 키 방지
    if (/^bot_/i.test(username) || RESERVED_NAMES.has(username.toLowerCase())) {
      return { ok: false, error: "사용할 수 없는 닉네임입니다" };
    }
    const problem = this.passwordProblem(username, password);
    if (problem !== null) return { ok: false, error: problem };
    // ⚠ scrypt를 **닉네임 중복 검사보다 먼저** 돌린다 (순서가 곧 방어다).
    //
    // 예전에는 중복이면 곧바로 반환했다 — 그래서 "이미 있는 닉네임"은 즉시,
    // "없는 닉네임"은 scrypt 비용(수십 ms) 뒤에 응답이 왔다. 오류 문구를 읽지
    // 않아도 **응답 시간만으로** 계정 존재 여부를 훑을 수 있는 열거 오라클이다
    // (로그인 쪽은 이미 더미 scrypt로 막아 두었다). 이제 두 경로가 같은 비용을
    // 치른다. 문구 자체는 가입 UX상 남기되, 타이밍 채널은 닫는다.
    const salt = randomBytes(16).toString("hex");
    const hash = (await scryptAsync(password, salt, 64)).toString("hex");

    const exists = this.stmt("SELECT id FROM users WHERE username = ?")
      .get(username);
    if (exists !== undefined) {
      return { ok: false, error: "이미 사용 중인 닉네임입니다" };
    }
    const wantsAdmin = adminCode !== undefined && adminCode !== "";
    const isAdmin = wantsAdmin && this.verifyAdminCode(adminCode);
    if (wantsAdmin && !isAdmin) {
      return { ok: false, error: "관리자 코드가 올바르지 않습니다" };
    }
    let res: { lastInsertRowid: number | bigint };
    try {
      res = this.stmt(
          "INSERT INTO users (username, pass_salt, pass_hash, is_admin, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run(username, salt, hash, isAdmin ? 1 : 0, new Date().toISOString());
    } catch {
      // 중복 검사와 INSERT 사이의 경합(같은 닉네임 동시 가입) — UNIQUE 제약이
      // 막아 주므로 계정이 겹치지는 않는다. 예외를 그대로 올리면 INTERNAL로
      // 새므로 여기서 평범한 실패로 바꾼다.
      return { ok: false, error: "이미 사용 중인 닉네임입니다" };
    }
    // 승급이 실제로 일어난 뒤에 코드를 회전한다 — 유출된 코드는 한 번만 먹는다.
    if (isAdmin) this.rotateAdminCode();
    this.usersRev++;
    const user: UserRow = {
      id: Number(res.lastInsertRowid),
      username,
      isAdmin,
    };
    return { ok: true, user, sessionToken: this.createSession(user.id) };
  }

  async login(username: string, password: string): Promise<AuthResult> {
    const pw = typeof password === "string" ? password : "";
    const row = this.stmt("SELECT id, username, pass_salt, pass_hash, is_admin FROM users WHERE username = ?")
      .get(username) as
      | { id: number; username: string; pass_salt: string; pass_hash: string; is_admin: number }
      | undefined;
    if (row === undefined) {
      // 사용자 열거 타이밍 오라클 완화 — 계정이 없어도 동일한 scrypt 비용을 치르고 실패한다.
      await scryptAsync(pw, DUMMY_SALT, 64);
      return { ok: false, error: "닉네임 또는 비밀번호가 올바르지 않습니다" };
    }
    const hash = await scryptAsync(pw, row.pass_salt, 64);
    const stored = Buffer.from(row.pass_hash, "hex");
    if (hash.length !== stored.length || !timingSafeEqual(hash, stored)) {
      return { ok: false, error: "닉네임 또는 비밀번호가 올바르지 않습니다" };
    }
    const user: UserRow = { id: row.id, username: row.username, isAdmin: row.is_admin === 1 };
    return { ok: true, user, sessionToken: this.createSession(user.id) };
  }

  loginByToken(token: string): UserRow | null {
    const row = this.stmt(
        `SELECT u.id, u.username, u.is_admin, s.created_at FROM sessions s
         JOIN users u ON u.id = s.user_id WHERE s.token = ?`,
      )
      .get(token) as
      | { id: number; username: string; is_admin: number; created_at: string }
      | undefined;
    if (row === undefined) return null;
    // TTL 만료 검사 — 지난 토큰은 무효화하고 정리한다 (지연 삭제)
    if (Date.now() - Date.parse(row.created_at) > this.sessionTtlMs) {
      this.stmt("DELETE FROM sessions WHERE token = ?").run(token);
      return null;
    }
    return { id: row.id, username: row.username, isAdmin: row.is_admin === 1 };
  }

  logout(token: string): void {
    this.stmt("DELETE FROM sessions WHERE token = ?").run(token);
  }

  private createSession(userId: number): string {
    const token = randomUUID() + randomBytes(16).toString("hex");
    this.stmt("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)")
      .run(token, userId, new Date().toISOString());
    // 세션 무한 증식 방지 — 사용자당 최신 MAX_SESSIONS_PER_USER개만 남기고 오래된 세션을 정리한다.
    this.stmt(
        `DELETE FROM sessions WHERE user_id = ? AND token NOT IN (
           SELECT token FROM sessions WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?
         )`,
      )
      .run(userId, userId, MAX_SESSIONS_PER_USER);
    return token;
  }

  // ─────────────────────────── 계정 관리 (관리자) ───────────────────────────

  /** 전체 계정 목록 (관리자용) — 가입순, 참가 게임 수 포함. */
  listUsers(): AdminUserRow[] {
    const rows = this.stmt(
        `SELECT u.id, u.username, u.is_admin, u.created_at,
           (SELECT COUNT(DISTINCT gp.game_id) FROM game_players gp WHERE gp.user_id = u.id) AS games
         FROM users u ORDER BY u.id ASC`,
      )
      .all() as { id: number; username: string; is_admin: number; created_at: string; games: number }[];
    return rows.map((r) => ({
      id: r.id,
      username: r.username,
      isAdmin: r.is_admin === 1,
      createdAt: r.created_at,
      games: Number(r.games),
    }));
  }

  /**
   * 존재하는 계정의 닉네임만 (관리 화면용 집계 없이).
   *
   * `listUsers`는 계정마다 상관 서브쿼리(`COUNT(DISTINCT game_id)`)를 돌린다.
   * 리더보드는 "이 닉네임이 아직 살아 있는 계정인가"만 알면 되므로, 계정 수에
   * 비례해 커지는 그 비용(node:sqlite는 동기 — 그동안 모든 게임이 멈춘다)을
   * 치를 이유가 없다.
   */
  /** 계정 집합의 세대 번호 — 가입·삭제 때마다 오른다 (리더보드 캐시 무효화용). */
  usersVersion(): number {
    return this.usersRev;
  }

  listUsernames(): string[] {
    const rows = this.stmt("SELECT username FROM users").all() as {
      username: string;
    }[];
    return rows.map((r) => r.username);
  }

  /**
   * 계정 삭제 (관리자용) — 세션을 지우고 게임 기록은 익명(user_id=NULL)으로
   * 남긴다(다른 참가자의 리플레이·순위를 훼손하지 않기 위함). 삭제된 username을
   * 반환해 호출자가 통계 저장소(닉네임 키)도 함께 정리할 수 있게 한다.
   */
  /**
   * **닉네임을 바꾼다** (관리자 전용, 2026-09-03 사용자 요청).
   *
   * 판정은 가입과 **같은 규칙**을 쓴다(`usernameProblem`) — 갈라 두면 가입에서
   * 막히는 이름이 관리자 화면으로는 들어오는 뒷문이 된다. 다만 중복 검사는
   * 자기 자신을 빼야 한다: 대소문자만 바꾸는 개명(`Kim` → `KIM`)은 스키마의
   * `UNIQUE COLLATE NOCASE`상 같은 행이라 «이미 사용 중»이 아니다.
   *
   * **옛 이름을 돌려준다** (`deleteUser`와 같은 규약, 2026-09-04). 누적 통계
   * 저장소(`StatsStore`)는 계정 id가 아니라 **닉네임**을 키로 쓰므로, 호출자가 그
   * 표의 줄도 새 이름으로 옮겨 줘야 한다 — 안 그러면 개명한 사람의 전적이 옛 이름
   * 밑에 남아 «전적 없음»이 된다(사용자 보고).
   *
   * 지난 판의 `game_players.nickname`은 **바꾸지 않는다.** 그건 «그 판을 무슨 이름으로
   * 뒀는가»의 기록이고, 같은 판의 다른 참가자 리플레이·순위도 그 값을 가리킨다.
   * 반면 제보 글의 작성자 이름(`feedback.author`)은 «지금 이 사람이 누구인가»의
   * 표시용 사본이라 함께 갈아 끼운다.
   *
   * @returns `{ ok: true, from }` — from 은 옛 닉네임. 실패면 `{ ok: false, error }`
   */
  renameUser(
    userId: number,
    username: string,
  ): { ok: boolean; from?: string; error?: string } {
    if (!Number.isInteger(userId)) return { ok: false, error: "잘못된 사용자 ID입니다" };
    const row = this.stmt("SELECT username FROM users WHERE id = ?").get(userId) as
      | { username: string }
      | undefined;
    if (row === undefined) return { ok: false, error: "존재하지 않는 계정입니다" };
    // 같은 이름 — 할 일이 없다(옮길 통계도 없다).
    if (row.username === username) return { ok: true, from: row.username };
    /*
     * 이름 규칙(글자·길이·예약어·bot_ 사칭)은 가입과 공용이다. 중복만 따로 보는데,
     * `usernameProblem`의 중복 검사는 «자기 자신»도 걸리기 때문이다.
     */
    const problem = this.usernameProblem(username);
    if (problem !== null && problem !== "이미 사용 중인 닉네임입니다") {
      return { ok: false, error: problem };
    }
    const taken = this.stmt(
      "SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id <> ?",
    ).get(username, userId);
    if (taken !== undefined) return { ok: false, error: "이미 사용 중인 닉네임입니다" };
    // 이름과 그 이름을 쓰는 표시용 사본을 한 덩어리로 바꾼다 — 한쪽만 바뀌면
    // 제보 목록에 옛 이름이 남는다.
    this.db.exec("BEGIN");
    try {
      this.stmt("UPDATE users SET username = ? WHERE id = ?").run(username, userId);
      this.stmt("UPDATE feedback SET author = ? WHERE user_id = ?").run(username, userId);
      this.db.exec("COMMIT");
    } catch {
      // 검사와 UPDATE 사이의 경합 — UNIQUE 제약이 막아 준다.
      try {
        this.db.exec("ROLLBACK");
      } catch {
        /* 이미 열려 있지 않으면 되돌릴 것도 없다 */
      }
      return { ok: false, error: "이미 사용 중인 닉네임입니다" };
    }
    this.usersRev++;
    return { ok: true, from: row.username };
  }

  deleteUser(userId: number): { ok: boolean; username?: string; error?: string } {
    if (!Number.isInteger(userId)) return { ok: false, error: "잘못된 사용자 ID입니다" };
    const row = this.stmt("SELECT username FROM users WHERE id = ?")
      .get(userId) as { username: string } | undefined;
    if (row === undefined) return { ok: false, error: "존재하지 않는 계정입니다" };
    // 세션·게임참조·계정을 원자적으로 정리 (한 단계라도 실패하면 전부 롤백)
    this.db.exec("BEGIN");
    try {
      this.stmt("DELETE FROM sessions WHERE user_id = ?").run(userId);
      this.stmt("UPDATE game_players SET user_id = NULL WHERE user_id = ?").run(userId);
      // 제보는 남기되 주인을 끊는다 — 관리자에게는 계속 보이고(처리 이력 보존),
      // 나중에 같은 닉네임으로 재가입한 다른 사람에게는 보이지 않는다.
      this.stmt("UPDATE feedback SET user_id = NULL WHERE user_id = ?").run(userId);
      // 친구 관계·보류 요청은 **주인을 끊지 않고 지운다.** 제보와 달리 남겨서 얻을
      // 이력이 없고, 같은 닉네임으로 재가입한 다른 사람이 남의 친구 자리를 물려받는
      // 일은 있어서는 안 된다.
      this.stmt("DELETE FROM friends WHERE user_id = ? OR friend_id = ?").run(userId, userId);
      this.stmt("DELETE FROM friend_requests WHERE from_id = ? OR to_id = ?").run(userId, userId);
      this.stmt("DELETE FROM users WHERE id = ?").run(userId);
      this.db.exec("COMMIT");
      this.usersRev++;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
    return { ok: true, username: row.username };
  }

  userByName(username: string): UserRow | null {
    const row = this.stmt("SELECT id, username, is_admin FROM users WHERE username = ?")
      .get(username) as { id: number; username: string; is_admin: number } | undefined;
    return row === undefined
      ? null
      : { id: row.id, username: row.username, isAdmin: row.is_admin === 1 };
  }

  // ─────────────────────────── 제보 게시판 ───────────────────────────

  /**
   * 제보 작성. 종류·길이를 여기서 최종 검증한다 (라우터에서 한 번, DB에서 한 번 —
   * 저장소를 직접 쓰는 다른 경로가 생겨도 규칙이 깨지지 않게).
   */
  addFeedback(
    user: UserRow,
    kind: string,
    title: string,
    body: string,
  ): { ok: boolean; id?: number; error?: string } {
    if (!FEEDBACK_KINDS.has(kind)) return { ok: false, error: "제보 종류가 올바르지 않습니다" };
    const t = typeof title === "string" ? title.trim() : "";
    const b = typeof body === "string" ? body.trim() : "";
    if (t === "") return { ok: false, error: "제목을 입력해 주세요" };
    if (t.length > FEEDBACK_TITLE_MAX) {
      return { ok: false, error: `제목은 ${FEEDBACK_TITLE_MAX}자 이내여야 합니다` };
    }
    if (b === "") return { ok: false, error: "내용을 입력해 주세요" };
    if (b.length > FEEDBACK_BODY_MAX) {
      return { ok: false, error: `내용은 ${FEEDBACK_BODY_MAX}자 이내여야 합니다` };
    }
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const recent = this.stmt("SELECT COUNT(*) AS n FROM feedback WHERE user_id = ? AND created_at > ?")
      .get(user.id, since) as { n: number };
    if (Number(recent.n) >= FEEDBACK_PER_HOUR) {
      return { ok: false, error: "짧은 시간에 제보를 너무 많이 보냈습니다. 잠시 후 다시 시도해 주세요" };
    }
    const res = this.stmt(
        `INSERT INTO feedback (user_id, author, kind, title, body, status, reply, created_at, replied_at)
         VALUES (?, ?, ?, ?, ?, 'open', '', ?, NULL)`,
      )
      .run(user.id, user.username, kind, t, b, new Date().toISOString());
    return { ok: true, id: Number(res.lastInsertRowid) };
  }

  /**
   * 볼 수 있는 제보 목록 (최신순).
   *
   * **공개 범위가 곧 쿼리다** — 관리자는 전체, 그 외에는 `user_id = 본인`인 글만.
   * 남의 글은 애초에 조회되지 않으므로 상위 계층이 필터를 빠뜨려도 새지 않는다.
   */
  listFeedback(user: UserRow, limit = 200): FeedbackRow[] {
    const rows = user.isAdmin
      ? (this.stmt("SELECT * FROM feedback ORDER BY id DESC LIMIT ?")
          .all(limit) as Record<string, unknown>[])
      : (this.stmt("SELECT * FROM feedback WHERE user_id = ? ORDER BY id DESC LIMIT ?")
          .all(user.id, limit) as Record<string, unknown>[]);
    return rows.map((r) => this.toFeedbackRow(r));
  }

  /** 제보 1건 조회 — 권한 판정은 호출자가 한다 (작성자 본인 또는 관리자). */
  getFeedback(id: number): FeedbackRow | null {
    if (!Number.isInteger(id)) return null;
    const row = this.stmt("SELECT * FROM feedback WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    return row === undefined ? null : this.toFeedbackRow(row);
  }

  /** 상태·답변 변경 (관리자 전용 — 권한 판정은 호출자). 준 항목만 바꾼다. */
  updateFeedback(
    id: number,
    patch: { status?: string; reply?: string },
  ): { ok: boolean; error?: string } {
    const cur = this.getFeedback(id);
    if (cur === null) return { ok: false, error: "존재하지 않는 제보입니다" };
    if (patch.status !== undefined && !FEEDBACK_STATUSES.has(patch.status)) {
      return { ok: false, error: "상태 값이 올바르지 않습니다" };
    }
    if (patch.reply !== undefined && typeof patch.reply !== "string") {
      return { ok: false, error: "답변이 올바르지 않습니다" };
    }
    const reply = patch.reply === undefined ? cur.reply : patch.reply.trim();
    if (reply.length > FEEDBACK_REPLY_MAX) {
      return { ok: false, error: `답변은 ${FEEDBACK_REPLY_MAX}자 이내여야 합니다` };
    }
    this.stmt("UPDATE feedback SET status = ?, reply = ?, replied_at = ? WHERE id = ?")
      .run(patch.status ?? cur.status, reply, new Date().toISOString(), id);
    return { ok: true };
  }

  /** 제보 삭제 — 작성자 본인 또는 관리자만. */
  deleteFeedback(id: number, user: UserRow): { ok: boolean; error?: string } {
    const cur = this.getFeedback(id);
    if (cur === null) return { ok: false, error: "존재하지 않는 제보입니다" };
    if (!user.isAdmin && cur.userId !== user.id) {
      return { ok: false, error: "삭제 권한이 없습니다" };
    }
    this.stmt("DELETE FROM feedback WHERE id = ?").run(id);
    return { ok: true };
  }

  private toFeedbackRow(r: Record<string, unknown>): FeedbackRow {
    return {
      id: Number(r.id),
      userId: r.user_id === null ? null : Number(r.user_id),
      author: String(r.author),
      kind: String(r.kind) as FeedbackKind,
      title: String(r.title),
      body: String(r.body),
      status: String(r.status) as FeedbackStatus,
      reply: String(r.reply ?? ""),
      createdAt: String(r.created_at),
      repliedAt: r.replied_at === null || r.replied_at === undefined ? null : String(r.replied_at),
    };
  }

  // ─────────────────────────── 게임 인덱스 ───────────────────────────

  /**
   * 게임 1건 + 참가자 4행을 **한 트랜잭션으로** 기록한다.
   *
   * 나눠 쓰면 참가자 삽입 도중 실패했을 때 "참가자가 두 명뿐인 게임"이 남는다 —
   * 그 행은 리플레이 목록·순위에 그대로 실려 영구히 어긋난 기록이 된다.
   * deleteUser가 이미 같은 방식(BEGIN/COMMIT/ROLLBACK)을 쓴다.
   */
  // ─────────────────────────── 진행 중인 대국 (이어하기) ───────────────────────────

  /**
   * 진행 중인 대국을 적어 둔다 (같은 코드면 덮어쓴다).
   *
   * 게임 시작 때 한 번, 그 뒤로는 국이 끝날 때마다 부른다 — 좌석이 바뀌지는
   * 않지만 `updated_at`이 갱신돼야 **언제 끊긴 판인지**를 알 수 있다. 그 값이
   * 없으면 부팅 때 며칠 묵은 잔해와 방금 끊긴 판을 구분할 수 없다.
   */
  saveLiveGame(rec: LiveGameRecord): void {
    this.stmt(
      `INSERT INTO live_games (code, replay_path, game_mode, bot_difficulty, pace, seats, started_at, updated_at,
                               paused, pause_reason, notice, notice_expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(code) DO UPDATE SET
         replay_path = excluded.replay_path,
         game_mode = excluded.game_mode,
         bot_difficulty = excluded.bot_difficulty,
         pace = excluded.pace,
         seats = excluded.seats,
         updated_at = excluded.updated_at,
         paused = excluded.paused,
         pause_reason = excluded.pause_reason,
         notice = excluded.notice,
         notice_expires_at = excluded.notice_expires_at`,
    ).run(
      rec.code,
      rec.replayPath,
      rec.gameMode,
      rec.botDifficulty,
      rec.pace ?? null,
      JSON.stringify(rec.seats),
      rec.startedAt,
      rec.updatedAt,
      rec.paused ? 1 : 0,
      rec.pauseReason,
      rec.notice,
      rec.noticeExpiresAt,
    );
  }

  /**
   * 이 판은 더 이상 진행 중이 아니다 — 행을 지운다.
   *
   * 종료·무효·크래시 **전부**에서 불러야 한다. 하나라도 빠지면 그 코드가 부팅
   * 때마다 되살아나려 들고, 리플레이 파일이 이미 정리됐다면 매번 실패한다.
   */
  clearLiveGame(code: string): void {
    this.stmt("DELETE FROM live_games WHERE code = ?").run(code);
  }

  /** 되살릴 후보 전부. 오래된 것부터 — 부팅 로그가 시간 순으로 읽힌다. */
  listLiveGames(): LiveGameRecord[] {
    const rows = this.stmt("SELECT * FROM live_games ORDER BY started_at").all() as {
      code: string;
      replay_path: string;
      game_mode: string;
      bot_difficulty: string;
      seats: string;
      started_at: string;
      updated_at: string;
      // ALTER로 나중에 붙은 열 — 그 이전에 쓰인 행에는 NULL이 들어 있다.
      paused: number | null;
      pause_reason: string | null;
      notice: string | null;
      notice_expires_at: string | null;
      pace: string | null;
    }[];
    return rows.map((r) => ({
      code: r.code,
      replayPath: r.replay_path,
      gameMode: r.game_mode,
      botDifficulty: r.bot_difficulty,
      // NULL(= 열이 붙기 전에 쓰인 행)은 호출부가 기본 속도로 읽는다.
      pace: r.pace ?? null,
      // 좌석 JSON이 깨져 있으면 그 판만 포기한다(빈 좌석 → 호출부가 건너뛴다).
      // 여기서 던지면 **다른 멀쩡한 판까지** 못 되살린다.
      seats: parseSeats(r.seats),
      startedAt: r.started_at,
      updatedAt: r.updated_at,
      // NULL(= 열이 붙기 전에 쓰인 행)은 «세워 두지 않았다»로 읽는다. 모르는 것을
      // 정지로 해석하면 되살아난 판이 아무 이유 없이 굳는다 — 그 반대가 안전하다.
      paused: r.paused === 1,
      pauseReason: r.pause_reason ?? null,
      notice: r.notice ?? null,
      noticeExpiresAt: r.notice_expires_at ?? null,
    }));
  }

  recordGame(rec: GameRecord): number {
    this.db.exec("BEGIN");
    try {
      const res = this.stmt(
          "INSERT INTO games (code, replay_path, started_at, ended_at) VALUES (?, ?, ?, ?)",
        )
        .run(rec.code, rec.replayPath, rec.startedAt, rec.endedAt);
      const gameId = Number(res.lastInsertRowid);
      const insert = this.stmt(
        "INSERT INTO game_players (game_id, user_id, nickname, is_bot, rank, score) VALUES (?, ?, ?, ?, ?, ?)",
      );
      for (const p of rec.players) {
        insert.run(gameId, p.userId, p.nickname, p.isBot ? 1 : 0, p.rank, p.score);
      }
      this.db.exec("COMMIT");
      return gameId;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  /**
   * `endedAt`이 기준 시각보다 오래된 게임을 지운다 — 지운 리플레이 파일 경로를
   * 돌려주므로 호출자가 `.jsonl`도 함께 치울 수 있다.
   *
   * 게임 행과 리플레이 파일은 지금까지 아무도 지우지 않아 영원히 쌓이기만 했다.
   * 오래된 판을 지우는 것은 되돌릴 수 없으므로 보존 기간은 호출자가 정한다
   * (index.ts의 `GAME_RETENTION_DAYS` — 기본은 넉넉하게 잡혀 있다).
   */
  pruneGamesBefore(cutoffIso: string): string[] {
    const rows = this.stmt("SELECT id, replay_path FROM games WHERE ended_at < ?")
      .all(cutoffIso) as { id: number; replay_path: string }[];
    if (rows.length === 0) return [];
    this.db.exec("BEGIN");
    try {
      const delPlayers = this.stmt("DELETE FROM game_players WHERE game_id = ?");
      const delGame = this.stmt("DELETE FROM games WHERE id = ?");
      for (const r of rows) {
        delPlayers.run(r.id);
        delGame.run(r.id);
      }
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
    return rows.map((r) => r.replay_path);
  }

  /**
   * 인덱스에 남아 있는 모든 리플레이 파일 경로.
   *
   * 디스크의 `.jsonl` 중 **어느 게임도 가리키지 않는 것**(고아)을 찾는 데 쓴다 —
   * `pruneReplays.ts` 주석 참고.
   */
  allReplayPaths(): string[] {
    const rows = this.stmt("SELECT replay_path FROM games").all() as {
      replay_path: string;
    }[];
    return rows.map((r) => r.replay_path);
  }

  /** 해당 사용자가 참가한 게임 목록 (최신순, 최대 limit) */
  listGamesFor(userId: number, limit = 50): GameSummaryRow[] {
    const games = this.stmt(
        `SELECT DISTINCT g.id, g.code, g.ended_at, g.replay_path FROM games g
         JOIN game_players gp ON gp.game_id = g.id
         WHERE gp.user_id = ? ORDER BY g.id DESC LIMIT ?`,
      )
      .all(userId, limit) as { id: number; code: string; ended_at: string; replay_path: string }[];
    return games.map((g) => this.hydrate(g));
  }

  /** 모든 게임 목록 (최신순, 최대 limit) — 관리자 리플레이 조회용. */
  listAllGames(limit = 200): GameSummaryRow[] {
    const games = this.stmt("SELECT id, code, ended_at, replay_path FROM games ORDER BY id DESC LIMIT ?")
      .all(limit) as { id: number; code: string; ended_at: string; replay_path: string }[];
    return games.map((g) => this.hydrate(g));
  }

  /**
   * 기간 성적 — `games.ended_at`에서 되만든다 (감사 §4-7).
   *
   * **왜 여기서 세는가**: 누적 통계(`PlayerStatsRaw`)에는 타임스탬프가 한 개도
   * 없어서 "이번 주 성적"이 구조적으로 불가능했다. 그런데 게임 인덱스는 처음부터
   * 시각을 갖고 있다 — 기록 형식을 바꾸지 않고도, **이미 쌓인 과거 데이터까지**
   * 그대로 되살릴 수 있는 유일한 길이다.
   *
   * 담기는 것은 판수와 순위 분포뿐이다. 화료율·방총률은 이 표에 없고, 있는 척하려면
   * 리플레이를 전부 다시 읽어야 한다 — 그건 이 기능이 값하는 비용이 아니다.
   *
   * 한 쿼리로 끝낸다(집계는 SQLite가 한다). `node:sqlite`는 동기라, 판수만큼
   * 왕복하면 그동안 서버의 모든 대국이 함께 멈춘다.
   */
  periodStats(userId: number, days: number): {
    games: number;
    placements: [number, number, number, number];
  } {
    const since = new Date(Date.now() - days * 24 * 60 * 60_000).toISOString();
    const rows = this.stmt(
      `SELECT gp.rank AS rank, COUNT(*) AS n
         FROM game_players gp
         JOIN games g ON g.id = gp.game_id
        WHERE gp.user_id = ? AND g.ended_at >= ?
        GROUP BY gp.rank`,
    ).all(userId, since) as { rank: number; n: number }[];
    const placements: [number, number, number, number] = [0, 0, 0, 0];
    let games = 0;
    for (const r of rows) {
      games += r.n;
      const at = r.rank - 1;
      if (at >= 0 && at <= 3) placements[at as 0 | 1 | 2 | 3] += r.n;
    }
    return { games, placements };
  }

  /** 게임 1건 조회 — 접근 권한 판정은 호출자(참가자 본인 또는 관리자)가 한다 */
  getGame(gameId: number): (GameSummaryRow & { participantUserIds: number[] }) | null {
    // 신뢰할 수 없는 입력 방어 — 정수가 아니면 바인딩이 던지므로 여기서 차단
    if (!Number.isInteger(gameId)) return null;
    const g = this.stmt("SELECT id, code, ended_at, replay_path FROM games WHERE id = ?")
      .get(gameId) as { id: number; code: string; ended_at: string; replay_path: string } | undefined;
    if (g === undefined) return null;
    const row = this.hydrate(g);
    const ids = this.stmt("SELECT user_id FROM game_players WHERE game_id = ? AND user_id IS NOT NULL")
      .all(gameId) as { user_id: number }[];
    return { ...row, participantUserIds: ids.map((r) => r.user_id) };
  }

  private hydrate(g: { id: number; code: string; ended_at: string; replay_path: string }): GameSummaryRow {
    const players = this.stmt(
        "SELECT nickname, is_bot, rank, score FROM game_players WHERE game_id = ? ORDER BY rank",
      )
      .all(g.id) as { nickname: string; is_bot: number; rank: number; score: number }[];
    return {
      gameId: g.id,
      code: g.code,
      endedAt: g.ended_at,
      replayPath: g.replay_path,
      players: players.map((p) => ({
        nickname: p.nickname,
        isBot: p.is_bot === 1,
        rank: p.rank,
        score: p.score,
      })),
    };
  }

  close(): void {
    // 캐시된 구문은 이 DB에 묶여 있다 — 닫기 전에 참조를 놓는다.
    this.stmts.clear();
    this.db.close();
  }
}
