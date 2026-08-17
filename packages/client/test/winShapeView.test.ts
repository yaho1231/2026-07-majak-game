/**
 * 결과 화면의 몸통 배치 — 서버가 실어 준 화료 형태(kind 목록)를 공개된 실물 패에 붙인다.
 *
 * 증강으로 난 손(동수의 결속·비대칭 치또이·조커…)이 결과창에 그냥 정렬만 돼서 나오던
 * 것을 몸통 단위로 끊어 보여 주기 위한 배치다(2026-08-18 사용자 보고).
 */

import { describe, expect, it } from "vitest";
import type { PublicTileView, TileKind, WinShape } from "@majak/core";
import { groupWinHand, shapeGroupLabel } from "../src/winShapeView.js";

const m = (rank: number): TileKind => ({ suit: "man", rank });
const p = (rank: number): TileKind => ({ suit: "pin", rank });
const s = (rank: number): TileKind => ({ suit: "sou", rank });
const haku: TileKind = { suit: "dragon", rank: 1 };

/** kind 목록 → 공개 패 목록 (id는 순번) */
function tiles(kinds: TileKind[]): PublicTileView[] {
  return kinds.map((kind, i) => ({ id: i + 1, kind, attrs: {} }));
}

describe("몸통 배치", () => {
  it("비대칭 치또이 — 이종 쌍이 한 묶음으로 선다", () => {
    const shape: WinShape = {
      form: "chiitoitsu",
      groups: [
        { type: "pair", tiles: [m(2), s(2)], concealed: true },
        { type: "pair", tiles: [m(5), p(5)], concealed: true },
        { type: "pair", tiles: [m(6), s(6)], concealed: true },
        { type: "pair", tiles: [m(8), p(8)], concealed: true },
        { type: "pair", tiles: [m(1), p(1)], concealed: true },
        { type: "pair", tiles: [m(4), s(4)], concealed: true },
        { type: "pair", tiles: [haku, haku], concealed: true },
      ],
    };
    // 화면에 오는 손패 순서는 몸통 순서와 무관하다 (정렬된 채로 온다)
    const hand = tiles([
      m(1), m(2), m(4), m(5), m(6), m(8), p(1), p(5), p(8), s(2), s(4), s(6), haku, haku,
    ]);
    const groups = groupWinHand(shape, hand);
    expect(groups).not.toBeNull();
    expect(groups).toHaveLength(7);
    expect(groups?.map((g) => g.slots.map((x) => x.tile.kind))).toEqual([
      [m(2), s(2)],
      [m(5), p(5)],
      [m(6), s(6)],
      [m(8), p(8)],
      [m(1), p(1)],
      [m(4), s(4)],
      [haku, haku],
    ]);
    // 이종 쌍만 "표준으로는 설명 안 되는 몸통" — 백 쌍은 평범하다
    expect(groups?.map((g) => g.unusual)).toEqual([true, true, true, true, true, true, false]);
  });

  it("평범한 손에는 이상한 몸통이 하나도 없다 (이름표가 안 붙는다)", () => {
    const shape: WinShape = {
      form: "standard",
      groups: [
        { type: "run", tiles: [m(1), m(2), m(3)], concealed: true },
        { type: "triplet", tiles: [p(5), p(5), p(5)], concealed: true },
        { type: "pair", tiles: [s(9), s(9)], concealed: true },
      ],
    };
    const hand = tiles([m(1), m(2), m(3), p(5), p(5), p(5), s(9), s(9)]);
    const groups = groupWinHand(shape, hand);
    expect(groups?.every((g) => !g.unusual)).toBe(true);
  });

  it("순환 슌쯔(8-9-1)·자패 슌쯔·혼색 커쯔는 이상한 몸통이다", () => {
    const shape: WinShape = {
      form: "standard",
      groups: [
        { type: "run", tiles: [m(8), m(9), m(1)], concealed: true },
        { type: "run", tiles: [{ suit: "wind", rank: 1 }, { suit: "wind", rank: 2 }, { suit: "wind", rank: 3 }], concealed: true },
        { type: "triplet", tiles: [m(2), p(2), s(2)], concealed: true },
      ],
    };
    const hand = tiles([
      m(8), m(9), m(1),
      { suit: "wind", rank: 1 }, { suit: "wind", rank: 2 }, { suit: "wind", rank: 3 },
      m(2), p(2), s(2),
    ]);
    expect(groupWinHand(shape, hand)?.map((g) => g.unusual)).toEqual([true, true, true]);
  });

  it("조커 — 남은 자리에 백이 들어가고 무엇이 됐는지가 붙는다", () => {
    const shape: WinShape = {
      form: "standard",
      groups: [
        { type: "run", tiles: [p(1), p(2), p(3)], concealed: true },
        { type: "pair", tiles: [m(1), m(1)], concealed: true },
      ],
    };
    // 3통이 없다 — 그 자리는 백(조커)이 메웠다
    const hand = tiles([m(1), m(1), p(1), p(2), haku]);
    const groups = groupWinHand(shape, hand);
    const run = groups?.[0];
    expect(run?.slots.map((x) => x.tile.kind)).toEqual([p(1), p(2), haku]);
    expect(run?.slots[2]?.as).toEqual(p(3));
    expect(run?.unusual).toBe(true);
    // 조커가 끼지 않은 머리는 평범하다
    expect(groups?.[1]?.unusual).toBe(false);
  });

  it("손패가 형태와 안 맞으면 null — 화면은 종전대로 정렬만 한다", () => {
    const shape: WinShape = {
      form: "standard",
      groups: [{ type: "pair", tiles: [m(1), m(1)], concealed: true }],
    };
    expect(groupWinHand(shape, tiles([m(1), m(1), m(1)]))).toBeNull();
  });
});

describe("몸통 이름표", () => {
  it("치또이의 쌍과 표준형의 머리는 다른 말을 쓴다", () => {
    expect(shapeGroupLabel("pair", "chiitoitsu")).toBe("쌍");
    expect(shapeGroupLabel("pair", "standard")).toBe("머리");
    expect(shapeGroupLabel("run", "standard")).toBe("슌쯔");
    expect(shapeGroupLabel("triplet", "standard")).toBe("커쯔");
    // 국사의 낱장은 이름이 없다 (몸통이 아니다)
    expect(shapeGroupLabel("single", "kokushi")).toBe("");
  });
});
