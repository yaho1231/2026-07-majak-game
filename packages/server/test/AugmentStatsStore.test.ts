/**
 * AugmentStatsStore — 증강별 성적 집계와 20판 주기 자동 조정.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AugmentStatsStore } from "../src/AugmentStatsStore.js";
import { ADJUST_EVERY_GAMES } from "@majak/core/augment/tierAdjust.js";
import { AUGMENT_POWER_TIERS } from "@majak/core/augment/powerTier.js";

let dir = "";
const pathOf = (): string => join(dir, "aug.json");
/** 이 테스트에서 만든 스토어들 — 정리 전에 저장 큐를 비워야 ENOTEMPTY가 안 난다 */
let opened: AugmentStatsStore[] = [];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "augstats-"));
  opened = [];
});
afterEach(async () => {
  // record()는 저장을 큐에 넣고 즉시 반환한다. 그 쓰기가 끝나기 전에 디렉터리를
  // 지우면 .tmp 파일이 남아 ENOTEMPTY가 난다.
  await Promise.all(opened.map((s) => s.flush()));
  await rm(dir, { recursive: true, force: true });
});

async function fresh(): Promise<AugmentStatsStore> {
  const s = new AugmentStatsStore(pathOf());
  await s.load();
  opened.push(s);
  return s;
}

/** 티어표에 있는 실제 증강 id 두 개 */
const [idA, idB] = Object.keys(AUGMENT_POWER_TIERS);

describe("집계", () => {
  it("보유한 증강의 게임 수와 1위 수를 센다", async () => {
    const store = await fresh();
    store.record([
      { augments: [idA as string], rank: 1 },
      { augments: [idB as string], rank: 3 },
    ]);
    const r = store.records();
    expect(r[idA as string]).toEqual({ games: 1, wins: 1 });
    expect(r[idB as string]).toEqual({ games: 1, wins: 0 });
  });

  it("한 사람이 같은 증강을 중복 보유해도 한 번만 센다", async () => {
    const store = await fresh();
    store.record([{ augments: [idA as string, idA as string], rank: 1 }]);
    expect(store.records()[idA as string]).toEqual({ games: 1, wins: 1 });
  });
});

describe("조정 주기", () => {
  it(`${ADJUST_EVERY_GAMES}판이 차기 전에는 조정하지 않는다`, async () => {
    const store = await fresh();
    for (let i = 0; i < ADJUST_EVERY_GAMES - 1; i++) {
      expect(store.record([{ augments: [idA as string], rank: 1 }])).toBe(false);
    }
    expect(store.progress().gamesSinceAdjust).toBe(ADJUST_EVERY_GAMES - 1);
    expect(store.progress().adjustments).toBe(0);
  });

  it(`${ADJUST_EVERY_GAMES}판째에 조정이 돌고 카운터가 리셋된다`, async () => {
    const store = await fresh();
    let fired = false;
    for (let i = 0; i < ADJUST_EVERY_GAMES; i++) {
      fired = store.record([{ augments: [idA as string], rank: 1 }]);
    }
    expect(fired).toBe(true);
    expect(store.progress().gamesSinceAdjust).toBe(0);
    expect(store.progress().adjustments).toBe(1);
  });
});

describe("영속화", () => {
  it("기록이 파일에 남고 다시 읽힌다", async () => {
    const store = await fresh();
    store.record([{ augments: [idA as string], rank: 1 }]);
    await store.flush();

    const raw = JSON.parse(await readFile(pathOf(), "utf8")) as {
      records: Record<string, { games: number }>;
    };
    expect(raw.records[idA as string]?.games).toBe(1);

    const reloaded = new AugmentStatsStore(pathOf());
    await reloaded.load();
    opened.push(reloaded);
    expect(reloaded.records()[idA as string]).toEqual({ games: 1, wins: 1 });
  });

  it("파일이 없으면 빈 상태로 시작한다 (게임 진행을 막지 않는다)", async () => {
    const store = new AugmentStatsStore(join(dir, "does-not-exist.json"));
    await store.load();
    opened.push(store);
    expect(store.records()).toEqual({});
  });
});

describe("가중치 제공 / 되돌리기", () => {
  it("조정 전에는 정적 티어표와 같은 가중치를 준다", async () => {
    const store = await fresh();
    const w = store.weights();
    expect(Object.keys(w).length).toBe(Object.keys(AUGMENT_POWER_TIERS).length);
  });

  it("resetOffsets는 조정만 되돌리고 집계는 남긴다", async () => {
    const store = await fresh();
    for (let i = 0; i < ADJUST_EVERY_GAMES; i++) {
      store.record([{ augments: [idA as string], rank: 1 }]);
    }
    store.resetOffsets();
    expect(store.offsets()).toEqual({});
    expect(store.records()[idA as string]?.games).toBe(ADJUST_EVERY_GAMES);
  });
});
