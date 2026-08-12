/**
 * 비싼 조회 레이트리밋 회귀 테스트 — 감사 2026-08-12 §M-1.
 *
 * 토큰버킷은 메시지 **개수**만 센다. 그런데 `replayList` 1회는 동기 SQLite 쿼리
 * 51회(관리자 201회)고 `ping` 1회는 사실상 공짜다. `node:sqlite`는 동기라, 계정
 * 하나가 초당 40회를 보내면 이벤트 루프가 멈추고 **서버의 모든 대국이 함께 멈춘다**.
 *
 * 여기서 못박는 것: 비싼 조회는 종류별로 창이 따로 있고, 정상 클라이언트가 로그인
 * 직후 종류별 1회씩 보내는 사용은 그 창을 먹지 않는다.
 */

import { afterEach, describe, expect, it } from "vitest";
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
  count(type: string): number {
    return this.sent.filter((m) => m.type === type).length;
  }
  countErr(code: string): number {
    return this.sent.filter((m) => m.type === "error" && m.code === code).length;
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
  const replayDir = await mkdtemp(join(tmpdir(), "majak-heavy-"));
  dirs.push(replayDir);
  const store = new StatsStore(join(replayDir, "stats.json"));
  await store.load();
  const db = new SiteDb(":memory:");
  dbs.push(db);
  return { rm: new RoomManager(replayDir, store, 0, db, ""), db };
}

/** 원격(면제 없음) 연결로 로그인한 소켓 하나. */
async function loggedIn(
  h: { rm: RoomManager; db: SiteDb },
  name: string,
  ip = "203.0.113.5",
): Promise<FakeSocket> {
  await h.db.register(name, "correct-horse-battery");
  const sock = new FakeSocket();
  h.rm.handleConnection(sock.asWs(), ip, false);
  sock.clientSend({ type: "login", username: name, password: "correct-horse-battery" });
  await sock.waitFor("authOk");
  return sock;
}

afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  for (const db of dbs.splice(0)) db.close();
});

describe("비싼 조회는 개수가 아니라 비용으로 막는다", () => {
  it("replayList 폭주는 창당 5회로 접힌다 — 토큰버킷(40/s)이 아니라", async () => {
    const h = await newHarness();
    const sock = await loggedIn(h, "폭주자");
    sock.sent.length = 0;

    for (let i = 0; i < 40; i++) sock.clientSend({ type: "replayList" });

    expect(sock.count("replayList")).toBe(5);
    expect(sock.countErr("RATE_LIMITED")).toBe(35);
  });

  it("창은 종류마다 따로다 — 한 조회가 다른 조회의 몫을 먹지 않는다", async () => {
    const h = await newHarness();
    const sock = await loggedIn(h, "탐색자");
    sock.sent.length = 0;

    for (let i = 0; i < 20; i++) sock.clientSend({ type: "replayList" });
    // replayList를 다 써도 리더보드·제보는 그대로 열려 있다.
    sock.clientSend({ type: "leaderboard" });
    sock.clientSend({ type: "feedbackList" });

    expect(sock.count("leaderboard")).toBe(1);
    expect(sock.count("feedbackList")).toBe(1);
  });

  /**
   * 클라이언트는 인증 직후 statsRequest·replayList·leaderboard·feedbackList를
   * 한꺼번에 보낸다. 공용 창 하나로 묶었으면 정상 로그인 한 번이 창을 다 먹어
   * 그 뒤 사람이 누른 조회가 거부됐을 것이다.
   */
  it("정상 클라이언트의 로그인 직후 일괄 조회는 전부 통과한다", async () => {
    const h = await newHarness();
    const sock = await loggedIn(h, "손님갑");
    sock.sent.length = 0;

    for (const type of ["statsRequest", "replayList", "leaderboard", "feedbackList"]) {
      sock.clientSend({ type });
    }
    expect(sock.countErr("RATE_LIMITED")).toBe(0);
    expect(sock.count("replayList")).toBe(1);
    expect(sock.count("leaderboard")).toBe(1);
  });

  it("재연결이 몇 번 겹쳐도(종류당 5회까지) 여유가 남는다", async () => {
    const h = await newHarness();
    const sock = await loggedIn(h, "재접속");
    sock.sent.length = 0;
    for (let i = 0; i < 5; i++) sock.clientSend({ type: "leaderboard" });
    expect(sock.countErr("RATE_LIMITED")).toBe(0);
  });

  it("게임 진행 메시지는 이 창에 걸리지 않는다", async () => {
    const h = await newHarness();
    const sock = await loggedIn(h, "대국자");
    sock.sent.length = 0;
    for (let i = 0; i < 30; i++) sock.clientSend({ type: "ping" });
    expect(sock.count("pong")).toBe(30);
    expect(sock.countErr("RATE_LIMITED")).toBe(0);
  });

  it("루프백/로컬(개발·테스트)은 면제된다", async () => {
    const h = await newHarness();
    await h.db.register("로컬", "correct-horse-battery");
    const sock = new FakeSocket();
    h.rm.handleConnection(sock.asWs(), "local", true);
    sock.clientSend({ type: "login", username: "로컬", password: "correct-horse-battery" });
    await sock.waitFor("authOk");
    sock.sent.length = 0;

    for (let i = 0; i < 30; i++) sock.clientSend({ type: "replayList" });
    expect(sock.count("replayList")).toBe(30);
  });

  it("연결마다 창이 따로다 — 남의 조회가 내 몫을 먹지 않는다", async () => {
    const h = await newHarness();
    const a = await loggedIn(h, "갑돌이", "203.0.113.11");
    const b = await loggedIn(h, "을순이", "203.0.113.12");
    for (let i = 0; i < 20; i++) a.clientSend({ type: "replayList" });
    b.sent.length = 0;
    b.clientSend({ type: "replayList" });
    expect(b.count("replayList")).toBe(1);
  });
});

describe("SiteDb 준비문 재사용", () => {
  it("같은 SQL은 한 번만 컴파일된다 (목록 조회의 hydrate N+1 비용)", async () => {
    const db = new SiteDb(":memory:");
    dbs.push(db);
    const spy: string[] = [];
    const inner = (db as unknown as { db: { prepare: (s: string) => unknown } }).db;
    const orig = inner.prepare.bind(inner);
    inner.prepare = (sql: string) => {
      spy.push(sql);
      return orig(sql);
    };

    // 캐시를 비워 이 테스트가 컴파일 횟수를 직접 세게 한다.
    (db as unknown as { stmts: Map<string, unknown> }).stmts.clear();
    for (let i = 0; i < 10; i++) db.userByName("없는사람");

    expect(spy.length).toBe(1);
  });

  it("재사용해도 결과는 매번 정확하다 (구문 상태가 새지 않는다)", async () => {
    const db = new SiteDb(":memory:");
    dbs.push(db);
    await db.register("가나", "correct-horse-battery");
    await db.register("다라", "correct-horse-battery");
    expect(db.userByName("가나")?.username).toBe("가나");
    expect(db.userByName("다라")?.username).toBe("다라");
    expect(db.userByName("없음")).toBeNull();
    expect(db.userByName("가나")?.username).toBe("가나");
  });
});
