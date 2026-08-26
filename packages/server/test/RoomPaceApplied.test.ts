/**
 * 대기실에서 고른 제한 시간이 **판에 실제로 걸리는가** (2026-08-27 사용자 요청:
 * "각 설정별로 실제로 잘 적용되는지도 파악해봐").
 *
 * `RoomPace.test.ts`가 `HumanAgent` 하나를 놓고 값을 확인한다면, 여기는 그 값이
 * 대기실 버튼 → 방 상태 → 판이 서는 순간 → **소켓으로 나가는 마감**까지 한 줄로
 * 이어지는지를 본다. 중간의 어느 한 칸만 안 이어져도(대표적으로 `setPace`를
 * 꽂는 것을 잊는 경우) 화면은 «왕초보»라고 적힌 채 30초짜리 판이 돈다.
 *
 * 실제 값이 아니라 **배관**을 못박는 자리라, 기대값은 `ROOM_PACES`에서 읽는다.
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WebSocket } from "ws";
import { RoomManager } from "../src/RoomManager.js";
import { StatsStore } from "../src/StatsStore.js";
import { SiteDb } from "../src/SiteDb.js";
import { ROOM_PACES, DEFAULT_ROOM_PACE, paceMaxSeatMs } from "@majak/core/network/protocol.js";
import type { RoomPace } from "@majak/core/network/protocol.js";

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
  clientSend(msg: unknown): void {
    for (const cb of this.handlers["message"] ?? []) cb(Buffer.from(JSON.stringify(msg)));
  }
  last(type: string): any {
    return [...this.sent].reverse().find((m) => m.type === type);
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

async function newHarness(): Promise<{ rm: RoomManager }> {
  const dir = await mkdtemp(join(tmpdir(), "majak-pace-"));
  dirs.push(dir);
  const store = new StatsStore(join(dir, "stats.json"));
  await store.load();
  const db = new SiteDb(":memory:");
  dbs.push(db);
  const rm = new RoomManager(dir, store, 0, db);
  managers.push(rm);
  return { rm };
}

/**
 * 방을 세워 **그 속도로 판을 시작**하고, 좌석에 실제로 나간 것을 돌려준다.
 * `pace`가 undefined면 아무것도 고르지 않은 방(= 기본값 경로)이다.
 */
async function playedWith(pace: RoomPace | undefined): Promise<{
  h: { rm: RoomManager };
  sock: FakeSocket;
  code: string;
  lobbyPace: string;
  draftDeadlineMs: number;
}> {
  const h = await newHarness();
  const sock = new FakeSocket();
  h.rm.handleConnection(sock.asWs());
  sock.clientSend({ type: "register", username: `Pace${pace ?? "default"}`, password: "pw123456" });
  await sock.waitFor((m) => m.type === "authOk" || m.type === "error");
  sock.clientSend({ type: "createRoom" });
  await sock.waitFor((m) => m.type === "roomCreated");
  const code = sock.last("roomCreated").code as string;
  if (pace !== undefined) sock.clientSend({ type: "setRoomPace", pace });
  for (let i = 0; i < 3; i++) sock.clientSend({ type: "addBot" });
  const lobbyPace = sock.last("lobby").pace as string;
  sock.clientSend({ type: "startGame" });
  await sock.waitFor((m) => m.type === "draftOffer");
  return {
    h,
    sock,
    code,
    lobbyPace,
    draftDeadlineMs: sock.last("draftOffer").deadlineMs as number,
  };
}

/** 증강을 하나 골라 배패까지 가고, 첫 결정 프롬프트의 마감을 돌려준다. */
async function firstTurnDeadline(sock: FakeSocket): Promise<number> {
  const offer = sock.last("draftOffer");
  sock.clientSend({ type: "draftPick", stage: offer.stage, augmentId: offer.choices[0].id });
  await sock.waitFor((m) => m.type === "prompt");
  return sock.last("prompt").deadlineMs as number;
}

afterEach(async () => {
  for (const m of managers.splice(0)) {
    m.shutdown("테스트 정리");
    m.stop();
  }
  await new Promise((r) => setTimeout(r, 0));
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  for (const db of dbs.splice(0)) db.close();
});

describe("대기실에서 고른 제한 시간이 판에 그대로 걸린다", () => {
  for (const pace of ["expert", "beginner", "novice"] as const) {
    it(`«${pace}» — 증강 선택 ${ROOM_PACES[pace].draftMs / 1000}초 · 타패 ${
      ROOM_PACES[pace].turnGraceMs / 1000
    } + ${ROOM_PACES[pace].turnBankMs / 1000}초가 실제로 나간다`, async () => {
      const spec = ROOM_PACES[pace];
      const { sock, lobbyPace, draftDeadlineMs } = await playedWith(pace);
      // 1) 대기실이 그 속도를 들고 있고, 그걸 화면에 알린다.
      expect(lobbyPace).toBe(pace);
      // 2) 증강 선택창의 마감 — 판의 첫 드래프트다.
      expect(draftDeadlineMs).toBe(spec.firstDraftMs);
      // 3) 첫 타패의 마감 = 유예 + 은행(국이 막 시작해 은행은 가득 차 있다).
      expect(await firstTurnDeadline(sock)).toBe(spec.turnGraceMs + spec.turnBankMs);
    }, 30_000);
  }

  it("아무것도 고르지 않은 방은 숙련자(기본)로 선다", async () => {
    const spec = ROOM_PACES[DEFAULT_ROOM_PACE];
    const { sock, lobbyPace, draftDeadlineMs } = await playedWith(undefined);
    expect(lobbyPace).toBe(DEFAULT_ROOM_PACE);
    expect(draftDeadlineMs).toBe(spec.firstDraftMs);
    expect(await firstTurnDeadline(sock)).toBe(spec.turnGraceMs + spec.turnBankMs);
  }, 30_000);

  it("모르는 값은 무시한다 — 방의 속도가 바뀌지 않는다", async () => {
    const { sock } = await playedWith(undefined);
    sock.clientSend({ type: "setRoomPace", pace: "instant" });
    expect(sock.last("lobby").pace).toBe(DEFAULT_ROOM_PACE);
  }, 30_000);

  it("느린 방은 컨트롤러의 최후 그물(90초)도 함께 늘어난다", async () => {
    // 이게 없으면 아직 생각 중인 사람의 차례를 그물이 90초에 대신 두어 버린다.
    const { h } = await playedWith("novice");
    const room = (h.rm as any).rooms.values().next().value;
    expect(room.controller.config.agentDecideTimeoutMs).toBe(paceMaxSeatMs("novice") + 60_000);
    expect(room.controller.config.agentDecideTimeoutMs).toBeGreaterThan(
      ROOM_PACES.novice.turnGraceMs + ROOM_PACES.novice.turnBankMs,
    );
  }, 30_000);

  it("끊긴 판을 되살려도 그 방의 속도가 따라온다", async () => {
    /*
     * 제한 시간은 리플레이 이벤트 로그에 없다(엔진은 제한 시간을 모른다) — 담아
     * 두지 않으면 되살아난 왕초보 판이 조용히 숙련자 속도로 서고, 앉아 있던 사람의
     * 차례가 대신 두어진다. `live_games.pace` 열이 그것을 넘긴다.
     */
    const { h, code } = await playedWith("novice");
    const db = (h.rm as any).db;
    const row = db.listLiveGames().find((r: any) => r.code === code);
    expect(row, "진행 중 대국으로 적히지 않았다").toBeDefined();
    expect(row.pace).toBe("novice");
  }, 30_000);

  it("속도가 안 담긴 옛 행(null)은 기본값으로 읽는다", async () => {
    // 열이 붙기 전에 쓰인 행 — 모르는 것을 «가장 급한 속도»로 읽으면 안 된다는
    // 뜻은 아니고(기본이 곧 숙련자다), 되살리기가 그 자리에서 죽지 않아야 한다.
    const { h } = await playedWith(undefined);
    const db = (h.rm as any).db;
    const row = db.listLiveGames()[0];
    expect(row.pace).toBe(DEFAULT_ROOM_PACE);
  }, 30_000);

  it("숙련자 방은 그물을 건드리지 않는다 — 좌석 최대가 90초보다 짧다", async () => {
    const { h } = await playedWith("expert");
    const room = (h.rm as any).rooms.values().next().value;
    expect(room.controller.config.agentDecideTimeoutMs).toBeUndefined();
    expect(paceMaxSeatMs("expert")).toBeLessThan(90_000);
  }, 30_000);
});
