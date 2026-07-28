/**
 * 증강 테스트(샌드박스) 통합 테스트 — 관리자 전용 증강 시험 게임 (49차).
 *
 * 검증: 관리자 게이트 · 드래프트 없이 즉시 시작 · 증강 즉시 지급(본인/봇) ·
 *       초기화(증강 비운 새 판) · 새 판 사전 지급 · 기록(리플레이·게임 인덱스) 미생성.
 *
 * RoomManager.test.ts와 같은 FakeSocket 방식(실제 네트워크·파일 없음).
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WebSocket } from "ws";
import { RoomManager } from "../src/RoomManager.js";
import { StatsStore } from "../src/StatsStore.js";
import { SiteDb } from "../src/SiteDb.js";

class FakeSocket {
  readyState = 1; // OPEN
  sent: any[] = [];
  /** 프롬프트에 자동 응답할지 (게임을 계속 굴려야 하는 테스트에서 켠다) */
  autoRespond = false;
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
    if (this.autoRespond) this.respond(msg);
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

  all(type: string): any[] {
    return this.sent.filter((m) => m.type === type);
  }

  waitFor(pred: (m: any) => boolean, timeoutMs = 10_000): Promise<void> {
    if (this.sent.some(pred)) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("waitFor timeout")), timeoutMs);
      this.waiters.push({ pred, resolve, timer });
    });
  }

  private respond(msg: any): void {
    if (msg.type === "prompt") {
      const opts = msg.prompt.options as any[];
      const pick =
        opts.find((o) => o.type === "pass") ?? opts.find((o) => o.type === "discard") ?? opts[0];
      setTimeout(
        () => this.clientSend({ type: "action", actionType: pick.type, payload: pick.payload }),
        0,
      );
    } else if (msg.type === "roundOver") {
      setTimeout(() => this.clientSend({ type: "roundContinue" }), 0);
    }
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
  store: StatsStore;
  replayDir: string;
}

async function newHarness(): Promise<Harness> {
  const replayDir = await mkdtemp(join(tmpdir(), "majak-sbx-"));
  dirs.push(replayDir);
  const store = new StatsStore(join(replayDir, "stats.json"));
  await store.load();
  const db = new SiteDb(":memory:");
  dbs.push(db);
  return { rm: new RoomManager(replayDir, store, 0, db), db, store, replayDir };
}

async function connectAs(
  h: Harness,
  username: string,
  opts: { admin?: boolean; autoRespond?: boolean } = {},
): Promise<FakeSocket> {
  const sock = new FakeSocket();
  sock.autoRespond = opts.autoRespond ?? false;
  h.rm.handleConnection(sock.asWs());
  sock.clientSend({
    type: "register",
    username,
    password: "pw123456",
    ...(opts.admin === true ? { adminCode: h.db.adminCode() } : {}),
  });
  await sock.waitFor((m) => m.type === "authOk" || m.type === "error");
  return sock;
}

/** 관리자로 테스트 게임을 열고 첫 뷰까지 기다린다. */
async function startSandbox(h: Harness, autoRespond = false): Promise<FakeSocket> {
  const admin = await connectAs(h, "Boss", { admin: true, autoRespond });
  admin.clientSend({ type: "sandboxStart" });
  await admin.waitFor((m) => m.type === "view");
  return admin;
}

/** 최신 뷰에서 특정 좌석의 보유 증강 */
function augmentsOf(sock: FakeSocket, playerId: string): string[] {
  const view = sock.last("view")?.view;
  return view?.players.find((p: any) => p.id === playerId)?.augments ?? [];
}

afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  for (const db of dbs.splice(0)) db.close();
});

describe("증강 테스트 — 접근 권한", () => {
  it("일반 계정은 시작·지급·초기화 모두 거부된다", async () => {
    const h = await newHarness();
    const user = await connectAs(h, "Alice");
    for (const msg of [
      { type: "sandboxStart" },
      { type: "sandboxGrant", augmentId: "take_back" },
      { type: "sandboxReset", augments: {} },
    ]) {
      user.sent.length = 0;
      user.clientSend(msg);
      expect(user.last("error")?.code, msg.type).toBe("FORBIDDEN");
    }
  });

  it("일반 방에서는 증강 지급이 거부된다", async () => {
    const h = await newHarness();
    const admin = await connectAs(h, "Boss", { admin: true });
    admin.clientSend({ type: "createRoom" });
    admin.clientSend({ type: "sandboxGrant", augmentId: "take_back" });
    expect(admin.last("error")?.code).toBe("NOT_SANDBOX");
  });
});

describe("증강 테스트 — 시작", () => {
  it("드래프트 없이 봇 3명과 바로 시작하고 sandbox 상태를 받는다", async () => {
    const h = await newHarness();
    const admin = await startSandbox(h);

    const sbx = admin.last("sandbox");
    expect(sbx).toBeDefined();
    expect(sbx.mode).toBe("hanchan");
    expect(sbx.augments).toEqual({});
    // 증강 선택창(드래프트)은 뜨지 않는다
    expect(admin.last("draftOffer")).toBeUndefined();

    const view = admin.last("view").view;
    expect(view.players).toHaveLength(4);
    expect(view.players.filter((p: any) => p.isBot)).toHaveLength(3);
    expect(view.players.every((p: any) => p.augments.length === 0)).toBe(true);
  });

  it("동풍전 모드로 열 수 있다 (모드 전용 증강 시험용)", async () => {
    const h = await newHarness();
    const admin = await connectAs(h, "Boss", { admin: true });
    admin.clientSend({ type: "sandboxStart", mode: "tonpuu" });
    await admin.waitFor((m) => m.type === "view");
    expect(admin.last("sandbox").mode).toBe("tonpuu");
  });

  it("카탈로그로 구현된 증강 전부(표준+콘텐츠)를 받는다", async () => {
    const h = await newHarness();
    const admin = await startSandbox(h);
    const catalog = admin.last("catalog").augments as any[];
    expect(catalog.length).toBeGreaterThan(50);
    // 도감 상세도 게임 중 카탈로그에 함께 온다 (테스트 패널이 상세를 읽는 근거)
    expect(catalog.some((c) => typeof c.detail === "string" && c.detail.length > 0)).toBe(true);
  });

  it("다른 사람은 테스트 방 코드로 참가할 수 없다", async () => {
    const h = await newHarness();
    const admin = await startSandbox(h);
    const code = admin.last("sandbox").code;
    const other = await connectAs(h, "Alice");
    other.clientSend({ type: "joinRoom", code });
    expect(other.last("error")?.code).toBe("ROOM_NOT_FOUND");
  });

  it("관전 목록(liveGames)에 테스트 게임은 뜨지 않는다", async () => {
    const h = await newHarness();
    const admin = await startSandbox(h);
    admin.clientSend({ type: "liveGames" });
    expect(admin.last("liveGames").rooms).toEqual([]);
  });
});

describe("증강 테스트 — 증강 지급", () => {
  it("고른 증강을 즉시 획득하고 뷰에 반영된다", async () => {
    const h = await newHarness();
    const admin = await startSandbox(h);
    const me = admin.last("joined").playerId;

    admin.clientSend({ type: "sandboxGrant", augmentId: "take_back" });
    expect(augmentsOf(admin, me)).toContain("take_back");

    // 여러 개를 쌓아 시너지도 시험할 수 있다
    admin.clientSend({ type: "sandboxGrant", augmentId: "xray_hand" });
    expect(augmentsOf(admin, me)).toEqual(["take_back", "xray_hand"]);
  });

  it("봇에게도 지급할 수 있다 (상대 시점 시험)", async () => {
    const h = await newHarness();
    const admin = await startSandbox(h);
    admin.clientSend({ type: "sandboxGrant", augmentId: "xray_hand", target: "p1" });
    expect(augmentsOf(admin, "p1")).toContain("xray_hand");
  });

  it("없는 증강·중복 지급은 오류로 거부된다", async () => {
    const h = await newHarness();
    const admin = await startSandbox(h);
    admin.clientSend({ type: "sandboxGrant", augmentId: "no_such_augment" });
    expect(admin.last("error")?.code).toBe("UNKNOWN_AUGMENT");

    admin.clientSend({ type: "sandboxGrant", augmentId: "take_back" });
    admin.clientSend({ type: "sandboxGrant", augmentId: "take_back" });
    expect(admin.last("error")?.code).toBe("GRANT_FAILED");
  });
});

describe("증강 테스트 — 초기화", () => {
  it("초기화하면 증강 없는 새 판이 시작된다", async () => {
    const h = await newHarness();
    const admin = await startSandbox(h);
    const me = admin.last("joined").playerId;
    admin.clientSend({ type: "sandboxGrant", augmentId: "take_back" });
    expect(augmentsOf(admin, me)).toContain("take_back");

    const before = admin.all("sandbox").length;
    admin.clientSend({ type: "sandboxReset", augments: {} });
    await admin.waitFor((m) => m.type === "sandbox" && admin.all("sandbox").length > before);
    await admin.waitFor(
      (m) => m.type === "view" && m.view.players.every((p: any) => p.augments.length === 0),
    );
    expect(augmentsOf(admin, me)).toEqual([]);
    // 무효 알림(gameAborted)은 가지 않는다 — 홈으로 튕기지 않고 새 판으로 이어진다
    expect(admin.last("gameAborted")).toBeUndefined();
  });

  it("새 판은 지정한 증강을 배패 전에 지급한 채 시작한다", async () => {
    const h = await newHarness();
    const admin = await startSandbox(h);
    const me = admin.last("joined").playerId;

    admin.clientSend({
      type: "sandboxReset",
      augments: { [me]: ["take_back", "xray_hand"], p1: ["xray_hand"] },
    });
    await admin.waitFor(
      (m) => m.type === "view" && (m.view.players.find((p: any) => p.id === me)?.augments.length ?? 0) === 2,
    );
    expect(augmentsOf(admin, me)).toEqual(["take_back", "xray_hand"]);
    expect(augmentsOf(admin, "p1")).toEqual(["xray_hand"]);
    // 새 판이므로 첫 국(동1국)부터 다시 시작한다
    const view = admin.last("view").view;
    expect(view.round.prevalentWind).toBe(1);
    expect(view.round.roundNumber).toBe(1);
  });

  it("모르는 증강 id·없는 좌석은 조용히 걸러진다", async () => {
    const h = await newHarness();
    const admin = await startSandbox(h);
    const me = admin.last("joined").playerId;
    admin.clientSend({
      type: "sandboxReset",
      augments: { [me]: ["take_back", "nope", "take_back"], p9: ["xray_hand"] },
    });
    await admin.waitFor(
      (m) => m.type === "sandbox" && Object.keys(m.augments).length > 0,
    );
    expect(admin.last("sandbox").augments).toEqual({ [me]: ["take_back"] });
  });

  it("지급도 초기화도 진행 중인 판에서만 받는다 (끝난 방은 거부)", async () => {
    const h = await newHarness();
    const admin = await startSandbox(h);
    // 게임 종료와 같은 상태를 만든다: 방을 무효 처리해 정리시킨다
    admin.clientSend({ type: "voteAbort", vote: "agree" });
    await admin.waitFor((m) => m.type === "gameAborted");
    admin.clientSend({ type: "sandboxReset", augments: {} });
    expect(admin.last("error")?.code).toBe("ROOM_CLOSED");
  });

  it("초기화를 반복해도 좌석·연결이 유지된다", async () => {
    const h = await newHarness();
    const admin = await startSandbox(h);
    const me = admin.last("joined").playerId;
    for (let i = 0; i < 3; i++) {
      const before = admin.all("sandbox").length;
      admin.clientSend({ type: "sandboxReset", augments: { [me]: ["xray_hand"] } });
      await admin.waitFor((m) => m.type === "sandbox" && admin.all("sandbox").length > before);
    }
    await admin.waitFor(
      (m) => m.type === "view" && (m.view.players.find((p: any) => p.id === me)?.augments.length ?? 0) === 1,
    );
    expect(augmentsOf(admin, me)).toEqual(["xray_hand"]);
    expect(admin.last("error")).toBeUndefined();
  });
});

describe("증강 테스트 — 기록 없음", () => {
  it("리플레이 파일도 게임 인덱스도 남기지 않는다", async () => {
    const h = await newHarness();
    const admin = await startSandbox(h, true);
    admin.clientSend({ type: "sandboxGrant", augmentId: "take_back" });
    // 몇 순 진행시켜 이벤트가 쌓이게 한다
    await admin.waitFor((m) => m.type === "view");
    await new Promise((r) => setTimeout(r, 50));

    const files = await readdir(h.replayDir);
    expect(files.filter((f) => f.endsWith(".jsonl"))).toEqual([]);
    expect(h.db.listAllGames()).toEqual([]);
  });
});
