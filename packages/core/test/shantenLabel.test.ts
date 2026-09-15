import { describe, expect, it } from "vitest";
import { shantenLabel } from "../src/mahjong/scoring/shanten.js";

/** 샹텐 이름 — 숫자가 아니라 이·량·산·스… 음으로 읽는다 (2026-09-15 사용자 지시) */
describe("shantenLabel", () => {
  it("-1은 화료형, 0은 텐파이", () => {
    expect(shantenLabel(-1)).toBe("화료형");
    expect(shantenLabel(0)).toBe("텐파이");
  });
  it("1~8은 이·량·산·스·우·로·치·파샹텐", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(shantenLabel)).toEqual([
      "이샹텐", "량샹텐", "산샹텐", "스샹텐", "우샹텐", "로샹텐", "치샹텐", "파샹텐",
    ]);
  });
  it("8을 넘으면 숫자를 그대로 붙인다", () => {
    expect(shantenLabel(9)).toBe("9샹텐");
  });
});
