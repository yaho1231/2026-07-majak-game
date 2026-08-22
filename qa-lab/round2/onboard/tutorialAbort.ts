/**
 * 튜토리얼 방의 **첫 국이 어떻게 끝나는가** — 대본이 살아 있는가.
 * 사람은 대본대로 두고(9삭 → 연금술 → 리치 → 론), 국이 끝나는 방식만 센다.
 * 도중유국(abort)·유국(draw)이 섞이면 대본이 통째로 날아간 판이다.
 *
 *   tsx qa-lab/round2/onboard/tutorialAbort.ts [판수]
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
  waitFor(pred: (m: any) => boolean, timeoutMs = 30_000): Promise<void> {
    if (this.sent.some(pred)) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("waitFor timeout")), timeoutMs);
      this.waiters.push({ pred, resolve, timer });
    });
  }
  asWs(): WebSocket { return this as unknown as WebSocket; }
}

const N = Number(process.argv[2] ?? 30);
const tally: Record<string, number> = {};

for (let run = 0; run < N; run++) {
  const dir = await mkdtemp(join(tmpdir(), "majak-tabort-"));
  const store = new StatsStore(join(dir, "stats.json"));
  await store.load();
  const db = new SiteDb(":memory:");
  const rmgr = new RoomManager(dir, store, 0, db, "");
  const sock = new FakeSocket();
  let key = "?";
  try {
    rmgr.handleConnection(sock.asWs());
    sock.clientSend({ type: "guestPlay", mode: "tonpuu", tutorial: true });
    await sock.waitFor((m) => m.type === "draftOffer");
    const offer = sock.last("draftOffer");
    sock.clientSend({ type: "draftPick", stage: offer.stage, augmentId: offer.choices[0].id });
    await sock.waitFor((m) => m.type === "prompt");

    const view = (): any => sock.last("view").view;
    const kindOf = (id: string): string => { const k = view().tiles[id]?.kind; return `${k.suit}${k.rank}`; };
    const promptCount = (): number => sock.sent.filter((m: any) => m.type === "prompt").length;
    const pickOne = (p: any): any =>
      p.options.find((o: any) => o.type === "win") ??
      p.options.find((o: any) => o.type === "riichi") ??
      p.options.find((o: any) => o.type === "alchemy" && kindOf(o.payload.tileId) === "sou1") ??
      p.options.find((o: any) => o.type === "discard" && kindOf(o.payload.tileId) === "sou9") ??
      p.options.find((o: any) => o.type === "discard" && o.payload.tileId === view().round.myDrawnTile) ??
      p.options.find((o: any) => o.type === "pass") ??
      p.options.find((o: any) => o.type === "discard");

    for (let i = 0; i < 120; i++) {
      if (sock.last("roundOver") !== undefined) break;
      const p = sock.last("prompt")?.prompt;
      if (p === undefined) break;
      const opt = pickOne(p);
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
    if (over === undefined) key = "국이 안 끝났다(타임아웃)";
    else if (over.outcome === "win") {
      const info = over.settle.winInfos?.[0];
      const yaku = (info?.yaku ?? []).map((y: any) => y.id);
      key = yaku.includes("riichi") ? `화료 (${info?.winType}, 리치 있음)` : `화료 (${info?.winType}, 리치 없음!)`;
    } else key = `${over.outcome}${over.abortReason !== undefined ? ` / ${over.abortReason}` : ""}`;
  } catch (e) {
    key = `예외: ${(e as Error).message}`;
  }
  tally[key] = (tally[key] ?? 0) + 1;
  process.stdout.write(key.startsWith("화료 (") && key.includes("리치 있음") ? "." : "X");
  sock.close();
  await (rmgr as any).shutdown?.();
  db.close?.();
  await rm(dir, { recursive: true, force: true });
}
console.log(`\n=== 튜토리얼 첫 국 ${N}판 ===`);
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`${String(v).padStart(3)}  ${k}`);
process.exit(0);
