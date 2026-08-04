/**
 * 제보 게시판(버그 제보 · 증강 아이디어) 통합 테스트.
 *
 * 핵심은 **공개 범위**다 — 남이 쓴 글은 목록에 실리지 않아야 하고, 관리자만
 * 전체를 본다. 상태·답변은 관리자 전용, 삭제는 작성자 본인 또는 관리자.
 *
 * AugmentTiers.test.ts와 같은 FakeSocket 방식(실제 네트워크·파일 없음).
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

  close(): void {
    this.readyState = 3;
    this.emit("close");
  }

  clientSend(msg: unknown): void {
    this.emit("message", Buffer.from(JSON.stringify(msg)));
  }

  last(type: string): any {
    return [...this.sent].reverse().find((m) => m.type === type);
  }

  /** 지금까지 받은 메시지를 지운다 — 다음 응답만 보고 싶을 때. */
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
  const dir = await mkdtemp(join(tmpdir(), "majak-fb-"));
  dirs.push(dir);
  const store = new StatsStore(join(dir, "stats.json"));
  await store.load();
  const db = new SiteDb(":memory:");
  dbs.push(db);
  return { rm: new RoomManager(dir, store, 0, db), db };
}

async function connectAs(h: Harness, username: string, admin: boolean): Promise<FakeSocket> {
  const sock = new FakeSocket();
  h.rm.handleConnection(sock.asWs());
  sock.clientSend({
    type: "register",
    username,
    password: "pw123456",
    ...(admin ? { adminCode: h.db.adminCode() } : {}),
  });
  await sock.waitFor((m) => m.type === "authOk" || m.type === "error");
  return sock;
}

/** 제보 1건을 쓰고 갱신된 목록을 받는다. */
async function submit(
  sock: FakeSocket,
  kind: "bug" | "idea",
  title: string,
  body = "본문입니다",
): Promise<any> {
  sock.clear();
  sock.clientSend({ type: "feedbackSubmit", kind, title, body });
  await sock.waitFor((m) => m.type === "feedbackList" || m.type === "error");
  return sock.last("feedbackList");
}

async function list(sock: FakeSocket): Promise<any> {
  sock.clear();
  sock.clientSend({ type: "feedbackList" });
  await sock.waitFor((m) => m.type === "feedbackList");
  return sock.last("feedbackList");
}

afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  for (const db of dbs.splice(0)) db.close();
});

describe("제보 게시판 — 작성", () => {
  it("버그·아이디어를 쓰면 갱신된 목록이 바로 온다", async () => {
    const h = await newHarness();
    const user = await connectAs(h, "Writer", false);

    const first = await submit(user, "bug", "리치가 두 번 걸립니다");
    expect(first.entries.length).toBe(1);
    expect(first.entries[0].kind).toBe("bug");
    expect(first.entries[0].status).toBe("open");
    expect(first.entries[0].reply).toBe("");
    expect(first.entries[0].author).toBe("Writer");
    expect(first.entries[0].mine).toBe(true);
    expect(first.isAdmin).toBe(false);

    const second = await submit(user, "idea", "손패를 훔치는 증강");
    // 최신순
    expect(second.entries.map((e: any) => e.title)).toEqual([
      "손패를 훔치는 증강",
      "리치가 두 번 걸립니다",
    ]);
  });

  it("로그인하지 않으면 쓸 수 없다", async () => {
    const h = await newHarness();
    const anon = new FakeSocket();
    h.rm.handleConnection(anon.asWs());
    anon.clientSend({ type: "feedbackSubmit", kind: "bug", title: "제목", body: "본문" });
    await anon.waitFor((m) => m.type === "error");
    expect(anon.last("error").code).toBe("AUTH_REQUIRED");
    expect(anon.last("feedbackList")).toBeUndefined();
  });

  it("빈 제목·빈 본문·엉뚱한 종류는 거부된다", async () => {
    const h = await newHarness();
    const user = await connectAs(h, "Writer", false);

    for (const bad of [
      { kind: "bug", title: "  ", body: "본문" },
      { kind: "bug", title: "제목", body: "  " },
      { kind: "rumor", title: "제목", body: "본문" },
      { kind: "bug", title: "가".repeat(81), body: "본문" },
    ]) {
      user.clear();
      user.clientSend({ type: "feedbackSubmit", ...bad });
      await user.waitFor((m) => m.type === "error" || m.type === "feedbackList");
      expect(user.last("feedbackList"), JSON.stringify(bad)).toBeUndefined();
      expect(user.last("error").code).toBe("FEEDBACK_FAILED");
    }
    expect((await list(user)).entries).toEqual([]);
  });

  it("한 시간에 10건을 넘겨 쓸 수 없다 (도배 방지)", async () => {
    const h = await newHarness();
    const user = await connectAs(h, "Spammer", false);
    for (let i = 0; i < 10; i++) await submit(user, "bug", `제보 ${i}`);
    user.clear();
    user.clientSend({ type: "feedbackSubmit", kind: "bug", title: "열한 번째", body: "본문" });
    await user.waitFor((m) => m.type === "error");
    expect(user.last("error").code).toBe("FEEDBACK_FAILED");
    expect((await list(user)).entries.length).toBe(10);
  });
});

describe("제보 게시판 — 공개 범위", () => {
  it("남의 글은 목록에 실리지 않는다", async () => {
    const h = await newHarness();
    const a = await connectAs(h, "Alice", false);
    const b = await connectAs(h, "Bob", false);
    await submit(a, "bug", "앨리스의 버그");
    await submit(b, "idea", "밥의 아이디어");

    const aList = await list(a);
    expect(aList.entries.map((e: any) => e.title)).toEqual(["앨리스의 버그"]);
    const bList = await list(b);
    expect(bList.entries.map((e: any) => e.title)).toEqual(["밥의 아이디어"]);
  });

  it("관리자는 전체를 보고, 작성자와 내 글 여부가 실린다", async () => {
    const h = await newHarness();
    const a = await connectAs(h, "Alice", false);
    const admin = await connectAs(h, "Boss", true);
    await submit(a, "bug", "앨리스의 버그");
    await submit(admin, "idea", "관리자 메모");

    const seen = await list(admin);
    expect(seen.isAdmin).toBe(true);
    expect(seen.entries.map((e: any) => [e.author, e.title, e.mine])).toEqual([
      ["Boss", "관리자 메모", true],
      ["Alice", "앨리스의 버그", false],
    ]);
  });

  it("계정이 삭제되면 그 글은 주인을 잃고 관리자에게만 남는다", async () => {
    const h = await newHarness();
    const a = await connectAs(h, "Alice", false);
    const admin = await connectAs(h, "Boss", true);
    await submit(a, "bug", "앨리스의 버그");

    const alice = h.db.userByName("Alice");
    expect(alice).not.toBeNull();
    h.db.deleteUser(alice!.id);

    // 같은 닉네임으로 재가입한 사람에게는 보이지 않는다
    const reborn = await connectAs(h, "Alice", false);
    expect((await list(reborn)).entries).toEqual([]);
    // 관리자에게는 남아 있다 (작성 당시 닉네임 그대로)
    const seen = await list(admin);
    expect(seen.entries.map((e: any) => [e.author, e.title])).toEqual([["Alice", "앨리스의 버그"]]);
  });
});

describe("제보 게시판 — 상태·답변 (관리자 전용)", () => {
  it("관리자가 상태와 답변을 남기면 작성자에게 보인다", async () => {
    const h = await newHarness();
    const a = await connectAs(h, "Alice", false);
    const admin = await connectAs(h, "Boss", true);
    const id = (await submit(a, "bug", "앨리스의 버그")).entries[0].id;

    admin.clear();
    admin.clientSend({ type: "feedbackUpdate", id, status: "done", reply: "고쳤습니다" });
    await admin.waitFor((m) => m.type === "feedbackList");
    expect(admin.last("feedbackList").entries[0].status).toBe("done");

    const mine = (await list(a)).entries[0];
    expect(mine.status).toBe("done");
    expect(mine.reply).toBe("고쳤습니다");
    expect(mine.repliedAt).not.toBeNull();
  });

  it("비관리자는 상태·답변을 바꿀 수 없다 (자기 글이어도)", async () => {
    const h = await newHarness();
    const a = await connectAs(h, "Alice", false);
    const id = (await submit(a, "bug", "앨리스의 버그")).entries[0].id;

    a.clear();
    a.clientSend({ type: "feedbackUpdate", id, status: "done", reply: "제가 처리함" });
    await a.waitFor((m) => m.type === "error");
    expect(a.last("error").code).toBe("FORBIDDEN");
    const mine = (await list(a)).entries[0];
    expect(mine.status).toBe("open");
    expect(mine.reply).toBe("");
  });

  it("상태만·답변만 따로 바꿀 수 있다", async () => {
    const h = await newHarness();
    const a = await connectAs(h, "Alice", false);
    const admin = await connectAs(h, "Boss", true);
    const id = (await submit(a, "idea", "새 증강")).entries[0].id;

    admin.clientSend({ type: "feedbackUpdate", id, reply: "검토해 볼게요" });
    await admin.waitFor((m) => m.type === "feedbackList");
    admin.clear();
    admin.clientSend({ type: "feedbackUpdate", id, status: "reviewing" });
    await admin.waitFor((m) => m.type === "feedbackList");

    const e = admin.last("feedbackList").entries[0];
    expect(e.status).toBe("reviewing");
    expect(e.reply).toBe("검토해 볼게요"); // 상태만 바꿔도 답변이 지워지지 않는다
  });

  it("없는 상태 값은 거부된다", async () => {
    const h = await newHarness();
    const a = await connectAs(h, "Alice", false);
    const admin = await connectAs(h, "Boss", true);
    const id = (await submit(a, "bug", "앨리스의 버그")).entries[0].id;

    admin.clear();
    admin.clientSend({ type: "feedbackUpdate", id, status: "무시" });
    await admin.waitFor((m) => m.type === "error");
    expect(admin.last("error").code).toBe("FEEDBACK_FAILED");
    expect((await list(a)).entries[0].status).toBe("open");
  });
});

describe("제보 게시판 — 삭제", () => {
  it("작성자 본인은 지울 수 있다", async () => {
    const h = await newHarness();
    const a = await connectAs(h, "Alice", false);
    const id = (await submit(a, "bug", "앨리스의 버그")).entries[0].id;

    a.clear();
    a.clientSend({ type: "feedbackDelete", id });
    await a.waitFor((m) => m.type === "feedbackList");
    expect(a.last("feedbackList").entries).toEqual([]);
  });

  it("관리자는 남의 글도 지울 수 있다", async () => {
    const h = await newHarness();
    const a = await connectAs(h, "Alice", false);
    const admin = await connectAs(h, "Boss", true);
    const id = (await submit(a, "bug", "앨리스의 버그")).entries[0].id;

    admin.clear();
    admin.clientSend({ type: "feedbackDelete", id });
    await admin.waitFor((m) => m.type === "feedbackList");
    expect(admin.last("feedbackList").entries).toEqual([]);
    expect((await list(a)).entries).toEqual([]);
  });

  it("남의 글은 지울 수 없다 (id를 알아내도)", async () => {
    const h = await newHarness();
    const a = await connectAs(h, "Alice", false);
    const b = await connectAs(h, "Bob", false);
    const id = (await submit(a, "bug", "앨리스의 버그")).entries[0].id;

    b.clear();
    b.clientSend({ type: "feedbackDelete", id });
    await b.waitFor((m) => m.type === "error");
    expect(b.last("error").code).toBe("FEEDBACK_FAILED");
    expect((await list(a)).entries.length).toBe(1);
  });
});
