/**
 * "봇이 판단할 수 없다"고 접어 두었던 증강들 — **정말 못 하는가.**
 *
 * `BOT_UNUSABLE_AUGMENTS`에는 다섯 종이 있었다. 봇이 그걸 뽑으면 증강 한 칸을 게임 내내
 * 놀린다. 그런데 셋은 못 하는 판단이 아니라 **질문을 잘못 세운 것**이었다.
 *
 * - **분열** — "손패 가치 추정이 필요"하다고 했지만 이 발동엔 무작위가 하나도 없다.
 *   재료로 사라질 패까지 규칙이 정하므로, 쪼갠 뒤의 손을 그대로 만들어 **샹텐을 세면 된다.**
 * - **파혼** — "템포 손해 판단 불가"라고 했지만 갈리는 조건은 하나다. **유일한 후로일 때만**
 *   멘젠이 진짜로 돌아온다.
 * - **미래를 보는 자** — "2단계라 조율 불가"라고 했지만 정책은 프롬프트마다 다시 불린다.
 *   1단계는 샹텐 문제, 2단계는 **안전패 문제**로 서로 다른 질문이다.
 *
 * 여기서는 그 셋이 **켤 때 켜고 아낄 때 아끼는지**를 합성 뷰로 확인한다.
 *
 * 400배패 2:2 측정: 순위 +0.0150 ± 0.0152 · 점수 +180 ± 344 · **방총율 11.6% vs 11.9%.**
 * 유의하진 않지만 세 지표가 같은 방향이고, 방총이 준 것은 기계적으로 설명된다 —
 * 미래를 보는 자의 교환 단계가 가장 안전한 패를 바닥에 놓기 때문이다.
 */

import { botChosenOption, handZone, kindKey } from "@majak/core";
import type {
  BotAugmentOption,
  BotDecisionContext,
  PlayerId,
  PlayerView,
  TileKind,
} from "@majak/core";
import { describe, expect, it } from "vitest";
import { tileSplit } from "../src/augments/tile_split.js";
import { meldDissolve } from "../src/augments/meld_dissolve.js";
import { futureSight } from "../src/augments/future_sight.js";
import { BOT_UNUSABLE_AUGMENTS } from "../src/augments/botHelpers.js";
import { botCtx, h } from "./helpers.js";

const HOLDER: PlayerId = "p0";

/** 손패만 채운 최소 뷰 — 정책이 보는 것은 zones[hand]·tiles·round뿐이다 */
function view(handSpec: string, over: Partial<PlayerView> = {}): PlayerView {
  const kinds = h(handSpec);
  const tiles: PlayerView["tiles"] = {};
  const tileIds: number[] = [];
  kinds.forEach((kind, i) => {
    const id = i + 1;
    tileIds.push(id);
    tiles[id] = { id, kind, attrs: {} };
  });
  return {
    playerId: HOLDER,
    tiles,
    zones: {
      [handZone(HOLDER)]: {
        id: handZone(HOLDER),
        kind: "hand",
        owner: HOLDER,
        tileIds,
        hiddenCount: 0,
      },
    },
    players: [
      { id: HOLDER, seat: 0, score: 25000, augments: [], nickname: "p0" },
    ],
    round: {
      prevalentWind: 1,
      roundNumber: 1,
      honba: 0,
      dealerSeat: 0,
      direction: 1,
      turnSeat: 0,
      turnCount: 6,
      phase: "turn.act",
      lastDiscard: null,
      lastDrawnTile: null,
      myDrawnTile: null,
      riichiSticks: 0,
      byPlayer: { [HOLDER]: { meldCount: 0, melds: [], riichi: null } },
    },
    scoringOptions: {},
    ...over,
  } as unknown as PlayerView;
}

const ctx = (v: PlayerView, options: BotAugmentOption[], over: Partial<BotDecisionContext> = {}) =>
  ({ ...botCtx(v, options, { rng: { int: () => 0, float: () => 0 } }), ...over }) as BotDecisionContext;

const fire = (
  def: { bot?: { choose(c: BotDecisionContext): unknown } },
  c: BotDecisionContext,
): BotAugmentOption | null =>
  botChosenOption((def.bot?.choose(c) ?? null) as Parameters<typeof botChosenOption>[0]);

/** 손패의 이 종류가 앉은 자리(=tileId) */
const idOf = (v: PlayerView, spec: string): number => {
  const target = kindKey(h(spec)[0] as TileKind);
  for (const [id, t] of Object.entries(v.tiles)) {
    if (kindKey(t.kind) === target) return Number(id);
  }
  throw new Error(`not in hand: ${spec}`);
};

describe("분열 — 쪼갠 뒤의 샹텐을 세어 본다", () => {
  it("샹텐이 실제로 줄어드는 분할을 고른다 (9삭 → 4삭+5삭)", () => {
    // 123m456m789m + 99p + 9s + 5z = 1샹텐. 9삭을 4·5삭으로 쪼개면 몸통 재료가 서서
    // 텐파이가 된다(재료로 사라지는 것은 가장 고립된 5z). 1삭+8삭으로 쪼개면 그대로 1샹텐.
    const v = view("123m456m789m99p9s5z");
    const nine = idOf(v, "9s");
    const bad = { type: "split_tile", payload: { tileId: nine, a: 1 } }; // 1s+8s
    const good = { type: "split_tile", payload: { tileId: nine, a: 4 } }; // 4s+5s
    expect(fire(tileSplit, ctx(v, [bad, good], { shanten: 1, tenpai: false }))).toEqual(good);
  });

  it("나아지는 분할이 없으면 태우지 않는다 (국에 한 번뿐이다)", () => {
    const v = view("123m456m789m123p1z");
    const two = idOf(v, "2m");
    const opts = [{ type: "split_tile", payload: { tileId: two, a: 1 } }];
    expect(fire(tileSplit, ctx(v, opts, { shanten: 0, tenpai: true }))).toBeNull();
  });
});

describe("파혼 — 멘젠이 진짜로 돌아올 때만 무른다", () => {
  const OPT = { type: "dissolve_meld", payload: { meldIndex: 0 } };

  const withMelds = (n: number): PlayerView =>
    view("123m456p78s99s1z", {
      round: {
        ...(view("123m456p78s99s1z").round as object),
        byPlayer: {
          [HOLDER]: {
            meldCount: n,
            melds: Array.from({ length: n }, () => ({ kind: "pon", tileIds: [] })),
            riichi: null,
          },
        },
      } as unknown as PlayerView["round"],
    });

  it("유일한 후로면 무른다 (리치가 통째로 돌아온다)", () => {
    expect(fire(meldDissolve, ctx(withMelds(1), [OPT], { shanten: 1, tenpai: false }))).toEqual(
      OPT,
    );
  });

  it("후로가 둘이면 무르지 않는다 (물러도 여전히 후로 손이다)", () => {
    expect(
      fire(meldDissolve, ctx(withMelds(2), [OPT], { shanten: 1, tenpai: false })),
    ).toBeNull();
  });

  it("텐파이면 무르지 않는다 (다 된 손을 흩지 않는다)", () => {
    expect(fire(meldDissolve, ctx(withMelds(1), [OPT], { shanten: 0, tenpai: true }))).toBeNull();
  });

  it("너무 먼 손이면 무르지 않는다 (리치까지 못 간다)", () => {
    expect(
      fire(meldDissolve, ctx(withMelds(1), [OPT], { shanten: 4, tenpai: false })),
    ).toBeNull();
  });
});

describe("미래를 보는 자 — 두 단계는 서로 다른 질문이다", () => {
  const ARM = { type: "future_arm", payload: {} };

  it("텐파이·1샹텐에는 무장하지 않는다 (다 된 손을 흩는다)", () => {
    const v = view("123m456m789m12p1z");
    expect(fire(futureSight, ctx(v, [ARM], { shanten: 0, tenpai: true }))).toBeNull();
    expect(fire(futureSight, ctx(v, [ARM], { shanten: 1, tenpai: false }))).toBeNull();
  });

  it("먼 손이면 무장한다 (고칠수록 이득 + 발동당 1판)", () => {
    const v = view("19m19p19s1234567z");
    expect(fire(futureSight, ctx(v, [ARM], { shanten: 3, tenpai: false }))).toEqual(ARM);
  });

  it("교환 단계에서는 **가장 안전한 패**를 바닥에 놓는다", () => {
    const v = view("123m456p789s1122z");
    const safeId = idOf(v, "1z");
    const dangerId = idOf(v, "4p");
    const opts = [
      { type: "future_exchange", payload: { tileId: dangerId } },
      { type: "future_exchange", payload: { tileId: safeId } },
    ];
    const picked = fire(
      futureSight,
      ctx(v, opts, {
        shanten: 2,
        tenpai: false,
        safety: (k: TileKind) => (kindKey(k) === kindKey(h("1z")[0] as TileKind) ? 1 : 0),
      }),
    );
    expect((picked?.payload as { tileId?: number }).tileId).toBe(safeId);
  });

  it("교환 단계는 미룰 수 없다 — 적기와 무관하게 반드시 고른다", () => {
    const v = view("123m456p789s1122z");
    const opts = [{ type: "future_exchange", payload: { tileId: idOf(v, "1z") } }];
    // 유국 직전(회수할 순목 없음)이라 advance 적기는 0에 가깝지만, 이미 무장했으므로 고른다
    expect(
      fire(futureSight, ctx(v, opts, { shanten: 4, tenpai: false, wallLeft: 2, turn: 17 })),
    ).not.toBeNull();
  });
});

describe("판단 불가 목록", () => {
  it("셋이 목록에서 빠졌다 (남은 둘만 진짜로 못 한다)", () => {
    expect([...BOT_UNUSABLE_AUGMENTS].sort()).toEqual(["frame_up", "hand_swap3"]);
  });
});
