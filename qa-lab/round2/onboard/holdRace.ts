/**
 * `tutorialHold` 경합 계측 — 「말풍선을 띄우는 동안 판이 서 있어야 한다」가
 * 실제로 지켜지는가.
 *
 * 사람이 한 수 두면 → 서버가 새 view 를 보낸다 → 클라이언트가 그 프레임에
 * 강의를 집고 `tutorialHold{hold:true}` 를 보낸다. 그 사이(RTT + 렌더)의 지연을
 * `LAG_MS` 로 흉내 낸다. 홀드가 켜져 있는 동안 봇이 한 장이라도 버리면 대본이 샌 것이다.
 *
 *   tsx qa-lab/round2/onboard/holdRace.ts [판수] [지연ms]
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
  onMsg: ((m: any) => void) | null = null;
  private handlers: Record<string, ((...a: any[]) => void)[]> = {};
  private waiters: { pred: (m: any) => boolean; resolve: () => void; timer: any }[] = [];
  send(data: string): void {
    const msg = JSON.parse(data);
    this.sent.push(msg);
    this.onMsg?.(msg);
    this.waiters = this.waiters.filter((w) => {
      if (w.pred(msg)) { clearTimeout(w.timer); w.resolve(); return false; }
      return true;
    });
  }
  on(e: string, cb: (...a: any[]) => void): void { (this.handlers[e] ??= []).push(cb); }
  close(): void { this.readyState = 3; for (const cb of this.handlers["close"] ?? []) cb(); }
  clientSend(msg: unknown): void { for (const cb of this.handlers["message"] ?? []) cb(Buffer.from(JSON.stringify(msg))); }
  last(t: string): any { return [...this.sent].reverse().find((m) => m.type === t); }
  waitFor(pred: (m: any) => boolean, timeoutMs = 20_000): Promise<void> {
    if (this.sent.some(pred)) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("waitFor timeout")), timeoutMs);
      this.waiters.push({ pred, resolve, timer });
    });
  }
  asWs(): WebSocket { return this as unknown as WebSocket; }
}

const N = Number(process.argv[2] ?? 10);
const LAG_MS = Number(process.argv[3] ?? 60);

let totalHeldWindows = 0;
let leakedWindows = 0;
let leakedDiscards = 0;
const samples: string[] = [];

for (let run = 0; run < N; run++) {
  const dir = await mkdtemp(join(tmpdir(), "majak-holdrace-"));
  const store = new StatsStore(join(dir, "stats.json"));
  await store.load();
  const db = new SiteDb(":memory:");
  const rmgr = new RoomManager(dir, store, 0, db, "");
  const sock = new FakeSocket();

  /** 홀드가 켜져 있다고 클라이언트가 믿는 동안인가 */
  let holding = false;
  let leakedThisWindow = 0;
  let botDiscardsSeenWhileHolding = 0;

  // 봇의 버림을 센다 — view 의 강 길이 합이 늘면 누군가 버린 것이다.
  let lastRiverTotal = -1;
  const riverTotal = (v: any): number =>
    Object.entries(v?.zones ?? {}).reduce(
      (a: number, [id, z]: [string, any]) =>
        a + (id.startsWith("discards:") ? (z.tileIds?.length ?? 0) : 0), 0);

  sock.onMsg = (m: any): void => {
    if (m.type !== "view") return;
    const t = riverTotal(m.view);
    if (lastRiverTotal >= 0 && t > lastRiverTotal && holding) {
      botDiscardsSeenWhileHolding += t - lastRiverTotal;
      leakedThisWindow += t - lastRiverTotal;
    }
    lastRiverTotal = t;
  };

  try {
    rmgr.handleConnection(sock.asWs());
    sock.clientSend({ type: "guestPlay", mode: "tonpuu", tutorial: true });
    await sock.waitFor((m) => m.type === "draftOffer");
    const offer = sock.last("draftOffer");
    sock.clientSend({ type: "draftPick", stage: offer.stage, augmentId: offer.choices[0].id });
    await sock.waitFor((m) => m.type === "prompt");

    const view = (): any => sock.last("view").view;
    const promptCount = (): number => sock.sent.filter((m: any) => m.type === "prompt").length;

    // 사람 차례 6번: 매번 「한 수 두고 → LAG 뒤에 hold(true) → 3초 읽는 척 → hold(false)」
    for (let turn = 0; turn < 6; turn++) {
      const p = sock.last("prompt").prompt;
      const opt =
        p.options.find((o: any) => o.type === "discard") ??
        p.options.find((o: any) => o.type === "pass");
      if (opt === undefined) break;
      lastRiverTotal = riverTotal(view());
      sock.clientSend({ type: "action", actionType: opt.type, payload: opt.payload });

      // ── 클라이언트가 새 화면을 그리고 강의를 집기까지 걸리는 시간 ──
      await new Promise((r) => setTimeout(r, LAG_MS));
      leakedThisWindow = 0;
      holding = true;
      sock.clientSend({ type: "tutorialHold", hold: true });
      // 말풍선을 읽는 시간
      await new Promise((r) => setTimeout(r, 3000));
      totalHeldWindows++;
      if (leakedThisWindow > 0) {
        leakedWindows++;
        leakedDiscards += leakedThisWindow;
        if (samples.length < 8) samples.push(`run#${run} turn#${turn}: 홀드 중 봇 버림 ${leakedThisWindow}장`);
      }
      holding = false;
      sock.clientSend({ type: "tutorialHold", hold: false });

      const seen = promptCount();
      try { await sock.waitFor((m) => m.type === "prompt" && promptCount() > seen, 20_000); }
      catch { break; }
    }
  } catch (e) {
    samples.push(`run#${run} 예외: ${(e as Error).message}`);
  }
  void botDiscardsSeenWhileHolding;
  process.stdout.write(leakedWindows > 0 ? "X" : ".");
  sock.close();
  await (rmgr as any).shutdown?.();
  db.close?.();
  await rm(dir, { recursive: true, force: true });
}

console.log(`\n=== ${N}판 · 지연 ${LAG_MS}ms ===`);
console.log(`홀드 구간 ${totalHeldWindows}개 중 샌 구간 ${leakedWindows}개 (봇 버림 ${leakedDiscards}장)`);
for (const s of samples) console.log("  " + s);
process.exit(0);
