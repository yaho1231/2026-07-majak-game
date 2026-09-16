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
 *
 * ── 측정 조건 옵션 (QA 5라운드 C-3, docs/55 §5) — 전부 생략하면 종전과 같은 동작·출력 ──
 *   --difficulty hard|normal|easy  방 생성 뒤 `setBotDifficulty`로 봇 난이도 지정 (기본 hard)
 *   --friends F        등록 뒤 각 유저가 F명과 친구를 맺는다(요청→수락) — S-4 프레즌스 경로
 *   --seed-users U     stats.json 에 U명의 PlayerStatsRaw 를 미리 채운다 — S-5 stringify 원가
 *   --spectate K       관리자 소켓 K개가 테이블 K개를 관전한다(소켓 하나 = 관전석 하나)
 *   --heap-snapshot    준비 직후 / 중간 / shutdown+gc 뒤 힙 스냅샷 3장 (경로를 찍는다)
 *   --perf-interval ms perfSnapshot 을 주기적으로 jsonl 로 stdout 에 — sweep 버스트가 보이게
 *   --stmt-count       SiteDb.stmt 를 이 파일 안에서만 감싸 SQL별 호출 수·누적 ms 를 센다
 *   --augments         사람 좌석이 드래프트에서 액티브 증강을 집고 프롬프트에서 그 선택지를 누른다
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { writeHeapSnapshot } from "node:v8";
import type { WebSocket } from "ws";
import { createEmptyStats } from "@majak/core/stats/PlayerStats.js";
import type { PlayerStatsRaw } from "@majak/core/stats/PlayerStats.js";
import { isAugmentActionType } from "@majak/core";
import { contentAugments } from "@majak/content";
import { RoomManager } from "./RoomManager.js";
import { SiteDb } from "./SiteDb.js";
import { StatsStore } from "./StatsStore.js";
import { perfSnapshot } from "./perfMonitor.js";
import type { PerfSnapshot } from "./perfMonitor.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
const tables = Number(arg("tables") ?? 10);
const seconds = Number(arg("seconds") ?? 30);
const difficulty = arg("difficulty"); // undefined = 서버 기본(hard)
const friends = Math.max(0, Number(arg("friends") ?? 0));
const seedUsers = Math.max(0, Number(arg("seed-users") ?? 0));
const spectate = Math.max(0, Number(arg("spectate") ?? 0));
const heapSnapshot = flag("heap-snapshot");
const perfInterval = Number(arg("perf-interval") ?? 0);
const stmtCount = flag("stmt-count");
const augments = flag("augments");

if (difficulty !== undefined && !["hard", "normal", "easy"].includes(difficulty)) {
  console.error(`--difficulty 는 hard|normal|easy 중 하나: ${difficulty}`);
  process.exit(2);
}

/** 액티브 증강 = 봇 발동 정책(`bot`)이 있는 증강 — 프롬프트에 자기 선택지를 세우는 것들 */
const ACTIVE_AUGMENT_IDS: ReadonlySet<string> = new Set(
  contentAugments.filter((a) => a.bot !== undefined).map((a) => a.id),
);

/** 프롬프트에 즉시 답하는 가짜 소켓 — 서버 테스트의 FakeSocket과 같은 규약 */
class LoadSocket {
  readyState = 1;
  views = 0;
  gamesOver = 0;
  /** `--augments`: 드래프트에서 집은 액티브 증강 수 / 프롬프트에서 누른 증강 선택지 수 */
  activePicks = 0;
  augmentActions = 0;
  /** `--spectate` 관전석: 받기만 하고 답하지 않는다 */
  passive = false;
  private handlers: Record<string, ((...a: unknown[]) => void)[]> = {};
  private waiters: { pred: (m: any) => boolean; resolve: () => void }[] = [];
  /** 최근 메시지 — `waitFor`가 이미 온 답을 놓치지 않게 (응답은 동기로 온다) */
  private recent: any[] = [];
  /** 받은 프레임 일련번호 — `mark()`/`waitSince()`로 «이 요청 뒤에 온 답»만 기다린다 */
  private seq = 0;
  private seqOf = new WeakMap<object, number>();
  /** 직전에 누른 증강 선택지 타입 — 같은 선택지를 연달아 눌러 맴도는 것을 막는다 */
  private lastAugmentAction: string | null = null;
  send(data: string): void {
    const msg = JSON.parse(data);
    this.seqOf.set(msg, ++this.seq);
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
    if (!this.passive) this.respond(msg);
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
  /** 최근 프레임 중 pred 를 만족하는 마지막 것 */
  find(pred: (m: any) => boolean): any {
    for (let i = this.recent.length - 1; i >= 0; i--) if (pred(this.recent[i])) return this.recent[i];
    return undefined;
  }
  /** 지금까지 받은 프레임 수 — `waitSince`의 기준점 */
  mark(): number {
    return this.seq;
  }
  /** `mark` 뒤에 도착한(또는 도착할) 프레임 중 pred 를 만족하는 첫 것을 기다린다 */
  waitSince(mark: number, pred: (m: any) => boolean): Promise<void> {
    if (this.recent.some((m) => (this.seqOf.get(m) ?? 0) > mark && pred(m))) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => this.waiters.push({ pred, resolve }));
  }
  private respond(msg: any): void {
    if (msg.type === "prompt") {
      const opts = msg.prompt.options as any[];
      let pick: any = undefined;
      if (augments) {
        const aug = opts.find(
          (o) => isAugmentActionType(o.type) && o.type !== this.lastAugmentAction,
        );
        if (aug !== undefined) {
          pick = aug;
          this.augmentActions++;
          this.lastAugmentAction = aug.type;
        } else {
          this.lastAugmentAction = null;
        }
      }
      pick ??=
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
      let id = msg.choices[0].id;
      if (augments) {
        const active = (msg.choices as { id: string }[]).find((c) => ACTIVE_AUGMENT_IDS.has(c.id));
        if (active !== undefined) {
          id = active.id;
          this.activePicks++;
        }
      }
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

// ─────────────────────────── --seed-users: stats.json 사전 채움 ───────────────────────────

/** StatsStore 가 읽는 파일 형식(`{version:1, players}`)에 맞춰 U명의 «그럴듯한» 누적 통계를 쓴다 */
function seedStatsFile(path: string, users: number): void {
  const players: Record<string, PlayerStatsRaw> = {};
  const augIds = contentAugments.map((a) => a.id);
  for (let i = 0; i < users; i++) {
    const s = createEmptyStats();
    const games = 20 + (i % 50); // 유저마다 20~69판 — 실측 분포와 비슷한 크기의 문서
    s.games = games;
    s.roundsPlayed = games * 9;
    s.wins = Math.round(s.roundsPlayed * 0.22);
    s.tsumoWins = Math.round(s.wins * 0.4);
    s.ronWins = s.wins - s.tsumoWins;
    s.winPointsTotal = s.wins * 5200;
    s.dealIns = Math.round(s.roundsPlayed * 0.12);
    s.dealInPointsTotal = s.dealIns * 4800;
    s.riichiRounds = Math.round(s.roundsPlayed * 0.18);
    s.callRounds = Math.round(s.roundsPlayed * 0.3);
    const p1 = Math.floor(games / 4);
    s.placements = [p1, p1, p1, games - 3 * p1];
    s.placementSum = p1 * (1 + 2 + 3) + (games - 3 * p1) * 4;
    // 증강 항목이 문서 크기의 대부분이다 — 유저당 30~60개
    const n = 30 + (i % 31);
    for (let k = 0; k < n; k++) {
      const id = augIds[(i * 7 + k * 13) % augIds.length];
      if (id === undefined) break;
      const offered = 3 + ((i + k) % 20);
      const picked = Math.floor(offered / 3);
      s.augments[id] = {
        offered,
        picked,
        games: picked,
        placements: [Math.floor(picked / 4), Math.floor(picked / 4), Math.floor(picked / 4), picked - 3 * Math.floor(picked / 4)],
        placementSum: picked * 2.5,
      };
    }
    players[`seed${i}`] = s;
  }
  writeFileSync(path, JSON.stringify({ version: 1, players }, null, 2), "utf8");
}

// ─────────────────────────── --stmt-count: SiteDb.stmt 계수기 ───────────────────────────

interface StmtStat {
  calls: number;
  ms: number;
}
const stmtStats = new Map<string, StmtStat>();
let stmtLookups = 0;

/**
 * `SiteDb.stmt(sql)` 를 이 프로세스 안에서만 감싼다 — SiteDb.ts 는 손대지 않는다.
 * stmt() 자체는 캐시 조회라 싸다; 원가는 돌려준 구문의 run/get/all 에 있으므로 그 셋을
 * SQL 별로 재는 프록시를 씌운다(구문 객체당 프록시 1개 — 캐시).
 */
function installStmtCounter(target: SiteDb): void {
  const proto = Object.getPrototypeOf(target) as { stmt: (sql: string) => unknown };
  const original = proto.stmt;
  const proxies = new WeakMap<object, unknown>();
  const timed = new Set(["run", "get", "all"]);
  (target as unknown as { stmt: (sql: string) => unknown }).stmt = function (
    this: SiteDb,
    sql: string,
  ): unknown {
    stmtLookups++;
    const stmt = original.call(this, sql) as object;
    let p = proxies.get(stmt);
    if (p === undefined) {
      const stat: StmtStat = { calls: 0, ms: 0 };
      stmtStats.set(sql, stat);
      p = new Proxy(stmt, {
        get(t, prop, recv) {
          const v = Reflect.get(t, prop, recv) as unknown;
          if (typeof v !== "function" || typeof prop !== "string" || !timed.has(prop)) return v;
          return (...args: unknown[]) => {
            const t0 = performance.now();
            try {
              return (v as (...a: unknown[]) => unknown).apply(t, args);
            } finally {
              stat.calls++;
              stat.ms += performance.now() - t0;
            }
          };
        },
      });
      proxies.set(stmt, p);
    }
    return p;
  };
}

function stmtReport(): string[] {
  let calls = 0;
  let ms = 0;
  for (const s of stmtStats.values()) {
    calls += s.calls;
    ms += s.ms;
  }
  const top = [...stmtStats.entries()]
    .sort((a, b) => b[1].ms - a[1].ms)
    .slice(0, 8)
    .map(
      ([sql, s]) =>
        `    ${s.calls}회 · ${s.ms.toFixed(1)}ms · ${sql.replace(/\s+/g, " ").trim().slice(0, 72)}`,
    );
  return [
    `SiteDb.stmt 조회 ${stmtLookups}회 · 실행(run/get/all) ${calls}회 · 누적 ${ms.toFixed(1)}ms · 구문 종류 ${stmtStats.size}`,
    ...top,
  ];
}

// ─────────────────────────── 준비 ───────────────────────────

const dir = mkdtempSync(join(tmpdir(), "majak-load-"));
if (seedUsers > 0) seedStatsFile(join(dir, "stats.json"), seedUsers);
const store = new StatsStore(join(dir, "stats.json"));
await store.load();
const db = new SiteDb(join(dir, "site.db"));
if (stmtCount) installStmtCounter(db);
const rm = new RoomManager(dir, store, 0, db, "");

const socks: LoadSocket[] = [];
// 1) 등록 — 친구 맺기는 상대가 등록돼 있어야 하므로 전원 먼저 등록한다
for (let i = 0; i < tables; i++) {
  const sock = new LoadSocket();
  socks.push(sock);
  rm.handleConnection(sock.asWs());
  sock.clientSend({ type: "register", username: `load${i}`, password: "pw123456" });
  await sock.waitFor((m) => m.type === "authOk");
}

// 2) --friends: 링 위 F명에게 요청 → 상대가 수락. 전원 접속 중이라 friendList 의 온라인
//    표시(프레즌스, S-4) 계산이 실제로 돈다.
let friendPairs = 0;
const friendsEach = Math.min(friends, Math.max(0, tables - 1));
if (friendsEach > 0) {
  for (let i = 0; i < tables; i++) {
    for (let k = 1; k <= friendsEach; k++) {
      const j = (i + k) % tables;
      const a = socks[i]!;
      const m = a.mark();
      a.clientSend({ type: "friendRequest", nickname: `load${j}` });
      await a.waitSince(m, (x) => x.type === "friendList" || x.type === "error");
    }
  }
  for (let i = 0; i < tables; i++) {
    for (let k = 1; k <= friendsEach; k++) {
      const j = (i + k) % tables;
      const b = socks[j]!;
      const m = b.mark();
      b.clientSend({ type: "friendRespond", nickname: `load${i}`, accept: true });
      await b.waitSince(m, (x) => x.type === "friendList");
      friendPairs++;
    }
  }
}

// 3) 방 생성·봇·시작
const codes: string[] = [];
for (let i = 0; i < tables; i++) {
  const sock = socks[i]!;
  sock.clientSend({ type: "createRoom" });
  await sock.waitFor((m) => m.type === "roomCreated");
  codes.push(sock.find((m) => m.type === "roomCreated")?.code as string);
  for (let b = 0; b < 3; b++) sock.clientSend({ type: "addBot" });
  await sock.waitFor((m) => m.type === "lobby" && m.players.length === 4);
  if (difficulty !== undefined) {
    const m = sock.mark();
    sock.clientSend({ type: "setBotDifficulty", difficulty });
    await sock.waitSince(m, (x) => x.type === "lobby" && x.botDifficulty === difficulty);
  }
  sock.clientSend({ type: "startGame" });
}

// 4) --spectate: 관리자 소켓 K개 — 한 소켓은 관전석 하나이므로 K개를 띄운다.
//    관리자 코드는 쓰일 때마다 회전하므로 매번 db.adminCode() 를 새로 읽는다.
const spectators: LoadSocket[] = [];
let spectating = 0;
if (spectate > 0) {
  const k = Math.min(spectate, tables);
  for (let s = 0; s < k; s++) {
    const sock = new LoadSocket();
    sock.passive = true;
    spectators.push(sock);
    rm.handleConnection(sock.asWs());
    sock.clientSend({
      type: "register",
      username: `watch${s}`,
      password: "pw123456",
      adminCode: db.adminCode(),
    });
    await sock.waitFor((m) => m.type === "authOk");
  }
  // 방이 «playing» 이 된 뒤에만 관전이 열린다 — 잠깐 기다렸다 몇 번 다시 시도한다
  for (let attempt = 0; attempt < 20 && spectating < spectators.length; attempt++) {
    await new Promise((r) => setTimeout(r, 100));
    for (let s = 0; s < spectators.length; s++) {
      const sock = spectators[s]!;
      if (sock.views > 0) continue;
      const m = sock.mark();
      sock.clientSend({ type: "spectate", code: codes[s] });
      await sock.waitSince(m, (x) => x.type === "spectateStarted" || x.type === "error");
    }
    spectating = spectators.filter((s) => s.views > 0).length;
  }
}

// ─────────────────────────── 측정 ───────────────────────────

const heapPaths: string[] = [];
function snapshot(label: string): void {
  const p = writeHeapSnapshot(join(dir, `heap-${label}.heapsnapshot`));
  heapPaths.push(p);
  console.log(`힙 스냅샷(${label}): ${p}`);
}

perfSnapshot(); // 창을 비운다 — 준비 단계는 재지 않는다
if (heapSnapshot) snapshot("ready");
const cpu0 = process.cpuUsage();
const t0 = Date.now();

// --perf-interval: 창을 주기적으로 비우며 시계열을 jsonl 로 찍는다. 끝의 요약은
// 시계열 전체의 최댓값/합으로 만든다(창을 나눴으므로 마지막 창만으로는 뜻이 없다).
const series: PerfSnapshot[] = [];
let ticker: NodeJS.Timeout | undefined;
if (perfInterval > 0) {
  ticker = setInterval(() => {
    const s = perfSnapshot();
    series.push(s);
    console.log(
      JSON.stringify({
        t: Date.now() - t0,
        loopP50: s.loopDelayMs.p50,
        loopP99: s.loopDelayMs.p99,
        loopMax: s.loopDelayMs.max,
        bot: s.botDecision.count,
        botP99: s.botDecision.p99Ms,
        botMax: s.botDecision.maxMs,
        heapUsed: s.heapMb.used,
        rss: s.heapMb.rss,
        ...(stmtCount
          ? { stmtCalls: [...stmtStats.values()].reduce((n, x) => n + x.calls, 0) }
          : {}),
      }),
    );
  }, perfInterval);
}
let mid: NodeJS.Timeout | undefined;
if (heapSnapshot) mid = setTimeout(() => snapshot("mid"), (seconds * 1000) / 2);

await new Promise((r) => setTimeout(r, seconds * 1000));
if (ticker !== undefined) clearInterval(ticker);
if (mid !== undefined) clearTimeout(mid);
const cpu = process.cpuUsage(cpu0);
const elapsed = (Date.now() - t0) / 1000;
// `--expose-gc`로 띄우면 수거 뒤의 힙을 잰다 — 테이블당 «붙들고 있는» 메모리가 보인다
(globalThis as { gc?: () => void }).gc?.();
let perf = perfSnapshot();
if (series.length > 0) {
  series.push(perf);
  const max = (f: (s: PerfSnapshot) => number): number => Math.max(...series.map(f));
  const botCount = series.reduce((n, s) => n + s.botDecision.count, 0);
  const botMean =
    botCount === 0
      ? 0
      : series.reduce((n, s) => n + s.botDecision.meanMs * s.botDecision.count, 0) / botCount;
  perf = {
    ...perf,
    loopDelayMs: {
      p50: max((s) => s.loopDelayMs.p50),
      p99: max((s) => s.loopDelayMs.p99),
      max: max((s) => s.loopDelayMs.max),
    },
    botDecision: {
      ...perf.botDecision,
      count: botCount,
      meanMs: Number(botMean.toFixed(2)),
      p99Ms: max((s) => Number(s.botDecision.p99Ms) || 0),
      maxMs: max((s) => s.botDecision.maxMs),
    },
  };
}

const cpuSec = (cpu.user + cpu.system) / 1e6;
const views = socks.reduce((n, s) => n + s.views, 0);
const games = socks.reduce((n, s) => n + s.gamesOver, 0);
const lines = [
  `테이블 ${tables} · ${elapsed.toFixed(1)}초`,
  `CPU ${cpuSec.toFixed(1)}s = 코어의 ${((cpuSec / elapsed) * 100).toFixed(0)}% · 테이블당 ${((cpuSec / elapsed / tables) * 100).toFixed(1)}%`,
  `끝난 판 ${games} · 사람에게 간 뷰 ${views} (${(views / elapsed).toFixed(0)}/s)`,
  `이벤트 루프 지연 p50 ${perf.loopDelayMs.p50}ms · p99 ${perf.loopDelayMs.p99}ms · max ${perf.loopDelayMs.max}ms${series.length > 0 ? ` (창 ${series.length}개의 최댓값)` : ""}`,
  `봇 판단 ${perf.botDecision.count}회 · 평균 ${perf.botDecision.meanMs}ms · p99 ${perf.botDecision.p99Ms}ms · max ${perf.botDecision.maxMs}ms`,
  `힙 ${perf.heapMb.used}/${perf.heapMb.total}MB · rss ${perf.heapMb.rss}MB`,
];
if (difficulty !== undefined) lines.push(`봇 난이도 ${difficulty}`);
if (friends > 0) lines.push(`친구 ${friendsEach}명/유저 · 맺은 쌍 ${friendPairs}`);
if (seedUsers > 0) lines.push(`stats.json 사전 유저 ${seedUsers}명 · 저장소 항목 ${store.entries().length}`);
if (spectate > 0) {
  const sv = spectators.reduce((n, s) => n + s.views, 0);
  lines.push(`관전 ${spectating}/${spectators.length}석 · 관전 뷰 ${sv} (${(sv / elapsed).toFixed(0)}/s)`);
}
if (augments) {
  const picks = socks.reduce((n, s) => n + s.activePicks, 0);
  const acts = socks.reduce((n, s) => n + s.augmentActions, 0);
  lines.push(`액티브 증강 집음 ${picks}회 · 증강 선택지 누름 ${acts}회 (후보 ${ACTIVE_AUGMENT_IDS.size}종)`);
}
if (stmtCount) lines.push(...stmtReport());
console.log(lines.join("\n"));
await rm.shutdown("부하 측정 끝");
rm.stop();
if (heapSnapshot) {
  (globalThis as { gc?: () => void }).gc?.();
  snapshot("shutdown");
}
db.close?.();
// 힙 스냅샷은 임시 디렉터리 안에 있다 — 남겨 두어야 열어 볼 수 있다
if (heapSnapshot) console.log(`힙 스냅샷 ${heapPaths.length}장 보존: ${dir}`);
else rmSync(dir, { recursive: true, force: true });
process.exit(0);
