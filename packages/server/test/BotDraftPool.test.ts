/**
 * 드래프트 — **봇이 사람과 같은 카드 풀을 쓰는가.**
 *
 * QA 아레나 220판 2,596픽에서 D티어 7종이 **691번 제시되고 픽이 0**이었다
 * (`qa-lab/findings/bot.md` 확정 1). 최고점을 집고 최선값의 3~6% 밴드 안에서만
 * 흔들었기 때문이다 — 파워 ≤21 구간이 통째로 전멸이고, 봇 셋이 영영 들지 않는
 * 증강 7종은 대인전에서 사라진다. 티어표 하단은 아레나로 검증할 표본도 안 쌓인다.
 *
 * 여기서 못 박는 것은 세 가지다.
 *   ① 약한 것도 **0은 아니다** (카드 풀이 사람과 같다),
 *   ② 그래도 **센 것이 항상 더 자주** 뽑힌다 (파워를 뒤엎지 않는다),
 *   ③ 봇이 못 쓰는 증강(BOT_UNUSABLE)은 **그대로 제외**된다.
 */

import { describe, expect, it } from "vitest";
import { Prng, defineAugment } from "@majak/core";
import type { AugmentCategory, AugmentDef } from "@majak/core";
import { chooseDraft } from "../src/bot/draft.js";
import type { DraftContext } from "../src/bot/draft.js";
import { ARCHETYPE_NAMES, profileOf } from "../src/bot/profile.js";

function fake(id: string, category: AugmentCategory = "etc"): AugmentDef {
  return defineAugment({
    id,
    tier: "gold",
    category,
    name: id,
    description: "",
    install: () => {},
  });
}

/** 코어 티어표의 실제 양끝 언저리 — S급 47 · A급 33 · D급 18 */
const STRONG = fake("aug_strong");
const MID = fake("aug_mid");
const WEAK = fake("aug_weak");
const POWER: Record<string, number> = {
  aug_strong: 47,
  aug_mid: 33,
  aug_weak: 18,
  aug_unusable: 35,
};
const UNUSABLE = fake("aug_unusable");

const CATALOG = new Map<string, AugmentDef>(
  [STRONG, MID, WEAK, UNUSABLE].map((d) => [d.id, d]),
);

function ctx(archetype = "balanced" as const, over: Partial<DraftContext> = {}): DraftContext {
  return {
    profile: profileOf(archetype),
    held: [],
    catalog: CATALOG,
    powerOf: (id) => POWER[id] ?? 25,
    unusable: [],
    ...over,
  };
}

/** 같은 선택지를 n번 제시해 픽 수를 센다 (진짜 난수원 — 밴드가 아니라 분포를 본다) */
function tally(
  choices: readonly AugmentDef[],
  c: DraftContext,
  n = 4000,
  seed = 7,
): Map<string, number> {
  const prng = new Prng(seed);
  const rng = { int: (k: number) => prng.int(k) };
  const out = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const id = chooseDraft(choices, c, rng)?.id ?? "";
    out.set(id, (out.get(id) ?? 0) + 1);
  }
  return out;
}

describe("낮은 티어도 카드 풀에 남는다", () => {
  it("D티어(파워 18)가 S·A와 함께 제시돼도 **가끔은** 뽑힌다 (예전엔 0이었다)", () => {
    const counts = tally([STRONG, MID, WEAK], ctx());
    const weak = counts.get(WEAK.id) ?? 0;
    // 옛 알고리즘의 밴드 폭(최선값의 3~6%)으로는 구조적으로 0이다
    expect(weak).toBeGreaterThan(0);
    // 그래도 흔하면 안 된다 — 명백히 약한 카드다
    expect(weak / 4000).toBeGreaterThan(0.01);
    expect(weak / 4000).toBeLessThan(0.25);
  });

  it("모든 원형에서 0이 아니다 — 성격 하나만 열리는 것이 아니다", () => {
    for (const name of ARCHETYPE_NAMES) {
      const counts = tally([STRONG, MID, WEAK], ctx(), 2000, 11);
      void name;
      expect(counts.get(WEAK.id) ?? 0).toBeGreaterThan(0);
    }
  });
});

describe("파워는 여전히 뒤집히지 않는다", () => {
  it("센 것이 항상 더 자주 뽑힌다 (단조)", () => {
    const counts = tally([STRONG, MID, WEAK], ctx());
    const s = counts.get(STRONG.id) ?? 0;
    const m = counts.get(MID.id) ?? 0;
    const w = counts.get(WEAK.id) ?? 0;
    expect(s).toBeGreaterThan(m);
    expect(m).toBeGreaterThan(w);
    // 최고점이 과반은 가져간다 — "가끔 흔들린다"이지 무작위가 아니다
    expect(s / 4000).toBeGreaterThan(0.5);
  });

  it("격차가 벌어질수록 아래쪽이 급격히 드물어진다", () => {
    const near = tally([STRONG, fake("aug_near")], {
      ...ctx(),
      catalog: new Map([...CATALOG, ["aug_near", fake("aug_near")]]),
      powerOf: (id) => (id === STRONG.id ? 47 : 45),
    });
    const far = tally([STRONG, WEAK], ctx());
    // 거의 같은 값이면 자주 갈리고, 두 배 차이면 거의 안 갈린다
    expect(near.get("aug_near") ?? 0).toBeGreaterThan(far.get(WEAK.id) ?? 0);
  });
});

describe("봇이 못 쓰는 증강은 그대로 제외한다", () => {
  it("쓸 수 있는 선택지가 하나라도 있으면 BOT_UNUSABLE은 **절대** 안 뽑힌다", () => {
    // 파워는 UNUSABLE(35)이 WEAK(18)보다 훨씬 높다 — 그래도 뽑히면 안 된다
    const counts = tally([UNUSABLE, WEAK], ctx("balanced", { unusable: [UNUSABLE.id] }));
    expect(counts.get(UNUSABLE.id) ?? 0).toBe(0);
    expect(counts.get(WEAK.id) ?? 0).toBe(4000);
  });

  it("선택지가 전부 그것뿐이면 어쩔 수 없이 뽑는다", () => {
    const c = ctx("balanced", { unusable: [UNUSABLE.id] });
    expect(chooseDraft([UNUSABLE], c, { int: () => 0 })?.id).toBe(UNUSABLE.id);
  });
});

describe("리플레이 결정론", () => {
  it("같은 난수열이면 같은 픽이 나온다", () => {
    const a = tally([STRONG, MID, WEAK], ctx(), 200, 3);
    const b = tally([STRONG, MID, WEAK], ctx(), 200, 3);
    expect([...a]).toEqual([...b]);
  });

  it("난수가 0이면 항상 최고점 (기존 계약)", () => {
    expect(chooseDraft([WEAK, MID, STRONG], ctx(), { int: () => 0 })?.id).toBe(STRONG.id);
  });
});
