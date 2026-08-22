/**
 * 방문자 집계 `seen` 집합 상한 회귀 (QA 4라운드 ops P2).
 *
 * 방문자 키는 `sha256(소금+IP+UA)`라 **UA 헤더만 바꿔도 새 항목**이 된다. 상한이
 * 없으면 요청 하나당 항목 하나가 그날 내내 쌓여, 문서 요청 수천만 건이면 게임
 * 서버가 메모리로 함께 죽는다. 상한을 넘긴 뒤에도 **조회 수는 계속 세야** 한다 —
 * 그게 이 집계의 쓸모다.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AnalyticsStore } from "../src/analytics.js";

const dirs: string[] = [];

afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  delete process.env.ANALYTICS_SEEN_LIMIT;
});

describe("방문자 키 집합", () => {
  it("상한을 넘으면 방문자는 그만 세고 조회 수는 계속 센다", async () => {
    process.env.ANALYTICS_SEEN_LIMIT = "10";
    const dir = await mkdtemp(join(tmpdir(), "majak-analytics-"));
    dirs.push(dir);
    const store = new AnalyticsStore(join(dir, "analytics.json"));

    // UA 를 매번 바꾼다 = 매 요청이 새 키다.
    for (let i = 0; i < 100; i++) store.noteView("203.0.113.9", `UA-${i}`);

    const today = store.recent(1)[0];
    expect(today).toBeDefined();
    expect(today?.views).toBe(100);
    // 상한에서 멈춘다 — 예전에는 100이었다(무한 증가).
    expect(today?.visitors).toBe(10);
    expect((store as unknown as { seen: Set<string> }).seen.size).toBe(10);
  });
});
