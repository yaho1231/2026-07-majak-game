/**
 * 관리자 중계 도구가 **화면을 되돌릴 근거를 언제나 준다** (docs/36 · QA 2차 admin).
 *
 * 여기서 못 박는 것은 셋이다.
 *
 * 1. **탁자를 옮기면 새 탁자의 사실이 온다** (확정 2). 예전에는 새 방이 안 서 있으면
 *    `gamePaused` 를 아예 안 보냈고, 앞 탁자의 공지도 내려 주지 않았다. 그래서 A방을
 *    세워 두고 B방으로 옮기면 «정지 중» 오버레이와 A방 공지가 멀쩡한 B방을 덮었다.
 * 2. **이미 그 상태인 방에 같은 조작을 걸어도 확인 응답이 온다** (확정 2). 조용한
 *    무시는 화면을 가둔다: 버튼 라벨이 `pause !== null` 하나로 정해지므로 「▶ 재개」에
 *    박힌 채, 눌러도 답이 없으니 영영 풀리지 않았다 — 그 탁자에서 일시정지 도구가 죽는다.
 * 3. **판이 끝나 관전이 끊길 때도 감사 로그가 남고 뒷정리가 된다** (확정 4).
 *    관전 세션의 가장 흔한 종료 경로가 통째로 기록에서 빠져 있었다 — 「누가 그 판을
 *    얼마나 봤나」에 «시작»만 있고 «종료»가 없었다.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
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
  clear(): void {
    this.sent = [];
  }
  waitFor(pred: (m: any) => boolean, timeoutMs = 30_000): Promise<void> {
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
        () =>
          this.clientSend({
            type: "action",
            actionType: pick.type,
            payload: pick.payload,
            seat: msg.prompt.player,
          }),
        0,
      );
    } else if (msg.type === "draftOffer") {
      const first = (msg.choices as any[])[0];
      if (first !== undefined) {
        setTimeout(
          () => this.clientSend({ type: "draftPick", stage: msg.stage, augmentId: first.id }),
          0,
        );
      }
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
const managers: RoomManager[] = [];

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

afterEach(async () => {
  for (const m of managers.splice(0)) {
    m.shutdown("테스트 정리");
    m.stop();
  }
  await new Promise((r) => setTimeout(r, 0));
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  for (const db of dbs.splice(0)) db.close();
  vi.restoreAllMocks();
});

interface H {
  rm: RoomManager;
  db: SiteDb;
}

async function newHarness(): Promise<H> {
  const dir = await mkdtemp(join(tmpdir(), "majak-adminspec-"));
  dirs.push(dir);
  const store = new StatsStore(join(dir, "stats.json"));
  await store.load();
  const db = new SiteDb(":memory:", undefined, "ADMINCODE");
  dbs.push(db);
  const manager = new RoomManager(dir, store, 0, db);
  managers.push(manager);
  return { rm: manager, db };
}

async function connectAs(h: H, username: string, admin = false): Promise<FakeSocket> {
  const sock = new FakeSocket();
  h.rm.handleConnection(sock.asWs());
  sock.clientSend({
    type: "register",
    username,
    password: "pw123456",
    ...(admin ? { adminCode: h.db.adminCode() } : {}),
  });
  await sock.waitFor((m) => m.type === "authOk" || m.type === "error");
  if (sock.last("authOk") === undefined) throw new Error(`register failed: ${username}`);
  return sock;
}

/** 사람 1 + 봇 3 동풍전을 시작하고 방 코드를 돌려준다. */
async function startGame(h: H, host: FakeSocket): Promise<string> {
  host.clientSend({ type: "createRoom" });
  await host.waitFor((m) => m.type === "roomCreated");
  const code = host.last("roomCreated").code as string;
  host.clientSend({ type: "setGameMode", mode: "tonpuu" });
  for (let i = 0; i < 3; i++) host.clientSend({ type: "addBot" });
  host.clientSend({ type: "startGame" });
  await host.waitFor((m) => m.type === "view");
  return code;
}

describe("관전 탁자 전환 — 앞 탁자의 상태가 들러붙지 않는다", () => {
  it("안 서 있는 탁자로 옮기면 «정지 해제»와 «공지 없음»이 확정돼 온다", async () => {
    const h = await newHarness();
    const a = await connectAs(h, "PlayerA");
    const b = await connectAs(h, "PlayerB");
    const admin = await connectAs(h, "Boss", true);

    const roomA = await startGame(h, a);
    const roomB = await startGame(h, b);

    // A방을 세우고 공지를 건다 — 그다음 B방으로 옮긴다.
    admin.clientSend({ type: "spectate", code: roomA });
    await admin.waitFor((m) => m.type === "spectateStarted");
    admin.clientSend({ type: "adminPauseGame", code: roomA, paused: true, reason: "점검" });
    admin.clientSend({ type: "adminRoomNotice", code: roomA, text: "5분 뒤 재개" });
    await admin.waitFor((m) => m.type === "gamePaused" && m.paused === true);
    await admin.waitFor((m) => m.type === "roomNotice" && m.text === "5분 뒤 재개");

    admin.clear();
    admin.clientSend({ type: "spectate", code: roomB });
    await admin.waitFor((m) => m.type === "spectateStarted" && m.code === roomB);
    await sleep(80);

    const paused = admin.last("gamePaused");
    expect(
      paused,
      "새 탁자에 붙었는데 정지 상태를 아무도 알려 주지 않았다 — 앞 탁자의 «정지 중»이 그대로 남는다",
    ).toBeDefined();
    expect(paused.paused).toBe(false);
    const notice = admin.last("roomNotice");
    expect(notice, "새 탁자의 공지 상태가 오지 않았다 — 앞 탁자의 공지가 그대로 남는다").toBeDefined();
    expect(notice.text, "앞 탁자의 공지가 내려가지 않았다").toBe("");

    // A방은 여전히 서 있다 — 관전을 옮긴다고 판을 건드리지는 않는다.
    admin.clientSend({ type: "liveGames" });
    await admin.waitFor((m) => m.type === "liveGames");
    const rowA = admin.last("liveGames").rooms.find((r: any) => r.code === roomA);
    expect(rowA?.paused).toBe(true);
  }, 90_000);

  it("이미 안 서 있는 방에 «재개»를 걸어도 확인 응답이 온다 (버튼이 풀린다)", async () => {
    const h = await newHarness();
    const a = await connectAs(h, "PlayerA");
    const admin = await connectAs(h, "Boss", true);
    const code = await startGame(h, a);

    admin.clear();
    admin.clientSend({ type: "adminPauseGame", code, paused: false });
    await sleep(80);
    const ack = admin.last("gamePaused");
    expect(
      ack,
      "같은 상태라고 조용히 무시하면 관전 화면의 «▶ 재개» 버튼이 영영 풀리지 않는다",
    ).toBeDefined();
    expect(ack.paused).toBe(false);
  }, 60_000);
});

describe("관전 종료 — 어느 문으로 나가든 같은 기록이 남는다", () => {
  it("판이 끝나서 끊길 때도 감사 로그가 남고 뒷정리가 된다", async () => {
    const h = await newHarness();
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });

    const a = await connectAs(h, "PlayerA");
    const admin = await connectAs(h, "Boss", true);
    const code = await startGame(h, a);

    // 지연 송출을 걸어 «대기 중인 프레임»이 실제로 쌓이게 한다 (C1).
    admin.clientSend({ type: "spectate", code, delaySeconds: 15 });
    await admin.waitFor((m) => m.type === "spectateStarted");
    await sleep(150);

    const conn = [...(h.rm as any).conns].find((c: any) => c.spectating !== null);
    expect(conn, "관전 연결을 못 찾았다").toBeDefined();
    expect(conn.spectateTimers.size, "지연 대기분이 안 쌓였다 — 이 검사가 무의미해진다")
      .toBeGreaterThan(0);

    // 판을 끝낸다 (강제 종료 = endSpectating 경로).
    admin.clientSend({ type: "adminAbortGame", code });
    await admin.waitFor((m) => m.type === "spectateEnded");
    await sleep(50);

    expect(
      logs.some((l) => l.includes("관전 종료") && l.includes(code)),
      `판이 끝나 관전이 끊겼는데 «관전 종료» 감사 로그가 없다 — 본 시간을 답할 수 없다. 로그=${logs.filter((l) => l.includes("관전")).join(" | ")}`,
    ).toBe(true);
    expect(conn.spectating, "관전 상태가 안 풀렸다").toBeNull();
    expect(conn.spectateSince, "본 시간 기준점이 안 비워졌다").toBe(0);
    expect(conn.spectateTimers.size, "지연 송출 대기분이 안 걷혔다").toBe(0);
    expect(conn.spectateDelayMs).toBe(0);
  }, 90_000);
});
