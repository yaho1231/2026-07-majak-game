/**
 * 익명 연결 슬롯 회귀 테스트 — 감사 2026-08-12 §H-1.
 *
 * `UNAUTH_TIMEOUT_MS`가 30초→10분으로 오르면서 미인증 스쿼팅 비용이 20배 싸졌는데
 * 전역 연결 상한은 인증 여부를 구분하지 않았다. 그래서 IPv6 `/64` 19개면 300칸이
 * 전부 익명 소켓으로 찼고, **진행 중인 판에서 끊긴 사람이 재접속할 자리가 없어졌다**.
 *
 * 여기서 못박는 것은 두 가지다:
 *   1) 로그인한 사람 몫의 자리는 익명이 먹지 못한다 (상한).
 *   2) 그렇다고 익명 자리가 "선착순 고정석"이 되지도 않는다 (회수) — 안 그러면
 *      공격자가 붙들고 있는 동안 새 손님이 로그인 화면에조차 못 온다.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WebSocket } from "ws";
import { RoomManager } from "../src/RoomManager.js";
import { SiteDb } from "../src/SiteDb.js";
import { StatsStore } from "../src/StatsStore.js";

class FakeSocket {
  readyState = 1;
  sent: any[] = [];
  closed: { code?: number; reason?: string } | null = null;
  private handlers: Record<string, ((...a: any[]) => void)[]> = {};

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
  on(event: string, cb: (...a: any[]) => void): void {
    (this.handlers[event] ??= []).push(cb);
  }
  close(code?: number, reason?: string): void {
    if (this.readyState === 3) return;
    this.closed = {
      ...(code !== undefined ? { code } : {}),
      ...(reason !== undefined ? { reason } : {}),
    };
    this.readyState = 3;
    for (const cb of this.handlers.close ?? []) cb();
  }
  terminate(): void {
    this.close(1006, "terminated");
  }
  clientSend(msg: unknown): void {
    for (const cb of this.handlers.message ?? []) cb(Buffer.from(JSON.stringify(msg)));
  }
  last(type: string): any {
    return [...this.sent].reverse().find((m) => m.type === type);
  }
  waitFor(type: string, timeoutMs = 5_000): Promise<any> {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const tick = (): void => {
        const hit = this.last(type);
        if (hit !== undefined) return resolve(hit);
        if (Date.now() - start > timeoutMs) return reject(new Error(`waitFor ${type} timeout`));
        setTimeout(tick, 5);
      };
      tick();
    });
  }
  asWs(): WebSocket {
    return this as unknown as WebSocket;
  }
}

const dirs: string[] = [];
const dbs: SiteDb[] = [];

async function newHarness(): Promise<{ rm: RoomManager; db: SiteDb }> {
  const replayDir = await mkdtemp(join(tmpdir(), "majak-anon-"));
  dirs.push(replayDir);
  const store = new StatsStore(join(replayDir, "stats.json"));
  await store.load();
  const db = new SiteDb(":memory:");
  dbs.push(db);
  return { rm: new RoomManager(replayDir, store, 0, db, ""), db };
}

/** 서로 다른 IP로 n개 연결 — IP당 동시 연결 상한(16)에 걸리지 않게 한다. */
function openMany(rm: RoomManager, n: number, from = 0): FakeSocket[] {
  const socks: FakeSocket[] = [];
  for (let i = 0; i < n; i++) {
    const s = new FakeSocket();
    rm.handleConnection(s.asWs(), `203.0.113.${from + i}`, false);
    socks.push(s);
  }
  return socks;
}

beforeEach(() => {
  process.env.MAX_ANON_CONNECTIONS = "4";
});

afterEach(async () => {
  delete process.env.MAX_ANON_CONNECTIONS;
  delete process.env.ANON_EVICT_GRACE_MS;
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  for (const db of dbs.splice(0)) db.close();
});

describe("익명 연결 상한", () => {
  it("상한까지는 그대로 받는다", async () => {
    const h = await newHarness();
    const socks = openMany(h.rm, 4);
    expect(socks.every((s) => s.closed === null)).toBe(true);
    expect(h.rm.healthSnapshot()).toMatchObject({ connections: 4, anonymous: 4, anonymousMax: 4 });
  });

  /**
   * H-1의 본체. 예전에는 익명 연결이 전역 300칸을 통째로 먹을 수 있었다.
   * 유예 안이라 회수할 대상이 없으므로 새 연결을 거절해야 한다.
   */
  it("상한을 넘고 회수할 대상도 없으면 새 익명 연결을 거절한다", async () => {
    process.env.ANON_EVICT_GRACE_MS = "60000"; // 방금 들어온 연결은 건드리지 않는다
    const h = await newHarness();
    openMany(h.rm, 4);
    const extra = openMany(h.rm, 1, 100)[0]!;
    expect(extra.closed?.code).toBe(1013);
    expect(extra.closed?.reason).toBe("too many anonymous connections");
    expect(h.rm.healthSnapshot().connections).toBe(4);
  });

  it("유예가 지난 오래된 익명 연결이 있으면 그것을 회수하고 새 손님을 받는다", async () => {
    // 유예 0 = 이미 앉아 있는 익명 연결은 언제든 회수 대상.
    process.env.ANON_EVICT_GRACE_MS = "0";
    const h = await newHarness();
    const squatters = openMany(h.rm, 4);
    const visitor = openMany(h.rm, 1, 100)[0]!;

    // 새 손님은 들어왔고, 가장 오래된 스쿼터가 자리를 내줬다.
    expect(visitor.closed).toBeNull();
    expect(squatters[0]!.closed?.code).toBe(1013);
    expect(squatters.slice(1).every((s) => s.closed === null)).toBe(true);
    expect(h.rm.healthSnapshot().connections).toBe(4);
  });

  it("회수는 항상 가장 오래된 익명 연결부터다", async () => {
    process.env.ANON_EVICT_GRACE_MS = "0";
    const h = await newHarness();
    const socks = openMany(h.rm, 4);
    openMany(h.rm, 2, 100);
    // 앞의 둘이 순서대로 나가고 뒤의 둘은 남는다.
    expect(socks.map((s) => s.closed !== null)).toEqual([true, true, false, false]);
  });

  it("회수해도 IP별 연결 카운터가 두 번 줄지 않는다 (handleClose 멱등)", async () => {
    process.env.ANON_EVICT_GRACE_MS = "0";
    const h = await newHarness();
    // 같은 IP로 익명 상한만큼 열고, 회수를 두 번 유발한다.
    const socks: FakeSocket[] = [];
    for (let i = 0; i < 6; i++) {
      const s = new FakeSocket();
      h.rm.handleConnection(s.asWs(), "198.51.100.9", false);
      socks.push(s);
    }
    // 카운터가 음수로 새면 IP당 상한(16)이 헐거워져 여기서 6을 넘긴다.
    expect(h.rm.healthSnapshot().connections).toBe(4);
    // 남은 연결을 전부 닫아도 카운터가 정상이라 다시 상한까지 열린다.
    for (const s of socks) s.close();
    expect(h.rm.healthSnapshot().connections).toBe(0);
    const again = openMany(h.rm, 4, 200);
    expect(again.every((s) => s.closed === null)).toBe(true);
  });

  it("진짜 로컬 연결(exempt)은 이 상한을 적용받지 않는다 (개발·테스트 경로 유지)", async () => {
    const h = await newHarness();
    const socks: FakeSocket[] = [];
    for (let i = 0; i < 10; i++) {
      const s = new FakeSocket();
      h.rm.handleConnection(s.asWs(), "127.0.0.1", true);
      socks.push(s);
    }
    expect(socks.every((s) => s.closed === null)).toBe(true);
  });
});

describe("무엇이 익명인가", () => {
  it("로그인하면 익명 풀에서 빠진다 — 그 자리는 회수 대상이 아니다", async () => {
    process.env.ANON_EVICT_GRACE_MS = "0";
    const h = await newHarness();
    await h.db.register("주인장", "correct-horse-1");

    const member = new FakeSocket();
    h.rm.handleConnection(member.asWs(), "203.0.113.250", false);
    member.clientSend({ type: "login", username: "주인장", password: "correct-horse-1" });
    await member.waitFor("authOk");
    expect(h.rm.healthSnapshot()).toMatchObject({ connections: 1, anonymous: 0 });

    // 익명 상한을 꽉 채우고 회수를 여러 번 유발해도 로그인한 연결은 건드리지 않는다.
    openMany(h.rm, 4);
    openMany(h.rm, 3, 100);
    expect(member.closed).toBeNull();
    expect(h.rm.healthSnapshot()).toMatchObject({ connections: 5, anonymous: 4 });
  });

  /**
   * 게스트는 `conn.user`에 DB에 없는 임시 신원이 들어가 "인증됨"처럼 보인다.
   * 익명으로 세지 않으면 `guestPlay` 한 번으로 이 상한을 통째로 빠져나간다.
   */
  it("게스트는 익명으로 센다 — guestPlay로 상한을 빠져나갈 수 없다", async () => {
    const h = await newHarness();
    const guest = new FakeSocket();
    h.rm.handleConnection(guest.asWs(), "203.0.113.240", false);
    guest.clientSend({ type: "guestPlay", mode: "tonpuu" });
    await guest.waitFor("authOk");

    expect(guest.last("authOk").guest).toBe(true);
    expect(h.rm.healthSnapshot()).toMatchObject({ connections: 1, anonymous: 1 });

    // 뒷정리 — 소켓을 닫으면 체험 판도 함께 접힌다.
    guest.close();
    expect(h.rm.healthSnapshot().rooms).toBe(0);
  });

  it("로그아웃하면 다시 익명으로 센다", async () => {
    const h = await newHarness();
    await h.db.register("나그네", "correct-horse-2");
    const sock = new FakeSocket();
    h.rm.handleConnection(sock.asWs(), "203.0.113.230", false);
    sock.clientSend({ type: "login", username: "나그네", password: "correct-horse-2" });
    await sock.waitFor("authOk");
    expect(h.rm.healthSnapshot().anonymous).toBe(0);

    sock.clientSend({ type: "logout" });
    expect(h.rm.healthSnapshot().anonymous).toBe(1);
  });
});
