/**
 * QA 4라운드 server 수정 회귀 — «닫히기 전에 말한다»와 «재연결 뒤의 나가기».
 *
 * 두 결함 모두 **조용한 실패**였다: 하나는 방이 예고 없이 사라졌고, 하나는 화면만
 * 나가고 좌석은 방에 남았다. 그래서 여기서는 "무엇이 사용자에게 실제로 전달됐는가"
 * (알림 한 줄)와 "서버 상태가 실제로 정리됐는가"(좌석·방)를 함께 본다.
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
  readyState = 1;
  sent: any[] = [];
  private handlers: Record<string, ((...a: any[]) => void)[]> = {};

  send(data: string): void {
    this.sent.push(JSON.parse(data));
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
  async waitFor(pred: (m: any) => boolean, timeoutMs = 5000): Promise<any> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const hit = this.sent.find(pred);
      if (hit !== undefined) return hit;
      await new Promise((r) => setTimeout(r, 5));
    }
    throw new Error("기다리던 메시지가 오지 않았다");
  }
  asWs(): WebSocket {
    return this as unknown as WebSocket;
  }
}

const dirs: string[] = [];
const dbs: SiteDb[] = [];
const managers: RoomManager[] = [];

async function newManager(): Promise<{ rm: RoomManager; db: SiteDb }> {
  const dir = await mkdtemp(join(tmpdir(), "majak-idle-"));
  dirs.push(dir);
  const store = new StatsStore(join(dir, "stats.json"));
  await store.load();
  const db = new SiteDb(":memory:");
  dbs.push(db);
  const manager = new RoomManager(dir, store, 0, db);
  managers.push(manager);
  return { rm: manager, db };
}

async function register(manager: RoomManager, username: string): Promise<FakeSocket> {
  const sock = new FakeSocket();
  manager.handleConnection(sock.asWs());
  sock.clientSend({ type: "register", username, password: "pw123456" });
  await sock.waitFor((m) => m.type === "authOk");
  return sock;
}


/** 드래프트가 있으면 첫 카드로 넘기면서 첫 뷰가 나올 때까지 기다린다. */
async function playUntilView(sock: FakeSocket, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastOffer: unknown = null;
  while (Date.now() < deadline) {
    if (sock.last("view") !== undefined) return;
    const offer = sock.last("draftOffer");
    if (offer !== undefined && offer !== lastOffer) {
      lastOffer = offer;
      sock.clientSend({ type: "draftPick", stage: offer.stage, augmentId: offer.choices[0].id });
    }
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("view가 오지 않았다");
}

afterEach(async () => {
  for (const m of managers.splice(0)) m.stop();
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  for (const db of dbs.splice(0)) db.close();
  delete process.env.ROOM_IDLE_TTL_MS;
  delete process.env.ROOM_IDLE_WARN_MS;
});

describe("유휴 방은 닫히기 전에 알린다 (loop P2)", () => {
  it("예고를 한 번 보내고, 그 뒤 진짜로 닫을 때 사유를 담는다", async () => {
    // 상한 10초 · 예고는 닫히기 8초 전 → 방을 만든 직후가 이미 예고 구간이다.
    process.env.ROOM_IDLE_TTL_MS = "10000";
    process.env.ROOM_IDLE_WARN_MS = "8000";
    const { rm: manager } = await newManager();
    const sock = await register(manager, "idle1");
    sock.clientSend({ type: "createRoom" });
    await sock.waitFor((m) => m.type === "roomCreated");

    manager.sweepIdleRooms();
    const warn = await sock.waitFor((m) => m.code === "ROOM_IDLE_WARNING");
    expect(warn.message).toContain("자동으로 닫힙니다");
    // 두 번 부르지 않는다 — 예고는 한 번이다.
    manager.sweepIdleRooms();
    expect(sock.sent.filter((m) => m.code === "ROOM_IDLE_WARNING")).toHaveLength(1);

    // 상한을 0으로 낮추면 이번 회차에 닫힌다 — 사유가 초대 링크까지 말해야 한다.
    process.env.ROOM_IDLE_TTL_MS = "0";
    manager.sweepIdleRooms();
    const closed = await sock.waitFor((m) => m.code === "ROOM_IDLE_CLOSED");
    expect(closed.message).toContain("초대 링크");
  });

  it("대기실에서 무엇이든 누르면 예고 시계가 되돌아간다", async () => {
    process.env.ROOM_IDLE_TTL_MS = "10000";
    process.env.ROOM_IDLE_WARN_MS = "8000";
    const { rm: manager } = await newManager();
    const sock = await register(manager, "idle2");
    sock.clientSend({ type: "createRoom" });
    await sock.waitFor((m) => m.type === "roomCreated");

    manager.sweepIdleRooms();
    await sock.waitFor((m) => m.code === "ROOM_IDLE_WARNING");
    sock.clientSend({ type: "addBot" }); // 조작 = touch
    await new Promise((r) => setTimeout(r, 20));
    manager.sweepIdleRooms();
    // 시계가 되돌아갔으니 예고가 다시 «한 번» 나온다(누적 2회) — 굳어 버리지 않는다.
    expect(sock.sent.filter((m) => m.code === "ROOM_IDLE_WARNING").length).toBe(2);
  });
});

describe("재연결 뒤에 도착한 나가기 (netfail P2)", () => {
  it("끊긴 좌석의 leaveRoom은 새 연결로 와도 좌석을 정리한다", async () => {
    const { rm: manager } = await newManager();
    const sock = await register(manager, "leaver");
    const token = sock.last("authOk").sessionToken as string;
    sock.clientSend({ type: "createRoom" });
    const created = await sock.waitFor((m) => m.type === "roomCreated");
    const code = created.code as string;
    for (let i = 0; i < 3; i++) sock.clientSend({ type: "addBot" });
    sock.clientSend({ type: "startGame" });
    await playUntilView(sock);

    // 회선이 끊겼다 → 재전송 큐에 담긴 leaveRoom이 **새 연결**로 도착한다.
    sock.close();
    // 진행 중인 판의 좌석은 끊겨도 남는다(재접속용) — 그래서 나가기가 닿아야 한다.
    expect((manager as any).rooms.has(code)).toBe(true);
    expect((manager as any).resumableRoomFor("leaver")).toBe(code);

    const fresh = new FakeSocket();
    manager.handleConnection(fresh.asWs());
    fresh.clientSend({ type: "tokenLogin", sessionToken: token });
    await fresh.waitFor((m) => m.type === "authOk");
    fresh.clientSend({ type: "leaveRoom" });
    await new Promise((r) => setTimeout(r, 50));

    // 좌석이 실제로 포기됐다 — 홈의 «진행하던 방으로 재접속»도 함께 사라진다.
    // (예전에는 conn.room 이 null 이라 아무 일도, 아무 말도 없었다.)
    expect((manager as any).resumableRoomFor("leaver")).toBeNull();
    manager.shutdown();
  }, 30_000);

  it("돌아갈 방이 없으면 조용히 지나간다 (오류를 만들지 않는다)", async () => {
    const { rm: manager } = await newManager();
    const sock = await register(manager, "nobody");
    sock.sent.length = 0;
    sock.clientSend({ type: "leaveRoom" });
    await new Promise((r) => setTimeout(r, 20));
    expect(sock.sent.filter((m) => m.type === "error")).toHaveLength(0);
  });
});
