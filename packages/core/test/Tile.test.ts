import { describe, expect, it } from "vitest";
import {
  Suits,
  buildStandardTileSet,
  isHonor,
  isTerminal,
  isTerminalOrHonor,
  kindKey,
  sameKind,
} from "../src/mahjong/tiles/Tile.js";

describe("buildStandardTileSet", () => {
  it("136장, id 0~135 고유, 34종 각 4장", () => {
    const tiles = buildStandardTileSet({ redFivesPerSuit: 1 });
    expect(tiles).toHaveLength(136);
    expect(new Set(tiles.map((t) => t.id)).size).toBe(136);

    const countByKind = new Map<string, number>();
    for (const t of tiles) {
      const key = kindKey(t.kind);
      countByKind.set(key, (countByKind.get(key) ?? 0) + 1);
    }
    expect(countByKind.size).toBe(34);
    for (const count of countByKind.values()) expect(count).toBe(4);
  });

  it("적도라는 수패 suit마다 1장씩 총 3장, 전부 5", () => {
    const tiles = buildStandardTileSet({ redFivesPerSuit: 1 });
    const reds = tiles.filter((t) => t.attrs.red === true);
    expect(reds).toHaveLength(3);
    expect(new Set(reds.map((t) => t.kind.suit))).toEqual(
      new Set([Suits.Man, Suits.Pin, Suits.Sou]),
    );
    for (const t of reds) expect(t.kind.rank).toBe(5);
  });

  it("redFivesPerSuit: 0 이면 적도라 없음", () => {
    const tiles = buildStandardTileSet({ redFivesPerSuit: 0 });
    expect(tiles.filter((t) => t.attrs.red === true)).toHaveLength(0);
  });

  it("생성 순서는 결정적이다 (섞는 것은 PRNG의 일)", () => {
    const a = buildStandardTileSet({ redFivesPerSuit: 1 });
    const b = buildStandardTileSet({ redFivesPerSuit: 1 });
    expect(a).toEqual(b);
  });
});

describe("kind 판정 헬퍼", () => {
  it("isTerminal — 수패 1·9만", () => {
    expect(isTerminal({ suit: Suits.Man, rank: 1 })).toBe(true);
    expect(isTerminal({ suit: Suits.Sou, rank: 9 })).toBe(true);
    expect(isTerminal({ suit: Suits.Pin, rank: 5 })).toBe(false);
    expect(isTerminal({ suit: Suits.Wind, rank: 1 })).toBe(false);
  });

  it("isHonor — 풍패·삼원패만", () => {
    expect(isHonor({ suit: Suits.Wind, rank: 4 })).toBe(true);
    expect(isHonor({ suit: Suits.Dragon, rank: 3 })).toBe(true);
    expect(isHonor({ suit: Suits.Man, rank: 1 })).toBe(false);
  });

  it("isTerminalOrHonor — 요구패 판정 (혼노두·찬타의 기반)", () => {
    expect(isTerminalOrHonor({ suit: Suits.Man, rank: 9 })).toBe(true);
    expect(isTerminalOrHonor({ suit: Suits.Dragon, rank: 1 })).toBe(true);
    expect(isTerminalOrHonor({ suit: Suits.Man, rank: 2 })).toBe(false);
  });

  it("sameKind는 suit·rank만 비교한다 (id·적도라 무관)", () => {
    expect(sameKind({ suit: "man", rank: 5 }, { suit: "man", rank: 5 })).toBe(true);
    expect(sameKind({ suit: "man", rank: 5 }, { suit: "pin", rank: 5 })).toBe(false);
  });

  it("증강이 등록한 새 suit도 헬퍼가 안전하게 처리한다", () => {
    const flower = { suit: "flower", rank: 1 };
    expect(isTerminal(flower)).toBe(false);
    expect(isHonor(flower)).toBe(false);
    expect(kindKey(flower)).toBe("flower1");
  });
});
