/**
 * 드래프트 다양성 — **실제 카탈로그(표준 4 + 콘텐츠 104 = 108종)** 로 검증.
 *
 * 코어 쪽(Augment.test.ts)은 합성 카탈로그로 알고리즘을 보지만, 실전 풀에서는
 * `draftStages`·`modes` 필터가 풀을 깎기 때문에 **좌석 칸을 나눌 만큼 남는지**가 별도 관심사다.
 * (반장전/동풍전 각각 대기만성 한 쪽과 가불 인생이 빠진다)
 */

import { describe, expect, it } from "vitest";
import { DraftController, createStandardGame } from "@majak/core";
import type { PlayerId } from "@majak/core";
import { contentAugments } from "../src/index.js";

const PLAYERS: PlayerId[] = ["p0", "p1", "p2", "p3"];

function game(seed: number, mode: "hanchan" | "tonpuu" = "hanchan") {
  return createStandardGame({ seed, mode, extraAugments: contentAugments });
}

describe("드래프트 다양성 — 실제 카탈로그", () => {
  it("반장전 1차 드래프트: 네 명의 12장이 전부 서로 다르다", () => {
    for (const seed of [1, 5, 17, 88, 2026, 31337]) {
      const g = game(seed);
      const draft = new DraftController(g.engine, g.augments, { yaku: g.yaku });
      const all = PLAYERS.flatMap((p) =>
        draft.roll("gameStart", p).map((d) => d.id),
      );
      expect(all).toHaveLength(12);
      expect(new Set(all).size).toBe(12);
    }
  });

  it("동풍전도 마찬가지 — 모드 필터로 풀이 깎여도 칸이 나뉜다", () => {
    for (const seed of [2, 9, 404]) {
      const g = game(seed, "tonpuu");
      const draft = new DraftController(g.engine, g.augments, { yaku: g.yaku });
      const all = PLAYERS.flatMap((p) =>
        draft.roll("eastThird", p).map((d) => d.id),
      );
      expect(all).toHaveLength(12);
      expect(new Set(all).size).toBe(12);
    }
  });

  it("한 게임 전체(반장전 4스테이지)에서 같은 증강을 둘이 갖지 않는다", () => {
    for (const seed of [3, 21, 777]) {
      const g = game(seed);
      const draft = new DraftController(g.engine, g.augments, { yaku: g.yaku });
      const held: string[] = [];
      for (const stage of [
        "gameStart",
        "eastThird",
        "southEntry",
        "southThird",
      ] as const) {
        const offers = new Map<PlayerId, string[]>();
        for (const p of PLAYERS) {
          offers.set(
            p,
            draft.roll(stage, p).map((d) => d.id),
          );
        }
        // 뒤 스테이지 제시에는 앞 스테이지에서 누가 가져간 것이 하나도 없다
        for (const ids of offers.values()) {
          for (const id of ids) expect(held).not.toContain(id);
        }
        for (const p of PLAYERS) {
          const pick = (offers.get(p) ?? [])[0] as string;
          draft.pick(stage, p, pick);
          held.push(pick);
        }
      }
      expect(new Set(held).size).toBe(held.length); // 4스테이지 × 4명 = 16픽이 전부 다른 증강
    }
  });

  it("실제 드래프트 순서(전원 제시 → 전원 픽)에서 픽이 거부되지 않는다", () => {
    // 스테이지 도중 남이 픽해도 내 후보가 흔들리지 않아야 pick 검증을 통과한다.
    for (const seed of [4, 64, 1234]) {
      const g = game(seed);
      const draft = new DraftController(g.engine, g.augments, { yaku: g.yaku });
      const offers = PLAYERS.map((p) => ({
        p,
        ids: draft.roll("gameStart", p).map((d) => d.id),
      }));
      for (const { p, ids } of offers) {
        expect(() => draft.pick("gameStart", p, ids[2] as string)).not.toThrow();
      }
    }
  });

  it("여러 시드에 걸쳐 카탈로그가 고르게 쓰인다 (한 좌석이 같은 증강에 고이지 않는다)", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const g = game(seed);
      const draft = new DraftController(g.engine, g.augments, { yaku: g.yaku });
      for (const p of PLAYERS) {
        for (const d of draft.roll("gameStart", p)) seen.add(d.id);
      }
    }
    // 40게임 × 12장 = 480회 제시 — 108종 대부분이 한 번은 나온다
    expect(seen.size).toBeGreaterThan(90);
  });
});
