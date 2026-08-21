/**
 * `isPureReorder` — 손패 FLIP 을 걸어도 되는 변화인지 가르는 유일한 방어선.
 *
 * 이 판정을 잘못 걸어서 실제로 **손패 열세 장이 전부 `width: 2px`** 가 됐다
 * (38_ANIMATION_LIBS §10-9, 39_GSAP_FX_PLAN). FLIP 은 "같은 것들이 자리를 바꿨다"를
 * 그리는 기법이라, 패가 들어오거나 나가는 변화에 걸면 사라진 요소의 상태가 남은
 * 요소에 옮겨붙는다.
 *
 * 순수 함수라 jsdom 없이 그대로 돌릴 수 있다 — `fx/` 에서 유일하게 그런 함수다.
 */

import { describe, expect, it } from "vitest";
import { isPureReorder } from "../src/fx/reorder";

describe("isPureReorder", () => {
  it("순서만 바뀌면 true — FLIP 을 걸 자리다", () => {
    expect(isPureReorder([1, 2, 3], [3, 1, 2])).toBe(true);
    expect(isPureReorder([5, 9], [9, 5])).toBe(true);
  });

  it("순서까지 같으면 false — 움직일 것이 없다", () => {
    expect(isPureReorder([1, 2, 3], [1, 2, 3])).toBe(false);
  });

  it("패가 빠지면 false (타패·후로) — 전용 연출이 담당한다", () => {
    expect(isPureReorder([1, 2, 3], [1, 3])).toBe(false);
  });

  it("패가 들어오면 false (쯔모)", () => {
    expect(isPureReorder([1, 2], [1, 2, 3])).toBe(false);
  });

  it("장수가 같아도 **다른 패**면 false — 이게 국 경계를 막는다", () => {
    // 패 id 는 국마다 재사용된다(0~135). 장수만 보면 옛 국 상태를 새 국에 재생한다.
    expect(isPureReorder([1, 2, 3], [4, 5, 6])).toBe(false);
    expect(isPureReorder([1, 2, 3], [1, 2, 4])).toBe(false);
  });

  it("빈 손패는 false — 배패 전에는 그릴 것이 없다", () => {
    expect(isPureReorder([], [])).toBe(false);
  });

  it("같은 id 가 두 번 들어와도 다중집합으로 정확히 비교한다", () => {
    // 실제 마작 패 id 는 고유하지만, 판정이 집합이 아니라 다중집합이어야 안전하다.
    expect(isPureReorder([1, 1, 2], [2, 1, 1])).toBe(true);
    expect(isPureReorder([1, 1, 2], [1, 2, 2])).toBe(false);
  });

  it("입력을 건드리지 않는다 (정렬이 원본을 뒤집으면 손패 순서가 망가진다)", () => {
    const a = [3, 1, 2];
    const b = [1, 2, 3];
    isPureReorder(a, b);
    expect(a).toEqual([3, 1, 2]);
    expect(b).toEqual([1, 2, 3]);
  });
});
