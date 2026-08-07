/**
 * 봇 착석 회귀 가드 — 성격이 방에 굳지 않는가, 난이도가 실제로 닿는가.
 *
 * 배경 두 가지.
 *
 * 1. 시드가 `botSeed(code, id)`, 즉 **방 코드 + 좌석**으로만 정해져 있었다. 이어하기로
 *    같은 방에서 열 판을 둬도 상대 셋이 한 번도 안 바뀌었다.
 * 2. 좌석마다 따로 뽑아서 원형이 겹치는 것을 막지 않았다. 원형 6종에서 독립으로 3번
 *    뽑으면 둘이 겹칠 확률이 약 44%인데, 같은 원형끼리는 흔들림이 ±0.08뿐이라
 *    사실상 같은 봇 둘을 상대하게 된다.
 *
 * `bot/profile.ts`에 `rollTableProfiles`·`withDifficulty`가 있었지만 **테스트에서만
 * 쓰이고 실제 착석 경로에는 연결돼 있지 않았다.** 이 테스트가 그 연결을 지킨다.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { WebSocket } from "ws";

import { RoomManager } from "../src/RoomManager.js";
import { SiteDb } from "../src/SiteDb.js";
import { StatsStore } from "../src/StatsStore.js";
import { BotAgent } from "../src/BotAgent.js";
import { DIFFICULTY_SKILL } from "../src/bot/profile.js";

/** ServerHardening.test.ts와 같은 모양의 가짜 소켓 (이 저장소는 공유 모듈을 두지 않는다). */
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
    for (const cb of this.handlers.message ?? []) cb(Buffer.from(JSON.stringify(msg)));
  }

  last(type: string): any {
    return [...this.sent].reverse().find((m) => m.type === type);
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

const managers: RoomManager[] = [];
const dirs: string[] = [];
const dbs: SiteDb[] = [];

async function newHarness(): Promise<{ rm: RoomManager }> {
  const dir = await mkdtemp(join(tmpdir(), "majak-seat-"));
  dirs.push(dir);
  const statsDir = await mkdtemp(join(tmpdir(), "majak-seat-stats-"));
  dirs.push(statsDir);
  const store = new StatsStore(join(statsDir, "stats.json"));
  await store.load();
  const db = new SiteDb(":memory:");
  dbs.push(db);
  const rm = new RoomManager(dir, store, 0, db);
  managers.push(rm);
  return { rm };
}

async function register(rm: RoomManager, username: string): Promise<FakeSocket> {
  const sock = new FakeSocket();
  rm.handleConnection(sock.asWs());
  sock.clientSend({ type: "register", username, password: "pw123456" });
  await sock.waitFor((m) => m.type === "authOk" || m.type === "error");
  return sock;
}

/** 방 + 봇 3명. 방 코드를 돌려준다. */
async function roomWithBots(sock: FakeSocket): Promise<string> {
  sock.clientSend({ type: "createRoom" });
  await sock.waitFor((m) => m.type === "roomCreated");
  const code = sock.last("roomCreated").code as string;
  for (let i = 0; i < 3; i++) sock.clientSend({ type: "addBot" });
  return code;
}

/** 지금 그 방에 앉아 있는 봇들의 성격. RoomManager 내부를 들여다본다. */
function botProfiles(rm: RoomManager, code: string): { archetype: string; skill: number }[] {
  const room = (rm as unknown as { rooms: Map<string, { agents: unknown[] }> }).rooms.get(code);
  expect(room).toBeDefined();
  return (room?.agents ?? [])
    .filter((a): a is BotAgent => a instanceof BotAgent)
    .map((b) => {
      const p = (b as unknown as { profile: { archetype: string; skill: number } }).profile;
      return { archetype: p.archetype, skill: p.skill };
    });
}

afterEach(async () => {
  for (const m of managers.splice(0)) m.stop();
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  for (const db of dbs.splice(0)) db.close();
});

describe("봇 착석", () => {
  it("한 탁의 봇 셋은 서로 다른 원형이다", async () => {
    const h = await newHarness();
    const sock = await register(h.rm, "Seat1");
    const code = await roomWithBots(sock);

    sock.clientSend({ type: "startGame" });
    await sock.waitFor((m) => m.type === "view" || m.type === "draft");

    const kinds = botProfiles(h.rm, code).map((p) => p.archetype);
    expect(kinds).toHaveLength(3);
    expect(new Set(kinds).size).toBe(3);
  });

  it("같은 방에서 다시 시작하면 성격이 새로 뽑힌다", async () => {
    const h = await newHarness();
    const sock = await register(h.rm, "Seat2");
    const code = await roomWithBots(sock);

    // 판 번호만 올려 가며 같은 경로를 두 번 탄다 — 실제 이어하기와 같은 상황.
    const seen: string[] = [];
    for (let round = 0; round < 6; round++) {
      const room = (h.rm as unknown as {
        rooms: Map<string, { botGeneration: number; phase: string }>;
      }).rooms.get(code);
      expect(room).toBeDefined();
      if (room !== undefined) room.phase = "waiting";
      (h.rm as unknown as { rerollBotProfiles: (r: unknown) => void }).rerollBotProfiles(room);
      seen.push(botProfiles(h.rm, code).map((p) => p.archetype).join(","));
    }
    // 여섯 번 뽑아서 전부 같은 조합이면 시드가 판 번호를 안 타는 것이다.
    expect(new Set(seen).size).toBeGreaterThan(1);
  });

  it("난이도가 봇의 skill까지 실제로 닿는다", async () => {
    const h = await newHarness();
    const sock = await register(h.rm, "Seat3");
    const code = await roomWithBots(sock);

    sock.clientSend({ type: "setBotDifficulty", difficulty: "easy" });
    sock.clientSend({ type: "startGame" });
    await sock.waitFor((m) => m.type === "view" || m.type === "draft");

    for (const p of botProfiles(h.rm, code)) {
      expect(p.skill).toBe(DIFFICULTY_SKILL.easy);
    }
  });

  it("기본 난이도는 종전 봇 그대로다 (skill 1.0)", async () => {
    const h = await newHarness();
    const sock = await register(h.rm, "Seat4");
    const code = await roomWithBots(sock);

    sock.clientSend({ type: "startGame" });
    await sock.waitFor((m) => m.type === "view" || m.type === "draft");

    for (const p of botProfiles(h.rm, code)) {
      expect(p.skill).toBe(DIFFICULTY_SKILL.hard);
      expect(p.skill).toBe(1);
    }
  });

  it("모르는 난이도 값은 무시한다", async () => {
    const h = await newHarness();
    const sock = await register(h.rm, "Seat5");
    const code = await roomWithBots(sock);

    sock.clientSend({ type: "setBotDifficulty", difficulty: "impossible" });
    sock.clientSend({ type: "startGame" });
    await sock.waitFor((m) => m.type === "view" || m.type === "draft");

    for (const p of botProfiles(h.rm, code)) expect(p.skill).toBe(1);
  });
});
