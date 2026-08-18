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
import { createReadStream, existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createGzip, gzipSync } from "node:zlib";
import { unlink } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { WebSocketServer } from "ws";
import { RoomManager, abuseKeyOf, isRoomCodeShape } from "./RoomManager.js";
import { ogCardFor } from "./ogCard.js";
import { injectInviteMeta } from "./ogMeta.js";
import { headerValue, resolveClientOrigin } from "./trustProxy.js";
import type { ClientOrigin } from "./trustProxy.js";
import { StatsStore } from "./StatsStore.js";
import { AugmentStatsStore } from "./AugmentStatsStore.js";
import { SiteDb } from "./SiteDb.js";
import { pruneOrphanReplays } from "./pruneReplays.js";

/**
 * 수치 환경변수를 **검증해서** 읽는다.
 *
 * 예전에는 `Number(process.env.X ?? 기본값)` / `parseInt(...)`를 그대로 썼다.
 * 오타 하나면 `NaN`이 되는데, 이 값들은 전부 `a > LIMIT` 꼴 비교로만 쓰여서
 * **`NaN`과의 비교는 언제나 false** — 즉 상한이 조용히 사라진다. 특히
 * `CONN_RATE_MAX`·`MAX_HTTP_SOCKETS`는 남용 방어라, 오타 하나로 방어가 꺼진
 * 채 뜨고 아무도 모른다. 주기(interval) 쪽은 반대로 `setInterval(NaN)`이
 * 즉시·반복 발화라 CPU를 태운다(2026-08-08 QA §2-10과 같은 결함 부류).
 *
 * 못 읽으면 **기본값으로 되돌리고 반드시 경고를 남긴다.** 조용히 무력화되는 것보다
 * 시끄럽게 기본값으로 도는 편이 낫다.
 */
function numEnv(name: string, fallback: number, min = 1): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min) {
    console.warn(
      `[config] ${name}="${raw}" 는 ${min} 이상의 수가 아닙니다 — 기본값 ${fallback} 을 씁니다.`,
    );
    return fallback;
  }
  return n;
}

const PORT = numEnv("PORT", 3001);
// 바인드 호스트. 리버스 프록시(TLS)를 앞에 둘 때는 HOST=127.0.0.1로 로컬만 노출해
// 평문 포트가 인터넷에 직접 뜨지 않게 한다. 비우면 모든 인터페이스(직접 포트포워딩 호환).
const HOST = process.env.HOST;
const REPLAY_DIR = resolve(process.cwd(), "../../replays");
const STATS_PATH = resolve(REPLAY_DIR, "stats.json");
const DB_PATH = process.env.DB_PATH ?? resolve(REPLAY_DIR, "majak.db");
const CLIENT_DIST = process.env.CLIENT_DIST ?? resolve(process.cwd(), "../client/dist");
/**
 * 국 사이 대기 상한(ms). 사람이 모두 결과 화면을 닫으면 그전에 다음 국으로 넘어가고,
 * 아무도 안 닫아도(AFK·끊김) 이 상한에서 진행한다.
 *
 * 결과 화면은 **스스로 닫히지 않는다** — 사람이 "다음 국으로"를 눌러야 넘어간다.
 * 그래서 이 값은 "화면이 저절로 넘어가기까지의 시간"이자, 읽을 시간을 실제로 주는
 * 유일한 예산이다. 20초는 화면 자체의 연출 예산에서 나온 값이다:
 *   화료 컷인 1.4~2.6s(결과창은 컷인 큐가 빈 뒤에 열린다)
 *   + 손패 스태거·역 스탬프 ~1.4s + 점수 카운트업(0.4s 지연 + 최대 2s) ≈ 2.4s
 *   → 그리기만 끝나도 ≈5초. 남은 ~15초가 실제로 읽고 스크롤하는 시간이다.
 * 황패유국은 네 사람의 손패를 한 화면에 싣고 `.result-panel`이 스크롤되므로
 * 이보다 짧으면 다 읽기 전에 넘어간다. (끊긴 좌석은 HumanAgent.awaitContinue가
 * 즉시 통과시키므로, 이 상한이 남은 사람들의 판을 매 국 붙잡지는 않는다.)
 */
const INTER_ROUND_DELAY_MS = numEnv("INTER_ROUND_DELAY_MS", 20000, 0);
// 세션 토큰 수명(ms). 기본 30일 (SiteDb 기본값과 동일).
const SESSION_TTL_MS = process.env.SESSION_TTL_MS
  ? numEnv("SESSION_TTL_MS", 30 * 24 * 60 * 60_000)
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
// ⚠ NaN이면 setInterval이 즉시·반복 발화해 CPU를 태운다 — 1000ms 아래는 거부한다.
const HEARTBEAT_INTERVAL_MS = numEnv("HEARTBEAT_INTERVAL_MS", 30_000, 1000);

/**
 * 모든 로그 줄 앞에 시각을 붙인다.
 *
 * **왜 여기서 console을 감싸는가**: 로그를 쓰는 자리는 서버 전체에 흩어져 있고
 * (RoomManager·봇·리플레이 writer…), 그중 어느 하나도 시각을 찍지 않았다.
 * 시각 없는 로그로는 "언제 무슨 일이 있었나"를 물을 수 없어 사실상 진단이
 * 불가능하다. 진입점에서 한 번 감싸면 모든 호출 지점이 한꺼번에 고쳐진다.
 */
function stampConsole(): void {
  const target = console as unknown as Record<string, (...args: unknown[]) => void>;
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    const original = target[level];
    if (typeof original !== "function") continue;
    target[level] = (...args: unknown[]): void => {
      original.call(console, `[${new Date().toISOString()}]`, ...args);
    };
  }
}
stampConsole();

// 안전망: 떠 있는 Promise 거부나 예외 하나가 전체 서버(모든 게임)를 죽이지
// 않게 한다. 메시지 처리·리듀서가 연결/이벤트 단위로 격리돼 있으므로,
// 로그를 남기고 프로세스를 살려 두는 편이 전원 강제 종료보다 낫다.
//
// ⚠ 삼키는 것과 숨기는 것은 다르다 (감사 2026-08-17 §2-9): 예전에는 예외를 로그로만
// 남기고 `/healthz`는 여전히 `ok: true`를 냈다. 그래서 게임 루프가 예외로 반쯤 죽은
// "좀비" 상태에서도 감시자는 정상으로 보고 아무도 개입하지 않았다. 이제 몇 번 터졌고
// 마지막이 언제였는지를 세어 상태 점검에 싣는다 — 프로세스는 계속 살리되,
// **살아 있다고 거짓말하지는 않는다**.
// 임계치는 일부러 보수적이다. 어쩌다 하나 튄 예외로 감시자가 서버를 갈아 끼우면
// 사람이 겪는 손해(진행 중 대국 전멸)가 더 크다. 5분 안에 5번이면 그건 사고다.
const HEALTH_FAULT_WINDOW_MS = 5 * 60_000;
const HEALTH_FAULT_LIMIT = 5;
const faults = { uncaught: 0, rejection: 0, lastAt: "" as string, lastMessage: "" as string };
function noteFault(kind: "uncaught" | "rejection", err: unknown): void {
  faults[kind] += 1;
  faults.lastAt = new Date().toISOString();
  faults.lastMessage = err instanceof Error ? err.message : String(err);
}
process.on("unhandledRejection", (reason) => {
  noteFault("rejection", reason);
  console.error("Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (err) => {
  noteFault("uncaught", err);
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
const MAX_HTTP_SOCKETS = numEnv("MAX_HTTP_SOCKETS", 512);

/**
 * `/healthz`를 외부에도 열지 (기본 꺼짐 — 이 머신에서 직접 온 요청에만 답한다).
 * 외부 감시 도구(UptimeRobot 등)를 붙여야 할 때만 1로 켠다.
 */
const HEALTHZ_PUBLIC = (process.env.HEALTHZ_PUBLIC ?? "") === "1";

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

/**
 * 압축해서 보낼 확장자.
 *
 * **왜** (감사 2026-08-17 §7-2): 정적 파일이 전부 무압축으로 나갔다 — styles.css
 * 175KB, 번들 JS 489KB가 원본 그대로였다. 이 종류의 텍스트는 gzip으로 4~6배 줄어든다
 * (실측: CSS 175→36KB, JS 489→171KB). 그동안 브라우저는 매번 다섯 배를 받았다.
 *
 * 이미 압축된 것(png·woff2·ico)은 목록에 없다 — 다시 압축하면 CPU만 쓰고 크기는
 * 오히려 늘거나 그대로다.
 */
const COMPRESSIBLE = new Set([".html", ".js", ".css", ".json", ".svg", ".txt", ".webmanifest"]);

/**
 * 이 응답을 압축해서 보낼 것인가 — 클라이언트가 받겠다고 했고, 압축이 이득인 종류이고,
 * 아주 작지 않을 때(작은 파일은 헤더 오버헤드가 이득을 먹는다).
 */
/**
 * 질의문자열에서 초대 코드를 꺼낸다 — 방 코드 꼴이 아니면 없는 것으로 본다.
 * (여기서 나온 값은 HTML 에 그대로 박히므로, 꼴 검사가 곧 이스케이프다.)
 */
function roomParamOf(query: string): string | null {
  for (const part of query.split("&")) {
    if (!part.startsWith("room=")) continue;
    try {
      const value = decodeURIComponent(part.slice(5));
      return isRoomCodeShape(value) ? value : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * index.html 원본 — 초대 메타를 갈아 끼우려면 통째로 들고 있어야 한다.
 * 배포로 파일이 바뀌면 mtime 이 달라져 다시 읽는다.
 */
let indexCache: { mtimeMs: number; html: string } | null = null;
function indexHtml(path: string): string {
  const mtimeMs = statSync(path).mtimeMs;
  if (indexCache === null || indexCache.mtimeMs !== mtimeMs) {
    indexCache = { mtimeMs, html: readFileSync(path, "utf8") };
  }
  return indexCache.html;
}

/**
 * 해시가 붙지 않은 정적 파일을 **재검증만 하고 재다운로드는 안 하게** 만든다
 * (감사 2026-08-17 §7-11).
 *
 * 예전에는 `/assets/`(빌드 해시 있음)만 1년 immutable이고 나머지는 전부
 * `no-cache`였다. 그런데 나머지에 **타일 PNG 37장과 효과음**이 들어 있다 —
 * 매 방문마다 조건부 요청 37개가 나갔고, 모바일 회선에서는 그 왕복이 곧
 * 첫 화면 지연이다.
 *
 * 셋으로 가른다.
 *
 * | 무엇 | 정책 | 왜 |
 * |---|---|---|
 * | `/assets/` | 1년 immutable | 파일 이름에 내용 해시가 있다. 바뀌면 이름이 바뀐다 |
 * | 타일·효과음·아이콘 | 1일 + `stale-while-revalidate` | 이름이 고정이라 immutable은 못 쓴다. 바뀌어도 하루면 퍼지고, 그 사이에도 화면은 뜬다 |
 * | 나머지(html·manifest·robots) | `no-cache` | 배포 즉시 바뀌어야 하는 것들 |
 *
 * ⚠ **immutable을 주면 안 된다.** 이 파일들은 이름이 고정이라, 한 번 잘못 준
 * 1년짜리 캐시는 그 브라우저에서 되돌릴 방법이 없다. 실제로 이 저장소는
 * `public/` 손수 작성 파일이 Cloudflare 캐시에 4시간 갇히는 문제를 이미 겪었다.
 */
const LONG_CACHE_DIRS = ["/tiles/", "/sfx/", "/icons/", "/brand/"] as const;
export function cacheControlFor(filePath: string): string {
  if (filePath.includes("/assets/")) return "public, max-age=31536000, immutable";
  if (LONG_CACHE_DIRS.some((d) => filePath.includes(d))) {
    // 하루가 지나면 백그라운드에서 다시 받아 오되, 그동안 화면은 옛것으로 즉시 뜬다.
    return "public, max-age=86400, stale-while-revalidate=604800";
  }
  return "no-cache";
}

function encodingFor(req: IncomingMessage, ext: string, size: number): "gzip" | null {
  if (!COMPRESSIBLE.has(ext)) return null;
  if (size < 1024) return null;
  const accept = String(req.headers["accept-encoding"] ?? "");
  return /\bgzip\b/.test(accept) ? "gzip" : null;
}

/**
 * `connect-src` 목록 — 이 페이지의 스크립트가 접속할 수 있는 곳.
 *
 * **왜 좁히는가** (감사 2026-08-12 §L-3). 예전에는 `'self' ws: wss:` 였다 — 즉
 * **아무 WebSocket 서버로나** 연결할 수 있었다. `form-action 'none'`으로 폼 경로는
 * 이미 닫아 두었으므로, 스크립트 주입에 성공했을 때 자격증명을 밖으로 내보내는
 * 마지막 통로가 바로 여기였다.
 *
 * 그렇다고 `'self'` 하나로 못 줄인다: 고급 설정의 "서버 주소 수동 지정"과 vite dev
 * 서버(5170번대 → ws://localhost:3001)가 막힌다. 그래서 **실제로 필요한 곳만** 적는다.
 *
 * - `ALLOWED_ORIGINS`가 설정된 공개 배포: 그 오리진의 ws/wss + 로컬 개발 주소만.
 *   (`'self'`가 same-origin ws를 덮는지는 브라우저마다 역사가 갈려 명시적으로 적는다.)
 * - 비어 있는 로컬·개발: 종전대로 열어 둔다 — 여기서 조이면 개발이 막히고,
 *   로컬 페이지에서 나갈 자격증명도 없다.
 *
 * 원격 서버를 수동 지정해야 하면 `CONNECT_SRC_EXTRA`에 콤마로 적는다.
 */
const CONNECT_SRC_EXTRA = (process.env.CONNECT_SRC_EXTRA ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter((s) => s !== "");

function buildConnectSrc(): string {
  if (ALLOWED_ORIGINS.length === 0 && CONNECT_SRC_EXTRA.length === 0) {
    return "connect-src 'self' ws: wss:"; // 로컬·개발 기본 (종전 동작)
  }
  const out = new Set<string>(["'self'"]);
  for (const origin of ALLOWED_ORIGINS) {
    out.add(origin);
    // https://x → wss://x, http://x → ws://x
    out.add(origin.replace(/^http/, "ws"));
  }
  // vite dev·로컬 서버 수동 지정은 남겨 둔다 (밖으로 나가는 통로가 아니다).
  out.add("ws://localhost:*");
  out.add("ws://127.0.0.1:*");
  for (const extra of CONNECT_SRC_EXTRA) out.add(extra);
  return `connect-src ${[...out].join(" ")}`;
}

// 정적 응답 보안 헤더. CSP는 React 인라인 스타일(style={{…}}) 때문에 style-src에
// 'unsafe-inline'이 필요하다.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "media-src 'self'",
  "font-src 'self' data:",
  buildConnectSrc(),
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
  const rawUrl = req.url ?? "/";
  const queryAt = rawUrl.indexOf("?");
  const url = (queryAt === -1 ? rawUrl : rawUrl.slice(0, queryAt)) || "/";
  const query = queryAt === -1 ? "" : rawUrl.slice(queryAt + 1);
  /**
   * 초대 카드 — `/og/room/<코드>.png`. 코드마다 다른 그림이라 그 자리에서 그린다
   * (자세한 이유는 ogCard.ts). 방이 실제로 있는지는 **묻지 않는다** — 크롤러는
   * 링크를 붙인 직후에 오는데 그때 방이 살아 있으리라는 보장이 없고, 방 존재
   * 여부를 응답으로 흘리면 코드 대입 탐색기가 생긴다.
   */
  const cardMatch = /^\/og\/room\/([^/]+)\.png$/.exec(url);
  if (cardMatch !== null) {
    const code = cardMatch[1] as string;
    if (!isRoomCodeShape(code)) {
      res.writeHead(404).end();
      return;
    }
    const png = ogCardFor(code);
    res.writeHead(200, {
      "Content-Type": "image/png",
      "Content-Length": png.length,
      // 코드마다 주소가 다르고 그림은 영원히 같다 — 크롤러가 다시 받아 갈 이유가 없다.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(req.method === "HEAD" ? undefined : png);
    return;
  }
  /**
   * 상태 점검 — 정적 파일만 서빙하던 시절에는 감시 도구가 "HTML이 돌아온다"까지만
   * 확인할 수 있었다. 그건 WS 계층이나 게임 루프가 살아 있다는 증거가 아니다.
   * 여기서는 방·연결 **개수만** 낸다(개인정보 없음).
   */
  if (url === "/healthz") {
    /**
     * 상태 점검은 **이 머신에서 직접 온 요청에만** 답한다 (감사 2026-08-12 §L-1).
     *
     * 담는 값에 개인정보는 없지만, 연결 수·익명 수·방 수·진행 중 게임 수는 자원
     * 고갈 공격자에게 **"내가 슬롯을 몇 개나 먹었는지"를 실시간으로 보여 주는
     * 계기판**이 된다. 이걸 여는 대가로 얻는 것은 없다 — 실제 사용자는
     * `deploy/serve.sh health`와 `watchdog.sh`뿐이고 둘 다 127.0.0.1로 부른다.
     *
     * 없는 경로처럼 404를 준다(403은 "여기 뭔가 있다"를 알려 준다).
     * 외부 감시 도구를 붙여야 하면 HEALTHZ_PUBLIC=1로 되돌릴 수 있다.
     */
    if (!HEALTHZ_PUBLIC && !clientIpOf(req).direct) {
      res.writeHead(404).end();
      return;
    }
    // 최근 창 안에서 예외가 임계치를 넘으면 `ok: false`다. 감시자는 이 값을 보고
    // "응답은 오는데 정상이 아니다"를 구분할 수 있다 — 예전에는 그럴 수 없었다.
    const faultsRecent =
      faults.lastAt !== "" && Date.now() - Date.parse(faults.lastAt) < HEALTH_FAULT_WINDOW_MS;
    const degraded = faultsRecent && faults.uncaught + faults.rejection >= HEALTH_FAULT_LIMIT;
    const body = JSON.stringify({
      ok: !degraded,
      uptimeSec: Math.round(process.uptime()),
      wsClients: wss.clients.size,
      faults: {
        uncaught: faults.uncaught,
        rejection: faults.rejection,
        ...(faults.lastAt === "" ? {} : { lastAt: faults.lastAt, lastMessage: faults.lastMessage }),
      },
      ...roomManager.healthSnapshot(),
    });
    res.writeHead(degraded ? 500 : 200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(req.method === "HEAD" ? undefined : body);
    return;
  }
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
  /**
   * 초대 링크(`/?room=<코드>`)로 온 HTML — 공유 카드 메타만 갈아 끼워 내준다.
   *
   * 크롤러는 스크립트를 돌리지 않으므로 클라이언트가 나중에 `<meta>` 를 고쳐 봐야
   * 소용이 없다. 갈아 끼우는 자리는 ogMeta.ts 에 적어 두었다.
   */
  const inviteCode = roomParamOf(query);
  if (inviteCode !== null && realPath.endsWith(sep + "index.html")) {
    const body = Buffer.from(injectInviteMeta(indexHtml(realPath), inviteCode), "utf8");
    const gzipped = /\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""));
    const out = gzipped ? gzipSync(body) : body;
    res.writeHead(200, {
      "Content-Type": MIME[".html"] as string,
      "Content-Length": out.length,
      "Cache-Control": "no-cache",
      Vary: "Accept-Encoding",
      ...(gzipped ? { "Content-Encoding": "gzip" } : {}),
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      "Content-Security-Policy": CSP,
    });
    res.end(req.method === "HEAD" ? undefined : out);
    return;
  }
  const ext = extname(filePath);
  const encoding = encodingFor(req, ext, statSync(realPath).size);
  res.writeHead(200, {
    "Content-Type": MIME[ext] ?? "application/octet-stream",
    "Cache-Control": cacheControlFor(filePath),
    // 압축 여부가 Accept-Encoding에 따라 갈리므로 중간 캐시가 섞지 않게 알린다.
    Vary: "Accept-Encoding",
    ...(encoding === null ? {} : { "Content-Encoding": encoding }),
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
  if (encoding === "gzip") {
    // 요청마다 압축한다. 캐시를 두지 않는 이유: 해시 붙은 에셋은 브라우저가 1년간
    // 다시 안 받아 가고(immutable), 이 규모에서 gzip 한 번은 수 ms다. 메모리 캐시를
    // 얹으면 무효화 규칙이 새로 생기는데, 그 복잡도가 이득보다 크다.
    const gz = createGzip();
    gz.on("error", () => res.destroy());
    res.on("close", () => gz.destroy());
    stream.pipe(gz).pipe(res);
    return;
  }
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

/** 신뢰 프록시 헤더가 빠진 채 들어온 연결을 알린 마지막 시각 — 로그 폭주 방지용. */
let missingProxyHeaderWarnedAt = 0;
const PROXY_WARN_INTERVAL_MS = 60_000;

/**
 * 실제 클라이언트 IP와 신뢰 등급을 판정한다 (판정 규칙은 `trustProxy.ts`가 단일 진실).
 *
 * 여기서는 그 결과에 **로그 부작용만** 얹는다: `TRUST_PROXY`를 켜 두었는데 그 헤더가
 * 없는 연결은 프록시 설정이 깨졌다는 유일한 신호이므로 반드시 알려야 하는데,
 * 매 연결마다 찍으면 로그가 잠기므로 1분에 한 줄로 접는다.
 */
function clientIpOf(req: IncomingMessage): ClientOrigin {
  const who = resolveClientOrigin(
    { socketIp: req.socket.remoteAddress, headers: req.headers },
    TRUST_PROXY,
  );
  if (who.missingHeader !== null) {
    const now = Date.now();
    if (now - missingProxyHeaderWarnedAt >= PROXY_WARN_INTERVAL_MS) {
      missingProxyHeaderWarnedAt = now;
      console.warn(
        `[proxy] TRUST_PROXY=${TRUST_PROXY} 인데 ${who.missingHeader} 헤더가 없는 연결이 ` +
          `들어왔습니다 — 프록시 설정을 확인하세요. 이 연결은 소켓 주소로 제한을 겁니다(면제 없음).`,
      );
    }
  }
  return who;
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
const CONN_RATE_MAX = numEnv("CONN_RATE_MAX", 40);
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
  /*
   * **나가는 프레임만 압축한다** (감사 2026-08-17 §7-7).
   *
   * 예전 근거는 "작은 프레임에 이득이 없다"였는데, 그 전제가 틀렸다. 이 서버가
   * 가장 많이 보내는 프레임은 `view`이고 중반 이후 한 개가 수 KB~10KB대다.
   * 게다가 **극도로 반복적인 JSON**이다 — 같은 키 이름 수백 개, 같은 타일
   * 구조가 34종씩. deflate가 가장 잘 먹는 모양이고, 그것이 국마다 수백 번
   * 브로드캐스트된다.
   *
   * 우려의 절반은 그대로 유효했다: 압축 해제는 **보내는 쪽이 싸게 만들 수 있는
   * 비대칭 비용**이다(zip bomb). 그래서 방향을 갈랐다.
   *
   * - `zlibDeflateOptions` — 우리가 보내는 쪽. level 6은 기본값이고, memLevel을
   *   낮춰 연결당 메모리를 줄인다(300 연결 × 컨텍스트라 이쪽이 실제 비용이다).
   * - `clientNoContextTakeover: true` — 클라이언트가 압축 컨텍스트를 이어 가지
   *   못하게 한다. 이어 가면 작은 프레임 하나로 큰 사전을 참조하는 증폭이 가능하다.
   * - `threshold` — 이보다 작은 프레임은 그냥 보낸다. `pong`·`promptCancel`처럼
   *   짧은 프레임에 압축을 걸면 헤더가 본문보다 커진다.
   * - `maxPayload`(64KB)는 그대로다. 압축 해제 결과가 이 값을 넘으면 ws가 끊는다 —
   *   zip bomb의 실질적 상한이 이것이다.
   */
  perMessageDeflate: {
    zlibDeflateOptions: { level: 6, memLevel: 7 },
    clientNoContextTakeover: true,
    serverNoContextTakeover: false,
    threshold: 1024,
  },
});

/** 하트비트 생존 표시 — pong을 받을 때마다 갱신된다. */
const alive = new WeakMap<object, boolean>();

httpServer.on("upgrade", (req, socket, head) => {
  // 연결 수립 속도 제한 — 101을 내주기 전에 자른다. 진짜 루프백(로컬 개발)은 면제.
  const who = clientIpOf(req);
  if (!who.exempt && connRateLimited(abuseKeyOf(who.ip))) {
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
  const { ip, exempt } = clientIpOf(req);
  alive.set(ws, true);
  ws.on("pong", () => alive.set(ws, true));

  roomManager.handleConnection(ws, ip, exempt);
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

/**
 * 운영자가 정한 비밀이 약하면 부팅 때 크게 알린다 (감사 2026-08-12 §M-4).
 *
 * **왜 거부하지 않고 경고인가**: 이 값들을 서버가 마음대로 바꾸면 이미 코드를 받아 둔
 * 사람들이 한꺼번에 가입하지 못하게 된다 — 교체 시점은 운영자가 정해야 한다. 대신
 * 부팅 로그에서 절대 놓칠 수 없게 만든다.
 *
 * 가입 코드는 이 서비스에서 계정 공간을 지키는 1차 방어선이다. 통과하면 리더보드·
 * 제보 게시판·리플레이 목록·방 생성이 열리고, 비싼 조회도 그때부터 쏠 수 있다.
 * 게다가 **초대받은 사람 전원이 아는 공유 비밀**이라 대화방·스크린샷으로 새기 쉽고,
 * 샜다는 사실을 알 방법도 회전할 방법도 없다 — 그래서 길이가 곧 수명이다.
 */
const MIN_SECRET_LEN = 16;
/** 문서·샘플에 실려 있어 사실상 공개된 값들. */
const SAMPLE_SECRETS = new Set(["change-me", "changeme", "password", "majak", "test"]);

function warnWeakSecrets(): void {
  const complain = (name: string, extra: string): void => {
    console.warn(
      `⚠ [보안] ${name} 가 ${extra} — 새 값으로 바꾸세요.\n` +
        `         생성: openssl rand -base64 24\n` +
        `         적용: deploy/majak.env 의 ${name} 수정 후 npm run serve:restart`,
    );
  };
  if (SIGNUP_CODE !== "") {
    if (SAMPLE_SECRETS.has(SIGNUP_CODE.toLowerCase())) {
      complain("SIGNUP_CODE", "샘플 파일의 값 그대로입니다(공개된 값)");
    } else if (SIGNUP_CODE.length < MIN_SECRET_LEN) {
      complain(
        "SIGNUP_CODE",
        `${SIGNUP_CODE.length}자로 너무 짧습니다(권장 ${MIN_SECRET_LEN}자 이상)`,
      );
    }
  }
  if (ADMIN_CODE !== "" && ADMIN_CODE.length < MIN_SECRET_LEN) {
    // 관리자 권한은 전 계정 조회·삭제 + 모든 리플레이 열람 + 진행 중 대국 관전
    // (전원 손패가 보이는 완전정보) — 사실상 이 서버의 마스터 키다.
    complain(
      "ADMIN_CODE",
      `${ADMIN_CODE.length}자로 너무 짧습니다 — 이 값은 사실상 서버의 마스터 키입니다`,
    );
  }
}

httpServer.listen(PORT, HOST, () => {
  console.log(`이능마작 server listening on http://localhost:${PORT} (HTTP+WS)`);
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
  warnWeakSecrets();
  console.log(
    TRUST_PROXY !== ""
      ? `신뢰 프록시 : ${TRUST_PROXY} — 실제 클라이언트 IP로 제한 적용 · 면제 대상 없음`
      : `신뢰 프록시 : 꺼짐 — 소켓 원격주소를 클라이언트 IP로 사용 (프록시 뒤라면 TRUST_PROXY 설정 필수)`,
  );
  console.log(
    ALLOWED_ORIGINS.length > 0
      ? `허용 오리진 : ${ALLOWED_ORIGINS.join(", ")}`
      : `허용 오리진 : 전체 허용 (공개 배포 시 ALLOWED_ORIGINS 설정 권장)`,
  );
  console.log(`하트비트    : ${HEARTBEAT_INTERVAL_MS}ms 주기 — 무응답 연결 자동 종료`);
});

// ─────────────────────────── 오래된 리플레이 정리 ───────────────────────────

/**
 * 리플레이 보존 기간(일). `games` 행과 `.jsonl` 파일은 지금까지 아무도 지우지
 * 않아 영원히 쌓이기만 했다. 0이면 정리하지 않는다(기존 동작).
 * 기본값은 넉넉하게 잡는다 — 판이 사라지는 것은 되돌릴 수 없다.
 */
const GAME_RETENTION_DAYS = numEnv("GAME_RETENTION_DAYS", 365);

async function pruneOldReplays(): Promise<void> {
  if (!Number.isFinite(GAME_RETENTION_DAYS) || GAME_RETENTION_DAYS <= 0) return;
  const cutoffMs = Date.now() - GAME_RETENTION_DAYS * 86_400_000;
  const cutoff = new Date(cutoffMs).toISOString();
  try {
    const paths = db.pruneGamesBefore(cutoff);
    let removed = 0;
    for (const p of paths) {
      try {
        await unlink(p);
        removed++;
      } catch {
        // 이미 없는 파일 — 인덱스만 지우면 된다
      }
    }
    /*
     * 인덱스에 없는 `.jsonl`도 함께 쓸어 담는다.
     *
     * 위 루프는 `games` 행이 가리키는 파일만 지운다. 그런데 파일은 게임 시작 때
     * 열리고 행은 정상 종료 때만 생기므로, SIGKILL·서버 재시작으로 끊긴 판은
     * 행 없는 파일만 남긴다 — 열어 볼 길도 없고 지워지지도 않는 고아다.
     * (무효·예외·시작 실패는 ReplayWriter.discard()가 그 자리에서 지운다.)
     */
    const orphans = await pruneOrphanReplays(REPLAY_DIR, db.allReplayPaths(), cutoffMs);
    if (paths.length === 0 && orphans.removed === 0) return;
    console.log(
      `리플레이 정리: 게임 ${paths.length}건 · 파일 ${removed}개 · 고아 ${orphans.removed}개 삭제 (${GAME_RETENTION_DAYS}일 이전)`,
    );
  } catch (err) {
    console.error("리플레이 정리 실패:", err);
  }
}

/*
 * 끊긴 대국 이어하기 (감사 §2-10, 사용자 결정 "완전 이어하기").
 *
 * **리플레이 정리보다 먼저** 돌린다. 정리는 인덱스에 없는 `.jsonl`을 보존 기간
 * 기준으로 지우는데, 되살릴 판의 파일이 바로 그 "인덱스에 없는 파일"이다.
 * 보존 기간(기본 365일)이 훨씬 길어 실제로 겹칠 일은 없지만, 순서가 곧 의도다.
 *
 * `await` 하지 않고 띄운다 — 되살리기가 늦어져도 서버는 지금 열려 있어야 한다.
 * 사람들이 돌아오는 데는 어차피 몇 초가 걸리고, 그 사이 방이 서면 된다.
 */
void roomManager.restoreLiveGames().catch((err: unknown) => {
  console.error("끊긴 대국 이어하기 실패:", err);
});

void pruneOldReplays();
// 하루에 한 번 — 오래 켜 두는 서버에서도 계속 정리된다.
const pruneTimer = setInterval(() => void pruneOldReplays(), 24 * 60 * 60 * 1000);
pruneTimer.unref();

// ─────────────────────────── 정상 종료 ───────────────────────────

/**
 * SIGTERM/SIGINT — 배포 스크립트(`scripts/majak.sh stop`)가 보내는 신호다.
 *
 * 예전에는 핸들러가 아예 없었다. 그래서 재시작 때마다 진행 중이던 반장전이
 * **아무 말 없이** 사라졌다: 사람들은 `gameAborted`도 못 받고 소켓만 끊겨
 * 무한 재접속을 돌다가 `ROOM_NOT_FOUND`를 받았고, `games` 행이 쓰이지 않아
 * 40분짜리 판이 리플레이 목록·리더보드 어디에도 남지 않았다.
 *
 * 여기서 하는 일은 세 가지다 — (1) 사람들에게 알리고, (2) 통계 저장소의
 * 대기 중인 쓰기를 **끝까지 기다리고**(AugmentStatsStore.queueSave는
 * 불붙여 놓고 잊는 방식이라 기다려 주지 않으면 마지막 판의 집계가 날아간다),
 * (3) 소켓·서버를 닫고 나간다.
 */
let shuttingDown = false;
async function gracefulShutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} 수신 — 정상 종료를 시작한다`);
  // 강제 탈출 밧줄: 어떤 이유로든 정리가 끝나지 않아도 프로세스는 반드시 나간다
  // (여기서 매달리면 배포 스크립트가 4초 뒤 SIGKILL로 잘라 정리가 무의미해진다).
  const bail = setTimeout(() => {
    console.error("정상 종료가 지연됐다 — 강제 종료한다");
    process.exit(1);
  }, 3_000);
  bail.unref();

  try {
    clearInterval(heartbeat);
    // 리플레이가 **디스크에 다 나갈 때까지** 기다린다 — 그 꼬리가 곧 다음 부팅의
    // 이어하기가 읽을 "어디까지 뒀는가"다 (§2-10). 기다리지 않으면 마지막 몇 줄이
    // 사라지고, 되살린 판이 몇 수 전으로 되돌아간다.
    const flushed = roomManager.shutdown();
    // 알림 프레임이 실제로 나가도록 한 틱 양보한 뒤 소켓을 닫는다.
    await Promise.all([flushed, new Promise((r) => setTimeout(r, 100))]);
    for (const ws of wss.clients) {
      try {
        ws.close(1001, "server restarting");
      } catch {
        /* 이미 닫힘 */
      }
    }
    await Promise.allSettled([statsStore.flush(), augmentStats.flush()]);
    wss.close();
    httpServer.close();
    console.log("정상 종료 완료");
  } catch (err) {
    console.error("정상 종료 중 오류:", err);
  }
  clearTimeout(bail);
  process.exit(0);
}

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    void gracefulShutdown(sig);
  });
}
