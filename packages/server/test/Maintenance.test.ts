/**
 * 점검 모드 (2026-09-21).
 *
 * 지키려는 선:
 *
 * - **켜고 끄는 것은 관리자만.** 비관리자의 `adminSetMaintenance`는 FORBIDDEN이고
 *   DB도 그대로다.
 * - **켜지면 비관리자는 아무것도 못 한다.** 로그인 전(게스트 체험·공유 리플레이·
 *   도감)이든 로그인 뒤(방 만들기·리플레이 목록·제보)든 `MAINTENANCE`로 거절된다.
 *   이미 붙어 있던 사람도 그 순간부터 막힌다 — 클라이언트가 화면만 숨기는 게 아니다.
 * - **관리자는 평소와 같다.** 방도 만들고 관리자 조회도 된다.
 * - **재시작해도 남는다.** 새 RoomManager가 부팅 때 DB에서 읽는다.
 * - **켜고 끄는 순간 접속 중인 모두에게 `serverInfo`가 다시 나간다** — 비관리자
 *   클라이언트가 그 한 프레임으로 화면을 바꾼다.
 *
 * AdminOnlineRename.test.ts와 같은 FakeSocket 방식(실제 네트워크 없음).
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
  dir: string;
}

async function newHarness(db?: SiteDb): Promise<Harness> {
  const dir = await mkdtemp(join(tmpdir(), "majak-maint-"));
  dirs.push(dir);
  const store = new StatsStore(join(dir, "stats.json"));
  await store.load();
  const siteDb = db ?? new SiteDb(":memory:");
  if (db === undefined) dbs.push(siteDb);
  const manager = new RoomManager(dir, store, 0, siteDb);
  managers.push(manager);
  return { rm: manager, db: siteDb, dir };
}

/** 가입해서 붙는다. `adminCode`를 주면 관리자 계정이 된다. */
async function connectUser(h: Harness, username: string, adminCode?: string): Promise<FakeSocket> {
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

/** 에러 코드 목록 — 순서대로. */
function errorCodes(sock: FakeSocket): string[] {
  return sock.all("error").map((e) => e.code as string);
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

describe("점검 모드 — 켜고 끄기 권한", () => {
  it("관리자가 아니면 켤 수 없다", async () => {
    const h = await newHarness();
    const sock = await connectUser(h, "평범한사람");
    sock.clientSend({ type: "adminSetMaintenance", on: true, body: "가짜" });
    await sock.waitFor((m) => m.type === "error");
    expect(sock.last("error").code).toBe("FORBIDDEN");
    expect(h.db.maintenance()).toBeNull();
  });

  it("관리자가 켜면 DB에 남고, serverInfo에 실려 접속 중인 모두에게 나간다", async () => {
    const h = await newHarness();
    const admin = await connectUser(h, "관리자", h.db.adminCode());
    const user = await connectUser(h, "손님계정");
    const beforeUser = user.all("serverInfo").length;
    const beforeAdmin = admin.all("serverInfo").length;

    admin.clientSend({ type: "adminSetMaintenance", on: true, body: "22시까지\n서버 이전" });
    await user.waitFor((m) => m.type === "serverInfo" && m.maintenance !== undefined);

    expect(user.all("serverInfo").length).toBe(beforeUser + 1);
    expect(admin.all("serverInfo").length).toBe(beforeAdmin + 1);
    const info = user.last("serverInfo");
    expect(info.maintenance.body).toBe("22시까지\n서버 이전");
    expect(info.maintenance.updatedAt).not.toBe("");
    // 체험 버튼도 접힌다.
    expect(info.guestPlay).toBe(false);
    expect(h.db.maintenance()?.body).toBe("22시까지\n서버 이전");
    expect(h.rm.healthSnapshot().maintenance).toBe(true);
  });

  it("끄면 필드가 빠진 serverInfo가 다시 나가고 DB에서도 지워진다", async () => {
    const h = await newHarness();
    const admin = await connectUser(h, "관리자", h.db.adminCode());
    const user = await connectUser(h, "손님계정");
    admin.clientSend({ type: "adminSetMaintenance", on: true, body: "잠깐" });
    await user.waitFor((m) => m.type === "serverInfo" && m.maintenance !== undefined);
    const n = user.all("serverInfo").length;

    admin.clientSend({ type: "adminSetMaintenance", on: false, body: "" });
    await user.waitFor((m) => m.type === "serverInfo" && user.all("serverInfo").length > n);
    expect(user.last("serverInfo").maintenance).toBeUndefined();
    expect(user.last("serverInfo").guestPlay).toBe(true);
    expect(h.db.maintenance()).toBeNull();
    expect(h.rm.healthSnapshot().maintenance).toBe(false);
  });

  it("형식이 틀리면 BAD_REQUEST — 상태는 그대로", async () => {
    const h = await newHarness();
    const admin = await connectUser(h, "관리자", h.db.adminCode());
    admin.clientSend({ type: "adminSetMaintenance", on: "yes", body: 1 });
    await admin.waitFor((m) => m.type === "error");
    expect(admin.last("error").code).toBe("BAD_REQUEST");
    expect(h.db.maintenance()).toBeNull();
  });
});

describe("점검 모드 — 비관리자는 막힌다", () => {
  it("이미 로그인해 있던 비관리자는 켜지는 순간부터 거절된다 (createRoom·replayList·feedbackSubmit)", async () => {
    const h = await newHarness();
    const admin = await connectUser(h, "관리자", h.db.adminCode());
    const user = await connectUser(h, "손님계정");
    admin.clientSend({ type: "adminSetMaintenance", on: true, body: "점검" });
    await user.waitFor((m) => m.type === "serverInfo" && m.maintenance !== undefined);

    user.clientSend({ type: "createRoom" });
    user.clientSend({ type: "replayList" });
    user.clientSend({ type: "feedbackSubmit", kind: "bug", title: "제목", body: "본문" });
    user.clientSend({ type: "leaderboard" });
    await user.waitFor((m) => m.type === "error" && user.all("error").length >= 4);
    expect(errorCodes(user)).toEqual(["MAINTENANCE", "MAINTENANCE", "MAINTENANCE", "MAINTENANCE"]);
    expect(user.all("roomCreated")).toHaveLength(0);
    expect(user.all("replayList")).toHaveLength(0);
    expect(user.all("leaderboard")).toHaveLength(0);
    expect(h.db.listFeedback({ id: 0, username: "x", isAdmin: true })).toHaveLength(0);
  });

  it("로그인 전 경로도 막힌다 — 게스트 체험·공유 리플레이·도감·가입", async () => {
    const h = await newHarness();
    h.db.setMaintenance(true, "점검");
    const h2 = await newHarness(h.db); // 부팅 때 DB에서 읽는 경로

    const anon = new FakeSocket();
    h2.rm.handleConnection(anon.asWs());
    // 첫 프레임부터 실려 있어야 점검 화면이 로그인 화면보다 먼저 선다.
    expect(anon.last("serverInfo").maintenance.body).toBe("점검");

    anon.clientSend({ type: "guestPlay" });
    anon.clientSend({ type: "replayGet", shareToken: "0123456789abcdef0123456789abcdef" });
    anon.clientSend({ type: "catalogRequest" });
    anon.clientSend({ type: "register", username: "새사람", password: "pw123456" });
    await anon.waitFor((m) => m.type === "error" && anon.all("error").length >= 4);
    expect(errorCodes(anon)).toEqual(["MAINTENANCE", "MAINTENANCE", "MAINTENANCE", "MAINTENANCE"]);
    expect(anon.all("authOk")).toHaveLength(0);
    expect(anon.all("catalog")).toHaveLength(0);
  });

  it("로그인은 된다(관리자 판별용) — 그러나 비관리자면 로그인 뒤에도 막힌다", async () => {
    const h = await newHarness();
    // 점검 전에 가입해 둔 계정
    const early = await connectUser(h, "기존사용자");
    expect(early.last("authOk")).toBeDefined();
    early.close();
    h.db.setMaintenance(true, "점검");
    const h2 = await newHarness(h.db);

    const sock = new FakeSocket();
    h2.rm.handleConnection(sock.asWs());
    sock.clientSend({ type: "ping" }); // 연결 유지는 통한다
    sock.clientSend({ type: "login", username: "기존사용자", password: "pw123456" });
    await sock.waitFor((m) => m.type === "authOk" || m.type === "error");
    expect(sock.last("authOk")?.isAdmin).toBe(false);
    expect(sock.all("pong")).toHaveLength(1);

    sock.clientSend({ type: "joinRoom", code: "ABCD" });
    await sock.waitFor((m) => m.type === "error");
    expect(sock.last("error").code).toBe("MAINTENANCE");
    // 로그아웃도 통한다 — 관리자 계정으로 갈아타는 길.
    sock.clientSend({ type: "logout" });
    sock.clientSend({ type: "createRoom" });
    await sock.waitFor((m) => m.type === "error" && sock.all("error").length >= 2);
    expect(sock.last("error").code).toBe("MAINTENANCE");
  });
});

describe("점검 모드 — 관리자는 평소와 같다", () => {
  it("방도 만들고 관리자 조회도 되고, 재시작 뒤에도 그렇다", async () => {
    const h = await newHarness();
    const admin = await connectUser(h, "관리자", h.db.adminCode());
    admin.clientSend({ type: "adminSetMaintenance", on: true, body: "점검" });
    await admin.waitFor((m) => m.type === "serverInfo" && m.maintenance !== undefined);

    admin.clientSend({ type: "createRoom" });
    await admin.waitFor((m) => m.type === "roomCreated" || m.type === "lobby");
    expect(errorCodes(admin)).toEqual([]);
    admin.clientSend({ type: "leaveRoom" });
    admin.clientSend({ type: "adminOnline" });
    await admin.waitFor((m) => m.type === "adminOnline");
    expect(errorCodes(admin)).toEqual([]);

    // 재시작: 같은 DB로 새 RoomManager — 점검은 살아 있고 관리자는 여전히 통한다.
    const h2 = await newHarness(h.db);
    const sock = new FakeSocket();
    h2.rm.handleConnection(sock.asWs());
    expect(sock.last("serverInfo").maintenance.body).toBe("점검");
    sock.clientSend({ type: "login", username: "관리자", password: "pw123456" });
    await sock.waitFor((m) => m.type === "authOk" || m.type === "error");
    expect(sock.last("authOk").isAdmin).toBe(true);
    sock.clientSend({ type: "leaderboard" });
    await sock.waitFor((m) => m.type === "leaderboard");
    expect(errorCodes(sock)).toEqual([]);
  });
});
