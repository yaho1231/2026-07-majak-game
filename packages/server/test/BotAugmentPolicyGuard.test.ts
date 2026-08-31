/**
 * **증강 정책이 표준 마작 액션을 돌려주면 그 입찰은 버려진다** (QA synergy4 A-0).
 *
 * `BotDecisionContext.options`에는 이번 순의 전체 후보가 실린다. 정책이 자기 타입으로
 * 거르는 것을 잊고 `options[0]`을 그대로 돌려주면, BotAgent는 그것을 정상 입찰로 받아
 * 1층(추가 행동)에서 채택한다 — 그러면 **버림·리치·후로 평가(2층)가 통째로
 * 건너뛰어진다.** 누명(`frame_up`)이 그 상태로 「들고만 있어도 반장 −17,483점(t=−10.6)」
 * 이었고, 같은 실수가 `hand_swap3`에서도 한 번 났다.
 *
 * 그래서 이제 개별 카드가 아니라 **정책 계층**(`bot/augmentPick.ts` + BotAgent)에서 막는다.
 */

import { describe, expect, it, vi } from "vitest";
import { contentAugments } from "@majak/content";
import type { AugmentDef, PlayerView, TileKind } from "@majak/core";
import { BotAgent } from "../src/BotAgent.js";
import { isAugmentActionType } from "../src/bot/augmentPick.js";
import type { ActionOption } from "@majak/core/mahjong/flow/FlowController.js";

const k = (suit: TileKind["suit"], rank: number): TileKind => ({ suit, rank });

/** 노텐 손패 — 버림이 정상 판단인 자리 */
const HAND: TileKind[] = [
  k("man", 1), k("man", 4), k("man", 7),
  k("pin", 2), k("pin", 5), k("pin", 8),
  k("sou", 3), k("sou", 6), k("sou", 9),
  k("wind", 1), k("wind", 2), k("dragon", 1), k("dragon", 2),
];

function makeView(augments: string[]): PlayerView {
  const tiles: Record<number, unknown> = {};
  const handIds: number[] = [];
  HAND.forEach((kind, i) => {
    tiles[i] = { id: i, kind, attrs: {} };
    handIds.push(i);
  });
  return {
    playerId: "p0",
    tiles,
    zones: { "hand:p0": { id: "hand:p0", kind: "hand", tileIds: handIds, hiddenCount: 0 } },
    players: [
      { id: "p0", seat: 0, score: 25000, augments, nickname: "p0", isBot: true },
      { id: "p1", seat: 1, score: 25000, augments: [], nickname: "p1", isBot: true },
    ],
    round: {
      prevalentWind: 1, roundNumber: 1, honba: 0, riichiPot: 0,
      dealerSeat: 0, turnSeat: 0, turnCount: 4, phase: "turn.act", direction: 1,
      doraIndicators: [], lastDiscard: null, myDrawnTile: null, uraDoraIndicators: null,
      byPlayer: { p0: { meldCount: 0, riichiDeclared: false }, p1: { meldCount: 0, riichiDeclared: false } },
    },
    augmentView: {},
  } as unknown as PlayerView;
}

function discardOptions(view: PlayerView): ActionOption[] {
  return (view.zones["hand:p0"]?.tileIds ?? []).map((tileId) => ({
    type: "discard",
    payload: { tileId },
  }));
}

/** 프롬프트의 첫 후보를 그대로 돌려주는(= 거르기를 잊은) 나쁜 정책 */
function sloppyPolicy(id: string): AugmentDef {
  return {
    id,
    tier: "silver",
    category: "etc",
    name: id,
    description: id,
    detail: id,
    bot: {
      choose({ options }) {
        return options[0] ?? null; // ⚠ 자기 타입으로 거르지 않았다
      },
    },
    install: () => {},
  } as unknown as AugmentDef;
}

describe("증강 정책 계층 — 자기 액션이 아닌 선택지는 통과하지 못한다", () => {
  it("표준 액션 타입은 증강 액션이 아니다", () => {
    for (const t of ["discard", "riichi", "win", "pon", "chi", "ankan", "pass"]) {
      expect(isAugmentActionType(t)).toBe(false);
    }
    expect(isAugmentActionType("frame_discard")).toBe(true);
  });

  it("거르기를 잊은 정책이 discard를 돌려줘도 그 입찰은 버려진다", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const def = sloppyPolicy("sloppy_test");
    const bot = new BotAgent("p0", undefined, 1, [def]);
    const view = makeView(["sloppy_test"]);
    bot.sendView(view);
    const options = discardOptions(view);
    const decision = await bot.decide({ player: "p0", options });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();

    // **증강을 안 든 같은 봇과 완전히 같은 선택**이어야 한다 — 나쁜 정책이 판단을
    // 가로채지 않았다는 뜻이다. (되돌리면 여기서 `options[0]`이 나와 갈린다.)
    const clean = new BotAgent("p0", undefined, 1, [def]);
    const cleanView = makeView([]);
    clean.sendView(cleanView);
    const baseline = await clean.decide({ player: "p0", options: discardOptions(cleanView) });
    expect(decision.type).toBe(baseline.type);
    expect(decision.payload).toEqual(baseline.payload);
  });

  it("누명(frame_up) 정책은 자기 액션이 없으면 null이다 (A-0 회귀)", () => {
    const frame = contentAugments.find((d) => d.id === "frame_up");
    expect(frame?.bot).toBeDefined();
    const view = makeView(["frame_up"]);
    const ctx = {
      view,
      options: discardOptions(view).map((o) => ({ type: o.type, payload: o.payload })),
      holder: "p0",
      rng: { int: () => 0, float: () => 0 },
      tenpai: false,
      shanten: 3,
      waits: [],
      turn: 4,
      wallLeft: 60,
      threat: 0,
      remaining: () => 4,
      safety: () => 1,
      placement: { rank: 1, allLast: false, riskAppetite: 0 },
      handPoints: 3900,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(frame?.bot?.choose(ctx as any)).toBeNull();
  });
});
