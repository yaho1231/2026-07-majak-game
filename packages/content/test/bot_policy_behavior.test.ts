/**
 * 봇 액티브 증강 정책 동작 검증 — 새로 붙인 bot.choose 정책들이 '켤 때 켜고, 아낄 때
 * 아끼는지'를 합성 뷰로 확인한다. (BotDecisionContext는 view·options만 있으면 순수하게
 * 판단하므로, 엔진을 돌리지 않고 최소 뷰를 손으로 조립해 정책만 떼어 시험한다.)
 *
 * 배경: 2026-07-25, 봇이 액티브 증강을 잘 안 쓰던 문제를 고치며 도입.
 */

import { botChosenOption, kindKey } from "@majak/core";
import type {
  BotAugmentOption,
  BotDecisionContext,
  PlayerId,
  PlayerView,
  TileKind,
} from "@majak/core";
import { describe, expect, it } from "vitest";
import { bigHand } from "../src/augments/big_hand.js";
import { tableFlip } from "../src/augments/table_flip.js";
import { disarm } from "../src/augments/disarm.js";
import { alchemist } from "../src/augments/alchemist.js";
import { rankGate } from "../src/augments/rank_gate.js";
import { parasite } from "../src/augments/parasite.js";
import { timeStop } from "../src/augments/time_stop.js";
import { botCtx, h } from "./helpers.js";

/** 결정론 rng (정책이 요구하지만 이 테스트 케이스들은 실제로 쓰지 않는다). */
const rng = { int: (n: number) => 0, float: () => 0 };

interface FakePlayer {
  id: PlayerId;
  seat: number;
  augments?: string[];
  score?: number;
}

/**
 * 최소 PlayerView — holder의 손패(kind→합성 tileId)와 플레이어 목록만 채운다.
 * 정책이 참조하는 zones[hand]/tiles/players/round 필드만 있으면 충분하다.
 */
function fakeView(holder: PlayerId, handSpec: string, players: FakePlayer[]): PlayerView {
  const kinds = h(handSpec);
  const tiles: PlayerView["tiles"] = {};
  const tileIds: number[] = [];
  kinds.forEach((kind, i) => {
    const id = i + 1;
    tileIds.push(id);
    tiles[id] = { id, kind, attrs: {} };
  });
  return {
    playerId: holder,
    tiles,
    zones: {
      [`hand:${holder}`]: {
        id: `hand:${holder}`,
        kind: "hand",
        owner: holder,
        tileIds,
        hiddenCount: 0,
      },
    },
    players: players.map((p) => ({
      id: p.id,
      seat: p.seat,
      score: p.score ?? 25000,
      augments: p.augments ?? [],
      nickname: p.id,
      isBot: true,
    })),
    round: {
      prevalentWind: 1,
      roundNumber: 1,
      honba: 0,
      riichiPot: 0,
      dealerSeat: 0,
      turnSeat: 0,
      turnCount: 1,
      phase: "turn.act",
      direction: 1,
      doraIndicators: [],
      lastDiscard: null,
      lastDiscardFrom: null,
      myDrawnTile: null,
      uraDoraIndicators: null,
      byPlayer: {},
    },
    augmentView: {},
    // 표준 화료형 (진짜 용 등 변형 없음)
    scoringOptions: {},
  } as PlayerView;
}

function ctx(view: PlayerView, options: BotAugmentOption[], tenpai = false): BotDecisionContext {
  return botCtx(view, options, { rng, tenpai, ...(tenpai ? { shanten: 0 } : {}) });
}

/**
 * 정책은 옵션만 돌려줄 수도, 발동 강도를 실어 `{option, weight}`로 돌려줄 수도 있다
 * (의도 선언형 정책은 항상 후자다). 여기서는 **무엇을 골랐는가**만 보므로 옵션을 푼다.
 */
function pick(def: { bot?: { choose(c: BotDecisionContext): unknown } }, c: BotDecisionContext) {
  return botChosenOption(
    (def.bot?.choose(c) ?? null) as Parameters<typeof botChosenOption>[0],
  );
}

describe("봇 액티브 증강 정책 동작", () => {
  it("big_hand: 제시되면 선언한다 (첫 턴 순수 이득)", () => {
    const view = fakeView("p0", "123m456p789s11z2z", [{ id: "p0", seat: 0 }]);
    const opt = { type: "declare_big_hand", payload: {} };
    expect(pick(bigHand, ctx(view, [opt]))).toEqual(opt);
    expect(pick(bigHand, ctx(view, []))).toBeNull();
  });

  it("table_flip: 배패가 나쁠 때만 엎는다", () => {
    const opt = { type: "table_flip_do", payload: {} };
    // 6샹텐 — 어디로도 갈 길이 없다 → 엎는다
    // (요구패 13종은 고립패투성이로 **보이지만** 국사 텐파이라 엎으면 안 된다.
    //  판단 기준이 고립패 수에서 샹텐으로 바뀐 뒤 그 손은 지키는 쪽이 맞다.)
    const weak = fakeView("p0", "1479m2589p369s12z", [{ id: "p0", seat: 0 }]);
    expect(pick(tableFlip, ctx(weak, [opt]))).toEqual(opt);
    // 잘 이어진 손 — 지킨다
    const good = fakeView("p0", "234m456p678s1122z", [{ id: "p0", seat: 0 }]);
    expect(pick(tableFlip, ctx(good, [opt]))).toBeNull();
  });

  it("disarm: 증강을 가장 많이 든 상대를 노린다", () => {
    const view = fakeView("p0", "123m456p789s11z2z", [
      { id: "p0", seat: 0 },
      { id: "p1", seat: 1, augments: ["a"] },
      { id: "p2", seat: 2, augments: ["a", "b", "c"] },
    ]);
    const opts = [
      { type: "disarm_lock", payload: { target: "p1", augmentId: "a" } },
      { type: "disarm_lock", payload: { target: "p2", augmentId: "a" } },
    ];
    // 무장해제는 이제 적기를 본다(1순·무위협에는 미룬다) — 여기서 보려는 것은
    // **누구를 고르는가**이므로 위협을 세워 발동 조건을 만들어 준다.
    const c = { ...ctx(view, opts), threat: 0.9 };
    const picked = botChosenOption(pick(disarm, c) ?? null);
    expect((picked?.payload as { target?: string }).target).toBe("p2");
  });

  it("alchemist: 고립패를 이웃에 붙일 수 있을 때만 발동한다", () => {
    // 1m은 고립(가장 가까운 수패 4m이 3칸 밖). 1m을 +1(→2m)하면 4m과 이웃(칸챤)이 된다.
    const view = fakeView("p0", "14m789p789s11223z", [{ id: "p0", seat: 0 }]);
    const kindId = (spec: string): number => {
      const target = kindKey(h(spec)[0] as TileKind);
      for (const [id, t] of Object.entries(view.tiles)) {
        if (kindKey(t.kind) === target) return Number(id);
      }
      throw new Error("not found");
    };
    // 1m(+1 → 2m) : 고립패가 4m의 이웃이 된다 → 발동
    const improving = { type: "alchemy", payload: { tileId: kindId("1m"), delta: 1 } };
    expect(pick(alchemist, ctx(view, [improving]))).toEqual(improving);
    // 7s는 이미 8s·9s와 이어져 쓸모 있다 — 바꿔봐야 개선이 아니므로 아낀다
    const noop = { type: "alchemy", payload: { tileId: kindId("7s"), delta: 1 } };
    expect(pick(alchemist, ctx(view, [noop]))).toBeNull();
  });
});

/**
 * **카운터플레이** — 상대 증강은 `PlayerInfo.augments`로 뷰에 버젓이 보이는데,
 * 정책들은 그것을 "몇 장인가"로만 세거나 아예 안 봤다. 무엇이 무서운지는
 * `AUGMENT_PLAY`(코어)가 이미 표로 갖고 있다.
 */
describe("상대 증강을 보고 표적을 고른다", () => {
  const ON = {};

  it("무장해제: 장수가 아니라 **무엇이 무서운가**로 잠근다", () => {
    // p1은 뚫린 천장 한 장(상한 없음), p2는 도라 잔챙이 셋. 예전 정책은 장수만 세서
    // p2를 골랐고, 그 안에서 무엇을 잠글지는 아예 보지 않았다.
    const view = fakeView("p0", "123m456p789s11z2z", [
      { id: "p0", seat: 0 },
      { id: "p1", seat: 1, augments: ["aotenjou_ceiling"] },
      { id: "p2", seat: 2, augments: ["red_five_touch", "snake_kan", "north_trader"] },
    ]);
    const opts = [
      { type: "disarm_lock", payload: { target: "p2", augmentId: "red_five_touch" } },
      { type: "disarm_lock", payload: { target: "p2", augmentId: "snake_kan" } },
      { type: "disarm_lock", payload: { target: "p2", augmentId: "north_trader" } },
      { type: "disarm_lock", payload: { target: "p1", augmentId: "aotenjou_ceiling" } },
    ];
    const picked = botChosenOption(pick(disarm, { ...ctx(view, opts), threat: 0.9, ...ON }) ?? null);
    expect(picked?.payload).toEqual({ target: "p1", augmentId: "aotenjou_ceiling" });
  });

  it("격(格): 좌석 순서가 아니라 위협으로 지목한다", () => {
    const view = fakeView("p0", "123m456p789s11z2z", [
      { id: "p0", seat: 0 },
      { id: "p1", seat: 1, augments: [] },
      { id: "p2", seat: 2, augments: ["eternal_dealer"] },
      { id: "p3", seat: 3, augments: [] },
    ]);
    // 후보 목록의 첫 번째는 p1 — 예전 정책은 언제나 이쪽을 찍었다
    const opts = [
      { type: "rank_gate_mark", payload: { target: "p1" } },
      { type: "rank_gate_mark", payload: { target: "p2" } },
      { type: "rank_gate_mark", payload: { target: "p3" } },
    ];
    const picked = botChosenOption(pick(rankGate, { ...ctx(view, opts), ...ON }) ?? null);
    expect((picked?.payload as { target?: string }).target).toBe("p2");
  });

  it("기생충: 점수판이 아니라 **이번 국에 벌 것 같은 사람**에게 붙는다", () => {
    const view = fakeView("p0", "123m456p789s11z2z", [
      { id: "p0", seat: 0 },
      { id: "p1", seat: 1, score: 40000 }, // 부자지만 이번 국엔 조용하다
      { id: "p2", seat: 2, score: 12000 }, // 가난하지만 리치를 걸었다
    ]);
    (view.round as { byPlayer: Record<string, unknown> }).byPlayer = {
      p2: { riichiDeclared: true, meldCount: 0, melds: [] },
    };
    const opts = [
      { type: "parasite_attach", payload: { target: "p1" } },
      { type: "parasite_attach", payload: { target: "p2" } },
    ];
    const picked = botChosenOption(pick(parasite, { ...ctx(view, opts), threat: 0.9, ...ON }) ?? null);
    expect((picked?.payload as { target?: string }).target).toBe("p2");
  });
});
