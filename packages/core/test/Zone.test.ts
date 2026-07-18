import { describe, expect, it } from "vitest";
import { createZone, moveTiles } from "../src/engine/zones/Zone.js";
import type { Zones } from "../src/engine/zones/Zone.js";

function fixture(): Zones {
  return {
    wall: { ...createZone("wall", "wall"), tileIds: [10, 11, 12, 13] },
    "hand:p0": { ...createZone("hand:p0", "hand", "p0"), tileIds: [1, 2] },
    "discards:p0": createZone("discards:p0", "discards", "p0"),
  };
}

describe("moveTiles", () => {
  it("쯔모: wall 맨 앞 패가 손패 맨 뒤로", () => {
    const next = moveTiles(fixture(), "wall", "hand:p0", [10]);
    expect(next["wall"]?.tileIds).toEqual([11, 12, 13]);
    expect(next["hand:p0"]?.tileIds).toEqual([1, 2, 10]);
  });

  it("버림: 순서가 보존된다 (후리텐·리치 선언패 판정의 기반)", () => {
    let zones = fixture();
    zones = moveTiles(zones, "hand:p0", "discards:p0", [2]);
    zones = moveTiles(zones, "hand:p0", "discards:p0", [1]);
    expect(zones["discards:p0"]?.tileIds).toEqual([2, 1]);
  });

  it("여러 장 이동과 insertAt 위치 지정", () => {
    const next = moveTiles(fixture(), "wall", "hand:p0", [11, 13], 0);
    expect(next["hand:p0"]?.tileIds).toEqual([11, 13, 1, 2]);
    expect(next["wall"]?.tileIds).toEqual([10, 12]);
  });

  it("순수 함수 — 원본 zones는 불변", () => {
    const original = fixture();
    moveTiles(original, "wall", "hand:p0", [10]);
    expect(original["wall"]?.tileIds).toEqual([10, 11, 12, 13]);
    expect(original["hand:p0"]?.tileIds).toEqual([1, 2]);
  });

  it("없는 패·없는 Zone·같은 Zone·중복 id는 즉시 실패", () => {
    const zones = fixture();
    expect(() => moveTiles(zones, "wall", "hand:p0", [99])).toThrow("not in zone");
    expect(() => moveTiles(zones, "nope", "hand:p0", [10])).toThrow("Unknown zone");
    expect(() => moveTiles(zones, "wall", "nope", [10])).toThrow("Unknown zone");
    expect(() => moveTiles(zones, "wall", "wall", [10])).toThrow("same zone");
    expect(() => moveTiles(zones, "wall", "hand:p0", [10, 10])).toThrow("Duplicate");
  });
});

describe("createZone", () => {
  it("owner 없는 Zone에는 owner 키 자체가 없다 (JSON 직렬화 일관성)", () => {
    expect("owner" in createZone("wall", "wall")).toBe(false);
    expect(createZone("hand:p1", "hand", "p1").owner).toBe("p1");
  });
});
