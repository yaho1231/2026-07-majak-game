/**
 * 증강 파워 티어표 (adminAugmentTiers) 통합 테스트.
 *
 * 검증: 관리자 게이트 · **살아 있는 카탈로그와의 실시간 조인**(미분류가 드러나는가) ·
 *       티어 순 정렬 · 축 점수/가중치 동봉.
 *
 * Sandbox.test.ts와 같은 FakeSocket 방식(실제 네트워크·파일 없음).
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
  AUGMENT_POWER_TIERS,
  POWER_TIER_ORDER,
  POWER_TIER_WEIGHT,
  powerScore,
} from "@majak/core/augment/powerTier.js";

class FakeSocket {
  readyState = 1; // OPEN
  sent: any[] = [];
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

  waitFor(pred: (m: any) => boolean, timeoutMs = 10_000): Promise<void> {
    if (this.sent.some(pred)) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("waitFor timeout")), timeoutMs);
      this.waiters.push({ pred, resolve, timer });
    });
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
}

async function newHarness(): Promise<Harness> {
  const dir = await mkdtemp(join(tmpdir(), "majak-tier-"));
  dirs.push(dir);
  const store = new StatsStore(join(dir, "stats.json"));
  await store.load();
  const db = new SiteDb(":memory:");
  dbs.push(db);
  return { rm: new RoomManager(dir, store, 0, db), db };
}

async function connectAs(
  h: Harness,
  username: string,
  admin: boolean,
): Promise<FakeSocket> {
  const sock = new FakeSocket();
  h.rm.handleConnection(sock.asWs());
  sock.clientSend({
    type: "register",
    username,
    password: "pw123456",
    ...(admin ? { adminCode: h.db.adminCode() } : {}),
  });
  await sock.waitFor((m) => m.type === "authOk" || m.type === "error");
  return sock;
}

afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  for (const db of dbs.splice(0)) db.close();
});

describe("증강 파워 티어표 — 접근 권한", () => {
  it("비관리자는 FORBIDDEN", async () => {
    const h = await newHarness();
    const user = await connectAs(h, "Nobody", false);
    user.clientSend({ type: "adminAugmentTiers" });
    await user.waitFor((m) => m.type === "error");
    expect(user.last("error").code).toBe("FORBIDDEN");
    expect(user.last("adminAugmentTiers")).toBeUndefined();
  });

  it("관리자는 티어표를 받는다", async () => {
    const h = await newHarness();
    const admin = await connectAs(h, "Boss", true);
    admin.clientSend({ type: "adminAugmentTiers" });
    await admin.waitFor((m) => m.type === "adminAugmentTiers");
    const msg = admin.last("adminAugmentTiers");
    expect(msg.order).toEqual([...POWER_TIER_ORDER]);
    expect(msg.weights).toEqual({ ...POWER_TIER_WEIGHT });
    expect(Object.keys(msg.labels).length).toBe(POWER_TIER_ORDER.length);
  });
});

describe("증강 파워 티어표 — 카탈로그와 실시간 조인", () => {
  it("카탈로그 전량이 나오고, 미분류(tier: null)가 없다", async () => {
    const h = await newHarness();
    const admin = await connectAs(h, "Boss", true);
    admin.clientSend({ type: "adminAugmentTiers" });
    await admin.waitFor((m) => m.type === "adminAugmentTiers");
    const entries = admin.last("adminAugmentTiers").entries as any[];

    // 티어표는 카탈로그를 기준으로 만들어진다 — 개수가 곧 카탈로그 크기
    expect(entries.length).toBeGreaterThan(100);
    // 지금은 전 증강이 등재돼 있어야 한다 (하나라도 빠지면 여기서 잡힌다)
    const unclassified = entries.filter((e) => e.tier === null).map((e) => e.id);
    expect(unclassified).toEqual([]);
    // 반대로 티어표에만 있고 카탈로그에 없는 id는 애초에 전송되지 않는다
    const ids = new Set(entries.map((e) => e.id));
    for (const id of Object.keys(AUGMENT_POWER_TIERS)) {
      expect(ids.has(id), `${id}가 카탈로그에 없다`).toBe(true);
    }
  });

  it("티어 순 → 총점 내림차순으로 정렬되고, 축 점수·총점·가중치가 실려 온다", async () => {
    const h = await newHarness();
    const admin = await connectAs(h, "Boss", true);
    admin.clientSend({ type: "adminAugmentTiers" });
    await admin.waitFor((m) => m.type === "adminAugmentTiers");
    const entries = admin.last("adminAugmentTiers").entries as any[];

    const rank = (t: string | null): number =>
      t === null ? POWER_TIER_ORDER.length : POWER_TIER_ORDER.indexOf(t as never);
    for (let i = 1; i < entries.length; i++) {
      const a = entries[i - 1];
      const b = entries[i];
      expect(rank(a.tier)).toBeLessThanOrEqual(rank(b.tier));
      if (a.tier === b.tier) expect(a.score).toBeGreaterThanOrEqual(b.score);
    }

    // 첫 줄은 최상위 티어여야 한다
    expect(entries[0].tier).toBe(POWER_TIER_ORDER[0]);

    // 각 행의 총점·가중치가 powerTier.ts와 일치한다
    for (const e of entries) {
      const src = AUGMENT_POWER_TIERS[e.id];
      expect(src).toBeDefined();
      expect(e.score).toBe(powerScore(src!));
      expect(e.weight).toBe(POWER_TIER_WEIGHT[src!.tier]);
      expect(e.note.length).toBeGreaterThan(0);
      expect(e.name.length).toBeGreaterThan(0);
    }
  });
});
