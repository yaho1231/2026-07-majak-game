/**
 * 안정성 §H 회귀 가드 — 감사 2026-08-17 §2-5·§2-6.
 *
 * 두 항목의 공통점: **없어도 화면이 멀쩡해 보인다.** 손님이 끊기면 방을 지우는
 * 동작도, 크래시한 판의 기록을 지우는 동작도 아무 오류를 내지 않았다. 그래서
 * 못을 박는다.
 *
 * - §2-5 게스트 체험 판이 끊기는 즉시 소멸했다. 손님에게는 세션 토큰이 없어
 *   재접속 수단이 **구조적으로 0**이었고, 모바일 앱 전환 한 번이면 첫인상이
 *   증발했다. 이제 판을 세워 두고 `guestResume` 토큰으로 돌아온다.
 * - §2-6 크래시 판만 골라 리플레이를 지웠다. 고아 파일 방지가 의도였는데
 *   결과적으로 **재현 증거를 없앴다.** 이제 `replays/crashed/`로 옮겨 남긴다.
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, readdir, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WebSocket } from "ws";
import { RoomManager } from "../src/RoomManager.js";
import { StatsStore } from "../src/StatsStore.js";
import { SiteDb } from "../src/SiteDb.js";
import { ReplayWriter, CRASHED_REPLAY_DIR } from "../src/ReplayWriter.js";
import { pruneOrphanReplays } from "../src/pruneReplays.js";
import { DISCONNECT_GRACE_MS } from "../src/HumanAgent.js";

// ─────────────────────────── 하네스 (Guest.test.ts와 같은 방식) ───────────────────────────

const WAIT_MS = 90_000;

class FakeSocket {
  readyState = 1; // OPEN
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

const dirs: string[] = [];
const dbs: SiteDb[] = [];
const managers: RoomManager[] = [];

async function newHarness(): Promise<{ rm: RoomManager; replayDir: string }> {
  const replayDir = await mkdtemp(join(tmpdir(), "majak-h-"));
  dirs.push(replayDir);
  const store = new StatsStore(join(replayDir, "stats.json"));
  await store.load();
  const db = new SiteDb(":memory:");
  dbs.push(db);
  const rm = new RoomManager(replayDir, store, 0, db, "");
  managers.push(rm);
  return { rm, replayDir };
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

// ─────────────────────────── §2-5 ───────────────────────────

describe("게스트 체험 — 끊겨도 판이 남는다 (§2-5)", () => {
  it("authOk가 그 판으로 돌아올 열쇠를 함께 준다", async () => {
    const h = await newHarness();
    const sock = new FakeSocket();
    h.rm.handleConnection(sock.asWs());
    sock.clientSend({ type: "guestPlay", mode: "tonpuu" });
    await sock.waitFor((m) => m.type === "view");

    const ok = sock.last("authOk");
    expect(ok.guest).toBe(true);
    expect(ok.sessionToken).toBe(""); // 계정 세션은 여전히 없다
    expect(typeof ok.guestToken).toBe("string");
    expect(ok.guestToken.length).toBeGreaterThanOrEqual(16);
  });

  it("계정 로그인에는 체험 열쇠가 붙지 않는다 (두 수명이 섞이지 않는다)", async () => {
    const h = await newHarness();
    const sock = new FakeSocket();
    h.rm.handleConnection(sock.asWs());
    sock.clientSend({ type: "register", username: "resumer", password: "pw123456" });
    await sock.waitFor((m) => m.type === "authOk" || m.type === "error");

    const ok = sock.last("authOk");
    expect(ok.sessionToken.length).toBeGreaterThan(0);
    expect(ok.guestToken).toBeUndefined();
  });

  it("소켓이 닫혀도 방은 살아 있다 (예전에는 그 자리에서 삭제됐다)", async () => {
    const h = await newHarness();
    const sock = new FakeSocket();
    h.rm.handleConnection(sock.asWs());
    sock.clientSend({ type: "guestPlay", mode: "tonpuu" });
    await sock.waitFor((m) => m.type === "view");
    expect(h.rm.healthSnapshot().rooms).toBe(1);

    sock.close();
    await new Promise((r) => setTimeout(r, 50));
    expect(h.rm.healthSnapshot().rooms).toBe(1);
    expect(h.rm.healthSnapshot().playing).toBe(1);
  });

  it("끊긴 유예(5초)를 한참 넘겨 돌아와도 그 판이 그대로 기다리고 있다", async () => {
    const h = await newHarness();
    const sock = new FakeSocket();
    h.rm.handleConnection(sock.asWs());
    sock.clientSend({ type: "guestPlay", mode: "tonpuu" });
    // 손님 차례의 선택창이 실제로 떠 있는 상태에서 끊는다 — 여기가 가장 아픈 자리다.
    await sock.waitFor((m) => m.type === "prompt" || m.type === "draftOffer");
    const token = sock.last("authOk").guestToken as string;
    const name = sock.last("authOk").username as string;

    sock.close();
    // 유예(5초)보다 확실히 길게 비운다. 예전 동작이라면 이 사이에 그 선택은
    // 안전 폴백으로 흘러갔고, 그 전에 방 자체가 이미 없었다.
    await new Promise((r) => setTimeout(r, DISCONNECT_GRACE_MS + 1_500));
    expect(h.rm.healthSnapshot().rooms).toBe(1);

    const back = new FakeSocket();
    h.rm.handleConnection(back.asWs());
    back.clientSend({ type: "guestResume", token });
    await back.waitFor((m) => m.type === "view");

    expect(back.last("authOk").username).toBe(name); // 같은 손님으로 되돌아왔다
    expect(back.last("authOk").guest).toBe(true);
    expect(back.last("joined")).toBeDefined();
    // 세워 뒀던 선택이 그대로 복원된다 — 판이 대신 진행되지 않았다는 뜻이다.
    expect(back.last("prompt") ?? back.last("draftOffer")).toBeDefined();
  }, 30_000);

  it("모르는 열쇠는 한 문구로 거절한다 (있다·없다를 알려 주지 않는다)", async () => {
    const h = await newHarness();
    const live = new FakeSocket();
    h.rm.handleConnection(live.asWs());
    live.clientSend({ type: "guestPlay", mode: "tonpuu" });
    await live.waitFor((m) => m.type === "view");

    const bad = new FakeSocket();
    h.rm.handleConnection(bad.asWs());
    bad.clientSend({ type: "guestResume", token: "00000000000000000000000000000000" });
    await bad.waitFor((m) => m.type === "error");
    expect(bad.last("error").code).toBe("GUEST_SESSION_GONE");

    const empty = new FakeSocket();
    h.rm.handleConnection(empty.asWs());
    empty.clientSend({ type: "guestResume", token: "" });
    await empty.waitFor((m) => m.type === "error");
    expect(empty.last("error").code).toBe("GUEST_SESSION_GONE");
  });

  it("남의 열쇠로는 남의 판에 못 들어간다 — 열쇠는 방 하나만 연다", async () => {
    const h = await newHarness();
    const a = new FakeSocket();
    h.rm.handleConnection(a.asWs(), "10.0.0.1", false);
    a.clientSend({ type: "guestPlay", mode: "tonpuu" });
    await a.waitFor((m) => m.type === "view");
    const tokenA = a.last("authOk").guestToken as string;

    const b = new FakeSocket();
    h.rm.handleConnection(b.asWs(), "10.0.0.2", false);
    b.clientSend({ type: "guestPlay", mode: "tonpuu" });
    await b.waitFor((m) => m.type === "view");
    const nameB = b.last("authOk").username as string;

    // A의 열쇠로 붙으면 A의 좌석이 나온다 — B의 신원은 어떤 경로로도 나오지 않는다.
    a.close();
    const back = new FakeSocket();
    h.rm.handleConnection(back.asWs(), "10.0.0.1", false);
    back.clientSend({ type: "guestResume", token: tokenA });
    await back.waitFor((m) => m.type === "view" || m.type === "error");
    expect(back.last("authOk").username).not.toBe(nameB);
  }, 30_000);
});

// ─────────────────────────── §2-6 ───────────────────────────

describe("크래시한 판의 기록은 지우지 않는다 (§2-6)", () => {
  it("preserveCrashed가 파일을 crashed/로 옮긴다", async () => {
    const dir = await mkdtemp(join(tmpdir(), "majak-crash-"));
    dirs.push(dir);
    const w = new ReplayWriter(dir, "ABCDEF");
    await w.open();
    w.write(JSON.stringify({ type: "__init__" }));
    w.write(JSON.stringify({ type: "draw" }));

    const dest = await w.preserveCrashed();

    expect(dest).toContain(CRASHED_REPLAY_DIR);
    expect((await stat(dest)).size).toBeGreaterThan(0); // 내용이 실제로 살아 있다
    // 본체에는 남지 않는다 — 옮긴 것이지 복사한 것이 아니다.
    expect((await readdir(dir)).filter((f) => f.endsWith(".jsonl"))).toHaveLength(0);
    expect(await readdir(join(dir, CRASHED_REPLAY_DIR))).toHaveLength(1);
  });

  it("고아 청소가 crashed/ 안으로 들어가지 않는다", async () => {
    const dir = await mkdtemp(join(tmpdir(), "majak-crash-"));
    dirs.push(dir);
    const w = new ReplayWriter(dir, "GHIJKL");
    await w.open();
    w.write("{}");
    const dest = await w.preserveCrashed();
    // 본체에 진짜 고아 하나를 둔다 — 청소가 일하고는 있다는 대조군.
    const orphan = join(dir, "ORPHAN_x.jsonl");
    await writeFile(orphan, "{}\n");

    const res = await pruneOrphanReplays(dir, [], Date.now() + 60_000);

    expect(res.paths.some((p) => p.endsWith("ORPHAN_x.jsonl"))).toBe(true);
    expect(res.paths.some((p) => p.includes(CRASHED_REPLAY_DIR))).toBe(false);
    expect((await stat(dest)).isFile()).toBe(true); // 크래시 기록은 그대로 있다
  });

  it("discard는 여전히 지운다 — 무효 처리는 결함이 아니다", async () => {
    const dir = await mkdtemp(join(tmpdir(), "majak-crash-"));
    dirs.push(dir);
    const w = new ReplayWriter(dir, "MNOPQR");
    await w.open();
    w.write("{}");
    await w.discard();
    expect((await readdir(dir)).filter((f) => f.endsWith(".jsonl"))).toHaveLength(0);
    await expect(readdir(join(dir, CRASHED_REPLAY_DIR))).rejects.toThrow();
  });
});
