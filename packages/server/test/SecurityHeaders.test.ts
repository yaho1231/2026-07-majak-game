/**
 * 응답 보안 헤더 회귀 (감사 2026-08-26 §L-1).
 *
 * **왜 진짜 서버를 띄우는가.** 이 자리를 지키던 검사는 `index.ts`를 문자열로 읽어
 * `toContain('"X-Content-Type-Options": "nosniff"')` 하는 식이었다. 그래서 그 검사가
 * 나열한 헤더만 지켜졌고, **404 응답에 `Strict-Transport-Security`가 빠진 것을
 * 도입 시점부터 한 번도 잡지 못했다** — 소스에 그 줄이 없으니 «없다»는 사실 자체가
 * 검사 대상 밖이었다. 헤더는 소스 모양이 아니라 **응답에 실제로 실려 나가는가**로
 * 검사해야 한다.
 *
 * 이 앱에는 경로 라우팅이 없다(`/`·`/index.html` 외 모든 GET이 404다). 오타·만료된
 * 초대 링크·낡은 북마크가 실질적으로 전부 404를 타므로, 그 응답이 곧 어떤 사람들의
 * **첫 접촉**이다. 거기서 HSTS를 못 심으면 그 방문은 SSL stripping 창이 열린 채로 간다.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const PORT = 3188; // HttpRateLimit.test.ts(3187)와 겹치지 않게
const SERVER_DIR = resolve(__dirname, "..");
let child: ChildProcess | null = null;

async function startServer(): Promise<void> {
  const dataDir = mkdtempSync(join(tmpdir(), "majak-headers-"));
  /*
   * **가짜 dist를 하나 세운다.** `index.html`이 없으면 서버는 문서 경로에 닿기도 전에
   * "client build not found" 404로 빠져나가고, 그 응답에는 헤더가 하나도 없다 —
   * 즉 빌드 없이 돌리면 이 테스트가 **정작 검사하려는 경로를 타지 않는다.**
   * 진짜 클라이언트를 빌드시키는 대신(느리고 이 검사와 무관하다) 최소 문서를 놓는다.
   */
  const dist = mkdtempSync(join(tmpdir(), "majak-headers-dist-"));
  writeFileSync(join(dist, "index.html"), "<!doctype html><title>t</title>", "utf8");
  child = spawn(process.execPath, ["--import", "tsx/esm", "src/index.ts"], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      PORT: String(PORT),
      DB_PATH: join(dataDir, "test.db"),
      CLIENT_DIST: dist,
      VITEST: "",
    },
    stdio: "ignore",
  });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${PORT}/healthz`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error("테스트 서버가 뜨지 않았다");
}

/*
 * 서버는 **한 번만** 띄운다. 테스트마다 띄우면 두 번째 spawn이 같은 포트에 붙지 못한 채
 * 살아남고(`child`는 마지막 것만 가리키므로) 첫 프로세스가 그대로 샌다 — 다음 실행에서
 * 그 유령이 포트를 쥐고 있어, 새로 고친 서버 대신 **낡은 서버가 대답한다.**
 */
beforeAll(() => startServer(), 60_000);

afterAll(() => {
  // 띄운 프로세스 **그것만** PID로 정리한다.
  // (넓은 패턴의 `pkill`은 2026-08-23에 운영 서버까지 잡아 사이트를 내렸다 — CLAUDE.md.)
  if (child !== null && child.pid !== undefined) process.kill(child.pid);
});

/** 문서 응답이라면 무엇이든 이 다섯을 달고 나와야 한다. */
const REQUIRED = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
} as const;

describe("문서 응답 보안 헤더", () => {
  it("없는 주소(404)도 문서와 **똑같은** 헤더를 달고 나온다", async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/그런거없음`, {
      headers: { Accept: "text/html" },
    });
    await res.arrayBuffer();

    expect(res.status).toBe(404);
    for (const [name, value] of Object.entries(REQUIRED)) {
      expect(`${name}=${res.headers.get(name)}`).toBe(`${name}=${value}`);
    }
    // CSP는 배포 설정에 따라 `connect-src`가 달라지므로 값 전체가 아니라 뼈대를 본다.
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'none'");
  }, 60_000);

  it("404와 실제 문서가 **같은 한 벌**을 쓴다 (한쪽만 흘리는 일이 없게)", async () => {
    const missing = await fetch(`http://127.0.0.1:${PORT}/없는페이지`, {
      headers: { Accept: "text/html" },
    });
    await missing.arrayBuffer();
    const doc = await fetch(`http://127.0.0.1:${PORT}/`, { headers: { Accept: "text/html" } });
    await doc.arrayBuffer();

    /*
     * 클라이언트 dist가 없으면 `/`도 404다(빌드 안 한 워크트리). 그때는 비교할 문서가
     * 없으므로 이 검사는 위 테스트로 충분하다 — 굳이 빌드를 요구하지 않는다.
     */
    if (doc.status !== 200) return;

    for (const name of Object.keys(REQUIRED)) {
      expect(`404:${name}=${missing.headers.get(name)}`).toBe(`404:${name}=${doc.headers.get(name)}`);
    }
    expect(missing.headers.get("content-security-policy")).toBe(
      doc.headers.get("content-security-policy"),
    );
  }, 60_000);
});
