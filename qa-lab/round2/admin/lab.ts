/**
 * QA round2 — 관리자 도메인 공용 하네스.
 * 실제 RoomManager를 in-process로 띄우고 FakeSocket으로 WS 프레임을 주고받는다.
 * (운영 DB/포트를 절대 건드리지 않는다: SiteDb(":memory:") + mkdtemp 리플레이 디렉터리)
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WebSocket } from "ws";
import { RoomManager } from "../../../packages/server/src/RoomManager.js";
import { StatsStore } from "../../../packages/server/src/StatsStore.js";
import { SiteDb } from "../../../packages/server/src/SiteDb.js";

export class FakeSocket {
  readyState = 1;
  sent: any[] = [];
  autoRespond = false;
  skipSeats = new Set<string>();
  /** true면 roundOver에 roundContinue를 보내지 않는다 (국 사이에 판을 세워 둔다) */
  holdRoundOver = false;
  /** true면 draftOffer에 응답하지 않는다 */
  holdDraft = false;
  label = "";
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
  waitFor(pred: (m: any) => boolean, timeoutMs = 10_000): Promise<void> {
    if (this.sent.some(pred)) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`waitFor timeout (${this.label})`)),
        timeoutMs,
      );
      this.waiters.push({ pred, resolve, timer });
    });
  }
  private respond(msg: any): void {
    if (msg.type === "prompt") {
      const opts = msg.prompt.options as any[];
      if (this.skipSeats.has(msg.prompt.player) && opts.some((o) => o.type === "discard")) return;
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
      if (this.holdDraft) return;
      const first = (msg.choices as any[])[0];
      if (first !== undefined) {
        setTimeout(
          () => this.clientSend({ type: "draftPick", stage: msg.stage, augmentId: first.id }),
          0,
        );
      }
    } else if (msg.type === "roundOver") {
      if (this.holdRoundOver) return;
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

export interface Harness {
  rm: RoomManager;
  db: SiteDb;
  store: StatsStore;
  replayDir: string;
}

const dirs: string[] = [];
const dbs: SiteDb[] = [];

export async function newHarness(opts: { adminCode?: string } = {}): Promise<Harness> {
  const replayDir = await mkdtemp(join(tmpdir(), "qa-admin-"));
  dirs.push(replayDir);
  const store = new StatsStore(join(replayDir, "stats.json"));
  await store.load();
  const db = new SiteDb(":memory:", undefined, opts.adminCode ?? "");
  dbs.push(db);
  return { rm: new RoomManager(replayDir, store, 0, db), db, store, replayDir };
}

export async function cleanup(): Promise<void> {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  for (const db of dbs.splice(0)) db.close();
}

export async function connectAs(
  h: Harness,
  username: string,
  opts: { admin?: boolean; autoRespond?: boolean } = {},
): Promise<FakeSocket> {
  const sock = new FakeSocket();
  sock.label = username;
  sock.autoRespond = opts.autoRespond ?? false;
  h.rm.handleConnection(sock.asWs());
  sock.clientSend({
    type: "register",
    username,
    password: "pw123456",
    ...(opts.admin === true ? { adminCode: h.db.adminCode() } : {}),
  });
  await sock.waitFor((m) => m.type === "authOk" || m.type === "error");
  if (sock.last("authOk") === undefined) throw new Error(`register failed: ${username}`);
  return sock;
}

/** 로그인하지 않은 raw 연결 */
export function connectAnon(h: Harness, label = "anon"): FakeSocket {
  const sock = new FakeSocket();
  sock.label = label;
  h.rm.handleConnection(sock.asWs());
  return sock;
}

/** 게스트(체험) 연결 — guestPlay 로 손님 신원을 얻는다 */
export async function connectGuest(h: Harness, autoRespond = false): Promise<FakeSocket> {
  const sock = connectAnon(h, "guest");
  sock.autoRespond = autoRespond;
  sock.clientSend({ type: "guestPlay", mode: "tonpuu" });
  await sock.waitFor((m) => m.type === "view" || m.type === "error");
  return sock;
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/** 두 사람이 붙은 실대국 방을 만들고 시작한다. 방 코드를 돌려준다. */
export async function startRealGame(
  h: Harness,
  host: FakeSocket,
  guestPlayer: FakeSocket,
): Promise<string> {
  host.clientSend({ type: "createRoom" });
  await host.waitFor((m) => m.type === "roomCreated");
  const code = host.last("roomCreated").code as string;
  guestPlayer.clientSend({ type: "joinRoom", code });
  await guestPlayer.waitFor((m) => m.type === "lobby");
  host.clientSend({ type: "addBot" });
  host.clientSend({ type: "addBot" });
  await host.waitFor((m) => m.type === "lobby" && m.players?.length === 4);
  host.clientSend({ type: "ready", ready: true });
  guestPlayer.clientSend({ type: "ready", ready: true });
  host.clientSend({ type: "startGame" });
  await host.waitFor((m) => m.type === "view");
  return code;
}

export const results: { ok: boolean; name: string; detail?: string }[] = [];

export function check(name: string, ok: boolean, detail = ""): void {
  results.push({ ok, name, detail });
  console.log(`${ok ? "  ok " : "FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
}

export function report(): void {
  const bad = results.filter((r) => !r.ok);
  console.log(`\n=== ${results.length - bad.length}/${results.length} pass ===`);
  for (const b of bad) console.log(`  FAIL: ${b.name} — ${b.detail}`);
}
