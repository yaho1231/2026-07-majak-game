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
    `);
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

  // ─────────────────────────── 계정 ───────────────────────────

  async register(username: string, password: string, adminCode?: string): Promise<AuthResult> {
    if (!USERNAME_RE.test(username)) {
      return { ok: false, error: "닉네임은 2~12자 (한글·영문·숫자·_-)만 가능합니다" };
    }
    // 봇 사칭·시스템 id·프로토타입 키 방지
    if (/^bot_/i.test(username) || RESERVED_NAMES.has(username.toLowerCase())) {
      return { ok: false, error: "사용할 수 없는 닉네임입니다" };
    }
    if (typeof password !== "string" || password.length < 8 || password.length > 72) {
      return { ok: false, error: "비밀번호는 8자 이상이어야 합니다" };
    }
    // 온라인 무차별 대입 완화 — 숫자로만 이루어진(PIN) 비밀번호와 닉네임을 포함한 비밀번호를 거부한다.
    if (/^\d+$/.test(password)) {
      return { ok: false, error: "숫자로만 이루어진 비밀번호는 사용할 수 없습니다" };
    }
    if (username.length >= 4 && password.toLowerCase().includes(username.toLowerCase())) {
      return { ok: false, error: "비밀번호에 닉네임을 포함할 수 없습니다" };
    }
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
      return { ok: false, error: "제보가 너무 잦습니다. 잠시 후 다시 시도해 주세요" };
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
