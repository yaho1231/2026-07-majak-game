/**
 * AugmentStatsStore — 증강별 성적 집계와 20판 주기 자동 조정.
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AugmentStatsStore } from "../src/AugmentStatsStore.js";
import {
  ADJUST_EVERY_GAMES,
  weightsFromOffsets,
} from "@majak/core/augment/tierAdjust.js";
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
    store.record("tonpuu", [
      { augments: [idA as string], rank: 1 },
      { augments: [idB as string], rank: 3 },
    ]);
    const r = store.records("tonpuu");
    expect(r[idA as string]).toMatchObject({ games: 1, wins: 1 });
    expect(r[idB as string]).toMatchObject({ games: 1, wins: 0 });
  });

  it("한 사람이 같은 증강을 중복 보유해도 한 번만 센다", async () => {
    const store = await fresh();
    store.record("tonpuu", [
      { augments: [idA as string, idA as string], rank: 1 },
    ]);
    expect(store.records("tonpuu")[idA as string]).toMatchObject({
      games: 1,
      wins: 1,
    });
  });

  it("제시·선택 횟수는 보유와 무관하게 누적된다 (픽률의 분모)", async () => {
    const store = await fresh();
    // idB는 아무도 안 집었지만 세 번 제시됐다 — 그 사실이 픽률의 근거다.
    store.record("tonpuu", [{ augments: [idA as string], rank: 1 }], {
      [idA as string]: { offered: 2, picked: 1 },
      [idB as string]: { offered: 3, picked: 0 },
    });
    const r = store.records("tonpuu");
    expect(r[idA as string]).toEqual({
      games: 1,
      wins: 1,
      offered: 2,
      picked: 1,
    });
    // 보유 게임이 0이어도 제시 기록만으로 행이 생긴다
    expect(r[idB as string]).toEqual({
      games: 0,
      wins: 0,
      offered: 3,
      picked: 0,
    });
  });

  it("여러 판의 제시·선택이 합산된다", async () => {
    const store = await fresh();
    for (let i = 0; i < 3; i++) {
      store.record("tonpuu", [], {
        [idA as string]: { offered: 2, picked: 1 },
      });
    }
    expect(store.records("tonpuu")[idA as string]).toMatchObject({
      offered: 6,
      picked: 3,
    });
  });

  it("records()가 내부 상태를 내주지 않는다 (제자리 누적이라 복사가 필요하다)", async () => {
    const store = await fresh();
    store.record("tonpuu", [{ augments: [idA as string], rank: 1 }]);
    const snapshot = store.records("tonpuu");
    (snapshot[idA as string] as { games: number }).games = 999;
    expect(store.records("tonpuu")[idA as string]?.games).toBe(1);
  });
});

describe("조정 주기", () => {
  it(`${ADJUST_EVERY_GAMES}판이 차기 전에는 조정하지 않는다`, async () => {
    const store = await fresh();
    for (let i = 0; i < ADJUST_EVERY_GAMES - 1; i++) {
      expect(
        store.record("tonpuu", [{ augments: [idA as string], rank: 1 }]),
      ).toBe(false);
    }
    expect(store.progress("tonpuu").gamesSinceAdjust).toBe(
      ADJUST_EVERY_GAMES - 1,
    );
    expect(store.progress("tonpuu").adjustments).toBe(0);
  });

  it(`${ADJUST_EVERY_GAMES}판째에 조정이 돌고 카운터가 리셋된다`, async () => {
    const store = await fresh();
    let fired = false;
    for (let i = 0; i < ADJUST_EVERY_GAMES; i++) {
      fired = store.record("tonpuu", [{ augments: [idA as string], rank: 1 }]);
    }
    expect(fired).toBe(true);
    expect(store.progress("tonpuu").gamesSinceAdjust).toBe(0);
    expect(store.progress("tonpuu").adjustments).toBe(1);
  });
});

describe("영속화", () => {
  it("기록이 파일에 남고 다시 읽힌다", async () => {
    const store = await fresh();
    store.record("tonpuu", [{ augments: [idA as string], rank: 1 }]);
    await store.flush();

    const raw = JSON.parse(await readFile(pathOf(), "utf8")) as {
      version: number;
      modes: Record<string, { records: Record<string, { games: number }> }>;
    };
    expect(raw.version).toBe(2);
    expect(raw.modes.tonpuu?.records[idA as string]?.games).toBe(1);

    const reloaded = new AugmentStatsStore(pathOf());
    await reloaded.load();
    opened.push(reloaded);
    expect(reloaded.records("tonpuu")[idA as string]).toMatchObject({
      games: 1,
      wins: 1,
    });
  });

  it("파일이 없으면 빈 상태로 시작한다 (게임 진행을 막지 않는다)", async () => {
    const store = new AugmentStatsStore(join(dir, "does-not-exist.json"));
    await store.load();
    opened.push(store);
    expect(store.records("tonpuu")).toEqual({});
  });
});

describe("가중치 제공 / 되돌리기", () => {
  it("조정 전에는 정적 티어표와 같은 가중치를 준다", async () => {
    const store = await fresh();
    const w = store.weights("tonpuu");
    expect(Object.keys(w).length).toBe(Object.keys(AUGMENT_POWER_TIERS).length);
  });

  it("resetOffsets는 조정만 되돌리고 집계는 남긴다", async () => {
    const store = await fresh();
    for (let i = 0; i < ADJUST_EVERY_GAMES; i++) {
      store.record("tonpuu", [{ augments: [idA as string], rank: 1 }]);
    }
    store.resetOffsets();
    expect(store.offsets("tonpuu")).toEqual({});
    expect(store.records("tonpuu")[idA as string]?.games).toBe(
      ADJUST_EVERY_GAMES,
    );
  });
});

describe("게임 모드 분리 (2026-08-25 · 반장전 밸런스 QA 시스템 P1)", () => {
  it("반장전 성적이 동풍전 집계에 섞이지 않는다", async () => {
    const store = await fresh();
    store.record("hanchan", [{ augments: [idA as string], rank: 1 }], {
      [idA as string]: { offered: 3, picked: 2 },
    });
    store.record("tonpuu", [{ augments: [idB as string], rank: 2 }]);

    expect(store.records("hanchan")[idA as string]).toEqual({
      games: 1,
      wins: 1,
      offered: 3,
      picked: 2,
    });
    // 동풍전 통에는 idA의 흔적이 아예 없어야 한다
    expect(store.records("tonpuu")[idA as string]).toBeUndefined();
    expect(store.records("hanchan")[idB as string]).toBeUndefined();
    expect(store.records("tonpuu")[idB as string]).toMatchObject({
      games: 1,
      wins: 0,
    });
  });

  it("조정 주기도 모드별로 따로 찬다 — 한 모드만 채워도 다른 모드는 안 돈다", async () => {
    const store = await fresh();
    for (let i = 0; i < ADJUST_EVERY_GAMES - 1; i++) {
      store.record("hanchan", [{ augments: [idA as string], rank: 1 }]);
      store.record("tonpuu", [{ augments: [idA as string], rank: 1 }]);
    }
    // 반장전만 한 판 더 → 반장전에서만 조정이 돈다
    expect(
      store.record("hanchan", [{ augments: [idA as string], rank: 1 }]),
    ).toBe(true);
    expect(store.progress("hanchan").adjustments).toBe(1);
    expect(store.progress("tonpuu").adjustments).toBe(0);
    expect(store.progress("tonpuu").gamesSinceAdjust).toBe(
      ADJUST_EVERY_GAMES - 1,
    );
  });

  it("가중치가 모드별로 갈라진다 — 한쪽 조정이 다른 쪽 드래프트를 바꾸지 않는다", async () => {
    const store = await fresh();
    const before = store.weights("tonpuu");
    // 반장전에서만 조정이 돌 만큼 채운다
    for (let i = 0; i < ADJUST_EVERY_GAMES; i++) {
      const results = Object.keys(AUGMENT_POWER_TIERS).map((id, n) => ({
        augments: [id],
        rank: n % 4 === 0 ? 1 : 3,
      }));
      store.record("hanchan", results);
    }
    expect(Object.keys(store.offsets("hanchan")).length).toBeGreaterThan(0);
    expect(store.offsets("tonpuu")).toEqual({});
    expect(store.weights("tonpuu")).toEqual(before);
  });

  it("모르는 모드 값이 와도 동풍전 통으로 떨어진다 (깨지지 않는다)", async () => {
    const store = await fresh();
    store.record("garbage" as never, [{ augments: [idA as string], rank: 1 }]);
    expect(store.records("tonpuu")[idA as string]).toMatchObject({ games: 1 });
  });
});

describe("레거시(v1) 파일 호환", () => {
  /** 모드 축이 없던 시절의 파일을 그대로 써 둔다 */
  async function writeLegacy(): Promise<void> {
    await writeFile(
      pathOf(),
      JSON.stringify({
        version: 1,
        records: {
          [idA as string]: { games: 12, wins: 5, offered: 30, picked: 10 },
        },
        offsets: { [idA as string]: 2 },
        gamesSinceAdjust: 7,
        adjustments: 3,
      }),
      "utf8",
    );
  }

  it("v1 파일을 읽어도 깨지지 않고, 집계는 legacyRecords로 보관된다", async () => {
    await writeLegacy();
    const store = new AugmentStatsStore(pathOf());
    await store.load();
    opened.push(store);

    // 모드를 알 수 없는 표본이라 조정 모집단(모드별 records)에는 들어가지 않는다
    expect(store.records("hanchan")).toEqual({});
    expect(store.records("tonpuu")).toEqual({});
    expect(store.legacyRecords()[idA as string]).toEqual({
      games: 12,
      wins: 5,
      offered: 30,
      picked: 10,
    });
  });

  it("이미 적용 중이던 offsets·주기는 두 모드 모두에 이어진다 (가중치가 툭 되돌아가지 않게)", async () => {
    await writeLegacy();
    const store = new AugmentStatsStore(pathOf());
    await store.load();
    opened.push(store);

    for (const mode of ["hanchan", "tonpuu"] as const) {
      expect(store.offsets(mode)[idA as string]).toBe(2);
      expect(store.progress(mode).gamesSinceAdjust).toBe(7);
      expect(store.progress(mode).adjustments).toBe(3);
      // 옮겨진 offsets이 그대로 가중치에 반영된다 (정적 표로 되돌아가지 않는다)
      expect(store.weights(mode)).toEqual(
        weightsFromOffsets({ [idA as string]: 2 }),
      );
    }
  });

  it("v1을 읽은 뒤 새로 기록하면 v2 형식으로 저장되고 레거시가 보존된다", async () => {
    await writeLegacy();
    const store = new AugmentStatsStore(pathOf());
    await store.load();
    opened.push(store);
    store.record("hanchan", [{ augments: [idB as string], rank: 1 }]);
    await store.flush();

    const raw = JSON.parse(await readFile(pathOf(), "utf8")) as {
      version: number;
      modes: Record<string, { records: Record<string, { games: number }> }>;
      legacyRecords: Record<string, { games: number }>;
    };
    expect(raw.version).toBe(2);
    expect(raw.legacyRecords[idA as string]?.games).toBe(12);
    expect(raw.modes.hanchan?.records[idB as string]?.games).toBe(1);
    expect(raw.modes.tonpuu?.records[idB as string]).toBeUndefined();
  });
});
