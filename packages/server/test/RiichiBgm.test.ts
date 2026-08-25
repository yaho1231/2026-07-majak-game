/**
 * 리치 BGM 배정 — «곡은 사람마다 고정되고, 네 사람이 같은 값을 본다».
 *
 * 지켜야 할 것 셋:
 *  · 직접 고른 곡은 **그 사람의 곡**이다 (남의 화면에서도 그 곡이 나온다).
 *  · 랜덤은 그 방에서 **한 곡으로 배정**되고 그 뒤로 흔들리지 않는다 — 리치 때마다
 *    다시 뽑으면 자리마다 다른 곡이 나와 "모두 같은 곡"이 깨진다.
 *  · 배정된 곡은 **본인에게도** 같은 값으로 내려간다 (내 브금을 나만 못 듣는 일 없음).
 *
 * Emote.test.ts와 같은 FakeSocket 방식(실제 네트워크·파일 없음).
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WebSocket } from "ws";
import { RIICHI_BGM_TRACKS, RIICHI_BGM_RANDOM } from "@majak/core";
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

async function newHarness(): Promise<{ rm: RoomManager }> {
  const dir = await mkdtemp(join(tmpdir(), "majak-bgm-"));
  dirs.push(dir);
  const store = new StatsStore(join(dir, "stats.json"));
  await store.load();
  const db = new SiteDb(":memory:");
  dbs.push(db);
  return { rm: new RoomManager(dir, store, 0, db) };
}

async function connectAs(h: { rm: RoomManager }, username: string): Promise<FakeSocket> {
  const sock = new FakeSocket();
  h.rm.handleConnection(sock.asWs());
  sock.clientSend({ type: "register", username, password: "pw123456" });
  await sock.waitFor((m) => m.type === "authOk" || m.type === "error");
  return sock;
}

async function seatedPair(): Promise<{ a: FakeSocket; b: FakeSocket }> {
  const h = await newHarness();
  const a = await connectAs(h, "Alice");
  a.clientSend({ type: "createRoom" });
  await a.waitFor((m) => m.type === "roomCreated");
  const code = a.last("roomCreated").code as string;
  const b = await connectAs(h, "Bob");
  b.clientSend({ type: "joinRoom", code });
  await b.waitFor((m) => m.type === "joined");
  return { a, b };
}

/** 내 playerId — joined 메시지가 알려 준다. */
function idOf(sock: FakeSocket): string {
  return sock.last("joined").playerId as string;
}

afterEach(async () => {
  for (const db of dbs.splice(0)) db.close();
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

describe("리치 BGM — 사람마다 한 곡, 모두가 같은 값을 본다", () => {
  it("직접 고른 곡이 같은 방 전원에게 그 사람의 곡으로 내려간다", async () => {
    const { a, b } = await seatedPair();
    const aId = idOf(a);
    a.clear();
    b.clear();
    a.clientSend({ type: "setRiichiBgm", track: 1 });
    await b.waitFor((m) => m.type === "riichiBgm" && m.tracks[aId] === 1);

    // 본인에게도 같은 값으로 온다 — 내 리치에 나만 다른 곡을 듣지 않는다.
    expect(a.last("riichiBgm").tracks[aId]).toBe(1);
  });

  it("랜덤은 한 곡으로 배정되고 그 뒤로 바뀌지 않는다", async () => {
    const { a, b } = await seatedPair();
    const bId = idOf(b);
    b.clientSend({ type: "setRiichiBgm", track: RIICHI_BGM_RANDOM });
    await b.waitFor((m) => m.type === "riichiBgm" && typeof m.tracks[bId] === "number");
    const assigned = b.last("riichiBgm").tracks[bId] as number;
    expect(assigned).toBeGreaterThanOrEqual(0);
    expect(assigned).toBeLessThan(RIICHI_BGM_TRACKS);

    // 다른 사람이 선택을 바꿔 방송이 다시 나가도 내 곡은 그대로다.
    b.clear();
    a.clientSend({ type: "setRiichiBgm", track: 0 });
    await b.waitFor((m) => m.type === "riichiBgm");
    expect(b.last("riichiBgm").tracks[bId]).toBe(assigned);
  });

  it("랜덤끼리는 서로 다른 곡을 받는다 (곡이 사람보다 많을 때)", async () => {
    const { a, b } = await seatedPair();
    const aId = idOf(a);
    const bId = idOf(b);
    a.clientSend({ type: "setRiichiBgm", track: RIICHI_BGM_RANDOM });
    b.clientSend({ type: "setRiichiBgm", track: RIICHI_BGM_RANDOM });
    await b.waitFor(
      (m) =>
        m.type === "riichiBgm" &&
        typeof m.tracks[aId] === "number" &&
        typeof m.tracks[bId] === "number",
    );
    const t = b.last("riichiBgm").tracks;
    expect(t[aId]).not.toBe(t[bId]);
  });
});
