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
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
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

export class SiteDb {
  private readonly db: DatabaseSyncT;

  constructor(
    path: string,
    private readonly sessionTtlMs: number = DEFAULT_SESSION_TTL_MS,
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
    `);
  }

  // ─────────────────────────── 관리자 코드 ───────────────────────────

  /** 관리자 가입 코드 — 없으면 생성해 저장한다 (서버 부팅 로그로 확인) */
  adminCode(): string {
    const row = this.db
      .prepare("SELECT value FROM config WHERE key = 'admin_code'")
      .get() as { value: string } | undefined;
    if (row !== undefined) return row.value;
    const code = randomBytes(6).toString("base64url");
    this.db
      .prepare("INSERT INTO config (key, value) VALUES ('admin_code', ?)")
      .run(code);
    return code;
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
    const exists = this.db
      .prepare("SELECT id FROM users WHERE username = ?")
      .get(username);
    if (exists !== undefined) {
      return { ok: false, error: "이미 사용 중인 닉네임입니다" };
    }
    const salt = randomBytes(16).toString("hex");
    const hash = (await scryptAsync(password, salt, 64)).toString("hex");
    const isAdmin = adminCode !== undefined && adminCode !== "" && adminCode === this.adminCode();
    if (adminCode !== undefined && adminCode !== "" && !isAdmin) {
      return { ok: false, error: "관리자 코드가 올바르지 않습니다" };
    }
    const res = this.db
      .prepare(
        "INSERT INTO users (username, pass_salt, pass_hash, is_admin, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(username, salt, hash, isAdmin ? 1 : 0, new Date().toISOString());
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
