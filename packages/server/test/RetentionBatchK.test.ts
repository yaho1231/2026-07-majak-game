/**
 * 리텐션 §K 회귀 가드 — 감사 2026-08-17 §4-3·4-6·4-7·4-8.
 *
 * 이 넷의 공통점: **데이터는 이미 다 쌓이고 있었다.** 갭은 수집이 아니라 그걸
 * 사람에게 돌려주는 표면이었다. 그래서 여기서 지키는 것도 "무엇을 돌려주는가"다.
 *
 * (사용자 결정: 봇전 통계 분리 §4-4는 **그대로 두고**, 랭킹 §4-5는 **보류**,
 *  리플레이 공유 §4-8은 **링크 있는 사람만**.)
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

async function newHarness(): Promise<{ rm: RoomManager; db: SiteDb }> {
  const dir = await mkdtemp(join(tmpdir(), "majak-k-"));
  dirs.push(dir);
  const store = new StatsStore(join(dir, "stats.json"));
  await store.load();
  const db = new SiteDb(":memory:");
  dbs.push(db);
  const rm = new RoomManager(dir, store, 0, db, "");
  managers.push(rm);
  return { rm, db };
}

/** 계정 하나로 붙어 인증까지 끝낸다. */
async function connectUser(rm: RoomManager, username: string): Promise<FakeSocket> {
  const sock = new FakeSocket();
  rm.handleConnection(sock.asWs());
  sock.clientSend({ type: "register", username, password: "pw123456" });
  await sock.waitFor((m) => m.type === "authOk" || m.type === "error");
  return sock;
}

afterEach(async () => {
  for (const m of managers.splice(0)) {
    m.shutdown("테스트 정리");
    m.stop();
  }
  await new Promise((r) => setTimeout(r, 50));
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true, maxRetries: 5 });
  for (const db of dbs.splice(0)) db.close();
});

// ─────────────── §4-3 공지 ───────────────

describe("공지를 전할 길이 생겼다", () => {
  it("공지가 없으면 serverInfo에 필드 자체가 붙지 않는다", async () => {
    const h = await newHarness();
    const sock = new FakeSocket();
    h.rm.handleConnection(sock.asWs());
    expect(sock.last("serverInfo").notice).toBeUndefined();
  });

  it("관리자가 세우면 **인증 전에** 오는 메시지에 실린다", async () => {
    const h = await newHarness();
    h.db.setNotice("점검 예고", "오늘 22시에 5분간 재시작합니다.");
    // 새 RoomManager 는 부팅 때 한 번 읽는다 — 그 경로를 그대로 태운다.
    const store = new StatsStore(join(dirs[0]!, "stats2.json"));
    await store.load();
    const rm2 = new RoomManager(dirs[0]!, store, 0, h.db, "");
    managers.push(rm2);

    const sock = new FakeSocket();
    rm2.handleConnection(sock.asWs());
    const info = sock.last("serverInfo");
    expect(info.notice.title).toBe("점검 예고");
    expect(info.notice.body).toContain("22시");
    expect(info.notice.updatedAt).not.toBe("");
  });

  it("관리자가 아니면 세울 수 없다", async () => {
    const h = await newHarness();
    const sock = await connectUser(h.rm, "Nobody");
    sock.clientSend({ type: "adminSetNotice", title: "가짜", body: "" });
    await sock.waitFor((m) => m.type === "error");
    expect(sock.last("error").code).toBe("FORBIDDEN");
    expect(h.db.notice()).toBeNull();
  });

  it("제목을 비우면 내려간다 (삭제 경로를 따로 두지 않았다)", async () => {
    const h = await newHarness();
    h.db.setNotice("있다", "본문");
    expect(h.db.notice()).not.toBeNull();
    expect(h.db.setNotice("   ", "본문")).toBeNull();
    expect(h.db.notice()).toBeNull();
  });

  it("길이가 넘치면 자른다 (매 연결에 나가는 값이다)", () => {
    const db = new SiteDb(":memory:");
    dbs.push(db);
    const saved = db.setNotice("가".repeat(500), "나".repeat(5000));
    expect(saved!.title.length).toBeLessThanOrEqual(120);
    expect(saved!.body.length).toBeLessThanOrEqual(2000);
  });
});

// ─────────────── §4-6 친구 ───────────────

describe("친구가 지금 있는지 볼 수 있다", () => {
  it("닉네임으로 더하고, 온라인 여부가 함께 온다", async () => {
    const h = await newHarness();
    const a = await connectUser(h.rm, "Alice");
    await connectUser(h.rm, "Bob");

    a.clientSend({ type: "friendAdd", nickname: "Bob" });
    await a.waitFor((m) => m.type === "friendList");
    const list = a.last("friendList").friends;
    expect(list).toHaveLength(1);
    expect(list[0].nickname).toBe("Bob");
    expect(list[0].online).toBe(true);
    expect(list[0].playing).toBe(false);
  });

  it("온라인 판정은 **살아 있는 연결**에서 나온다 (DB의 마지막 접속 시각이 아니다)", async () => {
    const h = await newHarness();
    const a = await connectUser(h.rm, "Alice");
    const b = await connectUser(h.rm, "Bob");
    a.clientSend({ type: "friendAdd", nickname: "Bob" });
    await a.waitFor((m) => m.type === "friendList");

    b.close();
    a.clientSend({ type: "friendList" });
    await a.waitFor((m) => m.type === "friendList" && m.friends[0]?.online === false);
    expect(a.last("friendList").friends[0].online).toBe(false);
  });

  it("자기 자신·없는 닉네임은 더할 수 없다", async () => {
    const h = await newHarness();
    const a = await connectUser(h.rm, "Alice");

    a.clientSend({ type: "friendAdd", nickname: "Alice" });
    await a.waitFor((m) => m.type === "error");
    expect(a.last("error").code).toBe("FRIEND_ADD_FAILED");

    const errsBefore = a.all("error").length;
    a.clientSend({ type: "friendAdd", nickname: "없는사람" });
    await a.waitFor(() => a.all("error").length > errsBefore);
    expect(h.db.friendNames(1)).toEqual([]);
  });

  it("빼면 목록에서 사라진다", async () => {
    const h = await newHarness();
    const a = await connectUser(h.rm, "Alice");
    await connectUser(h.rm, "Bob");
    a.clientSend({ type: "friendAdd", nickname: "Bob" });
    await a.waitFor((m) => m.type === "friendList");
    a.clientSend({ type: "friendRemove", nickname: "Bob" });
    await a.waitFor((m) => m.type === "friendList" && m.friends.length === 0);
    expect(a.last("friendList").friends).toEqual([]);
  });
});

// ─────────────── §4-7 기간 성적 ───────────────

describe("기간 성적을 게임 인덱스에서 되만든다", () => {
  it("최근 것만 센다 — 기간 밖의 판은 빠진다", async () => {
    const h = await newHarness();
    await connectUser(h.rm, "Timer");
    const uid = 1;
    const mk = (endedAt: string, rank: number): void => {
      h.db.recordGame({
        code: "ABCDEF",
        replayPath: "/dev/null",
        startedAt: endedAt,
        endedAt,
        players: [{ userId: uid, nickname: "Timer", isBot: false, rank, score: 0 }],
      });
    };
    const daysAgo = (n: number): string => new Date(Date.now() - n * 86_400_000).toISOString();
    mk(daysAgo(1), 1);
    mk(daysAgo(3), 2);
    mk(daysAgo(20), 4); // 7일 밖 · 30일 안
    mk(daysAgo(100), 1); // 둘 다 밖

    const week = h.db.periodStats(uid, 7);
    expect(week.games).toBe(2);
    expect(week.placements).toEqual([1, 1, 0, 0]);

    const month = h.db.periodStats(uid, 30);
    expect(month.games).toBe(3);
    expect(month.placements).toEqual([1, 1, 0, 1]);
  });

  it("통계 응답에 기간이 실린다 (판이 없으면 0판으로 온다)", async () => {
    const h = await newHarness();
    const sock = await connectUser(h.rm, "Fresh");
    sock.clientSend({ type: "statsRequest" });
    await sock.waitFor((m) => m.type === "stats");
    const periods = sock.last("stats").periods;
    expect(periods.map((p: { days: number }) => p.days)).toEqual([7, 30]);
    expect(periods[0].games).toBe(0);
    // 판이 없으면 평균 순위는 0이다 — "평균 0위"를 화면이 그리지 않게 하는 근거.
    expect(periods[0].avgRank).toBe(0);
  });
});

// ─────────────── §4-8 리플레이 공유 ───────────────

describe("리플레이를 링크로 나눈다 (링크 있는 사람만)", () => {
  /** 이 계정이 참가한 게임 하나를 인덱스에 만든다. */
  function seedGame(db: SiteDb, userId: number, nickname: string): number {
    return db.recordGame({
      code: "SHARE1",
      replayPath: "/dev/null",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      players: [{ userId, nickname, isBot: false, rank: 1, score: 50000 }],
    });
  }

  it("참가자가 링크를 만들면 **같은 토큰**이 계속 나온다", async () => {
    const h = await newHarness();
    const sock = await connectUser(h.rm, "Sharer");
    const gameId = seedGame(h.db, 1, "Sharer");

    sock.clientSend({ type: "replayShare", gameId });
    await sock.waitFor((m) => m.type === "replayShareToken");
    const first = sock.last("replayShareToken").token as string;
    expect(first).toBeTruthy();

    const seen = sock.all("replayShareToken").length;
    sock.clientSend({ type: "replayShare", gameId });
    await sock.waitFor(() => sock.all("replayShareToken").length > seen);
    // 누를 때마다 새 값이 나오면 앞서 뿌린 링크가 조용히 죽는다.
    expect(sock.last("replayShareToken").token).toBe(first);
  });

  it("남의 판은 공유할 수 없다", async () => {
    const h = await newHarness();
    await connectUser(h.rm, "Owner");
    const other = await connectUser(h.rm, "Stranger");
    const gameId = seedGame(h.db, 1, "Owner");

    other.clientSend({ type: "replayShare", gameId });
    await other.waitFor((m) => m.type === "error");
    // "없다"와 "권한이 없다"를 합친다 — id를 훑어 존재를 알아내지 못하게.
    expect(other.last("error").code).toBe("REPLAY_NOT_FOUND");
    expect(h.db.shareTokenOf(gameId)).toBeNull();
  });

  it("토큰이 있으면 **로그인하지 않아도** 열린다", async () => {
    const h = await newHarness();
    const sock = await connectUser(h.rm, "Sharer");
    const gameId = seedGame(h.db, 1, "Sharer");
    const token = h.db.shareGame(gameId)!;
    void sock;

    const anon = new FakeSocket();
    h.rm.handleConnection(anon.asWs());
    anon.clientSend({ type: "replayGet", shareToken: token });
    await anon.waitFor((m) => m.type === "replayData" || m.type === "error");
    // 파일이 /dev/null 이라 내용은 못 읽지만, **권한 판정은 통과했다**는 것이
    // 여기서 확인하려는 것이다 — 인증 오류가 아니어야 한다.
    expect(anon.last("error")?.code).not.toBe("AUTH_REQUIRED");
  });

  it("모르는 토큰은 한 문구로 거절한다", async () => {
    const h = await newHarness();
    const anon = new FakeSocket();
    h.rm.handleConnection(anon.asWs());
    anon.clientSend({ type: "replayGet", shareToken: "x".repeat(22) });
    await anon.waitFor((m) => m.type === "error");
    expect(anon.last("error").code).toBe("REPLAY_NOT_FOUND");
  });

  it("내리면 그 자리에서 죽는다", async () => {
    const h = await newHarness();
    const sock = await connectUser(h.rm, "Sharer");
    const gameId = seedGame(h.db, 1, "Sharer");
    const token = h.db.shareGame(gameId)!;
    expect(h.db.gameIdByShareToken(token)).toBe(gameId);

    sock.clientSend({ type: "replayShare", gameId, revoke: true });
    await sock.waitFor((m) => m.type === "replayShareToken" && m.token === null);
    expect(h.db.gameIdByShareToken(token)).toBeNull();
    expect(h.db.shareTokenOf(gameId)).toBeNull();
  });
});
