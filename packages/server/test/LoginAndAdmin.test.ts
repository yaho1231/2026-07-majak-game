/**
 * 로그인 문턱과 관리자 손잡이 (2026-08-19 사용자 지시 ①③⑤).
 *
 * 지키려는 선(이 파일이 존재하는 이유):
 *
 * - **재접속 버튼의 근거는 서버다.** 브라우저 저장소가 비어 있어도(다른 기기·시크릿
 *   창) 로그인하면 서버가 "너는 지금 이 방에 앉아 있다"고 알려 준다. 예전에는 이
 *   판단이 `majak.lastRoomCode` 하나뿐이라, 튕겨서 다른 브라우저로 돌아온 사람은
 *   서버에 판이 멀쩡히 서 있어도(§2-10 이어하기) **코드를 외우는 것 말고 길이
 *   없었다.**
 * - **닉네임 중복 확인은 가입과 같은 규칙으로 답한다.** 갈라 두면 "확인은 통과인데
 *   가입은 거절"이 언젠가 반드시 생긴다. 그리고 이 창구는 **인증과 같은
 *   레이트리밋 창**을 태운다 — 계정 열거의 속도 상한을 올려 주지 않는다.
 * - **강제 종료는 관리자만, 진행 중인 판에만.** 일반 계정이 남의 판을 끊을 수 있으면
 *   그건 관리 도구가 아니라 방해 도구다.
 *
 * Guest.test.ts와 같은 FakeSocket 방식(실제 네트워크 없음).
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
  }

  on(event: string, cb: (...a: any[]) => void): void {
    (this.handlers[event] ??= []).push(cb);
  }

  close(): void {
    this.readyState = 3;
    for (const cb of this.handlers.close ?? []) cb();
  }

  clientSend(msg: unknown): void {
    for (const cb of this.handlers.message ?? []) cb(Buffer.from(JSON.stringify(msg)));
  }

  last(type: string): any {
    return [...this.sent].reverse().find((m) => m.type === type);
  }

  all(type: string): any[] {
    return this.sent.filter((m) => m.type === type);
  }

  waitFor(pred: (m: any) => boolean, timeoutMs = 20_000): Promise<void> {
    if (this.sent.some(pred)) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("waitFor timeout")), timeoutMs);
      this.waiters.push({ pred, resolve, timer });
    });
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
}

async function newHarness(): Promise<Harness> {
  const replayDir = await mkdtemp(join(tmpdir(), "majak-login-"));
  dirs.push(replayDir);
  const store = new StatsStore(join(replayDir, "stats.json"));
  await store.load();
  const db = new SiteDb(":memory:");
  dbs.push(db);
  const manager = new RoomManager(replayDir, store, 0, db);
  managers.push(manager);
  return { rm: manager, db };
}

/** 가입해서 붙는다. `adminCode`를 주면 관리자 계정이 된다. */
async function connectUser(
  h: Harness,
  username: string,
  adminCode?: string,
): Promise<FakeSocket> {
  const sock = new FakeSocket();
  h.rm.handleConnection(sock.asWs());
  sock.clientSend({
    type: "register",
    username,
    password: "pw123456",
    ...(adminCode !== undefined ? { adminCode } : {}),
  });
  await sock.waitFor((m) => m.type === "authOk" || m.type === "error");
  return sock;
}

/** 저장된 세션 토큰으로 **새 연결**을 연다 — 기기를 바꾼 상황을 흉내 낸다. */
async function reconnectWithToken(h: Harness, token: string): Promise<FakeSocket> {
  const sock = new FakeSocket();
  h.rm.handleConnection(sock.asWs());
  sock.clientSend({ type: "tokenLogin", sessionToken: token });
  await sock.waitFor((m) => m.type === "authOk" || m.type === "error");
  return sock;
}

afterEach(async () => {
  for (const m of managers.splice(0)) {
    m.shutdown("테스트 정리");
    m.stop();
  }
  await new Promise((r) => setTimeout(r, 0));
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  for (const db of dbs.splice(0)) db.close();
});

describe("진행하던 방 — 서버가 알려 준다", () => {
  it("방이 없으면 code:null 을 인증 직후에 보낸다", async () => {
    const h = await newHarness();
    const sock = await connectUser(h, "혼자");
    expect(sock.last("activeGame")).toEqual({ type: "activeGame", code: null });
  });

  it("방을 만든 뒤 **다른 연결로** 로그인해도 그 방을 알려 준다", async () => {
    const h = await newHarness();
    const first = await connectUser(h, "돌아올사람");
    const token = first.last("authOk").sessionToken as string;
    first.clientSend({ type: "createRoom" });
    await first.waitFor((m) => m.type === "roomCreated");
    const code = first.last("roomCreated").code as string;

    /*
     * 여기가 이 파일의 요점이다. 이 소켓에는 브라우저 저장소가 없다 —
     * 다른 기기에서 세션 토큰만 들고 돌아온 사람과 같은 처지다.
     * 예전에는 이 사람에게 방 코드를 알려 줄 길이 **아예 없었다.**
     */
    const second = await reconnectWithToken(h, token);
    expect(second.last("activeGame")).toMatchObject({ code, playing: false });
  });

  it("나가면 다시 물었을 때 code:null 로 바뀐다", async () => {
    const h = await newHarness();
    const sock = await connectUser(h, "들락날락");
    sock.clientSend({ type: "createRoom" });
    await sock.waitFor((m) => m.type === "roomCreated");
    sock.clientSend({ type: "leaveRoom" });

    sock.clientSend({ type: "activeGameRequest" });
    await sock.waitFor((m) => m.type === "activeGame" && m.code === null);
    expect(sock.last("activeGame").code).toBeNull();
  });
});

describe("닉네임 중복 확인", () => {
  it("빈 이름은 쓸 수 있다고, 이미 있는 이름은 못 쓴다고 답한다", async () => {
    const h = await newHarness();
    const sock = await connectUser(h, "선점자");

    sock.clientSend({ type: "checkUsername", username: "아무도없음" });
    await sock.waitFor((m) => m.type === "usernameCheck");
    expect(sock.last("usernameCheck")).toEqual({
      type: "usernameCheck",
      username: "아무도없음",
      available: true,
    });

    sock.clientSend({ type: "checkUsername", username: "선점자" });
    await sock.waitFor((m) => m.type === "usernameCheck" && m.username === "선점자");
    expect(sock.last("usernameCheck")).toMatchObject({ available: false });
  });

  it("가입이 거절할 이름은 확인도 거절한다 (규칙이 한 곳에 있다)", async () => {
    const h = await newHarness();
    const sock = new FakeSocket();
    h.rm.handleConnection(sock.asWs());

    // 형식 위반(1자)·예약어(admin)·봇 사칭(bot_) — register와 같은 판정이어야 한다.
    for (const bad of ["ㄱ", "admin", "bot_1"]) {
      sock.clientSend({ type: "checkUsername", username: bad });
      await sock.waitFor((m) => m.type === "usernameCheck" && m.username === bad);
      const res = sock.all("usernameCheck").find((m) => m.username === bad);
      expect(res.available, `${bad} 는 쓸 수 없어야 한다`).toBe(false);
      expect(typeof res.reason).toBe("string");
    }
  });

  it("**로그인 전에도** 답한다 — 가입 폼에서 쓰는 버튼이다", async () => {
    const h = await newHarness();
    const sock = new FakeSocket();
    h.rm.handleConnection(sock.asWs());
    sock.clientSend({ type: "checkUsername", username: "신규가입자" });
    await sock.waitFor((m) => m.type === "usernameCheck");
    expect(sock.last("usernameCheck").available).toBe(true);
    // 인증 게이트에 걸리지 않았다 — AUTH_REQUIRED가 오면 이 버튼은 아예 못 쓴다.
    expect(sock.all("error").some((m) => m.code === "AUTH_REQUIRED")).toBe(false);
  });

  it("인증과 **같은 레이트리밋 창**을 태운다 (계정 열거 속도를 올려 주지 않는다)", async () => {
    const h = await newHarness();
    const sock = new FakeSocket();
    h.rm.handleConnection(sock.asWs());
    // 연결당 상한(12회/분)을 넘겨 본다. 별도 예산이 있었다면 전부 통과했을 것이다.
    for (let i = 0; i < 20; i++) sock.clientSend({ type: "checkUsername", username: `이름${i}` });
    expect(sock.all("error").some((m) => m.code === "RATE_LIMITED")).toBe(true);
    expect(sock.all("usernameCheck").length).toBeLessThan(20);
  });
});

describe("관리자 강제 종료", () => {
  /** 봇 3명을 채우고 시작해 대국 중인 방 하나를 만든다. */
  async function startGame(h: Harness, sock: FakeSocket): Promise<string> {
    sock.clientSend({ type: "createRoom" });
    await sock.waitFor((m) => m.type === "roomCreated");
    const code = sock.last("roomCreated").code as string;
    for (let i = 0; i < 3; i++) sock.clientSend({ type: "addBot" });
    sock.clientSend({ type: "setGameMode", mode: "tonpuu" });
    sock.clientSend({ type: "ready" });
    sock.clientSend({ type: "startGame" });
    await sock.waitFor((m) => m.type === "view", 60_000);
    return code;
  }

  it("관리자가 끊으면 참가자에게 사유가 적힌 gameAborted 가 간다", async () => {
    const h = await newHarness();
    const adminCode = h.db.adminCode();
    const player = await connectUser(h, "대국자");
    const code = await startGame(h, player);
    const admin = await connectUser(h, "관리자님", adminCode);

    admin.clientSend({ type: "adminAbortGame", code });
    await player.waitFor((m) => m.type === "gameAborted");
    expect(player.last("gameAborted").reason).toContain("관리자");

    // 방이 사라졌으므로 그 사람은 이제 새 방을 만들 수 있다 — 이게 이 버튼의 목적이다.
    // (예전에는 돌아오지 않는 사람이 낀 판이 ALREADY_IN_GAME 으로 계정을 묶어 두었다.)
    admin.clientSend({ type: "liveGames" });
    await admin.waitFor((m) => m.type === "liveGames" && m.rooms.length === 0);
    expect(admin.last("liveGames").rooms).toEqual([]);
  });

  it("관리자가 적어 준 사유가 그대로 실린다", async () => {
    const h = await newHarness();
    const adminCode = h.db.adminCode();
    const player = await connectUser(h, "사유확인");
    const code = await startGame(h, player);
    const admin = await connectUser(h, "관리자둘", adminCode);

    admin.clientSend({ type: "adminAbortGame", code, reason: "서버 점검" });
    await player.waitFor((m) => m.type === "gameAborted");
    expect(player.last("gameAborted").reason).toContain("서버 점검");
  });

  it("일반 계정은 남의 판을 끊지 못한다", async () => {
    const h = await newHarness();
    const player = await connectUser(h, "피해자");
    const code = await startGame(h, player);
    const nosy = await connectUser(h, "훼방꾼");

    nosy.clientSend({ type: "adminAbortGame", code });
    expect(nosy.last("error")).toMatchObject({ code: "FORBIDDEN" });
    expect(player.all("gameAborted")).toEqual([]);
  });

  it("대기실 방은 대상이 아니다 (끊을 대국이 없다)", async () => {
    const h = await newHarness();
    const adminCode = h.db.adminCode();
    const host = await connectUser(h, "대기중");
    host.clientSend({ type: "createRoom" });
    await host.waitFor((m) => m.type === "roomCreated");
    const code = host.last("roomCreated").code as string;
    const admin = await connectUser(h, "관리자셋", adminCode);

    admin.clientSend({ type: "adminAbortGame", code });
    expect(admin.last("error")).toMatchObject({ code: "NOT_PLAYING" });
  });

  it("없는 방 코드는 조용히 거절한다", async () => {
    const h = await newHarness();
    const adminCode = h.db.adminCode();
    const admin = await connectUser(h, "관리자넷", adminCode);
    admin.clientSend({ type: "adminAbortGame", code: "ZZZZZZ" });
    expect(admin.last("error")).toMatchObject({ code: "ROOM_NOT_FOUND" });
  });
});
