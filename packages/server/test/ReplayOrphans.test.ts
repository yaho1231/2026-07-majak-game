/**
 * 고아 리플레이 — 인덱스에 없는 `.jsonl`이 디스크에 남지 않는다.
 *
 * 리플레이 파일은 게임 시작 때 열리지만 `games` 인덱스 행은 **정상 종료 때만**
 * 만들어진다(`recordGame`). 무효·예외·시작 실패·재시작으로 끝난 판은 설계상
 * 기록하지 않으므로 행이 없고, `pruneOldReplays`는 행이 가리키는 파일만 지운다.
 * 그래서 그 파일들은 열어 볼 길도 없고 지워지지도 않았다 — 2026-08-11 운영 서버
 * 실측으로 `replays/` 425개 중 292개(4.9MB)가 그런 고아였다.
 *
 * 막는 방법은 두 겹이다:
 * 1. 기록하지 않을 게임은 그 자리에서 `ReplayWriter.discard()`로 파일까지 지운다.
 * 2. 그래도 남는 것(SIGKILL·재시작 중단)은 보존 기간이 지나면 `pruneOrphanReplays`가 쓸어 담는다.
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ReplayWriter } from "../src/ReplayWriter.js";
import { pruneOrphanReplays } from "../src/pruneReplays.js";

const dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
});

async function tempDir(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), "majak-orphan-"));
  dirs.push(d);
  return d;
}

/** createWriteStream은 파일을 비동기로 만든다 — 실제로 생길 때까지 기다린다 */
async function waitForFile(dir: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if ((await readdir(dir)).length > 0) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("리플레이 파일이 만들어지지 않았다");
}

describe("ReplayWriter.discard", () => {
  it("스트림을 닫고 파일까지 지운다", async () => {
    const dir = await tempDir();
    const w = new ReplayWriter(dir, "ROOM01");
    await w.open();
    w.write(JSON.stringify({ type: "__init__" }));
    await waitForFile(dir);

    await w.discard();

    expect(await readdir(dir)).toEqual([]);
  });

  it("close()는 파일을 남긴다 — 재시작 중단분은 일부러 보존한다", async () => {
    const dir = await tempDir();
    const w = new ReplayWriter(dir, "ROOM02");
    await w.open();
    w.write("x");
    w.close();
    await waitForFile(dir);
    expect(await readdir(dir)).toHaveLength(1);
  });

  it("열지 않은 writer를 지워도 던지지 않는다", async () => {
    const dir = await tempDir();
    await expect(new ReplayWriter(dir, "ROOM03").discard()).resolves.toBeUndefined();
  });

  it("두 번 지워도 던지지 않는다", async () => {
    const dir = await tempDir();
    const w = new ReplayWriter(dir, "ROOM04");
    await w.open();
    await w.discard();
    await expect(w.discard()).resolves.toBeUndefined();
  });
});

describe("pruneOrphanReplays", () => {
  /** 파일을 만들고 mtime을 `daysAgo`일 전으로 되돌린다 */
  async function aged(dir: string, name: string, daysAgo: number): Promise<string> {
    const p = join(dir, name);
    await writeFile(p, "{}\n");
    const t = new Date(Date.now() - daysAgo * 86_400_000);
    await utimes(p, t, t);
    return p;
  }

  it("인덱스에 없고 오래된 .jsonl만 지운다", async () => {
    const dir = await tempDir();
    const orphanOld = await aged(dir, "AAA_old.jsonl", 400);
    const orphanNew = await aged(dir, "BBB_new.jsonl", 1);
    const indexedOld = await aged(dir, "CCC_indexed.jsonl", 400);

    const cutoffMs = Date.now() - 365 * 86_400_000;
    const res = await pruneOrphanReplays(dir, [indexedOld], cutoffMs);

    expect(res.removed).toBe(1);
    expect(res.paths).toEqual([orphanOld]);
    const left = (await readdir(dir)).sort();
    expect(left).toEqual(["BBB_new.jsonl", "CCC_indexed.jsonl"]);
    // 남은 파일이 진짜 그대로다
    expect((await stat(orphanNew)).isFile()).toBe(true);
  });

  it("DB·통계 파일은 건드리지 않는다 (.jsonl만 본다)", async () => {
    const dir = await tempDir();
    await aged(dir, "majak.db", 400);
    await aged(dir, "stats.json", 400);
    await aged(dir, "augmentStats.json", 400);

    const res = await pruneOrphanReplays(dir, [], Date.now());

    expect(res.removed).toBe(0);
    expect((await readdir(dir)).sort()).toEqual([
      "augmentStats.json",
      "majak.db",
      "stats.json",
    ]);
  });

  it("디렉터리가 없어도 던지지 않는다", async () => {
    const res = await pruneOrphanReplays(
      join(tmpdir(), "majak-does-not-exist-12345"),
      [],
      Date.now(),
    );
    expect(res).toEqual({ removed: 0, paths: [] });
  });
});
