/**
 * 친구 프레즌스 색인 (`RoomManager.connsByName`) — QA 5라운드 Phase E, S-4 (2026-09-16).
 *
 * `notifyPresenceChanged`가 접속·이탈·대국 시작·종료마다 `conns` 전체를 훑고 친구마다
 * `onlineMap`으로 또 훑던 것을, 닉네임 → 연결 집합 색인 조회로 바꿨다. 색인은 진실
 * (`conns` + `conn.user`)의 파생값이라 **연결이 닫히거나·로그아웃하거나·다시 로그인하거나·
 * 개명하거나·게스트가 되거나** 할 때 정확히 따라가야 한다. 어긋나면 «나간 친구가 접속 중»
 * 이거나 «들어온 친구가 오프라인» — 종전 버그(QA 2차 lobby 확정 4)가 다른 얼굴로 돌아온다.
 *
 * 각 사건 뒤 친구가 받는 `friendList` 프레임의 내용이 (색인 없이 `conns`를 직접 훑어 만든)
 * 기대값과 **바이트 단위로 같은지** 본다 — 프레임 내용이 종전과 같아야 한다는 조건이다.
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
    this.readyState = 3;
    for (const cb of this.handlers["close"] ?? []) cb();
  }
  clientSend(msg: unknown): void {
    for (const cb of this.handlers["message"] ?? []) cb(Buffer.from(JSON.stringify(msg)));
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
const tick = (ms = 30): Promise<void> => new Promise((r) => setTimeout(r, ms));

afterEach(async () => {
  for (const m of managers.splice(0)) {
    m.shutdown("테스트 정리");
    m.stop();
  }
  await new Promise((r) => setTimeout(r, 0));
  for (const d of dirs.splice(0))
    await rm(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  for (const db of dbs.splice(0)) db.close();
});

interface H {
  rm: RoomManager;
  db: SiteDb;
}

async function newHarness(): Promise<H> {
  const dir = await mkdtemp(join(tmpdir(), "majak-presence-"));
  dirs.push(dir);
  const store = new StatsStore(join(dir, "stats.json"));
  await store.load();
  const db = new SiteDb(":memory:", undefined, "ADMINCODE");
  dbs.push(db);
  const manager = new RoomManager(dir, store, 0, db);
  managers.push(manager);
  return { rm: manager, db };
}

async function connect(h: H, msg: Record<string, unknown>): Promise<FakeSocket> {
  const sock = new FakeSocket();
  h.rm.handleConnection(sock.asWs());
  sock.clientSend(msg);
  await sock.waitFor((m) => m.type === "authOk" || m.type === "error");
  if (sock.last("authOk") === undefined) throw new Error(`auth failed: ${JSON.stringify(msg)}`);
  return sock;
}
const reg = (h: H, username: string, adminCode?: string) =>
  connect(h, { type: "register", username, password: "pw123456", ...(adminCode ? { adminCode } : {}) });
const login = (h: H, username: string) =>
  connect(h, { type: "login", username, password: "pw123456" });

async function befriend(a: FakeSocket, aName: string, b: FakeSocket, bName: string): Promise<void> {
  a.clientSend({ type: "friendRequest", nickname: bName });
  await tick();
  b.clientSend({ type: "friendRespond", nickname: aName, accept: true });
  await tick();
}

/** 색인이 아니라 `conns`를 직접 훑어 만든 «진실» — 서버의 색인이 이것과 같아야 한다. */
function truthOnline(h: H): Map<string, boolean> {
  const conns: Set<any> = (h.rm as any).conns;
  const online = new Map<string, boolean>();
  for (const c of conns) {
    if (c.user === null || c.guest) continue;
    const playing = c.room !== null && c.room.phase === "playing";
    online.set(c.user.username, (online.get(c.user.username) ?? false) || playing);
  }
  return online;
}
function indexOnline(h: H): Map<string, boolean> {
  return (h.rm as any).onlineMap();
}
/** 색인이 진실과 같은지 — 키 집합과 값 모두. */
function expectIndexMatchesTruth(h: H, when: string): void {
  const truth = [...truthOnline(h)].sort();
  const index = [...indexOnline(h)].sort();
  expect(index, `색인 ≠ 진실 (${when})`).toEqual(truth);
  // 색인 내부 불변식: 비어 있는 집합이 남지 않고, indexedName 과 connsByName 이 서로 맞는다.
  const byName: Map<string, Set<any>> = (h.rm as any).connsByName;
  const indexed: Map<any, string> = (h.rm as any).indexedName;
  let count = 0;
  for (const [name, set] of byName) {
    expect(set.size, `빈 집합이 남았다: ${name} (${when})`).toBeGreaterThan(0);
    for (const c of set) {
      expect(indexed.get(c), `역참조 불일치 (${when})`).toBe(name);
      count++;
    }
  }
  expect(indexed.size, `indexedName 크기 불일치 (${when})`).toBe(count);
}
/** 친구가 받은 friendList 를 «진실»로 다시 만든 기대값과 바이트 단위로 비교한다. */
function expectFrameEqualsTruth(h: H, sock: FakeSocket, who: string, when: string): void {
  const frame = sock.last("friendList");
  expect(frame, `friendList 가 오지 않았다 (${when})`).toBeDefined();
  const me = h.db.userByName(who)!;
  const online = truthOnline(h);
  const expected = {
    type: "friendList",
    friends: h.db.friendNames(me.id).map((nickname) => ({
      nickname,
      online: online.has(nickname),
      playing: online.get(nickname) === true,
    })),
    incoming: h.db.incomingFriendRequests(me.id),
    outgoing: h.db.outgoingFriendRequests(me.id),
  };
  expect(JSON.stringify(frame), `프레임 내용이 다르다 (${when})`).toBe(JSON.stringify(expected));
}

describe("프레즌스 색인 — 연결의 생애 전부를 정확히 따라간다", () => {
  it("접속 → 닫힘 → 재로그인 → 로그아웃 순으로 색인과 친구 프레임이 진실과 같다", async () => {
    const h = await newHarness();
    const a = await reg(h, "IdxA");
    const b = await reg(h, "IdxB");
    await befriend(a, "IdxA", b, "IdxB");
    expectIndexMatchesTruth(h, "친구 맺은 직후");

    // B가 탭을 하나 더 연다 — 같은 이름에 연결 둘.
    const b2 = await login(h, "IdxB");
    await tick();
    expectIndexMatchesTruth(h, "B 두 번째 탭");
    expect(((h.rm as any).connsByName as Map<string, Set<any>>).get("IdxB")?.size).toBe(
      // 한 계정 한 창 정책이 있으면 앞 탭이 닫히고 1, 아니면 2 — 어느 쪽이든 진실과 같아야 한다.
      [...(h.rm as any).conns].filter((c: any) => c.user?.username === "IdxB" && !c.guest).length,
    );

    // 첫 탭이 닫힌다 — 남은 탭이 있으면 여전히 온라인이어야 한다.
    a.clear();
    b.close();
    await tick();
    expectIndexMatchesTruth(h, "B 첫 탭 닫힘");
    if (a.last("friendList") !== undefined) expectFrameEqualsTruth(h, a, "IdxA", "B 첫 탭 닫힘");

    // 남은 탭도 닫힌다 → 오프라인.
    a.clear();
    b2.close();
    await tick();
    expectIndexMatchesTruth(h, "B 전부 닫힘");
    expect(indexOnline(h).has("IdxB")).toBe(false);
    expectFrameEqualsTruth(h, a, "IdxA", "B 전부 닫힘");
    expect(a.last("friendList").friends.find((f: any) => f.nickname === "IdxB").online).toBe(false);

    // 재로그인 → 온라인.
    a.clear();
    const b3 = await login(h, "IdxB");
    await tick();
    expectIndexMatchesTruth(h, "B 재로그인");
    expect(indexOnline(h).has("IdxB")).toBe(true);
    expectFrameEqualsTruth(h, a, "IdxA", "B 재로그인");
    expect(a.last("friendList").friends.find((f: any) => f.nickname === "IdxB").online).toBe(true);

    // 소켓은 살아 있는데 로그아웃 → 색인에서 빠져야 한다 (소켓 닫힘과 다른 경로).
    b3.clientSend({ type: "logout" });
    await tick();
    expectIndexMatchesTruth(h, "B 로그아웃(소켓 유지)");
    expect(indexOnline(h).has("IdxB")).toBe(false);

    // 같은 소켓으로 다시 로그인 → 다시 색인에.
    b3.clear();
    b3.clientSend({ type: "login", username: "IdxB", password: "pw123456" });
    await b3.waitFor((m) => m.type === "authOk" || m.type === "error");
    expect(b3.last("authOk"), `재로그인 실패: ${JSON.stringify(b3.last("error"))}`).toBeDefined();
    await tick();
    expectIndexMatchesTruth(h, "B 같은 소켓 재로그인");
    expect(indexOnline(h).has("IdxB")).toBe(true);
  }, 60_000);

  it("같은 소켓이 다른 계정으로 갈아타면 옛 이름은 빠지고 새 이름이 들어간다", async () => {
    const h = await newHarness();
    const s = await reg(h, "SwapOne");
    await reg(h, "SwapTwo").then((x) => x.close());
    await tick();
    expectIndexMatchesTruth(h, "준비");
    s.clientSend({ type: "login", username: "SwapTwo", password: "pw123456" });
    await tick(60);
    expectIndexMatchesTruth(h, "계정 갈아탐");
    expect(indexOnline(h).has("SwapOne")).toBe(false);
    expect(indexOnline(h).has("SwapTwo")).toBe(true);
  }, 60_000);

  it("관리자 개명이 색인 키를 따라 바꾼다 (친구 목록의 온라인 판정이 새 이름으로)", async () => {
    const h = await newHarness();
    const admin = await reg(h, "PresAdmin", "ADMINCODE");
    const a = await reg(h, "RenA");
    const b = await reg(h, "RenB");
    await befriend(a, "RenA", b, "RenB");
    const bId = h.db.userByName("RenB")!.id;
    admin.clientSend({ type: "adminRenameUser", userId: String(bId), username: "RenB2" });
    await tick(80);
    expectIndexMatchesTruth(h, "개명 뒤");
    expect(indexOnline(h).has("RenB")).toBe(false);
    expect(indexOnline(h).has("RenB2")).toBe(true);
    // 개명 알림으로 A가 받은 목록도 진실과 같다.
    if (a.last("friendList") !== undefined) expectFrameEqualsTruth(h, a, "RenA", "개명 뒤");
    // 그 뒤 B가 나가면 A는 새 이름이 오프라인이 된 프레임을 받는다.
    a.clear();
    b.close();
    await tick();
    expectIndexMatchesTruth(h, "개명 뒤 닫힘");
    expectFrameEqualsTruth(h, a, "RenA", "개명 뒤 닫힘");
  }, 60_000);

  it("게스트는 색인에 들어가지 않고, 게스트 소켓이 닫혀도 색인이 흔들리지 않는다", async () => {
    const h = await newHarness();
    const a = await reg(h, "GstA");
    const g = new FakeSocket();
    h.rm.handleConnection(g.asWs());
    g.clientSend({ type: "guestPlay" });
    await tick(80);
    expectIndexMatchesTruth(h, "게스트 접속");
    expect([...indexOnline(h).keys()]).toEqual(["GstA"]);
    g.close();
    await tick();
    expectIndexMatchesTruth(h, "게스트 닫힘");
    a.close();
    await tick();
    expectIndexMatchesTruth(h, "전부 닫힘");
    expect(((h.rm as any).connsByName as Map<string, unknown>).size).toBe(0);
    expect(((h.rm as any).indexedName as Map<unknown, unknown>).size).toBe(0);
  }, 60_000);

  it("대국 시작·종료의 playing 판정이 색인 경로에서도 진실과 같다 (여러 친구에게 같은 프레임)", async () => {
    const h = await newHarness();
    const a = await reg(h, "PlyA");
    const f1 = await reg(h, "PlyF1");
    const f2 = await reg(h, "PlyF2");
    await befriend(a, "PlyA", f1, "PlyF1");
    await befriend(a, "PlyA", f2, "PlyF2");
    f1.clear();
    f2.clear();
    a.clientSend({ type: "createRoom" });
    await tick(50);
    for (let i = 0; i < 3; i++) {
      a.clientSend({ type: "addBot" });
      await tick(20);
    }
    a.clientSend({ type: "startGame" });
    await tick(200);
    expectIndexMatchesTruth(h, "대국 시작");
    expect(truthOnline(h).get("PlyA"), "대국이 시작되지 않았다").toBe(true);
    expectFrameEqualsTruth(h, f1, "PlyF1", "대국 시작 → F1");
    expectFrameEqualsTruth(h, f2, "PlyF2", "대국 시작 → F2");
    expect(f1.last("friendList").friends.find((x: any) => x.nickname === "PlyA").playing).toBe(true);
    expect(f2.last("friendList").friends.find((x: any) => x.nickname === "PlyA").playing).toBe(true);
  }, 60_000);
});
