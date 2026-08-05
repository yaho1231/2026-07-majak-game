/**
 * 드래프트 — **네 봇이 같은 덱을 짓지 않는가.**
 *
 * 예전 드래프트는 파워 티어표 하나만 봤다. 그건 "이 증강이 센가"를 말하는 표이고,
 * 그것만 보면 네 봇이 전부 같은 기준으로 고른다 — 성격이 여섯 가지여도 덱은 한
 * 종류다. 그리고 그건 사람이 뽑는 방식도 아니다: 사람은 **자기 플레이와의 궁합**과
 * **지금 모으는 것과의 시너지**를 함께 본다.
 *
 * 다만 성격이 파워를 **뒤엎으면 안 된다.** 자기 취향에 맞는 약한 증강을 집는 봇은
 * 개성 있는 게 아니라 그냥 못 두는 것이다. 그 경계를 여기서 잡는다.
 */

import { describe, expect, it } from "vitest";
import { defineAugment } from "@majak/core";
import type { AugmentCategory, AugmentDef } from "@majak/core";
import { chooseDraft, draftScore } from "../src/bot/draft.js";
import type { DraftContext } from "../src/bot/draft.js";
import { profileOf } from "../src/bot/profile.js";
import type { ArchetypeName } from "../src/bot/profile.js";

/** 계열만 다른 가짜 증강 (파워는 ctx.powerOf가 준다) */
function fake(id: string, category: AugmentCategory): AugmentDef {
  return defineAugment({
    id,
    tier: "gold",
    category,
    name: id,
    description: "",
    install: () => {},
  });
}

const RIICHI = fake("aug_riichi", "riichi");
const DEFENSE = fake("aug_defense", "defense");
const CALL = fake("aug_call", "call");
const SCORING = fake("aug_scoring", "scoring");

const CATALOG = new Map<string, AugmentDef>(
  [RIICHI, DEFENSE, CALL, SCORING].map((d) => [d.id, d]),
);

/** 기본 문맥 — 모든 증강의 파워가 같다(궁합만 남긴다) */
function ctx(archetype: ArchetypeName, over: Partial<DraftContext> = {}): DraftContext {
  return {
    profile: profileOf(archetype),
    held: [],
    catalog: CATALOG,
    powerOf: () => 25,
    unusable: [],
    ...over,
  };
}

const firstOf = (n: number) => ({ int: () => 0, _: n });

describe("성격 궁합 — 같은 파워면 나한테 맞는 쪽", () => {
  it("공격형은 리치 증강을, 수비형은 방어 증강을 높게 본다", () => {
    expect(draftScore(RIICHI, ctx("attacker"))).toBeGreaterThan(
      draftScore(DEFENSE, ctx("attacker")),
    );
    expect(draftScore(DEFENSE, ctx("defender"))).toBeGreaterThan(
      draftScore(RIICHI, ctx("defender")),
    );
  });

  it("속공형은 후로 증강을, 타점형은 점수 증강을 높게 본다", () => {
    expect(draftScore(CALL, ctx("speedster"))).toBeGreaterThan(
      draftScore(SCORING, ctx("speedster")),
    );
    expect(draftScore(SCORING, ctx("valueHunter"))).toBeGreaterThan(
      draftScore(CALL, ctx("valueHunter")),
    );
  });

  it("균형형은 계열로 갈리지 않는다 (표 그대로)", () => {
    const c = ctx("balanced");
    expect(draftScore(RIICHI, c)).toBe(draftScore(DEFENSE, c));
  });
});

describe("성격은 파워를 뒤엎지 못한다", () => {
  it("취향에 안 맞아도 명백히 센 증강을 집는다", () => {
    // 방어 증강이 파워 40, 리치 증강이 20 — 공격형이라도 방어 쪽이 낫다
    const c = ctx("attacker", {
      powerOf: (id) => (id === DEFENSE.id ? 40 : 20),
    });
    expect(draftScore(DEFENSE, c)).toBeGreaterThan(draftScore(RIICHI, c));
  });

  it("궁합이 벌리는 폭은 파워 한 단계보다 작다", () => {
    const c = ctx("attacker");
    const ratio = draftScore(RIICHI, c) / draftScore(DEFENSE, c);
    expect(ratio).toBeLessThan(2);
  });
});

describe("시너지 — 모으던 계열이 값나간다", () => {
  it("같은 계열을 이미 들었으면 그 계열이 더 값나간다", () => {
    const alone = draftScore(SCORING, ctx("balanced"));
    const building = draftScore(
      SCORING,
      ctx("balanced", { held: [SCORING.id, "aug_scoring2"] }),
    );
    expect(building).toBeGreaterThan(alone);
  });

  it("한 계열로만 무한정 몰리지는 않는다 (상한이 있다)", () => {
    const many = ctx("balanced", { held: Array.from({ length: 10 }, () => SCORING.id) });
    const few = ctx("balanced", { held: [SCORING.id, SCORING.id, SCORING.id] });
    expect(draftScore(SCORING, many)).toBe(draftScore(SCORING, few));
  });
});

describe("봇이 못 쓰는 증강", () => {
  it("발동 판단을 못 하는 액티브는 크게 밀린다 (뽑아 봐야 놀린다)", () => {
    const c = ctx("balanced", { unusable: [SCORING.id] });
    expect(draftScore(SCORING, c)).toBeLessThan(draftScore(RIICHI, c));
  });

  it("그래도 0은 아니다 — 그것뿐이면 뽑는다", () => {
    const c = ctx("balanced", { unusable: [SCORING.id] });
    expect(chooseDraft([SCORING], c, firstOf(1))?.id).toBe(SCORING.id);
  });
});

describe("탁이 한 종류의 덱으로 채워지지 않는다", () => {
  it("같은 선택지를 줘도 원형마다 다른 것을 집는다", () => {
    const choices = [RIICHI, DEFENSE, CALL, SCORING];
    const picks = (["attacker", "defender", "speedster", "valueHunter"] as const).map(
      (name) => chooseDraft(choices, ctx(name), { int: () => 0 })?.id,
    );
    expect(new Set(picks).size).toBeGreaterThanOrEqual(3);
  });

  it("같은 성격·같은 시드면 같은 것을 집는다 (리플레이가 깨지지 않는다)", () => {
    const choices = [RIICHI, DEFENSE, CALL, SCORING];
    const a = chooseDraft(choices, ctx("attacker"), { int: () => 0 })?.id;
    const b = chooseDraft(choices, ctx("attacker"), { int: () => 0 })?.id;
    expect(a).toBe(b);
  });
});
