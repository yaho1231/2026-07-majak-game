/**
 * StatsStore — 증분 직렬화·저장 합치기 (QA 5라운드 Phase D, S-5, 2026-09-16).
 *
 * 규약:
 *  1. 파일 바이트는 `JSON.stringify(내부 상태)` 와 **정확히** 같다 (들여쓰기 없음,
 *     유저별 조각 캐시를 이어 붙인 결과가 통짜 직렬화와 동일). 파싱 결과는 예전
 *     들여쓰기 파일과 deep-equal.
 *  2. 쓰는 중에 들어온 record 들은 **한 번의 쓰기**로 합쳐진다 — 저장 횟수가
 *     record 횟수만큼 늘지 않는다. 그래도 마지막 파일에는 모든 변경이 들어 있다.
 *  3. record/rename/remove 뒤 get/all/entries 가 예전과 같다 (캐시가 낡지 않는다).
 *  4. 쓰기 실패는 그 호출자에게만 거부로 돌아가고 다음 저장은 계속 된다.
 */

import { mkdtemp, readFile, rm, writeFile, chmod, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StatsStore } from "../src/StatsStore.js";

/** writeFile 훅 — 테스트가 «쓰는 중» 상태를 만들 때 쓴다 (기본은 통과) */
const writeHook: { before: ((path: string) => Promise<void>) | null } = { before: null };
vi.mock("node:fs/promises", async (importOriginal) => {
  const orig = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...orig,
    writeFile: async (...args: Parameters<typeof orig.writeFile>) => {
      if (writeHook.before !== null) await writeHook.before(String(args[0]));
      return orig.writeFile(...args);
    },
  };
});
import { createEmptyStats, mergeStats } from "@majak/core/stats/PlayerStats.js";
import type { PlayerStatsRaw } from "@majak/core/stats/PlayerStats.js";

let dir = "";
const pathOf = (): string => join(dir, "stats.json");

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "statsstore-inc-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function raw(n: number, aug?: string): PlayerStatsRaw {
  const s = createEmptyStats();
  s.roundsPlayed = n * 4;
  s.wins = n;
  s.games = 1;
  s.placements = [n % 4 === 0 ? 1 : 0, n % 4 === 1 ? 1 : 0, n % 4 === 2 ? 1 : 0, n % 4 === 3 ? 1 : 0];
  s.placementSum = (n % 4) + 1;
  if (aug !== undefined) {
    s.augments = { [aug]: { offered: n, picked: 1, games: 1, placements: [1, 0, 0, 0], placementSum: 1 } };
    s.augmentTierPicks = [1, 0, 0];
  }
  return s;
}

async function fileJson(): Promise<unknown> {
  return JSON.parse(await readFile(pathOf(), "utf8"));
}

describe("StatsStore 증분 직렬화", () => {
  it("파일 바이트 = JSON.stringify(내부 상태) — 들여쓰기 없음, 파싱 deep-equal", async () => {
    const store = new StatsStore(pathOf());
    await store.load();
    // 숫자 모양 닉네임·__proto__·유니코드 — 키 순서·이스케이프가 통짜 직렬화와 같아야 한다
    await store.record([
      { nickname: "kim", raw: raw(1, "a1") },
      { nickname: "42", raw: raw(2) },
      { nickname: "__proto__", raw: raw(3) },
      { nickname: '한글 "따옴표"\\', raw: raw(4, "b2") },
    ]);
    await store.record([{ nickname: "kim", raw: raw(5, "c3") }]);
    await store.flush();

    const bytes = await readFile(pathOf(), "utf8");
    const expected = JSON.stringify({ version: 1, players: store.all() });
    expect(bytes).toBe(expected);
    expect(bytes.includes("\n")).toBe(false);
    // 옛 형식(들여쓰기 2)과 파싱 결과 동일
    expect(JSON.parse(bytes)).toEqual(JSON.parse(JSON.stringify({ version: 1, players: store.all() }, null, 2)));
    // 내용 검증: kim 은 두 판 합산
    expect(store.get("kim")).toEqual(mergeStats(mergeStats(createEmptyStats(), raw(1, "a1")), raw(5, "c3")));
  });

  it("옛 들여쓰기 파일을 읽어 다시 쓰면 파싱 결과가 같다 (형식 호환)", async () => {
    const players = { a: raw(1, "x"), b: raw(2) };
    await writeFile(pathOf(), JSON.stringify({ version: 1, players }, null, 2), "utf8");
    const store = new StatsStore(pathOf());
    await store.load();
    const before = store.all();
    await store.record([{ nickname: "c", raw: raw(3) }]);
    await store.flush();
    const on = (await fileJson()) as { version: number; players: Record<string, PlayerStatsRaw> };
    expect(on.version).toBe(1);
    expect(on.players.a).toEqual(before.a);
    expect(on.players.b).toEqual(before.b);
    expect(on.players.c).toEqual(mergeStats(createEmptyStats(), raw(3)));
    // 다시 읽어도 같다
    const again = new StatsStore(pathOf());
    await again.load();
    expect(again.all()).toEqual(store.all());
  });

  it("rename/remove 뒤 캐시가 낡지 않는다 — 파일·get·all·entries 일치", async () => {
    const store = new StatsStore(pathOf());
    await store.load();
    await store.record([
      { nickname: "old", raw: raw(1, "x") },
      { nickname: "keep", raw: raw(2) },
      { nickname: "gone", raw: raw(3) },
    ]);
    await store.flush();
    await store.rename("old", "new");
    await store.rename("keep", "new"); // 목적지에 값이 있으면 합친다
    await store.remove("gone");
    await store.flush();

    const on = (await fileJson()) as { players: Record<string, PlayerStatsRaw> };
    expect(Object.keys(on.players)).toEqual(["new"]);
    expect(on.players.new).toEqual(store.get("new"));
    expect(on.players.new).toEqual(mergeStats(mergeStats(createEmptyStats(), raw(1, "x")), raw(2)));
    expect(store.all()).toEqual(on.players);
    expect(Object.fromEntries(store.entries())).toEqual(on.players);
    expect(store.get("old")).toBeNull();
    expect(store.get("gone")).toBeNull();
    expect(await readFile(pathOf(), "utf8")).toBe(JSON.stringify({ version: 1, players: store.all() }));
  });
});

describe("StatsStore 저장 합치기(coalesce)", () => {
  it("쓰는 중 들어온 record N건은 한 번의 쓰기로 합쳐지고 마지막 파일에 전부 담긴다", async () => {
    const store = new StatsStore(pathOf());
    await store.load();

    // writeFile 을 붙들어 «쓰는 중» 상태를 만든다
    let writes = 0;
    let release: (() => void) | null = null;
    const gate = new Promise<void>((r) => (release = r));
    writeHook.before = async () => {
      writes++;
      if (writes === 1) await gate;
    };
    try {
      const p0 = store.record([{ nickname: "u0", raw: raw(0) }]);
      // 첫 쓰기가 gate 에 걸려 있는 동안 9건이 더 들어온다
      await new Promise((r) => setTimeout(r, 5));
      const rest = Array.from({ length: 9 }, (_, i) => store.record([{ nickname: `u${i + 1}`, raw: raw(i + 1) }]));
      await new Promise((r) => setTimeout(r, 5));
      expect(writes).toBe(1); // 아직 첫 쓰기뿐
      release!();
      await Promise.all([p0, ...rest]);
      await store.flush();
    } finally {
      writeHook.before = null;
    }
    // 10건 → 쓰기 2번 (첫 장 + 합쳐진 한 장)
    expect(writes).toBe(2);
    const on = (await fileJson()) as { players: Record<string, PlayerStatsRaw> };
    expect(Object.keys(on.players).sort()).toEqual(Array.from({ length: 10 }, (_, i) => `u${i}`).sort());
    for (let i = 0; i < 10; i++) expect(on.players[`u${i}`]).toEqual(mergeStats(createEmptyStats(), raw(i)));
    expect(on.players).toEqual(store.all());
  });

  it("호출자의 프로미스는 «내 변경이 담긴 쓰기»가 끝난 뒤 해결된다", async () => {
    const store = new StatsStore(pathOf());
    await store.load();
    const p1 = store.record([{ nickname: "a", raw: raw(1) }]);
    const p2 = store.record([{ nickname: "b", raw: raw(2) }]);
    await p2;
    const on = (await fileJson()) as { players: Record<string, PlayerStatsRaw> };
    expect(Object.keys(on.players).sort()).toEqual(["a", "b"]);
    await p1;
    await store.flush();
  });

  it("쓰기 실패는 그 호출자에게 거부로 돌아가고, 다음 저장은 계속 된다", async () => {
    // 파일 경로 자리에 디렉터리를 놓아 rename 이 실패하게 한다
    await mkdir(pathOf(), { recursive: true });
    await writeFile(join(pathOf(), "child"), "x");
    const store = new StatsStore(pathOf());
    await store.load();
    await expect(store.record([{ nickname: "a", raw: raw(1) }])).rejects.toBeDefined();
    await store.flush();
    // 장애물을 치우면 다음 저장은 성공하고 a 도 함께 들어간다
    await rm(pathOf(), { recursive: true, force: true });
    await chmod(dir, 0o755);
    await store.record([{ nickname: "b", raw: raw(2) }]);
    await store.flush();
    const on = (await fileJson()) as { players: Record<string, PlayerStatsRaw> };
    expect(Object.keys(on.players).sort()).toEqual(["a", "b"]);
  });
});
