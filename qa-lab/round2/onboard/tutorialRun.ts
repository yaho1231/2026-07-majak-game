/**
 * 튜토리얼 방을 실제로 N판 돌려 **대본 이탈**을 통계로 잡는다.
 * Tutorial.test.ts 의 FakeSocket 방식 그대로 (네트워크·파일 없음).
 *
 *   tsx qa-lab/round2/onboard/tutorialRun.ts [판수]
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
  private waiters: { pred: (m: any) => boolean; resolve: () => void; reject: (e: Error) => void; timer: any }[] = [];
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
  waitFor(pred: (m: any) => boolean, timeoutMs = 20_000): Promise<void> {
    if (this.sent.some(pred)) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("waitFor timeout")), timeoutMs);
      this.waiters.push({ pred, resolve, reject, timer });
    });
  }
  asWs(): WebSocket { return this as unknown as WebSocket; }
}

const N = Number(process.argv[2] ?? 20);
const results: Record<string, number> = {};
const details: string[] = [];

for (let run = 0; run < N; run++) {
  const dir = await mkdtemp(join(tmpdir(), "majak-onboard-"));
  const store = new StatsStore(join(dir, "stats.json"));
  await store.load();
  const db = new SiteDb(":memory:");
  const rmgr = new RoomManager(dir, store, 0, db, "");
  const sock = new FakeSocket();
  let verdict = "?";
  try {
    rmgr.handleConnection(sock.asWs());
    sock.clientSend({ type: "guestPlay", mode: "tonpuu", tutorial: true });
    await sock.waitFor((m) => m.type === "view" || m.type === "error");
    await sock.waitFor((m) => m.type === "draftOffer");
    const offer = sock.last("draftOffer");
    sock.clientSend({ type: "draftPick", stage: offer.stage, augmentId: offer.choices[0].id });
    await sock.waitFor((m) => m.type === "prompt");

    const promptCount = (): number => sock.sent.filter((m: any) => m.type === "prompt").length;
    const view = (): any => sock.last("view").view;
    const kindOf = (id: number): string => { const k = view().tiles[id]?.kind; return `${k.suit}${k.rank}`; };
    const send = (o: any): void => sock.clientSend({ type: "action", actionType: o.type, payload: o.payload });
    const find = (p: any, f: (o: any) => boolean): any => p.options.find(f);

    const steps = [
      { name: "9삭", pick: (o: any) => o.type === "discard" && kindOf(o.payload.tileId) === "sou9" },
      { name: "연금술", pick: (o: any) => o.type === "alchemy" && kindOf(o.payload.tileId) === "sou1" },
      { name: "리치(가져온 패)", pick: (o: any) => o.type === "riichi" && o.payload.tileId === view().round.myDrawnTile },
      { name: "리치", pick: (o: any) => o.type === "riichi" },
      { name: "론", pick: (o: any) => o.type === "win" },
    ];
    let step = 0;
    let prompt = sock.last("prompt").prompt;
    let iters = 0;
    for (let i = 0; i < 80 && step < steps.length; i++) {
      iters = i;
      const declared = view().round.byPlayer?.[view().playerId]?.riichiDeclared === true;
      if (declared && steps[step]!.name.startsWith("리치")) { step++; continue; }
      const want = find(prompt, steps[step]!.pick);
      if (want !== undefined) {
        if (steps[step]!.name.startsWith("연금술")) sock.clientSend({ type: "tutorialHold", hold: true });
        send(want);
        if (steps[step]!.name.startsWith("리치")) sock.clientSend({ type: "tutorialHold", hold: false });
        step++;
      } else {
        const other = find(prompt, (o: any) => o.type === "pass") ?? find(prompt, (o: any) => o.type === "discard");
        if (other === undefined) { verdict = `막힌 프롬프트(${prompt.options.map((o: any) => o.type).join(",")}) @${steps[step]!.name}`; break; }
        send(other);
      }
      if (step >= steps.length) break;
      const seen = promptCount();
      try { await sock.waitFor((m) => m.type === "prompt" && promptCount() > seen, 15_000); }
      catch { verdict = `프롬프트 끊김 @${steps[step]!.name} (i=${i}, roundOver=${sock.last("roundOver")?.outcome ?? "없음"})`; break; }
      prompt = sock.last("prompt").prompt;
    }
    if (verdict === "?") {
      if (step < steps.length) {
        const ro = sock.sent.filter((m: any) => m.type === "roundOver").map((m: any) => m.outcome);
        verdict = `대본 막힘 @${steps[step]!.name} (step=${step}, iters=${iters}, roundOver=[${ro.join(",")}])`;
      } else {
        await sock.waitFor((m) => m.type === "roundOver", 20_000);
        const over = sock.last("roundOver");
        const info = over.settle.winInfos?.[0];
        const yaku = (info?.yaku ?? []).map((y: any) => y.id);
        verdict = yaku.includes("riichi")
          ? `OK (${info?.winType})`
          : `리치 없이 화료 (${info?.winType}, yaku=[${yaku.join(",")}])`;
      }
    }
  } catch (e) {
    verdict = `예외: ${(e as Error).message}`;
  }
  const key = verdict.replace(/\(i=\d+/, "(i=…").replace(/iters=\d+/, "iters=…");
  results[key] = (results[key] ?? 0) + 1;
  if (!key.startsWith("OK")) details.push(`run#${run}: ${verdict}`);
  process.stdout.write(key.startsWith("OK") ? "." : "X");
  sock.close();
  await (rmgr as any).shutdown?.();
  db.close?.();
  await rm(dir, { recursive: true, force: true });
}
console.log("\n=== " + N + "판 ===");
for (const [k, v] of Object.entries(results).sort((a, b) => b[1] - a[1])) console.log(`${String(v).padStart(3)}  ${k}`);
if (details.length > 0) console.log("\n" + details.join("\n"));
process.exit(0);
