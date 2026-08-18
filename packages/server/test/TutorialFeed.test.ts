/**
 * 튜토리얼 배급 — 리치를 걸어 둔 사람에게 봇이 **오름패를 쏴 주는가**
 * (`RoomManager.TUTORIAL_FEED_NOTE`).
 *
 * 이게 없으면 튜토리얼의 마지막 장이 통째로 안 나온다: 배우는 사람이 리치를 걸어
 * 놓으면 화면은 "이제 기다리세요"라고 말하는데, 봇 셋은 당연히 리치를 피해 안전패만
 * 돌린다 → 유국. 론이라는 이 게임의 절반을 한 번도 못 보고 튜토리얼이 끝난다.
 *
 * 여기서 지키는 선:
 * - 쏘라고 하면 **판단보다 먼저** 그 패가 나간다(안전패 고르기가 이기면 안 된다).
 * - 손에 없으면 억지로 만들지 않는다 — 다음 순에 뽑히면 그때 나간다.
 * - 배급을 안 꽂은 봇(=실대국 전부)은 이 경로를 아예 지나지 않는다.
 */

import { describe, expect, it } from "vitest";
import { BotAgent, feedDiscard } from "../src/BotAgent.js";
import type { ActionOption } from "@majak/core/mahjong/flow/FlowController.js";
import type { PlayerView } from "@majak/core/information/PlayerView.js";
import type { TileKind } from "@majak/core/mahjong/tiles/Tile.js";

/** 배급 판정이 보는 것은 `tiles[id].kind` 하나뿐이다 — 그만큼만 세운다. */
const tiles: Record<number, { kind: TileKind }> = {
  1: { kind: { suit: "pin", rank: 7 } },
  2: { kind: { suit: "man", rank: 3 } },
  3: { kind: { suit: "sou", rank: 5 } },
};

const discard = (tileId: number): ActionOption =>
  ({ type: "discard", payload: { tileId } }) as ActionOption;

describe("배급할 버림 고르기 (feedDiscard)", () => {
  it("쏘라고 한 종류가 후보에 있으면 그 패다 — 순서가 아니라 종류로 고른다", () => {
    expect(feedDiscard([discard(3), discard(2), discard(1)], tiles, new Set(["pin7"]))).toEqual(
      discard(1),
    );
  });

  it("여러 종류를 쏘라고 하면 후보에서 먼저 걸리는 것을 낸다", () => {
    // 대기가 넓으면(4통·7통) 둘 중 아무거나 나가면 된다 — 골라 낼 이유가 없다.
    expect(feedDiscard([discard(2), discard(1)], tiles, new Set(["pin7", "man3"]))).toEqual(
      discard(2),
    );
  });

  it("손에 없으면 아무것도 하지 않는다 — 없는 패를 만들지 않는다", () => {
    expect(feedDiscard([discard(2), discard(3)], tiles, new Set(["sou9"]))).toBeNull();
  });

  it("쏠 것이 없다고 하면(=리치 전) 아무것도 하지 않는다", () => {
    expect(feedDiscard([discard(1)], tiles, new Set<string>())).toBeNull();
  });

  it("버림이 아닌 선택지는 건드리지 않는다", () => {
    // 펑·치로 그 패를 '가져가는' 것은 배급이 아니다 (오히려 오름패를 먹어 버린다).
    const pon = { type: "pon", payload: { tileId: 1 } } as ActionOption;
    expect(feedDiscard([pon], tiles, new Set(["pin7"]))).toBeNull();
  });
});

describe("배급이 봇의 판단보다 앞이다", () => {
  const view = {
    playerId: "p1",
    tiles: { 1: { id: 1, ...tiles[1] }, 2: { id: 2, ...tiles[2] } },
    zones: {},
    players: [],
    round: {},
    augmentView: {},
    scoringOptions: {},
  } as unknown as PlayerView;

  it("쏘라고 하면 판 읽기까지 가지 않고 그 패가 나간다", async () => {
    // 여기까지 온 이상 "안전패를 고른다"는 옳은 판단이 곧 배우는 사람의 리치를
    // 영영 안 깨는 결과가 된다. 그래서 판단 앞에 세운다.
    const bot = new BotAgent("p1", "Bot_p1", 7);
    bot.sendView(view);
    bot.setTutorialFeed(() => new Set(["pin7"]));
    expect(await bot.decide({ player: "p1", options: [discard(2), discard(1)] })).toEqual(
      discard(1),
    );
  });

  it("화료는 그보다도 앞이다 — 이기는 것보다 나은 선택지는 없다", async () => {
    const bot = new BotAgent("p1", "Bot_p1", 7);
    bot.sendView(view);
    bot.setTutorialFeed(() => new Set(["pin7"]));
    const win = { type: "win", payload: {} } as ActionOption;
    expect(await bot.decide({ player: "p1", options: [win, discard(1)] })).toEqual(win);
  });
});

describe("판 세워 두기 (setTutorialHold)", () => {
  const view = {
    playerId: "p1",
    tiles: { 1: { id: 1, ...tiles[1] }, 2: { id: 2, ...tiles[2] } },
    zones: {},
    players: [],
    round: {},
    augmentView: {},
    scoringOptions: {},
  } as unknown as PlayerView;

  const newBot = (): BotAgent => {
    const bot = new BotAgent("p1", "Bot_p1", 7);
    bot.sendView(view);
    return bot;
  };

  it("세워 두라고 하는 동안에는 답을 내지 않는다", async () => {
    // 이게 없으면 배우는 사람이 한 문단을 읽는 사이 판이 두세 순 지나간다
    // (`RoomManager.TUTORIAL_HOLD_NOTE`).
    const bot = newBot();
    let holding = true;
    bot.setTutorialHold(() => holding);
    bot.setTutorialFeed(() => new Set(["pin7"]));

    let answered = false;
    const decision = bot.decide({ player: "p1", options: [discard(1)] }).then((o) => {
      answered = true;
      return o;
    });
    await new Promise((r) => setTimeout(r, 300));
    expect(answered, "세워 둔 동안 답이 나갔다").toBe(false);

    holding = false;
    expect(await decision).toEqual(discard(1));
  });

  it("풀어 주면 곧바로 이어서 둔다", async () => {
    const bot = newBot();
    bot.setTutorialHold(() => false);
    expect(await bot.decide({ player: "p1", options: [discard(1)] })).toBeDefined();
  });

  it("손잡이를 안 꽂은 봇(=실대국 전부)은 기다리지 않는다", async () => {
    const bot = newBot();
    bot.setTutorialFeed(() => new Set(["pin7"]));
    expect(await bot.decide({ player: "p1", options: [discard(1)] })).toEqual(discard(1));
  });
});
