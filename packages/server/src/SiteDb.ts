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
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { DatabaseSync as DatabaseSyncT } from "node:sqlite";

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
    const row = this.db
      .prepare("SELECT value FROM config WHERE key = 'admin_code'")
      .get() as { value: string } | undefined;
    if (row !== undefined) return row.value;
    // 48비트는 온라인 추측에는 충분하지만 유출 내성이 없다 — 128비트로 올린다.
    const code = randomBytes(16).toString("base64url");
    this.db
      .prepare("INSERT INTO config (key, value) VALUES ('admin_code', ?)")
      .run(code);
    return code;
  }

  /** 관리자 계정이 하나라도 있는지 (부팅 로그에 코드를 노출할지 판단용). */
  hasAdmin(): boolean {
    const row = this.db.prepare("SELECT 1 AS n FROM users WHERE is_admin = 1 LIMIT 1").get();
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
    this.db
      .prepare("UPDATE config SET value = ? WHERE key = 'admin_code'")
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

    const exists = this.db
      .prepare("SELECT id FROM users WHERE username = ?")
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
      res = this.db
        .prepare(
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
    const user: UserRow = {
      id: Number(res.lastInsertRowid),
      username,
      isAdmin,
    };
    return { ok: true, user, sessionToken: this.createSession(user.id) };
  }

  async login(username: string, password: string): Promise<AuthResult> {
    const pw = typeof password === "string" ? password : "";
    const row = this.db
      .prepare("SELECT id, username, pass_salt, pass_hash, is_admin FROM users WHERE username = ?")
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
    const row = this.db
      .prepare(
        `SELECT u.id, u.username, u.is_admin, s.created_at FROM sessions s
         JOIN users u ON u.id = s.user_id WHERE s.token = ?`,
      )
      .get(token) as
      | { id: number; username: string; is_admin: number; created_at: string }
      | undefined;
    if (row === undefined) return null;
    // TTL 만료 검사 — 지난 토큰은 무효화하고 정리한다 (지연 삭제)
    if (Date.now() - Date.parse(row.created_at) > this.sessionTtlMs) {
      this.db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
      return null;
    }
    return { id: row.id, username: row.username, isAdmin: row.is_admin === 1 };
  }

  logout(token: string): void {
    this.db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  }

  private createSession(userId: number): string {
    const token = randomUUID() + randomBytes(16).toString("hex");
    this.db
      .prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)")
      .run(token, userId, new Date().toISOString());
    // 세션 무한 증식 방지 — 사용자당 최신 MAX_SESSIONS_PER_USER개만 남기고 오래된 세션을 정리한다.
    this.db
      .prepare(
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
    const rows = this.db
      .prepare(
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
   * 계정 삭제 (관리자용) — 세션을 지우고 게임 기록은 익명(user_id=NULL)으로
   * 남긴다(다른 참가자의 리플레이·순위를 훼손하지 않기 위함). 삭제된 username을
   * 반환해 호출자가 통계 저장소(닉네임 키)도 함께 정리할 수 있게 한다.
   */
  deleteUser(userId: number): { ok: boolean; username?: string; error?: string } {
    if (!Number.isInteger(userId)) return { ok: false, error: "잘못된 사용자 ID입니다" };
    const row = this.db
      .prepare("SELECT username FROM users WHERE id = ?")
      .get(userId) as { username: string } | undefined;
    if (row === undefined) return { ok: false, error: "존재하지 않는 계정입니다" };
    // 세션·게임참조·계정을 원자적으로 정리 (한 단계라도 실패하면 전부 롤백)
    this.db.exec("BEGIN");
    try {
      this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
      this.db.prepare("UPDATE game_players SET user_id = NULL WHERE user_id = ?").run(userId);
      // 제보는 남기되 주인을 끊는다 — 관리자에게는 계속 보이고(처리 이력 보존),
      // 나중에 같은 닉네임으로 재가입한 다른 사람에게는 보이지 않는다.
      this.db.prepare("UPDATE feedback SET user_id = NULL WHERE user_id = ?").run(userId);
      this.db.prepare("DELETE FROM users WHERE id = ?").run(userId);
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
    return { ok: true, username: row.username };
  }

  userByName(username: string): UserRow | null {
    const row = this.db
      .prepare("SELECT id, username, is_admin FROM users WHERE username = ?")
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
    const recent = this.db
      .prepare("SELECT COUNT(*) AS n FROM feedback WHERE user_id = ? AND created_at > ?")
      .get(user.id, since) as { n: number };
    if (Number(recent.n) >= FEEDBACK_PER_HOUR) {
      return { ok: false, error: "제보가 너무 잦습니다. 잠시 후 다시 시도해 주세요" };
    }
    const res = this.db
      .prepare(
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
      ? (this.db
          .prepare("SELECT * FROM feedback ORDER BY id DESC LIMIT ?")
          .all(limit) as Record<string, unknown>[])
      : (this.db
          .prepare("SELECT * FROM feedback WHERE user_id = ? ORDER BY id DESC LIMIT ?")
          .all(user.id, limit) as Record<string, unknown>[]);
    return rows.map((r) => this.toFeedbackRow(r));
  }

  /** 제보 1건 조회 — 권한 판정은 호출자가 한다 (작성자 본인 또는 관리자). */
  getFeedback(id: number): FeedbackRow | null {
    if (!Number.isInteger(id)) return null;
    const row = this.db.prepare("SELECT * FROM feedback WHERE id = ?").get(id) as
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
    this.db
      .prepare("UPDATE feedback SET status = ?, reply = ?, replied_at = ? WHERE id = ?")
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
    this.db.prepare("DELETE FROM feedback WHERE id = ?").run(id);
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

  recordGame(rec: GameRecord): number {
    const res = this.db
      .prepare(
        "INSERT INTO games (code, replay_path, started_at, ended_at) VALUES (?, ?, ?, ?)",
      )
      .run(rec.code, rec.replayPath, rec.startedAt, rec.endedAt);
    const gameId = Number(res.lastInsertRowid);
    const insert = this.db.prepare(
      "INSERT INTO game_players (game_id, user_id, nickname, is_bot, rank, score) VALUES (?, ?, ?, ?, ?, ?)",
    );
    for (const p of rec.players) {
      insert.run(gameId, p.userId, p.nickname, p.isBot ? 1 : 0, p.rank, p.score);
    }
    return gameId;
  }

  /** 해당 사용자가 참가한 게임 목록 (최신순, 최대 limit) */
  listGamesFor(userId: number, limit = 50): GameSummaryRow[] {
    const games = this.db
      .prepare(
        `SELECT DISTINCT g.id, g.code, g.ended_at, g.replay_path FROM games g
         JOIN game_players gp ON gp.game_id = g.id
         WHERE gp.user_id = ? ORDER BY g.id DESC LIMIT ?`,
      )
      .all(userId, limit) as { id: number; code: string; ended_at: string; replay_path: string }[];
    return games.map((g) => this.hydrate(g));
  }

  /** 모든 게임 목록 (최신순, 최대 limit) — 관리자 리플레이 조회용. */
  listAllGames(limit = 200): GameSummaryRow[] {
    const games = this.db
      .prepare("SELECT id, code, ended_at, replay_path FROM games ORDER BY id DESC LIMIT ?")
      .all(limit) as { id: number; code: string; ended_at: string; replay_path: string }[];
    return games.map((g) => this.hydrate(g));
  }

  /** 게임 1건 조회 — 접근 권한 판정은 호출자(참가자 본인 또는 관리자)가 한다 */
  getGame(gameId: number): (GameSummaryRow & { participantUserIds: number[] }) | null {
    // 신뢰할 수 없는 입력 방어 — 정수가 아니면 바인딩이 던지므로 여기서 차단
    if (!Number.isInteger(gameId)) return null;
    const g = this.db
      .prepare("SELECT id, code, ended_at, replay_path FROM games WHERE id = ?")
      .get(gameId) as { id: number; code: string; ended_at: string; replay_path: string } | undefined;
    if (g === undefined) return null;
    const row = this.hydrate(g);
    const ids = this.db
      .prepare("SELECT user_id FROM game_players WHERE game_id = ? AND user_id IS NOT NULL")
      .all(gameId) as { user_id: number }[];
    return { ...row, participantUserIds: ids.map((r) => r.user_id) };
  }

  private hydrate(g: { id: number; code: string; ended_at: string; replay_path: string }): GameSummaryRow {
    const players = this.db
      .prepare(
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
    this.db.close();
  }
}
