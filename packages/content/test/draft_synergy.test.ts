/**
 * 드래프트 시너지 편향 — **실제 카탈로그(표준 4 + 콘텐츠 112)** 로 검증.
 *
 * 코어 쪽(Synergy.test.ts)은 표와 배수 계산을 보고, 여기서는
 * ① 살아 있는 카탈로그에 **미분류가 없는가**
 * ② 실제 드래프트에서 **정말로 더 자주 뜨는가**
 * ③ 편향을 넣고도 **결정성·좌석 칸 다양성이 그대로인가**
 * 를 본다.
 */

import { describe, expect, it } from "vitest";
import {
  AUGMENT_SYNERGY,
  DraftController,
  createStandardGame,
  synergyBias,
} from "@majak/core";
import type { PlayerId } from "@majak/core";
import { contentAugments } from "../src/index.js";

const PLAYERS: PlayerId[] = ["p0", "p1", "p2", "p3"];

function game(seed: number, mode: "hanchan" | "tonpuu" = "hanchan") {
  return createStandardGame({ seed, mode, extraAugments: contentAugments });
}

/** 실게임에선 DraftController가 픽으로 채우는 보유 목록을, 테스트에선 직접 넣는다 */
function hold(g: ReturnType<typeof game>, player: PlayerId, ids: string[]): void {
  g.engine.state.players.find((p) => p.id === player)!.augments.push(...ids);
}

describe("시너지 표 커버리지 — 카탈로그와 실시간 대조", () => {
  it("카탈로그의 모든 증강이 시너지 표에 있다 (새 증강이 조용히 빠지지 않는다)", () => {
    const catalog = game(1).augments.all().map((d) => d.id);
    const missing = catalog.filter((id) => AUGMENT_SYNERGY[id] === undefined);
    expect(missing, `시너지 미분류: ${missing.join(", ")}`).toEqual([]);
  });

  it("시너지 표에 카탈로그에 없는 유령 id가 없다", () => {
    const catalog = new Set(game(1).augments.all().map((d) => d.id));
    const ghosts = Object.keys(AUGMENT_SYNERGY).filter((id) => !catalog.has(id));
    expect(ghosts, `유령 항목: ${ghosts.join(", ")}`).toEqual([]);
  });
});

describe("드래프트 분포 — 같은 축이 더 자주 뜬다", () => {
  /** 여러 시드에서 2차 드래프트를 굴려, 주어진 조건에 맞는 제시 장수를 센다 */
  function offerStats(
    held: string[],
    match: (id: string) => boolean,
  ): { hit: number; total: number } {
    let hit = 0;
    let total = 0;
    for (let seed = 1; seed <= 120; seed++) {
      const g = game(seed);
      if (held.length > 0) hold(g, "p0", held);
      const draft = new DraftController(g.engine, g.augments, { yaku: g.yaku });
      for (const d of draft.roll("eastThird", "p0")) {
        total++;
        if (match(d.id)) hit++;
      }
    }
    return { hit, total };
  }

  it("리치를 집으면 리치 시너지 증강이 더 자주 제시된다", () => {
    const isRiichiSynergy = (id: string): boolean => {
      const bias = synergyBias(["late_double"])[id];
      return bias !== undefined && bias > 1;
    };
    const base = offerStats([], isRiichiSynergy);
    const with_ = offerStats(["late_double"], isRiichiSynergy);
    const baseRate = base.hit / base.total;
    const withRate = with_.hit / with_.total;
    // 편향이 실제로 걸렸는지만 본다 (정확한 배수는 티어 가중·좌석 칸에 따라 흔들린다)
    expect(withRate).toBeGreaterThan(baseRate * 1.5);
  });

  it("두 번째로 노선을 갈아타면 세 번째 제시가 그쪽으로 기운다 (최신성)", () => {
    // 축이 서로 겹치지 않는 두 빌드: 깡·도라(ankan_dora) ↔ 국사(royal_kokushi).
    const isKan = (id: string): boolean =>
      (AUGMENT_SYNERGY[id]?.tags ?? []).includes("kan");
    const isKokushi = (id: string): boolean =>
      (AUGMENT_SYNERGY[id]?.tags ?? []).includes("kokushi");

    // 깡 → 국사 순으로 집었다 (최근이 국사)
    const kanFirst = { kan: 0, kokushi: 0 };
    // 국사 → 깡 순으로 집었다 (최근이 깡)
    const kokushiFirst = { kan: 0, kokushi: 0 };
    for (let seed = 1; seed <= 200; seed++) {
      for (const [held, tally] of [
        [["ankan_dora", "royal_kokushi"], kanFirst],
        [["royal_kokushi", "ankan_dora"], kokushiFirst],
      ] as const) {
        const g = game(seed);
        hold(g, "p0", [...held]);
        const draft = new DraftController(g.engine, g.augments, { yaku: g.yaku });
        for (const d of draft.roll("southEntry", "p0")) {
          if (isKan(d.id)) tally.kan++;
          if (isKokushi(d.id)) tally.kokushi++;
        }
      }
    }
    // 축끼리 직접 비교하지 않는다 — 카탈로그에 깡 증강이 국사보다 훨씬 많다.
    // 같은 축을 **순서만 바꿔** 비교한다: 나중에 집었을 때 더 많이 제시돼야 한다.
    expect(kanFirst.kokushi).toBeGreaterThan(kokushiFirst.kokushi);
    expect(kokushiFirst.kan).toBeGreaterThan(kanFirst.kan);
    // 예전 픽도 죽지 않는다 — 여전히 제시된다
    expect(kanFirst.kan).toBeGreaterThan(0);
    expect(kokushiFirst.kokushi).toBeGreaterThan(0);
  });

  it("스텔스 리치를 집으면 은닉을 깨는 리치 증강은 오히려 덜 제시된다", () => {
    // conflicts로 완전히 잠긴 6종을 뺀, 소프트하게 눌리기만 하는 것들
    const SOFT = ["riichi_upgrade"];
    const base = offerStats([], (id) => SOFT.includes(id));
    const with_ = offerStats(["stealth_riichi"], (id) => SOFT.includes(id));
    expect(with_.hit).toBeLessThan(base.hit);
  });

  it("스텔스 리치의 하드 배제(conflicts) 6종은 아예 뜨지 않는다", () => {
    const HARD = [
      "riichi_seal",
      "open_riichi_reveal",
      "all_or_nothing",
      "soul_strike",
      "off_by_one",
      "palm_flip",
    ];
    const { hit } = offerStats(["stealth_riichi"], (id) => HARD.includes(id));
    expect(hit).toBe(0);
  });
});

describe("편향을 넣어도 기존 보장이 그대로다", () => {
  it("같은 상태에서 몇 번을 굴려도 같은 결과다 (결정성)", () => {
    const g = game(2026);
    hold(g, "p0", ["late_double"]);
    const draft = new DraftController(g.engine, g.augments, { yaku: g.yaku });
    const a = draft.roll("eastThird", "p0").map((d) => d.id);
    expect(draft.roll("eastThird", "p0").map((d) => d.id)).toEqual(a);
  });

  it("보유가 서로 달라도 좌석 칸은 겹치지 않는다 (한 스테이지에 중복 제시 없음)", () => {
    for (const seed of [3, 41, 777, 2026]) {
      const g = game(seed);
      hold(g, "p0", ["late_double"]);
      hold(g, "p1", ["ankan_dora"]);
      hold(g, "p2", ["stealth_riichi"]);
      hold(g, "p3", ["royal_kokushi"]);
      const draft = new DraftController(g.engine, g.augments, { yaku: g.yaku });
      const all = PLAYERS.flatMap((p) => draft.roll("eastThird", p).map((d) => d.id));
      expect(all).toHaveLength(12);
      expect(new Set(all).size).toBe(12);
    }
  });

  it("내가 보유한 것이 나에게 다시 제시되지 않는다", () => {
    for (const seed of [9, 55, 1234]) {
      const g = game(seed);
      hold(g, "p0", ["late_double", "ura_peek"]);
      const draft = new DraftController(g.engine, g.augments, { yaku: g.yaku });
      const ids = draft.roll("eastThird", "p0").map((d) => d.id);
      expect(ids).not.toContain("late_double");
      expect(ids).not.toContain("ura_peek");
    }
  });

  it("남이 이번 스테이지에 픽해도 내 후보가 흔들리지 않는다", () => {
    const g = game(4242);
    hold(g, "p0", ["ankan_dora"]);
    const draft = new DraftController(g.engine, g.augments, { yaku: g.yaku });
    const before = draft.roll("eastThird", "p3").map((d) => d.id);
    for (const p of ["p0", "p1", "p2"] as PlayerId[]) {
      draft.pick("eastThird", p, draft.roll("eastThird", p)[0]!.id);
    }
    expect(draft.roll("eastThird", "p3").map((d) => d.id)).toEqual(before);
  });
});
