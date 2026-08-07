/**
 * 증강이 **봇의 판단에 실제로 닿는가** — 두 P0 회귀.
 *
 * ## 1. 증강 정책의 예외가 판을 죽이지 않는다
 *
 * `BotAgent.augmentBids`는 content가 준 `bot.choose`를 봇의 모든 결정마다 돌린다.
 * 그 함수 하나가 던지면 예외가 `HanchanController` → `RoomManager`로 올라가
 * GAME_CRASHED가 나가고 **방이 삭제된다** — 사람의 반장전이 통째로 사라진다.
 * 실패는 "이 증강은 이번 순에 입찰하지 않는다"까지만 가야 한다.
 *
 * ## 2. 증강이 손 값어치·상대 위협에 반영된다
 *
 * `AUGMENT_PLAY`의 두 배수는 오랫동안 증강 정책 안에서만 읽혔다(docs/27 §5).
 * 그래서 봇은 뚫린 천장을 들고도 자기 손을 평범한 손으로 세고, 만년 오야에게
 * 쏘는 것과 평범한 상대에게 쏘는 것을 똑같이 셌다. 여기서 그 연결을 지킨다.
 *
 * (봇 판단은 server에 있고 content는 server에 의존하지 않으므로 소스를 상대 경로로
 *  들여온다 — 워크트리에서도 이 체크아웃의 봇을 보게 하려는 목적이기도 하다.)
 */

import { describe, expect, it } from "vitest";
import type { ActionOption, AugmentDef, PlayerView, TileId, TileKind } from "@majak/core";
import { BotAgent } from "../../server/src/BotAgent.js";
import { buildRead } from "../../server/src/bot/read.js";
import { h } from "./helpers.js";

/**
 * 봇이 보는 최소 장면.
 *
 * `server/test/botTestView.ts`와 같은 일을 하지만 여기서 다시 세운다 — content의
 * 타입체크에 server의 **테스트 하네스**를 끌어들이면 그쪽 사정에 이쪽 게이트가 매인다.
 * 봇이 실제로 읽는 필드만 채우므로 마지막에 한 번 단언한다(뷰는 계속 자라고,
 * 봇이 안 읽는 필드까지 채워 두면 이 픽스처가 그 성장을 따라다녀야 한다).
 */
interface SceneOptions {
  hand: string;
  discards?: Record<string, string>;
  riichi?: string[];
  doraIndicator?: string;
  turnCount?: number;
  wallLeft?: number;
  scoringOptions?: PlayerView["scoringOptions"];
}

interface Scene {
  view: PlayerView;
  tiles: Record<TileId, { kind: TileKind }>;
  discardOptions: ActionOption[];
}

const PLAYERS = ["p0", "p1", "p2", "p3"] as const;

function scene(opts: SceneOptions): Scene {
  const tiles: Record<TileId, { id: TileId; kind: TileKind; attrs: object }> = {};
  const zones: Record<string, unknown> = {};
  let nextId = 1;
  const add = (kind: TileKind): TileId => {
    const id = nextId++;
    tiles[id] = { id, kind, attrs: {} };
    return id;
  };
  const zone = (id: string, kind: string, tileIds: TileId[], owner?: string): void => {
    zones[id] = { id, kind, owner, tileIds, hiddenCount: 0 };
  };

  const handIds = h(opts.hand).map(add);
  zone("hand:p0", "hand", handIds, "p0");
  const byPlayer: Record<string, unknown> = {};
  for (const p of PLAYERS) {
    zone(`melds:${p}`, "melds", [], p);
    zone(`discards:${p}`, "discards", h(opts.discards?.[p] ?? "").map(add), p);
    byPlayer[p] = {
      riichiDeclared: (opts.riichi ?? []).includes(p),
      doubleRiichi: false,
      meldCount: 0,
      melds: [],
      // 리치 선언패가 바닥의 첫 장 = 이른 리치. 통과패 셈이 켜지는 조건이기도 하다
      ...((opts.riichi ?? []).includes(p) ? { riichiTileIndex: 0 } : {}),
      tsumogiriIds: [],
      ...(p === "p0" ? { furiten: false, furitenReasons: [] } : {}),
    };
  }
  zones["wall"] = {
    id: "wall",
    kind: "wall",
    tileIds: [],
    hiddenCount: opts.wallLeft ?? 60,
  };

  const view = {
    playerId: "p0",
    tiles,
    zones,
    players: PLAYERS.map((id, seat) => ({
      id,
      seat,
      score: 25000,
      augments: [] as string[],
      nickname: id,
      isBot: true,
    })),
    round: {
      prevalentWind: 1,
      roundNumber: 1,
      honba: 0,
      riichiPot: 0,
      dealerSeat: 0,
      turnSeat: 0,
      turnCount: opts.turnCount ?? 6,
      phase: "turn.act",
      direction: 1,
      doraIndicators: opts.doraIndicator === undefined ? [] : h(opts.doraIndicator).map(add),
      lastDiscard: null,
      myDrawnTile: handIds[handIds.length - 1] ?? null,
      uraDoraIndicators: null,
      byPlayer,
    },
    augmentView: {},
    scoringOptions: opts.scoringOptions ?? {},
  } as unknown as PlayerView;

  return {
    view,
    tiles,
    discardOptions: handIds.map((tileId) => ({ type: "discard", payload: { tileId } })),
  };
}

/** 뷰의 한 사람에게 증강을 들려 준다 (뷰에 공개된 정보 그대로) */
function give(view: PlayerView, player: string, augments: string[]): PlayerView {
  return {
    ...view,
    players: view.players.map((p) => (p.id === player ? { ...p, augments } : p)),
  };
}

// ───────────────────────── 1. 정책 예외 격리 ─────────────────────────

/** 무조건 던지는 정책 — 실제로 있었던 버그의 최악 형태 */
const boom: AugmentDef = {
  id: "boom_test",
  tier: "gold",
  category: "etc",
  name: "폭탄",
  description: "정책이 던진다",
  bot: {
    choose() {
      throw new Error("정책이 터졌다");
    },
  },
  install() {
    /* 이 테스트는 엔진을 돌리지 않는다 */
  },
};

/** 옵션을 돌려주긴 하는데 직렬화가 터지는 정책 (`choose` 바깥의 실패) */
const circular: AugmentDef = {
  ...boom,
  id: "circular_test",
  bot: {
    choose() {
      const bad: Record<string, unknown> = { type: "boom_action" };
      bad["self"] = bad; // JSON.stringify가 던진다
      return bad as never;
    },
  },
};

describe("증강 정책이 던져도 봇은 계속 둔다", () => {
  const s = scene({ hand: "123m456p789s11z2z", turnCount: 5 });

  it("choose가 던져도 예외가 봇 밖으로 나가지 않는다 (방이 죽지 않는다)", async () => {
    const bot = new BotAgent("p0", "봇", 1, [boom]);
    bot.sendView(give(s.view, "p0", ["boom_test"]));
    const chosen = await bot.decide({
      player: "p0",
      options: s.discardOptions,
    });
    expect(chosen.type).toBe("discard");
  });

  it("정책이 돌려준 옵션의 후처리가 던져도 마찬가지다", async () => {
    const bot = new BotAgent("p0", "봇", 1, [circular]);
    bot.sendView(give(s.view, "p0", ["circular_test"]));
    const chosen = await bot.decide({
      player: "p0",
      options: s.discardOptions,
    });
    expect(chosen.type).toBe("discard");
  });

  it("터진 증강 하나가 다른 증강의 발동을 막지 않는다", async () => {
    const works: AugmentDef = {
      ...boom,
      id: "works_test",
      bot: {
        choose: (ctx) => ctx.options.find((o) => o.type === "works_action") ?? null,
      },
    };
    const bot = new BotAgent("p0", "봇", 1, [boom, works]);
    bot.sendView(give(s.view, "p0", ["boom_test", "works_test"]));
    const chosen = await bot.decide({
      player: "p0",
      options: [...s.discardOptions, { type: "works_action", payload: {} }],
    });
    expect(chosen.type).toBe("works_action");
  });

  it("드래프트에서 정의가 던져도 무언가는 뽑는다", async () => {
    const nasty = {
      ...boom,
      id: "nasty_test",
      get category(): never {
        throw new Error("카탈로그가 터졌다");
      },
    } as unknown as AugmentDef;
    const bot = new BotAgent("p0", "봇", 1, []);
    const picked = await bot.decideDraft("gameStart", [nasty]);
    expect(picked).toBe("nasty_test");
  });
});

// ───────────────────────── 2. 값어치·위협 연결 ─────────────────────────

describe("내 증강이 내 손 값어치에 들어간다", () => {
  const s = scene({ hand: "234m456p678s55z1m", doraIndicator: "1m", turnCount: 6 });
  const pointsWith = (augments: string[]): number =>
    buildRead(give(s.view, "p0", augments), "p0").valueOf({ plan: null }).points;

  it("뚫린 천장을 들면 같은 손이 더 비싸다", () => {
    expect(pointsWith(["aotenjou_ceiling"])).toBeGreaterThan(pointsWith([]));
  });

  it("표에 없는 증강은 값을 바꾸지 않는다 (빠뜨려도 봇이 이상해지지 않는다)", () => {
    expect(pointsWith(["__unknown__"])).toBe(pointsWith([]));
  });

  it("증강 정책에 넘기는 눈금에는 배수가 걸리지 않는다 (두 번 곱하지 않는다)", () => {
    const read = buildRead(give(s.view, "p0", ["aotenjou_ceiling"]), "p0");
    // content의 `botPlan.myHandPoints`가 같은 배수를 스스로 곱한다
    expect(read.valueOf({ plan: null, withoutAugments: true }).points).toBe(
      buildRead(s.view, "p0").valueOf({ plan: null }).points,
    );
  });
});

describe("상대 증강이 위협 계산에 들어간다", () => {
  const s = scene({
    hand: "234m456p678s55z1m",
    riichi: ["p1"],
    discards: { p1: "1119z", p2: "45m", p3: "67p" },
    turnCount: 9,
  });
  const dangerous = h("5s")[0]!;
  const lossWith = (augments: string[]): number =>
    buildRead(give(s.view, "p1", augments), "p0").expectedLoss(dangerous);

  it("만년 오야에게 쏘는 것이 더 비싸다", () => {
    expect(lossWith(["eternal_dealer"])).toBeGreaterThan(lossWith([]) * 1.3);
  });

  it("책임전가를 든 상대에게는 덜 비싸다 (지불이 흩어진다)", () => {
    expect(lossWith(["blame_shift"])).toBeLessThan(lossWith([]) * 0.6);
  });

  it("표에 없는 증강은 위협을 바꾸지 않는다", () => {
    expect(lossWith(["__unknown__"])).toBe(lossWith([]));
  });

  /**
   * **밀기/접기가 실제로 갈리는 장면.**
   *
   * 텐파이(9만·3자 샤보)를 유지하는 유일한 버림이 무스지 5삭이고, 접으면 텐파이가
   * 깨진다. 도라도 없어 손이 싸므로 밀 값과 접을 값이 맞붙는 자리다. 같은 장면에서
   * **상대의 증강만** 갈아 끼워 결정이 갈리는지 본다 — 위협 배수가 계산에 닿지
   * 않으면 셋 다 같은 답이 나온다(고치기 전에는 실제로 그랬다).
   */
  const pushScene = scene({
    hand: "234m789p234p99m33z5s",
    riichi: ["p1"],
    discards: { p1: "1m9p1z2z3z4z", p2: "45m", p3: "67p" },
    turnCount: 14,
    wallLeft: 40,
  });
  const discardOf = async (augments: string[]): Promise<string> => {
    const bot = new BotAgent("p0", "봇", 7, []);
    bot.sendView(give(pushScene.view, "p1", augments));
    const chosen = await bot.decide({ player: "p0", options: pushScene.discardOptions });
    const id = (chosen.payload as { tileId: number }).tileId;
    const k = pushScene.tiles[id]?.kind;
    return `${k?.rank ?? "?"}${k?.suit ?? "?"}`;
  };

  it("책임전가를 든 상대에게는 밀고, 만년 오야에게는 접는다", async () => {
    // 5삭 = 텐파이를 지키는 밀기. 그 밖의 패는 텐파이를 깨는 접기다.
    expect(await discardOf(["blame_shift"])).toBe("5sou");
    expect(await discardOf(["eternal_dealer"])).not.toBe("5sou");
  });
});

describe("증강이 넓힌 화료형은 값어치도 그 규칙으로 센다", () => {
  it("비대칭 치또이 보유자의 손이 치또이로 값매겨진다", () => {
    // 1만1통 · 3만3통 · 5만5통 · 7만7통 · 9만9통 — 평범한 규칙으로는 쌍이 0개,
    // 비대칭 치또이(`chiitoiMixedPairs`)에서는 다섯 쌍이다
    const hand = "13579m13579p11z11z";
    const vanilla = buildRead(scene({ hand, turnCount: 6 }).view, "p0").valueOf({
      plan: null,
    }).points;
    const extended = buildRead(
      scene({ hand, turnCount: 6, scoringOptions: { chiitoiMixedPairs: true } }).view,
      "p0",
    ).valueOf({ plan: null }).points;
    expect(extended).toBeGreaterThan(vanilla);
  });

  it("규칙 확장이 없으면 값어치는 한 글자도 달라지지 않는다", () => {
    const s = scene({ hand: "234m456p678s55z1m", turnCount: 6 });
    expect(
      buildRead({ ...s.view, scoringOptions: {} }, "p0").valueOf({ plan: null }).points,
    ).toBe(buildRead(s.view, "p0").valueOf({ plan: null }).points);
  });
});
