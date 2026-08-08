/**
 * 서버 견고성 회귀 — 좀비 방·유휴 방 청소·통계 저장 체인·정상 종료.
 *
 * 전부 "한 번 어긋나면 프로세스가 사는 동안 회복되지 않는" 종류의 결함이라,
 * 각 테스트는 **고장 난 뒤에도 다음 요청이 정상으로 처리되는가**까지 확인한다.
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile, unlink, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WebSocket } from "ws";
import { RoomManager } from "../src/RoomManager.js";
import { StatsStore } from "../src/StatsStore.js";
import { SiteDb } from "../src/SiteDb.js";
import { createEmptyStats } from "@majak/core/stats/PlayerStats.js";

class FakeSocket {
  readyState = 1; // OPEN
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
    for (const cb of this.handlers.close ?? []) cb();
  }

  clientSend(msg: unknown): void {
    for (const cb of this.handlers.message ?? []) cb(Buffer.from(JSON.stringify(msg)));
  }

  last(type: string): any {
    return [...this.sent].reverse().find((m) => m.type === type);
  }

  has(pred: (m: any) => boolean): boolean {
    return this.sent.some(pred);
  }

  waitFor(pred: (m: any) => boolean, timeoutMs = 15_000): Promise<void> {
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

interface Harness {
  rm: RoomManager;
  db: SiteDb;
  store: StatsStore;
  replayDir: string;
}

/** @param replayDir 리플레이 디렉터리를 강제로 지정한다(시작 실패 재현용). */
async function newHarness(replayDir?: string): Promise<Harness> {
  const dir = replayDir ?? (await mkdtemp(join(tmpdir(), "majak-hard-")));
  const statsDir = await mkdtemp(join(tmpdir(), "majak-hard-stats-"));
  dirs.push(statsDir);
  const store = new StatsStore(join(statsDir, "stats.json"));
  await store.load();
  const db = new SiteDb(":memory:");
  dbs.push(db);
  const rm = new RoomManager(dir, store, 0, db);
  managers.push(rm);
  return { rm, db, store, replayDir: dir };
}

async function register(h: Harness, username: string): Promise<FakeSocket> {
  const sock = new FakeSocket();
  h.rm.handleConnection(sock.asWs());
  sock.clientSend({ type: "register", username, password: "pw123456" });
  await sock.waitFor((m) => m.type === "authOk" || m.type === "error");
  return sock;
}

/** 방을 만들고 봇 3명을 채워 시작 직전까지 간다. 방 코드를 돌려준다. */
async function roomWithBots(sock: FakeSocket): Promise<string> {
  sock.clientSend({ type: "createRoom" });
  await sock.waitFor((m) => m.type === "roomCreated");
  const code = sock.last("roomCreated").code as string;
  for (let i = 0; i < 3; i++) sock.clientSend({ type: "addBot" });
  return code;
}

/**
 * 드래프트가 있으면 첫 카드로 넘기면서 뷰가 나올 때까지 기다린다.
 * `wantHandOf`를 주면 그 좌석의 손패가 **실제로 채워진** 뷰까지 기다린다
 * (배패 전 첫 뷰는 손패가 비어 있다).
 */
async function playUntilView(
  sock: FakeSocket,
  wantHandOf?: string,
  timeoutMs = 20_000,
): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  let lastOffer: unknown = null;
  while (Date.now() < deadline) {
    const view = sock.last("view");
    if (view !== undefined && (wantHandOf === undefined || myHandIds(view, wantHandOf).length > 3)) {
      return view;
    }
    const offer = sock.last("draftOffer");
    if (offer !== undefined && offer !== lastOffer) {
      lastOffer = offer;
      sock.clientSend({ type: "draftPick", stage: offer.stage, augmentId: offer.choices[0].id });
    }
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("view가 오지 않았다");
}

/** 이 뷰에서 그 좌석 손패 zone의 tileId 목록. */
function myHandIds(view: any, playerId: string): number[] {
  const zone = Object.values(view.view.zones as Record<string, any>).find(
    (z: any) => z.kind === "hand" && z.owner === playerId,
  );
  return [...((zone as any)?.tileIds ?? [])];
}

const countViews = (sock: FakeSocket): number =>
  sock.sent.filter((m) => m.type === "view").length;

afterEach(async () => {
  for (const m of managers.splice(0)) m.stop();
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  for (const db of dbs.splice(0)) db.close();
  delete process.env.ROOM_IDLE_TTL_MS;
});

describe("게임 시작 실패 — 좀비 방이 남지 않는다", () => {
  it("리플레이 디렉터리를 열 수 없으면 방을 대기실로 되돌리고 알린다", async () => {
    // 리플레이 디렉터리 자리에 **파일**을 둔다 → ReplayWriter.open()의 mkdir이 던진다.
    const base = await mkdtemp(join(tmpdir(), "majak-hard-broken-"));
    dirs.push(base);
    const blocked = join(base, "replays");
    await writeFile(blocked, "not a directory", "utf8");

    const h = await newHarness(blocked);
    const sock = await register(h, "Zombie");
    await roomWithBots(sock);
    sock.clientSend({ type: "startGame" });

    await sock.waitFor((m) => m.type === "error" && m.code === "GAME_START_FAILED");

    // 방은 대기실로 돌아왔다 — 오류 뒤에 대기실 갱신이 다시 나간다.
    const lobbyAfter = sock.sent
      .slice(sock.sent.findIndex((m) => m.code === "GAME_START_FAILED"))
      .some((m) => m.type === "lobby");
    expect(lobbyAfter).toBe(true);

    // 그리고 결정적으로: 이 사람은 다시 게임을 만들 수 있다.
    // (예전에는 phase가 "playing"으로 굳어 영원히 ALREADY_IN_GAME이었다.)
    sock.clientSend({ type: "leaveRoom" });
    sock.clientSend({ type: "createRoom" });
    await sock.waitFor(
      (m) => m.type === "roomCreated" || (m.type === "error" && m.code === "ALREADY_IN_GAME"),
    );
    expect(sock.last("error")?.code).not.toBe("ALREADY_IN_GAME");
    expect(h.rm.healthSnapshot().playing).toBe(0);
  });
});

describe("유휴 방 청소", () => {
  it("아무 일도 없던 대기실은 상한을 넘으면 닫히고, 사람은 새 방을 만들 수 있다", async () => {
    const h = await newHarness();
    const sock = await register(h, "Idler");
    await roomWithBots(sock);
    expect(h.rm.healthSnapshot().rooms).toBe(1);

    process.env.ROOM_IDLE_TTL_MS = "0"; // 지금 이 순간 이미 상한 초과
    h.rm.sweepIdleRooms();

    expect(sock.last("error")?.code).toBe("ROOM_IDLE_CLOSED");
    expect(h.rm.healthSnapshot().rooms).toBe(0);

    // 좌석 링크까지 끊겨 있어야 새 방을 만들 수 있다
    sock.clientSend({ type: "createRoom" });
    await sock.waitFor((m) => m.type === "roomCreated" || m.type === "error");
    expect(sock.last("roomCreated")).toBeDefined();
  });

  it("진행 중인 게임은 유휴 상한과 무관하게 살아남는다", async () => {
    const h = await newHarness();
    const sock = await register(h, "Player");
    await roomWithBots(sock);
    sock.clientSend({ type: "startGame" });
    // 자동 응답을 하지 않으므로 첫 결정에서 판이 멈춰 있다 = 진행 중
    await sock.waitFor((m) => m.type === "view" || m.type === "draftOffer");
    expect(h.rm.healthSnapshot().playing).toBe(1);

    process.env.ROOM_IDLE_TTL_MS = "0";
    h.rm.sweepIdleRooms();

    expect(h.rm.healthSnapshot().playing).toBe(1);
    expect(sock.has((m) => m.code === "ROOM_IDLE_CLOSED")).toBe(false);
    h.rm.shutdown(); // 남은 대기 정리
  });
});

describe("StatsStore — 저장 실패가 이후 저장을 막지 않는다", () => {
  it("한 번 쓰기에 실패해도 다음 record는 정상적으로 파일에 남는다", async () => {
    const base = await mkdtemp(join(tmpdir(), "majak-hard-stats2-"));
    dirs.push(base);
    // 상위 경로 자리에 파일을 두어 mkdir이 던지게 한다
    const blockedDir = join(base, "sub");
    await writeFile(blockedDir, "not a directory", "utf8");
    const path = join(blockedDir, "stats.json");
    const store = new StatsStore(path);
    await store.load();

    await expect(store.record([{ nickname: "A", raw: createEmptyStats() }])).rejects.toBeTruthy();

    // 장애 해소 후 — 예전에는 saveChain이 거부된 채 굳어 **다시는** 저장되지 않았다.
    await unlink(blockedDir);
    await store.record([{ nickname: "B", raw: createEmptyStats() }]);
    await store.flush();

    const saved = JSON.parse(await readFile(path, "utf8")) as {
      players: Record<string, unknown>;
    };
    expect(Object.keys(saved.players).sort()).toEqual(["A", "B"]);
  });

  it("내용이 바뀌면 세대 번호가 오른다 (리더보드 캐시 무효화의 근거)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "majak-hard-rev-"));
    dirs.push(dir);
    const store = new StatsStore(join(dir, "s.json"));
    await store.load();
    const before = store.version();
    await store.record([{ nickname: "A", raw: createEmptyStats() }]);
    expect(store.version()).toBeGreaterThan(before);
  });
});

describe("정상 종료", () => {
  it("진행 중인 판의 사람에게 gameAborted를 보내고 방을 모두 정리한다", async () => {
    const h = await newHarness();
    const sock = await register(h, "Farewell");
    await roomWithBots(sock);
    sock.clientSend({ type: "startGame" });
    await sock.waitFor((m) => m.type === "view" || m.type === "draftOffer");

    h.rm.shutdown();

    expect(sock.last("gameAborted")).toBeDefined();
    expect(h.rm.healthSnapshot()).toMatchObject({ rooms: 0, playing: 0 });
  });

  it("대기실의 사람에게는 SERVER_SHUTDOWN을 알린다", async () => {
    const h = await newHarness();
    const sock = await register(h, "Waiter");
    await roomWithBots(sock);

    h.rm.shutdown();

    expect(sock.last("error")?.code).toBe("SERVER_SHUTDOWN");
    expect(h.rm.healthSnapshot().rooms).toBe(0);
  });
});

describe("경계 검증·기록 원자성", () => {
  it("voteAbort의 모르는 값은 거부된다 (조용히 '철회'로 해석하지 않는다)", async () => {
    const h = await newHarness();
    const sock = await register(h, "Voter");
    await roomWithBots(sock);
    sock.clientSend({ type: "startGame" });
    await sock.waitFor((m) => m.type === "view" || m.type === "draftOffer");

    sock.clientSend({ type: "voteAbort", vote: "yes-please" });
    expect(sock.last("error")?.code).toBe("BAD_REQUEST");
    h.rm.shutdown();
  });

  it("recordGame은 참가자 삽입이 실패하면 게임 행도 남기지 않는다", async () => {
    const db = new SiteDb(":memory:");
    dbs.push(db);
    const before = db.listAllGames().length;
    expect(() =>
      db.recordGame({
        code: "ABCDEF",
        replayPath: "/tmp/none.jsonl",
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        // rank가 문자열이 아니라 객체 → 바인딩이 던진다 (중간 실패 재현)
        players: [
          { userId: null, nickname: "A", isBot: true, rank: 1, score: 0 },
          { userId: null, nickname: "B", isBot: true, rank: {} as unknown as number, score: 0 },
        ],
      }),
    ).toThrow();
    expect(db.listAllGames().length).toBe(before);
  });
});

describe("handOrder 증폭 — 좌석 하나가 방 전체를 렉 걸 수 없다", () => {
  it(
    "번갈아 보낸 배치 폭주는 좌석당 초당 몇 번으로 접히고, 마지막 배치는 반영된다",
    async () => {
      const h = await newHarness();
      const sock = await register(h, "Flood");
      await roomWithBots(sock);
      sock.clientSend({ type: "startGame" });
      const me = sock.last("joined").playerId as string;
      const view = await playUntilView(sock, me);
      const orderA = myHandIds(view, me);
      expect(orderA.length).toBeGreaterThan(3);
      const orderB = [...orderA].reverse();

      const before = countViews(sock);
      // 토큰 버킷 한도(80)를 꽉 채워 두 배치를 번갈아 밀어 넣는다.
      // 예전에는 `setHandOrder`가 **똑같은 반복**만 걸러서 80개가 전부 통과했다.
      for (let i = 0; i < 80; i++) {
        sock.clientSend({ type: "handOrder", tileIds: i % 2 === 0 ? orderA : orderB });
      }
      const burst = countViews(sock) - before;
      expect(burst).toBeLessThanOrEqual(1);

      // 마지막 배치(orderB)는 반드시 도착해야 한다 — 버리면 남의 화면이 어긋난다.
      await sock.waitFor(
        (m) => m.type === "view" && myHandIds(m, me).join(",") === orderB.join(","),
        3_000,
      );
      // 폭주 전체가 만든 브로드캐스트는 손에 꼽는다 (예전엔 80회).
      expect(countViews(sock) - before).toBeLessThanOrEqual(3);
      h.rm.shutdown();
    },
    30_000,
  );
});

describe("진행 중 재접속 — 예전 탭이 남의 자리를 포기시킬 수 없다", () => {
  it(
    "두 번째 탭이 좌석을 가져가면 첫 탭의 나가기·중단 투표는 그 좌석에 닿지 않는다",
    async () => {
      const h = await newHarness();
      const tab1 = await register(h, "TwoTabs");
      const token = tab1.last("authOk").sessionToken as string;
      const code = await roomWithBots(tab1);
      tab1.clientSend({ type: "startGame" });
      await playUntilView(tab1);

      // 두 번째 탭 — 끊지 않고 그대로 같은 방에 들어간다
      const tab2 = new FakeSocket();
      h.rm.handleConnection(tab2.asWs());
      tab2.clientSend({ type: "tokenLogin", sessionToken: token });
      await tab2.waitFor((m) => m.type === "authOk");
      tab2.clientSend({ type: "joinRoom", code });
      await tab2.waitFor((m) => m.type === "joined");

      // 첫 탭이 "나가기" — 예전에는 여기서 두 번째 탭 사람의 좌석이 포기됐다
      tab1.clientSend({ type: "leaveRoom" });
      tab1.clientSend({ type: "voteAbort", vote: "agree" });

      // 좌석은 살아 있다: 게임은 여전히 진행 중이고 중단되지 않았다
      expect(h.rm.healthSnapshot().playing).toBe(1);
      expect(tab2.has((m) => m.type === "gameAborted")).toBe(false);

      // 그리고 결정적으로: 이 계정은 아직 이 방에 들어올 수 있다.
      // (포기된 좌석이었다면 ROOM_PLAYING으로 영영 잠긴다.)
      const tab3 = new FakeSocket();
      h.rm.handleConnection(tab3.asWs());
      tab3.clientSend({ type: "tokenLogin", sessionToken: token });
      await tab3.waitFor((m) => m.type === "authOk");
      tab3.clientSend({ type: "joinRoom", code });
      await tab3.waitFor((m) => m.type === "joined" || m.type === "error");
      expect(tab3.last("error")?.code).not.toBe("ROOM_PLAYING");
      expect(tab3.last("joined")).toBeDefined();

      h.rm.shutdown();
    },
    30_000,
  );
});
