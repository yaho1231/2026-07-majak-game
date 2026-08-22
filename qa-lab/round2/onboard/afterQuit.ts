/**
 * 「그만 보기」로 코치만 끄고 **판은 그대로 둔다**고 했을 때, 남는 판이 무엇인가.
 * 1국을 끝내고 2국의 배패를 본다 — 고정 배패가 그대로면 «배울 것도 없는 이상한 대국»이다.
 *
 *   tsx qa-lab/round2/onboard/afterQuit.ts
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WebSocket } from "ws";
import { RoomManager } from "../../../packages/server/src/RoomManager.js";
import { StatsStore } from "../../../packages/server/src/StatsStore.js";
import { SiteDb } from "../../../packages/server/src/SiteDb.js";

class FakeSocket {
  readyState = 1;
  sent: any[] = [];
  private handlers: Record<string, ((...a: any[]) => void)[]> = {};
  private waiters: { pred: (m: any) => boolean; resolve: () => void; timer: any }[] = [];
  send(data: string): void {
    const msg = JSON.parse(data);
    this.sent.push(msg);
    this.waiters = this.waiters.filter((w) => {
      if (w.pred(msg)) { clearTimeout(w.timer); w.resolve(); return false; }
      return true;
    });
  }
  on(e: string, cb: (...a: any[]) => void): void { (this.handlers[e] ??= []).push(cb); }
  close(): void { this.readyState = 3; for (const cb of this.handlers["close"] ?? []) cb(); }
  clientSend(msg: unknown): void { for (const cb of this.handlers["message"] ?? []) cb(Buffer.from(JSON.stringify(msg))); }
  last(t: string): any { return [...this.sent].reverse().find((m) => m.type === t); }
  waitFor(pred: (m: any) => boolean, timeoutMs = 40_000): Promise<void> {
    if (this.sent.some(pred)) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("waitFor timeout")), timeoutMs);
      this.waiters.push({ pred, resolve, timer });
    });
  }
  asWs(): WebSocket { return this as unknown as WebSocket; }
}

const dir = await mkdtemp(join(tmpdir(), "majak-afterquit-"));
const store = new StatsStore(join(dir, "stats.json"));
await store.load();
const db = new SiteDb(":memory:");
const rmgr = new RoomManager(dir, store, 0, db, "");
const sock = new FakeSocket();

rmgr.handleConnection(sock.asWs());
sock.clientSend({ type: "guestPlay", mode: "tonpuu", tutorial: true });
await sock.waitFor((m) => m.type === "draftOffer");
const offer = sock.last("draftOffer");
sock.clientSend({ type: "draftPick", stage: offer.stage, augmentId: offer.choices[0].id });
await sock.waitFor((m) => m.type === "prompt");

const view = (): any => sock.last("view").view;
const kindOf = (id: string): string => { const k = view().tiles[id]?.kind; return `${k.suit}${k.rank}`; };
const handOf = (): string[] => {
  const v = view();
  return (v.zones[`hand:${v.playerId}`]?.tileIds ?? []).map((id: string) => kindOf(id)).sort();
};
const promptCount = (): number => sock.sent.filter((m: any) => m.type === "prompt").length;

console.log("1국 배패:", handOf().join(" "));

const roundOf = (): string => `${view().round.prevalentWind}장 ${view().round.roundNumber}국 ${view().round.honba}본장`;
console.log("1국:", roundOf());

// 「그만 보기」 = 코치가 사라진다 = 홀드 신호가 더는 안 온다. 나머지는 평범하게 둔다.
for (let i = 0; i < 200; i++) {
  if (sock.last("roundOver") !== undefined) break;
  const p = sock.last("prompt")?.prompt;
  if (p === undefined) break;
  const opt =
    p.options.find((o: any) => o.type === "win") ??
    p.options.find((o: any) => o.type === "pass") ??
    p.options.find((o: any) => o.type === "discard");
  if (opt === undefined) break;
  sock.clientSend({ type: "action", actionType: opt.type, payload: opt.payload });
  const seen = promptCount();
  try {
    await Promise.race([
      sock.waitFor((m) => m.type === "prompt" && promptCount() > seen, 25_000),
      sock.waitFor((m) => m.type === "roundOver", 25_000),
    ]);
  } catch { break; }
}
const over = sock.last("roundOver");
console.log("1국 결과:", over?.outcome ?? "(안 끝남)");

sock.clientSend({ type: "roundContinue" });
const before = promptCount();
await sock.waitFor((m) => m.type === "prompt" && promptCount() > before, 40_000);
console.log("2국:", roundOf());
console.log("2국 배패:", handOf().join(" "));
console.log("봇 제약(noWin/noRiichi)은 게임 단위로 걸려 있다 — 국이 바뀌어도 그대로다.");

sock.close();
await (rmgr as any).shutdown?.();
db.close?.();
await rm(dir, { recursive: true, force: true });
process.exit(0);
