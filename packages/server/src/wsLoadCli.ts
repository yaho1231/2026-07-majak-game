/**
 * 실제 ws 소켓 부하 측정 — `qa-lab/launch/load/loadtest.mjs`의 승격판 (QA 5라운드 C-1).
 *
 *   npm run load:ws -- --rooms 16 --seconds 60
 *   npm run load:ws -- --rooms 8 --realPlayers 4 --think 1000 --out /tmp/ws.jsonl
 *   npm run load:ws -- --attach http://127.0.0.1:3005 --rooms 4   # 이미 뜬 서버에 붙는다
 *
 * `loadCli.ts`(가짜 소켓, 같은 프로세스)와 달리 **번들 서버를 자식 프로세스로 임시 포트·
 * 임시 DB 디렉터리에 띄우고** 진짜 `ws` 클라이언트로 붙는다 — 좌석별 stringify,
 * permessage-deflate, libuv 스레드풀, 소켓 큐까지 원가에 든다(docs/55 §2-5 S-2·S-6).
 *
 * 방마다 호스트 1개가 register→createRoom→addBot×3(또는 실소켓 3개 join)→startGame.
 * 프롬프트에는 `LoadSocket.respond`와 같은 규약으로 즉답한다:
 * pass → discard → 첫 옵션, draftOffer는 첫 후보, roundOver→roundContinue,
 * gameOver→startGame(이어서 돌린다).
 *
 * 측정
 *  - 클라 쪽: ping→pong p50/p95/p99(순수 왕복), action→다음 view/prompt p50/p95/p99
 *    (봇 생각 시간이 섞이므로 규모 간 비교용), 거절(1013)·INVALID_ACTION·error 카운터,
 *    수신 프레임 종류별 개수/초.
 *  - 서버 쪽: `/healthz` perf(loop p50/p99/max·bot·heap)를 `--perf-interval`마다 GET,
 *    RSS는 `ps -o rss= -p <pid>`로 같은 주기에 샘플링(자식 모드 또는 `--pid`).
 *
 * ⚠ 공개 서버(3011)에는 절대 걸지 않는다 — `--attach`에 3011이 오면 거부한다.
 *   자식 서버는 `.majak/` 감시자 밖(임시 디렉터리, 별도 포트)에서 돌고 끝나면
 *   SIGTERM → 3초 뒤 SIGKILL 로 정리한다.
 *
 * `--deflate off`: 서버가 permessage-deflate 를 env 로 끄는 길이 없어 **클라이언트 쪽**
 *   협상만 끈다(`perMessageDeflate: false` → 서버도 그 연결엔 압축 안 함). 서버 측 zlib
 *   컨텍스트 할당 자체는 협상이 안 되면 생기지 않으므로 S-2 A/B 에 그대로 쓸 수 있다.
 */

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, appendFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

// ───────────────────────── 인자 ─────────────────────────
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function numArg(name: string, fallback: number): number {
  const v = arg(name);
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`--${name} 은 숫자여야 합니다: ${v}`);
  return n;
}
const ROOMS = numArg("rooms", 4);
const REAL_PLAYERS = numArg("realPlayers", 1) >= 4 ? 4 : 1;
const SECONDS = numArg("seconds", 30);
const PORT = numArg("port", 3000 + 400 + Math.floor(Math.random() * 500)); // 3400~3899
const THINK = arg("think"); // BOT_THINK_MS·AUTO_MOVE_MS (기본 0 = 최대 속도)
const DEFLATE = (arg("deflate") ?? "on") !== "off";
const PERF_INTERVAL_MS = numArg("perf-interval", 2000);
const ATTACH = arg("attach");
const PID_ARG = arg("pid");
const OUT = arg("out");
const KEEP_TMP = process.argv.includes("--keep-tmp");
const BATCH = numArg("batch", 10);

const __dir = dirname(fileURLToPath(import.meta.url)); // src/ 또는 dist/
const SERVER_ROOT = resolve(__dir, ".."); // packages/server

// ───────────────────────── 서버 띄우기 / 붙기 ─────────────────────────
interface ServerHandle {
  baseUrl: string;
  wsUrl: string;
  pid?: number | undefined;
  child?: ChildProcess | undefined;
  tmp?: string | undefined;
}

async function waitHealthz(baseUrl: string, timeoutMs: number): Promise<void> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(`${baseUrl}/healthz`);
      if (r.ok) return;
    } catch {
      /* 아직 안 열림 */
    }
    await sleep(100);
  }
  throw new Error(`${baseUrl}/healthz 가 ${timeoutMs}ms 안에 열리지 않았습니다`);
}

function spawnServer(): ServerHandle {
  const tmp = mkdtempSync(join(tmpdir(), "majak-wsload-"));
  // index.ts 는 REPLAY_DIR = cwd/../../replays 로 잡는다 → cwd 를 tmp/a/b 로 두면
  // 리플레이·stats.json·DB 전부 tmp/replays 아래에 격리된다.
  const cwd = join(tmp, "a", "b");
  mkdirSync(cwd, { recursive: true });
  const replayDir = join(tmp, "replays");
  mkdirSync(replayDir, { recursive: true });
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(PORT),
    HOST: "127.0.0.1",
    DB_PATH: join(replayDir, "majak.db"),
    CLIENT_DIST: join(tmp, "no-client"),
    BOT_THINK_MS: THINK ?? "0",
    AUTO_MOVE_MS: THINK ?? "0",
    SIGNUP_CODE: "",
  };
  const dist = join(SERVER_ROOT, "dist", "index.mjs");
  let cmd: string;
  let cmdArgs: string[];
  if (existsSync(dist)) {
    cmd = process.execPath;
    cmdArgs = [dist];
  } else {
    // 자식의 cwd 는 임시 디렉터리라 bare `tsx/esm` 이 안 풀린다 — 이 파일 기준으로 절대 URL 로 푼다.
    cmd = process.execPath;
    cmdArgs = ["--import", import.meta.resolve("tsx/esm"), join(SERVER_ROOT, "src", "index.ts")];
  }
  const child = spawn(cmd, cmdArgs, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  const serverLog = join(tmp, "server.log");
  child.stdout?.on("data", (d: Buffer) => appendFileSync(serverLog, d));
  child.stderr?.on("data", (d: Buffer) => appendFileSync(serverLog, d));
  child.on("exit", (code, sig) => {
    if (!stopping) console.error(`[wsload] 자식 서버가 먼저 죽었습니다 (code=${code} sig=${sig}) — ${serverLog}`);
  });
  console.log(`[wsload] 서버 자식 pid=${child.pid} ${cmdArgs[cmdArgs.length - 1]} port=${PORT} tmp=${tmp}`);
  return {
    baseUrl: `http://127.0.0.1:${PORT}`,
    wsUrl: `ws://127.0.0.1:${PORT}`,
    pid: child.pid,
    child,
    tmp,
  };
}

function attachServer(url: string): ServerHandle {
  const u = new URL(url);
  if (u.port === "3011") throw new Error("공개 서버(3011)에는 부하를 걸지 않습니다");
  const base = `${u.protocol}//${u.host}`;
  const wsUrl = base.replace(/^http/, "ws");
  return { baseUrl: base, wsUrl, pid: PID_ARG !== undefined ? Number(PID_ARG) : undefined };
}

let stopping = false;
async function stopServer(h: ServerHandle): Promise<void> {
  stopping = true;
  const child = h.child;
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = new Promise<void>((r) => child.once("exit", () => r()));
    child.kill("SIGTERM");
    const t = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }, 3000);
    await exited;
    clearTimeout(t);
  }
  if (h.tmp && !KEEP_TMP) rmSync(h.tmp, { recursive: true, force: true });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ───────────────────────── 측정 버킷 ─────────────────────────
const pingLat: number[] = [];
const actionLat: number[] = [];
const frameCounts = new Map<string, number>();
const errors: string[] = [];
let invalidAction = 0;
let errorFrames = 0;
let rejections = 0;
let gamesOver = 0;
let roundsOver = 0;
let closedUnexpected = 0;
let measuring = false;

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? NaN;
}
function quant(arr: number[]): { n: number; p50: number; p95: number; p99: number; max: number } {
  const s = [...arr].sort((a, b) => a - b);
  return { n: s.length, p50: pct(s, 50), p95: pct(s, 95), p99: pct(s, 99), max: s[s.length - 1] ?? NaN };
}

// ───────────────────────── 클라이언트 ─────────────────────────
interface Client {
  ws: WebSocket;
  username: string;
  rejected: boolean;
  lastPingAt: number | null;
}

let uid = 0;
function nextUsername(): string {
  uid += 1;
  return `W${(Date.now() % 1e6).toString(36)}${uid}`.slice(0, 12);
}

function connectPlayer(
  wsUrl: string,
  opts: { isHost: boolean; roomCode?: string; onCode?: (c: string) => void },
): Promise<Client> {
  return new Promise<Client>((resolve) => {
    const ws = new WebSocket(wsUrl, { perMessageDeflate: DEFLATE });
    const username = nextUsername();
    const client: Client = { ws, username, rejected: false, lastPingAt: null };
    let settled = false;
    let pendingActionAt: number | null = null;
    let myRoomCode = opts.roomCode ?? null;
    const settle = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(client);
    };
    const timeout = setTimeout(() => {
      errors.push(`setup timeout: ${username}`);
      settle();
    }, 20_000);
    const send = (m: unknown) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
    };

    ws.on("open", () => send({ type: "register", username, password: "wsload123!" }));
    ws.on("message", (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (measuring) frameCounts.set(msg.type, (frameCounts.get(msg.type) ?? 0) + 1);
      const now = Date.now();
      switch (msg.type) {
        case "authOk":
          if (opts.isHost) send({ type: "createRoom" });
          else {
            const tryJoin = () => {
              if (myRoomCode) send({ type: "joinRoom", code: myRoomCode });
              else setTimeout(tryJoin, 50);
            };
            tryJoin();
          }
          break;
        case "roomCreated":
          myRoomCode = msg.code;
          opts.onCode?.(msg.code);
          if (REAL_PLAYERS < 4) {
            for (let b = 0; b < 3; b++) send({ type: "addBot" });
          }
          break;
        case "lobby":
          if (!opts.isHost) send({ type: "ready", ready: true });
          if (opts.isHost && msg.canStart === true) setTimeout(() => send({ type: "startGame" }), 50);
          break;
        case "view":
        case "prompt": {
          if (pendingActionAt !== null) {
            if (measuring) actionLat.push(now - pendingActionAt);
            pendingActionAt = null;
          }
          if (msg.type === "prompt") {
            const o = (msg.prompt?.options ?? []) as any[];
            const pick = o.find((x) => x.type === "pass") ?? o.find((x) => x.type === "discard") ?? o[0];
            if (pick) {
              pendingActionAt = Date.now();
              send({ type: "action", actionType: pick.type, payload: pick.payload, seat: msg.prompt.player });
            }
          }
          break;
        }
        case "draftOffer": {
          const c = msg.choices?.[0];
          if (c) send({ type: "draftPick", stage: msg.stage, augmentId: c.id });
          break;
        }
        case "roundOver":
          if (measuring) roundsOver++;
          setTimeout(() => send({ type: "roundContinue" }), 0);
          break;
        case "gameOver":
          if (measuring) gamesOver++;
          if (opts.isHost) setTimeout(() => send({ type: "startGame" }), 0);
          break;
        case "pong":
          if (client.lastPingAt !== null) {
            if (measuring) pingLat.push(now - client.lastPingAt);
            client.lastPingAt = null;
          }
          break;
        case "error":
          if (measuring) errorFrames++;
          if (msg.code === "INVALID_ACTION" && measuring) invalidAction++;
          if (errors.length < 50) errors.push(`${username}: ${msg.code ?? ""} ${msg.message ?? ""}`);
          break;
        default:
          break;
      }
      settle();
    });
    ws.on("error", (e) => {
      errors.push(`ws error ${username}: ${e.message}`);
      settle();
    });
    ws.on("close", (code) => {
      if (!settled) {
        client.rejected = true;
        rejections++;
        settle();
      } else if (!stopping && code !== 1000) {
        closedUnexpected++;
      }
    });
  });
}

async function spinRoom(wsUrl: string): Promise<Client[]> {
  let resolveCode: (c: string) => void = () => {};
  const codeP = new Promise<string>((r) => (resolveCode = r));
  const host = await connectPlayer(wsUrl, { isHost: true, onCode: (c) => resolveCode(c) });
  const rest: Client[] = [];
  if (REAL_PLAYERS >= 4 && !host.rejected) {
    const code = await Promise.race([codeP, sleep(10_000).then(() => "")]);
    if (code !== "") {
      for (let i = 0; i < 3; i++) rest.push(await connectPlayer(wsUrl, { isHost: false, roomCode: code }));
    } else errors.push(`room code timeout: ${host.username}`);
  }
  return [host, ...rest];
}

// ───────────────────────── 서버 쪽 샘플러 ─────────────────────────
interface PerfSample {
  t: number;
  loopP50: number;
  loopP99: number;
  loopMax: number;
  botCount: number;
  botP99: number;
  botMax: number;
  heapUsed: number;
  heapRss: number;
  rssPs: number;
  wsClients: number;
  rooms: number;
}

async function samplePerf(h: ServerHandle): Promise<PerfSample | null> {
  try {
    const r = await fetch(`${h.baseUrl}/healthz`);
    const j: any = await r.json();
    const p = j.perf ?? {};
    let rssPs = NaN;
    if (h.pid !== undefined) {
      const ps = spawnSync("ps", ["-o", "rss=", "-p", String(h.pid)], { encoding: "utf8" });
      const kb = Number(ps.stdout.trim());
      if (Number.isFinite(kb)) rssPs = Math.round(kb / 1024);
    }
    return {
      t: Date.now(),
      loopP50: p.loopDelayMs?.p50 ?? NaN,
      loopP99: p.loopDelayMs?.p99 ?? NaN,
      loopMax: p.loopDelayMs?.max ?? NaN,
      botCount: p.botDecision?.count ?? 0,
      botP99: p.botDecision?.p99Ms ?? NaN,
      botMax: p.botDecision?.maxMs ?? NaN,
      heapUsed: p.heapMb?.used ?? NaN,
      heapRss: p.heapMb?.rss ?? NaN,
      rssPs,
      wsClients: j.wsClients ?? NaN,
      rooms: j.rooms ?? j.roomCount ?? NaN,
    };
  } catch (e) {
    errors.push(`healthz: ${(e as Error).message}`);
    return null;
  }
}

// ───────────────────────── 본체 ─────────────────────────
async function main(): Promise<void> {
  const h = ATTACH ? attachServer(ATTACH) : spawnServer();
  const cleanup = async () => {
    await stopServer(h);
  };
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      void cleanup().then(() => process.exit(130));
    });
  }
  const clients: Client[] = [];
  try {
    await waitHealthz(h.baseUrl, 30_000);
    // 준비 단계의 perf 창을 비운다
    await samplePerf(h);
    const t0 = Date.now();
    for (let i = 0; i < ROOMS; i += BATCH) {
      const batch: Promise<Client[]>[] = [];
      for (let j = i; j < Math.min(i + BATCH, ROOMS); j++) batch.push(spinRoom(h.wsUrl));
      for (const r of await Promise.all(batch)) clients.push(...r);
    }
    const setupMs = Date.now() - t0;
    const live = clients.filter((c) => !c.rejected).length;
    console.log(`[wsload] 방 ${ROOMS} 준비 ${setupMs}ms · 소켓 ${clients.length} (거절 ${rejections})`);

    // 측정 창
    await samplePerf(h); // 준비 중 perf 를 비운다
    measuring = true;
    const perfSamples: PerfSample[] = [];
    const perfTimer = setInterval(() => {
      void samplePerf(h).then((s) => {
        if (s) perfSamples.push(s);
      });
    }, PERF_INTERVAL_MS);
    const pingTimer = setInterval(() => {
      for (const c of clients) {
        if (c.ws.readyState === WebSocket.OPEN && c.lastPingAt === null) {
          c.lastPingAt = Date.now();
          c.ws.send(JSON.stringify({ type: "ping" }));
        }
      }
    }, 1000);
    const m0 = Date.now();
    await sleep(SECONDS * 1000);
    measuring = false;
    clearInterval(perfTimer);
    clearInterval(pingTimer);
    const final = await samplePerf(h);
    if (final) perfSamples.push(final);
    const elapsed = (Date.now() - m0) / 1000;

    // ─── 표 ───
    const ping = quant(pingLat);
    const act = quant(actionLat);
    const maxOf = (f: (s: PerfSample) => number) =>
      perfSamples.reduce((m, s) => (Number.isFinite(f(s)) && f(s) > m ? f(s) : m), 0);
    const loopP50 = perfSamples.length
      ? Math.round((perfSamples.reduce((a, s) => a + (s.loopP50 || 0), 0) / perfSamples.length) * 100) / 100
      : NaN;
    const frames = [...frameCounts.entries()].sort((a, b) => b[1] - a[1]);
    const framesPerSec = Object.fromEntries(frames.map(([k, v]) => [k, Math.round((v / elapsed) * 10) / 10]));
    const totalFrames = frames.reduce((a, [, v]) => a + v, 0);

    const row = {
      at: new Date().toISOString(),
      mode: ATTACH ? "attach" : "child",
      rooms: ROOMS,
      realPlayers: REAL_PLAYERS,
      sockets: clients.length,
      liveSockets: live,
      thinkMs: THINK === undefined ? 0 : Number(THINK),
      deflate: DEFLATE,
      seconds: Math.round(elapsed * 10) / 10,
      setupMs,
      pingP50: ping.p50,
      pingP95: ping.p95,
      pingP99: ping.p99,
      pingMax: ping.max,
      pingN: ping.n,
      actionP50: act.p50,
      actionP95: act.p95,
      actionP99: act.p99,
      actionMax: act.max,
      actionN: act.n,
      loopP50,
      loopP99Max: maxOf((s) => s.loopP99),
      loopMax: maxOf((s) => s.loopMax),
      botP99Max: maxOf((s) => s.botP99),
      botMax: maxOf((s) => s.botMax),
      botDecisions: perfSamples.reduce((a, s) => a + s.botCount, 0),
      heapUsedMax: maxOf((s) => s.heapUsed),
      rssHealthzMax: maxOf((s) => s.heapRss),
      rssPsMax: maxOf((s) => s.rssPs),
      rejections,
      invalidAction,
      errorFrames,
      closedUnexpected,
      roundsOver,
      gamesOver,
      framesTotal: totalFrames,
      framesPerSec: Math.round((totalFrames / elapsed) * 10) / 10,
      framesByType: framesPerSec,
      perfSamples: perfSamples.length,
      sampleErrors: errors.slice(0, 10),
    };

    const f = (n: number) => (Number.isFinite(n) ? String(n) : "-");
    console.log(
      [
        "",
        "| 방 | 소켓 | 실인원 | think | deflate | 초 | ping p50/p95/p99 | action p50/p95/p99 | loop p99(max)/max | bot p99/max | heap/rss(ps) MB | 거절 | INVALID | 판/국 |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
        `| ${ROOMS} | ${clients.length} | ${REAL_PLAYERS} | ${row.thinkMs} | ${DEFLATE ? "on" : "off"} | ${row.seconds} | ${f(ping.p50)}/${f(ping.p95)}/${f(ping.p99)} (n=${ping.n}) | ${f(act.p50)}/${f(act.p95)}/${f(act.p99)} (n=${act.n}) | ${f(row.loopP99Max)}/${f(row.loopMax)} | ${f(row.botP99Max)}/${f(row.botMax)} | ${f(row.heapUsedMax)}/${f(row.rssPsMax)} | ${rejections} | ${invalidAction} | ${gamesOver}/${roundsOver} |`,
        "",
        `프레임 ${totalFrames} (${row.framesPerSec}/s): ${frames.map(([k, v]) => `${k}=${v}`).join(" ")}`,
        errors.length ? `오류 ${errors.length}건 (앞 5): ${errors.slice(0, 5).join(" | ")}` : "오류 0",
      ].join("\n"),
    );
    if (OUT) {
      mkdirSync(dirname(resolve(OUT)), { recursive: true });
      appendFileSync(OUT, JSON.stringify(row) + "\n");
      console.log(`[wsload] → ${OUT}`);
    }
  } finally {
    stopping = true;
    for (const c of clients) {
      try {
        c.ws.close(1000);
      } catch {
        /* noop */
      }
    }
    await sleep(200);
    for (const c of clients) c.ws.terminate();
    await cleanup();
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
