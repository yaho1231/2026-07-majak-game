/**
 * **좌석이 다른 창으로 옮겨 가면 옛 창도 그 사실을 안다** (QA 2차 server 확정 2).
 *
 * 한 좌석은 언제나 연결 하나만 몬다(`detachStaleConns`) — 그건 이미 맞다. 문제는
 * 떼어낸 뒤였다: 옛 연결의 `room`·`agent`를 조용히 null로만 만들고 아무 것도 보내지
 * 않았다. 그 뒤 옛 탭이 보내는 `action`/`draftPick`/`roundContinue`는
 * `conn.agent?.handleMessage(msg)`의 옵셔널 체이닝에 통째로 삼켜져 **오류 한 줄조차**
 * 돌아가지 않았다.
 *
 * 폰과 PC를 오가거나 탭을 하나 더 연 사람이 흔히 겪는다. 옛 탭에는 마지막 뷰가
 * 그대로 남고 초읽기도 계속 돈다. 누르는 대로 아무 반응이 없으니 "서버가 죽었다"로
 * 읽히고, 그러는 사이 진짜 결정은 새 탭에서 시간이 흘러 자동 진행된다.
 *
 * 여기서 보는 것은 둘이다.
 *   1. 좌석을 넘겨받는 순간 **옛 연결에 사유가 간다** (SESSION_REPLACED).
 *   2. 그 뒤 옛 연결이 판을 움직이려 하면 **거절이 돌아온다** (NOT_IN_ROOM) —
 *      조용히 사라지지 않는다.
 * 소켓은 닫지 않는다(계정은 멀쩡하다·핑퐁 방지) — 그 사실도 함께 못 박는다.
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
  closed = false;
  private handlers: Record<string, ((...a: any[]) => void)[]> = {};
  private waiters: { pred: (m: any) => boolean; resolve: () => void; timer: any }[] = [];

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
    this.closed = true;
    this.readyState = 3;
    this.emit("close");
  }
  clientSend(msg: unknown): void {
    this.emit("message", Buffer.from(JSON.stringify(msg)));
  }
  all(type: string): any[] {
    return this.sent.filter((m) => m.type === type);
  }
  clear(): void {
    this.sent = [];
  }
  waitFor(pred: (m: any) => boolean, timeoutMs = 20_000): Promise<void> {
    if (this.sent.some(pred)) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("waitFor timeout")), timeoutMs);
      this.waiters.push({ pred, resolve, timer });
    });
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

afterEach(async () => {
  for (const m of managers.splice(0)) {
    m.shutdown("테스트 정리");
    m.stop();
  }
  await new Promise((r) => setTimeout(r, 0));
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  for (const db of dbs.splice(0)) db.close();
});

async function newManager(): Promise<{ rm: RoomManager; db: SiteDb }> {
  const dir = await mkdtemp(join(tmpdir(), "majak-dualtab-"));
  dirs.push(dir);
  const store = new StatsStore(join(dir, "stats.json"));
  await store.load();
  const db = new SiteDb(":memory:");
  dbs.push(db);
  const rm2 = new RoomManager(dir, store, 0, db);
  managers.push(rm2);
  return { rm: rm2, db };
}

describe("좀비 탭 — 좌석이 옮겨 간 창", () => {
  it("좌석을 다른 창에 넘길 때 옛 창에 사유가 가고, 그 뒤 액션은 거절된다", async () => {
    const { rm: manager } = await newManager();

    // 탭1 — 가입하고 방을 만들어 판을 시작한다.
    const tab1 = new FakeSocket();
    manager.handleConnection(tab1.asWs());
    tab1.clientSend({ type: "register", username: "Zombie", password: "pw123456" });
    await tab1.waitFor((m) => m.type === "authOk");
    tab1.clientSend({ type: "createRoom" });
    await tab1.waitFor((m) => m.type === "roomCreated");
    const code = (tab1.sent.find((m) => m.type === "roomCreated") as any).code as string;
    tab1.clientSend({ type: "setGameMode", mode: "tonpuu" });
    for (let i = 0; i < 3; i++) tab1.clientSend({ type: "addBot" });
    tab1.clientSend({ type: "startGame" });
    await tab1.waitFor((m) => m.type === "view");
    tab1.clear();

    // 탭2 — 같은 계정으로 다른 창에서 들어온다 (폰 ↔ PC).
    const tab2 = new FakeSocket();
    manager.handleConnection(tab2.asWs());
    tab2.clientSend({ type: "login", username: "Zombie", password: "pw123456" });
    await tab2.waitFor((m) => m.type === "authOk");
    tab2.clientSend({ type: "joinRoom", code });
    await tab2.waitFor((m) => m.type === "view");

    // 1) 옛 창에 사유가 간다.
    const told = tab1.all("error").find((e) => e.code === "SESSION_REPLACED");
    expect(told, "좌석이 옮겨 갔는데 옛 창에 아무 것도 알리지 않았다").toBeDefined();
    expect(told.message).toContain("다른 곳");
    // 소켓은 살려 둔다 — 계정이 무효가 된 것이 아니고, 끊으면 자동 재입장 핑퐁이 된다.
    expect(tab1.closed, "옛 창의 소켓까지 닫으면 두 창이 서로를 끊는 핑퐁이 된다").toBe(false);

    // 2) 그 뒤 옛 창이 판을 움직이려 하면 거절이 돌아온다 (조용히 사라지지 않는다).
    tab1.clear();
    tab1.clientSend({ type: "action", actionType: "pass", payload: {} });
    tab1.clientSend({ type: "roundContinue" });
    await tab1.waitFor((m) => m.type === "error" && m.code === "NOT_IN_ROOM", 5_000);
    expect(
      tab1.all("error").filter((e) => e.code === "NOT_IN_ROOM").length,
      "옛 창의 조작이 오류도 없이 삼켜졌다",
    ).toBeGreaterThanOrEqual(2);

    // 3) 좌석은 새 창이 정상적으로 몬다 — 떼어내기 자체가 망가지면 안 된다.
    expect(tab2.all("view").length).toBeGreaterThan(0);
  }, 60_000);
});
