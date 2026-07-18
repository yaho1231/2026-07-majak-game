/**
 * @majak/server 진입점 — HTTP(클라이언트 정적 파일) + WebSocket 단일 포트.
 *
 * - GET /            → packages/client/dist의 SPA 서빙 (배포용)
 * - WS upgrade       → RoomManager.handleConnection (인증→방→게임)
 * - SQLite(replays/majak.db)에 계정·세션·게임 인덱스 저장
 * - 첫 부팅 시 관리자 가입 코드를 생성해 콘솔에 출력한다
 *
 * 배포: npm run build:client 후 npm run start -w @majak/server
 * (실서비스는 리버스 프록시로 TLS(wss) 종단을 권장 — docs/15 §6)
 *
 * 설계: docs/12_NETWORK_REPLAY.md, docs/15_ACCOUNTS_SITE.md
 */

import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { WebSocketServer } from "ws";
import { RoomManager } from "./RoomManager.js";
import { StatsStore } from "./StatsStore.js";
import { SiteDb } from "./SiteDb.js";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const REPLAY_DIR = resolve(process.cwd(), "../../replays");
const STATS_PATH = resolve(REPLAY_DIR, "stats.json");
const DB_PATH = process.env.DB_PATH ?? resolve(REPLAY_DIR, "majak.db");
const CLIENT_DIST = process.env.CLIENT_DIST ?? resolve(process.cwd(), "../client/dist");
// 국 사이 대기 상한(ms). 사람이 모두 결과 화면을 닫으면 그전에 다음 국으로
// 넘어가고, 아무도 안 닫아도(AFK·끊김) 이 상한에서 진행한다. 결과 화면은
// 클라이언트에서 5초 후 자동으로 닫히므로(컷인 포함 ≈6.3초) 상한을 그보다 넉넉히 둔다.
const INTER_ROUND_DELAY_MS = process.env.INTER_ROUND_DELAY_MS
  ? parseInt(process.env.INTER_ROUND_DELAY_MS, 10)
  : 7000;
// 세션 토큰 수명(ms). 기본 30일 (SiteDb 기본값과 동일).
const SESSION_TTL_MS = process.env.SESSION_TTL_MS
  ? parseInt(process.env.SESSION_TTL_MS, 10)
  : undefined;

// 가입 게이트 코드. 설정하면 이 코드를 아는 사람만 회원가입할 수 있다.
// 공개 배포(특히 TLS 없는 포트 노출)에서 무단 가입·계정 탐색을 막는 1차 방어.
const SIGNUP_CODE = process.env.SIGNUP_CODE ?? "";

// 안전망: 떠 있는 Promise 거부나 예외 하나가 전체 서버(모든 게임)를 죽이지
// 않게 한다. 메시지 처리·리듀서가 연결/이벤트 단위로 격리돼 있으므로,
// 로그를 남기고 프로세스를 살려 두는 편이 전원 강제 종료보다 낫다.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});

const statsStore = new StatsStore(STATS_PATH);
await statsStore.load();

const db = SESSION_TTL_MS !== undefined ? new SiteDb(DB_PATH, SESSION_TTL_MS) : new SiteDb(DB_PATH);
const roomManager = new RoomManager(REPLAY_DIR, statsStore, INTER_ROUND_DELAY_MS, db, SIGNUP_CODE);

// ─────────────────────────── 정적 파일 서버 ───────────────────────────

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const httpServer = createServer((req, res) => {
  const url = (req.url ?? "/").split("?")[0] ?? "/";
  // 경로 탈출 방지 후 dist 내부로 한정
  const safePath = normalize(url).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(CLIENT_DIST, safePath);
  if (!filePath.startsWith(CLIENT_DIST)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    // SPA 폴백 — 알 수 없는 경로는 index.html
    filePath = join(CLIENT_DIST, "index.html");
    if (!existsSync(filePath)) {
      res.writeHead(404).end("client build not found — run: npm run build:client");
      return;
    }
  }
  res.writeHead(200, {
    "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream",
    "Cache-Control": filePath.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
  });
  const stream = createReadStream(filePath);
  // 스트림 error(EMFILE·EACCES·TOCTOU 등)에 리스너가 없으면 Node가 uncaught로
  // 프로세스를 죽인다. 응답을 끊어 요청만 실패시키고 서버는 살려 둔다.
  stream.on("error", () => res.destroy());
  stream.pipe(res);
});

// ─────────────────────────── WebSocket ───────────────────────────

// 게임 메시지는 수 KB 수준 — 100 MiB(ws 기본) 프레임으로 이벤트 루프를
// 마비시키지 못하게 상한을 둔다.
const wss = new WebSocketServer({ server: httpServer, maxPayload: 512 * 1024 });
wss.on("connection", (ws) => {
  roomManager.handleConnection(ws);
  ws.on("error", console.error);
});

httpServer.listen(PORT, () => {
  console.log(`MAJAK server listening on http://localhost:${PORT} (HTTP+WS)`);
  console.log(`Client dist : ${CLIENT_DIST}${existsSync(CLIENT_DIST) ? "" : "  (없음 — 개발은 vite dev 사용)"}`);
  console.log(`Replays     : ${REPLAY_DIR}`);
  console.log(`Database    : ${DB_PATH}`);
  console.log(`관리자 가입 코드: ${db.adminCode()}  (회원가입 시 입력하면 관리자 계정)`);
  console.log(
    SIGNUP_CODE !== ""
      ? `가입 게이트 : 켜짐 — 가입 코드를 아는 사람만 회원가입 가능`
      : `가입 게이트 : 꺼짐 — 누구나 회원가입 가능 (공개 배포 시 SIGNUP_CODE 설정 권장)`,
  );
});
