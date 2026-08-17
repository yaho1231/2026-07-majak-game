/**
 * 부팅 경로 회귀 가드 (감사 2026-08-17 §2-1·2-8·3-2 대응분).
 *
 * 여기서 지키는 것들은 **평소에는 아무 증상이 없다**. 에러 바운더리는 터지기 전까지
 * 존재감이 없고, 파비콘은 없어도 게임이 돌고, localStorage 래퍼는 정상 브라우저에서
 * 맨몸 호출과 구분되지 않는다. 그래서 한 줄만 지워도 조용히 사라진다 — 못을 박아 둔다.
 *
 * 클라를 렌더하지 않는 **정적 소스 스캔**이다(이 패키지에는 jsdom이 없다).
 * 다만 storage.ts 는 순수 모듈이라 실제로 불러서 동작까지 확인한다.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p: string): string => readFileSync(join(HERE, p), "utf8");

const MAIN = read("../src/main.tsx");
const APP = read("../src/App.tsx");
const UISCALE = read("../src/uiScale.ts");
const HTML = read("../index.html");
const PUBLIC = join(HERE, "../public");

/** 주석을 걷어낸 코드만 — 주석에 적힌 옛 형태가 검사에 걸리지 않게 한다 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

// ─────────────────────── 1. 에러 바운더리 (§2-1) ───────────────────────

describe("렌더 예외가 흰 화면이 되지 않는다", () => {
  it("App이 ErrorBoundary 안에 들어 있다", () => {
    const c = code(MAIN);
    expect(c).toContain("ErrorBoundary");
    // 순서가 중요하다 — 바운더리가 App **바깥**이어야 App 어디서 터져도 잡힌다.
    expect(c.indexOf("<ErrorBoundary>")).toBeLessThan(c.indexOf("<App />"));
  });

  it("바운더리가 렌더 예외를 상태로 바꾼다", () => {
    const eb = code(read("../src/ErrorBoundary.tsx"));
    expect(eb).toContain("getDerivedStateFromError");
    expect(eb).toContain("componentDidCatch");
  });

  it("그 판에서 빠져나오는 길이 있다", () => {
    // 새로고침만으로는 못 벗어난다 — 서버가 같은 뷰를 다시 밀어 주기 때문이다.
    // 그래서 방 복귀 정보를 지우는 탈출구가 **반드시** 있어야 한다.
    const eb = code(read("../src/ErrorBoundary.tsx"));
    expect(eb).toContain("forgetLastRoom");
    expect(eb).toContain("clearAllStorage");
  });

  it("window 단위 예외도 흘리지 않는다", () => {
    const c = code(MAIN);
    expect(c).toContain('addEventListener("error"');
    expect(c).toContain('addEventListener("unhandledrejection"');
  });
});

// ─────────────────── 2. localStorage 안전 래퍼 (§2-8) ───────────────────

describe("저장소 접근이 부팅을 깨뜨리지 않는다", () => {
  it("App·uiScale이 window.localStorage를 직접 부르지 않는다", () => {
    // 쿠키 차단 브라우저에서는 **접근 자체가** SecurityError다. 렌더 경로에 하나만
    // 남아 있어도 그 브라우저에서는 첫 화면이 통째로 터진다.
    expect(code(APP)).not.toContain("window.localStorage");
    expect(code(UISCALE)).not.toContain("window.localStorage");
  });

  it("래퍼는 접근이 막혀도 던지지 않고 그 세션 동안 값을 기억한다", async () => {
    const { safeStorage } = await import("../src/storage.js");
    safeStorage.setItem("majak.__test", "v1");
    expect(safeStorage.getItem("majak.__test")).toBe("v1");
    safeStorage.removeItem("majak.__test");
    expect(safeStorage.getItem("majak.__test")).toBeNull();
  });

  it("전체 지우기가 실제로 쓰는 키를 전부 덮는다", async () => {
    const { STORAGE_KEYS } = await import("../src/storage.js");
    // 소스에 등장하는 majak.* 키가 목록에 다 들어 있어야 "처음부터"가 처음부터다.
    const used = new Set<string>();
    for (const src of [APP, UISCALE]) {
      for (const m of src.matchAll(/"(majak\.[a-zA-Z]+)"/g)) used.add(m[1] as string);
    }
    // uiScale이 부팅 때 지우는 옛 키는 이미 사라진 값이라 목록 대상이 아니다.
    used.delete("majak.uiScale");
    used.delete("majak.__probe");
    used.delete("majak.__test");
    const known = new Set<string>(STORAGE_KEYS);
    const missing = [...used].filter((k) => !known.has(k));
    expect(missing, `STORAGE_KEYS에 빠진 키: ${missing.join(", ")}`).toEqual([]);
  });
});

// ─────────────────── 3. 아이콘·공유 카드·매니페스트 (§3-2) ───────────────────

describe("링크를 붙였을 때 보여 줄 것이 있다", () => {
  const required = [
    "icon.svg",
    "favicon.ico",
    "favicon-16.png",
    "favicon-32.png",
    "apple-touch-icon.png",
    "icon-192.png",
    "icon-512.png",
    "icon-maskable-512.png",
    "og.png",
    "manifest.webmanifest",
    "robots.txt",
  ];
  for (const f of required) {
    it(`${f} 가 있다`, () => {
      expect(existsSync(join(PUBLIC, f)), `packages/client/public/${f} 가 없다`).toBe(true);
    });
  }

  it("index.html이 아이콘·매니페스트·정규주소를 건다", () => {
    expect(HTML).toContain('rel="icon"');
    expect(HTML).toContain('rel="apple-touch-icon"');
    expect(HTML).toContain('rel="manifest"');
    expect(HTML).toContain('rel="canonical"');
  });

  it("공유 카드 메타가 이미지까지 갖춘다", () => {
    expect(HTML).toContain('property="og:image"');
    expect(HTML).toContain('property="og:url"');
    expect(HTML).toContain('name="twitter:image"');
    // 이미지가 있으면 작은 정사각 썸네일(summary)로 둘 이유가 없다.
    expect(HTML).toContain('content="summary_large_image"');
  });

  it("설명에 증강 개수를 박아 두지 않는다", () => {
    // 예전에 "증강 104종"으로 박아 뒀다가 실제 113종이 되면서 공유 카드와 화면이
    // 다른 말을 했다. 화면 안 숫자는 카탈로그에서 세므로, 여기엔 숫자를 넣지 않는다.
    const desc = /<meta\s+name="description"[\s\S]*?content="([^"]*)"/.exec(HTML)?.[1] ?? "";
    expect(desc).not.toMatch(/\d+\s*종/);
  });

  it("매니페스트가 설치 가능한 최소 조건을 갖춘다", () => {
    const m = JSON.parse(readFileSync(join(PUBLIC, "manifest.webmanifest"), "utf8")) as {
      name: string;
      icons: { sizes: string; purpose?: string }[];
      display: string;
      start_url: string;
    };
    expect(m.name).toBeTruthy();
    expect(m.start_url).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.icons.some((i) => i.sizes === "192x192")).toBe(true);
    expect(m.icons.some((i) => i.sizes === "512x512")).toBe(true);
    // 안드로이드 런처가 제 마음대로 자르는 아이콘 — 없으면 흰 사각형이 덧대어진다.
    expect(m.icons.some((i) => i.purpose === "maskable")).toBe(true);
  });

  it("개발용 실험실은 색인되지 않는다", () => {
    const robots = readFileSync(join(PUBLIC, "robots.txt"), "utf8");
    for (const lab of ["fx-lab.html", "sfx-lab.html"]) {
      expect(robots).toContain(`Disallow: /${lab}`);
      // robots.txt 는 권고일 뿐이라 페이지 자체에도 박아 둔다.
      expect(readFileSync(join(PUBLIC, lab), "utf8")).toContain('name="robots"');
    }
  });

  it("스크립트가 없거나 느려도 빈 화면이 아니다", () => {
    expect(HTML).toContain("<noscript>");
    expect(HTML).toContain('class="boot"');
  });
});
