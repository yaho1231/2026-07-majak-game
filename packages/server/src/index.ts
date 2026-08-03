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
import type { IncomingMessage } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { WebSocketServer } from "ws";
import { RoomManager } from "./RoomManager.js";
import { StatsStore } from "./StatsStore.js";
import { AugmentStatsStore } from "./AugmentStatsStore.js";
import { SiteDb } from "./SiteDb.js";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
// 바인드 호스트. 리버스 프록시(TLS)를 앞에 둘 때는 HOST=127.0.0.1로 로컬만 노출해
// 평문 포트가 인터넷에 직접 뜨지 않게 한다. 비우면 모든 인터페이스(직접 포트포워딩 호환).
const HOST = process.env.HOST;
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

/**
 * 신뢰 프록시 모드 — 리버스 프록시(Cloudflare Tunnel·nginx) 뒤에서 실제
 * 클라이언트 IP를 어디서 읽을지 결정한다.
 *
 *   ""(기본)     프록시 없음. 소켓의 원격 주소가 곧 클라이언트 IP(직접 노출).
 *   "cloudflare" Cloudflare가 붙이는 CF-Connecting-IP만 신뢰한다(권장).
 *   "xff"        X-Forwarded-For의 마지막 홉을 신뢰한다(일반 nginx/Caddy).
 *
 * **왜 필요한가**: 프록시 뒤에서는 모든 연결이 127.0.0.1에서 온 것처럼 보인다.
 * 그러면 IP 기반 방어(동시 연결 상한·메시지 토큰버킷·인증 무차별대입 차단)가
 * 전원에게 동일한 키를 쓰게 되어 사실상 무력화된다. 실제 IP를 복원해야 작동한다.
 */
const TRUST_PROXY = (process.env.TRUST_PROXY ?? "").trim().toLowerCase();

/**
 * WebSocket 허용 오리진(콤마 구분). 예: https://majak.yaho1231.com
 * 비우면 오리진 검사를 하지 않는다(로컬·개발 기본 — 기존 동작 유지).
 * 설정하면 목록 밖 오리진의 WS 연결을 거부해 교차 사이트 WS 하이재킹(CSWSH)과
 * 제3자 사이트에 임베드된 클라이언트의 접속을 막는다.
 */
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter((s) => s !== "");

/**
 * 하트비트 — 서버가 주기적으로 WS ping을 보내고, 다음 주기까지 pong이
 * 없으면 죽은 연결로 보고 강제 종료한다.
 *
 * **왜 필요한가**: TCP는 상대가 조용히 사라져도(전원 꺼짐·모바일 이탈·NAT 만료)
 * 소켓을 열린 채로 둔다. 이런 좀비 연결은 전체/IP별 연결 상한 슬롯과 좌석을
 * 영구 점유해, 정상 사용자를 밀어내는 자원 고갈로 이어진다.
 */
const HEARTBEAT_INTERVAL_MS = process.env.HEARTBEAT_INTERVAL_MS
  ? parseInt(process.env.HEARTBEAT_INTERVAL_MS, 10)
  : 30_000;

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
// 증강별 실전 성적 — 20판마다 티어 가중치를 자동 조정한다 (docs/25, 사용자 확정 2026-08-03)
const augmentStats = new AugmentStatsStore(
  STATS_PATH.replace(/\.json$/, "") + ".augments.json",
);
await augmentStats.load();

const db = SESSION_TTL_MS !== undefined ? new SiteDb(DB_PATH, SESSION_TTL_MS) : new SiteDb(DB_PATH);
const roomManager = new RoomManager(
  REPLAY_DIR,
  statsStore,
  INTER_ROUND_DELAY_MS,
  db,
  SIGNUP_CODE,
  augmentStats,
);

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

// 정적 응답 보안 헤더. CSP는 React 인라인 스타일(style={{…}}) 때문에 style-src에
// 'unsafe-inline'이 필요하다. connect-src에 ws/wss를 허용해 same-origin WS와
// 서버 주소 수동 지정(고급 설정)을 유지한다.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "media-src 'self'",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'none'",
].join("; ");

const httpServer = createServer((req, res) => {
  const url = (req.url ?? "/").split("?")[0] ?? "/";
  // 경로 탈출 방지 후 dist 내후로 한정
  const safePath = normalize(url).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(CLIENT_DIST, safePath);
  // 경로 탈출 차단 — CLIENT_DIST 자신 또는 그 하위(구분자 포함)만 허용해
  // 형제 디렉터리 프리픽스 우회(dist-… )도 막는다.
  if (filePath !== CLIENT_DIST && !filePath.startsWith(CLIENT_DIST + sep)) {
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
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": CSP,
  });
  const stream = createReadStream(filePath);
  // 스트림 error(EMFILE·EACCES·TOCTOU 등)에 리스너가 없으면 Node가 uncaught로
  // 프로세스를 죽인다. 응답을 끊어 요청만 실패시키고 서버는 살려 둔다.
  stream.on("error", () => res.destroy());
  stream.pipe(res);
});

// ─────────────────────────── WebSocket ───────────────────────────

/** 소켓 상대가 루프백(=같은 머신의 리버스 프록시)인지. */
function isLoopback(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

/** 헤더를 단일 문자열로 정규화 (중복 헤더는 첫 값만 취한다). */
function headerValue(raw: string | string[] | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const v = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = (v ?? "").trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * 실제 클라이언트 IP를 판정한다 — IP 기반 방어 전부(연결 상한·토큰버킷·인증
 * 무차별대입 차단)가 이 값을 키로 쓰므로 정확도가 곧 보안이다.
 *
 * 스푸핑 방지: 프록시 헤더는 **소켓 상대가 루프백일 때만** 신뢰한다. 외부에서
 * 포트에 직접 붙어 CF-Connecting-IP를 위조해도, 그 연결의 소켓 주소는 루프백이
 * 아니므로 헤더가 무시되고 진짜 원격 주소가 쓰인다.
 */
function clientIpOf(req: IncomingMessage): string {
  const socketIp = req.socket.remoteAddress ?? "unknown";
  if (TRUST_PROXY === "" || !isLoopback(socketIp)) return socketIp;

  if (TRUST_PROXY === "cloudflare") {
    // Cloudflare가 항상 덮어써 주는 헤더 — 클라이언트가 위조해도 엣지에서 교체된다.
    return headerValue(req.headers["cf-connecting-ip"]) ?? socketIp;
  }
  if (TRUST_PROXY === "xff") {
    // 마지막 홉 = 바로 앞 프록시가 붙인 값. 앞쪽 항목은 클라이언트가 위조할 수 있다.
    const xff = headerValue(req.headers["x-forwarded-for"]);
    if (xff === undefined) return socketIp;
    const hops = xff.split(",").map((s) => s.trim()).filter((s) => s !== "");
    return hops[hops.length - 1] ?? socketIp;
  }
  return socketIp;
}

// 게임 메시지는 수 KB 수준 — 100 MiB(ws 기본) 프레임으로 이벤트 루프를
// 마비시키지 못하게 상한을 둔다.
// noServer + 수동 upgrade — 오리진 검사를 핸드셰이크 단계에서 처리하기 위함.
// (자동 attach로는 101을 내준 뒤에야 거부할 수 있어 WS 세션 자원이 낭비된다.)
const wss = new WebSocketServer({ noServer: true, maxPayload: 512 * 1024 });

/** 하트비트 생존 표시 — pong을 받을 때마다 갱신된다. */
const alive = new WeakMap<object, boolean>();

httpServer.on("upgrade", (req, socket, head) => {
  // 오리진 허용목록 — 설정된 경우에만 검사한다(미설정 시 기존 동작 유지).
  // 브라우저가 붙이는 Origin은 페이지 스크립트가 위조할 수 없으므로, 제3자
  // 사이트에서 연 WS를 차단한다(CSWSH 방어). 비브라우저 클라이언트는 Origin이
  // 없어 통과하므로 이건 인증 수단이 아니다 — 인증은 계정 토큰이 담당한다.
  if (ALLOWED_ORIGINS.length > 0) {
    const origin = headerValue(req.headers.origin);
    if (origin !== undefined && !ALLOWED_ORIGINS.includes(origin)) {
      // 101을 내주기 전에 끊어 WS 세션·버퍼를 아예 할당하지 않는다.
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", (ws, req: IncomingMessage) => {
  const ip = clientIpOf(req);
  alive.set(ws, true);
  ws.on("pong", () => alive.set(ws, true));

  roomManager.handleConnection(ws, ip);
  ws.on("error", console.error);
});

// 하트비트 스윕 — 한 주기 안에 pong이 없던 연결은 죽은 것으로 보고 끊는다.
// terminate()는 close 핸드셰이크를 기다리지 않고 즉시 소켓을 정리하므로,
// 응답 없는 상대가 상한 슬롯을 계속 점유하지 못한다.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (alive.get(ws) === false) {
      ws.terminate();
      continue;
    }
    alive.set(ws, false);
    try {
      ws.ping();
    } catch {
      ws.terminate();
    }
  }
}, HEARTBEAT_INTERVAL_MS);
// 이 타이머가 프로세스 종료를 막지 않게 한다.
heartbeat.unref();

httpServer.listen(PORT, HOST, () => {
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
  console.log(
    TRUST_PROXY !== ""
      ? `신뢰 프록시 : ${TRUST_PROXY} — 실제 클라이언트 IP로 연결·요청 제한 적용`
      : `신뢰 프록시 : 꺼짐 — 소켓 원격주소를 클라이언트 IP로 사용 (프록시 뒤라면 TRUST_PROXY 설정 필수)`,
  );
  console.log(
    ALLOWED_ORIGINS.length > 0
      ? `허용 오리진 : ${ALLOWED_ORIGINS.join(", ")}`
      : `허용 오리진 : 전체 허용 (공개 배포 시 ALLOWED_ORIGINS 설정 권장)`,
  );
  console.log(`하트비트    : ${HEARTBEAT_INTERVAL_MS}ms 주기 — 무응답 연결 자동 종료`);
});
