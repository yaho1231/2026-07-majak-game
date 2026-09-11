/**
 * 부하 측정 — **테이블 N개를 한 프로세스에서 동시에** 돌려 서버 한 대의 수용량을 잰다.
 *
 *   BOT_THINK_MS=0 AUTO_MOVE_MS=0 node --import tsx/esm src/loadCli.ts --tables 20 --seconds 30
 *
 * 각 테이블은 사람 1(즉시 답하는 가짜 소켓) + 봇 3. 실제 `RoomManager`를 그대로 쓰므로
 * 뷰 직렬화·리플레이 기록·통계·DB까지 **운영 경로 전부**가 원가에 든다 (아레나는
 * 엔진·봇만 잰다). 끝나면 테이블당 CPU와 이벤트 루프 지연을 찍는다.
 *
 * 생각 시간이 0이라 한 테이블이 «최대 속도»로 돈다 — 실제 대국은 사람이 두는 속도
 * (한 결정에 몇 초)라 여기서 나온 테이블당 CPU를 그 비율로 나눠 읽는다. 예: 여기서
 * 테이블 하나가 한 코어의 50%를 쓰고 한 판이 20초 만에 끝났다면, 30분짜리 실제 판은
 * 평균 0.5%다.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WebSocket } from "ws";
import { RoomManager } from "./RoomManager.js";
import { SiteDb } from "./SiteDb.js";
import { StatsStore } from "./StatsStore.js";
import { perfSnapshot } from "./perfMonitor.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const tables = Number(arg("tables") ?? 10);
const seconds = Number(arg("seconds") ?? 30);

/** 프롬프트에 즉시 답하는 가짜 소켓 — 서버 테스트의 FakeSocket과 같은 규약 */
class LoadSocket {
  readyState = 1;
  views = 0;
  gamesOver = 0;
  private handlers: Record<string, ((...a: unknown[]) => void)[]> = {};
  private waiters: { pred: (m: any) => boolean; resolve: () => void }[] = [];
  /** 최근 메시지 — `waitFor`가 이미 온 답을 놓치지 않게 (응답은 동기로 온다) */
  private recent: any[] = [];
  send(data: string): void {
    const msg = JSON.parse(data);
    this.recent.push(msg);
    if (this.recent.length > 50) this.recent.shift();
    if (msg.type === "view") this.views++;
    if (msg.type === "gameOver") this.gamesOver++;
    this.waiters = this.waiters.filter((w) => {
      if (w.pred(msg)) {
        w.resolve();
        return false;
      }
      return true;
    });
    this.respond(msg);
  }
  on(event: string, cb: (...a: unknown[]) => void): void {
    (this.handlers[event] ??= []).push(cb);
  }
  close(): void {
    this.readyState = 3;
    this.emit("close");
  }
  ping(): void {}
  terminate(): void {
    this.close();
  }
  clientSend(msg: unknown): void {
    this.emit("message", Buffer.from(JSON.stringify(msg)));
  }
  waitFor(pred: (m: any) => boolean): Promise<void> {
    if (this.recent.some(pred)) return Promise.resolve();
    return new Promise<void>((resolve) => this.waiters.push({ pred, resolve }));
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
    } else if (msg.type === "gameOver") {
      // 결과 화면에서 «이어하기» — 같은 방으로 다음 판을 계속 돌린다
      setTimeout(() => this.clientSend({ type: "startGame" }), 0);
    }
  }
  private emit(event: string, ...args: unknown[]): void {
    for (const cb of this.handlers[event] ?? []) cb(...args);
  }
  asWs(): WebSocket {
    return this as unknown as WebSocket;
  }
}

const dir = mkdtempSync(join(tmpdir(), "majak-load-"));
const store = new StatsStore(join(dir, "stats.json"));
await store.load();
const db = new SiteDb(join(dir, "site.db"));
const rm = new RoomManager(dir, store, 0, db, "");

const socks: LoadSocket[] = [];
for (let i = 0; i < tables; i++) {
  const sock = new LoadSocket();
  socks.push(sock);
  rm.handleConnection(sock.asWs());
  sock.clientSend({ type: "register", username: `load${i}`, password: "pw123456" });
  await sock.waitFor((m) => m.type === "authOk");
  sock.clientSend({ type: "createRoom" });
  await sock.waitFor((m) => m.type === "roomCreated");
  for (let b = 0; b < 3; b++) sock.clientSend({ type: "addBot" });
  await sock.waitFor((m) => m.type === "lobby" && m.players.length === 4);
  sock.clientSend({ type: "startGame" });
}

perfSnapshot(); // 창을 비운다 — 준비 단계는 재지 않는다
const cpu0 = process.cpuUsage();
const t0 = Date.now();
await new Promise((r) => setTimeout(r, seconds * 1000));
const cpu = process.cpuUsage(cpu0);
const elapsed = (Date.now() - t0) / 1000;
// `--expose-gc`로 띄우면 수거 뒤의 힙을 잰다 — 테이블당 «붙들고 있는» 메모리가 보인다
(globalThis as { gc?: () => void }).gc?.();
const perf = perfSnapshot();

const cpuSec = (cpu.user + cpu.system) / 1e6;
const views = socks.reduce((n, s) => n + s.views, 0);
const games = socks.reduce((n, s) => n + s.gamesOver, 0);
console.log(
  [
    `테이블 ${tables} · ${elapsed.toFixed(1)}초`,
    `CPU ${cpuSec.toFixed(1)}s = 코어의 ${((cpuSec / elapsed) * 100).toFixed(0)}% · 테이블당 ${((cpuSec / elapsed / tables) * 100).toFixed(1)}%`,
    `끝난 판 ${games} · 사람에게 간 뷰 ${views} (${(views / elapsed).toFixed(0)}/s)`,
    `이벤트 루프 지연 p50 ${perf.loopDelayMs.p50}ms · p99 ${perf.loopDelayMs.p99}ms · max ${perf.loopDelayMs.max}ms`,
    `봇 판단 ${perf.botDecision.count}회 · 평균 ${perf.botDecision.meanMs}ms · p99 ${perf.botDecision.p99Ms}ms · max ${perf.botDecision.maxMs}ms`,
    `힙 ${perf.heapMb.used}/${perf.heapMb.total}MB · rss ${perf.heapMb.rss}MB`,
  ].join("\n"),
);
await rm.shutdown("부하 측정 끝");
rm.stop();
db.close?.();
rmSync(dir, { recursive: true, force: true });
process.exit(0);
