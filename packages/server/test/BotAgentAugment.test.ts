/**
 * BotAgent 액티브 증강 사용 회귀 테스트 — "봇이 증강을 뽑기만 하고 발동은 안 한다" 버그 방지.
 *
 * 봇은 보유한 액티브 증강의 정책(AugmentDef.bot)을 통해 상황에 맞게 발동해야 한다.
 * 여기서는 최소 PlayerView + 프롬프트를 만들어 decide가 증강 옵션을 고르는지 검증한다.
 */

import { describe, expect, it } from "vitest";
import { contentAugments } from "@majak/content";
import {
  HanchanController,
  DEFAULT_HANCHAN_CONFIG,
  standardAugments,
} from "@majak/core";
import type { AugmentDef, HanchanConfig, PlayerView } from "@majak/core";
import type { TileKind } from "@majak/core";
import { BotAgent } from "../src/BotAgent.js";
import type { ActionOption } from "@majak/core/mahjong/flow/FlowController.js";

const ALL_DEFS = [...standardAugments, ...contentAugments];

const k = (suit: TileKind["suit"], rank: number): TileKind => ({ suit, rank });

/** 텐파이 손패(대기형 13장): 123m 456m 789m 11p 56s → 4s/7s 대기 */
const TENPAI_HAND: TileKind[] = [
  k("man", 1), k("man", 2), k("man", 3),
  k("man", 4), k("man", 5), k("man", 6),
  k("man", 7), k("man", 8), k("man", 9),
  k("pin", 1), k("pin", 1),
  k("sou", 5), k("sou", 6),
];

/** 노텐 손패(뿔뿔이 흩어진 13장) */
const NOTEN_HAND: TileKind[] = [
  k("man", 1), k("man", 4), k("man", 7),
  k("pin", 2), k("pin", 5), k("pin", 8),
  k("sou", 3), k("sou", 6), k("sou", 9),
  k("wind", 1), k("wind", 2), k("dragon", 1), k("dragon", 2),
];

interface ViewOpts {
  me?: string;
  augments?: string[];
  hand?: TileKind[];
  score?: number;
  riichiOpponents?: string[];
  /** 몇 번째 순인가 — 같은 값이면 같은 순(증강 1회 제한의 창) */
  turnCount?: number;
}

/** BotAgent가 실제로 읽는 필드만 채운 최소 PlayerView (그 외는 캐스팅으로 생략). */
function makeView(opts: ViewOpts = {}): PlayerView {
  const me = opts.me ?? "p0";
  const hand = opts.hand ?? TENPAI_HAND;
  const tiles: Record<number, { id: number; kind: TileKind; attrs: unknown }> = {};
  const handIds: number[] = [];
  hand.forEach((kind, i) => {
    tiles[i] = { id: i, kind, attrs: {} };
    handIds.push(i);
  });
  const byPlayer: Record<string, unknown> = {
    [me]: { meldCount: 0, riichiDeclared: false },
  };
  for (const opp of opts.riichiOpponents ?? []) {
    byPlayer[opp] = { meldCount: 0, riichiDeclared: true, riichi: {} };
  }
  return {
    playerId: me,
    tiles,
    zones: { [`hand:${me}`]: { id: `hand:${me}`, kind: "hand", tileIds: handIds, hiddenCount: 0 } },
    players: [
      { id: me, seat: 0, score: opts.score ?? 25000, augments: opts.augments ?? [], nickname: me, isBot: true },
      { id: "p1", seat: 1, score: 25000, augments: [], nickname: "p1", isBot: true },
    ],
    round: {
      prevalentWind: 1, roundNumber: 1, honba: 0, riichiPot: 0,
      dealerSeat: 0, turnSeat: 0, turnCount: opts.turnCount ?? 3, phase: "turn.act", direction: 1,
      doraIndicators: [], lastDiscard: null, myDrawnTile: null, uraDoraIndicators: null,
      byPlayer,
    },
    augmentView: {},
  } as unknown as PlayerView;
}

/** 손패 tileId마다 discard 옵션 + 주어진 증강 옵션들을 합친 프롬프트 옵션. */
function optionsWith(view: PlayerView, extra: ActionOption[]): ActionOption[] {
  const me = view.playerId;
  const handIds = view.zones[`hand:${me}`]?.tileIds ?? [];
  const discards: ActionOption[] = handIds.map((tileId) => ({ type: "discard", payload: { tileId } }));
  return [...extra, ...discards];
}

describe("BotAgent — 액티브 증강을 상황에 맞게 발동한다", () => {
  it("텐파이일 때 이면투시(ura_peek)를 발동한다", async () => {
    const bot = new BotAgent("p0", undefined, 1, contentAugments);
    const view = makeView({ augments: ["ura_peek"], hand: TENPAI_HAND });
    bot.sendView(view);
    const options = optionsWith(view, [{ type: "ura_peek_reveal", payload: {} }]);
    const decision = await bot.decide({ player: "p0", options });
    expect(decision.type).toBe("ura_peek_reveal");
  });

  it("노텐이면 발동하지 않고 버림을 택한다", async () => {
    const bot = new BotAgent("p0", undefined, 1, contentAugments);
    const view = makeView({ augments: ["ura_peek"], hand: NOTEN_HAND });
    bot.sendView(view);
    const options = optionsWith(view, [{ type: "ura_peek_reveal", payload: {} }]);
    const decision = await bot.decide({ player: "p0", options });
    expect(decision.type).toBe("discard");
  });

  it("카탈로그가 없으면(정책 조회 불가) 증강을 발동하지 않는다", async () => {
    const bot = new BotAgent("p0"); // catalog 미지정
    const view = makeView({ augments: ["ura_peek"], hand: TENPAI_HAND });
    bot.sendView(view);
    const options = optionsWith(view, [{ type: "ura_peek_reveal", payload: {} }]);
    const decision = await bot.decide({ player: "p0", options });
    expect(decision.type).toBe("discard");
  });

  it("상대가 리치를 걸고 점수 여유가 있으면 선언 간파(peek_riichi_waits)를 쓴다", async () => {
    const bot = new BotAgent("p0", undefined, 1, contentAugments);
    const view = makeView({
      augments: ["peek_riichi_waits"], hand: NOTEN_HAND,
      score: 25000, riichiOpponents: ["p1"],
    });
    bot.sendView(view);
    const options = optionsWith(view, [{ type: "peek_waits", payload: { target: "p1" } }]);
    const decision = await bot.decide({ player: "p0", options });
    expect(decision.type).toBe("peek_waits");
  });

  it("점수가 바닥이어도 선언 간파를 쓴다 — 비용이 없다 (48차 무페널티)", async () => {
    const bot = new BotAgent("p0", undefined, 1, contentAugments);
    const view = makeView({
      augments: ["peek_riichi_waits"], hand: NOTEN_HAND,
      score: 1500, riichiOpponents: ["p1"],
    });
    bot.sendView(view);
    const options = optionsWith(view, [{ type: "peek_waits", payload: { target: "p1" } }]);
    const decision = await bot.decide({ player: "p0", options });
    expect(decision.type).toBe("peek_waits");
  });

});

describe("BotAgent — 증강 드래프트+발동 경로가 게임을 끝까지 완주한다", () => {
  it(
    "봇 4명이 증강을 뽑고 발동해도 크래시·무한루프 없이 국이 끝난다",
    async () => {
      // 카탈로그를 넘겨 봇이 액티브 증강 정책을 실제로 조회·발동하도록 한다.
      for (const seed of [7, 19, 42, 88, 101]) {
        const agents = ["p0", "p1", "p2", "p3"].map(
          (id, i) => new BotAgent(id, undefined, seed * 100 + i, ALL_DEFS),
        );
        const cfg: Partial<HanchanConfig> = {
          ...DEFAULT_HANCHAN_CONFIG,
          maxWind: 1, // 동장만 (속도)
          westEntry: false,
          dobi: false,
          draftSchedules: ["gameStart"], // 게임 시작 드래프트로 증강 지급
          seed,
          interRoundDelayMs: 0,
        };
        const ctrl = new HanchanController(agents, cfg);
        const rankings = await ctrl.run();
        expect(rankings).toHaveLength(4);
      }
    },
    120_000,
  );
});

// ─────────────────── 액티브 2개 동시 발동 시 우선순위 ───────────────────

/** 항상 자기 옵션을 고르는 최소 증강 정의 (가중치 지정 가능) */
function alwaysFire(
  id: string,
  weight?: number,
  category: AugmentDef["category"] = "etc",
): AugmentDef {
  return {
    id,
    tier: "silver",
    category,
    name: id,
    description: id,
    detail: id,
    bot: {
      choose({ options }) {
        const opt = options.find((o) => o.type === id);
        if (opt === undefined) return null;
        return weight === undefined ? opt : { option: opt, weight };
      },
    },
    install() {
      /* 테스트용 — 설치 효과 없음 */
    },
  };
}

describe("BotAgent — 액티브 2개가 동시에 발동을 원할 때", () => {
  it("보유(픽) 순서가 아니라 파워가 센 증강을 먼저 태운다", async () => {
    // ura_peek(B, 25점)을 먼저 픽했지만 pseudo_dealer(A, 29점)가 더 세다.
    const bot = new BotAgent("p0", undefined, 1, contentAugments);
    const view = makeView({ augments: ["ura_peek", "pseudo_dealer"], hand: TENPAI_HAND });
    bot.sendView(view);
    const options = optionsWith(view, [
      { type: "ura_peek_reveal", payload: {} },
      { type: "claim_dealer", payload: {} },
    ]);
    const decision = await bot.decide({ player: "p0", options });
    expect(decision.type).toBe("claim_dealer");
  });

  it("픽 순서를 뒤집어도 같은 증강이 선택된다 (순서 비의존)", async () => {
    const bot = new BotAgent("p0", undefined, 1, contentAugments);
    const view = makeView({ augments: ["pseudo_dealer", "ura_peek"], hand: TENPAI_HAND });
    bot.sendView(view);
    const options = optionsWith(view, [
      { type: "ura_peek_reveal", payload: {} },
      { type: "claim_dealer", payload: {} },
    ]);
    const decision = await bot.decide({ player: "p0", options });
    expect(decision.type).toBe("claim_dealer");
  });

  it("정책이 실은 명시 가중치가 파워 기본값을 이긴다", async () => {
    // strong_aug는 파워 미등재(기본값)지만 지금 급하다고 90을 실어 보낸다.
    const defs = [alwaysFire("weak_aug"), alwaysFire("strong_aug", 90)];
    const bot = new BotAgent("p0", undefined, 1, defs);
    const view = makeView({ augments: ["weak_aug", "strong_aug"], hand: TENPAI_HAND });
    bot.sendView(view);
    const options = optionsWith(view, [
      { type: "weak_aug", payload: {} },
      { type: "strong_aug", payload: {} },
    ]);
    const decision = await bot.decide({ player: "p0", options });
    expect(decision.type).toBe("strong_aug");
  });

  it("정보 계열(info)은 다른 액티브에 순번을 양보한다", async () => {
    // 정보는 한 순 늦게 봐도 손해가 거의 없지만, 상대 액티브는 그 순이 지나면 기회를 잃는다.
    const defs = [alwaysFire("peek_aug", undefined, "info"), alwaysFire("act_aug")];
    const bot = new BotAgent("p0", undefined, 1, defs);
    const view = makeView({ augments: ["peek_aug", "act_aug"], hand: TENPAI_HAND });
    bot.sendView(view);
    const options = optionsWith(view, [
      { type: "peek_aug", payload: {} },
      { type: "act_aug", payload: {} },
    ]);
    const decision = await bot.decide({ player: "p0", options });
    expect(decision.type).toBe("act_aug");
  });

  it("정보 증강 하나뿐이면 강도가 낮아도 그대로 발동한다", async () => {
    const bot = new BotAgent("p0", undefined, 1, contentAugments);
    const view = makeView({ augments: ["ura_peek"], hand: TENPAI_HAND });
    bot.sendView(view);
    const options = optionsWith(view, [{ type: "ura_peek_reveal", payload: {} }]);
    const decision = await bot.decide({ player: "p0", options });
    expect(decision.type).toBe("ura_peek_reveal");
  });

  it("가중치가 같으면 보유 순서로 결정론적으로 끊는다", async () => {
    const defs = [alwaysFire("weak_aug", 50), alwaysFire("strong_aug", 50)];
    const bot = new BotAgent("p0", undefined, 1, defs);
    const view = makeView({ augments: ["strong_aug", "weak_aug"], hand: TENPAI_HAND });
    bot.sendView(view);
    const options = optionsWith(view, [
      { type: "weak_aug", payload: {} },
      { type: "strong_aug", payload: {} },
    ]);
    const decision = await bot.decide({ player: "p0", options });
    expect(decision.type).toBe("strong_aug");
  });
});

// ─────────────────── 한 순에 1회 (왕패의 주인 알람 두 번) ───────────────────

/**
 * 증강 발동은 턴을 소비하지 않아서, 발동 뒤에 온 새 프롬프트에서 같은 정책이 또 이길 수
 * 있었다. 왕패의 주인이 그랬다 — 교환 1회 = 액션 1개라 봇이 자기 첫 순에 dw_swap을
 * 두 번 보냈고, 사람 화면에는 발동 컷인이 두 번 떴다(2026-08-07 사용자 보고).
 */
describe("BotAgent — 액티브 증강은 한 순에 한 번만 태운다", () => {
  it("같은 순에 다시 물어도 이미 태운 액션은 고르지 않는다", async () => {
    const defs = [alwaysFire("dw_swap")];
    const bot = new BotAgent("p0", undefined, 1, defs);
    const view = makeView({ augments: ["dw_swap"], hand: TENPAI_HAND, turnCount: 3 });
    const options = optionsWith(view, [{ type: "dw_swap", payload: {} }]);

    bot.sendView(view);
    expect((await bot.decide({ player: "p0", options })).type).toBe("dw_swap");

    // 교환이 반영된 새 뷰가 와도 **같은 순**이다 — 두 번째 발동은 없다
    bot.sendView(makeView({ augments: ["dw_swap"], hand: TENPAI_HAND, turnCount: 3 }));
    expect((await bot.decide({ player: "p0", options })).type).toBe("discard");
  });

  it("순이 넘어가면 다시 태울 수 있다", async () => {
    const defs = [alwaysFire("dw_swap")];
    const bot = new BotAgent("p0", undefined, 1, defs);
    const view = makeView({ augments: ["dw_swap"], hand: TENPAI_HAND, turnCount: 3 });
    const options = optionsWith(view, [{ type: "dw_swap", payload: {} }]);

    bot.sendView(view);
    expect((await bot.decide({ player: "p0", options })).type).toBe("dw_swap");

    bot.sendView(makeView({ augments: ["dw_swap"], hand: TENPAI_HAND, turnCount: 4 }));
    expect((await bot.decide({ player: "p0", options })).type).toBe("dw_swap");
  });

  it("발동 한 번이 액션 둘로 이어지는 흐름(공개 → 재배열)은 막지 않는다", async () => {
    // 같은 증강이라도 **액션 타입이 다르면** 이어서 태울 수 있다 (예지·등가교환).
    const defs = [alwaysFire("step_one"), alwaysFire("step_two")];
    const bot = new BotAgent("p0", undefined, 1, defs);
    const view = makeView({
      augments: ["step_one", "step_two"], hand: TENPAI_HAND, turnCount: 3,
    });
    bot.sendView(view);
    const first = await bot.decide({
      player: "p0",
      options: optionsWith(view, [{ type: "step_one", payload: {} }]),
    });
    expect(first.type).toBe("step_one");

    bot.sendView(makeView({
      augments: ["step_one", "step_two"], hand: TENPAI_HAND, turnCount: 3,
    }));
    const second = await bot.decide({
      player: "p0",
      options: optionsWith(view, [{ type: "step_two", payload: {} }]),
    });
    expect(second.type).toBe("step_two");
  });
});
