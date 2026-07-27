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
import type { HanchanConfig, PlayerView } from "@majak/core";
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
      dealerSeat: 0, turnSeat: 0, turnCount: 3, phase: "turn.act", direction: 1,
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
