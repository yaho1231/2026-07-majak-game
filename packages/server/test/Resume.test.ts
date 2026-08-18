/**
 * 서버 재시작 이어하기 — 감사 2026-08-17 §2-10 회귀 가드.
 *
 * **무엇이 문제였나**: 방은 인메모리 전용이었고 `recordGame`도 종국에만 불렸다.
 * 서버를 재시작하면 진행 중이던 40분짜리 반장전이 **어디에도 남지 않고** 사라졌다 —
 * 점수도 기록도 리플레이 목록도 없이, 네 사람의 시간이 통째로.
 *
 * 이 파일이 지키는 선:
 * - 진행 중인 판이 `live_games`에 남는다 (끝나면 그 자리에서 지워진다).
 * - 새 프로세스가 그 판을 **같은 방 코드로** 되살리고, 사람은 평소대로
 *   `joinRoom`으로 자기 자리에 돌아온다.
 * - 되살린 판은 **그 판이 시작될 때의 규칙**으로 이어진다 (우마·오카·드래프트 스케줄).
 * - 리플레이는 **같은 파일에 이어 쓴다** (반쪽 파일도, 고아도 만들지 않는다).
 * - 아무도 돌아오지 않아도 판이 저 혼자 진행되지 않는다 (§2-5의 "판 세워 두기").
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WebSocket } from "ws";
import { RoomManager } from "../src/RoomManager.js";
import { StatsStore } from "../src/StatsStore.js";
import { SiteDb } from "../src/SiteDb.js";
import { reconstructGame } from "../src/ReplayReader.js";
import { contentAugments } from "@majak/content";

const WAIT_MS = 90_000;

class FakeSocket {
  readyState = 1;
  sent: any[] = [];
  autoRespond = false;
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

  waitFor(pred: (m: any) => boolean, timeoutMs = WAIT_MS): Promise<void> {
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
      const id = msg.choices[0].id;
      setTimeout(() => this.clientSend({ type: "draftPick", stage: msg.stage, augmentId: id }), 0);
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

/**
 * 리플레이 파일이 **디스크에 나타날 때까지** 기다렸다 읽는다.
 *
 * `createWriteStream`은 파일을 지연 생성한다 — 게임이 시작된 직후에는 경로만
 * 정해져 있고 파일은 아직 없을 수 있다. 실서버에서는 아무도 그 순간에 파일을
 * 열지 않으므로 문제가 아니지만, 테스트는 정확히 그 순간에 연다.
 */
async function readReplay(path: string, minLines = 1): Promise<string> {
  let text = "";
  for (let i = 0; i < 300; i++) {
    if (existsSync(path)) {
      text = await readFile(path, "utf8");
      if (text.split("\n").filter((l) => l.trim() !== "").length >= minLines) return text;
    }
    await new Promise((r) => setTimeout(r, 20));
  }
  return text;
}

const dirs: string[] = [];
const dbs: SiteDb[] = [];
const managers: RoomManager[] = [];

/**
 * 한 "머신"을 만든다 — 같은 `replayDir`·같은 DB 파일을 공유하는 RoomManager.
 * 재시작은 이 함수로 **같은 경로에** 새 매니저를 세우는 것으로 흉내 낸다
 * (프로세스만 갈리고 디스크는 그대로 — 실제 재시작과 같은 조건).
 */
async function newManager(dir: string, dbPath: string): Promise<RoomManager> {
  const store = new StatsStore(join(dir, "stats.json"));
  await store.load();
  const db = new SiteDb(dbPath);
  dbs.push(db);
  const rm = new RoomManager(dir, store, 0, db, "");
  managers.push(rm);
  return rm;
}

async function newMachine(): Promise<{ dir: string; dbPath: string; rm: RoomManager }> {
  const dir = await mkdtemp(join(tmpdir(), "majak-resume-"));
  dirs.push(dir);
  const dbPath = join(dir, "site.db");
  return { dir, dbPath, rm: await newManager(dir, dbPath) };
}

/**
 * 계정으로 붙어 봇 3명과 판을 시작하고, 첫 뷰까지 기다린다.
 *
 * `autoRespond`는 **시작 메시지를 보내기 전에** 켜야 한다. 나중에 켜면 첫
 * 드래프트 제안이 이미 나간 뒤라 아무도 답하지 않고, 판이 30초 동안 그 자리에
 * 멈춘다(그러면 리플레이에 이벤트가 한 줄도 안 쌓인다).
 */
async function startGame(
  rm: RoomManager,
  username: string,
  autoRespond = false,
): Promise<FakeSocket> {
  const sock = new FakeSocket();
  sock.autoRespond = autoRespond;
  rm.handleConnection(sock.asWs());
  sock.clientSend({ type: "register", username, password: "pw123456" });
  await sock.waitFor((m) => m.type === "authOk");
  sock.clientSend({ type: "createRoom" });
  await sock.waitFor((m) => m.type === "roomCreated");
  sock.clientSend({ type: "addBot" });
  sock.clientSend({ type: "addBot" });
  sock.clientSend({ type: "addBot" });
  await sock.waitFor((m) => m.type === "lobby" && m.players.length === 4);
  sock.clientSend({ type: "startGame" });
  await sock.waitFor((m) => m.type === "view" || m.type === "draftOffer");
  return sock;
}

afterEach(async () => {
  for (const m of managers.splice(0)) {
    m.shutdown("테스트 정리");
    m.stop();
  }
  // 중단된 게임 루프가 마지막 쓰기를 흘려보낼 틈을 준다. 0ms로는 부족했다 —
  // 리플레이 스트림이 지우는 도중에 파일을 하나 더 만들어 ENOTEMPTY가 났다.
  await new Promise((r) => setTimeout(r, 200));
  for (const d of dirs.splice(0)) {
    await rm(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
  for (const db of dbs.splice(0)) db.close();
});

// ─────────────────────────── 영속화 ───────────────────────────

describe("진행 중인 대국이 디스크에 남는다", () => {
  it("게임을 시작하면 live_games에 좌석까지 적힌다", async () => {
    const m = await newMachine();
    const sock = await startGame(m.rm, "Keeper");
    const code = sock.last("roomCreated").code as string;

    const db = dbs[dbs.length - 1]!;
    const rows = db.listLiveGames();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.code).toBe(code);
    expect(rows[0]!.seats).toHaveLength(4);
    expect(rows[0]!.seats.filter((s) => !s.isBot).map((s) => s.nickname)).toEqual(["Keeper"]);
    // 봇 자리는 성향까지 적어 둔다 — 재개 뒤 상대의 성격이 바뀌지 않게.
    expect(rows[0]!.seats.filter((s) => s.isBot).every((s) => s.archetype !== undefined)).toBe(true);
    expect(rows[0]!.replayPath).toContain(".jsonl");
  });

  it("판이 끝나면 그 자리에서 지워진다 (부팅마다 되살아나지 않는다)", async () => {
    const m = await newMachine();
    const sock = await startGame(m.rm, "Finisher", true);
    await sock.waitFor((msg) => msg.type === "gameOver");

    expect(dbs[dbs.length - 1]!.listLiveGames()).toHaveLength(0);
  }, 120_000);
});

// ─────────────────────────── 이어하기 ───────────────────────────

describe("서버를 다시 켜면 그 판이 그대로 선다", () => {
  it("같은 방 코드로 되살아나고, 사람은 평소대로 자기 자리에 앉는다", async () => {
    const m = await newMachine();
    const sock = await startGame(m.rm, "Comeback");
    const code = sock.last("roomCreated").code as string;

    // ── 재시작 ── (shutdown은 리플레이 파일도 live_games 행도 남긴다)
    // 리플레이가 디스크에 다 나갈 때까지 기다린다 — 실제 종료 경로(index.ts의
    // gracefulShutdown)도 이 프로미스를 기다린다.
    await m.rm.shutdown("재시작");
    m.rm.stop();
    managers.length = 0; // afterEach가 두 번 끄지 않게
    sock.close();

    const revived = await newManager(m.dir, m.dbPath);
    await revived.restoreLiveGames();

    expect(revived.healthSnapshot()).toMatchObject({ rooms: 1, playing: 1 });

    // 사람은 **새 경로 없이** 돌아온다 — 홈의 "진행하던 방으로 재접속"이 보내는
    // 그 joinRoom 하나가 전부다.
    const back = new FakeSocket();
    revived.handleConnection(back.asWs());
    back.clientSend({ type: "login", username: "Comeback", password: "pw123456" });
    await back.waitFor((msg) => msg.type === "authOk");
    back.clientSend({ type: "joinRoom", code });
    await back.waitFor((msg) => msg.type === "view");

    expect(back.last("joined")).toBeDefined();
    // 되살린 판의 뷰가 **내 시점**으로 온다 — 내 좌석이 그대로 살아 있다는 뜻이다.
    const view = back.last("view").view;
    expect(view.playerId).toBe(back.last("joined").playerId);
    expect(view.players.map((p: { nickname: string }) => p.nickname)).toContain("Comeback");
    // 카탈로그도 다시 온다 — 도감·증강 이름이 재개 뒤에도 화면에 선다.
    expect(back.last("catalog")).toBeDefined();
  }, 120_000);

  it("되살린 판은 같은 리플레이 파일을 이어 쓴다 (반쪽 파일을 만들지 않는다)", async () => {
    const m = await newMachine();
    const sock = await startGame(m.rm, "Appender");
    const path = dbs[dbs.length - 1]!.listLiveGames()[0]!.replayPath;
    const before = (await readReplay(path)).split("\n").filter((l) => l.trim() !== "");

    await m.rm.shutdown("재시작");
    m.rm.stop();
    managers.length = 0;
    sock.close();

    const revived = await newManager(m.dir, m.dbPath);
    await revived.restoreLiveGames();
    // 되살린 판이 한 수라도 두게 둔다 (봇 셋이 계속 돈다).
    await new Promise((r) => setTimeout(r, 1200));

    const after = (await readReplay(path)).split("\n").filter((l) => l.trim() !== "");
    expect(JSON.parse(after[0]!).type).toBe("__init__"); // 첫 줄은 그대로
    expect(after.length).toBeGreaterThanOrEqual(before.length); // 잘리지 않았다
    expect(after.slice(0, before.length)).toEqual(before); // 앞부분이 그대로다
  }, 120_000);

  it("아무도 안 돌아오면 판이 저 혼자 진행되지 않는다 (판을 세워 둔다)", async () => {
    const m = await newMachine();
    const sock = await startGame(m.rm, "NoShow");
    await m.rm.shutdown("재시작");
    m.rm.stop();
    managers.length = 0;
    sock.close();

    const revived = await newManager(m.dir, m.dbPath);
    await revived.restoreLiveGames();

    const path = dbs[dbs.length - 1]!.listLiveGames()[0]!.replayPath;
    const at1 = (await readReplay(path)).length;
    // 평소의 끊김 유예(5초)를 한참 넘겨 기다린다. 세워 두지 않았다면 이 사이에
    // 사람 좌석이 8회 연속 폴백으로 흘러 이탈이 확정됐을 것이다.
    await new Promise((r) => setTimeout(r, 7_000));
    const at2 = (await readReplay(path)).length;

    // 봇 차례는 계속 돌 수 있으므로 "전혀 안 늘어난다"고 주장하지 않는다.
    // 확인하는 것은 방이 **아직 살아 있다**는 것 — 좌석이 이탈로 확정돼 사람이
    // 전부 빠졌다면 판이 무효로 접히고 방이 사라진다.
    expect(revived.healthSnapshot().rooms).toBe(1);
    expect(at2).toBeGreaterThanOrEqual(at1);
  }, 60_000);

  it("너무 오래 전에 끊긴 판은 되살리지 않는다 (파일은 남는다)", async () => {
    const m = await newMachine();
    const sock = await startGame(m.rm, "Ancient");
    const db = dbs[dbs.length - 1]!;
    const row = db.listLiveGames()[0]!;
    await m.rm.shutdown("재시작");
    m.rm.stop();
    managers.length = 0;
    sock.close();

    // 하루 전에 끊긴 것으로 만든다.
    db.saveLiveGame({ ...row, updatedAt: new Date(Date.now() - 24 * 60 * 60_000).toISOString() });

    const revived = await newManager(m.dir, m.dbPath);
    await revived.restoreLiveGames();

    expect(revived.healthSnapshot().rooms).toBe(0);
    expect(db.listLiveGames()).toHaveLength(0); // 부팅마다 다시 시도하지 않는다
    await expect(readFile(row.replayPath, "utf8")).resolves.toContain("__init__"); // 파일은 남는다
  }, 120_000);
});

describe("되살린 판이 실제로 끝까지 간다", () => {
  it("재개한 반장전이 종국까지 가고, 그 판이 기록으로 남는다", async () => {
    const m = await newMachine();
    const sock = await startGame(m.rm, "Endgame", true);
    const code = sock.last("roomCreated").code as string;
    // 몇 수 두게 둔다 — 배패 직후가 아니라 **판 중간**에서 끊는 것이 요점이다.
    await new Promise((r) => setTimeout(r, 1500));

    await m.rm.shutdown("재시작");
    m.rm.stop();
    managers.length = 0;
    sock.close();

    const revived = await newManager(m.dir, m.dbPath);
    await revived.restoreLiveGames();
    expect(revived.healthSnapshot().playing).toBe(1);

    // 돌아와서 끝까지 둔다.
    const back = new FakeSocket();
    back.autoRespond = true;
    revived.handleConnection(back.asWs());
    back.clientSend({ type: "login", username: "Endgame", password: "pw123456" });
    await back.waitFor((msg) => msg.type === "authOk");
    back.clientSend({ type: "joinRoom", code });
    await back.waitFor((msg) => msg.type === "gameOver");

    const over = back.last("gameOver");
    expect(over.rankings).toHaveLength(4);
    expect(over.rankings.map((r: { rank: number }) => r.rank).sort()).toEqual([1, 2, 3, 4]);
    /*
     * 순위와 점수가 **서로 맞는다** — 재개가 정산을 어긋나게 하지 않았다는 뜻이다.
     *
     * 여기서 "합계 100000"을 확인하지 **않는** 이유: 이 게임은 점수를 만들거나
     * 없애는 증강이 있어서 총합이 25000×4로 고정되지 않는다(실측: 같은 조건의
     * 평범한 판에서도 102000이 나온다). 총합에 못을 박으면 증강을 하나 추가할
     * 때마다 이 테스트가 "재개가 깨졌다"고 거짓말한다.
     */
    const byRank = [...over.rankings].sort(
      (a: { rank: number }, b: { rank: number }) => a.rank - b.rank,
    );
    for (let i = 1; i < byRank.length; i++) {
      expect(byRank[i - 1].rawScore).toBeGreaterThanOrEqual(byRank[i].rawScore);
    }
    // 그 판이 **끝난 판**으로 기록되고, 진행 중 목록에서는 빠진다.
    const db = dbs[dbs.length - 1]!;
    expect(db.listLiveGames()).toHaveLength(0);
    expect(db.listAllGames(10).some((g) => g.code === code)).toBe(true);
  }, 180_000);
});

// ─────────────────────────── 재구성 자체 ───────────────────────────

describe("리플레이 재구성", () => {
  it("__init__에 진행 설정이 실린다 (우마·오카·드래프트 스케줄)", async () => {
    const m = await newMachine();
    await startGame(m.rm, "Configured");
    const path = dbs[dbs.length - 1]!.listLiveGames()[0]!.replayPath;
    const init = JSON.parse((await readReplay(path)).split("\n")[0]!);

    expect(init.payload.hanchan).toBeDefined();
    expect(init.payload.hanchan.uma).toHaveLength(2);
    expect(typeof init.payload.hanchan.oka).toBe("number");
    expect(Array.isArray(init.payload.hanchan.draftSchedules)).toBe(true);
    // 시드는 담지 않는다 — 난수 상태는 GameState에 있고, 다시 쓰면 이미 뽑은
    // 패를 되풀이하게 된다.
    expect(init.payload.hanchan.seed).toBeUndefined();
  });

  it("마지막 줄이 반만 써져 있어도 거기까지는 되살린다", async () => {
    const m = await newMachine();
    await startGame(m.rm, "Truncated", true);
    const path = dbs[dbs.length - 1]!.listLiveGames()[0]!.replayPath;
    // 이벤트가 실제로 쌓이게 몇 수 둔다.
    await new Promise((r) => setTimeout(r, 1500));
    await m.rm.shutdown("재시작");
    m.rm.stop();
    managers.length = 0;

    // 진짜 이벤트가 여러 줄 쌓인 상태에서 잘라야 이 테스트가 뜻을 갖는다 —
    // __init__ 한 줄만 있는 파일은 "0개까지 되살렸다"로도 통과해 버린다.
    const text = await readReplay(path, 10);
    const lines = text.split("\n").filter((l) => l.trim() !== "");
    expect(lines.length).toBeGreaterThanOrEqual(10);
    // SIGKILL로 write가 중간에 끊긴 모양을 만든다.
    await writeFile(path, `${lines.join("\n")}\n{"type":"Dra`);

    const recon = reconstructGame((await readReplay(path)).split("\n"), {
      extraAugments: contentAugments,
    });
    expect(recon.eventCount).toBe(lines.length - 1); // __init__ 제외
    expect(recon.hanchan.draftSchedules).toBeDefined();
  }, 60_000);

  it("진행 설정이 없는 옛 파일은 모드에서 되만든다", () => {
    const init = {
      type: "__init__",
      payload: {
        config: { playerIds: ["p0", "p1", "p2", "p3"], mode: "tonpuu" },
        options: { startScore: 25000, redFivesPerSuit: 1 },
      },
    };
    const recon = reconstructGame([JSON.stringify(init)], { extraAugments: contentAugments });
    expect(recon.hanchan.mode).toBe("tonpuu");
    expect(recon.hanchan.maxWind).toBe(1); // 동풍전
    expect(recon.hanchan.draftSchedules).toEqual(["gameStart", "eastThird", "eastFourth"]);
  });
});
