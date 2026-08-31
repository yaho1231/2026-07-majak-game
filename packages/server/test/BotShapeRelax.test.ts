/**
 * **봇의 샹텐이 형 완화 증강을 본다** (QA synergy4 A-13).
 *
 * 코어 `shantenOf`는 분해 옵션 중 일부만 읽는다. 그래서 양극(polarEnds)·끝없는
 * 윤회(wrapRuns)·바람의 계보(honorRuns)가 걸린 손에서 **진짜 텐파이인데 샹텐이 1 이상**
 * 으로 나왔다(실측 누락률 90.5% · 57.8% · 99.1%). `bot/read.ts`의 `shanten <= 0`이
 * 대기·리치·푸시 판단 전체의 문지기라, 봇은 자기 텐파이를 노텐으로 보고 오름패를 흘렸다.
 *
 * 고친 방식은 «예외 나열»이 아니다 — `shantenOf`가 **실제로 읽는 옵션 목록**의 여집합을
 * 「믿을 수 없음」으로 보고 정확 계산기로 확인한다(`bot/shape.ts`). 새 형 완화 옵션이
 * 늘어나도 자동으로 따라온다.
 */

import { describe, expect, it } from "vitest";
import { isTenpai, shantenOf } from "@majak/core";
import type { DecomposeOptions } from "@majak/core";
import { botShantenOf, hasUnmodeledShapeOptions } from "../src/bot/shape.js";
import { buildRead } from "../src/bot/read.js";
import { botScene, h } from "./botTestView.js";

/** 그 옵션이 켜져야만 텐파이인 손들 (qa-lab/synergy4/shape/19_shanten.ts와 같은 표본) */
const CASES: [string, string, DecomposeOptions][] = [
  ["양극", "199m199p199s11m19s", { polarEnds: true }],
  ["끝없는 윤회", "891m891p234s567s5z", { wrapRuns: true }],
  ["바람의 계보", "123z234m567m11p99s", { honorRuns: true }],
];

describe("bot/shape — 형 완화 옵션을 샹텐이 따라간다", () => {
  it("모델링된 옵션만 켜져 있으면 정확 경로를 타지 않는다", () => {
    expect(hasUnmodeledShapeOptions(undefined)).toBe(false);
    expect(hasUnmodeledShapeOptions({})).toBe(false);
    expect(hasUnmodeledShapeOptions({ mixedRuns: true })).toBe(false);
    expect(hasUnmodeledShapeOptions({ totalSets: 5 })).toBe(false);
    expect(hasUnmodeledShapeOptions({ polarEnds: false })).toBe(false);
  });

  it("모델링되지 않은 형 완화가 켜지면 정확 경로를 탄다", () => {
    for (const [, , opts] of CASES) expect(hasUnmodeledShapeOptions(opts)).toBe(true);
  });

  for (const [name, spec, opts] of CASES) {
    it(`${name}: 텐파이인 손을 봇이 텐파이로 본다`, () => {
      const hand = h(spec);
      expect(isTenpai(hand, 0, undefined, opts)).toBe(true); // 표본이 진짜 텐파이인지
      expect(shantenOf(hand, 0, opts)).toBeGreaterThan(0); // 코어는 여전히 놓친다
      expect(botShantenOf(hand, 0, opts)).toBe(0); // 봇은 놓치지 않는다
    });

    it(`${name}: buildRead가 대기를 계산한다 (문지기 통과)`, () => {
      const { view } = botScene({ hand: spec, scoringOptions: opts });
      const read = buildRead(view, "p0");
      expect(read.tenpai).toBe(true);
      expect(read.shanten).toBeLessThanOrEqual(0);
      expect(read.waits.length).toBeGreaterThan(0);
    });
  }

  it("표준 손에서는 코어 샹텐과 한 글자도 다르지 않다", () => {
    for (const spec of ["123m456m789m11p56s", "19m19p19s1234567z", "1112345678999m"]) {
      const hand = h(spec);
      expect(botShantenOf(hand, 0, {})).toBe(shantenOf(hand, 0, {}));
    }
  });
});
