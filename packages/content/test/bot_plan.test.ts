/**
 * 의도 선언형 봇 정책 — 증강이 **각본 대신 의도**를 말하는지 검증한다.
 *
 * 배경. 정책 62개를 세어 보면 **23개가 "제시되면 무조건 발동"** 한 줄이었고, 발동
 * 강도를 밝힌 것은 단 2개였다. 타이밍을 신경 쓴 소수는 각자 자기 파일에 같은 조건문
 * (`!someoneRiichi && turnCount < N → null`)을 복붙해 두고 있었다 — 증강이 100개 더
 * 들어오면 그 복붙도 100번 늘어난다. 차터의 "증강 1000개를 엔진 수정 없이"가 봇
 * 쪽에서 깨지는 지점이 정확히 여기였다.
 *
 * 지금 정책은 둘만 말한다 — **무엇을 하는 물건인가**(intent)와 **어느 선택지인가**(pick).
 * "지금이 때인가"는 증강이 아니라 판의 문제라 planner가 한 곳에서 답한다.
 */

import { describe, expect, it } from "vitest";
import { botChosenOption } from "@majak/core";
import type { BotDecisionContext } from "@majak/core";
import { plan, readiness } from "../src/augments/botPlan.js";
import type { AugmentIntent } from "../src/augments/botPlan.js";

const OPT = { type: "x", payload: {} };

/** 판 하나를 세운다 (planner가 보는 값만 채운다) */
function ctx(over: Partial<BotDecisionContext> = {}): BotDecisionContext {
  return {
    view: {} as BotDecisionContext["view"],
    options: [OPT],
    holder: "p0",
    rng: { int: () => 0, float: () => 0 },
    tenpai: false,
    shanten: 3,
    waits: [],
    turn: 6,
    wallLeft: 60,
    threat: 0,
    remaining: () => 4,
    safety: () => 1,
    ...over,
  };
}

const fire = (spec: Parameters<typeof plan>[0], c: BotDecisionContext) =>
  botChosenOption(spec.pick === undefined ? null : plan(spec).choose(c));

const weightOf = (spec: Parameters<typeof plan>[0], c: BotDecisionContext): number => {
  const picked = plan(spec).choose(c);
  return picked !== null && "weight" in picked ? picked.weight : 0;
};

const always = (intent: AugmentIntent, over = {}) => ({
  intent,
  pick: () => OPT,
  ...over,
});

describe("적기 — 판에서 나오는 값이지 증강이 정하는 값이 아니다", () => {
  it("방어는 위협이 실재할 때만 값이 있다", () => {
    expect(readiness("defend", ctx({ threat: 0 }))).toBe(0);
    expect(readiness("defend", ctx({ threat: 1 }))).toBe(1);
  });

  it("값 올리기는 **이길 손에만** 값이 붙는다 — 4샹텐 잡손에 배율을 걸지 않는다", () => {
    expect(readiness("score", ctx({ tenpai: true, shanten: 0 }))).toBe(1);
    expect(readiness("score", ctx({ shanten: 4 }))).toBe(0);
  });

  it("손 밀기는 갈 길과 시간이 남아 있을 때 값이 있다", () => {
    expect(readiness("advance", ctx({ shanten: 1 }))).toBeGreaterThan(
      readiness("advance", ctx({ shanten: 4 })),
    );
    // 패산이 마르면 밀어도 닿지 않는다
    expect(readiness("advance", ctx({ shanten: 1, wallLeft: 4 }))).toBeLessThan(
      readiness("advance", ctx({ shanten: 1, wallLeft: 60 })),
    );
  });

  it("정보는 쓸 데가 있을 때 값이 있다 — 위험하거나, 손이 여물었거나, 판이 무르익었거나", () => {
    expect(readiness("inform", ctx({ turn: 1, shanten: 5 }))).toBe(0);
    expect(readiness("inform", ctx({ turn: 1, shanten: 5, threat: 1 }))).toBe(1);
    expect(readiness("inform", ctx({ turn: 1, tenpai: true, shanten: 0 }))).toBe(1);
    expect(readiness("inform", ctx({ turn: 11, shanten: 5 }))).toBe(1);
  });

  it("포석은 회수할 시간이 남아 있을 때만", () => {
    expect(readiness("setup", ctx({ turn: 2 }))).toBeGreaterThan(
      readiness("setup", ctx({ turn: 10 })),
    );
  });

  it("화료는 언제나 지금이다", () => {
    expect(readiness("win", ctx({ turn: 17, threat: 0, shanten: 6 }))).toBe(1);
  });
});

describe("발동 문턱 — 때가 아니면 미룬다", () => {
  it("1순째 아무 일도 없는데 정보를 태우지 않는다 (예전 봇이 하던 낭비)", () => {
    expect(fire(always("inform"), ctx({ turn: 1, shanten: 5 }))).toBeNull();
  });

  it("같은 정보 증강도 텐파이면 그 자리에서 쓴다", () => {
    expect(fire(always("inform"), ctx({ turn: 1, tenpai: true, shanten: 0 }))).toEqual(OPT);
  });

  it("위협이 없으면 방어를 켜지 않는다", () => {
    expect(fire(always("defend"), ctx({ threat: 0 }))).toBeNull();
    expect(fire(always("defend"), ctx({ threat: 1 }))).toEqual(OPT);
  });

  it("미룰 수 없는 발동(fleeting)은 적기를 따지지 않는다", () => {
    const far = ctx({ turn: 1, shanten: 6 });
    expect(fire(always("score"), far)).toBeNull();
    expect(fire(always("score", { fleeting: true }), far)).toEqual(OPT);
  });

  it("한 번뿐인 발동은 어중간한 자리에서 태우지 않는다", () => {
    // 문턱만 다르고 나머지는 같은 판
    const mid = ctx({ turn: 7, shanten: 5 });
    expect(fire(always("inform"), mid)).toEqual(OPT);
    expect(fire(always("inform", { oneShot: true }), mid)).toBeNull();
  });

  it("고를 것이 없으면(pick이 null) 판이 아무리 좋아도 발동하지 않는다", () => {
    expect(fire({ intent: "win", pick: () => null }, ctx())).toBeNull();
  });
});

describe("강도 — 의도가 대역을 정하고 적기가 그 안에서 흔든다", () => {
  it("급한 의도가 한가한 의도를 이긴다 (같은 판에서)", () => {
    // 텐파이 + 리치를 맞은 판 — 지금 급한 것은 화료와 방어다.
    const good = ctx({ tenpai: true, shanten: 0, threat: 1, turn: 6 });
    const w = (i: AugmentIntent) => weightOf(always(i), good);
    expect(w("win")).toBeGreaterThan(w("defend"));
    expect(w("defend")).toBeGreaterThan(w("disrupt"));
    expect(w("disrupt")).toBeGreaterThan(w("setup"));
    expect(w("setup")).toBeGreaterThan(w("inform"));
    // 텐파이 손에서 '더 미는' 증강은 값이 낮은 게 맞다 — 밀 곳이 이미 없다.
    expect(w("advance")).toBeLessThan(w("defend"));
  });

  it("손을 미는 판에서는 밀기가 정보를 이긴다", () => {
    const building = ctx({ shanten: 1, turn: 6 });
    expect(weightOf(always("advance"), building)).toBeGreaterThan(
      weightOf(always("inform"), building),
    );
  });

  it("같은 의도라도 때가 맞을수록 세게 태운다", () => {
    const now = ctx({ threat: 1 });
    const meh = ctx({ threat: 0.3 });
    expect(weightOf(always("defend"), now)).toBeGreaterThan(weightOf(always("defend"), meh));
  });

  it("정책이 숫자를 직접 쓰지 않아도 강도가 나온다", () => {
    expect(weightOf(always("defend"), ctx({ threat: 1 }))).toBeGreaterThan(0);
  });
});

describe("의도 선언형으로 옮긴 증강들", () => {
  it("옮긴 정책은 의도를 밖으로 드러낸다 (도구·커버리지가 읽을 수 있게)", async () => {
    const { uraPeek } = await import("../src/augments/ura_peek.js");
    const { invincible } = await import("../src/augments/invincible.js");
    expect((uraPeek.bot as { intent?: string }).intent).toBe("inform");
    expect((invincible.bot as { intent?: string }).intent).toBe("defend");
  });

  it("무적: 예전에 파일마다 복붙돼 있던 '리치가 있을 때만' 판정이 planner로 옮겨졌다", async () => {
    const { invincible } = await import("../src/augments/invincible.js");
    const opt = { type: "invincible_guard", payload: {} };
    const at = (threat: number) =>
      botChosenOption(
        invincible.bot?.choose({ ...ctx({ threat }), options: [opt] }) ?? null,
      );
    expect(at(0)).toBeNull();
    expect(at(1)).toEqual(opt);
  });
});
