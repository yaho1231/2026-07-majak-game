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
  /**
   * 자동 응답에서 제외할 좌석 — **자기 차례(버림 선택지가 있는 프롬프트)만** 남겨 둔다.
   * 리액션(패스/후로)까지 손에 쥐고 있으면 답하지 않은 채 판이 멈춰 테스트가 굶는다.
   */
  skipSeats = new Set<string>();
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
      if (this.skipSeats.has(msg.prompt.player) && opts.some((o) => o.type === "discard")) return;
      const pick =
        opts.find((o) => o.type === "pass") ?? opts.find((o) => o.type === "discard") ?? opts[0];
      // 실제 클라이언트처럼 어느 좌석의 답인지 함께 보낸다 (봇 좌석 조종 대응)
      setTimeout(
        () =>
          this.clientSend({
            type: "action",
            actionType: pick.type,
            payload: pick.payload,
            seat: msg.prompt.player,
          }),
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
    // 모드를 안 적어 보내면 방 기본값 — 동풍전이다 (2026-08-14)
    expect(sbx.mode).toBe("tonpuu");
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

describe("증강 테스트 — 손패 지정", () => {
  it("지정한 손패로 배패되고, 그 지정이 sandbox 상태로 돌아온다", async () => {
    const h = await newHarness();
    const admin = await startSandbox(h);
    const me = admin.last("joined").playerId;
    const want = ["man1", "man1", "man1", "pin9", "wind2"];

    admin.clientSend({ type: "sandboxReset", augments: {}, hands: { [me]: want } });
    await admin.waitFor((m) => m.type === "sandbox" && Object.keys(m.hands).length > 0);
    expect(admin.last("sandbox").hands).toEqual({ [me]: want });

    // 새 판의 첫 뷰에서 내 손패에 지정한 종류가 실제로 들어 있다
    await admin.waitFor(
      (m) => m.type === "view" && (m.view.zones[`hand:${me}`]?.tileIds.length ?? 0) >= 13,
    );
    const view = admin.last("view").view;
    const keys = view.zones[`hand:${me}`].tileIds.map((id: number) => {
      const k = view.tiles[id].kind;
      return `${k.suit}${k.rank}`;
    });
    for (const key of new Set(want)) {
      expect(keys.filter((k: string) => k === key).length).toBeGreaterThanOrEqual(
        want.filter((w) => w === key).length,
      );
    }
    // 친은 이미 첫 쯔모를 했을 수 있어 13 또는 14장이다
    expect(keys.length).toBeGreaterThanOrEqual(13);
  });

  it("없는 좌석·이상한 패 이름·5장째 사본은 조용히 걸러진다", async () => {
    const h = await newHarness();
    const admin = await startSandbox(h);
    const me = admin.last("joined").playerId;
    admin.clientSend({
      type: "sandboxReset",
      augments: {},
      hands: { [me]: ["man1", "돌", "man99", "man1", "man1", "man1", "man1"], p9: ["pin1"] },
    });
    await admin.waitFor((m) => m.type === "sandbox" && Object.keys(m.hands).length > 0);
    // 유효한 man1 4장만 남는다 (5장째와 없는 종류·좌석은 버려진다)
    expect(admin.last("sandbox").hands).toEqual({ [me]: ["man1", "man1", "man1", "man1"] });
  });
});

describe("증강 테스트 — 봇 제약", () => {
  it("체크한 제약이 sandboxConfig로 돌아오고, 판을 갈아엎지 않는다", async () => {
    const h = await newHarness();
    const admin = await startSandbox(h);
    const before = admin.all("sandbox").length;

    admin.clientSend({ type: "sandboxBotRules", rules: { noCall: true, noWin: true } });
    await admin.waitFor((m) => m.type === "sandboxConfig");
    const cfg = admin.last("sandboxConfig");
    expect(cfg.botRules).toEqual({
      noCall: true,
      noRiichi: false,
      noWin: true,
      noAugment: false,
    });
    // 새 판(sandbox 메시지)이 시작되지 않았다 — 진행 중인 판에 그대로 먹는다
    expect(admin.all("sandbox").length).toBe(before);
  });

  it("일반 방·비관리자는 봇 제약을 걸 수 없다", async () => {
    const h = await newHarness();
    const user = await connectAs(h, "Alice");
    user.clientSend({ type: "sandboxBotRules", rules: { noWin: true } });
    expect(user.last("error")?.code).toBe("FORBIDDEN");

    const admin = await connectAs(h, "Boss", { admin: true });
    admin.clientSend({ type: "createRoom" });
    admin.clientSend({ type: "sandboxControl", enabled: false });
    expect(admin.last("error")?.code).toBe("NOT_SANDBOX");
  });
});

describe("증강 테스트 — 봇 좌석 직접 조작", () => {
  /** 내 좌석은 자동으로 두게 하고(판이 흘러야 한다) 봇 좌석만 손으로 남긴다 */
  async function puppetSetup(): Promise<{ admin: FakeSocket; me: string; bot: string }> {
    const h = await newHarness();
    const admin = await startSandbox(h, true);
    const me = admin.last("joined").playerId;
    const bot = admin.last("view").view.players.find((p: any) => p.id !== me).id;
    admin.skipSeats.add(bot);
    return { admin, me, bot };
  }

  it("봇 시점으로 가면 그 좌석의 결정이 나에게 오고, 내가 대신 둘 수 있다", async () => {
    const { admin, bot } = await puppetSetup();

    admin.clientSend({ type: "sandboxViewAs", seat: bot });
    await admin.waitFor((m) => m.type === "sandboxConfig" && m.controlling === bot);
    expect(admin.last("sandboxConfig").control).toBe(true);

    // 그 봇의 차례가 오면 프롬프트가 내 소켓으로 온다
    await admin.waitFor(
      (m) => m.type === "prompt" && m.prompt.player === bot && m.prompt.options.some((o: any) => o.type === "discard"),
    );
    const prompt = [...admin.sent]
      .reverse()
      .find((m) => m.type === "prompt" && m.prompt.player === bot);
    const discard = prompt.prompt.options.find((o: any) => o.type === "discard");

    // 내가 그 좌석으로 답하면 실제로 그 패가 버려진다
    admin.clientSend({
      type: "action",
      actionType: "discard",
      payload: discard.payload,
      seat: bot,
    });
    await admin.waitFor(
      (m) => m.type === "view" && (m.view.zones[`discards:${bot}`]?.tileIds ?? []).includes(discard.payload.tileId),
    );
  });

  it("조작 모드를 끄면 봇이 스스로 둔다 (프롬프트가 나에게 오지 않는다)", async () => {
    const { admin, bot } = await puppetSetup();

    admin.clientSend({ type: "sandboxControl", enabled: false });
    await admin.waitFor((m) => m.type === "sandboxConfig" && m.control === false);
    admin.clientSend({ type: "sandboxViewAs", seat: bot });
    await admin.waitFor((m) => m.type === "sandboxConfig" && m.controlling === null);
    admin.sent.length = 0;

    // 봇이 알아서 두어 판이 흐른다 — 그 좌석 프롬프트는 나에게 오지 않는다
    await admin.waitFor((m) => m.type === "view");
    await new Promise((r) => setTimeout(r, 120));
    expect(admin.all("prompt").some((m) => m.prompt.player === bot)).toBe(false);
  });

  it("조작 중 시점을 옮기면 대기 중이던 봇 결정을 봇이 즉시 회수한다", async () => {
    const { admin, me, bot } = await puppetSetup();

    admin.clientSend({ type: "sandboxViewAs", seat: bot });
    await admin.waitFor(
      (m) => m.type === "prompt" && m.prompt.player === bot && m.prompt.options.some((o: any) => o.type === "discard"),
    );
    // 답하지 않고 내 시점으로 복귀 → 봇이 이어서 둔다 (30초 타임아웃을 기다리지 않는다)
    admin.clientSend({ type: "sandboxViewAs", seat: me });
    await admin.waitFor(
      (m) => m.type === "view" && (m.view.zones[`discards:${bot}`]?.tileIds.length ?? 0) > 0,
      3000,
    );
  });
});
