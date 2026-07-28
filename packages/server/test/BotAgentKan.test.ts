/**
 * BotAgent 깡 판단 회귀 테스트.
 *
 * 2026-07-26 이전의 봇은 깡을 **한 번도** 하지 않았다(실측: 안깡 제시 166회·발동 0회,
 * 대명깡 46/0, 가깡 40/0). decideNow에 깡 분기 자체가 없었기 때문이다. 그 탓에 깡을
 * 전제로 하는 증강(절벽 위에 피어난 꽃·밀실의 도라·영상 정찰·장사진·바람의 계보)이
 * 봇 손에서는 통째로 죽어 있었다.
 *
 * 규칙: 텐파이면 **깡 뒤에도 텐파이가 유지될 때만**, 노텐이면 그 4장이 슌쯔로 쓰일
 * 여지가 없을 때만(자패 · 이웃 1장 이하). 서로 다른 패의 깡(장사진·동남서북)은
 * 여기서 판단하지 않고 각 증강의 bot 정책에 맡긴다.
 */

import { describe, expect, it } from "vitest";
import type { PlayerView } from "@majak/core";
import type { TileKind } from "@majak/core";
import type { ActionOption } from "@majak/core/mahjong/flow/FlowController.js";
import { BotAgent } from "../src/BotAgent.js";

const k = (suit: TileKind["suit"], rank: number): TileKind => ({ suit, rank });

/** BotAgent가 읽는 필드만 채운 최소 뷰 (손패는 kinds 순서대로 tileId 0..n) */
function viewOf(hand: TileKind[]): PlayerView {
  const tiles: Record<number, { id: number; kind: TileKind; attrs: unknown }> = {};
  const handIds: number[] = [];
  hand.forEach((kind, i) => {
    tiles[i] = { id: i, kind, attrs: {} };
    handIds.push(i);
  });
  return {
    playerId: "p0",
    tiles,
    zones: { "hand:p0": { id: "hand:p0", kind: "hand", tileIds: handIds, hiddenCount: 0 } },
    players: [
      { id: "p0", seat: 0, score: 25000, augments: [], nickname: "p0", isBot: true },
      { id: "p1", seat: 1, score: 25000, augments: [], nickname: "p1", isBot: true },
    ],
    round: {
      prevalentWind: 1, roundNumber: 1, honba: 0, riichiPot: 0,
      dealerSeat: 0, turnSeat: 0, turnCount: 3, phase: "turn.act", direction: 1,
      doraIndicators: [], lastDiscard: null, myDrawnTile: null, uraDoraIndicators: null,
      byPlayer: { p0: { meldCount: 0, riichiDeclared: false } },
    },
    augmentView: {},
  } as unknown as PlayerView;
}

/** 손패 안에서 같은 kind 4장의 tileId를 찾아 안깡 옵션을 만든다 */
function ankanOn(view: PlayerView, kind: TileKind): ActionOption {
  const ids = (view.zones["hand:p0"]?.tileIds ?? []).filter((id) => {
    const t = view.tiles[id]?.kind;
    return t !== undefined && t.suit === kind.suit && t.rank === kind.rank;
  });
  return { type: "ankan", payload: { tileIds: ids.slice(0, 4) } };
}

function optionsWith(view: PlayerView, extra: ActionOption[]): ActionOption[] {
  const handIds = view.zones["hand:p0"]?.tileIds ?? [];
  return [...extra, ...handIds.map((tileId) => ({ type: "discard", payload: { tileId } }))];
}

describe("BotAgent — 깡 판단", () => {
  it("자패 4장은 노텐이어도 안깡한다 (슌쯔로 쓸 여지가 없다)", async () => {
    // 백 4장 + 흩어진 잡패 10장
    const hand = [
      k("dragon", 1), k("dragon", 1), k("dragon", 1), k("dragon", 1),
      k("man", 1), k("man", 4), k("man", 7),
      k("pin", 2), k("pin", 5), k("pin", 8),
      k("sou", 3), k("sou", 6), k("sou", 9), k("wind", 2),
    ];
    const view = viewOf(hand);
    const bot = new BotAgent("p0", undefined, 1);
    bot.sendView(view);
    const decision = await bot.decide({
      player: "p0",
      options: optionsWith(view, [ankanOn(view, k("dragon", 1))]),
    });
    expect(decision.type).toBe("ankan");
  });

  it("텐파이를 깨는 안깡은 하지 않는다", async () => {
    // 4통 4장이 슌쯔(345p·456p)의 재료라, 깡하면 대기가 무너진다
    const hand = [
      k("man", 1), k("man", 2), k("man", 3),
      k("man", 7), k("man", 8), k("man", 9),
      k("pin", 3), k("pin", 4), k("pin", 4), k("pin", 4), k("pin", 4), k("pin", 5),
      k("sou", 1), k("sou", 1),
    ];
    const view = viewOf(hand);
    const bot = new BotAgent("p0", undefined, 1);
    bot.sendView(view);
    const decision = await bot.decide({
      player: "p0",
      options: optionsWith(view, [ankanOn(view, k("pin", 4))]),
    });
    expect(decision.type).toBe("discard");
  });

  it("가깡은 대기를 깨지 않으면 한다", async () => {
    // 이미 펑한 패의 4번째 한 장 — 손패에서 1장 빠질 뿐이다
    const hand = [
      k("man", 1), k("man", 2), k("man", 3),
      k("pin", 5), k("pin", 6), k("pin", 7),
      k("sou", 2), k("sou", 3), k("sou", 4),
      k("wind", 1), k("wind", 1), k("dragon", 3),
    ];
    const view = viewOf(hand);
    const bot = new BotAgent("p0", undefined, 1);
    bot.sendView(view);
    const shou: ActionOption = {
      type: "shouminkan",
      payload: { tileId: 11, targetMeldTileId: 99 },
    };
    const decision = await bot.decide({ player: "p0", options: optionsWith(view, [shou]) });
    expect(decision.type).toBe("shouminkan");
  });

  it("서로 다른 패의 깡(장사진·동남서북)은 일반 규칙으로 치지 않는다", async () => {
    const hand = [
      k("sou", 3), k("sou", 4), k("sou", 5), k("sou", 6),
      k("man", 1), k("man", 4), k("man", 7),
      k("pin", 2), k("pin", 5), k("pin", 8),
      k("wind", 1), k("wind", 2), k("wind", 3), k("dragon", 1),
    ];
    const view = viewOf(hand);
    const bot = new BotAgent("p0", undefined, 1);
    bot.sendView(view);
    const snake: ActionOption = { type: "ankan", payload: { tileIds: [0, 1, 2, 3] } };
    const decision = await bot.decide({ player: "p0", options: optionsWith(view, [snake]) });
    expect(decision.type).toBe("discard");
  });
});
