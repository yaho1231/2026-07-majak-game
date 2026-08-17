/**
 * 온보딩 동선 · 연결 생존 확인 가드 (감사 2026-08-17 §2-3·2-4·3-8·3-9·5-1 대응분).
 *
 * 전부 **없어도 화면은 멀쩡해 보이는** 것들이다. 하트비트를 빼도 평소에는 아무 일이
 * 없고(회선이 조용히 죽는 날에만 드러난다), 로딩 구분을 되돌려도 빠른 회선에서는
 * 티가 안 난다. 그래서 못을 박아 둔다.
 *
 * 정적 소스 스캔이다 — 이 패키지에는 jsdom이 없다(a11yPerfGuards와 같은 방식).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, "../src/App.tsx"), "utf8");
const ROOM = readFileSync(join(HERE, "../../server/src/RoomManager.ts"), "utf8");

/** 주석을 걷어낸 코드만 — 주석에 적힌 옛 형태가 검사에 걸리지 않게 한다 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const APP_CODE = code(APP);
const ROOM_CODE = code(ROOM);

// ─────────────────── 1. 연결 생존 확인 (§2-3) ───────────────────

describe("죽은 소켓을 붙들고 있지 않는다", () => {
  it("클라이언트가 ping을 실제로 보낸다", () => {
    // 프로토콜에도 있고 서버도 답하는데 **한 번도 보내지 않던** 것이 문제였다.
    expect(APP_CODE).toMatch(/JSON\.stringify\(\{\s*type:\s*"ping"\s*\}\)/);
  });

  it("답이 없으면 우리가 먼저 끊는다 (새 복구 경로를 만들지 않는다)", () => {
    expect(APP_CODE).toContain("HEARTBEAT_TIMEOUT_MS");
    // 끊기만 하면 기존 재연결(지수 백오프)이 이어받는다.
    expect(APP_CODE).toContain("ws.close()");
  });

  it("서버 하트비트(최대 60초)보다 훨씬 빨리 알아챈다", () => {
    const interval = /HEARTBEAT_INTERVAL_MS = ([\d_]+)/.exec(APP)?.[1]?.replace(/_/g, "");
    const timeout = /HEARTBEAT_TIMEOUT_MS = ([\d_]+)/.exec(APP)?.[1]?.replace(/_/g, "");
    expect(Number(interval) + Number(timeout)).toBeLessThan(30_000);
  });

  it("연결이 닫히면 타이머를 반드시 걷는다", () => {
    // 안 걷으면 소켓마다 인터벌이 하나씩 쌓여 죽은 소켓에 계속 쏜다.
    expect(APP_CODE).toContain("stopHeartbeat()");
  });

  it("pong 을 받으면 대기 표식을 지운다", () => {
    /*
     * 이걸 빠뜨리면 **멀쩡한 연결을 스스로 끊는다.** 다음 회차가 "앞선 ping이 끝내
     * 답을 못 받았다"로 판정하기 때문이다. 실제로 그렇게 짰다가 브라우저 실측에서
     * 잡혔다 — 20초마다 끊김/재접속이 반복됐고 서버 로그에 그대로 남았다
     * (2026-08-18). 하트비트를 넣는다는 것은 곧 그 답을 처리한다는 뜻이다.
     */
    const at = APP_CODE.indexOf('msg.type === "pong"');
    expect(at, "pong 처리가 없다 — 하트비트가 멀쩡한 연결을 끊는다").toBeGreaterThan(0);
    expect(APP_CODE.slice(at, at + 200)).toContain("pingSentAtRef.current = null");
  });
});

// ─────────────────── 2. 유령 프롬프트 (§2-4) ───────────────────

describe("재접속하면 낡은 선택지가 남지 않는다", () => {
  it("joined 를 받으면 프롬프트·드래프트를 비운다", () => {
    const at = APP_CODE.indexOf('msg.type === "joined"');
    expect(at).toBeGreaterThan(0);
    const block = APP_CODE.slice(at, at + 900);
    expect(block).toContain("setPrompts({})");
    expect(block).toContain("setDraft(null)");
  });

  it("서버가 joined 를 복원 전송보다 먼저 보낸다", () => {
    // 순서가 뒤집히면 위 초기화가 **방금 복원한 프롬프트**를 지운다.
    const joinedAt = ROOM_CODE.indexOf('type: "joined", playerId: mine.id');
    const reconnectAt = ROOM_CODE.indexOf("mine.reconnect(conn.ws");
    expect(joinedAt).toBeGreaterThan(0);
    expect(reconnectAt).toBeGreaterThan(0);
    expect(joinedAt).toBeLessThan(reconnectAt);
  });
});

// ─────────────────── 3. 온보딩 동선 (§3-3·3-8·3-9) ───────────────────

describe("첫 방문자가 막히는 자리를 막지 않는다", () => {
  it("게스트 체험은 봇 난이도를 낮춰 시작한다", () => {
    const at = ROOM_CODE.indexOf("private guestPlay(");
    expect(at).toBeGreaterThan(0);
    const block = ROOM_CODE.slice(at, at + 4000);
    expect(block).toMatch(/botDifficulty:\s*"(easy|normal)"/);
  });

  it("방을 직접 만들면 기본은 그대로 봇의 최선이다", () => {
    // 게스트만 예외다 — 계정을 만들고 방을 연 사람의 기본까지 낮추면 안 된다.
    expect(ROOM_CODE).toMatch(/botDifficulty:\s*options\.botDifficulty\s*\?\?\s*"hard"/);
  });

  it("체험 뒤 '계정 만들고 계속하기'는 가입 탭으로 연다", () => {
    expect(APP_CODE).toContain('logout("register")');
    expect(APP_CODE).toContain('props.initialTab ?? "login"');
  });

  it("대기실에도 규칙·도감 단추가 있다", () => {
    const at = APP_CODE.indexOf("function WaitingRoom(props: {");
    expect(at).toBeGreaterThan(0);
    const block = APP_CODE.slice(at, at + 14000);
    expect(block).toContain("onOpenHelp");
    expect(block).toContain("onOpenCodex");
  });
});

// ─────────────────── 4. 로딩 vs 빈 상태 (§5-1) ───────────────────

describe("아직 모르는 것을 '없다'고 말하지 않는다", () => {
  it("홈 목록들이 null 로 시작한다", () => {
    for (const decl of [
      /const \[myReplays, setMyReplays\] = useState<ReplayGameSummary\[\] \| null>\(null\)/,
      /const \[liveRooms, setLiveRooms\] = useState<LiveRoomSummary\[\] \| null>\(null\)/,
      /const \[leaderboard, setLeaderboard\] = useState<LeaderboardEntry\[\] \| null>\(null\)/,
      /const \[feedback, setFeedback\] = useState<FeedbackEntry\[\] \| null>\(null\)/,
    ]) {
      expect(APP_CODE).toMatch(decl);
    }
  });

  it("세 상태를 한 곳(ListCard)에서 정한다", () => {
    expect(APP_CODE).toContain("function ListCard<T>");
    // 카드마다 제각각 분기하면 하나를 빠뜨려도 아무도 모른다.
    const uses = APP_CODE.match(/<ListCard\b/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(5);
  });

  it("로딩 문구가 빈 상태 문구와 다르게 보인다", () => {
    const css = readFileSync(join(HERE, "../src/styles.css"), "utf8");
    expect(css).toContain(".home-loading");
  });
});
