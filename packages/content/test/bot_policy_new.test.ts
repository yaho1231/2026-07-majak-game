/**
 * 2026-07-26에 새로 넣은 봇 정책들의 발동 조건 회귀 테스트.
 *
 * 정책(`AugmentDef.bot.choose`)은 순수 함수라 뷰만 만들어 직접 부를 수 있다.
 * 여기서 지키는 것은 "언제 발동하는가"의 경계다 — 커스텀 콜(묵계·허장성세)은
 * **역패일 때만**, 무르기는 **쯔모패가 고립일 때만**.
 */

import { describe, expect, it } from "vitest";
import type { AugmentDef, BotDecisionContext, PlayerView, TileKind } from "@majak/core";
import { contentAugments } from "../src/index.js";
import { botCtx } from "./helpers.js";
import { botChosenOption } from "@majak/core";

const defOf = (id: string): AugmentDef => {
  const d = contentAugments.find((a) => a.id === id);
  if (d === undefined) throw new Error(`no augment ${id}`);
  return d;
};

const k = (suit: TileKind["suit"], rank: number): TileKind => ({ suit, rank });

interface ViewOpts {
  hand: TileKind[];
  /** 리액션 대상 버림패 (커스텀 콜 정책용) */
  discard?: TileKind;
  /** 쯔모패 index (hand 배열 기준) */
  drawnIndex?: number;
}

function makeView(opts: ViewOpts): PlayerView {
  const tiles: Record<number, { id: number; kind: TileKind; attrs: unknown }> = {};
  const handIds: number[] = [];
  opts.hand.forEach((kind, i) => {
    tiles[i] = { id: i, kind, attrs: {} };
    handIds.push(i);
  });
  const discardId = 900;
  if (opts.discard !== undefined) {
    tiles[discardId] = { id: discardId, kind: opts.discard, attrs: {} };
  }
  return {
    playerId: "p0",
    tiles,
    zones: {
      "hand:p0": { id: "hand:p0", kind: "hand", tileIds: handIds, hiddenCount: 0 },
      "discards:p0": { id: "discards:p0", kind: "discards", tileIds: [], hiddenCount: 0 },
    },
    players: [
      { id: "p0", seat: 0, score: 25000, augments: [], nickname: "p0", isBot: true },
      { id: "p1", seat: 1, score: 25000, augments: [], nickname: "p1", isBot: true },
    ],
    round: {
      prevalentWind: 1, roundNumber: 1, honba: 0, riichiPot: 0,
      dealerSeat: 0, turnSeat: 0, turnCount: 4, phase: "turn.act", direction: 1,
      doraIndicators: [],
      lastDiscard: opts.discard !== undefined ? { player: "p1", tileId: discardId } : null,
      myDrawnTile: opts.drawnIndex ?? null,
      uraDoraIndicators: null,
      byPlayer: { p0: { meldCount: 0, riichiDeclared: false, melds: [] } },
    },
    augmentView: {},
  } as unknown as PlayerView;
}

function ctxOf(view: PlayerView, options: { type: string; payload: unknown }[]): BotDecisionContext {
  return botCtx(view, options);
}

/** 흩어진 잡패 손 (짝도 이웃도 거의 없다) */
const SCATTERED: TileKind[] = [
  k("man", 1), k("man", 4), k("man", 7),
  k("pin", 2), k("pin", 5), k("pin", 8),
  k("sou", 3), k("sou", 6), k("sou", 9),
  k("wind", 3), k("wind", 4), k("dragon", 1), k("dragon", 2),
];

describe("커스텀 콜 정책 — 역패일 때만 운다", () => {
  for (const id of ["silent_pact", "bluff_pretense"] as const) {
    const action = id === "silent_pact" ? "silent_pon" : "bluff_pon";

    it(`${id}: 삼원패(역패)면 운다`, () => {
      const view = makeView({ hand: SCATTERED, discard: k("dragon", 1) });
      const opt = { type: action, payload: {} };
      expect(botChosenOption(defOf(id).bot?.choose(ctxOf(view, [opt])) ?? null)).toEqual(opt);
    });

    it(`${id}: 수패면 울지 않는다`, () => {
      const view = makeView({ hand: SCATTERED, discard: k("pin", 5) });
      const opt = { type: action, payload: {} };
      expect(botChosenOption(defOf(id).bot?.choose(ctxOf(view, [opt])) ?? null)).toBeNull();
    });
  }
});

describe("우는 국사 정책 — 요구패가 충분할 때만 뛰어든다", () => {
  const orphanHand: TileKind[] = [
    k("man", 1), k("man", 9), k("pin", 1), k("pin", 9), k("sou", 1), k("sou", 9),
    k("wind", 1), k("wind", 2), k("dragon", 1), k("man", 4), k("man", 5), k("pin", 3), k("sou", 7),
  ];

  it("요구패 9종이면 부른다", () => {
    const view = makeView({ hand: orphanHand, discard: k("dragon", 2) });
    const opt = { type: "kokushi_pon", payload: {} };
    expect(botChosenOption(defOf("open_kokushi").bot?.choose(ctxOf(view, [opt])) ?? null)).toEqual(opt);
  });

  it("잡손이면 부르지 않는다", () => {
    const view = makeView({ hand: SCATTERED, discard: k("dragon", 2) });
    const opt = { type: "kokushi_pon", payload: {} };
    expect(botChosenOption(defOf("open_kokushi").bot?.choose(ctxOf(view, [opt])) ?? null)).toBeNull();
  });
});

describe("무르기 정책 — 쯔모패가 고립일 때만", () => {
  const opt = { type: "take_back", payload: {} };

  it("고립된 쯔모패면 되돌린다", () => {
    // 마지막 패(index 13)가 쯔모패 — 짝도 이웃도 없는 서풍
    const hand = [...SCATTERED, k("wind", 2)];
    const view = makeView({ hand, drawnIndex: 13 });
    expect(botChosenOption(defOf("take_back").bot?.choose(ctxOf(view, [opt])) ?? null)).toEqual(opt);
  });

  it("짝이 되는 쯔모패면 그대로 둔다", () => {
    const hand = [...SCATTERED, k("dragon", 1)]; // 손에 이미 백이 있다 → 짝
    const view = makeView({ hand, drawnIndex: 13 });
    expect(botChosenOption(defOf("take_back").bot?.choose(ctxOf(view, [opt])) ?? null)).toBeNull();
  });
});
