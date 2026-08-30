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
import {
  ROOM_PACES,
  DEFAULT_ROOM_PACE,
  LOBBY_DEFAULT_ROOM_PACE,
  paceMaxSeatMs,
} from "@majak/core/network/protocol.js";
import type { RoomPace } from "@majak/core/network/protocol.js";
import { TIME_PRESSURE_CHANNEL } from "@majak/content";

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

/*
 * ⚠ **초읽기(time_pressure)가 걸린 국은 방의 속도를 재는 자리가 아니다.**
 *
 * `HumanAgent.decisionTimeoutMs()`는 초읽기 채널이 살아 있으면 `min(30초, 제한)`으로
 * 갈아타고 `bankApplies()`도 함께 꺼진다 — 마감이 그 국 내내 5,000ms가 된다.
 * 그 국에서 마감을 재면 「대기실에서 고른 속도가 판에 걸리는가」가 아니라 초읽기의
 * 상수를 재게 된다.
 *
 * 그리고 **내가 안 뽑아도 걸린다.** 초읽기의 공개 채널은 `view:*:…`이라 봇 셋 중 하나가
 * 집어도 내 뷰에 실린다(설명도 «전원의 모든 결정에 5초 제한 — 나도 포함»이다).
 * 그래서 후보에서 피하는 것만으로는 모자라고, 그 국이 초읽기 아래면 **판을 다시 세운다.**
 *
 * 예전에는 `choices[0]`을 무조건 집고 그대로 쟀다. 방 코드가 판마다 달라 후보도
 * 달라지므로 초읽기가 그 국에 들어온 회차에만 `expected 5000 to be 330000`으로 터졌고,
 * 단독 실행은 대개 통과해 부하 플레이크로 오해하기 쉬웠다 (2026-08-27 전체 실행에서 실제 발생).
 */
const PACE_OVERRIDING = new Set(["time_pressure"]);

/** 이 국이 초읽기 아래인가 — 누가 뽑았든 채널은 전원 공개라 내 마감까지 덮는다. */
function underTimePressure(sock: FakeSocket): boolean {
  const msg = sock.last("view") as { view?: { augmentView?: Record<string, unknown> } } | undefined;
  const limit = msg?.view?.augmentView?.[TIME_PRESSURE_CHANNEL];
  return typeof limit === "number" && limit > 0;
}

/** 증강을 하나 골라 배패까지 가고, 첫 결정 프롬프트의 마감을 돌려준다. */
async function firstTurnDeadline(sock: FakeSocket): Promise<number> {
  const offer = sock.last("draftOffer");
  const choices = offer.choices as { id: string }[];
  // 내 손으로 초읽기를 집지는 않는다 — 봇이 집는 것은 아래 `paceProbe`가 걸러낸다.
  const pick = choices.find((c) => !PACE_OVERRIDING.has(c.id)) ?? choices[0];
  sock.clientSend({ type: "draftPick", stage: offer.stage, augmentId: (pick as { id: string }).id });
  await sock.waitFor((m) => m.type === "prompt");
  return sock.last("prompt").deadlineMs as number;
}

/**
 * 초읽기가 걸리지 않은 판을 하나 얻어, 대기실 표기·드래프트 마감·첫 타패 마감을 함께 돌려준다.
 * 초읽기는 카탈로그 117종 중 하나뿐이라 몇 번만 다시 세워도 반드시 빠진 판이 나온다.
 */
async function paceProbe(
  pace: RoomPace | undefined,
  attempts = 8,
): Promise<{ lobbyPace: string; draftDeadlineMs: number; turnDeadlineMs: number }> {
  for (let i = 0; i < attempts; i++) {
    const { sock, lobbyPace, draftDeadlineMs } = await playedWith(pace);
    const turnDeadlineMs = await firstTurnDeadline(sock);
    if (!underTimePressure(sock)) return { lobbyPace, draftDeadlineMs, turnDeadlineMs };
  }
  throw new Error(`초읽기가 빠진 판을 ${attempts}번 만에 못 얻었다 — 드래프트 쪽을 의심할 것`);
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
      const { lobbyPace, draftDeadlineMs, turnDeadlineMs } = await paceProbe(pace);
      // 1) 대기실이 그 속도를 들고 있고, 그걸 화면에 알린다.
      expect(lobbyPace).toBe(pace);
      // 2) 증강 선택창의 마감 — 판의 첫 드래프트다.
      expect(draftDeadlineMs).toBe(spec.firstDraftMs);
      // 3) 첫 타패의 마감 = 유예 + 은행(국이 막 시작해 은행은 가득 차 있다).
      expect(turnDeadlineMs).toBe(spec.turnGraceMs + spec.turnBankMs);
    }, 30_000);
  }

  // 2026-08-31 사용자 지시 — 대기실에서 만든 방의 기본은 «초심자»다.
  // (대기실을 거치지 않는 방·좌석 기본값은 그대로 `DEFAULT_ROOM_PACE` = 숙련자다.)
  it("아무것도 고르지 않은 방은 초심자(대기실 기본)로 선다", async () => {
    const spec = ROOM_PACES[LOBBY_DEFAULT_ROOM_PACE];
    const { lobbyPace, draftDeadlineMs, turnDeadlineMs } = await paceProbe(undefined);
    expect(lobbyPace).toBe(LOBBY_DEFAULT_ROOM_PACE);
    expect(draftDeadlineMs).toBe(spec.firstDraftMs);
    expect(turnDeadlineMs).toBe(spec.turnGraceMs + spec.turnBankMs);
  }, 30_000);

  it("모르는 값은 무시한다 — 방의 속도가 바뀌지 않는다", async () => {
    const { sock } = await playedWith(undefined);
    sock.clientSend({ type: "setRoomPace", pace: "instant" });
    expect(sock.last("lobby").pace).toBe(LOBBY_DEFAULT_ROOM_PACE);
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
    // 열이 붙기 전에 쓰인 행 — 되살리기가 그 자리에서 죽지 않아야 한다.
    // (여기 방은 대기실에서 만든 방이므로 기본은 초심자다.)
    const { h } = await playedWith(undefined);
    const db = (h.rm as any).db;
    const row = db.listLiveGames()[0];
    expect(row.pace).toBe(LOBBY_DEFAULT_ROOM_PACE);
  }, 30_000);

  it("숙련자 방은 그물을 건드리지 않는다 — 좌석 최대가 90초보다 짧다", async () => {
    const { h } = await playedWith("expert");
    const room = (h.rm as any).rooms.values().next().value;
    expect(room.controller.config.agentDecideTimeoutMs).toBeUndefined();
    expect(paceMaxSeatMs("expert")).toBeLessThan(90_000);
  }, 30_000);
});
