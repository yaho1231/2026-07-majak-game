/**
 * 예지 모달 자리 라벨 — 고정 배열이 아니라 진행 방향·현재 차례에서 계산해야 한다.
 */

import { describe, expect, it } from "vitest";
import { bottomDealArmedSeats, projectedDrawSeats, relativeSeatLabel } from "../src/drawOrder.js";

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

describe("밑장 예약 건너뛰기 (W3 수정 커밋 리뷰)", () => {
  it("자리 하나 — 그 자리의 다음 한 번만 건너뛴다", () => {
    // 지금 0번 차례, 1번이 밑장 예약 → 앞 장은 2·3·0·(1의 두 번째 쯔모)
    expect(projectedDrawSeats(0, 1, 4, 4, 1)).toEqual([2, 3, 0, 1]);
  });

  it("상대의 예약도 함께 — 여러 자리를 각각 한 번씩 건너뛴다", () => {
    // 지금 0번 차례, 1번(상대)·2번(나) 예약 → 3·0·1·2
    expect(projectedDrawSeats(0, 1, 4, 4, [1, 2])).toEqual([3, 0, 1, 2]);
    // 배열 하나짜리는 숫자 하나와 같다
    expect(projectedDrawSeats(0, 1, 4, 4, [1])).toEqual(projectedDrawSeats(0, 1, 4, 4, 1));
    // 빈 배열은 건너뛰기 없음
    expect(projectedDrawSeats(0, 1, 4, 4, [])).toEqual([1, 2, 3, 0]);
  });

  it("역행에서도 진행 방향으로 건너뛴다", () => {
    // 지금 1번 차례, 역행: 0 → 3 → 2 → 1. 0번 예약 → 3·2·1·0
    expect(projectedDrawSeats(1, -1, 4, 4, [0])).toEqual([3, 2, 1, 0]);
  });

  it("예약 자리는 전원 공개 채널 bottom_deal:armed:{id} 에서 읽는다", () => {
    const players = [
      { id: "p0", seat: 0 },
      { id: "p1", seat: 1 },
      { id: "p2", seat: 2 },
      { id: "p3", seat: 3 },
    ];
    expect(bottomDealArmedSeats(players, { "bottom_deal:armed:p1": true, "bottom_deal:armed:p3": false })).toEqual([1]);
    expect(bottomDealArmedSeats(players, {})).toEqual([]);
  });
});
