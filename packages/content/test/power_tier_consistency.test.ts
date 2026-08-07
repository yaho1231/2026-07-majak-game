/**
 * 가드 ② — 파워 티어표가 **자기 산식과 어긋나면 사유를 남긴다**.
 *
 * `powerTier.ts`는 머리말에서 스스로 규칙을 밝힌다: 총점 = `p*3 + s*3 + u*2 + f*2`,
 * 티어 컷은 `TIER_CUTS`, 조건이 드문 몇 종만 `rare: true`로 낮춘다. 그런데 2026-08-07
 * 감사에서 **사유 없이 산식을 벗어난 행이 14개** 나왔다 — 위로 4, 아래로 10.
 *
 * 이게 문제인 이유는 티어가 장식이 아니기 때문이다. 티어는 `POWER_TIER_WEIGHT`를 거쳐
 * **드래프트 드롭 확률**이 된다(SS+ ×0.15 … D ×1.20). 한 단계 이탈은 곧 그 증강이
 * 최대 두 배 다른 빈도로 나온다는 뜻인데, 왜 그런지가 어디에도 없었다.
 *
 * 그래서 값은 건드리지 않는다(고치면 그게 리밸런스다). 대신 **이탈에 사유를 강제**한다.
 *
 * 이 가드가 잡는 것
 *   - 산식과 다른 티어를 사유 없이 새로 박는 것
 *   - p·s·u·f를 고쳐 놓고 티어를 안 옮기는 것 (이탈이 새로 생기면 걸린다)
 *   - 반대로 이탈이 사라졌는데 사유 표식만 남는 것 (낡은 `rare`)
 *   - `rare`를 **올리는** 방향에 쓰는 것 (머리말 정의는 낮추는 방향뿐이다)
 *
 * 못 잡는 것
 *   - **p·s·u·f 값 자체가 실전과 맞는가.** 네 축은 사람이 매기는 값이라 기계가 검산할
 *     대상이 없다. 이 가드는 "표가 자기 산식과 일치하는가"까지만 본다.
 *   - 사유 문구가 **참인가.** 문자열이 있는지만 본다.
 */

import { describe, expect, it } from "vitest";
import {
  AUGMENT_POWER_TIERS,
  POWER_TIER_ORDER,
  deviatesFromFormula,
  formulaTier,
  powerScore,
} from "@majak/core";
import type { PowerTier, PowerTierEntry } from "@majak/core";
import { ALL_AUGMENTS } from "./catalogSource.js";

/** 정직한 사유를 못 적은 행이 다는 표식 — 늘어나지 못하게 개수를 못박는다 */
const REVIEW_MARK = "⚠ 재평가 필요";

/**
 * 사유를 정직하게 못 적어 **빚으로 남긴** 행. 값을 함부로 고치면 그게 조용한
 * 리밸런스이므로 값은 그대로 두고 여기 적어 둔다 — 목록은 줄기만 하고 늘지 못한다.
 */
const REVIEW_DEBT = new Set(["big_hand"]);

const entries = Object.entries(AUGMENT_POWER_TIERS) as [string, PowerTierEntry][];
const rank = (t: PowerTier): number => POWER_TIER_ORDER.indexOf(t);

describe("파워 티어표 자기 정합성", () => {
  it("산식을 벗어난 행은 전부 사유(rare 또는 tierOverride)를 단다", () => {
    const unjustified = entries
      .filter(([, e]) => deviatesFromFormula(e))
      .filter(([, e]) => e.rare !== true && e.tierOverride === undefined)
      .map(
        ([id, e]) =>
          `${id}: 표=${e.tier} 산식=${formulaTier(powerScore(e))}(${powerScore(e)}점)`,
      );
    expect(unjustified, "사유 없이 산식을 벗어난 행").toEqual([]);
  });

  it("이탈이 없는 행에는 사유 표식이 남아 있지 않다", () => {
    const stale = entries
      .filter(([, e]) => !deviatesFromFormula(e))
      .filter(([, e]) => e.rare === true || e.tierOverride !== undefined)
      .map(([id]) => id);
    expect(stale, "낮춘 적 없는데 붙어 있는 사유 표식").toEqual([]);
  });

  it("rare는 낮추는 방향에만 쓴다", () => {
    // POWER_TIER_ORDER는 강한 것부터라 인덱스가 작을수록 강하다.
    const wrongWay = entries
      .filter(([, e]) => e.rare === true)
      .filter(([, e]) => rank(e.tier) < rank(formulaTier(powerScore(e))))
      .map(([id]) => id);
    expect(wrongWay, "산식보다 올리면서 rare를 단 행").toEqual([]);
  });

  it("재평가 빚은 기록된 목록 그대로다 (늘지 않는다)", () => {
    const debt = entries
      .filter(([, e]) => e.tierOverride?.startsWith(REVIEW_MARK) === true)
      .map(([id]) => id);
    expect(new Set(debt)).toEqual(REVIEW_DEBT);
  });

  it("p·s·u·f는 1~5 정수다", () => {
    const bad = entries
      .filter(([, e]) =>
        [e.p, e.s, e.u, e.f].some((v) => !Number.isInteger(v) || v < 1 || v > 5),
      )
      .map(([id]) => id);
    expect(bad).toEqual([]);
  });

  it("티어표와 카탈로그가 서로를 다 덮는다", () => {
    const catalog = new Set(ALL_AUGMENTS.map((a) => a.id));
    const table = new Set(entries.map(([id]) => id));
    expect([...catalog].filter((id) => !table.has(id)), "티어 미분류 증강").toEqual([]);
    expect([...table].filter((id) => !catalog.has(id)), "삭제된 증강의 티어 행").toEqual(
      [],
    );
  });
});
