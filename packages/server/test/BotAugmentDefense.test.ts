/**
 * **상대 증강에 대한 대응** — 표(`AUGMENT_PLAY`)에 적은 것이 실제 판단까지 내려가는가.
 *
 * 2026-08-19 사용자 요청("최대한 다양한 증강에 대처")으로 대응 축이 넷으로 늘었다.
 * 각 축이 실제로 **결정을 바꾸는지**를 여기서 못박는다 — 표에 값만 적혀 있고 아무도
 * 안 읽는 상태는 "반영했다"는 착각으로 남기 때문이다.
 *
 *   1. 발동 채널 → 어느 패가 위험한가 (`fired`)
 *   2. 론 면역   → 그 사람에게는 무엇을 버려도 된다 (`ronImmune`)
 *   3. 현물 무효 → 그 사람에게는 100% 안전패가 없다 (`furitenBroken`)
 *   4. 무장해제  → 잠긴 증강은 무서워하지 않는다
 */

import { describe, expect, it } from "vitest";
import {
  NEUTRAL_DEFENSE,
  expectedLossOf,
  readThreats,
  safetyOf,
  tileTracker,
} from "../src/bot/danger.js";
import { effectiveAugmentsOf, isFuritenBroken, isRonImmune, readCollect } from "../src/bot/collect.js";
import { botScene, h } from "./botTestView.js";
import type { BotViewOptions } from "./botTestView.js";

const BASE: BotViewOptions = {
  hand: "123m456p789s11z22m",
  turnCount: 9,
  discards: { p1: "1z2z3z4z" },
};

function threatOf(opts: BotViewOptions) {
  const scene = botScene(opts);
  const threats = readThreats(scene.view, "p0", []);
  const t = threats.find((x) => x.player === "p1");
  if (t === undefined) throw new Error("p1 위협이 없다");
  return { scene, t, remaining: tileTracker(scene.view) };
}

describe("오픈 리치 — 공개된 오름패는 확정 정보다", () => {
  const OPEN: BotViewOptions = {
    ...BASE,
    riichi: ["p1"],
    augments: { p1: ["open_riichi_reveal"] },
    augmentView: { "open_riichi_reveal:p1": ["man3", "man6"] },
  };

  it("공개된 그 패의 안전도가 바닥으로 떨어진다", () => {
    const open = threatOf(OPEN);
    const quiet = threatOf({ ...OPEN, augmentView: {} });
    const m3 = h("3m")[0]!;
    expect(safetyOf(m3, [open.t], open.remaining, NEUTRAL_DEFENSE)).toBeLessThan(
      safetyOf(m3, [quiet.t], quiet.remaining, NEUTRAL_DEFENSE),
    );
    // 실점 추정도 함께 오른다 (비리치 방총은 역만이다)
    expect(expectedLossOf(m3, [open.t], open.remaining, NEUTRAL_DEFENSE)).toBeGreaterThan(
      expectedLossOf(m3, [quiet.t], quiet.remaining, NEUTRAL_DEFENSE),
    );
  });

  it("공개 목록에 없는 패까지 겁내지는 않는다", () => {
    const open = threatOf(OPEN);
    const quiet = threatOf({ ...OPEN, augmentView: {} });
    const p5 = h("5p")[0]!;
    expect(readCollect(open.scene.view, "p1").riskOf(p5)).toBe(1);
    // 현물은 여전히 현물이다 (공개 대기가 현물을 뒤집지는 않는다)
    expect(safetyOf(h("1z")[0]!, [quiet.t], quiet.remaining, NEUTRAL_DEFENSE)).toBe(1);
  });
});

describe("천하무적·불가침 조약 — 쏘일 수 없는 상대", () => {
  it("천하무적이 켜진 국에는 위협도가 0이 된다 (안전패를 아낄 이유가 없다)", () => {
    const on = threatOf({
      ...BASE,
      riichi: ["p1"], // 리치까지 걸어 위협도가 최대인 상태에서도
      augments: { p1: ["invincible"] },
      augmentView: { "invincible:p1": "이번 국 론 불가" },
    });
    expect(isRonImmune(on.scene.view, "p1")).toBe(true);
    expect(on.t.level).toBe(0);
    // 무스지 중장패조차 이 상대에게는 손실이 없다
    expect(expectedLossOf(h("5p")[0]!, [on.t], on.remaining, NEUTRAL_DEFENSE)).toBe(0);
  });

  it("들고만 있고 안 썼으면 평범한 상대다", () => {
    const off = threatOf({ ...BASE, riichi: ["p1"], augments: { p1: ["invincible"] } });
    expect(isRonImmune(off.scene.view, "p1")).toBe(false);
    expect(off.t.level).toBe(1);
  });

  it("불가침 조약은 기계가 읽는 채널로만 판정한다 (문구가 아니라)", () => {
    const active = botScene({
      ...BASE,
      augments: { p1: ["no_ron_pact"] },
      augmentView: { "no_ron_pact:active:p1": true, "no_ron_pact:p1": "조약 유효 — 6순까지 론 불가" },
    });
    expect(isRonImmune(active.view, "p1")).toBe(true);

    // 파기됐다: 사람이 읽는 문구가 남아 있어도 기계 채널이 false면 평범한 상대다
    const broken = botScene({
      ...BASE,
      augments: { p1: ["no_ron_pact"] },
      augmentView: { "no_ron_pact:active:p1": false, "no_ron_pact:p1": "조약 파기 — 론 가능" },
    });
    expect(isRonImmune(broken.view, "p1")).toBe(false);
  });
});

describe("현물이 안전패가 아닌 상대 (만개·조커·손바닥 뒤집기)", () => {
  /** p1이 1z를 버렸다 = 평소라면 1z는 100% 안전 */
  const withBloom = (augmentView: Record<string, unknown>, augs: string[]): BotViewOptions => ({
    ...BASE,
    riichi: ["p1"],
    augments: { p1: augs },
    augmentView,
  });

  it("평소에는 현물이 100% 안전하다 (대조군)", () => {
    const quiet = threatOf(withBloom({}, ["late_bloomer"]));
    expect(safetyOf(h("1z")[0]!, [quiet.t], quiet.remaining, NEUTRAL_DEFENSE)).toBe(1);
  });

  it("만개하면 현물이 더 이상 100%가 아니다", () => {
    const bloom = threatOf(withBloom({ "late_bloomer:p1": "만개" }, ["late_bloomer"]));
    expect(isFuritenBroken(bloom.scene.view, "p1")).toBe(true);
    expect(safetyOf(h("1z")[0]!, [bloom.t], bloom.remaining, NEUTRAL_DEFENSE)).toBeLessThan(1);
  });

  it("조커·손바닥 뒤집기도 같은 축으로 잡힌다", () => {
    const joker = threatOf(withBloom({ "joker:p1": true }, ["joker"]));
    expect(safetyOf(h("1z")[0]!, [joker.t], joker.remaining, NEUTRAL_DEFENSE)).toBeLessThan(1);

    const palm = threatOf(withBloom({ "palm_flip:p1": "1-1-0" }, ["palm_flip"]));
    expect(safetyOf(h("1z")[0]!, [palm.t], palm.remaining, NEUTRAL_DEFENSE)).toBeLessThan(1);
  });
});

describe("무장해제 — 잠긴 증강은 무서워하지 않는다", () => {
  it("잠긴 증강은 그 사람의 유효 목록에서 빠진다", () => {
    const scene = botScene({
      ...BASE,
      augments: { p1: ["eternal_dealer", "genesis"], p2: ["disarm"] },
      augmentView: { "disarm:p2": { target: "p1", augmentId: "eternal_dealer" } },
    });
    expect(effectiveAugmentsOf(scene.view, "p1")).toEqual(["genesis"]);
  });

  it("잠긴 개벽은 터져 있어도 읽지 않는다 (효과 자체가 꺼졌다)", () => {
    const scene = botScene({
      ...BASE,
      augments: { p1: ["genesis"], p2: ["disarm"] },
      augmentView: {
        "genesis:p1": true,
        "disarm:p2": { target: "p1", augmentId: "genesis" },
      },
    });
    expect(readCollect(scene.view, "p1").tags).toEqual([]);
  });

  it("다른 사람을 지목한 무장해제는 영향이 없다", () => {
    const scene = botScene({
      ...BASE,
      augments: { p1: ["genesis"], p2: ["disarm"] },
      augmentView: {
        "genesis:p1": true,
        "disarm:p2": { target: "p3", augmentId: "genesis" },
      },
    });
    expect(readCollect(scene.view, "p1").tags).toContain("genesis");
  });
});

describe("자패의 귀환 — 되받은 그 자패가 위험해진다", () => {
  it("채널에 실린 자패만 위험해지고, 빈 배열은 신호가 아니다", () => {
    const back = botScene({
      ...BASE,
      augments: { p1: ["honor_return"] },
      // 실제 채널은 TileKind 객체 배열로 실린다
      augmentView: { "honor_return:p1": [{ suit: "wind", rank: 1 }] },
    });
    const read = readCollect(back.view, "p1");
    expect(read.riskOf(h("1z")[0]!)).toBeGreaterThan(1);
    expect(read.riskOf(h("2z")[0]!)).toBe(1);

    const spent = botScene({
      ...BASE,
      augments: { p1: ["honor_return"] },
      augmentView: { "honor_return:p1": [] }, // 이미 주입돼 비워졌다
    });
    expect(readCollect(spent.view, "p1").tags).toEqual([]);
  });
});
