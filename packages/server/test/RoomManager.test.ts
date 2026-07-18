/**
 * RoomManager 통합 테스트 — 인증 → 방코드 → 게임 → 기록 → 관전 (15차 API).
 *
 * FakeSocket으로 실제 네트워크 없이 서버 경로 전체를 검증한다.
 * DB는 node:sqlite 인메모리(:memory:), 리플레이·통계는 임시 디렉터리.
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WebSocket } from "ws";
import { RoomManager } from "../src/RoomManager.js";
import { StatsStore } from "../src/StatsStore.js";
import { SiteDb } from "../src/SiteDb.js";

class FakeSocket {
  readyState = 1; // OPEN
  sent: any[] = [];
  autoRespond = false;
  private handlers: Record<string, ((...a: any[]) => void)[]> = {};
  private waiters: { pred: (m: any) => boolean; resolve: () => void; timer: ReturnType<typeof setTimeout> }[] = [];

  send(data: string): void {
    const msg = JSON.parse(data);
    this.sent.push(msg);
    this.waiters = this.waiters.filter((w) => {
      if (w.pred(msg)) {
        clearTimeout(w.timer);
        w.resolve();
        return false;
      }
      return true;
    });
    if (this.autoRespond) this.respond(msg);
  }

  on(event: string, cb: (...a: any[]) => void): void {
    (this.handlers[event] ??= []).push(cb);
  }

  close(): void {
    this.readyState = 3;
    this.emit("close");
  }

  clientSend(msg: unknown): void {
    this.emit("message", Buffer.from(JSON.stringify(msg)));
  }

  last(type: string): any {
    return [...this.sent].reverse().find((m) => m.type === type);
  }

  waitFor(pred: (m: any) => boolean, timeoutMs = 30_000): Promise<void> {
    if (this.sent.some(pred)) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("waitFor timeout")), timeoutMs);
      this.waiters.push({ pred, resolve, timer });
    });
  }

  private respond(msg: any): void {
    if (msg.type === "prompt") {
      const opts = msg.prompt.options as any[];
      const pick =
        opts.find((o) => o.type === "win") ??
        opts.find((o) => o.type === "pass") ??
        opts.find((o) => o.type === "discard") ??
        opts[0];
      setTimeout(
        () => this.clientSend({ type: "action", actionType: pick.type, payload: pick.payload }),
        0,
      );
    } else if (msg.type === "draftOffer") {
      const id = msg.choices[0].id;
      setTimeout(() => this.clientSend({ type: "draftPick", stage: msg.stage, augmentId: id }), 0);
    } else if (msg.type === "roundOver") {
      // 결과 화면을 즉시 "닫아" 다음 국으로 넘어갈 준비 신호를 보낸다
      setTimeout(() => this.clientSend({ type: "roundContinue" }), 0);
    }
  }

  private emit(event: string, ...args: any[]): void {
    for (const cb of this.handlers[event] ?? []) cb(...args);
  }

  asWs(): WebSocket {
    return this as unknown as WebSocket;
  }
}

const dirs: string[] = [];
const dbs: SiteDb[] = [];

interface Harness {
  rm: RoomManager;
  db: SiteDb;
  store: StatsStore;
}

async function newHarness(interRoundDelayMs = 0, signupCode = ""): Promise<Harness> {
  const replayDir = await mkdtemp(join(tmpdir(), "majak-test-"));
  dirs.push(replayDir);
  const store = new StatsStore(join(replayDir, "stats.json"));
  await store.load();
  const db = new SiteDb(":memory:");
  dbs.push(db);
  return { rm: new RoomManager(replayDir, store, interRoundDelayMs, db, signupCode), db, store };
}

/**
 * 연결 + 회원가입까지 한 번에.
 * scrypt가 비동기라 authOk(또는 error)가 도착할 때까지 기다린 뒤 반환한다.
 */
async function connectAndRegister(
  h: Harness,
  username: string,
  opts: { adminCode?: string; autoRespond?: boolean } = {},
): Promise<FakeSocket> {
  const sock = new FakeSocket();
  sock.autoRespond = opts.autoRespond ?? false;
  h.rm.handleConnection(sock.asWs());
  sock.clientSend({
    type: "register",
    username,
    password: "pw1234",
    ...(opts.adminCode !== undefined ? { adminCode: opts.adminCode } : {}),
  });
  await sock.waitFor((m) => m.type === "authOk" || m.type === "error");
  return sock;
}

/** 새 연결로 로그인해 authOk(또는 error)까지 기다린다. */
async function connectAndLogin(h: Harness, username: string, password: string): Promise<FakeSocket> {
  const sock = new FakeSocket();
  h.rm.handleConnection(sock.asWs());
  sock.clientSend({ type: "login", username, password });
  await sock.waitFor((m) => m.type === "authOk" || m.type === "error");
  return sock;
}

afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  for (const db of dbs.splice(0)) db.close();
});

describe("StatsStore — 프로토타입 오염 안전", () => {
  it("__proto__/toString/constructor 키에도 null을 반환한다", async () => {
    const dir = await mkdtemp(join(tmpdir(), "majak-ss-"));
    dirs.push(dir);
    const store = new StatsStore(join(dir, "s.json"));
    await store.load();
    for (const k of ["__proto__", "toString", "constructor", "valueOf", "hasOwnProperty"]) {
      expect(store.get(k), k).toBeNull();
    }
  });
});

describe("인증", () => {
  it("회원가입하면 authOk + 세션 토큰을 받는다", async () => {
    const h = await newHarness();
    const sock = await connectAndRegister(h, "Alice");
    const ok = sock.last("authOk");
    expect(ok).toBeDefined();
    expect(ok.username).toBe("Alice");
    expect(ok.isAdmin).toBe(false);
    expect(typeof ok.sessionToken).toBe("string");
  });

  it("중복 닉네임 가입은 거부된다", async () => {
    const h = await newHarness();
    await connectAndRegister(h, "Alice");
    const sock2 = await connectAndRegister(h, "Alice");
    expect(sock2.last("error")?.code).toBe("REGISTER_FAILED");
  });

  it("가입 게이트: 코드가 설정되면 올바른 코드로만 가입된다", async () => {
    const h = await newHarness(0, "letmein");

    // 코드 없이 가입 시도 → 거부
    const noCode = new FakeSocket();
    h.rm.handleConnection(noCode.asWs());
    noCode.clientSend({ type: "register", username: "Nobody", password: "pw1234" });
    await noCode.waitFor((m) => m.type === "authOk" || m.type === "error");
    expect(noCode.last("error")?.code).toBe("SIGNUP_CODE_REQUIRED");

    // 틀린 코드 → 거부
    const wrong = new FakeSocket();
    h.rm.handleConnection(wrong.asWs());
    wrong.clientSend({ type: "register", username: "Wrong", password: "pw1234", signupCode: "nope" });
    await wrong.waitFor((m) => m.type === "authOk" || m.type === "error");
    expect(wrong.last("error")?.code).toBe("SIGNUP_CODE_REQUIRED");

    // 올바른 코드 → 가입 성공
    const ok = new FakeSocket();
    h.rm.handleConnection(ok.asWs());
    ok.clientSend({ type: "register", username: "Invited", password: "pw1234", signupCode: "letmein" });
    await ok.waitFor((m) => m.type === "authOk" || m.type === "error");
    expect(ok.last("authOk")?.username).toBe("Invited");
  });

  it("가입 게이트가 꺼져 있으면(기본) 코드 없이 가입된다", async () => {
    const h = await newHarness(); // signupCode 기본 "" → 개방
    const sock = await connectAndRegister(h, "Open");
    expect(sock.last("authOk")?.username).toBe("Open");
  });

  it("예약·프로토타입 닉네임(__proto__/toString/Bot_x/admin)은 거부되고 크래시 없음", async () => {
    const h = await newHarness();
    for (const name of ["__proto__", "toString", "constructor", "Bot_p0", "admin"]) {
      const sock = await connectAndRegister(h, name);
      expect(sock.last("authOk"), name).toBeUndefined();
      expect(sock.last("error")?.code, name).toBe("REGISTER_FAILED");
    }
    // 정상 유저가 방을 만들어도 lobby 브로드캐스트가 던지지 않는다 (statsStore null-proto)
    const host = await connectAndRegister(h, "Alice");
    host.clientSend({ type: "createRoom" });
    expect(host.last("lobby")).toBeDefined();
  });

  it("틀린 비밀번호 로그인은 거부, 맞으면 성공", async () => {
    const h = await newHarness();
    await connectAndRegister(h, "Bob");
    const fail = await connectAndLogin(h, "Bob", "wrong");
    expect(fail.last("error")?.code).toBe("LOGIN_FAILED");
    const ok = await connectAndLogin(h, "Bob", "pw1234");
    expect(ok.last("authOk")?.username).toBe("Bob");
  });

  it("세션 토큰으로 자동 로그인된다", async () => {
    const h = await newHarness();
    const first = await connectAndRegister(h, "Carol");
    const token = first.last("authOk").sessionToken;
    const sock = new FakeSocket();
    h.rm.handleConnection(sock.asWs());
    sock.clientSend({ type: "tokenLogin", sessionToken: token });
    await sock.waitFor((m) => m.type === "authOk");
    expect(sock.last("authOk")?.username).toBe("Carol");
  });

  it("관리자 코드로 가입하면 isAdmin=true", async () => {
    const h = await newHarness();
    const sock = await connectAndRegister(h, "Boss", { adminCode: h.db.adminCode() });
    expect(sock.last("authOk")?.isAdmin).toBe(true);
  });

  it("인증 시도가 너무 많으면 RATE_LIMITED로 거부된다", async () => {
    const h = await newHarness();
    const sock = new FakeSocket();
    h.rm.handleConnection(sock.asWs());
    // 존재하지 않는 계정 로그인은 scrypt 없이 즉시 실패 — 레이트리밋만 검증
    let limited = false;
    for (let i = 0; i < 20; i++) {
      sock.sent.length = 0;
      sock.clientSend({ type: "login", username: "ghost", password: "x" });
      await sock.waitFor((m) => m.type === "error");
      if (sock.last("error")?.code === "RATE_LIMITED") {
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
  });

  it("로그인 없이 방을 만들 수 없다", async () => {
    const h = await newHarness();
    const sock = new FakeSocket();
    h.rm.handleConnection(sock.asWs());
    sock.clientSend({ type: "createRoom" });
    expect(sock.last("error")?.code).toBe("AUTH_REQUIRED");
  });
});

describe("세션 만료", () => {
  it("TTL이 지난 세션 토큰은 tokenLogin에서 거부된다", async () => {
    const db = new SiteDb(":memory:", 40); // 40ms TTL
    dbs.push(db);
    const r = await db.register("Eph", "pw1234");
    const token = r.sessionToken!;
    expect(db.loginByToken(token)?.username).toBe("Eph"); // 갓 발급 → 유효
    await new Promise((res) => setTimeout(res, 60));
    expect(db.loginByToken(token)).toBeNull(); // 만료 → 무효
  });

  it("만료된 토큰으로는 서버 tokenLogin이 실패한다", async () => {
    const replayDir = await mkdtemp(join(tmpdir(), "majak-test-"));
    dirs.push(replayDir);
    const store = new StatsStore(join(replayDir, "stats.json"));
    await store.load();
    const db = new SiteDb(":memory:", 30);
    dbs.push(db);
    const rm = new RoomManager(replayDir, store, 0, db);

    const first = new FakeSocket();
    rm.handleConnection(first.asWs());
    first.clientSend({ type: "register", username: "Eph2", password: "pw1234" });
    await first.waitFor((m) => m.type === "authOk");
    const token = first.last("authOk").sessionToken;

    await new Promise((res) => setTimeout(res, 50));
    const back = new FakeSocket();
    rm.handleConnection(back.asWs());
    back.clientSend({ type: "tokenLogin", sessionToken: token });
    expect(back.last("error")?.code).toBe("TOKEN_INVALID");
  });
});

describe("방 생성·참가 (코드)", () => {
  it("방을 만들면 6자 코드가 발급되고 방장으로 입장한다", async () => {
    const h = await newHarness();
    const sock = await connectAndRegister(h, "Host");
    sock.clientSend({ type: "createRoom" });
    const created = sock.last("roomCreated");
    expect(created.code).toMatch(/^[A-Z2-9]{6}$/);
    const lobby = sock.last("lobby");
    expect(lobby.hostId).toBe("p0");
    expect(lobby.players[0].isHost).toBe(true);
    expect(lobby.roomId).toBe(created.code);
  });

  it("코드로 참가할 수 있고, 틀린 코드는 거부된다", async () => {
    const h = await newHarness();
    const host = await connectAndRegister(h, "Host");
    host.clientSend({ type: "createRoom" });
    const code = host.last("roomCreated").code;

    const guest = await connectAndRegister(h, "Guest");
    guest.clientSend({ type: "joinRoom", code: "ZZZZZZ" });
    expect(guest.last("error")?.code).toBe("ROOM_NOT_FOUND");

    guest.clientSend({ type: "joinRoom", code });
    expect(guest.last("joined")?.roomId).toBe(code);
    const lobby = guest.last("lobby");
    expect(lobby.players).toHaveLength(2);
  });

  it("소문자 코드도 허용된다 (대문자 정규화)", async () => {
    const h = await newHarness();
    const host = await connectAndRegister(h, "Host");
    host.clientSend({ type: "createRoom" });
    const code = host.last("roomCreated").code as string;
    const guest = await connectAndRegister(h, "Guest");
    guest.clientSend({ type: "joinRoom", code: code.toLowerCase() });
    expect(guest.last("joined")?.roomId).toBe(code);
  });

  it("같은 계정의 중복 참가는 거부된다", async () => {
    const h = await newHarness();
    const host = await connectAndRegister(h, "Host");
    host.clientSend({ type: "createRoom" });
    const code = host.last("roomCreated").code;
    const dup = await connectAndLogin(h, "Host", "pw1234");
    dup.clientSend({ type: "joinRoom", code });
    expect(dup.last("error")?.code).toBe("DUPLICATE_JOIN");
  });

  it("대기실에서 나가면(소켓 close) 자리가 비고, 방장이 나가면 승계된다", async () => {
    const h = await newHarness();
    const host = await connectAndRegister(h, "Host");
    host.clientSend({ type: "createRoom" });
    const code = host.last("roomCreated").code;
    const guest = await connectAndRegister(h, "Guest");
    guest.clientSend({ type: "joinRoom", code });

    host.close(); // 방장 이탈 → Guest 승계
    const lobby = guest.last("lobby");
    expect(lobby.hostId).toBe("p1");
    expect(lobby.players).toHaveLength(1);
    expect(lobby.players[0].isHost).toBe(true);
  });
});

describe("게임 완주·기록", () => {
  it(
    "사람 1 + 봇 3 반장전 완주 → gameOver·통계·리플레이 목록·리플레이 데이터",
    async () => {
      const h = await newHarness();
      const sock = await connectAndRegister(h, "Human", { autoRespond: true });
      sock.clientSend({ type: "createRoom" });
      const code = sock.last("roomCreated").code;
      for (let i = 0; i < 3; i++) sock.clientSend({ type: "addBot" });
      sock.clientSend({ type: "startGame" });

      await sock.waitFor((m) => m.type === "gameOver");
      const over = sock.last("gameOver");
      expect(over.rankings).toHaveLength(4);
      // 순위 1~4가 정확히 한 번씩 + 점수 공식 일관성.
      // (뱅크식 보너스 증강이 발동하면 총점이 100000에서 벗어나므로
      //  제로섬은 더 이상 불변식이 아니다 — content util.ts 참고)
      const ranks = over.rankings.map((r: any) => r.rank).sort();
      expect(ranks).toEqual([1, 2, 3, 4]);
      for (const r of over.rankings as any[]) {
        expect(r.score).toBe(r.rawScore - 30000 + r.uma * 1000 + r.oka * 1000);
      }

      await sock.waitFor((m) => m.type === "stats");

      // 리플레이 목록 (DB 기록)
      sock.clientSend({ type: "replayList" });
      await sock.waitFor((m) => m.type === "replayList");
      const list = sock.last("replayList");
      expect(list.games).toHaveLength(1);
      expect(list.games[0].code).toBe(code);
      expect(list.games[0].players).toHaveLength(4);

      // 리플레이 데이터 (JSONL 라인)
      sock.clientSend({ type: "replayGet", gameId: list.games[0].gameId });
      await sock.waitFor((m) => m.type === "replayData");
      const data = sock.last("replayData");
      expect(data.lines.length).toBeGreaterThan(100);
      expect(JSON.parse(data.lines[0]).type).toBe("__init__");
    },
    40_000,
  );

  it(
    "국 사이 대기(interRoundDelayMs>0)에서 결과 화면을 닫으면(roundContinue) 즉시 다음 국으로 진행한다",
    async () => {
      // 대기 상한을 아주 크게(30초) 둔다. ack(roundContinue)로만 넘어갈 수 있으므로,
      // 상한 안에 완주한다면 결과 화면 닫기 신호가 다음 국을 앞당긴 것이다.
      // (autoRespond FakeSocket이 roundOver마다 roundContinue를 보낸다)
      const h = await newHarness(30_000);
      const sock = await connectAndRegister(h, "Human", { autoRespond: true });
      sock.clientSend({ type: "createRoom" });
      await sock.waitFor((m) => m.type === "roomCreated");
      for (let i = 0; i < 3; i++) sock.clientSend({ type: "addBot" });
      sock.clientSend({ type: "startGame" });

      // ack가 없으면 국마다 30초를 기다려 20초 안에 못 끝난다 → ack 배선 검증
      await sock.waitFor((m) => m.type === "gameOver", 20_000);
      expect(sock.last("gameOver").rankings).toHaveLength(4);
      await sock.waitFor((m) => m.type === "stats", 20_000);
    },
    25_000,
  );

  it(
    "게임 중 무효 투표에 사람 전원이 동의하면 게임이 무효 처리된다 (봇 자동 동의)",
    async () => {
      const h = await newHarness();
      const sock = await connectAndRegister(h, "Voter", { autoRespond: true });
      sock.clientSend({ type: "createRoom" });
      await sock.waitFor((m) => m.type === "roomCreated");
      for (let i = 0; i < 3; i++) sock.clientSend({ type: "addBot" });
      sock.clientSend({ type: "startGame" });
      await sock.waitFor((m) => m.type === "view"); // 게임 시작

      // 사람 1명뿐이므로 한 표로 전원 동의 → 무효 종료
      sock.clientSend({ type: "voteAbort", vote: "agree" });

      await sock.waitFor((m) => m.type === "gameAborted", 10_000);
      const aborted = sock.last("gameAborted");
      expect(aborted).toBeDefined();
      // 무효 투표 현황도 전달된다 (1/1)
      const vote = sock.last("abortVote");
      expect(vote?.votes).toBe(1);
      expect(vote?.needed).toBe(1);
      // 무효 게임은 gameOver·기록이 나오지 않는다
      expect(sock.last("gameOver")).toBeUndefined();
    },
    15_000,
  );

  it(
    "게임 중 방 나가기(포기)하면 봇 자동진행으로 게임이 완주된다",
    async () => {
      const h = await newHarness();
      // autoRespond 없음 — 사람이 프롬프트에 응답하지 않아도 완주해야 한다
      const sock = await connectAndRegister(h, "Quitter");
      sock.clientSend({ type: "createRoom" });
      await sock.waitFor((m) => m.type === "roomCreated");
      for (let i = 0; i < 3; i++) sock.clientSend({ type: "addBot" });
      sock.clientSend({ type: "startGame" });
      await sock.waitFor((m) => m.type === "view");

      sock.clientSend({ type: "leaveRoom" }); // 게임 중 포기

      // 포기한 좌석은 봇처럼 자동 진행 → 30초 타임아웃 없이 게임이 끝난다
      await sock.waitFor((m) => m.type === "gameOver", 40_000);
      const over = sock.last("gameOver");
      expect(over.rankings).toHaveLength(4);
      // 통계 영속화까지 기다린다 (임시 디렉터리 정리 레이스 방지)
      await sock.waitFor((m) => m.type === "stats", 40_000);
    },
    40_000,
  );

  it(
    "게임 중 끊겨도 같은 계정으로 joinRoom하면 재접속된다",
    async () => {
      const h = await newHarness();
      const sock = await connectAndRegister(h, "Human", { autoRespond: true });
      const token = sock.last("authOk").sessionToken;
      sock.clientSend({ type: "createRoom" });
      const code = sock.last("roomCreated").code;
      for (let i = 0; i < 3; i++) sock.clientSend({ type: "addBot" });
      sock.clientSend({ type: "startGame" });
      await sock.waitFor((m) => m.type === "view");

      sock.close(); // 접속 끊김

      const sock2 = new FakeSocket();
      sock2.autoRespond = true;
      h.rm.handleConnection(sock2.asWs());
      sock2.clientSend({ type: "tokenLogin", sessionToken: token });
      sock2.clientSend({ type: "joinRoom", code });
      // 재접속 즉시 뷰가 복원되고 게임이 완주된다
      await sock2.waitFor((m) => m.type === "view");
      await sock2.waitFor((m) => m.type === "gameOver");
      // 통계 영속화까지 기다린다 (임시 디렉터리 정리 레이스 방지)
      await sock2.waitFor((m) => m.type === "stats");
    },
    40_000,
  );
});

describe("입력 검증·견고성", () => {
  // 회귀: replayGet의 gameId가 없거나 정수가 아니면 node:sqlite 바인딩이 던지고,
  // 떠 있는 Promise 거부가 되어 서버 프로세스 전체가 죽던 문제 (20차 이후 발견).
  it("잘못된 gameId의 replayGet은 서버를 죽이지 않고 BAD_REQUEST로 거부한다", async () => {
    const h = await newHarness();
    const sock = await connectAndRegister(h, "Alice");
    for (const bad of [undefined, "abc", 1.5, {}, [], null] as unknown[]) {
      sock.sent.length = 0;
      sock.clientSend(bad === undefined ? { type: "replayGet" } : { type: "replayGet", gameId: bad });
      expect(sock.last("error")?.code).toBe("BAD_REQUEST");
    }
    // 서버가 여전히 살아 있다 — 정상 메시지에 응답한다
    sock.clientSend({ type: "ping" });
    expect(sock.last("pong")).toBeDefined();
  });

  it("존재하지 않는 gameId는 REPLAY_NOT_FOUND (정수는 통과)", async () => {
    const h = await newHarness();
    const sock = await connectAndRegister(h, "Alice");
    sock.clientSend({ type: "replayGet", gameId: 999999 });
    expect(sock.last("error")?.code).toBe("REPLAY_NOT_FOUND");
  });

  it("필드가 빠진 인증 메시지는 크래시 없이 거부된다", async () => {
    const h = await newHarness();
    const sock = new FakeSocket();
    h.rm.handleConnection(sock.asWs());
    sock.clientSend({ type: "register" }); // username/password 없음
    expect(sock.last("error")?.code).toBe("BAD_REQUEST");
    sock.clientSend({ type: "login" });
    expect(sock.last("error")?.code).toBe("BAD_REQUEST");
    sock.clientSend({ type: "tokenLogin" }); // sessionToken 없음
    expect(sock.last("error")?.code).toBe("TOKEN_INVALID");
    // 서버가 여전히 살아 있다
    sock.clientSend({ type: "ping" });
    expect(sock.last("pong")).toBeDefined();
  });
});

describe("관리자 관전", () => {
  it(
    "관리자는 진행 중 게임 목록을 보고 관전자 시점 뷰를 스트림받는다 (일반 유저는 거부)",
    async () => {
      const h = await newHarness();
      const player = await connectAndRegister(h, "Human", { autoRespond: true });
      player.clientSend({ type: "createRoom" });
      const code = player.last("roomCreated").code;
      for (let i = 0; i < 3; i++) player.clientSend({ type: "addBot" });
      player.clientSend({ type: "startGame" });
      await player.waitFor((m) => m.type === "view");

      // 일반 유저 → 거부
      const pleb = await connectAndRegister(h, "Pleb");
      pleb.clientSend({ type: "liveGames" });
      expect(pleb.last("error")?.code).toBe("FORBIDDEN");
      pleb.clientSend({ type: "spectate", code });
      expect(pleb.last("error")?.code).toBe("FORBIDDEN");

      // 관리자 → 목록 + 관전
      const admin = await connectAndRegister(h, "Boss", { adminCode: h.db.adminCode() });
      admin.clientSend({ type: "liveGames" });
      const live = admin.last("liveGames");
      expect(live.rooms).toHaveLength(1);
      expect(live.rooms[0].code).toBe(code);

      admin.clientSend({ type: "spectate", code });
      await admin.waitFor((m) => m.type === "spectateStarted");
      await admin.waitFor((m) => m.type === "view");
      const view = admin.last("view");
      expect(view.view.playerId).toBe("__spectator");
      // 관전자는 모든 손패가 공개된다
      const hands = Object.values(view.view.zones).filter((z: any) => z.kind === "hand");
      expect(hands.every((z: any) => z.hiddenCount === 0)).toBe(true);

      // 게임 종료까지 관전 유지 → spectateEnded 수신
      await admin.waitFor((m) => m.type === "spectateEnded", 40_000);
      // 통계 영속화까지 기다린다 (임시 디렉터리 정리 레이스 방지)
      await player.waitFor((m) => m.type === "stats", 40_000);
    },
    60_000,
  );
});
