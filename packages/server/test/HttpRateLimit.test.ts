/**
 * HTTP 레이트리밋 회귀 (QA 4라운드 ops P0·P1).
 *
 * 이 검사는 **진짜 서버를 띄워서** 한다. 제한이 걸리는 자리가 HTTP 핸들러 맨 앞이고,
 * 그 앞에는 프록시 판정(`clientIpOf`)이 있어서 모듈 단위로 흉내 내면 정작 중요한
 * "면제 판정과 순서"가 검증되지 않는다.
 *
 * 지키는 것 셋:
 *   1. 초대 카드(`/og/room/*`)는 같은 IP에서 창당 소수만 통과한다 — 이벤트 루프를
 *      잡아먹는 라우트가 무제한으로 열려 있으면 안 된다.
 *   2. 정적 요청도 결국 제한된다(첫 로드에 수십 개가 필요하므로 창은 넉넉하다).
 *   3. `/healthz`는 절대 제한되지 않는다 — 감시자가 1분마다 부르는 문이다.
 */
import { afterAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 3187;
const SERVER_DIR = resolve(__dirname, "..");
let child: ChildProcess | null = null;

/** 서버를 별도 포트로 띄운다 — 운영 서버는 건드리지 않는다(PID를 잡아 이 프로세스만 정리). */
async function startServer(): Promise<void> {
  const dataDir = mkdtempSync(join(tmpdir(), "majak-httprate-"));
  child = spawn(process.execPath, ["--import", "tsx/esm", "src/index.ts"], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      PORT: String(PORT),
      DB_PATH: join(dataDir, "test.db"),
      // 루프백은 기본값이면 «면제»다 — 프록시를 켜면 헤더의 IP로 평범하게 제한된다.
      TRUST_PROXY: "cloudflare",
      HTTP_RATE_MAX: "60",
      HTTP_COSTLY_RATE_MAX: "5",
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

async function statuses(path: string, n: number, ip: string): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const res = await fetch(`http://127.0.0.1:${PORT}${path}${path.includes("?") ? "&" : "?"}i=${i}`, {
      headers: { "CF-Connecting-IP": ip },
    });
    await res.arrayBuffer();
    out.push(res.status);
  }
  return out;
}

afterAll(() => {
  // 띄운 프로세스 **그것만** 정리한다.
  if (child !== null && child.pid !== undefined) process.kill(child.pid);
});

describe("HTTP IP 레이트리밋", () => {
  it("카드·정적은 창을 넘으면 429, /healthz 는 절대 막히지 않는다", async () => {
    await startServer();

    // 1. 초대 카드 — 창(5)을 넘는 순간부터 429.
    const cards = await statuses("/og/room/AAAAAA.png", 12, "198.51.100.10");
    expect(cards.filter((s) => s === 200).length).toBeLessThanOrEqual(5);
    expect(cards).toContain(429);

    // 2. 정적/문서 — 넉넉한 창(60)이지만 무한은 아니다. (dist가 없으면 404지만
    //    제한 판정은 그 앞이므로 429가 나온다.)
    const docs = await statuses("/assets/nope.js", 90, "198.51.100.11");
    expect(docs).toContain(429);

    // 3. 헬스체크 — 같은 IP로 위 창을 훌쩍 넘겨도 429가 하나도 없어야 한다.
    const health = await statuses("/healthz", 120, "198.51.100.11");
    expect(health).not.toContain(429);
  }, 60_000);
});
