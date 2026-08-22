/** lobby QA 공용 하네스 — FakeSocket + RoomManager 직접 구동 (packages/server/test 방식). */
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
  private handlers: Record<string, ((...a: any[]) => void)[]> = {};
  private waiters: { pred: (m: any) => boolean; resolve: () => void; timer: any }[] = [];

  send(data: string): void {
    const msg = JSON.parse(data);
    this.sent.push(msg);
    this.waiters = this.waiters.filter((w) => {
      if (w.pred(msg)) { clearTimeout(w.timer); w.resolve(); return false; }
      return true;
    });
    if (this.autoRespond) this.respond(msg);
  }
  on(event: string, cb: (...a: any[]) => void): void { (this.handlers[event] ??= []).push(cb); }
  close(): void { this.readyState = 3; this.emit("close"); }
  clientSend(msg: unknown): void { this.emit("message", Buffer.from(JSON.stringify(msg))); }
  last(type: string): any { return [...this.sent].reverse().find((m) => m.type === type); }
  all(type: string): any[] { return this.sent.filter((m) => m.type === type); }
  clear(): void { this.sent = []; }
  waitFor(pred: (m: any) => boolean, timeoutMs = 60_000): Promise<void> {
    if (this.sent.some(pred)) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("waitFor timeout")), timeoutMs);
      this.waiters.push({ pred, resolve, timer });
    });
  }
  private respond(msg: any): void {
    if (msg.type === "prompt") {
      const opts = msg.prompt.options as any[];
      const pick = opts.find((o) => o.type === "win") ?? opts.find((o) => o.type === "pass") ??
        opts.find((o) => o.type === "discard") ?? opts[0];
      setTimeout(() => this.clientSend({ type: "action", actionType: pick.type, payload: pick.payload }), 0);
    } else if (msg.type === "draftOffer") {
      setTimeout(() => this.clientSend({ type: "draftPick", stage: msg.stage, augmentId: msg.choices[0].id }), 0);
    } else if (msg.type === "roundOver") {
      setTimeout(() => this.clientSend({ type: "roundContinue" }), 0);
    }
  }
  private emit(event: string, ...args: any[]): void { for (const cb of this.handlers[event] ?? []) cb(...args); }
  asWs(): WebSocket { return this as unknown as WebSocket; }
}

const dirs: string[] = [];
const dbs: SiteDb[] = [];
const managers: RoomManager[] = [];

export interface H { rm: RoomManager; db: SiteDb; store: StatsStore; replayDir: string }

export async function newHarness(interRoundDelayMs = 0, signupCode = ""): Promise<H> {
  const replayDir = await mkdtemp(join(tmpdir(), "majak-lobbyqa-"));
  dirs.push(replayDir);
  const store = new StatsStore(join(replayDir, "stats.json"));
  await store.load();
  const db = new SiteDb(":memory:");
  dbs.push(db);
  const rm = new RoomManager(replayDir, store, interRoundDelayMs, db, signupCode);
  managers.push(rm);
  return { rm, db, store, replayDir };
}

export async function cleanup(): Promise<void> {
  for (const m of managers.splice(0)) { m.shutdown("QA 정리"); m.stop(); }
  await new Promise((r) => setTimeout(r, 10));
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  for (const db of dbs.splice(0)) db.close();
}

export async function reg(h: H, username: string, opts: { adminCode?: string; autoRespond?: boolean } = {}): Promise<FakeSocket> {
  const s = new FakeSocket();
  s.autoRespond = opts.autoRespond ?? false;
  h.rm.handleConnection(s.asWs());
  s.clientSend({ type: "register", username, password: "pw123456", ...(opts.adminCode !== undefined ? { adminCode: opts.adminCode } : {}) });
  await s.waitFor((m) => m.type === "authOk" || m.type === "error");
  return s;
}

export async function login(h: H, username: string, password = "pw123456"): Promise<FakeSocket> {
  const s = new FakeSocket();
  h.rm.handleConnection(s.asWs());
  s.clientSend({ type: "login", username, password });
  await s.waitFor((m) => m.type === "authOk" || m.type === "error");
  return s;
}

export const tick = (ms = 20): Promise<void> => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
export function chk(name: string, cond: boolean, extra = ""): void {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? " — " + extra : ""}`); }
}
export function summary(): void { console.log(`\n== ${pass} ok / ${fail} FAIL ==`); }
