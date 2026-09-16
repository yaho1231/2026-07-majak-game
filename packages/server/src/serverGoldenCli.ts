/**
 * 서버 골든 해시 — **운영 경로 전부**가 한 비트도 바뀌지 않았는가 (docs/55 §2-7 X-9·X-4, §5 C-2).
 *
 *   npm run golden:server -- [--games 1] [--seed 1] [--mode tonpuu|hanchan] [--pace expert|novice]
 *                             [--room normal|guest|sandbox] [--reconnect] [--twice] [--dump <dir>]
 *                             [--weights <stats.augments.json>] [--no-patch-random] [--json]
 *
 *   --reconnect        첫 판 40번째 뷰 뒤(동기 후속 뷰 몇 개 더 온 다음) 소켓을 끊고 login+joinRoom 으로 돌아온다 (normal 방만)
 *   --twice            같은 인자로 자식 둘을 돌려 해시가 같은지 본다 (종료코드 0/1)
 *   --dump <dir>       해시에 넣은 줄을 그대로 파일로 남긴다 (`--twice` 불일치 때 첫 차이 경로를 찍는다)
 *   --no-patch-random  시드 주입을 끈다 — «주입 없이는 불일치» 를 보여 주는 대조군
 *   --games 2 이상     normal 방은 판 사이 대기실(lobby)에서 startGame, sandbox 는 sandboxReset,
 *                      guest 방은 1판 뒤 서버가 방을 지우므로 항상 1판
 *
 * `goldenCli.ts`는 HanchanController + 봇만 덮는다. 이쪽은 `loadCli.ts`의 가짜 소켓으로
 * **사람 1 + 봇 3 방을 실제 `RoomManager`에** 세워, 사람 소켓이 받은 **모든 프레임**
 * (RoomManager → HumanAgent 직렬화 뷰·프롬프트·드래프트·로비·결과), 판이 끝난 뒤의
 * **리플레이 `.jsonl` 바이트**, `games`·`game_players`·`live_games` **DB 행**, `stats.json`
 * 을 순서대로 SHA-256 에 넣는다. ws 압축·DB·통계·뷰 직렬화 최적화가 이 해시를 바꾸면
 * «판이 바뀐 것»이다.
 *
 * ── 결정성을 어떻게 얻나 ──
 *  1. `BOT_THINK_MS=0`·`AUTO_MOVE_MS=0` (npm script 가 건다).
 *  2. **시드 주입**: RoomManager 는 판 시드를 `randomInt(0x1_0000_0000)`, 방 코드를
 *     `randomInt(CODE_CHARS.length)` 로 뽑고 그 어디에도 주입 훅이 없다(2026-09-16 확인 —
 *     `createRoom`의 `options.code` 는 이어하기 전용 내부 인자). 그래서 이 CLI 는
 *     RoomManager 를 **import 하기 전에** `node:crypto`의 `randomInt` 를 시드 PRNG 로
 *     바꿔 끼우고 `module.syncBuiltinESMExports()` 로 ESM 바인딩을 갱신한다. 프로세스
 *     안에서만 유효하고 운영 코드는 한 줄도 바뀌지 않는다(운영 기본값 불변, X-9).
 *     ⚠ `randomUUID`·`randomBytes`(세션·공유 토큰·관리자 코드)는 그대로 둔다 — 토큰은
 *     마스킹한다.
 *  3. **가중치 고정**(X-4): `AugmentStatsStore` 를 넘기지 않는다 → 정적 티어표. 스냅샷
 *     파일을 쓰려면 `--weights <stats.augments.json>` — 20판마다 조정이 도는 것은 그대로
 *     이므로 `--games` 가 20 이상이면 조정이 해시에 섞인다(그 경우도 자기 일치는 성립).
 *  4. **시각·토큰 마스킹**: 아래 `MASK_KEYS`. 이 표는 `--twice --dump` 로 두 실행의
 *     프레임을 경로 단위로 비교해 실제로 달라진 필드에서 뽑았다 — 목록을 늘릴 때도 같은
 *     방법으로 «달라진 경로»를 먼저 본다.
 *
 * ── 자기 일치(--twice) ──
 * 같은 인자로 **자식 프로세스 둘**을 띄워 해시를 비교한다(한 프로세스에서 두 번 돌리면
 * 모듈 전역 캐시·rate limiter 창이 두 번째 실행에 스며들 수 있다). 이게 통과해야 도구가
 * 의미 있다 — 불일치면 `--dump` 로 두 덤프를 남겨 첫 차이 경로를 찍는다.
 */

import cryptoMod from "node:crypto";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { WebSocket } from "ws";

// ───────────────────────────── 인자 ─────────────────────────────

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

const games = Number(arg("games") ?? 1);
const seed = Number(arg("seed") ?? 1);
const mode = arg("mode") === "hanchan" ? "hanchan" : "tonpuu";
const pace = arg("pace") ?? "expert";
const roomKind = (arg("room") ?? "normal") as "normal" | "guest" | "sandbox";
const reconnect = flag("reconnect");
const twice = flag("twice");
const dumpDir = arg("dump");
const weightsFile = arg("weights");
const noPatch = flag("no-patch-random");
/** 재접속을 끼워 넣는 자리 — 첫 판에서 이 번째 뷰를 받은 직후 */
const RECONNECT_AFTER_VIEWS = 40;

// ───────────────────────────── 시드 PRNG 주입 ─────────────────────────────

/** mulberry32 — 32비트 시드 하나로 결정적 정수열 */
function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

if (!noPatch) {
  const rng = mulberry32(seed >>> 0);
  const seededRandomInt = (a: number, b?: number | ((e: Error | null, n: number) => void), cb?: (e: Error | null, n: number) => void) => {
    let min = 0;
    let max = a;
    if (typeof b === "number") {
      min = a;
      max = b;
    } else if (typeof b === "function") cb = b;
    const n = min + Math.floor(rng() * (max - min));
    if (cb !== undefined) {
      cb(null, n);
      return undefined as unknown as number;
    }
    return n;
  };
  (cryptoMod as unknown as { randomInt: unknown }).randomInt = seededRandomInt;
  syncBuiltinESMExports();
}

// 주입 **뒤에** 서버 모듈을 올린다 — 정적 import 는 호이스팅되어 주입보다 먼저 평가된다.
const { RoomManager } = await import("./RoomManager.js");
const { SiteDb } = await import("./SiteDb.js");
const { StatsStore } = await import("./StatsStore.js");
const { AugmentStatsStore } = await import("./AugmentStatsStore.js");

// ───────────────────────────── 마스킹 표 ─────────────────────────────

/**
 * 시각·토큰 필드 — 값을 `"<t>"` 로 바꾼다. 키 이름으로 잡는다(경로 무관).
 * 2026-09-16 `--twice --dump` 비교로 실제 달라진 키에서 뽑은 것 + 서버 코드에서
 * `Date.now()`·토큰을 넣는 자리(HumanAgent.ts:1155·1186·1222·1394, RoomManager `joined`·
 * `authOk`·`replayShareToken`, SiteDb `created_at`·`started_at`·`ended_at`·`updated_at`).
 */
const MASK_KEYS = new Set<string>([
  // 좌석 타이머 (HumanAgent 프롬프트·뷰: 남은 시간·저금 시간) — 매 프레임 관측됨
  "deadlineMs",
  "bankMs",
  // 접속 신원 (authOk.sessionToken, joined.token, guest 재개 토큰)
  "sessionToken",
  "token",
  "guestToken",
  // DB 행 (games·live_games·users·sessions)
  "started_at",
  "ended_at",
  "updated_at",
  "created_at",
  "share_token",
  "replay_path",
  // 서버 정보 프레임·재개 뷰에 시각이 실릴 때를 위한 보험 (코드에서 확인된 이름만)
  "deadline",
  "deadlineAt",
  "armedAt",
  "sinceMs",
]);
/** 리플레이 파일 이름의 시각 부분: `<code>_2026-09-16T03-21-05-123Z.jsonl` */
const REPLAY_TS_RE = /_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.jsonl/g;

function mask(v: unknown, key = ""): unknown {
  if (MASK_KEYS.has(key)) return "<t>";
  if (Array.isArray(v)) return v.map((x) => mask(x));
  if (v !== null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object)) out[k] = mask((v as Record<string, unknown>)[k], k);
    return out;
  }
  if (typeof v === "string") return v.replace(REPLAY_TS_RE, "_<t>.jsonl");
  return v;
}

// ───────────────────────────── 가짜 소켓 ─────────────────────────────

/** loadCli 의 LoadSocket 과 같은 규약 + 받은 프레임을 밖으로 넘긴다 */
class GoldenSocket {
  readyState = 1;
  views = 0;
  gamesOver = 0;
  autoRespond = true;
  private handlers: Record<string, ((...a: unknown[]) => void)[]> = {};
  private waiters: { pred: (m: any) => boolean; resolve: () => void }[] = [];
  private recent: any[] = [];
  constructor(private readonly onFrame: (msg: any, sock: GoldenSocket) => void) {}
  send(data: string): void {
    const msg = JSON.parse(data);
    this.recent.push(msg);
    if (this.recent.length > 50) this.recent.shift();
    if (msg.type === "view") this.views++;
    if (msg.type === "gameOver") this.gamesOver++;
    this.onFrame(msg, this);
    this.waiters = this.waiters.filter((w) => {
      if (w.pred(msg)) {
        w.resolve();
        return false;
      }
      return true;
    });
    if (this.autoRespond) this.respond(msg);
  }
  on(event: string, cb: (...a: unknown[]) => void): void {
    (this.handlers[event] ??= []).push(cb);
  }
  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.autoRespond = false;
    this.emit("close");
  }
  ping(): void {}
  terminate(): void {
    this.close();
  }
  clientSend(msg: unknown): void {
    this.emit("message", Buffer.from(JSON.stringify(msg)));
  }
  waitFor(pred: (m: any) => boolean, timeoutMs = 60_000): Promise<void> {
    if (this.recent.some(pred)) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`waitFor timeout (${timeoutMs}ms)`)), timeoutMs);
      timer.unref?.();
      this.waiters.push({
        pred,
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
      });
    });
  }
  private respond(msg: any): void {
    if (msg.type === "prompt") {
      const opts = msg.prompt.options as any[];
      const pick =
        opts.find((o) => o.type === "pass") ?? opts.find((o) => o.type === "discard") ?? opts[0];
      setTimeout(() => {
        if (!this.autoRespond) return;
        this.clientSend({ type: "action", actionType: pick.type, payload: pick.payload, seat: msg.prompt.player });
      }, 0);
    } else if (msg.type === "draftOffer") {
      const id = msg.choices[0].id;
      setTimeout(() => {
        if (this.autoRespond) this.clientSend({ type: "draftPick", stage: msg.stage, augmentId: id });
      }, 0);
    } else if (msg.type === "roundOver") {
      setTimeout(() => {
        if (this.autoRespond) this.clientSend({ type: "roundContinue" });
      }, 0);
    }
    // gameOver 는 밖(runOnce)에서 «다음 판 / 끝» 을 결정한다
  }
  private emit(event: string, ...args: unknown[]): void {
    for (const cb of this.handlers[event] ?? []) cb(...args);
  }
  asWs(): WebSocket {
    return this as unknown as WebSocket;
  }
}

// ───────────────────────────── 한 번 실행 ─────────────────────────────

interface RunResult {
  hash: string;
  frames: number;
  views: number;
  replayBytes: number;
  rows: { games: number; game_players: number; live_games: number };
}

async function runOnce(): Promise<RunResult> {
  const dir = mkdtempSync(join(tmpdir(), "majak-golden-"));
  const hash = createHash("sha256");
  const dump: string[] = [];
  const feed = (tag: string, s: string) => {
    hash.update(tag + s + "\n");
    if (dumpDir !== undefined) dump.push(tag + s);
  };

  const store = new StatsStore(join(dir, "stats.json"));
  await store.load();
  // `record()` 는 RoomManager 가 기다리지 않고 던진다(비동기 저장). 마지막 저장이 디스크에
  // 닿은 뒤에 읽으려고 프로미스를 붙잡아 둔다.
  const statsWrites: Promise<void>[] = [];
  const origRecord = store.record.bind(store);
  store.record = (entries) => {
    const p = origRecord(entries);
    statsWrites.push(p);
    return p;
  };
  const db = new SiteDb(join(dir, "site.db"));
  let augStats: InstanceType<typeof AugmentStatsStore> | undefined;
  if (weightsFile !== undefined) {
    augStats = new AugmentStatsStore(weightsFile);
    await augStats.load();
  }
  const rm = new RoomManager(dir, store, 0, db, "", augStats);

  let frameNo = 0;
  let gamesDone = 0;
  let sockGen = 0;
  let reconnected = false;
  let awaitingLobby = false;
  let doneResolve!: () => void;
  const done = new Promise<void>((r) => (doneResolve = r));
  let current!: GoldenSocket;
  let roomCode = "";
  const PASSWORD = "pw123456";
  const USER = "golden";

  const onFrame = (msg: any, sock: GoldenSocket) => {
    if (sock !== current) return; // 닫힌 옛 소켓의 늦은 프레임은 세지 않는다
    frameNo++;
    feed(`F${frameNo} ${msg.type} `, JSON.stringify(mask(msg)));
    if (msg.type === "roomCreated") roomCode = msg.code;
    if (msg.type === "gameOver") {
      gamesDone++;
      // 게스트 방은 판이 끝나면 방이 사라져 lobby 가 오지 않는다 — 바로 끝.
      if (roomKind === "guest") setTimeout(doneResolve, 0);
      else awaitingLobby = true;
    }
    // 방은 gameOver **뒤** finishStats(비동기 통계 저장)가 끝나야 대기실로 돌아오고
    // 그때 `lobby` 를 방송한다 — 그 전에 보낸 startGame 은 phase 검사에서 조용히 버려진다.
    // (샌드박스 방은 startGame 대신 `sandboxReset` 으로 다음 판을 연다.)
    // **마지막 판 뒤에도 lobby 를 기다린다** — 안 기다리면 shutdown 이 finishStats 의
    // stats·lobby 프레임과 경주해 해시 꼬리가 실행마다 달라진다(2026-09-16 실측: 같은
    // 코드로 두 값이 번갈아 나옴. 저장 원가가 줄어 경주 결과가 뒤집힌 것이 발견 계기).
    if (awaitingLobby && msg.type === "lobby") {
      awaitingLobby = false;
      if (gamesDone >= games) {
        setTimeout(doneResolve, 0);
        return;
      }
      const next =
        roomKind === "sandbox" ? { type: "sandboxReset", mode } : { type: "startGame" };
      setTimeout(() => sock.clientSend(next), 0);
    }
    if (reconnect && !reconnected && msg.type === "view" && sock.views === RECONNECT_AFTER_VIEWS && roomKind === "normal") {
      reconnected = true;
      setTimeout(() => void doReconnect(), 0);
    }
  };
  const newSock = (): GoldenSocket => {
    const s = new GoldenSocket(onFrame);
    sockGen++;
    current = s;
    rm.handleConnection(s.asWs());
    return s;
  };
  const doReconnect = async () => {
    const old = current;
    old.close();
    feed("X reconnect ", `after ${old.views} views`);
    const back = newSock();
    back.clientSend({ type: "login", username: USER, password: PASSWORD });
    await back.waitFor((m) => m.type === "authOk" || m.type === "error");
    back.clientSend({ type: "joinRoom", code: roomCode });
  };

  const sock = newSock();
  if (roomKind === "guest") {
    sock.clientSend({ type: "guestPlay", mode });
    await sock.waitFor((m) => m.type === "authOk");
  } else {
    const adminCode = roomKind === "sandbox" ? db.adminCode() : undefined;
    sock.clientSend({
      type: "register",
      username: USER,
      password: PASSWORD,
      ...(adminCode !== undefined ? { adminCode } : {}),
    });
    await sock.waitFor((m) => m.type === "authOk" || m.type === "error");
    if (roomKind === "sandbox") {
      sock.clientSend({ type: "sandboxStart", mode });
    } else {
      sock.clientSend({ type: "createRoom" });
      await sock.waitFor((m) => m.type === "roomCreated");
      sock.clientSend({ type: "setGameMode", mode });
      sock.clientSend({ type: "setRoomPace", pace });
      for (let b = 0; b < 3; b++) sock.clientSend({ type: "addBot" });
      await sock.waitFor((m) => m.type === "lobby" && m.players.length === 4);
      sock.clientSend({ type: "startGame" });
    }
  }
  await done;
  current.autoRespond = false;
  // 리플레이 스트림이 디스크에 다 나가도록 — 운영의 gracefulShutdown 과 같은 경로
  await rm.shutdown("골든 끝");
  rm.stop();

  // ── 리플레이 바이트 (파일 이름의 시각은 마스킹, 내용은 그대로) ──
  let replayBytes = 0;
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .sort();
  for (const f of files) {
    const buf = readFileSync(join(dir, f));
    replayBytes += buf.length;
    feed("P ", f.replace(REPLAY_TS_RE, "_<t>.jsonl"));
    hash.update(buf);
    if (dumpDir !== undefined) dump.push("PB " + createHash("sha256").update(buf).digest("hex"));
  }
  const crashed = join(dir, "crashed");
  try {
    for (const f of readdirSync(crashed).sort()) feed("PC ", f.replace(REPLAY_TS_RE, "_<t>.jsonl"));
  } catch {
    /* 없으면 정상 */
  }

  // ── DB 행 (정렬, 시각·토큰·경로 마스킹) ──
  db.close?.();
  const ro = new DatabaseSync(join(dir, "site.db"), { readOnly: true });
  const rows = { games: 0, game_players: 0, live_games: 0 };
  const table = (name: keyof typeof rows, order: string) => {
    const list = ro.prepare(`SELECT * FROM ${name} ORDER BY ${order}`).all() as Record<string, unknown>[];
    rows[name] = list.length;
    for (const r of list) feed(`D ${name} `, JSON.stringify(mask(r)));
  };
  table("games", "id");
  table("game_players", "game_id, rank, nickname");
  table("live_games", "code");
  ro.close();

  // ── stats.json (파싱 → 마스킹 → 키 정렬 직렬화) ──
  await Promise.all(statsWrites);
  try {
    const raw = JSON.parse(readFileSync(join(dir, "stats.json"), "utf-8"));
    feed("S ", stableStringify(mask(raw)));
  } catch {
    feed("S ", "<none>");
  }

  const result: RunResult = {
    hash: hash.digest("hex"),
    frames: frameNo,
    views: current.views,
    replayBytes,
    rows,
  };
  if (dumpDir !== undefined) {
    mkdirSync(dumpDir, { recursive: true });
    writeFileSync(join(dumpDir, `run-${process.pid}.txt`), dump.join("\n") + "\n");
  }
  rmSync(dir, { recursive: true, force: true });
  void sockGen;
  return result;
}

function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  if (v !== null && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + stableStringify(o[k])).join(",") + "}";
  }
  return JSON.stringify(v);
}

// ───────────────────────────── --twice: 자식 둘 비교 ─────────────────────────────

function runChild(label: string): RunResult {
  const args = process.argv.slice(1).filter((a) => a !== "--twice");
  args.push("--json");
  const out = execFileSync(process.execPath, [...process.execArgv, ...args], {
    env: { ...process.env, BOT_THINK_MS: "0", AUTO_MOVE_MS: "0" },
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const line = out.trim().split("\n").pop() ?? "";
  const r = JSON.parse(line) as RunResult;
  console.error(`${label}: ${r.hash.slice(0, 24)} frames=${r.frames}`);
  return r;
}

function firstDiff(): string {
  if (dumpDir === undefined) return "(첫 차이를 보려면 --dump <dir>)";
  const files = readdirSync(dumpDir)
    .filter((f) => f.startsWith("run-"))
    .sort()
    .slice(-2);
  if (files.length < 2) return "(덤프 2개 없음)";
  const a = readFileSync(join(dumpDir, files[0]!), "utf-8").split("\n");
  const b = readFileSync(join(dumpDir, files[1]!), "utf-8").split("\n");
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      return `첫 차이 #${i}\n  A: ${(a[i] ?? "<끝>").slice(0, 400)}\n  B: ${(b[i] ?? "<끝>").slice(0, 400)}\n  경로: ${diffPaths(a[i], b[i]).join(", ")}`;
    }
  }
  return "(덤프 동일 — 해시 입력 밖의 차이)";
}

/** 두 줄이 같은 태그의 JSON 이면 달라진 키 경로를 뽑는다 (마스킹 표 확장용) */
function diffPaths(a?: string, b?: string): string[] {
  const parse = (s?: string) => {
    if (s === undefined) return undefined;
    const i = s.indexOf("{");
    if (i < 0) return undefined;
    try {
      return JSON.parse(s.slice(i));
    } catch {
      return undefined;
    }
  };
  const x = parse(a);
  const y = parse(b);
  if (x === undefined || y === undefined) return ["<json 아님>"];
  const out: string[] = [];
  const walk = (p: unknown, q: unknown, path: string) => {
    if (out.length > 20) return;
    if (typeof p !== typeof q || p === null || q === null || typeof p !== "object") {
      if (JSON.stringify(p) !== JSON.stringify(q)) out.push(path || "<root>");
      return;
    }
    const keys = new Set([...Object.keys(p as object), ...Object.keys(q as object)]);
    for (const k of keys) walk((p as Record<string, unknown>)[k], (q as Record<string, unknown>)[k], path ? `${path}.${k}` : k);
  };
  walk(x, y, "");
  return out;
}

// ───────────────────────────── main ─────────────────────────────

const started = Date.now();
if (twice) {
  const a = runChild("run A");
  const b = runChild("run B");
  const same = a.hash === b.hash;
  console.log(
    `server-golden twice ${same ? "OK 자기 일치" : "MISMATCH 불일치"}  ` +
      `A=${a.hash.slice(0, 24)} B=${b.hash.slice(0, 24)} frames=${a.frames}/${b.frames} ` +
      `games=${games} seed=${seed} mode=${mode} pace=${pace} room=${roomKind} reconnect=${reconnect} ${Date.now() - started}ms`,
  );
  if (!same) console.log(firstDiff());
  process.exit(same ? 0 : 1);
} else {
  const r = await runOnce();
  if (flag("json")) {
    console.log(JSON.stringify(r));
  } else {
    console.log(
      `server-golden ${r.hash.slice(0, 24)}  games=${games} seed=${seed} mode=${mode} pace=${pace} room=${roomKind} ` +
        `reconnect=${reconnect} frames=${r.frames} views=${r.views} replayBytes=${r.replayBytes} ` +
        `rows=${r.rows.games}/${r.rows.game_players}/${r.rows.live_games} ${Date.now() - started}ms`,
    );
  }
  process.exit(0);
}
