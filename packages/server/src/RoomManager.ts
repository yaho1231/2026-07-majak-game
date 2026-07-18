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

import { randomUUID, randomInt } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { WebSocket } from "ws";
import { contentAugments } from "@majak/content";
import { HanchanController } from "@majak/core/match/HanchanController.js";
import type { SpectatorSink } from "@majak/core/match/HanchanController.js";
import type { PlayerAgent } from "@majak/core/match/PlayerAgent.js";
import type { PlayerId } from "@majak/core/engine/zones/Zone.js";
import type {
  ClientMessage,
  ServerMessage,
  RankingEntry,
  LobbyPlayerEntry,
  ReplayGameSummary,
  StatsEntry,
} from "@majak/core/network/protocol.js";
import { StatsTracker, deriveStats, createEmptyStats } from "@majak/core/stats/PlayerStats.js";
import type { PlayerStatsRaw } from "@majak/core/stats/PlayerStats.js";
import { HumanAgent } from "./HumanAgent.js";
import { BotAgent } from "./BotAgent.js";
import { ReplayWriter } from "./ReplayWriter.js";
import type { StatsStore } from "./StatsStore.js";
import type { AuthResult, SiteDb, UserRow } from "./SiteDb.js";

type RoomPhase = "waiting" | "playing";

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
}

/** 연결 1개의 상태 — 인증·방 참가·관전을 소켓 단위로 추적한다 */
interface Conn {
  id: string;
  ws: WebSocket;
  user: UserRow | null;
  sessionToken: string | null;
  room: Room | null;
  agent: HumanAgent | null;
  spectating: Room | null;
  /** 최근 인증 시도 타임스탬프(ms) — 레이트리밋용 슬라이딩 윈도우 */
  authAttempts: number[];
}

const MAX_PLAYERS = 4;
/** 방 코드 문자 집합 — 혼동 문자는 제외 (O/0, I/1) */
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LEN = 6;
/** 인증 레이트리밋: AUTH_WINDOW_MS 창에서 연결당 최대 AUTH_MAX_ATTEMPTS회 */
const AUTH_WINDOW_MS = 60_000;
const AUTH_MAX_ATTEMPTS = 12;

export class RoomManager {
  private rooms = new Map<string, Room>();

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
  ) {}

  // ─────────────────────────── 연결 수립 ───────────────────────────

  /** 새 WebSocket 연결 — 이후 모든 메시지를 이 핸들러가 라우팅한다 */
  handleConnection(ws: WebSocket): void {
    const conn: Conn = {
      id: randomUUID(),
      ws,
      user: null,
      sessionToken: null,
      room: null,
      agent: null,
      spectating: null,
      authAttempts: [],
    };

    ws.on("message", (data) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(data.toString()) as ClientMessage;
      } catch {
        return; // 잘못된 프레임 무시
      }
      try {
        this.route(conn, msg);
      } catch (err) {
        console.error("Message handling error:", err);
        this.send(conn.ws, { type: "error", code: "INTERNAL", message: "서버 오류가 발생했습니다" });
      }
    });

    ws.on("close", () => this.handleClose(conn));
    ws.on("error", () => {
      /* close가 뒤따른다 */
    });
  }

  private handleClose(conn: Conn): void {
    this.stopSpectating(conn);
    const room = conn.room;
    if (room === null || conn.agent === null) return;
    // 재접속으로 이미 새 소켓이 붙었으면 이 close는 오래된 소켓 → 무시
    if (!conn.agent.isSocket(conn.ws)) return;
    if (room.phase === "waiting") {
      this.leaveWaiting(room, conn.agent);
    }
    // 게임 중이면 유지 — 같은 계정으로 joinRoom하면 재접속된다
    conn.room = null;
    conn.agent = null;
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
        if (typeof msg.username !== "string" || typeof msg.password !== "string") {
          return this.fail(conn, "BAD_REQUEST", "잘못된 요청입니다");
        }
        if (this.rateLimited(conn)) return;
        // 가입 게이트: 코드가 설정돼 있으면 일치해야만 가입 허용
        if (this.signupCode !== "" && msg.signupCode !== this.signupCode) {
          return this.fail(conn, "SIGNUP_CODE_REQUIRED", "가입 코드가 필요합니다");
        }
        const { username, password, adminCode } = msg;
        void this.doAuth(conn, "REGISTER_FAILED", () => db.register(username.trim(), password, adminCode));
        return;
      }
      case "login": {
        const db = this.db;
        if (db === undefined) return this.fail(conn, "NO_DB", "서버에 계정 저장소가 없습니다");
        if (typeof msg.username !== "string" || typeof msg.password !== "string") {
          return this.fail(conn, "BAD_REQUEST", "잘못된 요청입니다");
        }
        if (this.rateLimited(conn)) return;
        const { username, password } = msg;
        void this.doAuth(conn, "LOGIN_FAILED", () => db.login(username.trim(), password));
        return;
      }
      case "tokenLogin": {
        if (typeof msg.sessionToken !== "string") {
          return this.fail(conn, "TOKEN_INVALID", "세션이 만료되었습니다");
        }
        const user = this.db?.loginByToken(msg.sessionToken) ?? null;
        if (user === null) return this.fail(conn, "TOKEN_INVALID", "세션이 만료되었습니다");
        this.applyAuth(conn, user, msg.sessionToken);
        return;
      }
      case "logout": {
        if (conn.sessionToken !== null) this.db?.logout(conn.sessionToken);
        // 방·관전 상태도 정리한다 — 안 그러면 좌석/방장이 유령으로 남아
        // 대기실이 소프트락된다 (인증 게이트에 걸려 leaveRoom도 못 보냄).
        if (conn.room !== null && conn.agent !== null && conn.room.phase === "waiting") {
          this.leaveWaiting(conn.room, conn.agent);
        }
        this.stopSpectating(conn);
        conn.room = null;
        conn.agent = null;
        conn.user = null;
        conn.sessionToken = null;
        return;
      }
      default:
        break;
    }

    // ── 이하 전부 로그인 필요 ──
    const user = conn.user;
    if (user === null) {
      return this.fail(conn, "AUTH_REQUIRED", "로그인이 필요합니다");
    }

    switch (msg.type) {
      case "createRoom":
        return this.createRoom(conn, user);
      case "joinRoom":
        return this.joinRoom(conn, user, msg.code);
      case "leaveRoom": {
        const room = conn.room;
        if (room !== null && conn.agent !== null) {
          if (room.phase === "waiting") this.leaveWaiting(room, conn.agent);
          // 게임 중 나가기 = 포기: 좌석은 봇처럼 자동 진행되어 게임이 완주된다
          else conn.agent.abandon();
        }
        conn.room = null;
        conn.agent = null;
        return;
      }
      // ── 대기실 ──
      case "ready":
      case "addBot":
      case "removeBot":
      case "startGame": {
        if (conn.room === null || conn.agent === null) return;
        this.handleLobbyMessage(conn.room, conn.agent, msg);
        return;
      }
      // ── 게임 액션 · 결과 화면 닫기 ──
      case "action":
      case "draftPick":
      case "roundContinue": {
        conn.agent?.handleMessage(msg);
        return;
      }
      // ── 게임 무효(중단) 투표 ──
      case "voteAbort":
        return this.handleVoteAbort(conn, msg.vote);
      // ── 통계·리플레이 ──
      case "statsRequest":
        return this.sendCareerStats(conn);
      case "replayList":
        return this.sendReplayList(conn, user);
      case "replayGet": {
        if (!Number.isInteger(msg.gameId)) {
          return this.fail(conn, "BAD_REQUEST", "잘못된 게임 ID입니다");
        }
        // 떠 있는(floating) Promise의 거부가 프로세스를 죽이지 않도록 반드시 잡는다
        void this.sendReplayData(conn, user, msg.gameId).catch((err: unknown) => {
          console.error("replayGet error:", err);
          this.fail(conn, "INTERNAL", "리플레이 조회 중 오류가 발생했습니다");
        });
        return;
      }
      // ── 관리자 관전 ──
      case "liveGames": {
        if (!user.isAdmin) return this.fail(conn, "FORBIDDEN", "관리자 전용입니다");
        this.send(conn.ws, {
          type: "liveGames",
          rooms: [...this.rooms.values()]
            .filter((r) => r.phase === "playing")
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
      const r = await run();
      if (!r.ok || r.user === undefined || r.sessionToken === undefined) {
        return this.fail(conn, failCode, r.error ?? "인증 실패");
      }
      this.applyAuth(conn, r.user, r.sessionToken);
    } catch (err) {
      console.error("auth error:", err);
      this.fail(conn, "INTERNAL", "인증 처리 중 오류가 발생했습니다");
    }
  }

  /**
   * 연결당 인증 시도 레이트리밋. 창(AUTH_WINDOW_MS) 내 시도가 한도를 넘으면
   * true를 반환하고 RATE_LIMITED로 거부한다. 비동기 scrypt가 이벤트 루프를
   * 막지는 않지만, 한 연결이 CPU(스레드풀)를 독점하지 못하게 한다.
   */
  private rateLimited(conn: Conn): boolean {
    const now = Date.now();
    conn.authAttempts = conn.authAttempts.filter((t) => now - t < AUTH_WINDOW_MS);
    if (conn.authAttempts.length >= AUTH_MAX_ATTEMPTS) {
      this.fail(conn, "RATE_LIMITED", "인증 시도가 너무 많습니다. 잠시 후 다시 시도하세요");
      return true;
    }
    conn.authAttempts.push(now);
    return false;
  }

  private applyAuth(conn: Conn, user: UserRow, sessionToken: string): void {
    conn.user = user;
    conn.sessionToken = sessionToken;
    this.send(conn.ws, {
      type: "authOk",
      username: user.username,
      isAdmin: user.isAdmin,
      sessionToken,
    });
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

  /** 포기하지 않은 현역 사람 좌석인지 (username 일치). 포기한 좌석은 봇 취급. */
  private isActiveHuman(agent: PlayerAgent, username: string): boolean {
    return agent instanceof HumanAgent && !agent.isAbandoned && agent.nickname === username;
  }

  private createRoom(conn: Conn, user: UserRow): void {
    const existing = this.membershipOf(user.username);
    if (existing !== null && existing.phase === "playing") {
      return this.fail(conn, "ALREADY_IN_GAME", `진행 중인 게임(${existing.code})이 있습니다 — 코드로 재접속하세요`);
    }
    if (existing !== null) {
      return this.fail(conn, "ALREADY_IN_ROOM", `이미 방(${existing.code})에 참가 중입니다`);
    }
    const code = this.generateCode();
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
    };
    this.rooms.set(code, room);
    this.send(conn.ws, { type: "roomCreated", code });
    this.seat(conn, user, room);
  }

  private joinRoom(conn: Conn, user: UserRow, rawCode: string): void {
    if (typeof rawCode !== "string") {
      return this.fail(conn, "ROOM_NOT_FOUND", "존재하지 않는 방 코드입니다");
    }
    const code = rawCode.trim().toUpperCase();
    const room = this.rooms.get(code);
    if (room === undefined) {
      return this.fail(conn, "ROOM_NOT_FOUND", "존재하지 않는 방 코드입니다");
    }

    // 게임 중 — 같은 계정이면 신원 기준 재접속 (포기한 좌석은 재접속 불가)
    if (room.phase === "playing") {
      const mine = room.agents.find(
        (a): a is HumanAgent =>
          a instanceof HumanAgent && !a.isAbandoned && a.nickname === user.username,
      );
      if (mine === undefined) {
        return this.fail(conn, "ROOM_PLAYING", "이미 게임이 시작된 방입니다");
      }
      mine.reconnect(conn.ws);
      conn.room = room;
      conn.agent = mine;
      this.send(conn.ws, { type: "joined", playerId: mine.id, roomId: code, token: "" });
      return;
    }

    // 대기실 — 중복 참가·정원 확인
    if (room.agents.some((a) => this.isActiveHuman(a, user.username))) {
      return this.fail(conn, "DUPLICATE_JOIN", "이미 이 방에 참가 중입니다 (다른 탭 확인)");
    }
    const other = this.membershipOf(user.username);
    if (other !== null) {
      return this.fail(conn, "ALREADY_IN_ROOM", `이미 다른 방(${other.code})에 참가 중입니다`);
    }
    if (room.agents.length >= MAX_PLAYERS) {
      return this.fail(conn, "ROOM_FULL", "방이 가득 찼습니다");
    }
    this.seat(conn, user, room);
  }

  /** 대기실 자리 배정 + joined/lobby 전송 */
  private seat(conn: Conn, user: UserRow, room: Room): void {
    const playerId = this.freeSlot(room);
    if (playerId === null) {
      return this.fail(conn, "ROOM_FULL", "방이 가득 찼습니다");
    }
    const agent = new HumanAgent(playerId, user.username, conn.ws);
    room.agents.push(agent);
    if (room.hostId === null) room.hostId = playerId;
    conn.room = room;
    conn.agent = agent;
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
      this.rooms.delete(room.code);
      return;
    }
    this.broadcastLobby(room);
  }

  /**
   * 봇 채우기 (디버깅/테스트용) — 4명을 맞추고 **즉시** 게임을 시작한다.
   */
  async fillWithBots(code: string): Promise<void> {
    const room = this.rooms.get(code);
    if (!room || room.phase === "playing") return;
    this.addBots(room, MAX_PLAYERS - room.agents.length);
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
      room.agents.push(new BotAgent(id, `Bot_${id}`));
    }
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
          this.broadcastLobby(room);
        }
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
    const players: LobbyPlayerEntry[] = room.agents.map((a) => {
      const isBot = this.isBot(a);
      const isHost = a.id === room.hostId;
      const career = !isBot && this.statsStore ? this.statsStore.get(a.nickname) : null;
      return {
        playerId: a.id,
        nickname: a.nickname,
        isBot,
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
          players,
        });
      }
    }
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
    this.send(conn.ws, { type: "stats", career });
  }

  private sendReplayList(conn: Conn, user: UserRow): void {
    const rows = this.db?.listGamesFor(user.id) ?? [];
    const games: ReplayGameSummary[] = rows.map((g) => ({
      gameId: g.gameId,
      code: g.code,
      endedAt: g.endedAt,
      players: g.players,
    }));
    this.send(conn.ws, { type: "replayList", games });
  }

  private async sendReplayData(conn: Conn, user: UserRow, gameId: number): Promise<void> {
    const game = this.db?.getGame(gameId) ?? null;
    if (game === null) {
      return this.fail(conn, "REPLAY_NOT_FOUND", "리플레이를 찾을 수 없습니다");
    }
    if (!user.isAdmin && !game.participantUserIds.includes(user.id)) {
      return this.fail(conn, "FORBIDDEN", "본인이 참가한 게임만 볼 수 있습니다");
    }
    let text: string;
    try {
      text = await readFile(game.replayPath, "utf-8");
    } catch {
      return this.fail(conn, "REPLAY_FILE_MISSING", "리플레이 파일이 유실되었습니다");
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

    // 아직 게임에 남아 있는 사람들 (이탈 좌석은 봇처럼 자동 동의로 친다)
    const humans = room.agents.filter(
      (a): a is HumanAgent => a instanceof HumanAgent && !a.isAbandoned,
    );
    const needed = humans.length;
    if (needed === 0) return; // 사람이 없으면 봇 게임이 알아서 완주한다

    if (vote === "reject") room.abortVotes.clear(); // 거부 = 투표 전체 취소 (만장일치 불가)
    else if (vote === "agree") room.abortVotes.add(conn.agent.id);
    else room.abortVotes.delete(conn.agent.id); // withdraw = 내 동의 철회
    // 떠난 사람의 표는 무효 처리 (남은 사람 표만 센다)
    const voters = [...room.abortVotes].filter((id) => humans.some((h) => h.id === id));
    room.abortVotes = new Set(voters);

    const status: ServerMessage = {
      type: "abortVote",
      votes: voters.length,
      needed,
      voters,
    };
    for (const h of humans) h.notify(status);

    // 사람 전원 동의 → 무효 종료 (onGameAborted가 정리한다)
    if (voters.length >= needed) room.controller?.requestAbort();
  }

  // ─────────────────────────── 게임 시작·진행 ───────────────────────────

  private async startGame(room: Room): Promise<void> {
    if (room.phase === "playing") return;
    room.phase = "playing";
    room.startedAt = new Date().toISOString();

    const writer = new ReplayWriter(this.replayDir, room.code);
    await writer.open();
    room.writer = writer;

    const playerIds = room.agents.map((a) => a.id);
    const tracker = new StatsTracker(playerIds);

    room.controller = new HanchanController(room.agents, {
      extraAugments: contentAugments,
      interRoundDelayMs: this.interRoundDelayMs,
      // 매 게임 새 시드 — 안 넣으면 프로세스 내 모든 게임이 같은 시드를 써서
      // 배패·증강 선택지가 매번 똑같이 반복된다("증강이 초기화 안 됨"의 원인).
      seed: randomInt(0x1_0000_0000),
    }, {
      onEvent: (eventJson: string) => {
        writer.write(eventJson);
        try {
          tracker.consume(JSON.parse(eventJson) as { type: string; payload?: unknown });
        } catch {
          // 통계 집계 실패는 게임 진행을 막지 않는다
        }
      },
      onGameOver: (rankings: RankingEntry[]) => {
        const msg: ServerMessage = { type: "gameOver", rankings };
        for (const agent of room.agents) {
          if (agent instanceof HumanAgent) agent.notify(msg);
        }
        writer.close();
        this.recordGame(room, rankings);
        void this.finishStats(room, tracker, rankings).catch((err: unknown) => {
          console.error("finishStats error:", err);
        });
        this.endSpectating(room, "게임이 종료되었습니다", msg);
        this.rooms.delete(room.code);
      },
      onGameAborted: () => {
        // 전원 합의 무효 — 정산·기록·통계 없이 즉시 정리하고 홈으로 돌린다
        const msg: ServerMessage = {
          type: "gameAborted",
          reason: "전원 합의로 게임이 무효 처리되었습니다",
        };
        for (const agent of room.agents) {
          if (agent instanceof HumanAgent) agent.notify(msg);
        }
        writer.close();
        this.endSpectating(room, "게임이 무효 처리되었습니다", msg);
        this.rooms.delete(room.code);
      },
    });

    // 백그라운드로 실행 (프롬프트 대기는 각 HumanAgent가 소켓으로 처리)
    room.controller.run().catch((err: unknown) => {
      console.error("Game crashed:", err);
      writer.close();
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
      this.rooms.delete(room.code);
    });
  }

  /** 게임 결과를 SQLite 인덱스에 기록 (내 리플레이 목록의 근거) */
  private recordGame(room: Room, rankings: RankingEntry[]): void {
    if (this.db === undefined || room.writer === null) return;
    try {
      this.db.recordGame({
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
    if (this.statsStore) {
      const humanEntries: { nickname: string; raw: PlayerStatsRaw }[] = [];
      for (const a of room.agents) {
        if (this.isBot(a)) continue;
        const raw = snapshot.get(a.id);
        if (raw !== undefined) humanEntries.push({ nickname: a.nickname, raw });
      }
      if (humanEntries.length > 0) await this.statsStore.record(humanEntries);
    }

    // 갱신된 누적 통계 (사람만)
    const career: StatsEntry[] = [];
    if (this.statsStore) {
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
    if (ws.readyState === 1 /* OPEN */) {
      ws.send(JSON.stringify(msg));
    }
  }
}
