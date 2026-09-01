/**
 * 가드 ② — 파워 티어표가 **자기 기준과 어긋나면 사유를 남긴다**.
 *
 * ## 기준이 바뀌었다 (2026-09-01)
 *
 * 예전 기준은 산식 총점(`p*3 + s*3 + u*2 + f*2`)이었다. 반장전 10,050판 실측으로
 * 재 보니 그 산식은 "그래서 이걸 든 사람이 이겼는가"에 잘 답하지 못했다 —
 * 스피어만 상관 -0.49, A(2.509)와 B(2.469)는 순서가 아예 뒤집혀 있었다.
 *
 * 티어는 `POWER_TIER_WEIGHT`를 거쳐 **드롭 확률**이 되므로 결과에 답해야 한다.
 * 그래서 티어의 입력이 산식 총점에서 **실측 종합점수**(`AUGMENT_MEASURED`)로 바뀌었다.
 * 네 축(p·s·u·f)은 설계 의도를 적는 자리로 남아 봇 발동 우선순위를 계속 담당한다.
 *
 * 그래서 이 가드가 보는 것도 "표가 **산식**과 일치하는가"에서 "표가 **자기 기준**
 * (`baseTier` — 실측이 있으면 실측, 없으면 산식)과 일치하는가"로 옮겼다.
 *
 * 이 가드가 잡는 것
 *   - 기준과 다른 티어를 사유 없이 박는 것 (`shift`/`fixed`에 사유가 없다)
 *   - 반대로 이탈이 사라졌는데 사유 표식만 남는 것 (낡은 `rare`)
 *   - `rare`를 **올리는** 방향에 쓰는 것 (정의는 낮추는 방향뿐이다)
 *   - `shift`가 실제 티어와 안 맞는 것 (계산 경로가 깨지면 걸린다)
 *   - 분위수 컷이 제 일을 못 해 **한 티어에 증강이 몰리는 것**
 *   - **표본이 얇은 실측으로 티어를 정하는 것** (2026-09-01 새로 추가)
 *
 * 못 잡는 것
 *   - **실측이 참인가.** 봇 시뮬레이션이라 사람의 판단과는 다르다. 이 가드는
 *     "표가 자기가 적어 둔 실측과 일치하는가"까지만 본다.
 *   - **p·s·u·f 값이 실전과 맞는가.** 네 축은 사람이 매기는 설계 의도값이다.
 *   - 사유 문구가 **참인가.** 문자열이 있는지만 본다.
 */

import { describe, expect, it } from "vitest";
import {
  AUGMENT_MEASURED,
  AUGMENT_POWER_TIERS,
  FORMULA_TIERS,
  MEASURED_CUTS,
  POWER_TIER_ORDER,
  TIER_CUTS,
  baseTier,
  formulaTier,
  measuredTier,
  powerScore,
  shiftTier,
} from "@majak/core";
import type { PowerTier, PowerTierEntry } from "@majak/core";
import { ALL_AUGMENTS } from "./catalogSource.js";

/** 정직한 사유를 못 적은 행이 다는 표식 — 늘어나지 못하게 개수를 못박는다 */
const REVIEW_MARK = "⚠ 재평가 필요";

/**
 * 사유를 정직하게 못 적어 **빚으로 남긴** 행.
 *
 * 2026-09-01 실측 전환으로 비었다 — 유일한 빚이었던 `big_hand`는 "산식이 왜 이걸
 * 못 담는가"를 못 적어 남은 것이었는데, 티어가 이제 실측에서 나오므로 그 이탈 자체가
 * 사라졌다. 목록은 줄기만 하고 늘지 못한다.
 */
const REVIEW_DEBT = new Set<string>([]);

/** 실측으로 티어를 정하려면 최소 이만큼의 판이 필요하다 (2026-09-01 최소 표본 344) */
const MIN_MEASURED_GAMES = 300;

const entries = Object.entries(AUGMENT_POWER_TIERS) as [string, PowerTierEntry][];
const rank = (t: PowerTier): number => POWER_TIER_ORDER.indexOf(t);
/** 이 행이 자기 기준(실측 또는 산식)에서 벗어났는가 */
const deviates = (id: string, e: PowerTierEntry): boolean =>
  e.fixed === undefined && e.tier !== baseTier(id, e);

describe("파워 티어표 자기 정합성", () => {
  it("기준을 벗어난 행은 전부 사유(rare 또는 tierOverride)를 단다", () => {
    const unjustified = entries
      .filter(([id, e]) => deviates(id, e))
      .filter(([, e]) => e.rare !== true && e.tierOverride === undefined)
      .map(([id, e]) => `${id}: 표=${e.tier} 기준=${baseTier(id, e)}`);
    expect(unjustified, "사유 없이 기준을 벗어난 행").toEqual([]);
  });

  it("이탈이 없는 행에는 사유 표식이 남아 있지 않다", () => {
    const stale = entries
      .filter(([id, e]) => !deviates(id, e) && e.fixed === undefined)
      .filter(([, e]) => e.rare === true || e.tierOverride !== undefined)
      .map(([id]) => id);
    expect(stale, "낮춘 적 없는데 붙어 있는 사유 표식").toEqual([]);
  });

  it("rare는 낮추는 방향에만 쓴다", () => {
    // POWER_TIER_ORDER는 강한 것부터라 인덱스가 작을수록 강하다.
    const wrongWay = entries
      .filter(([, e]) => e.rare === true)
      .filter(([id, e]) => rank(e.tier) < rank(baseTier(id, e)))
      .map(([id]) => id);
    expect(wrongWay, "기준보다 올리면서 rare를 단 행").toEqual([]);
  });

  it("확정 티어는 '기준 티어를 shift만큼 옮긴 것'과 정확히 같다", () => {
    const broken = entries
      .filter(([, e]) => e.fixed === undefined)
      .filter(([id, e]) => e.tier !== shiftTier(baseTier(id, e), e.shift ?? 0))
      .map(([id, e]) => `${id}: 표=${e.tier} shift=${e.shift ?? 0}`);
    expect(broken, "shift와 확정 티어가 어긋난 행").toEqual([]);
  });

  it("fixed는 산식 밖의 티어(SS+)에만 쓴다", () => {
    const wrong = entries
      .filter(([, e]) => e.fixed !== undefined)
      .filter(([, e]) => FORMULA_TIERS.includes(e.fixed as PowerTier))
      .map(([id]) => id);
    expect(wrong, "산식이 낼 수 있는 티어를 fixed로 박은 행").toEqual([]);
  });
});

describe("실측 기준 (2026-09-01)", () => {
  it("실측 행은 전부 티어표에 있고, 표본이 충분하다", () => {
    const table = new Set(entries.map(([id]) => id));
    const orphan = Object.keys(AUGMENT_MEASURED).filter((id) => !table.has(id));
    expect(orphan, "티어표에 없는 실측 행").toEqual([]);

    const thin = Object.entries(AUGMENT_MEASURED)
      .filter(([, m]) => m.n < MIN_MEASURED_GAMES)
      .map(([id, m]) => `${id}(${m.n}판)`);
    expect(thin, `표본 ${MIN_MEASURED_GAMES}판 미만으로 티어를 정한 행`).toEqual([]);
  });

  it("실측 컷은 강한 티어부터 내림차순이고 마지막은 바닥이다", () => {
    expect(MEASURED_CUTS.map((c) => c.tier)).toEqual([...FORMULA_TIERS]);
    for (let i = 1; i < MEASURED_CUTS.length; i++) {
      expect((MEASURED_CUTS[i] as { min: number }).min).toBeLessThan(
        (MEASURED_CUTS[i - 1] as { min: number }).min,
      );
    }
    // 마지막 티어는 바닥 없는 포괄 구간이다 — 실측 종합점수는 음수가 절반이다
    expect((MEASURED_CUTS[MEASURED_CUTS.length - 1] as { min: number }).min).toBe(
      -Infinity,
    );
  });

  it("실측만 놓고 보면 여섯 티어가 고르게 나뉜다 (±40% 안)", () => {
    const counts = new Map<PowerTier, number>();
    for (const m of Object.values(AUGMENT_MEASURED)) {
      const t = measuredTier(m.m);
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    const target = Object.keys(AUGMENT_MEASURED).length / FORMULA_TIERS.length;
    const off = FORMULA_TIERS.map((t) => ({ tier: t, n: counts.get(t) ?? 0 })).filter(
      (c) => Math.abs(c.n - target) > target * 0.4,
    );
    expect(off, `티어별 목표치 ${target.toFixed(1)}종에서 크게 벗어난 티어`).toEqual([]);
  });

  it("실측이 없는 행은 산식 티어를 쓴다", () => {
    const fallback = entries
      .filter(([id, e]) => e.fixed === undefined && AUGMENT_MEASURED[id] === undefined)
      .map(([id, e]) => ({ id, base: baseTier(id, e), formula: formulaTier(powerScore(e)) }))
      .filter((x) => x.base !== x.formula);
    expect(fallback, "실측이 없는데 산식으로 떨어지지 않은 행").toEqual([]);
  });
});

describe("분위수 컷 — 티어 수량이 비슷하다", () => {
  /** SS+(fixed)를 뺀, 산식이 매기는 행들만 센다 */
  const scored = entries.filter(([, e]) => e.fixed === undefined);

  it("산식 컷은 강한 티어부터 내림차순이고 마지막은 바닥이다", () => {
    expect(TIER_CUTS.map((c) => c.tier)).toEqual([...FORMULA_TIERS]);
    for (let i = 1; i < TIER_CUTS.length; i++) {
      expect((TIER_CUTS[i] as { min: number }).min).toBeLessThan(
        (TIER_CUTS[i - 1] as { min: number }).min,
      );
    }
    expect((TIER_CUTS[TIER_CUTS.length - 1] as { min: number }).min).toBe(-Infinity);
  });

  it("산식만 놓고 보면 여섯 티어가 고르게 나뉜다 (±40% 안)", () => {
    const counts = new Map<PowerTier, number>();
    for (const [, e] of scored) {
      const t = formulaTier(powerScore(e));
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    const target = scored.length / FORMULA_TIERS.length;
    const off = FORMULA_TIERS.map((t) => ({
      tier: t,
      n: counts.get(t) ?? 0,
    })).filter((c) => Math.abs(c.n - target) > target * 0.4);
    expect(off, `티어별 목표치 ${target.toFixed(1)}종에서 크게 벗어난 티어`).toEqual([]);
  });

  it("확정 티어(shift 반영)도 한 티어가 표를 삼키지 않는다", () => {
    const counts = new Map<PowerTier, number>();
    for (const [, e] of entries) counts.set(e.tier, (counts.get(e.tier) ?? 0) + 1);
    const share = 1 / FORMULA_TIERS.length;
    const hogs = FORMULA_TIERS.map((t) => ({
      tier: t,
      share: (counts.get(t) ?? 0) / entries.length,
    })).filter((c) => c.share > share * 2);
    expect(hogs, "균등 지분의 두 배를 넘는 티어").toEqual([]);
  });

  it("빈 티어가 없다", () => {
    const counts = new Map<PowerTier, number>();
    for (const [, e] of entries) counts.set(e.tier, (counts.get(e.tier) ?? 0) + 1);
    expect(FORMULA_TIERS.filter((t) => (counts.get(t) ?? 0) === 0)).toEqual([]);
  });
});

describe("파워 티어표 자기 정합성 (이어서)", () => {
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
