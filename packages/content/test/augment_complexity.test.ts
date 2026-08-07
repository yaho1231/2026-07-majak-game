/**
 * 이해 난도(complexity) 전수 커버리지.
 *
 * 처음 앉은 사람의 **첫 드래프트**는 30초 제한의 3지선다인데, 이 저장소에는 난도를
 * 나타내는 값이 어디에도 없었다 — `DraftController`·`AugmentRegistry` 어디에도
 * beginner/difficulty 축이 없고, `synergy.ts`의 `tags`는 시너지 가중용이다. 그래서
 * "'역류 통관' 2판 … ⚠ 이 두 역만으로는 화료할 수 없다"(바닥의 족보) 같은 카드가
 * 첫 카드로 그대로 나갔다.
 *
 * 여기서 세 가지를 막는다.
 *  ① 난도 없는 증강 (기본값 2로 조용히 새는 것)
 *  ② `gameStart` 전용인데 난도 3인 증강 — 첫 스테이지에서만 나오는 증강을 첫
 *    스테이지에서 빼면 **영영 못 뽑는다**. 이 조합은 그 증강을 카탈로그에서 지우는 것과 같다.
 *  ③ 난도 3만 남아 첫 드래프트 후보가 마르는 것
 */

import { describe, expect, it } from "vitest";
import { FIRST_DRAFT_EXCLUDED_COMPLEXITY } from "@majak/core";
import { ALL_AUGMENTS } from "./catalogSource.js";

describe("증강 이해 난도 커버리지", () => {
  it("모든 증강이 1~3의 난도를 선언한다", () => {
    const missing = ALL_AUGMENTS.filter((a) => a.complexity === undefined).map(
      (a) => a.id,
    );
    expect(missing, "난도 미선언 증강").toEqual([]);
    const bad = ALL_AUGMENTS.filter(
      (a) => a.complexity !== undefined && ![1, 2, 3].includes(a.complexity),
    ).map((a) => a.id);
    expect(bad).toEqual([]);
  });

  it("gameStart 전용 증강은 첫 드래프트 제외 난도가 아니다", () => {
    // 이 둘이 겹치면 그 증강은 어느 스테이지에서도 제시되지 않는다.
    const orphans = ALL_AUGMENTS.filter(
      (a) =>
        a.draftStages !== undefined &&
        a.draftStages.every((s) => s === "gameStart") &&
        (a.complexity ?? 2) >= FIRST_DRAFT_EXCLUDED_COMPLEXITY,
    ).map((a) => a.id);
    expect(orphans, "첫 드래프트 전용인데 첫 드래프트에서 빠지는 증강").toEqual([]);
  });

  it("첫 드래프트 후보가 넉넉히 남는다 (모드별)", () => {
    for (const mode of ["hanchan", "tonpuu"] as const) {
      const pool = ALL_AUGMENTS.filter(
        (a) =>
          (a.modes === undefined || a.modes.includes(mode)) &&
          (a.draftStages === undefined || a.draftStages.includes("gameStart")) &&
          (a.complexity ?? 2) < FIRST_DRAFT_EXCLUDED_COMPLEXITY,
      );
      // 좌석 4명 × 3장 + 여유. 이 아래로 내려가면 좌석별 후보 칸이 마른다.
      expect(pool.length, `${mode} 첫 드래프트 후보`).toBeGreaterThan(30);
    }
  });

  it("난도가 한쪽으로 쏠려 있지 않다", () => {
    const count = (n: number): number =>
      ALL_AUGMENTS.filter((a) => a.complexity === n).length;
    for (const n of [1, 2, 3]) {
      expect(count(n), `난도 ${n}`).toBeGreaterThan(10);
    }
  });
});
