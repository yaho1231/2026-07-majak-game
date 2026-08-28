/**
 * "봇이 판단할 수 없다"고 접어 두었던 증강들 — **정말 못 하는가.**
 *
 * `BOT_UNUSABLE_AUGMENTS`에는 다섯 종이 있었다. 봇이 그걸 뽑으면 증강 한 칸을 게임 내내
 * 놀린다. 그런데 다섯 다 못 하는 판단이 아니라 **질문을 잘못 세운 것**이었다.
 *
 * - **분열** — "손패 가치 추정이 필요"하다고 했지만 이 발동엔 무작위가 하나도 없다.
 *   재료로 사라질 패까지 규칙이 정하므로, 쪼갠 뒤의 손을 그대로 만들어 **샹텐을 세면 된다.**
 * - **파혼** — "템포 손해 판단 불가"라고 했지만 갈리는 조건은 하나다. **유일한 후로일 때만**
 *   멘젠이 진짜로 돌아온다.
 * - **미래를 보는 자** — "2단계라 조율 불가"라고 했지만 정책은 프롬프트마다 다시 불린다.
 *   1단계는 샹텐 문제, 2단계는 **안전패 문제**로 서로 다른 질문이다.
 * - **hand_swap3(등가교환)** — "한 번의 choose로 조율 불가"라고 했지만 세 프롬프트
 *   (지정→넘길 3장→가져올 3장)는 매번 다른 질문이다. 실측(qa-lab/launch/balance.md)에서
 *   **387회 제시·0회 선택**으로 완전히 죽어 있었다.
 * - **frame_up(누명)** — "상대 대기 추정 필요"라고 했지만 발동 자체는 대기 추정을
 *   쓰지 않는다. 내 손의 고립패를 버리고 리치가 있으면 그쪽에 심는 것으로 충분하다.
 *
 * 여기서는 다섯이 **켤 때 켜고 아낄 때 아끼는지**를 합성 뷰로 확인한다.
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
import { handSwap3 } from "../src/augments/hand_swap3.js";
import { frameUp } from "../src/augments/frame_up.js";
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

const TARGET: PlayerId = "p1";

/**
 * 보유자 손 + **지정 후 열린 상대 손**을 함께 채운 뷰 (hand_swap3용).
 * 지정이 끝나면 상대 손패가 `revealTiles`를 통해 **진짜 kind**로 보인다 —
 * 여기서는 그 결과 상태를 바로 만든다(상대 tileId도 tiles에 실제 kind로 채운다).
 */
function viewWithTarget(
  holderSpec: string,
  targetSpec: string,
  over: { riichi?: boolean } = {},
): PlayerView {
  const v = view(holderSpec);
  const targetKinds = h(targetSpec);
  const tiles = { ...v.tiles };
  const targetIds: number[] = [];
  targetKinds.forEach((kind, i) => {
    const id = 1000 + i;
    targetIds.push(id);
    tiles[id] = { id, kind, attrs: {} };
  });
  return {
    ...v,
    tiles,
    zones: {
      ...v.zones,
      [handZone(TARGET)]: {
        id: handZone(TARGET),
        kind: "hand",
        owner: TARGET,
        tileIds: targetIds,
        hiddenCount: 0,
      },
    },
    players: [
      ...v.players,
      { id: TARGET, seat: 1, score: 25000, augments: [], nickname: "p1", isBot: false },
    ],
    round: {
      ...v.round,
      byPlayer: {
        ...v.round.byPlayer,
        [TARGET]: {
          meldCount: 0,
          melds: [],
          riichi: over.riichi === true ? { discardIndex: 0 } : null,
          riichiDeclared: over.riichi === true,
        },
      },
    } as unknown as PlayerView["round"],
  };
}

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

describe("등가교환(hand_swap3) — 세 프롬프트는 서로 다른 질문이다", () => {
  it("넘길 3장은 내 손에서 가장 고립된 3장이다", () => {
    // 123m456m789m + 99p + 9s + 5z = 1샹텐. 짝·이웃이 하나도 없는 9s·5z가 가장
    // 고립됐다 — 세 번째로 고립된 자리는 99p 중 한 장(짝이 있어 이웃보다는 낫다).
    const v = view("123m456m789m99p9s5z");
    const nine = idOf(v, "9s");
    const five = idOf(v, "5z");
    // 옵션 payload는 오름차순 3장 조합 전체를 흉내 낸다 — 그중 "가장 손해가 적은" 것을
    // 정책이 스스로 계산해 골라야 한다(제시된 후보와 무관하게 같은 답이 나와야 한다).
    const worstGuess = { type: "swap3_give", payload: { gives: [five, nine, 1].sort((a, b) => a - b) } };
    const decoy = { type: "swap3_give", payload: { gives: [1, 2, 3] } };
    const picked = fire(handSwap3, ctx(v, [decoy, worstGuess], { shanten: 1, tenpai: false }));
    expect(picked).not.toBeNull();
    const gives = (picked?.payload as { gives: number[] }).gives;
    expect(gives).toContain(nine);
    expect(gives).toContain(five);
  });

  it("가져올 3장은 상대의 열린 손 중 내 샹텐을 가장 낮추는 조합이다", () => {
    // 내 손(14장): 123m456m789m99p + 고립 자패 3z5z7z. worstHandTiles가 이 셋을
    // 넘길 3장으로 고른다(각각 이웃·짝이 없어 비용이 0으로 동률이지만 항상 같은
    // 순서로 뽑힌다). 상대 손에 4s5s6s가 있으면 그걸 받아 손이 곧바로 완성되고,
    // 서로 안 이어지는 자패 3장(1z6z8z)을 받으면 그대로 제자리다.
    const v = viewWithTarget("123m456m789m99p3z5z7z", "456s1z6z8z");
    const targetIds = v.zones[handZone(TARGET)]?.tileIds ?? [];
    const kindsAt = (spec: string): number =>
      targetIds.find((id) => kindKey(v.tiles[id]!.kind) === kindKey(h(spec)[0] as TileKind)) as number;
    const good = [kindsAt("4s"), kindsAt("5s"), kindsAt("6s")].sort((a, b) => a - b);
    const bad = [kindsAt("1z"), kindsAt("6z"), kindsAt("8z")].sort((a, b) => a - b);
    const opts = [
      { type: "swap3_take", payload: { takes: bad } },
      { type: "swap3_take", payload: { takes: good } },
    ];
    const picked = fire(handSwap3, ctx(v, opts, { shanten: 1, tenpai: false }));
    expect((picked?.payload as { takes: number[] }).takes).toEqual(good);
  });

  it("지정 단계는 상대 손이 안 보여도 첫 후보를 고른다 — 미루지 않는다", () => {
    const v = view("123m456m789m99p9s5z");
    const opt = { type: "swap3", payload: { target: TARGET } };
    expect(fire(handSwap3, ctx(v, [opt], { shanten: 3, tenpai: false }))).toEqual(opt);
  });

  it("교환 단계는 미룰 수 없다 — 적기와 무관하게 반드시 고른다", () => {
    const v = viewWithTarget("123m456m789m99p9s5z", "456s2z2z2z");
    const opt = { type: "swap3_give", payload: { gives: [idOf(v, "9s"), idOf(v, "5z"), idOf(v, "9p")] } };
    expect(
      fire(handSwap3, ctx(v, [opt], { shanten: 4, tenpai: false, wallLeft: 2, turn: 17 })),
    ).not.toBeNull();
  });
});

describe("누명(frame_up) — 발동 자체엔 대기 추정이 필요 없다", () => {
  // disrupt 의도는 적기(readiness)가 순목에서 나온다(MIN_READINESS.disrupt=0.25,
  // (turn-4)/10). 판이 무르익은 시점(turn 14)으로 override해 적기 문턱을 넘긴다 —
  // 여기서 확인하려는 것은 "무엇을 고르는가"이지 "언제 발동하는가"가 아니다.
  const READY = { turn: 14 };

  it("가장 고립된 패를 버린다", () => {
    const v = view("123m456m789m99p9s5z");
    const nine = idOf(v, "9s");
    const opts = [
      { type: "frame_discard", payload: { tileId: idOf(v, "1m"), target: TARGET } },
      { type: "frame_discard", payload: { tileId: nine, target: TARGET } },
    ];
    const picked = fire(frameUp, ctx(v, opts, { shanten: 1, tenpai: false, ...READY }));
    expect((picked?.payload as { tileId: number }).tileId).toBe(nine);
  });

  it("드러난 리치가 있으면 그쪽에 심는다", () => {
    const v = viewWithTarget("123m456m789m99p9s5z", "456s2z2z2z", { riichi: true });
    const nine = idOf(v, "9s");
    const other: PlayerId = "p2";
    const opts = [
      { type: "frame_discard", payload: { tileId: nine, target: other } },
      { type: "frame_discard", payload: { tileId: nine, target: TARGET } },
    ];
    const picked = fire(frameUp, ctx(v, opts, { shanten: 1, tenpai: false, ...READY }));
    expect((picked?.payload as { target: PlayerId }).target).toBe(TARGET);
  });

  it("리치가 없으면 첫 후보를 고른다", () => {
    const v = view("123m456m789m99p9s5z");
    const nine = idOf(v, "9s");
    const opt = { type: "frame_discard", payload: { tileId: nine, target: TARGET } };
    expect(fire(frameUp, ctx(v, [opt], { shanten: 1, tenpai: false, ...READY }))).toEqual(opt);
  });
});

describe("판단 불가 목록", () => {
  it("이제 없다 — 다섯 다 판단할 수 있는 문제였다", () => {
    expect([...BOT_UNUSABLE_AUGMENTS]).toEqual([]);
  });
});
