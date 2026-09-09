/**
 * 로비의 사회적 배관 — 친구 상한 · 초대 · «지금 있나» (QA 2차 lobby 확정 1·2·3·4).
 *
 * 넷 다 «있다고 적어 둔 것이 실제로는 없던» 부류다.
 *
 * 1. 🟠 **친구 100명 상한이 수락 경로에서 통째로 우회됐다** (확정 2). `requestFriend`는
 *    처음부터 양쪽을 보는데 `respondFriendRequest`는 받는 쪽만 봤다. 요청은 보류로
 *    쌓이므로, 그사이 친구가 늘어도 옛 보류분이 나중에 그대로 통과했다. 게다가
 *    보낸-요청 상한은 보류분만 세서 수락된 만큼 자리가 비었다 — 재현에서 130명까지 갔다.
 * 2. 🟡 **정원이 찬 방에서도 초대장이 나갔다** (확정 3). 받은 사람은 카드를 눌러 봐야
 *    `ROOM_FULL`을 봤고, 그 초대는 성공으로 쳐서 20초 쿨다운까지 태웠다.
 * 3. 🟡 **친구의 «접속 중»이 아무 때도 갱신되지 않았다** (확정 4). 값은 정확했다 —
 *    틀린 것은 «언제 다시 계산되는가»다. 홈에 앉아 있는 동안은 들어온 순간의 사진 한 장.
 * 4. 🟡 **`kickPlayer`로 봇을 지우면 `removeBot`과 달랐다** (확정 1). 주석은 "같은
 *    처리"라고 적어 두고 성향 지정도, 남은 봇 재배치도 하지 않았다.
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
  const dir = await mkdtemp(join(tmpdir(), "majak-lobby-"));
  dirs.push(dir);
  const store = new StatsStore(join(dir, "stats.json"));
  await store.load();
  const db = new SiteDb(":memory:", undefined, "ADMINCODE");
  dbs.push(db);
  const manager = new RoomManager(dir, store, 0, db);
  managers.push(manager);
  return { rm: manager, db };
}

async function reg(h: H, username: string): Promise<FakeSocket> {
  const sock = new FakeSocket();
  h.rm.handleConnection(sock.asWs());
  sock.clientSend({ type: "register", username, password: "pw123456" });
  await sock.waitFor((m) => m.type === "authOk" || m.type === "error");
  if (sock.last("authOk") === undefined) throw new Error(`register failed: ${username}`);
  return sock;
}

/** DB에 직접 계정을 만들어 `who`의 친구로 붙인다 (소켓 없이 목록만 불린다). */
async function seedFriends(db: SiteDb, who: string, n: number): Promise<void> {
  const me = db.userByName(who)!;
  for (let i = 0; i < n; i++) {
    const name = `Seed${i}`;
    await db.register(name, "pw123456");
    const other = db.userByName(name)!;
    // `requestFriend` → `respondFriendRequest` 정상 경로로 붙인다(직접 INSERT 하면
    // 이 테스트가 재려는 그 검사를 우회해 버린다).
    db.requestFriend(other.id, who);
    db.respondFriendRequest(me.id, name, true);
  }
}

describe("친구 상한 — 어느 문으로 들어와도 100명을 넘지 않는다", () => {
  it("수락 경로도 **보낸 쪽**의 친구 수를 본다", async () => {
    const h = await newHarness();
    await reg(h, "Cap");
    await reg(h, "Peer");
    const cap = h.db.userByName("Cap")!;
    const peer = h.db.userByName("Peer")!;

    // Cap 이 상한을 채우기 **전에** Peer 가 요청을 보내 둔다 — 이게 보류분이다.
    expect(h.db.requestFriend(peer.id, "Cap").ok).toBe(true);
    // 그 사이 Cap 의 친구가 상한까지 늘어난다.
    await seedFriends(h.db, "Cap", 100);
    expect(h.db.friendCount(cap.id)).toBe(100);

    // 이제 보류분을 수락한다 — Cap 이 받는 쪽이면 예전 검사도 막았을 것이다.
    // 뚫려 있던 것은 **반대 방향**이다: Peer 가 수락하는 쪽일 때 Cap(보낸 쪽)을 안 봤다.
    const res = h.db.respondFriendRequest(peer.id, "Cap", true);
    expect(res.ok, "상한이 찬 사람이 보낸 보류 요청이 그대로 수락됐다").toBe(false);
    expect(h.db.friendCount(cap.id), "상한을 넘어섰다").toBe(100);
  });

  it("보낸 요청 상한이 **이미 맺은 친구와 합쳐** 세어진다 (누적 우회 차단)", async () => {
    const h = await newHarness();
    await reg(h, "Sender");
    const me = h.db.userByName("Sender")!;
    // 친구 99명 + 보낸 요청 1건이면 합계 100 — 그다음은 막혀야 한다.
    await seedFriends(h.db, "Sender", 99);
    await h.db.register("Pending", "pw123456");
    expect(h.db.requestFriend(me.id, "Pending").ok).toBe(true);
    await h.db.register("OneMore", "pw123456");
    const res = h.db.requestFriend(me.id, "OneMore");
    expect(
      res.ok,
      "보류분만 세면 «100건 보내고 수락되기를 기다렸다가 또 100건»이 무한히 반복된다",
    ).toBe(false);
    expect(res.error).toContain("합해");
  });

  it("상한 아래에서는 종전대로 맺어진다 (상한이 기능을 죽이지 않는다)", async () => {
    const h = await newHarness();
    await reg(h, "A1");
    await reg(h, "B1");
    const a = h.db.userByName("A1")!;
    const b = h.db.userByName("B1")!;
    expect(h.db.requestFriend(a.id, "B1").ok).toBe(true);
    expect(h.db.respondFriendRequest(b.id, "A1", true).ok).toBe(true);
    expect(h.db.friendCount(a.id)).toBe(1);
    expect(h.db.friendCount(b.id)).toBe(1);
  });
});

describe("친구 초대 — 앉을 자리가 없으면 초대가 아니다", () => {
  it("정원이 찬 방에서는 초대장이 나가지 않고, 쿨다운도 안 태운다", async () => {
    const h = await newHarness();
    const a = await reg(h, "InvA");
    const b = await reg(h, "InvB");
    a.clientSend({ type: "friendRequest", nickname: "InvB" });
    await tick();
    b.clientSend({ type: "friendRespond", nickname: "InvA", accept: true });
    await tick();

    a.clientSend({ type: "createRoom" });
    await a.waitFor((m) => m.type === "roomCreated");
    for (let i = 0; i < 3; i++) a.clientSend({ type: "addBot" });
    await tick();
    const code = a.last("roomCreated").code;
    const room = (h.rm as any).rooms.get(code);
    expect(room.agents.length, "정원이 안 찼다 — 이 검사가 무의미해진다").toBe(4);

    b.clear();
    a.clear();
    a.clientSend({ type: "friendInvite", nickname: "InvB" });
    await tick();
    expect(
      b.last("friendInviteFrom"),
      "정원이 찬 방으로 초대장이 갔다 — 받은 사람은 눌러 봐야 ROOM_FULL 을 본다",
    ).toBeUndefined();
    const err = a.last("error");
    expect(err?.code).toBe("FRIEND_INVITE_FAILED");
    expect(err?.message, "봇을 빼라는 안내가 없다").toContain("봇");

    // **쿨다운을 안 태웠다** — 봇을 하나 빼고 곧바로 다시 부를 수 있어야 한다.
    const botId = room.agents.find((x: any) => x.isBot).id;
    a.clientSend({ type: "removeBot", playerId: botId });
    await tick();
    b.clear();
    a.clientSend({ type: "friendInvite", nickname: "InvB" });
    await tick();
    expect(
      b.last("friendInviteFrom"),
      "실패한 초대가 쿨다운을 태워, 자리를 비우고도 부르지 못했다",
    ).toBeDefined();
  }, 60_000);
});

describe("친구 «지금 있나» — 상태가 바뀌면 그때 갱신된다", () => {
  it("친구가 접속하면 내 목록이 push 된다", async () => {
    const h = await newHarness();
    const a = await reg(h, "OnA");
    const b = await reg(h, "OnB");
    a.clientSend({ type: "friendRequest", nickname: "OnB" });
    await tick();
    b.clientSend({ type: "friendRespond", nickname: "OnA", accept: true });
    await tick();
    b.close();
    await tick();

    a.clear();
    const b2 = new FakeSocket();
    h.rm.handleConnection(b2.asWs());
    b2.clientSend({ type: "login", username: "OnB", password: "pw123456" });
    await b2.waitFor((m) => m.type === "authOk");
    await tick();

    const pushed = a.last("friendList");
    expect(pushed, "친구가 들어왔는데 내 화면은 그대로다 — 낡은 목록은 틀린 목록이다")
      .toBeDefined();
    expect(pushed.friends.find((f: any) => f.nickname === "OnB")?.online).toBe(true);
  }, 60_000);

  it("친구가 나가면 내 목록이 push 되고 offline 으로 바뀐다", async () => {
    const h = await newHarness();
    const a = await reg(h, "OffA");
    const b = await reg(h, "OffB");
    a.clientSend({ type: "friendRequest", nickname: "OffB" });
    await tick();
    b.clientSend({ type: "friendRespond", nickname: "OffA", accept: true });
    await tick();

    // **닫기 전에** 비운다 — push 는 close 처리와 같은 틱에 나간다.
    a.clear();
    b.close();
    await tick();

    const pushed = a.last("friendList");
    expect(pushed, "친구가 나갔는데 «접속 중»이 그대로 남는다").toBeDefined();
    expect(pushed.friends.find((f: any) => f.nickname === "OffB")?.online).toBe(false);
  }, 60_000);

  it("친구가 없으면 아무 것도 보내지 않는다 (조용한 방송이 되지 않게)", async () => {
    const h = await newHarness();
    const a = await reg(h, "Lone");
    a.clear();
    const other = new FakeSocket();
    h.rm.handleConnection(other.asWs());
    other.clientSend({ type: "register", username: "Stranger", password: "pw123456" });
    await other.waitFor((m) => m.type === "authOk");
    await tick();
    expect(a.all("friendList"), "남남인데 목록이 날아왔다").toHaveLength(0);
  }, 60_000);
});

describe("봇 강퇴 — `removeBot`과 같은 문을 쓴다", () => {
  it("kickPlayer(봇)도 성향 지정을 지우고 남은 봇을 다시 앉힌다", async () => {
    const h = await newHarness();
    const host = await reg(h, "HostK");
    host.clientSend({ type: "createRoom" });
    await host.waitFor((m) => m.type === "lobby");
    const code = host.last("roomCreated").code;
    const room = (h.rm as any).rooms.get(code);
    host.clientSend({ type: "addBot" });
    await tick();
    const bot = host.last("lobby").players.find((p: any) => p.isBot);
    /*
     * 지정 **전의** 성향을 적어 둔다. 성향은 (방 코드, 세대)로 결정되므로 지정을
     * 지운 뒤 그 자리에 우연히 같은 것이 앉을 수 있다 — 「attacker 가 아니다」로
     * 재면 오탐이 난다. 물음은 «지정이 없던 때와 같은 성향으로 돌아오는가»다.
     */
    const natural = bot.archetype;
    host.clientSend({ type: "setBotArchetype", playerId: bot.playerId, archetype: "attacker" });
    await tick();
    expect(host.last("lobby").players.find((p: any) => p.isBot).archetype).toBe("attacker");

    host.clientSend({ type: "kickPlayer", playerId: bot.playerId });
    await tick();
    expect(
      [...room.botArchetypes.keys()],
      "kickPlayer 가 성향 지정을 남겼다 — 그 자리에 들어올 봇이 물려받는다",
    ).toHaveLength(0);

    host.clientSend({ type: "addBot" });
    await tick();
    const again = host.last("lobby").players.find((p: any) => p.isBot);
    expect(again.playerId, "같은 자리에 다시 앉는 경우를 재는 검사다").toBe(bot.playerId);
    expect(again.archetype, `지운 봇의 성향을 물려받았다 (지정 없던 때: ${natural})`).toBe(
      natural,
    );
  }, 60_000);
});
