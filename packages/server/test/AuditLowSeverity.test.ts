/**
 * 감사 2026-08-12의 낮음 항목 회귀 테스트 — §L-4 · §L-6.
 *
 * (L-1 `/healthz` 잠금은 `TrustProxy.test.ts`의 `direct` 판정이 근거고,
 *  L-2 파일 권한·L-3 CSP·L-7 클라이언트 파싱은 여기서 다루지 않는다.)
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WebSocket } from "ws";
import { RoomManager, abuseKeyOf } from "../src/RoomManager.js";
import { SiteDb } from "../src/SiteDb.js";
import { StatsStore } from "../src/StatsStore.js";

class FakeSocket {
  readyState = 1;
  sent: any[] = [];
  private handlers: Record<string, ((...a: any[]) => void)[]> = {};
  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
  on(event: string, cb: (...a: any[]) => void): void {
    (this.handlers[event] ??= []).push(cb);
  }
  close(): void {
    this.readyState = 3;
    for (const cb of this.handlers.close ?? []) cb();
  }
  terminate(): void {
    this.close();
  }
  clientSend(msg: unknown): void {
    for (const cb of this.handlers.message ?? []) cb(Buffer.from(JSON.stringify(msg)));
  }
  last(type: string): any {
    return [...this.sent].reverse().find((m) => m.type === type);
  }
  waitFor(pred: (m: any) => boolean, timeoutMs = 5_000): Promise<any> {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const tick = (): void => {
        const hit = this.sent.find(pred);
        if (hit !== undefined) return resolve(hit);
        if (Date.now() - start > timeoutMs) return reject(new Error("waitFor timeout"));
        setTimeout(tick, 5);
      };
      tick();
    });
  }
  asWs(): WebSocket {
    return this as unknown as WebSocket;
  }
}

const dirs: string[] = [];
const dbs: SiteDb[] = [];

afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  for (const db of dbs.splice(0)) db.close();
});

// ─────────────────────────── L-4 ───────────────────────────

describe("리플레이 열거 차단 (§L-4)", () => {
  it("남의 판과 없는 판이 **같은 응답**이다 — id를 훑어도 실재 여부를 알 수 없다", async () => {
    const replayDir = await mkdtemp(join(tmpdir(), "majak-l4-"));
    dirs.push(replayDir);
    const store = new StatsStore(join(replayDir, "stats.json"));
    await store.load();
    const db = new SiteDb(":memory:");
    dbs.push(db);
    const rm2 = new RoomManager(replayDir, store, 0, db, "");

    // 갑이 참가한 판 하나를 기록한다. 을은 그 판과 무관하다.
    const gap = await db.register("갑돌이", "correct-horse-battery");
    await db.register("을순이", "correct-horse-battery");
    const path = join(replayDir, "AAAAAA_x.jsonl");
    await writeFile(path, '{"type":"TEST"}\n', "utf8");
    const gameId = db.recordGame({
      code: "AAAAAA",
      replayPath: path,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      players: [
        { userId: gap.user!.id, nickname: "갑돌이", isBot: false, rank: 1, score: 30000 },
      ],
    });

    const sock = new FakeSocket();
    rm2.handleConnection(sock.asWs(), "local", true);
    sock.clientSend({ type: "login", username: "을순이", password: "correct-horse-battery" });
    await sock.waitFor((m) => m.type === "authOk");

    // 실재하지만 남의 판
    sock.clientSend({ type: "replayGet", gameId });
    const forbidden = await sock.waitFor((m) => m.type === "error" && m.code !== undefined);
    // 아예 없는 판
    sock.sent.length = 0;
    sock.clientSend({ type: "replayGet", gameId: gameId + 12345 });
    const missing = await sock.waitFor((m) => m.type === "error");

    expect(forbidden.code).toBe("REPLAY_NOT_FOUND");
    expect(missing.code).toBe("REPLAY_NOT_FOUND");
    expect(forbidden.message).toBe(missing.message);
  });

  it("본인이 참가한 판은 그대로 열린다", async () => {
    const replayDir = await mkdtemp(join(tmpdir(), "majak-l4b-"));
    dirs.push(replayDir);
    const store = new StatsStore(join(replayDir, "stats.json"));
    await store.load();
    const db = new SiteDb(":memory:");
    dbs.push(db);
    const rm2 = new RoomManager(replayDir, store, 0, db, "");

    const gap = await db.register("갑돌이", "correct-horse-battery");
    const path = join(replayDir, "BBBBBB_x.jsonl");
    await writeFile(path, '{"type":"TEST"}\n', "utf8");
    const gameId = db.recordGame({
      code: "BBBBBB",
      replayPath: path,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      players: [
        { userId: gap.user!.id, nickname: "갑돌이", isBot: false, rank: 1, score: 30000 },
      ],
    });

    const sock = new FakeSocket();
    rm2.handleConnection(sock.asWs(), "local", true);
    sock.clientSend({ type: "login", username: "갑돌이", password: "correct-horse-battery" });
    await sock.waitFor((m) => m.type === "authOk");
    sock.clientSend({ type: "replayGet", gameId });
    const data = await sock.waitFor((m) => m.type === "replayData");
    expect(data.lines).toEqual(['{"type":"TEST"}']);
  });
});

// ─────────────────────────── L-6 ───────────────────────────

describe("abuseKeyOf — IPv4-mapped 16진 표기 (§L-6)", () => {
  it("점 표기와 16진 표기가 같은 키가 된다", () => {
    expect(abuseKeyOf("::ffff:0102:0304")).toBe("1.2.3.4");
    expect(abuseKeyOf("::ffff:1.2.3.4")).toBe("1.2.3.4");
    expect(abuseKeyOf("::ffff:0102:0304")).toBe(abuseKeyOf("::ffff:1.2.3.4"));
  });

  /**
   * 예전에는 16진 표기가 IPv6 경로로 흘러가 앞 4그룹이 전부 0인 탓에
   * **모든 IPv4 클라이언트가 한 버킷**(`0:0:0:0::/64`)으로 뭉쳤다 —
   * 서로 모르는 사용자들이 IP당 상한을 나눠 쓰며 서로를 밀어냈다.
   */
  it("서로 다른 주소는 서로 다른 키다 (한 버킷으로 뭉치지 않는다)", () => {
    const keys = ["::ffff:0102:0304", "::ffff:0a00:0001", "::ffff:c000:0201"].map(abuseKeyOf);
    expect(new Set(keys).size).toBe(3);
    expect(keys).toEqual(["1.2.3.4", "10.0.0.1", "192.0.2.1"]);
  });

  it("대문자 표기도 같게 푼다", () => {
    expect(abuseKeyOf("::FFFF:0A00:0001")).toBe("10.0.0.1");
  });

  it("진짜 IPv6는 종전대로 /64로 묶는다", () => {
    expect(abuseKeyOf("2001:db8:1:2:3:4:5:6")).toBe("2001:db8:1:2::/64");
    expect(abuseKeyOf("2001:db8:1:2::99")).toBe("2001:db8:1:2::/64");
  });
});
