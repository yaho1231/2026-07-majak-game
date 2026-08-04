/**
 * 예지 모달 자리 라벨 — 고정 배열이 아니라 진행 방향·현재 차례에서 계산해야 한다.
 */

import { describe, expect, it } from "vitest";
import { projectedDrawSeats, relativeSeatLabel } from "../src/drawOrder.js";

describe("projectedDrawSeats", () => {
  it("표준 진행에서는 다음 자리부터 한 바퀴", () => {
    expect(projectedDrawSeats(0, 1, 4, 4)).toEqual([1, 2, 3, 0]);
    expect(projectedDrawSeats(2, 1, 4, 4)).toEqual([3, 0, 1, 2]);
  });

  it("역행(direction=-1)에서는 반대로 돈다", () => {
    expect(projectedDrawSeats(0, -1, 4, 4)).toEqual([3, 2, 1, 0]);
    expect(projectedDrawSeats(2, -1, 4, 4)).toEqual([1, 0, 3, 2]);
  });

  it("마지막 칸은 언제나 지금 차례인 사람 자신이다", () => {
    for (const dir of [1, -1]) {
      for (let seat = 0; seat < 4; seat++) {
        expect(projectedDrawSeats(seat, dir, 4, 4).at(-1)).toBe(seat);
      }
    }
  });
});

describe("relativeSeatLabel", () => {
  it("표준 진행 — 다음에 두는 사람이 하가", () => {
    expect(relativeSeatLabel(0, 0, 1, 4)).toBe("나");
    expect(relativeSeatLabel(0, 1, 1, 4)).toBe("하가");
    expect(relativeSeatLabel(0, 2, 1, 4)).toBe("대면");
    expect(relativeSeatLabel(0, 3, 1, 4)).toBe("상가");
  });

  it("역행 — 하가와 상가가 뒤바뀐다", () => {
    expect(relativeSeatLabel(0, 0, -1, 4)).toBe("나");
    expect(relativeSeatLabel(0, 3, -1, 4)).toBe("하가");
    expect(relativeSeatLabel(0, 2, -1, 4)).toBe("대면");
    expect(relativeSeatLabel(0, 1, -1, 4)).toBe("상가");
  });

  it("역행에서 예지 4칸의 라벨이 하가→대면→상가→나 순이다", () => {
    const seats = projectedDrawSeats(1, -1, 4, 4); // 내 자리 1, 역행
    expect(seats.map((s) => relativeSeatLabel(1, s, -1, 4))).toEqual([
      "하가",
      "대면",
      "상가",
      "나",
    ]);
  });
});
