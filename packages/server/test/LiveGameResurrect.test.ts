/**
 * **끝난 판은 되살아나지 않는다** (QA 2차 server 확정 1).
 *
 * `onGameOver`는 `live_games` 행을 먼저 지우지만, 방을 대기실로 되돌리는
 * `resetRoomAfterGame`은 통계 전송(`finishStats`)이 끝나는 `.finally`에서야 돈다 —
 * 그 정리를 앞당길 수는 없다(`finishStats`가 `room.agents`를 훑어야 한다).
 * 그래서 그사이 방은 여전히 `phase==="playing" && controller!==null && writer!==null`
 * 이고, 그 창에 유휴 청소가 한 번만 돌면 `rememberLiveGame`이 **방금 지운 행을
 * 도로 써 넣었다.**
 *
 * 그 뒤가 조용해서 나쁘다: 다음 부팅이 이미 끝난 판을 되살려 리플레이를 처음부터
 * 다 소진하고 **두 번째로 종국**한다. `games`에 같은 리플레이가 두 행 남고, 누적
 * 전적과 증강 통계가 두 배가 된다(도감 티어의 근거가 오염된다). 로그에는 한 줄도
 * 안 남는다. 운영 기본값(`ROOM_SWEEP_INTERVAL_MS=60000`)에서는 창이 좁아 보이지만
 * `StatsStore.save()`가 프로세스 전역 체인에 직렬화되므로 판이 몰릴수록 벌어진다.
 *
 * 여기서는 그 창을 **손으로 붙들어** 재현한다: `statsStore.record`를 테스트가 놓아 줄
 * 때까지 멈춰 세우면 정확히 그 «정산 중» 구간에 서게 되고, 그 자리에서 청소를 돌린다.
 * 확률에 기대지 않고 매번 같은 자리를 짚는다.
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WebSocket } from "ws";
import { RoomManager } from "../src/RoomManager.js";
import { StatsStore } from "../src/StatsStore.js";
import { SiteDb } from "../src/SiteDb.js";

/** 봇 3 + 사람 1 동풍전 한 판의 예산 — RoomManager.test.ts 와 같은 근거. */
const GAME_MS = 90_000;

class FakeSocket {
  readyState = 1;
  sent: any[] = [];
  autoRespond = true;
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
  waitFor(pred: (m: any) => boolean, timeoutMs = GAME_MS): Promise<void> {
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
        opts.find((o) => o.type === "win") ??
        opts.find((o) => o.type === "pass") ??
        opts.find((o) => o.type === "discard") ??
        opts[0];
      setTimeout(
        () => this.clientSend({ type: "action", actionType: pick.type, payload: pick.payload }),
        0,
      );
    } else if (msg.type === "draftOffer") {
      setTimeout(
        () => this.clientSend({ type: "draftPick", stage: msg.stage, augmentId: msg.choices[0].id }),
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
const managers: RoomManager[] = [];

afterEach(async () => {
  for (const m of managers.splice(0)) {
    m.shutdown("테스트 정리");
    m.stop();
  }
  await new Promise((r) => setTimeout(r, 0));
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  for (const db of dbs.splice(0)) db.close();
});

describe("끝난 판이 live_games 에 되살아나지 않는다", () => {
  it(
    "종국 정산 중에 유휴 청소가 돌아도 이어하기 행이 다시 서지 않는다",
    async () => {
      const replayDir = await mkdtemp(join(tmpdir(), "majak-resurrect-"));
      dirs.push(replayDir);
      const store = new StatsStore(join(replayDir, "stats.json"));
      await store.load();
      const db = new SiteDb(":memory:");
      dbs.push(db);

      /*
       * `finishStats` 를 «정산 중»에 붙들어 둔다.
       *
       * 실제 서버에서 이 창을 벌리는 것은 `StatsStore.save()` 의 전역 직렬화다.
       * 테스트에서 그 타이밍을 기다리는 것은 곧 플레이크이므로, 같은 자리에
       * 문을 하나 달아 손으로 연다 — 재현하려는 것은 «창의 길이»가 아니라
       * «그 창에서 청소가 돌면 무슨 일이 벌어지는가»다.
       */
      let releaseStats: () => void = () => {};
      const statsHeld = new Promise<void>((r) => {
        releaseStats = r;
      });
      let statsEntered = false;
      const realRecord = store.record.bind(store);
      store.record = async (entries) => {
        statsEntered = true;
        await statsHeld;
        await realRecord(entries);
      };

      const manager = new RoomManager(replayDir, store, 0, db);
      managers.push(manager);

      const sock = new FakeSocket();
      manager.handleConnection(sock.asWs());
      sock.clientSend({ type: "register", username: "Resu", password: "pw123456" });
      await sock.waitFor((m) => m.type === "authOk");

      sock.clientSend({ type: "createRoom" });
      await sock.waitFor((m) => m.type === "roomCreated");
      const code = (sock.sent.find((m) => m.type === "roomCreated") as any).code as string;
      sock.clientSend({ type: "setGameMode", mode: "tonpuu" });
      for (let i = 0; i < 3; i++) sock.clientSend({ type: "addBot" });
      sock.clientSend({ type: "startGame" });

      // 판이 돌기 시작하면 이어하기 후보로 적혀 있어야 한다 (여기가 정상 동작).
      await sock.waitFor((m) => m.type === "view");
      expect(db.listLiveGames().map((r) => r.code)).toContain(code);

      await sock.waitFor((m) => m.type === "gameOver");
      // 종국 콜백이 forgetLiveGame → recordGame 을 지나 finishStats 앞에 서기까지.
      for (let i = 0; i < 200 && !statsEntered; i++) await new Promise((r) => setTimeout(r, 5));
      expect(statsEntered, "finishStats 가 붙들리지 않았다 — 창을 못 만들었다").toBe(true);

      // 지금이 바로 그 «정산 중» 구간이다. 방은 아직 playing 이고 컨트롤러·writer 가 살아 있다.
      const room = (manager as any).rooms.get(code);
      expect(room?.phase, "이 테스트가 노리는 창이 아니다").toBe("playing");
      expect(room.controller, "이 테스트가 노리는 창이 아니다").not.toBeNull();
      expect(room.writer, "이 테스트가 노리는 창이 아니다").not.toBeNull();
      // 그리고 이어하기 행은 이미 지워져 있어야 한다.
      expect(db.listLiveGames().map((r) => r.code)).not.toContain(code);

      // ── 회귀의 핵심: 이 창에서 청소가 돌아도 행이 되살아나면 안 된다.
      for (let i = 0; i < 3; i++) manager.sweepIdleRooms();
      expect(
        db.listLiveGames().map((r) => r.code),
        "끝난 판이 live_games 에 되살아났다 — 재시작하면 다시 서고 전적이 두 번 기록된다",
      ).not.toContain(code);

      // 정산을 놓아 주고 방이 대기실로 돌아가는 것까지 본다.
      releaseStats();
      for (let i = 0; i < 400 && room.phase === "playing"; i++) {
        await new Promise((r) => setTimeout(r, 5));
      }
      expect(room.phase, "정산이 끝나도 방이 대기실로 돌아오지 않았다").toBe("waiting");
      // 대기실로 돌아온 뒤에도 마찬가지다 (청소는 계속 돈다).
      manager.sweepIdleRooms();
      expect(db.listLiveGames().map((r) => r.code)).not.toContain(code);
      // `games` 에는 이 판이 정확히 한 행이다.
      expect(db.listAllGames().filter((g) => g.code === code)).toHaveLength(1);
    },
    GAME_MS + 60_000,
  );

  it("표식을 내리면 다음 판은 다시 이어하기 후보가 된다", async () => {
    /*
     * `finished` 는 «정리 중»을 가리키는 한시적 표식이다. 내려 주지 않으면 그 방에서
     * 시작하는 **다음 판**이 통째로 이어하기 후보에서 빠진다 — 되살아나는 것보다
     * 조용한 손실이라 여기서 함께 못 박는다.
     */
    const replayDir = await mkdtemp(join(tmpdir(), "majak-resurrect2-"));
    dirs.push(replayDir);
    const store = new StatsStore(join(replayDir, "stats.json"));
    await store.load();
    const db = new SiteDb(":memory:");
    dbs.push(db);
    const manager = new RoomManager(replayDir, store, 0, db);
    managers.push(manager);

    const sock = new FakeSocket();
    sock.autoRespond = false;
    manager.handleConnection(sock.asWs());
    sock.clientSend({ type: "register", username: "Resu2", password: "pw123456" });
    await sock.waitFor((m) => m.type === "authOk", 20_000);
    sock.clientSend({ type: "createRoom" });
    await sock.waitFor((m) => m.type === "roomCreated", 20_000);
    const code = (sock.sent.find((m) => m.type === "roomCreated") as any).code as string;
    sock.clientSend({ type: "setGameMode", mode: "tonpuu" });
    for (let i = 0; i < 3; i++) sock.clientSend({ type: "addBot" });
    sock.clientSend({ type: "startGame" });
    await sock.waitFor((m) => m.type === "view", 20_000);

    const room = (manager as any).rooms.get(code);
    expect(room.finished).toBe(false);
    expect(db.listLiveGames().map((r) => r.code)).toContain(code);
  }, 60_000);
});
