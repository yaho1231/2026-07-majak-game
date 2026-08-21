/** QA(auth) 공용 하네스 — FakeSocket + RoomManager + 임시 SiteDb. 운영 DB/서버와 무관. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WebSocket } from "ws";
import { RoomManager } from "../../../packages/server/src/RoomManager.js";
import { SiteDb } from "../../../packages/server/src/SiteDb.js";

export class FakeSocket {
  readyState = 1;
  sent: any[] = [];
  closed = false;
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
  close(): void { this.closed = true; this.readyState = 3; this.emit("close"); }
  clientSend(msg: unknown): void { this.emit("message", Buffer.from(JSON.stringify(msg))); }
  last(type: string): any { return [...this.sent].reverse().find((m) => m.type === type); }
  all(type: string): any[] { return this.sent.filter((m) => m.type === type); }
  clear(): void { this.sent = []; }
  waitFor(pred: (m: any) => boolean, timeoutMs = 20_000): Promise<void> {
    if (this.sent.some(pred)) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("waitFor timeout")), timeoutMs);
      this.waiters.push({ pred, resolve, timer });
    });
  }
  private respond(msg: any): void {
    if (msg.type === "prompt") {
      const opts = msg.prompt.options as any[];
      const pick = opts.find((o) => o.type === "pass") ?? opts.find((o) => o.type === "discard") ?? opts[0];
      setTimeout(() => this.clientSend({ type: "action", actionType: pick.type, payload: pick.payload, seat: msg.prompt.player }), 0);
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

export function newHarness(opts: { signupCode?: string; dbPath?: string; sessionTtlMs?: number; adminCode?: string } = {}) {
  const replayDir = mkdtempSync(join(tmpdir(), "majak-qa-auth-"));
  dirs.push(replayDir);
  const db = new SiteDb(opts.dbPath ?? ":memory:", opts.sessionTtlMs, opts.adminCode ?? "");
  dbs.push(db);
  const rm = new RoomManager(replayDir, undefined, 0, db, opts.signupCode ?? "");
  managers.push(rm);
  return { rm, db, replayDir };
}

export function conn(rm: RoomManager, ip = "local", exempt?: boolean): FakeSocket {
  const s = new FakeSocket();
  rm.handleConnection(s.asWs(), ip, exempt);
  return s;
}

export async function speak(rm: RoomManager, msg: unknown, ip = "local", exempt?: boolean): Promise<FakeSocket> {
  const s = conn(rm, ip, exempt);
  s.clientSend(msg);
  await s.waitFor((m) => m.type === "authOk" || m.type === "error");
  return s;
}

export function cleanup(): void {
  for (const m of managers.splice(0)) { m.shutdown("QA 정리"); m.stop(); }
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  for (const db of dbs.splice(0)) db.close();
}

export function tick(ms = 0): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }
