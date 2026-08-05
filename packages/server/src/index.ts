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
import { createReadStream, existsSync, realpathSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { WebSocketServer } from "ws";
import { RoomManager, abuseKeyOf } from "./RoomManager.js";
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
 * 관리자 가입 코드를 운영자가 직접 고정한다(선택).
 *
 * 비우면 서버가 DB에 코드를 만들어 쓰고, **한 번 쓰이면 곧바로 회전한다**.
 * 설정하면 그 값을 쓰되 DB에 저장하지도 로그에 찍지도 않는다 — 값의 수명을
 * 운영자가 쥔다. 관리자 권한은 전 계정 조회·삭제, 모든 리플레이 열람, 진행 중
 * 대국 관전(전원 손패가 보이는 완전정보)이라 사실상 서버의 마스터 키다.
 */
const ADMIN_CODE = process.env.ADMIN_CODE ?? "";

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

const db = new SiteDb(DB_PATH, SESSION_TTL_MS, ADMIN_CODE);
const roomManager = new RoomManager(
  REPLAY_DIR,
  statsStore,
  INTER_ROUND_DELAY_MS,
  db,
  SIGNUP_CODE,
  augmentStats,
);

// ─────────────────────────── 정적 파일 서버 ───────────────────────────

/**
 * 동시 HTTP 소켓 상한. WS 연결 상한(300)과 별도로, 업그레이드하지 않는 평범한
 * 연결까지 포함한 TCP 소켓 총량을 묶는다. 정적 파일은 요청당 수 ms면 끝나므로
 * 정상 트래픽은 이 수에 닿지 않는다.
 */
const MAX_HTTP_SOCKETS = Number(process.env.MAX_HTTP_SOCKETS ?? 512);

/** dist의 실제 경로 — 심볼릭 링크 탈출 검사의 기준. */
const CLIENT_REAL = existsSync(CLIENT_DIST) ? realpathSync(CLIENT_DIST) : CLIENT_DIST;

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
  // 이 SPA는 폼 제출을 쓰지 않는다 — 스크립트 주입에 성공해도 자격증명을
  // 외부로 POST하는 고전적 탈출로를 하나 줄인다.
  "form-action 'none'",
].join("; ");

const httpServer = createServer((req, res) => {
  // 정적 서버는 읽기 전용이다 — GET/HEAD 외의 메서드는 본문을 읽지 않고 거절한다.
  // (예전에는 POST에도 파일을 그대로 내주었고, 본문은 소켓에 남아 다음 요청
  //  파싱과 섞일 여지가 있었다.)
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" }).end();
    req.resume(); // 남은 본문을 흘려보내 소켓을 깨끗이 비운다
    return;
  }
  const url = (req.url ?? "/").split("?")[0] ?? "/";
  // 퍼센트 인코딩을 먼저 푼다 — 안 풀면 `%2e%2e%2f`가 정규화를 그대로 통과해
  // (join 뒤 startsWith 검사가 잡긴 하지만) 방어가 우연에 기대게 된다.
  let decoded: string;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    res.writeHead(400).end();
    return;
  }
  // NUL 바이트 잘라내기(구형 경로 처리 우회) 차단.
  if (decoded.includes("\0")) {
    res.writeHead(400).end();
    return;
  }
  // 경로 탈출 방지 후 dist 내부로 한정
  const safePath = normalize(decoded).replace(/^(\.\.[/\\])+/, "");
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
  // 심볼릭 링크 탈출 차단 — dist 안에 바깥을 가리키는 링크가 (실수로든 악의로든)
  // 생기면 문자열 검사는 통과한다. 실제 경로를 풀어 한 번 더 가둔다.
  let realPath: string;
  try {
    realPath = realpathSync(filePath);
  } catch {
    res.writeHead(404).end();
    return;
  }
  if (realPath !== CLIENT_REAL && !realPath.startsWith(CLIENT_REAL + sep)) {
    res.writeHead(403).end();
    return;
  }
  res.writeHead(200, {
    "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream",
    "Cache-Control": filePath.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    // TLS는 앞단(Cloudflare/Caddy)이 종단한다 — 브라우저가 다음부터 평문으로
    // 시도조차 하지 않게 해 첫 요청 가로채기(SSL stripping) 창을 좁힌다.
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Content-Security-Policy": CSP,
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  const stream = createReadStream(realPath);
  // 스트림 error(EMFILE·EACCES·TOCTOU 등)에 리스너가 없으면 Node가 uncaught로
  // 프로세스를 죽인다. 응답을 끊어 요청만 실패시키고 서버는 살려 둔다.
  stream.on("error", () => res.destroy());
  // 클라이언트가 중간에 끊으면 열린 fd가 남지 않게 스트림도 같이 닫는다.
  res.on("close", () => stream.destroy());
  stream.pipe(res);
});

/**
 * HTTP 계층 자원 상한 — WS 쪽에는 연결 상한이 있지만, **업그레이드하지 않는
 * 평범한 TCP 연결**에는 아무 상한이 없었다. 헤더를 한 글자씩 흘려보내며 소켓을
 * 붙들고 있으면(slowloris) 파일 디스크립터가 마르고 정상 접속이 막힌다.
 */
httpServer.maxConnections = MAX_HTTP_SOCKETS;
httpServer.headersTimeout = 10_000; // 헤더를 다 보내지 않는 연결은 10초에 끊는다
httpServer.requestTimeout = 20_000;
httpServer.keepAliveTimeout = 15_000;
// 기형 HTTP 요청은 소켓만 정리한다 (Node 기본은 프로세스를 죽이지 않지만 명시한다).
httpServer.on("clientError", (_err, socket) => {
  socket.destroy();
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
function clientIpOf(req: IncomingMessage): { ip: string; local: boolean } {
  const socketIp = req.socket.remoteAddress ?? "unknown";
  const socketLocal = isLoopback(socketIp);
  if (TRUST_PROXY === "" || !socketLocal) return { ip: socketIp, local: socketLocal };

  // 헤더에서 복원한 IP는 **절대 면제 대상이 아니다**(local: false).
  //
  // ⚠ 여기가 예전에 조용히 뚫려 있던 자리다: 복원된 값이 `127.0.0.1`처럼 보이기만
  // 하면 RoomManager가 그 연결을 "로컬"로 보고 연결 상한·메시지 토큰버킷·인증
  // 무차별대입 차단·방 생성 제한을 **전부** 꺼 줬다. 프록시가 헤더를 덮어쓴다는
  // 전제 하나가 깨지면(설정 실수, xff 모드, 터널 우회) 그걸 아는 사람 하나가
  // 서버의 모든 남용 방어 바깥에 서게 된다. 이제 면제는 "소켓 상대가 진짜
  // 루프백이고 프록시 헤더를 쓰지 않았을 때"만이다.
  if (TRUST_PROXY === "cloudflare") {
    const cf = headerValue(req.headers["cf-connecting-ip"]);
    // Cloudflare가 항상 덮어써 주는 헤더 — 클라이언트가 위조해도 엣지에서 교체된다.
    return cf !== undefined ? { ip: cf, local: false } : { ip: socketIp, local: true };
  }
  if (TRUST_PROXY === "xff") {
    // 마지막 홉 = 바로 앞 프록시가 붙인 값. 앞쪽 항목은 클라이언트가 위조할 수 있다.
    const xff = headerValue(req.headers["x-forwarded-for"]);
    if (xff === undefined) return { ip: socketIp, local: true };
    const hops = xff.split(",").map((s) => s.trim()).filter((s) => s !== "");
    const last = hops[hops.length - 1];
    return last !== undefined ? { ip: last, local: false } : { ip: socketIp, local: true };
  }
  return { ip: socketIp, local: socketLocal };
}

/**
 * 신규 연결 속도 제한 — 창(ms)당 같은 버킷(IPv4 주소 / IPv6 /64)에서 열 수 있는
 * WebSocket 연결 수.
 *
 * 동시 연결 상한만으로는 **열고 즉시 닫기**를 반복하는 공격을 막지 못한다.
 * 연결 하나하나가 핸드셰이크·세션 객체·타이머를 만들므로, 초당 수천 번이면
 * 상한에 걸리지 않고도 CPU와 전역 300 슬롯의 회전율을 잠식할 수 있다.
 */
const CONN_RATE_WINDOW_MS = 10_000;
const CONN_RATE_MAX = Number(process.env.CONN_RATE_MAX ?? 40);
const connRateHits = new Map<string, number[]>();

function connRateLimited(key: string): boolean {
  const now = Date.now();
  const hits = (connRateHits.get(key) ?? []).filter((t) => now - t < CONN_RATE_WINDOW_MS);
  if (hits.length >= CONN_RATE_MAX) {
    connRateHits.set(key, hits);
    return true;
  }
  hits.push(now);
  connRateHits.set(key, hits);
  // 메모리 상한 — 창이 완전히 지난 항목을 정리한다.
  if (connRateHits.size >= 4096) {
    for (const [k, ts] of connRateHits) {
      if (ts.every((t) => now - t >= CONN_RATE_WINDOW_MS)) connRateHits.delete(k);
    }
  }
  return false;
}

// 게임 메시지는 수 KB 수준 — 100 MiB(ws 기본) 프레임으로 이벤트 루프를
// 마비시키지 못하게 상한을 둔다. 실사용 최대는 액션 payload 몇 KB이므로 64KB면
// 넉넉하다(예전 512KB는 초당 40프레임 × 512KB = 20MB/s를 JSON.parse에 태울 수 있었다).
// noServer + 수동 upgrade — 오리진 검사를 핸드셰이크 단계에서 처리하기 위함.
// (자동 attach로는 101을 내준 뒤에야 거부할 수 있어 WS 세션 자원이 낭비된다.)
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 64 * 1024,
  // 압축은 명시적으로 끈다 — 작은 프레임에 이득이 없고, 압축 해제는 보내는 쪽이
  // 싸게 만들 수 있는 비대칭 비용(zip bomb)이다.
  perMessageDeflate: false,
});

/** 하트비트 생존 표시 — pong을 받을 때마다 갱신된다. */
const alive = new WeakMap<object, boolean>();

httpServer.on("upgrade", (req, socket, head) => {
  // 연결 수립 속도 제한 — 101을 내주기 전에 자른다. 진짜 루프백(로컬 개발)은 면제.
  const who = clientIpOf(req);
  if (!who.local && connRateLimited(abuseKeyOf(who.ip))) {
    socket.write("HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
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
  const { ip, local } = clientIpOf(req);
  alive.set(ws, true);
  ws.on("pong", () => alive.set(ws, true));

  roomManager.handleConnection(ws, ip, local);
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
  // 관리자 코드는 **부트스트랩(첫 관리자가 없을 때)** 에만 찍는다.
  // 로그는 파일로 남고 어깨너머로도 보인다 — 관리자가 이미 있는 서버에서 매 부팅마다
  // 마스터 키를 찍어 둘 이유가 없다. 코드는 쓰이는 즉시 회전하므로, 새로 하나 더
  // 만들어야 하면 ADMIN_CODE 환경변수로 운영자가 직접 값을 정해 띄운다.
  if (ADMIN_CODE !== "") {
    console.log(`관리자 코드  : ADMIN_CODE 환경변수 사용 (로그·DB에 남기지 않음)`);
  } else if (!db.hasAdmin()) {
    console.log(`관리자 가입 코드: ${db.adminCode()}  (회원가입 시 입력하면 관리자 계정 — 1회용)`);
  } else {
    console.log(`관리자 코드  : 비공개 (관리자 계정 있음 · 재발급은 ADMIN_CODE 환경변수)`);
  }
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
