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
import { disarm } from "../src/augments/disarm.js";
import type { BotDecisionContext } from "@majak/core";
import { plan, readiness, reviewedFleeting } from "../src/augments/botPlan.js";
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
    placement: { rank: 2, allLast: false, riskAppetite: 0 },
    handPoints: 3900,
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
    expect(readiness("score", ctx({ tenpai: true, shanten: 0, handPoints: 8000 }))).toBe(1);
    expect(readiness("score", ctx({ shanten: 4 }))).toBe(0);
  });

  it("같은 텐파이라도 싸구려 손에는 배율이 덜 값나간다", () => {
    const rich = readiness("score", ctx({ tenpai: true, shanten: 0, handPoints: 8000 }));
    const poor = readiness("score", ctx({ tenpai: true, shanten: 0, handPoints: 1000 }));
    expect(poor).toBeLessThan(rich);
  });

  it("올라스에 까는 포석은 값이 없다 — 회수할 국이 없다", () => {
    const early = ctx({ turn: 2 });
    const last = ctx({ turn: 2, placement: { rank: 1, allLast: true, riskAppetite: 0 } });
    expect(readiness("setup", early)).toBeGreaterThan(0);
    expect(readiness("setup", last)).toBe(0);
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

describe("순위가 증강 판단을 바꾼다", () => {
  const at = (riskAppetite: number, rank: number) =>
    ctx({ tenpai: true, shanten: 0, threat: 1, handPoints: 8000, placement: { rank, allLast: true, riskAppetite } });

  it("올라스 선두는 점수 증강을 덜 태우고 방어 증강을 더 태운다", () => {
    const leader = at(-1, 1);
    const chaser = at(1, 4);
    expect(weightOf(always("score"), leader)).toBeLessThan(weightOf(always("score"), chaser));
    expect(weightOf(always("defend"), leader)).toBeGreaterThan(
      weightOf(always("defend"), chaser),
    );
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

/**
 * `fleeting`을 다시 본 것들 — 정책 63개 중 **46개가 `fleeting: true`** 였고,
 * 그중 상당수는 "지금 아니면 없는" 발동이 아니라 **자기 순이면 언제든 되는** 것이었다.
 * 무장해제·기생충·재장전이 그렇다. `fleeting`이 붙어 있으니 planner의 적기 판단이
 * 통째로 건너뛰어졌고, 결과는 아무 이유 없이 1순에 태우는 것이었다.
 *
 * 곧바로 갈아치우지 않고 `plantime` 스위치 뒤에 뒀다 — 켜면 적기를 보고, 끄면 예전 그대로.
 */
describe("다시 본 fleeting (plantime)", () => {
  const PLANTIME = new Set(["plantime"]);
  const reviewed = always("disrupt", { fleeting: reviewedFleeting });

  it("스위치가 꺼져 있으면 예전 그대로 — 1순에도 그냥 발동한다", () => {
    expect(fire(reviewed, ctx({ turn: 1, threat: 0 }))).toEqual(OPT);
  });

  it("스위치를 켜면 아무 일도 없는 1순에는 미룬다", () => {
    expect(fire(reviewed, ctx({ turn: 1, threat: 0, flags: PLANTIME }))).toBeNull();
  });

  it("스위치를 켜도 때가 오면 발동한다 (미루는 것이지 봉인이 아니다)", () => {
    expect(fire(reviewed, ctx({ turn: 1, threat: 0.9, flags: PLANTIME }))).toEqual(OPT);
    expect(fire(reviewed, ctx({ turn: 12, threat: 0, flags: PLANTIME }))).toEqual(OPT);
  });

  it("진짜 fleeting(true)은 스위치와 무관하게 그대로 발동한다", () => {
    const real = always("disrupt", { fleeting: true });
    expect(fire(real, ctx({ turn: 1, threat: 0, flags: PLANTIME }))).toEqual(OPT);
  });
});

/**
 * 채택된 1차 배치 — 스위치 없이도 적기를 본다. 실제 증강 정의로 검사한다
 * (여기서 놓치면 "재검토했다"는 기록만 남고 동작은 예전 그대로일 수 있다).
 */
describe("채택된 배치 1 — 무장해제는 아무 일 없는 1순에 태우지 않는다", () => {
  const DISARM_ACTION = { type: "disarm_lock", payload: { target: "p1" } };
  const view = {
    players: [
      { id: "p0", augments: ["disarm"] },
      { id: "p1", augments: ["big_hand", "jackpot"] },
    ],
  } as unknown as BotDecisionContext["view"];

  const fireDisarm = (over: Partial<BotDecisionContext>) =>
    botChosenOption(
      disarm.bot?.choose({ ...ctx({ view, options: [DISARM_ACTION], ...over }) }) ?? null,
    );

  it("1순·무위협에는 미룬다 (예전에는 그냥 태웠다)", () => {
    expect(fireDisarm({ turn: 1, threat: 0 })).toBeNull();
  });

  it("위협이 서면 발동한다", () => {
    expect(fireDisarm({ turn: 1, threat: 0.9 })).toEqual(DISARM_ACTION);
  });

  it("판이 무르익으면 발동한다", () => {
    expect(fireDisarm({ turn: 12, threat: 0 })).toEqual(DISARM_ACTION);
  });
});
