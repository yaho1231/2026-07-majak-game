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

/**
 * 값어치 표 — 점수 증강의 적기는 "이 손이 값이 붙을 손인가"를 묻는데, 그 손 값어치에
 * **내가 든 패시브가 빠져 있었다.** 뚫린 천장을 들고도 평범한 손으로 세면, 이미 비싼
 * 손을 싸구려로 보고 접는다.
 */
describe("내 증강이 내 손 값어치에 반영된다", () => {
  const ON = undefined;
  const withAug = (augments: string[], flags?: ReadonlySet<string>) =>
    ctx({
      handPoints: 2600,
      shanten: 1,
      ...(flags === undefined ? {} : { flags }),
      view: {
        players: [{ id: "p0", augments }],
      } as unknown as BotDecisionContext["view"],
    });

  it("상한을 없애는 증강을 들었으면 같은 손이 더 값나간다", () => {
    expect(readiness("score", withAug(["aotenjou_ceiling"], ON))).toBeGreaterThan(
      readiness("score", withAug([], ON)),
    );
  });

  it("방해·정보 증강은 손 값어치를 바꾸지 않는다", () => {
    expect(readiness("score", withAug(["disarm", "xray_hand"], ON))).toBe(
      readiness("score", withAug([], ON)),
    );
  });

});

/**
 * `rewrite` — 측정이 만들어 낸 의도다.
 *
 * 개벽·짝수의 세계를 `advance`로 묶어 적기를 보게 했더니 400배패에서 순위
 * −0.0037 ± 0.0094로 미세하게 밀렸다. 원인은 방향이었다 — 전진 적기는
 * "가까울수록 밀 값이 있다"인데, **손을 통째로 갈아엎는 물건은 정반대**다.
 * 적기 게이트가 그 물건이 가장 필요한 자리(잡손)에서 정확히 막고 있었다.
 */
describe("갈아엎기(rewrite) — 전진과 정확히 반대 방향이다", () => {
  it("잡손일수록 값이 오른다", () => {
    expect(readiness("rewrite", ctx({ shanten: 4 }))).toBeGreaterThan(
      readiness("rewrite", ctx({ shanten: 2 })),
    );
  });

  it("다 된 손은 흩지 않는다 (텐파이·1샹텐은 0)", () => {
    expect(readiness("rewrite", ctx({ shanten: 0, tenpai: true }))).toBe(0);
    expect(readiness("rewrite", ctx({ shanten: 1 }))).toBe(0);
  });

  it("전진과 방향이 반대다 (같은 손을 정반대로 본다)", () => {
    const bad = ctx({ shanten: 4 });
    const close = ctx({ shanten: 1 });
    expect(readiness("rewrite", bad)).toBeGreaterThan(readiness("rewrite", close));
    expect(readiness("advance", bad)).toBeLessThan(readiness("advance", close));
  });

  it("회수할 순목이 없으면 갈아엎어도 소용없다", () => {
    expect(readiness("rewrite", ctx({ shanten: 4, wallLeft: 0 }))).toBe(0);
  });
});

/**
 * 의도 배정 — **축이 맞는가.**
 *
 * 배치 2가 걸린 함정이 정확히 이것이었다. 손을 통째로 갈아엎는 물건을 `advance`로
 * 묶으면, 적기가 "가까울수록 값이 있다"로 계산돼 **그 물건이 가장 필요한 자리에서
 * 값을 깎는다.** 전수로 훑어 같은 함정 다섯을 더 찾았다.
 *
 * 여섯은 전부 `fleeting: true`라 **발동 여부는 안 바뀐다** — 바뀌는 것은 여러 액티브가
 * 동시에 발동하고 싶을 때의 **입찰 강도**다. 그 강도가 반대 방향이면, 잡손에서 손을
 * 갈아엎을 기회를 다른 증강에게 뺏긴다.
 */
describe("갈아엎기로 다시 배정한 것들", () => {
  const REWRITE = ["table_flip", "suit_unify", "full_hand_swap", "picky_eater", "seat_swap"];

  it("손을 통째로 바꾸는 다섯은 rewrite다 (advance가 아니다)", async () => {
    const mod = await import("../src/index.js");
    const byId = new Map(mod.contentAugments.map((d) => [d.id, d]));
    for (const id of REWRITE) {
      const policy = byId.get(id)?.bot as { intent?: string } | undefined;
      expect(policy?.intent, id).toBe("rewrite");
    }
  });

  it("등 떠밀기는 방해다 — 내 손이 아니라 상대를 건드린다", async () => {
    const mod = await import("../src/index.js");
    const byId = new Map(mod.contentAugments.map((d) => [d.id, d]));
    expect((byId.get("push_riichi")?.bot as { intent?: string }).intent).toBe("disrupt");
  });

  it("잡손에서 갈아엎기의 강도가 전진보다 높다 (뺏기지 않는다)", () => {
    const junk = ctx({ shanten: 4, wallLeft: 60 });
    expect(readiness("rewrite", junk)).toBeGreaterThan(readiness("advance", junk));
  });
});

/**
 * **문턱과 적기가 서로 맞물려 정책을 죽이지 않는가.**
 *
 * 시간 정지가 정확히 그렇게 죽어 있었다 — `pick`이 텐파이일 때만 후보를 내는데
 * `advance` 적기의 텐파이 값(0.3)이 `oneShot` 문턱(0.15+0.2=0.35)보다 낮아,
 * **조건이 맞는 유일한 순간에 언제나 막혔다.** 숫자 둘이 각자 그럴듯해서 아무도
 * 안 봤다. 그 관계를 여기에 못 박는다.
 */
describe("문턱과 적기의 관계", () => {
  it("텐파이 전용 advance 정책은 발동할 수 있어야 한다", () => {
    const fit = readiness("advance", ctx({ tenpai: true, shanten: 0 }));
    // 문턱(MIN_READINESS.advance = 0.15)을 넘는다 — 넘지 못하면 그 정책은 영영 죽는다
    expect(fire(always("advance"), ctx({ tenpai: true, shanten: 0 }))).toEqual(OPT);
    expect(fit).toBeGreaterThan(0.15);
  });

  it("거기에 oneShot을 얹으면 텐파이에서 죽는다 — 이 조합을 쓰면 안 된다", () => {
    // 이 테스트는 "고쳐야 할 상태"를 박아 두는 것이 아니라 **왜 뗐는지**를 남기는 것이다.
    expect(fire(always("advance", { oneShot: true }), ctx({ tenpai: true, shanten: 0 }))).toBeNull();
  });
});
