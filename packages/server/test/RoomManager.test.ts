/**
 * RoomManager 통합 테스트 — 인증 → 방코드 → 게임 → 기록 → 관전 (15차 API).
 *
 * FakeSocket으로 실제 네트워크 없이 서버 경로 전체를 검증한다.
 * DB는 node:sqlite 인메모리(:memory:), 리플레이·통계는 임시 디렉터리.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WebSocket } from "ws";
import { RoomManager } from "../src/RoomManager.js";
import { StatsStore } from "../src/StatsStore.js";
import { SiteDb } from "../src/SiteDb.js";
import { createEmptyStats } from "@majak/core/stats/PlayerStats.js";

/**
 * 사람 1 + 봇 3 반장전 **한 판이 실제로 끝나는 데** 주는 예산(ms).
 *
 * 계측(2026-08-08, 이 저장소 c391192):
 * - 유휴에 가까운 맥: 완주 13~17초.
 * - 같은 맥에서 다른 vitest가 함께 도는 동안(로드 애버리지 18 / 8코어): 31~45초.
 *
 * 예전 예산은 20초·30초였다 — 유휴 상태에서도 여유가 20%뿐이라 조금만 부하가
 * 붙으면 무작위로 터졌고, **어느 판이 터질지는 매번 달랐다**. 그게 "단독 실행인데도
 * RoomManager.test.ts가 1건씩 waitFor timeout으로 죽는다"의 정체다(docs/23 참고).
 *
 * 이 값은 "느려도 봐준다"가 아니라 **한 판의 실제 원가**다. 정말로 멈춘 판은
 * 여전히 이 예산 안에서 끝나지 못해 실패한다.
 */
const HANCHAN_MS = 90_000;

/** 테스트 자체의 상한 — 한 판 예산 + 정리·검증 여유. */
const HANCHAN_TEST_MS = HANCHAN_MS + 30_000;

/** 테스트용 빈 원시 통계 (필드 오버라이드로 시나리오 구성). */
function emptyRaw(): ReturnType<typeof createEmptyStats> {
  return createEmptyStats();
}

class FakeSocket {
  readyState = 1; // OPEN
  sent: any[] = [];
  autoRespond = false;
  /**
   * 이 타입의 메시지를 받는 **즉시(동기)** 소켓을 닫는다.
   * "결과 화면이 뜨자마자 창을 닫았다" 같은 순간을 레이스 없이 재현한다.
   */
  closeOnType: string | null = null;
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
    if (this.closeOnType !== null && msg.type === this.closeOnType) {
      this.closeOnType = null;
      this.close();
      return;
    }
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

  waitFor(pred: (m: any) => boolean, timeoutMs = HANCHAN_MS): Promise<void> {
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
const managers: RoomManager[] = [];

interface Harness {
  rm: RoomManager;
  db: SiteDb;
  store: StatsStore;
  /** 이 판의 리플레이가 떨어지는 디렉터리 — 고아 파일 검사에 쓴다 */
  replayDir: string;
}

async function newHarness(interRoundDelayMs = 0, signupCode = ""): Promise<Harness> {
  const replayDir = await mkdtemp(join(tmpdir(), "majak-test-"));
  dirs.push(replayDir);
  const store = new StatsStore(join(replayDir, "stats.json"));
  await store.load();
  const db = new SiteDb(":memory:");
  dbs.push(db);
  const manager = new RoomManager(replayDir, store, interRoundDelayMs, db, signupCode);
  managers.push(manager);
  return { rm: manager, db, store, replayDir };
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
    password: "pw123456",
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

/**
 * 테스트가 끝나면 그 테스트의 서버를 **반드시 끈다**.
 *
 * 예전에는 `RoomManager`를 만들어 놓고 아무도 끄지 않았다. 판 도중에 끝나는
 * 테스트(재접속·포기·무효 투표…)가 남긴 봇 반장전이 **같은 이벤트 루프 안에서**
 * 계속 돌아, 뒤이어 실행되는 테스트의 CPU를 절반씩 가져갔다. 봇 한 판이 원래
 * 10~20초짜리라, 20초 예산을 둔 `waitFor`들이 무작위로 굶어 터졌다 —
 * 이것이 "단독 실행인데도 매번 다른 테스트가 waitFor timeout으로 죽는" 정체다.
 * (계측: 죽은 테스트가 도는 동안 남의 진행 중 게임이 최대 1개 살아 있었다.)
 */
afterEach(async () => {
  for (const m of managers.splice(0)) {
    m.shutdown("테스트 정리");
    m.stop();
  }
  // 중단된 게임 루프가 마무리 콜백을 흘려보낼 틈을 준다 (임시 디렉터리 삭제 레이스 방지)
  await new Promise((r) => setTimeout(r, 0));
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
    noCode.clientSend({ type: "register", username: "Nobody", password: "pw123456" });
    await noCode.waitFor((m) => m.type === "authOk" || m.type === "error");
    expect(noCode.last("error")?.code).toBe("SIGNUP_CODE_REQUIRED");

    // 틀린 코드 → 거부
    const wrong = new FakeSocket();
    h.rm.handleConnection(wrong.asWs());
    wrong.clientSend({ type: "register", username: "Wrong", password: "pw123456", signupCode: "nope" });
    await wrong.waitFor((m) => m.type === "authOk" || m.type === "error");
    expect(wrong.last("error")?.code).toBe("SIGNUP_CODE_REQUIRED");

    // 올바른 코드 → 가입 성공
    const ok = new FakeSocket();
    h.rm.handleConnection(ok.asWs());
    ok.clientSend({ type: "register", username: "Invited", password: "pw123456", signupCode: "letmein" });
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
    const ok = await connectAndLogin(h, "Bob", "pw123456");
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
    // 존재하지 않는 계정 로그인도 동일한 scrypt 비용을 치른다(타이밍 균일화) — 레이트리밋만 검증
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
    const r = await db.register("Eph", "pw123456");
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
    first.clientSend({ type: "register", username: "Eph2", password: "pw123456" });
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

  it("같은 계정의 두 번째 연결은 새 자리가 아니라 **그 자리를 이어받는다**", async () => {
    /*
     * 예전에는 DUPLICATE_JOIN 으로 거절했다. 그 탓에 **폰에서 대기실에 앉아 있다가
     * 컴퓨터로 옮겨 앉는 것이 불가능했다**(2026-08-18 사용자 보고). 게임 중 경로는
     * 이미 이어받기로 동작하는데, 같은 의도가 대기 중이냐 진행 중이냐로 갈릴 이유가 없다.
     */
    const h = await newHarness();
    const host = await connectAndRegister(h, "Host");
    host.clientSend({ type: "createRoom" });
    const code = host.last("roomCreated").code;
    const seatId = host.last("joined")?.playerId;

    const dup = await connectAndLogin(h, "Host", "pw123456");
    dup.clientSend({ type: "joinRoom", code });

    expect(dup.last("error")).toBeUndefined();
    expect(dup.last("joined").playerId).toBe(seatId); // 원래 자리 그대로
    expect(dup.last("lobby").players).toHaveLength(1); // 자리가 늘어나지 않는다
  });

  it("봇 추가로 자리가 꽉 차도 자리는 그대로다 — 섞기는 '자리 섞기'를 눌렀을 때만", async () => {
    const h = await newHarness();
    const host = await connectAndRegister(h, "Host");
    host.clientSend({ type: "createRoom" });
    const code = host.last("roomCreated").code;
    const guest = await connectAndRegister(h, "Guest");
    guest.clientSend({ type: "joinRoom", code });

    const seatsOf = (): string =>
      (host.last("lobby").players as { playerId: string; seat: number }[])
        .map((p) => `${p.playerId}:${p.seat}`)
        .sort()
        .join(",");

    // 사람 둘이 앉은 상태의 자리 — 봇을 채워 방을 꽉 채워도 이대로 남아야 한다
    const before = seatsOf();
    host.clientSend({ type: "addBot" });
    host.clientSend({ type: "addBot" });
    const after = seatsOf();
    expect(after.startsWith(before)).toBe(true);
    expect(after).toBe("p0:0,p1:1,p2:2,p3:3");
  });

  it("봇 성향 지정 — 방장이 고른 원형이 대기실에 반영되고, 방장 아닌 사람은 못 바꾼다", async () => {
    const h = await newHarness();
    const host = await connectAndRegister(h, "Host");
    host.clientSend({ type: "createRoom" });
    const code = host.last("roomCreated").code;
    const guest = await connectAndRegister(h, "Guest");
    guest.clientSend({ type: "joinRoom", code });
    host.clientSend({ type: "addBot" });

    const botOf = (sock: FakeSocket): { playerId: string; archetype: string } =>
      (sock.last("lobby").players as any[]).find((p) => p.isBot);

    const bot = botOf(host);
    expect(bot.archetype).toBeTruthy(); // 지정 전에도 시드에서 뽑은 원형이 실려 온다

    host.clientSend({ type: "setBotArchetype", playerId: bot.playerId, archetype: "defender" });
    expect(botOf(host).archetype).toBe("defender");
    // 대기실 전원에게 같은 값이 간다
    expect(botOf(guest).archetype).toBe("defender");

    // 모르는 원형은 무시한다 (클라이언트가 보낸 값을 그대로 믿지 않는다)
    host.clientSend({ type: "setBotArchetype", playerId: bot.playerId, archetype: "godmode" });
    expect(botOf(host).archetype).toBe("defender");

    // 방장이 아니면 못 바꾼다
    guest.clientSend({ type: "setBotArchetype", playerId: bot.playerId, archetype: "attacker" });
    expect(botOf(host).archetype).toBe("defender");
  });

  /**
   * 봇 성향 겹침 회귀 가드.
   *
   * `rollTableProfiles`는 "이미 앉은 원형은 후보에서 뺀다"로 탁에 서로 다른 성향이
   * 앉도록 만들어져 있었지만, **판 시작(`seatBotProfiles`) 때만** 불렸다. 대기실은
   * `BotAgent` 생성자가 좌석 시드로 혼자 뽑은 원형을 보여 줬고, 봇은 한 명씩 추가되니
   * 서로를 몰라 겹쳤다 — 실제로 남=변덕형·서=균형형·북=변덕형이 관측됐다.
   *
   * 아래 세 테스트가 지키는 것: 봇 추가·성향 지정·자리 섞기·판 종료 후 재생성 어느
   * 경로로도 **대기실에 보이는 성향 셋이 서로 다르다.**
   */
  const lobbyArchetypes = (sock: FakeSocket): string[] =>
    (sock.last("lobby").players as { isBot: boolean; archetype: string | null }[])
      .filter((p) => p.isBot)
      .map((p) => p.archetype ?? "");

  it("봇을 하나씩 추가해도 성향이 겹치지 않는다 (자리 섞기·판 종료 뒤에도)", async () => {
    const h = await newHarness();
    // 방 코드가 시드라 방마다 결과가 다르다 — 한 방만 보면 우연히 통과할 수 있다
    for (let n = 0; n < 4; n++) {
      const host = await connectAndRegister(h, `Arch${n}`);
      host.clientSend({ type: "createRoom" });
      const code = host.last("roomCreated").code as string;
      for (let i = 0; i < 3; i++) host.clientSend({ type: "addBot" });

      const added = lobbyArchetypes(host);
      expect(added).toHaveLength(3);
      expect(new Set(added).size).toBe(3);

      // 자리 섞기 — 성향은 봇을 따라 움직인다
      host.clientSend({ type: "shuffleSeats" });
      expect(new Set(lobbyArchetypes(host)).size).toBe(3);

      // 판이 끝나 대기실로 돌아오는 경로 (봇을 새 인스턴스로 만든다)
      const rooms = (h.rm as unknown as { rooms: Map<string, { phase: string }> }).rooms;
      const room = rooms.get(code);
      expect(room).toBeDefined();
      if (room !== undefined) room.phase = "playing";
      (h.rm as unknown as { resetRoomAfterGame: (r: unknown) => void }).resetRoomAfterGame(room);
      const after = lobbyArchetypes(host);
      expect(after).toHaveLength(3);
      expect(new Set(after).size).toBe(3);
    }
  });

  it("봇 하나를 지웠다 다시 추가해도 성향이 겹치지 않는다", async () => {
    const h = await newHarness();
    const host = await connectAndRegister(h, "ArchRemove");
    host.clientSend({ type: "createRoom" });
    for (let i = 0; i < 3; i++) host.clientSend({ type: "addBot" });

    const victim = (host.last("lobby").players as any[]).find((p) => p.isBot).playerId;
    host.clientSend({ type: "removeBot", playerId: victim });
    expect(new Set(lobbyArchetypes(host)).size).toBe(2);
    host.clientSend({ type: "addBot" });
    expect(new Set(lobbyArchetypes(host)).size).toBe(3);
  });

  it("방장이 지정한 성향은 그대로 두고, 나머지 봇이 그것과 겹치지 않는다", async () => {
    const h = await newHarness();
    for (let n = 0; n < 4; n++) {
      const host = await connectAndRegister(h, `ArchForce${n}`);
      host.clientSend({ type: "createRoom" });
      for (let i = 0; i < 3; i++) host.clientSend({ type: "addBot" });

      const bots = (host.last("lobby").players as any[]).filter((p) => p.isBot);
      host.clientSend({
        type: "setBotArchetype",
        playerId: bots[0].playerId,
        archetype: "wildcard",
      });
      host.clientSend({
        type: "setBotArchetype",
        playerId: bots[1].playerId,
        archetype: "defender",
      });

      const kinds = lobbyArchetypes(host);
      // 지정은 그대로 존중된다
      const byId = new Map(
        (host.last("lobby").players as any[]).map((p) => [p.playerId, p.archetype]),
      );
      expect(byId.get(bots[0].playerId)).toBe("wildcard");
      expect(byId.get(bots[1].playerId)).toBe("defender");
      // 지정되지 않은 자리는 그것들과 겹치지 않는다
      expect(new Set(kinds).size).toBe(3);
    }
  });

  it("대기실에 보이는 성향이 곧 그 판에 앉는 성향이다", async () => {
    const h = await newHarness();
    const host = await connectAndRegister(h, "ArchStart");
    host.clientSend({ type: "createRoom" });
    const code = host.last("roomCreated").code as string;
    for (let i = 0; i < 3; i++) host.clientSend({ type: "addBot" });
    const shown = lobbyArchetypes(host);

    // `startGame`이 하는 착석 그대로 부른다 — 판 번호를 올리지 않으므로 대기실 표시와
    // 같아야 한다. (판을 실제로 두면 이 파일이 타이밍 플레이크에 더 약해진다 —
    // docs/23_TEST_BASELINE.md)
    const room = (h.rm as unknown as {
      rooms: Map<string, { agents: { botArchetype?: string }[]; botGeneration: number }>;
    }).rooms.get(code);
    expect(room).toBeDefined();
    const genBefore = room?.botGeneration;
    (h.rm as unknown as { seatBotProfiles: (r: unknown) => void }).seatBotProfiles(room);
    expect(room?.botGeneration).toBe(genBefore);

    const seated = (room?.agents ?? [])
      .map((a) => a.botArchetype)
      .filter((s): s is string => typeof s === "string");
    expect(seated.sort()).toEqual([...shown].sort());
  });

  it("자리 섞기 — 방장이 누르면 동남서북이 다시 뽑히고 대기실에 그대로 반영된다", async () => {
    const h = await newHarness();
    const host = await connectAndRegister(h, "Host");
    host.clientSend({ type: "createRoom" });
    for (let i = 0; i < 3; i++) host.clientSend({ type: "addBot" });

    const seatsOf = (): Record<string, number> => {
      const out: Record<string, number> = {};
      for (const p of host.last("lobby").players as { playerId: string; seat: number }[]) {
        out[p.playerId] = p.seat;
      }
      return out;
    };
    // 좌석은 언제나 0~3을 한 번씩 쓴다 (겹치거나 비지 않는다)
    const valid = (m: Record<string, number>): boolean =>
      [...new Set(Object.values(m))].sort().join() === "0,1,2,3";
    expect(valid(seatsOf())).toBe(true);

    // 무작위라 한 번은 그대로일 수 있다 — 여러 번 눌러 실제로 바뀌는지 본다
    const before = seatsOf();
    let changed = false;
    for (let i = 0; i < 12 && !changed; i++) {
      host.clientSend({ type: "shuffleSeats" });
      const now = seatsOf();
      expect(valid(now)).toBe(true);
      changed = Object.keys(before).some((id) => before[id] !== now[id]);
    }
    expect(changed).toBe(true);
  });

  it("자리 섞기는 방장 전용 — 다른 사람이 눌러도 자리가 바뀌지 않는다", async () => {
    const h = await newHarness();
    const host = await connectAndRegister(h, "Host");
    host.clientSend({ type: "createRoom" });
    const code = host.last("roomCreated").code;
    const guest = await connectAndRegister(h, "Guest");
    guest.clientSend({ type: "joinRoom", code });
    host.clientSend({ type: "addBot" });
    host.clientSend({ type: "addBot" });

    const seatsOf = (sock: FakeSocket): string =>
      (sock.last("lobby").players as { playerId: string; seat: number }[])
        .map((p) => `${p.playerId}:${p.seat}`)
        .sort()
        .join(",");
    const before = seatsOf(guest);
    for (let i = 0; i < 12; i++) guest.clientSend({ type: "shuffleSeats" });
    expect(seatsOf(guest)).toBe(before);
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
        // 제로섬 기준점은 원점(startScore 25000), 오카 0 (순수 우마).
        expect(r.score).toBe(r.rawScore - 25000 + r.uma * 1000 + r.oka * 1000);
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
    HANCHAN_TEST_MS,
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

      // ack가 없으면 **국마다 30초**를 기다린다 — 반장전은 최소 7국이라 210초가 넘는다.
      // 한 판 예산(90초) 안에 끝났다면 결과 화면 닫기 신호가 다음 국을 앞당긴 것이다.
      // (예산을 판의 실제 원가에 맞춰 올렸다 — HANCHAN_MS 주석 참고. 20초로는
      //  ack가 멀쩡해도 판 자체가 늦어 터졌다.)
      await sock.waitFor((m) => m.type === "gameOver", HANCHAN_MS);
      expect(sock.last("gameOver").rankings).toHaveLength(4);
      // 결과 화면의 카운트다운 근거 — 서버가 실제로 쓰는 상한 그대로 실려 나간다.
      // (클라가 자기 숫자를 따로 들면 "N초 뒤 진행"이 거짓말이 된다.)
      expect(sock.last("roundOver").autoContinueMs).toBe(30_000);
      await sock.waitFor((m) => m.type === "stats", HANCHAN_MS);
    },
    HANCHAN_TEST_MS,
  );

  it(
    "종국 뒤에도 방이 남아 대기실로 돌아간다 — 이어하기로 같은 방에서 한 판 더",
    async () => {
      const h = await newHarness(30_000);
      const sock = await connectAndRegister(h, "Again", { autoRespond: true });
      sock.clientSend({ type: "createRoom" });
      await sock.waitFor((m) => m.type === "roomCreated");
      const code = sock.last("roomCreated").code;
      for (let i = 0; i < 3; i++) sock.clientSend({ type: "addBot" });
      sock.clientSend({ type: "startGame" });

      await sock.waitFor((m) => m.type === "gameOver", HANCHAN_MS);
      // 방이 살아 있다는 신호 — 결과 화면이 "이어하기"를 띄우는 근거
      expect(sock.last("gameOver").canContinue).toBe(true);
      // 통계 영속화까지 기다린다 (임시 디렉터리 정리 레이스 방지)
      await sock.waitFor((m) => m.type === "stats", HANCHAN_MS);
      // 대기실 상태가 다시 방송된다 (같은 방 코드·4인 그대로)
      await sock.waitFor((m) => m.type === "lobby", HANCHAN_MS);
      const lobby = sock.last("lobby");
      expect(lobby.roomId).toBe(code);
      expect(lobby.players).toHaveLength(4);
      expect(lobby.canStart).toBe(true);

      // 그 방에서 곧바로 다음 판이 시작된다
      sock.clientSend({ type: "startGame" });
      await sock.waitFor((m) => m.type === "view", HANCHAN_MS);
    },
    HANCHAN_TEST_MS,
  );

  it(
    "게임 중 무효 투표에 사람 전원이 동의하면 게임이 무효 처리된다 (봇 자동 동의)",
    async () => {
      const h = await newHarness();
      /*
       * **사람이 둘이어야 한다** (감사 §10-3).
       *
       * 예전에는 사람 1 + 봇 3으로 한 표를 던져 무효를 확인했다. 그런데 그 시나리오
       * 자체가 성적 세탁 구멍이었다 — 지는 판마다 눌러 없앨 수 있었다. 이제 혼자
       * 두는 기록 대국은 무효로 지울 수 없다(`SOLO_ABORT_FORBIDDEN`).
       *
       * 이 테스트가 지키려는 것은 무효 **정족수**가 아니라 그 뒤의 정리다 —
       * 무효 처리에 고아 `.jsonl`이 남지 않는다(2026-08-11 회귀). 그 뜻은 사람이
       * 둘이어도 그대로이므로, 사람 수만 바꾼다.
       */
      const sock = await connectAndRegister(h, "Voter", { autoRespond: true });
      const other = await connectAndRegister(h, "Voter2", { autoRespond: true });
      sock.clientSend({ type: "createRoom" });
      await sock.waitFor((m) => m.type === "roomCreated");
      const code = sock.last("roomCreated").code as string;
      other.clientSend({ type: "joinRoom", code });
      await other.waitFor((m) => m.type === "lobby");
      other.clientSend({ type: "ready", ready: true });
      for (let i = 0; i < 2; i++) sock.clientSend({ type: "addBot" });
      sock.clientSend({ type: "startGame" });
      await sock.waitFor((m) => m.type === "view"); // 게임 시작

      // 리플레이 파일이 실제로 열렸는지 먼저 확인한다 — 이게 없으면 아래 "지워졌다"
      // 검사가 그냥 통과해 회귀를 못 잡는다.
      await vi.waitFor(async () => {
        const f = (await readdir(h.replayDir)).filter((n) => n.endsWith(".jsonl"));
        expect(f).toHaveLength(1);
      }, 5_000);

      // 사람 둘이 모두 동의해야 무효다 (봇은 자동 동의)
      sock.clientSend({ type: "voteAbort", vote: "agree" });
      other.clientSend({ type: "voteAbort", vote: "agree" });

      await sock.waitFor((m) => m.type === "gameAborted", 10_000);
      const aborted = sock.last("gameAborted");
      expect(aborted).toBeDefined();
      // 무효 투표 현황도 전달된다 (2/2)
      const vote = sock.last("abortVote");
      expect(vote?.votes).toBe(2);
      expect(vote?.needed).toBe(2);
      // 무효 게임은 gameOver·기록이 나오지 않는다
      expect(sock.last("gameOver")).toBeUndefined();

      /*
       * 회귀 (2026-08-11): 무효 게임은 `recordGame`을 부르지 않아 `games` 인덱스에
       * 행이 없다. 그런데 예전에는 `writer.close()`만 해서 `.jsonl`이 그대로 남았고,
       * `pruneOldReplays`는 **인덱스 행이 가리키는 파일만** 지운다 — 열어 볼 길도
       * 없고 지워지지도 않는 파일이 무효 처리마다 하나씩 쌓였다.
       * (운영 서버 실측 425개 중 292개가 그런 고아였다.)
       */
      await vi.waitFor(async () => {
        const left = (await readdir(h.replayDir)).filter((f) => f.endsWith(".jsonl"));
        expect(left).toEqual([]);
      }, 5_000);
      expect(h.db.allReplayPaths()).toEqual([]);
    },
    15_000,
  );

  it(
    "다른 사람이 남아 있으면 게임 중 나가기(포기)는 봇 자동진행으로 완주된다",
    async () => {
      const h = await newHarness();
      // autoRespond 없음 — 나간 사람이 프롬프트에 응답하지 않아도 완주해야 한다
      const sock = await connectAndRegister(h, "Quitter");
      // 남는 사람 — 이 좌석이 있으니 판을 접지 않는다 (자동 응답으로 완주시킨다)
      const stay = await connectAndRegister(h, "Stayer", { autoRespond: true });
      sock.clientSend({ type: "createRoom" });
      const code = sock.last("roomCreated").code as string;
      stay.clientSend({ type: "joinRoom", code });
      await stay.waitFor((m) => m.type === "lobby");
      stay.clientSend({ type: "ready", ready: true });
      for (let i = 0; i < 2; i++) sock.clientSend({ type: "addBot" });
      sock.clientSend({ type: "startGame" });
      await sock.waitFor((m) => m.type === "view");

      sock.clientSend({ type: "leaveRoom" }); // 게임 중 포기

      // 포기한 좌석은 봇처럼 자동 진행 → 30초 타임아웃 없이 게임이 끝난다
      await stay.waitFor((m) => m.type === "gameOver", HANCHAN_MS);
      const over = stay.last("gameOver");
      expect(over.rankings).toHaveLength(4);
      // 통계 영속화까지 기다린다 (임시 디렉터리 정리 레이스 방지)
      await stay.waitFor((m) => m.type === "stats", HANCHAN_MS);
    },
    HANCHAN_TEST_MS,
  );

  it(
    "혼자 하던 판(봇전·증강 테스트)에서 나가면 게임이 무효로 접힌다",
    async () => {
      // 회귀: 예전에는 나간 뒤에도 봇들끼리 판이 계속 돌아, 홈으로 나온 화면 위로
      // 그 게임의 연출·소리가 계속 튀어나왔다.
      const h = await newHarness();
      const sock = await connectAndRegister(h, "Solo");
      sock.clientSend({ type: "createRoom" });
      const code = sock.last("roomCreated").code as string;
      for (let i = 0; i < 3; i++) sock.clientSend({ type: "addBot" });
      sock.clientSend({ type: "startGame" });
      await sock.waitFor((m) => m.type === "view");

      sock.clientSend({ type: "leaveRoom" });

      // 무효 종료가 끝나면 방 자체가 사라진다 (봇들끼리 계속 두지 않는다)
      const rooms = (h.rm as unknown as { rooms: Map<string, unknown> }).rooms;
      await vi.waitFor(() => {
        expect(rooms.has(code)).toBe(false);
      }, 10_000);
      expect(sock.last("gameOver")).toBeUndefined();
    },
    15_000,
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
    HANCHAN_TEST_MS,
  );
});

describe("유령 좌석 정리 (접속 어긋남)", () => {
  it(
    "종국 순간 창을 닫은 사람은 대기실에 남지 않고, 곧바로 새 방을 만들 수 있다",
    async () => {
      const h = await newHarness();
      const host = await connectAndRegister(h, "Host", { autoRespond: true });
      host.clientSend({ type: "createRoom" });
      const code = host.last("roomCreated").code;
      host.clientSend({ type: "setGameMode", mode: "tonpuu" }); // 동풍전 — 테스트 시간 단축

      const guest = await connectAndRegister(h, "Guest", { autoRespond: true });
      const guestToken = guest.last("authOk").sessionToken;
      guest.clientSend({ type: "joinRoom", code });
      guest.clientSend({ type: "ready", ready: true });
      host.clientSend({ type: "addBot" });
      host.clientSend({ type: "addBot" });
      // 결과 화면이 뜨는 순간 게임을 끈다 (= 방으로 돌아오지 않는다)
      guest.closeOnType = "gameOver";
      host.clientSend({ type: "startGame" });

      await host.waitFor((m) => m.type === "gameOver", HANCHAN_MS);
      expect(guest.readyState).toBe(3); // 닫혔다
      host.sent.length = 0; // 종국 뒤 대기실 방송만 본다
      await host.waitFor((m) => m.type === "lobby", HANCHAN_MS);

      // 접속하지 않은 사람이 대기실에 앉아 있으면 안 된다 (방장은 시작도 못 하게 된다)
      const lobby = host.last("lobby");
      expect(lobby.roomId).toBe(code);
      expect(lobby.players.map((p: any) => p.nickname)).not.toContain("Guest");

      // 그 사람도 "이미 방에 참가 중"에 막히지 않고 새 방을 만들 수 있다
      const back = new FakeSocket();
      h.rm.handleConnection(back.asWs());
      back.clientSend({ type: "tokenLogin", sessionToken: guestToken });
      await back.waitFor((m) => m.type === "authOk");
      back.clientSend({ type: "createRoom" });
      expect(back.last("error")).toBeUndefined();
      expect(back.last("roomCreated")?.code).toMatch(/^[A-Z2-9]{6}$/);
    },
    HANCHAN_TEST_MS,
  );

  it("방을 떠난 것으로 아는 클라이언트가 새 방을 만들면 옛 좌석을 놓아 준다", async () => {
    const h = await newHarness();
    const host = await connectAndRegister(h, "Host");
    host.clientSend({ type: "createRoom" });
    const code = host.last("roomCreated").code;
    const guest = await connectAndRegister(h, "Guest");
    guest.clientSend({ type: "joinRoom", code });
    expect(host.last("lobby").players).toHaveLength(2);

    // leaveRoom 없이 홈으로 돌아간 클라이언트 — 홈 화면에서만 나오는 메시지다
    guest.clientSend({ type: "createRoom" });
    expect(guest.last("error")).toBeUndefined();
    const newCode = guest.last("roomCreated").code;
    expect(newCode).not.toBe(code);
    // 옛 방에서는 자리가 비고, 새 방에서는 방장이 된다
    expect(host.last("lobby").players).toHaveLength(1);
    expect(guest.last("lobby").roomId).toBe(newCode);
    expect(guest.last("lobby").hostId).toBe(guest.last("joined").playerId);
  });

  it("같은 연결이 같은 코드로 다시 들어오면 원래 자리에 도로 앉는다", async () => {
    const h = await newHarness();
    const host = await connectAndRegister(h, "Host");
    host.clientSend({ type: "createRoom" });
    const code = host.last("roomCreated").code;
    const guest = await connectAndRegister(h, "Guest");
    guest.clientSend({ type: "joinRoom", code });
    const seatId = guest.last("joined").playerId;

    guest.clientSend({ type: "joinRoom", code });
    expect(guest.last("error")).toBeUndefined();
    expect(guest.last("joined").playerId).toBe(seatId); // 새 자리가 아니라 원래 자리
    expect(host.last("lobby").players).toHaveLength(2); // 자리가 늘어나지 않는다
  });

  it("다른 기기(다른 연결)로 들어오면 늦게 온 쪽이 자리를 가져간다", async () => {
    const h = await newHarness();
    const host = await connectAndRegister(h, "Host");
    host.clientSend({ type: "createRoom" });
    const code = host.last("roomCreated").code;
    const phone = await connectAndRegister(h, "Guest");
    phone.clientSend({ type: "joinRoom", code });
    const seatId = phone.last("joined").playerId;

    // 폰 소켓은 아직 살아 있다 — 브라우저를 닫아도 바로 죽지 않는다.
    const desktop = await connectAndLogin(h, "Guest", "pw123456");
    desktop.clientSend({ type: "joinRoom", code });

    expect(desktop.last("error")).toBeUndefined();
    expect(desktop.last("joined").playerId).toBe(seatId); // 같은 자리
    expect(host.last("lobby").players).toHaveLength(2); // 자리는 늘지 않는다
  });

  it("남의 자리는 가져갈 수 없다 — 계정이 다르면 제 자리를 따로 받는다", async () => {
    // 이어받기는 `isActiveHuman`이 **닉네임(=계정)이 같은 좌석**만 고르기 때문에
    // 성립한다. 계정이 다르면 남의 자리에 앉는 길이 없어야 한다.
    const h = await newHarness();
    const host = await connectAndRegister(h, "Host");
    host.clientSend({ type: "createRoom" });
    const code = host.last("roomCreated").code;
    const hostSeat = host.last("joined")?.playerId;

    const other = await connectAndRegister(h, "Other");
    other.clientSend({ type: "joinRoom", code });

    expect(other.last("joined").playerId).not.toBe(hostSeat);
    expect(host.last("lobby").players).toHaveLength(2);
  });
});

describe("강퇴 (방장)", () => {
  it("방장이 내보내면 그 사람은 자리에서 빠지고 kicked를 받는다", async () => {
    const h = await newHarness();
    const host = await connectAndRegister(h, "Host");
    host.clientSend({ type: "createRoom" });
    const code = host.last("roomCreated").code;
    const guest = await connectAndRegister(h, "Guest");
    guest.clientSend({ type: "joinRoom", code });
    const guestId = guest.last("joined").playerId;
    guest.clientSend({ type: "ready", ready: true });

    host.clientSend({ type: "kickPlayer", playerId: guestId });
    expect(guest.last("kicked")?.roomId).toBe(code);
    const lobby = host.last("lobby");
    expect(lobby.players).toHaveLength(1);
    expect(lobby.players[0].nickname).toBe("Host");

    // 강퇴당한 사람은 이 방에 다시 들어올 수 없다 (코드를 알아도)
    guest.clientSend({ type: "joinRoom", code });
    expect(guest.last("error")?.code).toBe("KICKED");
    expect(host.last("lobby").players).toHaveLength(1);

    // 다른 방에는 자유롭게 들어간다 (계정이 막히는 것이 아니다)
    guest.clientSend({ type: "createRoom" });
    expect(guest.last("roomCreated")?.code).toMatch(/^[A-Z2-9]{6}$/);
  });

  it("강퇴는 방장 전용이고, 방장 자신은 강퇴할 수 없다", async () => {
    const h = await newHarness();
    const host = await connectAndRegister(h, "Host");
    host.clientSend({ type: "createRoom" });
    const code = host.last("roomCreated").code;
    const guest = await connectAndRegister(h, "Guest");
    guest.clientSend({ type: "joinRoom", code });
    const hostId = host.last("lobby").hostId;
    const guestId = guest.last("joined").playerId;

    // 방장이 아닌 사람이 방장을 내보내려 해도 아무 일도 없다
    guest.clientSend({ type: "kickPlayer", playerId: hostId });
    expect(host.last("kicked")).toBeUndefined();
    expect(host.last("lobby").players).toHaveLength(2);

    // 다른 사람을 내보내려 해도 마찬가지
    guest.clientSend({ type: "kickPlayer", playerId: guestId });
    expect(guest.last("kicked")).toBeUndefined();
    expect(host.last("lobby").players).toHaveLength(2);

    // 방장이 자기 자신을 지목해도 방이 무너지지 않는다
    host.clientSend({ type: "kickPlayer", playerId: hostId });
    expect(host.last("kicked")).toBeUndefined();
    expect(host.last("lobby").players).toHaveLength(2);
  });

  it("강퇴로 봇을 지목하면 봇이 자리에서 빠진다", async () => {
    const h = await newHarness();
    const host = await connectAndRegister(h, "Host");
    host.clientSend({ type: "createRoom" });
    host.clientSend({ type: "addBot" });
    const bot = (host.last("lobby").players as any[]).find((p) => p.isBot);
    host.clientSend({ type: "kickPlayer", playerId: bot.playerId });
    expect(host.last("lobby").players).toHaveLength(1);
  });

  it("게임 중에는 강퇴가 먹지 않는다", async () => {
    const h = await newHarness();
    const host = await connectAndRegister(h, "Host", { autoRespond: true });
    host.clientSend({ type: "createRoom" });
    const code = host.last("roomCreated").code;
    const guest = await connectAndRegister(h, "Guest", { autoRespond: true });
    guest.clientSend({ type: "joinRoom", code });
    const guestId = guest.last("joined").playerId;
    guest.clientSend({ type: "ready", ready: true });
    host.clientSend({ type: "addBot" });
    host.clientSend({ type: "addBot" });
    host.clientSend({ type: "startGame" });
    await guest.waitFor((m) => m.type === "view");

    host.clientSend({ type: "kickPlayer", playerId: guestId });
    expect(guest.last("kicked")).toBeUndefined();
    // 게임은 그대로 진행된다 (전원 합의 무효로만 중단할 수 있다)
    guest.clientSend({ type: "voteAbort", vote: "agree" });
    host.clientSend({ type: "voteAbort", vote: "agree" });
    await host.waitFor((m) => m.type === "gameAborted", 10_000);
  });
});

describe("authOk.resumeRoom — 홈의 \"진행하던 방으로 재접속\"", () => {
  /*
   * 이 필드가 생긴 이유(2026-08-19 사용자 보고): 홈의 재접속 버튼은 브라우저에
   * 남은 마지막 방 코드만 보고 떴는데, 그 코드는 방이 사라지는 어느 길에서도
   * 지워지지 않았다 — 눌러야 비로소 "그 방은 이미 사라졌습니다"를 보는 버튼이
   * 대부분이었다. 판단을 서버로 옮겼으므로, **여기서 알려 준 코드는 곧바로
   * `joinRoom`이 통해야 한다.** 그게 이 describe가 지키는 선이다.
   */
  it("돌아갈 방이 없으면 null이다", async () => {
    const h = await newHarness();
    const sock = await connectAndRegister(h, "Nobody");
    expect(sock.last("authOk").resumeRoom).toBeNull();
  });

  it("대기실에 앉아 있으면 그 방 코드가 오고, 그 코드로 실제로 다시 들어간다", async () => {
    const h = await newHarness();
    const host = await connectAndRegister(h, "Host");
    host.clientSend({ type: "createRoom" });
    const code = host.last("roomCreated").code;

    const back = await connectAndLogin(h, "Host", "pw123456");
    expect(back.last("authOk").resumeRoom).toBe(code);
    back.clientSend({ type: "joinRoom", code });
    expect(back.last("error")).toBeUndefined();
    expect(back.last("joined").roomId).toBe(code);
  });

  it("방이 사라지면 다음 로그인에서 null이다", async () => {
    const h = await newHarness();
    const host = await connectAndRegister(h, "Host");
    host.clientSend({ type: "createRoom" });
    host.clientSend({ type: "leaveRoom" }); // 혼자 있던 방 → 방이 없어진다

    const back = await connectAndLogin(h, "Host", "pw123456");
    expect(back.last("authOk").resumeRoom).toBeNull();
  });

  it("강퇴당한 방은 알려 주지 않는다 (다시 들어갈 수 없으므로)", async () => {
    const h = await newHarness();
    const host = await connectAndRegister(h, "Host");
    host.clientSend({ type: "createRoom" });
    const code = host.last("roomCreated").code;
    const guest = await connectAndRegister(h, "Guest");
    guest.clientSend({ type: "joinRoom", code });
    host.clientSend({ type: "kickPlayer", playerId: guest.last("joined").playerId });

    const back = await connectAndLogin(h, "Guest", "pw123456");
    expect(back.last("authOk").resumeRoom).toBeNull();
  });

  it("남의 대기실은 알려 주지 않는다", async () => {
    const h = await newHarness();
    const host = await connectAndRegister(h, "Host");
    host.clientSend({ type: "createRoom" });
    await connectAndRegister(h, "Stranger");

    const back = await connectAndLogin(h, "Stranger", "pw123456");
    expect(back.last("authOk").resumeRoom).toBeNull();
  });

  it("게임 중 끊겼던 사람에게는 그 방을 알려 준다", async () => {
    const h = await newHarness();
    const host = await connectAndRegister(h, "Host", { autoRespond: true });
    host.clientSend({ type: "createRoom" });
    const code = host.last("roomCreated").code;
    const player = await connectAndRegister(h, "Player", { autoRespond: true });
    player.clientSend({ type: "joinRoom", code });
    player.clientSend({ type: "ready", ready: true });
    host.clientSend({ type: "addBot" });
    host.clientSend({ type: "addBot" });
    host.clientSend({ type: "startGame" });
    await player.waitFor((m) => m.type === "view");
    player.close(); // 지하철에 들어갔다

    const back = await connectAndLogin(h, "Player", "pw123456");
    expect(back.last("authOk").resumeRoom).toBe(code);
  });
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
      await admin.waitFor((m) => m.type === "spectateEnded", HANCHAN_MS);
      // 통계 영속화까지 기다린다 (임시 디렉터리 정리 레이스 방지)
      await player.waitFor((m) => m.type === "stats", HANCHAN_MS);
    },
    HANCHAN_TEST_MS,
  );
});

describe("전체 통계·계정 관리 (32)", () => {
  it("leaderboard: 비관리자는 닉네임이 지워진 익명 집계만, 관리자는 닉네임 포함 + 게임 수 내림차순 정렬 + 삭제된 계정 유령 통계는 제외", async () => {
    const h = await newHarness();
    // 통계 저장소에 사람 통계를 심는다 (게임 완주 없이 직접).
    // "Ghost"는 계정이 없는(삭제된) 닉네임 — 리더보드에서 걸러져야 한다.
    await h.store.record([
      { nickname: "Ann", raw: { ...emptyRaw(), roundsPlayed: 10, wins: 4, games: 2, placementSum: 3, placements: [1, 1, 0, 0] } },
      { nickname: "Bob", raw: { ...emptyRaw(), roundsPlayed: 6, wins: 1, games: 1, placementSum: 4, placements: [0, 0, 0, 1] } },
      { nickname: "Ghost", raw: { ...emptyRaw(), roundsPlayed: 99, wins: 50, games: 20, placementSum: 20, placements: [20, 0, 0, 0] } },
    ]);
    await connectAndRegister(h, "Bob"); // 실제 계정으로 등록
    const sock = await connectAndRegister(h, "Ann");
    sock.clientSend({ type: "leaderboard" });
    await sock.waitFor((m) => m.type === "leaderboard");
    const lb = sock.last("leaderboard");
    // 비관리자: 신원(닉네임)은 지워지고 익명 집계만 온다 (증강 메타용)
    expect(lb.entries.map((e: any) => e.nickname)).toEqual(["", ""]);
    // Ghost(계정 없음)는 제외돼 2건, 게임 수 내림차순 정렬 (Ann 2판 > Bob 1판)
    expect(lb.entries).toHaveLength(2);
    expect(lb.entries[0].stats.winRate).toBeCloseTo(0.4);

    // 관리자: 닉네임이 그대로 온다
    const admin = await connectAndRegister(h, "Boss", { adminCode: h.db.adminCode() });
    admin.clientSend({ type: "leaderboard" });
    await admin.waitFor((m) => m.type === "leaderboard");
    expect(admin.last("leaderboard").entries.map((e: any) => e.nickname)).toEqual(["Ann", "Bob"]);
  });

  it("adminUsers: 관리자만 계정 목록을 받고, 일반 사용자는 FORBIDDEN", async () => {
    const h = await newHarness();
    await connectAndRegister(h, "Alice");
    const pleb = await connectAndRegister(h, "Pleb");
    pleb.clientSend({ type: "adminUsers" });
    expect(pleb.last("error")?.code).toBe("FORBIDDEN");

    const admin = await connectAndRegister(h, "Boss", { adminCode: h.db.adminCode() });
    admin.clientSend({ type: "adminUsers" });
    await admin.waitFor((m) => m.type === "adminUsers");
    const list = admin.last("adminUsers");
    const names = list.users.map((u: any) => u.username);
    expect(names).toEqual(expect.arrayContaining(["Alice", "Pleb", "Boss"]));
    expect(list.users.find((u: any) => u.username === "Boss").isAdmin).toBe(true);
  });

  it("adminDeleteUser: 관리자가 계정을 삭제하면 목록·통계·로그인이 사라진다", async () => {
    const h = await newHarness();
    await h.store.record([
      { nickname: "Victim", raw: { ...emptyRaw(), roundsPlayed: 3, games: 1, placements: [0, 0, 0, 1] } },
    ]);
    await connectAndRegister(h, "Victim");
    const admin = await connectAndRegister(h, "Boss", { adminCode: h.db.adminCode() });

    admin.clientSend({ type: "adminUsers" });
    await admin.waitFor((m) => m.type === "adminUsers");
    const victimId = admin.last("adminUsers").users.find((u: any) => u.username === "Victim").id;

    admin.clientSend({ type: "adminDeleteUser", userId: victimId });
    // 삭제 후 갱신된 목록·리더보드가 되돌아온다 (통계 삭제 완료 후)
    await admin.waitFor((m) => m.type === "leaderboard");
    const after = admin.last("adminUsers");
    expect(after.users.some((u: any) => u.username === "Victim")).toBe(false);
    // 누적 통계에서도 제거된다
    expect(admin.last("leaderboard").entries.some((e: any) => e.nickname === "Victim")).toBe(false);
    expect(h.store.get("Victim")).toBeNull();
    // 삭제된 계정으로는 더 이상 로그인할 수 없다
    const relog = await connectAndLogin(h, "Victim", "pw123456");
    expect(relog.last("authOk")).toBeUndefined();
    expect(relog.last("error")).toBeDefined();
  });

  it("adminDeleteUser: 관리자 본인 계정은 삭제할 수 없다", async () => {
    const h = await newHarness();
    const admin = await connectAndRegister(h, "Boss", { adminCode: h.db.adminCode() });
    admin.clientSend({ type: "adminUsers" });
    await admin.waitFor((m) => m.type === "adminUsers");
    const selfId = admin.last("adminUsers").users.find((u: any) => u.username === "Boss").id;
    admin.clientSend({ type: "adminDeleteUser", userId: selfId });
    expect(admin.last("error")?.code).toBe("CANNOT_DELETE_SELF");
  });

  it("replayList: 관리자는 자신이 참가하지 않은 게임 리플레이도 목록에 받는다", async () => {
    const h = await newHarness();
    // 사람 1 + 봇 3 게임을 완주시켜 리플레이 1건을 만든다
    const player = await connectAndRegister(h, "Grinder", { autoRespond: true });
    player.clientSend({ type: "createRoom" });
    await player.waitFor((m) => m.type === "roomCreated");
    for (let i = 0; i < 3; i++) player.clientSend({ type: "addBot" });
    player.clientSend({ type: "startGame" });
    await player.waitFor((m) => m.type === "gameOver", HANCHAN_MS);
    await player.waitFor((m) => m.type === "stats", HANCHAN_MS);

    // 관리자는 게임에 참가하지 않았지만 전체 리플레이를 본다
    const admin = await connectAndRegister(h, "Boss", { adminCode: h.db.adminCode() });
    admin.clientSend({ type: "replayList" });
    await admin.waitFor((m) => m.type === "replayList");
    expect(admin.last("replayList").games.length).toBeGreaterThanOrEqual(1);
  }, HANCHAN_TEST_MS);
});
