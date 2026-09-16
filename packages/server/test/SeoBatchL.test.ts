/**
 * SEO·설치 §L 회귀 가드 — 감사 2026-08-17 §8-2·8-4·8-6.
 *
 * 셋 다 **되돌려도 아무 테스트가 안 깨지는** 종류다. soft-404는 브라우저에서
 * 멀쩡히 로비를 보여 주고, 서비스워커가 없어도 게임은 돌고, 집계가 없어도
 * 아무도 오류를 안 본다. 그래서 여기에 못을 박는다.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { AnalyticsStore } from "../src/analytics.js";
import { cacheControlFor } from "../src/httpCache.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_INDEX = readFileSync(join(HERE, "../src/index.ts"), "utf8");
const SW = readFileSync(join(HERE, "../../client/public/sw.js"), "utf8");
const MAIN = readFileSync(join(HERE, "../../client/src/main.tsx"), "utf8");

// ─────────────── §8-2 진짜 404 ───────────────

describe("없는 주소에 진짜 404를 준다", () => {
  it("문서 요청이 아니면 SPA 폴백으로 200을 주지 않는다", () => {
    // 예전에는 `/aaa`·`/bbb`가 전부 index.html 200이었다 — 검색엔진에는 soft-404이고,
    // 오타 링크를 받은 사람은 아무 안내 없이 로비를 봤다.
    expect(SERVER_INDEX).toContain("const wantsDocument =");
    expect(SERVER_INDEX).toMatch(/if \(!wantsDocument\) \{\s*sendNotFound\(req, res\);/);
  });

  it("404 페이지는 앱 번들을 불러오지 않는다", () => {
    // 불러오면 404 하나가 번들 하나를 받아 가고, 그 번들이 앱을 띄워
    // "없는 주소인데 로비가 뜬다"가 된다.
    const at = SERVER_INDEX.indexOf("const NOT_FOUND_HTML");
    expect(at).toBeGreaterThan(0);
    const html = SERVER_INDEX.slice(at, SERVER_INDEX.indexOf("function sendNotFound"));
    expect(html).not.toContain("<script");
    expect(html).not.toContain("/assets/");
    expect(html).toContain('name="robots" content="noindex"');
    expect(html).toContain('href="/"'); // 돌아갈 길은 준다
  });

  /*
   * **헤더 «값»은 여기서 보지 않는다** — 실제 응답을 받아 보는
   * `SecurityHeaders.test.ts`가 본다. 예전에는 이 자리에서 소스 문자열로
   * `toContain('"X-Content-Type-Options": "nosniff"')` 식으로 봤는데, 그러면
   * **나열한 헤더만** 지켜진다. 실제로 404에는 `Strict-Transport-Security`가
   * 도입 시점부터 빠져 있었고 이 검사는 그걸 한 번도 잡지 못했다(감사 §L-1) —
   * 소스에 없는 줄은 문자열 검사의 시야 밖이다.
   *
   * 여기 남기는 것은 **구조**뿐이다: 세 문서 응답이 각자 헤더를 나열하지 않고
   * 한 벌을 나눠 쓰는가. 복사본이 다시 생기면 또 한쪽만 흘린다.
   */
  it("404가 문서와 같은 헤더 한 벌을 쓴다 (복사본을 만들지 않는다)", () => {
    const at = SERVER_INDEX.indexOf("function sendNotFound");
    const body = SERVER_INDEX.slice(at, at + 900);
    expect(body).toContain("...DOC_SECURITY_HEADERS");
    expect(body).toContain("writeHead(404");
    // 헤더 한 벌은 **한 자리에서만** 정의된다.
    expect(SERVER_INDEX.match(/const DOC_SECURITY_HEADERS =/g)).toHaveLength(1);
    // 그리고 문서를 내보내는 세 자리가 전부 그것을 쓴다.
    expect(SERVER_INDEX.match(/\.\.\.DOC_SECURITY_HEADERS/g)).toHaveLength(3);
  });
});

// ─────────────── §8-4 서비스워커 ───────────────

describe("설치 가능한 앱이 된다", () => {
  it("서비스워커가 fetch 핸들러를 갖는다 (설치 배너의 조건이다)", () => {
    expect(SW).toContain('addEventListener("fetch"');
  });

  it("`load` 뒤에 등록한다 (첫 화면과 대역폭을 다투지 않는다)", () => {
    expect(MAIN).toMatch(/window\.addEventListener\("load", \(\) => \{[\s\S]{0,200}register\("\/sw\.js"\)/);
  });

  it("등록 실패는 게임을 막지 않는다", () => {
    expect(MAIN).toMatch(/register\("\/sw\.js"\)\.catch\(/);
  });

  it("**문서와 이름 고정 파일은 캐시하지 않는다**", () => {
    /*
     * 이 앱은 실시간 WebSocket 게임이다. 낡은 문서를 들고 서 있으면 그건 도움이
     * 아니라 거짓말이고, 그 화면이 새 서버 프로토콜로 말을 건다.
     */
    const at = SW.indexOf("const CACHEABLE");
    const list = SW.slice(at, SW.indexOf("self.addEventListener"));
    expect(list).toContain('"/assets/"');
    expect(list).not.toContain("index.html");
    expect(list).not.toContain("manifest");
    expect(list).not.toContain("robots");
  });

  it("GET이 아닌 요청과 다른 오리진은 손대지 않는다", () => {
    expect(SW).toContain('if (req.method !== "GET") return;');
    expect(SW).toContain("if (url.origin !== self.location.origin) return;");
  });

  it("오류·부분 응답은 캐시에 담지 않는다", () => {
    // 담으면 다음 방문이 깨진 파일을 받는다.
    expect(SW).toContain("if (res.ok && res.status === 200)");
  });
});

// ─────────────── §8-6 자체 집계 ───────────────

describe("유입을 볼 눈이 생겼다 (CSP를 손대지 않고)", () => {
  it("외부 분석 스크립트를 넣지 않았다", () => {
    // CSP `script-src 'self'`를 여는 것은 곧 제3자에게 우리 화면의 실행 권한을
    // 주는 일이다 — 이 게임에는 계정과 세션 토큰이 있다.
    const html = readFileSync(join(HERE, "../../client/index.html"), "utf8");
    expect(html).not.toMatch(/<script[^>]+src="https?:\/\//);
    expect(SERVER_INDEX).toContain("script-src 'self'");
  });

  it("IP도 UA도 저장하지 않는다", async () => {
    const dir = await mkdtemp(join(tmpdir(), "majak-an-"));
    try {
      const store = new AnalyticsStore(join(dir, "a.json"));
      store.noteView("203.0.113.7", "Mozilla/5.0 (aVeryDistinctUA)");
      store.noteSocket();
      await store.flush();
      const raw = readFileSync(join(dir, "a.json"), "utf8");
      expect(raw).not.toContain("203.0.113.7");
      expect(raw).not.toContain("aVeryDistinctUA");
      // 남는 것은 수뿐이다.
      const days = JSON.parse(raw) as { views: number; visitors: number; sockets: number }[];
      expect(days[0]!.views).toBe(1);
      expect(days[0]!.visitors).toBe(1);
      expect(days[0]!.sockets).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("같은 사람은 한 번만 센다 (조회 수는 그대로 오른다)", () => {
    const store = new AnalyticsStore("/dev/null");
    store.noteView("198.51.100.1", "UA-A");
    store.noteView("198.51.100.1", "UA-A");
    store.noteView("198.51.100.2", "UA-A");
    const [day] = store.recent(1);
    expect(day!.views).toBe(3);
    expect(day!.visitors).toBe(2);
  });

  it("집계 파일에는 소금이 남지 않는다 (남기면 키로 IP를 되돌릴 수 있다)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "majak-an-"));
    try {
      const store = new AnalyticsStore(join(dir, "a.json"));
      store.noteView("192.0.2.9", "UA");
      await store.flush();
      const parsed = JSON.parse(readFileSync(join(dir, "a.json"), "utf8")) as unknown[];
      const keys = new Set(Object.keys(parsed[0] as object));
      expect([...keys].sort()).toEqual(["date", "sockets", "views", "visitors"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("관리자만 볼 수 있다", () => {
    const room = readFileSync(join(HERE, "../src/RoomManager.ts"), "utf8");
    const at = room.indexOf('case "adminAnalytics"');
    expect(at).toBeGreaterThan(0);
    expect(room.slice(at, at + 260)).toContain("if (!user.isAdmin)");
  });
});

// ─────────────── 곁들여: J의 캐시 정책이 서비스워커와 어긋나지 않는다 ───────────────

describe("서버 헤더와 서비스워커가 같은 말을 한다", () => {
  it("서비스워커가 캐시하는 경로는 서버도 캐시하라고 말한다", () => {
    for (const p of ["/assets/x.js", "/tiles/1m.png", "/sfx/a.wav"]) {
      expect(cacheControlFor(p)).toContain("public");
    }
  });

  it("문서·매니페스트는 양쪽 모두 캐시하지 않는다", () => {
    expect(cacheControlFor("/index.html")).toBe("no-cache");
    expect(cacheControlFor("/manifest.webmanifest")).toBe("no-cache");
  });
});
