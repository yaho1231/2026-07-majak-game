/**
 * 랭크가 섞인 깡의 부수 + 자패 슌쯔가 흘러드는 역 (docs/25 역/점수 #9·#10).
 *
 * 바람의 계보(동남서북)·장사진(3-4-5-6)의 깡은 `meldToSet`이 **슌쯔성 몸통**으로
 * 내보낸다. 부수 계산이 `type !== "triplet"`이면 건너뛰어서, 자패 안깡 32부가
 * 통째로 사라졌다 — 깡을 하는 쪽이 손해였고 스깡쯔를 세워도 20부 손이 나왔다.
 *
 * 표준 부수가 그대로인지를 먼저 고정하고(회귀 방지) 그다음 섞인 깡을 본다.
 */

import { describe, expect, it } from "vitest";
import { calculateFu } from "../src/mahjong/scoring/fu.js";
import type { ScoringVariant } from "../src/mahjong/scoring/WinContext.js";
import type { WinContext } from "../src/mahjong/scoring/WinContext.js";
import type { TileKind } from "../src/mahjong/tiles/Tile.js";

const man = (rank: number): TileKind => ({ suit: "man", rank });
const wind = (rank: number): TileKind => ({ suit: "wind", rank });

function ctx(partial: Partial<WinContext> = {}): WinContext {
  return {
    hand: [],
    winningTile: man(1),
    melds: [],
    winType: "tsumo",
    seatWind: 2,
    prevalentWind: 1,
    riichi: null,
    ...partial,
  };
}

function variant(sets: ScoringVariant["sets"], pair: TileKind | null): ScoringVariant {
  return {
    form: "standard",
    pair,
    sets,
    isClosed: true,
    waitType: "ryanmen",
  } as ScoringVariant;
}

describe("표준 부수는 그대로다 (회귀 방지)", () => {
  it("자패 안깡은 32부", () => {
    const fu = calculateFu(
      variant(
        [{ type: "triplet", tiles: [wind(1), wind(1), wind(1)], concealed: true, isKan: true }],
        man(2),
      ),
      ctx(),
      false,
    );
    // 20(기본) + 2(쯔모) + 32(자패 안깡) = 54 → 60
    expect(fu).toBe(60);
  });

  it("수패 안커(중장패)는 4부", () => {
    const fu = calculateFu(
      variant(
        [{ type: "triplet", tiles: [man(5), man(5), man(5)], concealed: true, isKan: false }],
        man(2),
      ),
      ctx(),
      false,
    );
    expect(fu).toBe(30); // 20 + 2 + 4 = 26 → 30
  });
});

describe("랭크가 섞인 깡도 깡으로 센다", () => {
  it("동남서북 안깡은 자패 안깡과 같은 32부", () => {
    const honorKan = variant(
      [{ type: "run", tiles: [wind(1), wind(2), wind(3)], concealed: true, isKan: true }],
      man(2),
    );
    // 예전에는 슌쯔라는 이유로 통째로 건너뛰어 20 + 2 = 22 → 30이 나왔다
    expect(calculateFu(honorKan, ctx(), false)).toBe(60);
  });

  it("수패 4연속 안깡(장사진)은 중장패 안깡과 같은 16부", () => {
    const snake = variant(
      [{ type: "run", tiles: [man(3), man(4), man(5)], concealed: true, isKan: true }],
      man(2),
    );
    // 20 + 2 + 16 = 38 → 40
    expect(calculateFu(snake, ctx(), false)).toBe(40);
  });

  it("명깡은 안깡의 절반이다", () => {
    const openHonorKan = variant(
      [{ type: "run", tiles: [wind(1), wind(2), wind(3)], concealed: false, isKan: true }],
      man(2),
    );
    // 20 + 2 + 16 = 38 → 40
    expect(calculateFu(openHonorKan, ctx(), false)).toBe(40);
  });
});
