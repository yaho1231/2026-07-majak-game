/**
 * 관전·중계의 가장자리 넷 (docs/36 · QA 2차 spectate 확정 1·5·6).
 *
 * 관전의 **뼈대는 원래 동작한다** — 정지·공지·시간 연장·딜레이·감사 로그·탁자 전환·
 * 다중 관전석·강제 종료·리플레이 일치는 실사에서 전부 통과했다. 문제는 가장자리였고,
 * 그중 하나는 대회 자체를 못 열게 만드는 것이었다.
 *
 * 1. 🔴 **완전정보 부정행위** (확정 1). `joinRoom`이 `stopSpectating`을 부르지 않아,
 *    60초 끊겨 좌석이 `abandoned`가 된 관리자가 자기 탁자를 관전한 뒤 그대로 복귀할 수
 *    있었다 — 한 소켓이 자기 뷰와 전원 손패 뷰를 함께 받는다. 문서 26·28·29가 전부
 *    「막혀 있다」고 적어 둔 시나리오다. 대회 운영자가 곧 선수이기도 한 구성에서는
 *    대회의 정당성 자체가 무너진다.
 * 2. 🟠 **지연 관전석이 마지막 N초를 잃는다** (확정 5). 종료 시 대기 큐가 통째로 폐기돼,
 *    15초 딜레이면 화면이 종료 15초 전에서 멈춘 채 `spectateEnded`만 도착했다.
 *    그 15초에 마지막 국의 화료·정산·최종 순위가 들어 있다.
 * 3. 🟠 **재시작이 정지·공지를 지운다** (확정 6). 판은 정확히 되살아나는데 운영자가
 *    세워 둔 것만 사라졌다 — 선수들이 돌아오는 순간 판정 대기 중인 탁자가 그냥 굴러간다.
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
    // 리플레이 writer 가 마지막 줄을 흘리는 중일 수 있다 — 재시도로 넘긴다.
  for (const d of dirs.splice(0))
    await rm(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  for (const db of dbs.splice(0)) db.close();
});

interface H {
  rm: RoomManager;
  db: SiteDb;
  dir: string;
}

async function newHarness(dir?: string, db?: SiteDb): Promise<H> {
  const d = dir ?? (await mkdtemp(join(tmpdir(), "majak-spectate-")));
  if (dir === undefined) dirs.push(d);
  const store = new StatsStore(join(d, "stats.json"));
  await store.load();
  const database = db ?? new SiteDb(":memory:", undefined, "ADMINCODE");
  if (db === undefined) dbs.push(database);
  const manager = new RoomManager(d, store, 0, database);
  managers.push(manager);
  return { rm: manager, db: database, dir: d };
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

/** 이미 있는 계정으로 새 소켓을 붙인다 (재접속·다른 탭). */
async function loginAs(h: H, username: string): Promise<FakeSocket> {
  const sock = new FakeSocket();
  h.rm.handleConnection(sock.asWs());
  sock.clientSend({ type: "login", username, password: "pw123456" });
  await sock.waitFor((m) => m.type === "authOk" || m.type === "error");
  if (sock.last("authOk") === undefined) throw new Error(`login failed: ${username}`);
  return sock;
}

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

/** 이 매니저의 연결 목록에서 관전 중인 것들. */
function spectatingConns(h: H): any[] {
  return [...(h.rm as any).conns].filter((c: any) => c.spectating !== null);
}

// ───────────────────────────────────────────────────────────────────────────

describe("완전정보 부정행위 — 자리에 앉으면 관전석은 남지 않는다", () => {
  it("관전 중인 연결이 방에 들어가면 관전이 그 자리에서 끊긴다", async () => {
    const h = await newHarness();
    const other = await connectAs(h, "Other");
    const admin = await connectAs(h, "Boss", true);
    const watched = await startGame(h, other);

    // 남의 방 관전은 허용된다 — 막는 것은 «앉은 채로 보는 것»이다.
    admin.clientSend({ type: "spectate", code: watched });
    await admin.waitFor((m) => m.type === "spectateStarted");
    expect(spectatingConns(h)).toHaveLength(1);

    // 이제 자기 방을 만들어 앉는다.
    admin.clientSend({ type: "createRoom" });
    await admin.waitFor((m) => m.type === "roomCreated");

    expect(
      spectatingConns(h),
      "자리에 앉았는데 관전석이 그대로 남았다 — 한 소켓이 자기 뷰와 전원 손패 뷰를 함께 받는다",
    ).toHaveLength(0);
    // 관전 중이던 방도 그 사실을 안다 (대국자에게 보이는 «중계 N명»이 어긋나면 안 된다).
    const room = (h.rm as any).rooms.get(watched);
    expect(room.spectators.size).toBe(0);
  }, 90_000);

  it("끊겨서 좌석이 abandoned 가 돼도 «돌아갈 수 있는 내 방»은 관전할 수 없다", async () => {
    const h = await newHarness();
    const admin = await connectAs(h, "Boss", true);
    const code = await startGame(h, admin);

    // 대국 중인 채로는 당연히 거절된다.
    admin.clear();
    admin.clientSend({ type: "spectate", code });
    await admin.waitFor((m) => m.type === "error");
    expect(admin.last("error").code).toBe("FORBIDDEN");

    /*
     * 60초 끊김 = 좌석이 `abandoned("timeout")`. 실제 경로는 유예 타임아웃 누적이지만
     * 결과 상태는 같고, 여기서 재는 것은 «그 상태에서 관전이 열리는가»다.
     * `canRejoin`이 true 인 좌석 — 즉 이 사람이 언제든 돌아갈 «내 자리»다.
     */
    const room = (h.rm as any).rooms.get(code);
    const seat = room.agents.find((a: any) => a.nickname === "Boss");
    seat.abandon("timeout");
    expect(seat.isAbandoned).toBe(true);
    expect(seat.canRejoin, "돌아갈 수 없는 좌석이면 이 시나리오가 성립하지 않는다").toBe(true);

    const back = await loginAs(h, "Boss");
    back.clientSend({ type: "spectate", code });
    await back.waitFor((m) => m.type === "spectateStarted" || m.type === "error");
    expect(
      back.last("spectateStarted"),
      "끊긴 좌석의 주인이 자기 탁자를 관전할 수 있었다 — 복귀하면 완전정보 치트가 된다",
    ).toBeUndefined();
    expect(back.last("error").code).toBe("FORBIDDEN");
  }, 90_000);
});

describe("지연 관전석 — 판이 끝나도 마지막 N초를 잃지 않는다", () => {
  it("게임이 끝나면 밀려 있던 프레임을 다 흘린 뒤 spectateEnded 가 온다", async () => {
    const h = await newHarness();
    const a = await connectAs(h, "PlayerA");
    const admin = await connectAs(h, "Boss", true);
    const code = await startGame(h, a);

    admin.clientSend({ type: "spectate", code, delaySeconds: 15 });
    await admin.waitFor((m) => m.type === "spectateStarted");
    await sleep(200);

    const conn = spectatingConns(h)[0];
    const queued = conn.spectateTimers.size;
    expect(queued, "지연 대기분이 안 쌓였다 — 이 검사가 무의미해진다").toBeGreaterThan(0);
    const before = admin.all("view").length;

    admin.clientSend({ type: "adminAbortGame", code });
    await admin.waitFor((m) => m.type === "spectateEnded");

    const after = admin.all("view").length;
    expect(
      after - before,
      `밀려 있던 ${queued}개 프레임이 통째로 폐기됐다 — 중계가 마지막 15초(화료·정산·최종 순위)를 잃는다`,
    ).toBeGreaterThan(0);
    // 그리고 «끝났다»는 결말보다 **뒤에** 도착해야 한다.
    const endedIdx = admin.sent.findIndex((m) => m.type === "spectateEnded");
    const lastViewIdx = admin.sent.map((m) => m.type).lastIndexOf("view");
    expect(lastViewIdx, "끝났다는 말이 결말보다 먼저 도착했다").toBeLessThan(endedIdx);
    // 흘려보낸 뒤 뒷정리는 그대로다 — 두 번 보내지 않는다.
    expect(conn.spectateTimers.size).toBe(0);
    expect(conn.spectating).toBeNull();
  }, 90_000);

  it("운영자가 스스로 접으면 밀린 프레임은 그대로 버린다 (C1의 원래 뜻)", async () => {
    const h = await newHarness();
    const a = await connectAs(h, "PlayerA");
    const admin = await connectAs(h, "Boss", true);
    const code = await startGame(h, a);

    admin.clientSend({ type: "spectate", code, delaySeconds: 15 });
    await admin.waitFor((m) => m.type === "spectateStarted");
    await sleep(200);
    const conn = spectatingConns(h)[0];
    expect(conn.spectateTimers.size).toBeGreaterThan(0);

    const before = admin.all("view").length;
    admin.clientSend({ type: "spectateStop" });
    await sleep(80);
    expect(
      admin.all("view").length,
      "창을 닫은 뒤에도 남의 손패가 계속 날아갔다 — 송출 딜레이가 막으려던 것 자체다",
    ).toBe(before);
    expect(conn.spectating).toBeNull();
  }, 90_000);
});

describe("재시작 — 세워 둔 탁자는 세워진 채로 되살아난다", () => {
  it("정지와 방 공지가 live_games 에 남고, 이어하기가 그대로 복원한다", async () => {
    const dir = await mkdtemp(join(tmpdir(), "majak-spectate-resume-"));
    dirs.push(dir);
    const db = new SiteDb(":memory:", undefined, "ADMINCODE");
    dbs.push(db);

    const h = await newHarness(dir, db);
    const a = await connectAs(h, "PlayerA");
    const admin = await connectAs(h, "Boss", true);
    const code = await startGame(h, a);

    // 운영자가 그 탁자를 보면서 세운다 — `gamePaused`·`roomNotice` 는 방 사람과
    // 관전석에 나가므로, 관전을 붙여 두어야 관리자 화면에도 확인이 돌아온다.
    admin.clientSend({ type: "spectate", code });
    await admin.waitFor((m) => m.type === "spectateStarted");
    admin.clientSend({ type: "adminPauseGame", code, paused: true, reason: "심판 판정 중" });
    admin.clientSend({ type: "adminRoomNotice", code, text: "재개 대기 중 — 심판 판정" });
    await admin.waitFor((m) => m.type === "gamePaused" && m.paused === true);
    await admin.waitFor((m) => m.type === "roomNotice" && m.text.length > 0);

    // ① DB에 실제로 적혔는가 — 여기가 없으면 재시작을 넘길 방법이 없다.
    const row = db.listLiveGames().find((r) => r.code === code);
    expect(row, "진행 중인 판이 이어하기 표에 없다").toBeDefined();
    expect(row!.paused, "세워 둔 탁자인데 그 사실이 재시작을 넘어갈 곳에 없다").toBe(true);
    expect(row!.pauseReason).toBe("심판 판정 중");
    expect(row!.notice).toBe("재개 대기 중 — 심판 판정");
    // 시한 없는 공지라 만료 시각도 없다 — 시한부 공지는 절대 시각으로 적힌다.
    expect(row!.noticeExpiresAt).toBeNull();

    // ② 서버를 내리고 같은 DB·같은 리플레이 디렉터리로 다시 세운다.
    const first = managers.splice(managers.indexOf(h.rm), 1)[0]!;
    first.stop(); // shutdown() 은 방을 정리하며 live_games 를 지운다 — «죽은» 재시작을 흉내 낸다
    await sleep(20);

    const h2 = await newHarness(dir, db);
    await (h2.rm as any).restoreLiveGames();
    await sleep(400);

    const revived = (h2.rm as any).rooms.get(code);
    expect(revived, "판이 되살아나지 않았다 — 이어하기 자체가 안 돈 것이다").toBeDefined();
    expect(
      revived.paused,
      "판은 되살아났는데 «정지»만 사라졌다 — 선수들이 돌아오는 순간 판정 대기 중인 탁자가 그냥 굴러간다",
    ).toBe(true);
    expect(revived.pauseReason).toBe("심판 판정 중");
    expect(revived.notice?.text).toBe("재개 대기 중 — 심판 판정");

    // ③ 되살아난 뒤 붙는 관전석에도 «정지 중»이 그대로 복원된다.
    const admin2 = await loginAs(h2, "Boss");
    admin2.clientSend({ type: "spectate", code });
    await admin2.waitFor((m) => m.type === "spectateStarted");
    await sleep(80);
    const paused = admin2.last("gamePaused");
    expect(paused, "합류한 관전석에 정지 상태가 안 왔다").toBeDefined();
    expect(paused.paused).toBe(true);
    expect(admin2.last("roomNotice")?.text).toBe("재개 대기 중 — 심판 판정");

    // ④ 목록에도 표식이 보인다 — 운영자가 «다시 눌러야 한다»를 알 유일한 창구다.
    admin2.clientSend({ type: "liveGames" });
    await admin2.waitFor((m) => m.type === "liveGames");
    const listed = admin2.last("liveGames").rooms.find((r: any) => r.code === code);
    expect(listed?.paused).toBe(true);
  }, 120_000);

  it("시한부 공지는 **절대 시각**으로 넘어가고, 이미 지난 것은 되살아나지 않는다", async () => {
    const dir = await mkdtemp(join(tmpdir(), "majak-spectate-ttl-"));
    dirs.push(dir);
    const db = new SiteDb(":memory:", undefined, "ADMINCODE");
    dbs.push(db);

    const h = await newHarness(dir, db);
    const a = await connectAs(h, "PlayerA");
    const admin = await connectAs(h, "Boss", true);
    const code = await startGame(h, a);
    admin.clientSend({ type: "spectate", code });
    await admin.waitFor((m) => m.type === "spectateStarted");
    // 대회에서 실제로 쓰는 모양 — 「심판 판정」을 한 시간 걸어 둔다.
    admin.clientSend({ type: "adminRoomNotice", code, text: "심판 판정 중", seconds: 3600 });
    await admin.waitFor((m) => m.type === "roomNotice" && m.text === "심판 판정 중");

    const row = db.listLiveGames().find((r) => r.code === code)!;
    expect(row.notice, "시한이 붙었다고 공지를 통째로 버렸다").toBe("심판 판정 중");
    expect(row.noticeExpiresAt, "시한이 안 적혔다 — 되살리면 무기한이 된다").not.toBeNull();
    const left = Date.parse(row.noticeExpiresAt!) - Date.now();
    expect(left).toBeGreaterThan(3_000_000);
    expect(left).toBeLessThanOrEqual(3_600_000);

    const first = managers.splice(managers.indexOf(h.rm), 1)[0]!;
    first.stop();
    await sleep(20);
    const h2 = await newHarness(dir, db);
    await (h2.rm as any).restoreLiveGames();
    await sleep(400);
    const revived = (h2.rm as any).rooms.get(code);
    expect(revived.notice?.text).toBe("심판 판정 중");
    expect(revived.notice?.expiresAt, "시한이 사라져 무기한 공지가 됐다").toBeTypeOf("number");

    /*
     * 이미 지난 공지는 되살아나지 않는다. 「5분 뒤 재개」가 재시작 한 번에 되살아나면
     * 그건 예고가 아니라 소음이다 — 그래서 남은 시간이 아니라 **시각**으로 적었다.
     */
    const stale = { ...row, noticeExpiresAt: new Date(Date.now() - 1000).toISOString() };
    db.saveLiveGame(stale);
    (h2.rm as any).rooms.delete(code);
    await (h2.rm as any).restoreLiveGames();
    await sleep(400);
    expect(
      (h2.rm as any).rooms.get(code)?.notice,
      "시한이 지난 공지가 재시작을 타고 되살아났다",
    ).toBeNull();
  }, 120_000);

  it("세워 두지 않은 판은 되살아나도 굳지 않는다 (모르는 값을 정지로 읽지 않는다)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "majak-spectate-resume2-"));
    dirs.push(dir);
    const db = new SiteDb(":memory:", undefined, "ADMINCODE");
    dbs.push(db);

    const h = await newHarness(dir, db);
    const a = await connectAs(h, "PlayerA");
    const code = await startGame(h, a);
    const row = db.listLiveGames().find((r) => r.code === code);
    expect(row!.paused).toBe(false);
    expect(row!.notice).toBeNull();
    expect(row!.noticeExpiresAt).toBeNull();

    const first = managers.splice(managers.indexOf(h.rm), 1)[0]!;
    first.stop();
    await sleep(20);

    const h2 = await newHarness(dir, db);
    await (h2.rm as any).restoreLiveGames();
    await sleep(400);
    const revived = (h2.rm as any).rooms.get(code);
    expect(revived, "판이 되살아나지 않았다").toBeDefined();
    expect(revived.paused, "안 세워 둔 판이 되살아나면서 굳었다").toBe(false);
    expect(revived.notice).toBeNull();
  }, 120_000);
});
