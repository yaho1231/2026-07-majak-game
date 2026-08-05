/**
 * 2026-07-29에 새로 정책이 붙은 '폴드 계열' 증강 4종의 발동 경계.
 *
 * 이 넷은 오랫동안 `BOT_UNUSABLE_AUGMENTS`에 있었다 — 봇이 위험(리치·안전패)과
 * 대기의 값어치를 읽지 못해 "언제 물러설지"를 판단할 수 없었기 때문이다. 봇의 판 읽기가
 * `BotDecisionContext`로 넘어오면서(threat·safety·waits·remaining·wallLeft) 판단이
 * 가능해졌고, 여기서 그 판단이 **켤 때 켜고 아낄 때 아끼는지**를 못 박는다.
 */

import { describe, expect, it } from "vitest";
import { BOT_WEIGHT, botChosenOption } from "@majak/core";
import type { BotAugmentOption, PlayerView, TileKind } from "@majak/core";
import { freeRiichiDiscard } from "../src/augments/free_riichi_discard.js";
import { lastStand } from "../src/augments/last_stand.js";
import { palmFlip } from "../src/augments/palm_flip.js";
import { snakeKan } from "../src/augments/snake_kan.js";
import { botCtx, h } from "./helpers.js";

/** 홀더(p0) 손패만 채운 최소 뷰 */
function view(handSpec: string): PlayerView {
  const tiles: PlayerView["tiles"] = {};
  const tileIds: number[] = [];
  h(handSpec).forEach((kind, i) => {
    const id = i + 1;
    tileIds.push(id);
    tiles[id] = { id, kind, attrs: {} };
  });
  return {
    playerId: "p0",
    tiles,
    zones: {
      "hand:p0": { id: "hand:p0", kind: "hand", owner: "p0", tileIds, hiddenCount: 0 },
    },
    players: [
      { id: "p0", seat: 0, score: 25000, augments: [], nickname: "p0", isBot: true },
      { id: "p1", seat: 1, score: 25000, augments: [], nickname: "p1", isBot: true },
    ],
    round: {
      prevalentWind: 1,
      roundNumber: 1,
      honba: 0,
      riichiPot: 0,
      dealerSeat: 0,
      turnSeat: 0,
      turnCount: 8,
      phase: "turn.act",
      direction: 1,
      doraIndicators: [],
      lastDiscard: null,
      myDrawnTile: tileIds[tileIds.length - 1] ?? null,
      uraDoraIndicators: null,
      byPlayer: { p0: { riichiDeclared: true, doubleRiichi: false, meldCount: 0, melds: [] } },
    },
    augmentView: {},
    scoringOptions: {},
  } as unknown as PlayerView;
}

/** 손패 안에서 이 종류의 tileId */
function idOf(v: PlayerView, spec: string): number {
  const want = h(spec)[0] as TileKind;
  for (const id of v.zones["hand:p0"]?.tileIds ?? []) {
    const k = v.tiles[id]?.kind;
    if (k !== undefined && k.suit === want.suit && k.rank === want.rank) return id;
  }
  throw new Error(`${spec} not in hand`);
}

describe("자유 선언 — 리치 중 안전패 선택", () => {
  // 쯔모패는 맨 뒤의 5s(생짜 중장패), 손패 맨 앞의 9m은 상대 현물이라고 치자.
  const HAND = "9m123m456m789m11p55s";

  const options = (v: PlayerView): BotAugmentOption[] =>
    (v.zones["hand:p0"]?.tileIds ?? [])
      .filter((id) => id !== v.round.myDrawnTile)
      .map((tileId) => ({ type: "free_discard", payload: { tileId } }));

  it("위협이 없으면 손패를 헤집지 않는다", () => {
    const v = view(HAND);
    expect(botChosenOption(freeRiichiDiscard.bot?.choose(botCtx(v, options(v))) ?? null)).toBeNull();
  });

  it("리치가 걸린 판에서는 쯔모패보다 안전한 손패를 골라 버린다", () => {
    const v = view(HAND);
    const safeId = idOf(v, "9m");
    const picked = botChosenOption(
      botChosenOption(freeRiichiDiscard.bot?.choose(
        botCtx(v, options(v), {
          threat: 1,
          // 9m만 현물(안전), 나머지는 위험
          safety: (k) => (k.suit === "man" && k.rank === 9 ? 1 : 0.3),
        }),
      ) ?? null) ?? null,
    );
    expect((picked?.payload as { tileId?: number }).tileId).toBe(safeId);
  });

  it("쯔모패가 이미 완전 안전하면 굳이 바꾸지 않는다", () => {
    const v = view(HAND);
    const picked = botChosenOption(freeRiichiDiscard.bot?.choose(
      botCtx(v, options(v), { threat: 1, safety: () => 1 }),
    ) ?? null);
    expect(picked).toBeNull();
  });
});

describe("승부수 — 이길 가망이 없을 때만 리치를 물린다", () => {
  const OPT: BotAugmentOption = { type: "cancel_riichi", payload: {} };
  // 1z 단기 텐파이
  const HAND = "123m456m789m123p1z";

  it("대기가 죽었고 상대가 리치면 물러선다", () => {
    const v = view(HAND);
    // 방어 급박 국면 — 강도는 이제 의도(`defend`)가 준다. 여기서는 무엇을 골랐는지만 본다.
    const chosen = lastStand.bot?.choose(
      botCtx(v, [OPT], { threat: 1, remaining: () => 0 }),
    );
    expect(botChosenOption(chosen ?? null)).toEqual(OPT);
    expect(chosen !== null && chosen !== undefined && "weight" in chosen ? chosen.weight : 0).toBe(
      BOT_WEIGHT.defend,
    );
  });

  it("대기가 살아 있으면 리치를 유지한다", () => {
    const v = view(HAND);
    expect(botChosenOption(lastStand.bot?.choose(botCtx(v, [OPT], { threat: 1 })) ?? null)).toBeNull();
  });

  it("위협이 없으면 대기가 죽어도 물리지 않는다 (유국 텐파이료가 남는다)", () => {
    const v = view(HAND);
    expect(botChosenOption(lastStand.bot?.choose(botCtx(v, [OPT], { remaining: () => 0 })) ?? null)).toBeNull();
  });
});

describe("손바닥 뒤집기 — 죽은 대기를 갈아탄다", () => {
  const OPT: BotAugmentOption = { type: "flip_riichi", payload: {} };
  const HAND = "123m456m789m123p1z";

  it("오름패가 한 장도 안 남았고 다시 짤 시간이 있으면 푼다", () => {
    const v = view(HAND);
    const picked = botChosenOption(palmFlip.bot?.choose(
      botCtx(v, [OPT], { remaining: () => 0, wallLeft: 40 }),
    ) ?? null);
    expect(picked).toEqual(OPT);
  });

  it("종반이면 풀어 봐야 다시 짤 수 없다", () => {
    const v = view(HAND);
    expect(
      botChosenOption(palmFlip.bot?.choose(botCtx(v, [OPT], { remaining: () => 0, wallLeft: 6 })) ?? null),
    ).toBeNull();
  });

  it("대기가 살아 있으면 그대로 둔다", () => {
    const v = view(HAND);
    expect(botChosenOption(palmFlip.bot?.choose(botCtx(v, [OPT], { wallLeft: 40 })) ?? null)).toBeNull();
  });
});

describe("장사진 — 대기가 살아남는 4연속 깡만 친다", () => {
  const ankan = (v: PlayerView, specs: string[]): BotAugmentOption => ({
    type: "ankan",
    payload: { tileIds: specs.map((s) => idOf(v, s)) },
  });

  it("깡을 쳐도 텐파이가 유지되면 친다 (새 도라 + 영상패가 공짜다)", () => {
    // 3456s를 눕혀도 123m456m789m + 1p 단기 텐파이가 그대로 남는다
    const v = view("123m456m789m1p3456s");
    const opt = ankan(v, ["3s", "4s", "5s", "6s"]);
    expect(botChosenOption(snakeKan.bot?.choose(botCtx(v, [opt])) ?? null)).toEqual(opt);
  });

  it("노텐이면 치지 않는다 (넉 장을 굳혀 봐야 손이 안 나아간다)", () => {
    const v = view("1479m2589p3456s12z");
    const opt = ankan(v, ["3s", "4s", "5s", "6s"]);
    expect(botChosenOption(snakeKan.bot?.choose(botCtx(v, [opt])) ?? null)).toBeNull();
  });

  it("남이 리치 중이면 새 도라를 열어 주지 않는다", () => {
    const v = view("123m456m789m1p3456s");
    const opt = ankan(v, ["3s", "4s", "5s", "6s"]);
    expect(botChosenOption(snakeKan.bot?.choose(botCtx(v, [opt], { threat: 1 })) ?? null)).toBeNull();
  });
});
