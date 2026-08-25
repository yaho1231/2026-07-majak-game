/**
 * 미완성 구현 §M 회귀 가드 — 감사 2026-08-17 §10-2·10-3·10-4·10-11.
 *
 * (§10-1 `redFor` 클라 구현은 화면 쪽이라 `client/test/unfinishedBatchM.test.ts`가,
 *  §10-6 docs/28 은 문서 갱신이라 같은 파일이 지킨다.)
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
  autoRespond = false;
  private handlers: Record<string, ((...a: any[]) => void)[]> = {};
  private waiters: { pred: () => boolean; resolve: () => void; timer: ReturnType<typeof setTimeout> }[] = [];

  send(data: string): void {
    this.sent.push(JSON.parse(data));
    this.waiters = this.waiters.filter((w) => {
      if (w.pred()) {
        clearTimeout(w.timer);
        w.resolve();
        return false;
      }
      return true;
    });
    if (this.autoRespond) this.respond(this.sent[this.sent.length - 1]);
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
  until(pred: () => boolean, timeoutMs = 30_000): Promise<void> {
    if (pred()) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("until timeout")), timeoutMs);
      this.waiters.push({ pred, resolve, timer });
    });
  }
  private respond(msg: any): void {
    if (msg.type === "prompt") {
      const o = msg.prompt.options as any[];
      const p = o.find((x) => x.type === "pass") ?? o.find((x) => x.type === "discard") ?? o[0];
      setTimeout(
        () => this.clientSend({ type: "action", actionType: p.type, payload: p.payload, seat: msg.prompt.player }),
        0,
      );
    } else if (msg.type === "draftOffer") {
      setTimeout(() => this.clientSend({ type: "draftPick", stage: msg.stage, augmentId: msg.choices[0].id }), 0);
    } else if (msg.type === "roundOver") {
      setTimeout(() => this.clientSend({ type: "roundContinue" }), 0);
    }
  }
  asWs(): WebSocket {
    return this as unknown as WebSocket;
  }
}

const dirs: string[] = [];
const dbs: SiteDb[] = [];
const managers: RoomManager[] = [];

async function newHarness(): Promise<{ rm: RoomManager; db: SiteDb }> {
  const dir = await mkdtemp(join(tmpdir(), "majak-m-"));
  dirs.push(dir);
  const store = new StatsStore(join(dir, "stats.json"));
  await store.load();
  const db = new SiteDb(":memory:");
  dbs.push(db);
  const rm = new RoomManager(dir, store, 0, db, "");
  managers.push(rm);
  return { rm, db };
}

/** 원격 취급으로 붙는다 (`exempt` 면제가 걸리면 조회 제한이 통째로 꺼진다). */
async function connectRemote(rm: RoomManager, username: string, ip: string): Promise<FakeSocket> {
  const sock = new FakeSocket();
  rm.handleConnection(sock.asWs(), ip, false);
  sock.clientSend({ type: "register", username, password: "pw123456" });
  await sock.until(() => sock.last("authOk") !== undefined || sock.last("error") !== undefined);
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

// ─────────────── §10-2 비밀번호 변경 · 세션 회수 ───────────────

describe("계정을 되찾을 수단이 생겼다", () => {
  it("비밀번호를 바꾸면 **다른 세션이 전부 끊긴다**", async () => {
    const h = await newHarness();
    const reg = await h.db.register("Owner", "oldpassword1");
    expect(reg.ok).toBe(true);
    // 다른 기기 두 곳에서 로그인해 둔다.
    const a = await h.db.login("Owner", "oldpassword1");
    const b = await h.db.login("Owner", "oldpassword1");
    expect(h.db.loginByToken(a.sessionToken!)).not.toBeNull();

    const res = await h.db.changePassword(reg.user!.id, "oldpassword1", "newpassword2");
    expect(res.ok).toBe(true);

    // 남의 손에 있을지 모르는 세션은 죽는다.
    expect(h.db.loginByToken(a.sessionToken!)).toBeNull();
    expect(h.db.loginByToken(b.sessionToken!)).toBeNull();
    // 바꾼 사람에게는 새 토큰이 온다 — 자기 자신이 로그아웃되면 사람들이 바꾸기를 미룬다.
    expect(h.db.loginByToken(res.sessionToken!)?.username).toBe("Owner");
  });

  it("지금 비밀번호가 틀리면 바뀌지 않는다", async () => {
    const h = await newHarness();
    const reg = await h.db.register("Owner", "oldpassword1");
    const res = await h.db.changePassword(reg.user!.id, "wrongpassword", "newpassword2");
    expect(res.ok).toBe(false);
    // 옛 비밀번호가 그대로 통해야 한다 (실패가 계정을 망가뜨리지 않는다).
    expect((await h.db.login("Owner", "oldpassword1")).ok).toBe(true);
  });

  it("새 비밀번호도 가입과 **같은 규칙**을 지나야 한다", async () => {
    const h = await newHarness();
    const reg = await h.db.register("Owner", "oldpassword1");
    for (const weak of ["short", "12345678", "Ownerpassword"]) {
      const res = await h.db.changePassword(reg.user!.id, "oldpassword1", weak);
      expect(res.ok, `${weak} 가 통과했다`).toBe(false);
    }
  });

  it("다른 기기 로그아웃은 **이 기기만** 남긴다", async () => {
    const h = await newHarness();
    const reg = await h.db.register("Owner", "oldpassword1");
    const mine = await h.db.login("Owner", "oldpassword1");
    const other = await h.db.login("Owner", "oldpassword1");

    const removed = h.db.logoutOthers(reg.user!.id, mine.sessionToken!);
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(h.db.loginByToken(mine.sessionToken!)).not.toBeNull();
    expect(h.db.loginByToken(other.sessionToken!)).toBeNull();
  });
});

// ─────────────── §10-3 솔로 무효 투표 ───────────────

describe("혼자 두는 기록 대국은 무효로 지울 수 없다", () => {
  it("사람 1 + 봇 3 방에서 무효 투표가 거절된다", async () => {
    const h = await newHarness();
    const sock = await connectRemote(h.rm, "Solo", "198.51.100.5");
    sock.clientSend({ type: "createRoom" });
    await sock.until(() => sock.last("roomCreated") !== undefined);
    sock.clientSend({ type: "addBot" });
    sock.clientSend({ type: "addBot" });
    sock.clientSend({ type: "addBot" });
    await sock.until(() => (sock.last("lobby")?.players?.length ?? 0) === 4);
    sock.clientSend({ type: "startGame" });
    await sock.until(() => sock.last("view") !== undefined || sock.last("draftOffer") !== undefined);

    const before = sock.all("error").length;
    sock.clientSend({ type: "voteAbort", vote: "agree" });
    await sock.until(() => sock.all("error").length > before);

    expect(sock.last("error").code).toBe("SOLO_ABORT_FORBIDDEN");
    // 판은 그대로 돌고 있어야 한다 — 거절이지 종료가 아니다.
    expect(h.rm.healthSnapshot().playing).toBe(1);
  }, 60_000);

  it("기록하지 않는 방(연습 대국)은 그대로 접을 수 있다", async () => {
    const h = await newHarness();
    const sock = await connectRemote(h.rm, "Practicer", "198.51.100.7");
    sock.clientSend({ type: "practicePlay", mode: "tonpuu" });
    await sock.until(() => sock.last("view") !== undefined || sock.last("draftOffer") !== undefined);

    sock.clientSend({ type: "voteAbort", vote: "agree" });
    await sock.until(() => sock.last("abortVote") !== undefined, 10_000);

    // 세탁할 전적이 없는 방이다 — 막으면 정리 수단 자체가 사라진다.
    expect(sock.all("error").some((e) => e.code === "SOLO_ABORT_FORBIDDEN")).toBe(false);
    // 표가 실제로 세어졌다 (정족수 1을 그 표 하나로 채운다).
    expect(sock.last("abortVote")).toMatchObject({ votes: 1, needed: 1 });
  }, 60_000);

  it("체험 방은 애초에 투표가 안 온다 (화이트리스트가 앞에서 막는다)", async () => {
    const h = await newHarness();
    const guest = new FakeSocket();
    h.rm.handleConnection(guest.asWs());
    guest.clientSend({ type: "guestPlay", mode: "tonpuu" });
    await guest.until(() => guest.last("view") !== undefined);

    guest.clientSend({ type: "voteAbort", vote: "agree" });
    await guest.until(() => guest.last("error") !== undefined, 5_000);
    // 손님에게는 창을 닫는 길이 있다 — 무효 투표를 열어 줄 이유가 없다.
    expect(guest.last("error").code).toBe("GUEST_FORBIDDEN");
  }, 60_000);
});

// ─────────────── §10-4 비싼 조회 제한 키 ───────────────

describe("비싼 조회 제한이 연결 수만큼 곱해지지 않는다", () => {
  it("같은 계정의 다음 창이 같은 창을 이어받는다", async () => {
    const h = await newHarness();
    const tab1 = await connectRemote(h.rm, "Heavy", "198.51.100.9");
    const token = tab1.last("authOk").sessionToken as string;

    // 창당 5회다. 탭1에서 5회를 쓴다.
    for (let i = 0; i < 5; i++) tab1.clientSend({ type: "replayList" });
    await new Promise((r) => setTimeout(r, 100));

    // 새 탭으로 다시 붙는다 — 탭1은 SESSION_TAKEOVER로 끊긴다(한 계정 한 창).
    // 그래도 제한 창은 **계정**의 것이라 새 탭에서 이어진다.
    const tab2 = new FakeSocket();
    h.rm.handleConnection(tab2.asWs(), "198.51.100.9", false);
    tab2.clientSend({ type: "tokenLogin", sessionToken: token });
    await tab2.until(() => tab2.last("authOk") !== undefined);

    const before = tab2.all("error").length;
    tab2.clientSend({ type: "replayList" });
    await tab2.until(() => tab2.all("error").length > before);
    expect(tab2.last("error").code).toBe("RATE_LIMITED");
  });

  it("다른 계정은 서로의 창을 갉아먹지 않는다", async () => {
    const h = await newHarness();
    const a = await connectRemote(h.rm, "UserA", "198.51.100.11");
    const b = await connectRemote(h.rm, "UserB", "198.51.100.11"); // 같은 IP, 다른 계정

    for (let i = 0; i < 5; i++) a.clientSend({ type: "replayList" });
    await new Promise((r) => setTimeout(r, 100));

    const before = b.all("error").length;
    b.clientSend({ type: "replayList" });
    await b.until(() => b.last("replayList") !== undefined || b.all("error").length > before);
    expect(b.all("error").length).toBe(before);
  });
});

// ─────────────── §10-11 죽은 확장점 ───────────────

describe("죽은 확장점을 판정했다", () => {
  it("아무도 안 읽던 `sealedKinds`는 뷰에서 걷어냈다", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join: j } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = dirname(fileURLToPath(import.meta.url));
    const view = readFileSync(j(here, "../../core/src/information/PlayerView.ts"), "utf8");
    // 매 프레임 네 좌석에 실려 나가던 배열이다 — 읽는 사람이 없으면 그건 비용뿐이다.
    expect(view).not.toMatch(/^\s*sealedKinds\?:/m);
    // 자물쇠를 실제로 그리는 목록은 그대로 남아 있어야 한다.
    expect(view).toContain("sealedTileIds?: TileId[]");
  });

  it("살아 있는 확장점은 **왜 남기는지**를 적어 두고 남겼다", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join: j } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = dirname(fileURLToPath(import.meta.url));
    const actions = readFileSync(j(here, "../../core/src/mahjong/flow/standardActions.ts"), "utf8");
    const helpers = readFileSync(j(here, "../../core/src/mahjong/flow/helpers.ts"), "utf8");
    // 지우면 되살릴 때 정산 순서·자리 순서를 다시 짜야 한다 — 값이 기본일 때 비용은 0이다.
    expect(actions).toContain('rules.define("score.finalAdjust", 0)');
    expect(actions).toContain("§10-11");
    expect(helpers).toContain("§10-11");
  });
});
