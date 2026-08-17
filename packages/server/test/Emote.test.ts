/**
 * 정형구(고정 문구) 통합 테스트 — 감사 2026-08-17 §4-9.
 *
 * 지켜야 할 것 셋:
 *  · **목록에 있는 id만** 남에게 나간다. 클라이언트가 보낸 문자열이 그대로 전달되면
 *    그건 이미 자유 채팅이고, 고정 문구를 고른 이유가 사라진다.
 *  · **같은 방 사람에게만** 간다. 방 밖으로는 한 글자도 나가지 않는다.
 *  · **도배가 막힌다.** 문구가 여덟 개뿐이어도 초당 스무 번이면 도배다.
 *
 * Feedback.test.ts와 같은 FakeSocket 방식(실제 네트워크·파일 없음).
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WebSocket } from "ws";
import { EMOTES } from "@majak/core";
import { RoomManager } from "../src/RoomManager.js";
import { StatsStore } from "../src/StatsStore.js";
import { SiteDb } from "../src/SiteDb.js";

class FakeSocket {
  readyState = 1; // OPEN
  sent: any[] = [];
  private handlers: Record<string, ((...a: any[]) => void)[]> = {};
  private waiters: {
    pred: (m: any) => boolean;
    resolve: () => void;
    timer: ReturnType<typeof setTimeout>;
  }[] = [];

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

  clientSend(msg: unknown): void {
    this.emit("message", Buffer.from(JSON.stringify(msg)));
  }

  last(type: string): any {
    return [...this.sent].reverse().find((m) => m.type === type);
  }

  all(type: string): any[] {
    return this.sent.filter((m) => m.type === type);
  }

  clear(): void {
    this.sent = [];
  }

  waitFor(pred: (m: any) => boolean, timeoutMs = 10_000): Promise<void> {
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

interface Harness {
  rm: RoomManager;
  db: SiteDb;
}

async function newHarness(): Promise<Harness> {
  const dir = await mkdtemp(join(tmpdir(), "majak-emote-"));
  dirs.push(dir);
  const store = new StatsStore(join(dir, "stats.json"));
  await store.load();
  const db = new SiteDb(":memory:");
  dbs.push(db);
  return { rm: new RoomManager(dir, store, 0, db), db };
}

async function connectAs(h: Harness, username: string): Promise<FakeSocket> {
  const sock = new FakeSocket();
  h.rm.handleConnection(sock.asWs());
  sock.clientSend({ type: "register", username, password: "pw123456" });
  await sock.waitFor((m) => m.type === "authOk" || m.type === "error");
  return sock;
}

/** 두 사람이 한 방에 앉은 상태를 만든다. */
async function seatedPair(): Promise<{ h: Harness; a: FakeSocket; b: FakeSocket; code: string }> {
  const h = await newHarness();
  const a = await connectAs(h, "Alice");
  a.clientSend({ type: "createRoom" });
  await a.waitFor((m) => m.type === "roomCreated");
  const code = a.last("roomCreated").code as string;

  const b = await connectAs(h, "Bob");
  b.clientSend({ type: "joinRoom", code });
  await b.waitFor((m) => m.type === "joined");
  return { h, a, b, code };
}

afterEach(async () => {
  for (const db of dbs.splice(0)) db.close();
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

describe("정형구 — 같은 방 사람들에게 문구가 전해진다", () => {
  it("보낸 문구가 같은 방 전원에게 간다 (보낸 사람 포함)", async () => {
    const { a, b } = await seatedPair();
    a.clear();
    b.clear();
    a.clientSend({ type: "emote", id: "thanks" });
    await b.waitFor((m) => m.type === "emoteFrom");

    const got = b.last("emoteFrom");
    expect(got.id).toBe("thanks");
    expect(got.nickname).toBe("Alice");
    // 보낸 사람에게도 간다 — 안 그러면 "보내졌나?"를 알 수 없다.
    expect(a.last("emoteFrom")?.id).toBe("thanks");
  });

  it("목록에 없는 문구는 나가지 않는다", async () => {
    const { a, b } = await seatedPair();
    a.clear();
    b.clear();
    // 자유 채팅으로 가는 문을 여는 시도 — 서버가 거른다.
    a.clientSend({ type: "emote", id: "<script>alert(1)</script>" });
    await a.waitFor((m) => m.type === "error");
    expect(a.last("error").code).toBe("INVALID_ACTION");
    expect(b.all("emoteFrom")).toHaveLength(0);
  });

  it("문자열이 아닌 값도 거른다", async () => {
    const { a, b } = await seatedPair();
    a.clear();
    b.clear();
    a.clientSend({ type: "emote", id: { toString: "nope" } });
    await a.waitFor((m) => m.type === "error");
    expect(b.all("emoteFrom")).toHaveLength(0);
  });

  it("방에 없으면 보낼 수 없다", async () => {
    const h = await newHarness();
    const lone = await connectAs(h, "Carol");
    lone.clear();
    lone.clientSend({ type: "emote", id: "greet" });
    await lone.waitFor((m) => m.type === "error");
    expect(lone.last("error").code).toBe("NOT_IN_ROOM");
  });

  it("다른 방에는 새지 않는다", async () => {
    const { h, a } = await seatedPair();
    const outsider = await connectAs(h, "Dave");
    outsider.clientSend({ type: "createRoom" });
    await outsider.waitFor((m) => m.type === "roomCreated");
    outsider.clear();

    a.clientSend({ type: "emote", id: "greet" });
    await a.waitFor((m) => m.type === "emoteFrom");
    expect(outsider.all("emoteFrom")).toHaveLength(0);
  });

  it("도배는 막힌다 (창 안에서 상한을 넘으면 거절)", async () => {
    const { a, b } = await seatedPair();
    a.clear();
    b.clear();
    // 상한(10초에 5번)을 넘겨 본다.
    for (let i = 0; i < 8; i++) a.clientSend({ type: "emote", id: "greet" });
    await a.waitFor((m) => m.type === "error");

    expect(a.last("error").code).toBe("RATE_LIMITED");
    // 통과한 것은 상한만큼이다 — 조용히 다 버리지도, 다 통과시키지도 않는다.
    expect(b.all("emoteFrom").length).toBeLessThanOrEqual(5);
    expect(b.all("emoteFrom").length).toBeGreaterThan(0);
  });

  it("목록에 있는 문구는 전부 실제로 보낼 수 있다", async () => {
    // 화면에 버튼으로 뜨는데 서버가 거절하는 문구가 있으면 그건 고장이다.
    // (레이트리밋에 걸리지 않게 매번 새 연결로 보낸다.)
    for (const e of EMOTES) {
      const { a } = await seatedPair();
      a.clear();
      a.clientSend({ type: "emote", id: e.id });
      await a.waitFor((m) => m.type === "emoteFrom" || m.type === "error");
      expect(a.last("error"), `${e.id} 가 거절됐다`).toBeUndefined();
      expect(a.last("emoteFrom").id).toBe(e.id);
    }
  });
});
