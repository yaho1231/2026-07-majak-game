/**
 * true_dragon 그룹 테스트 — 진짜 용 1종 (엔진 훅 통합 검증).
 * 배패 16장(deal.handSize) · 5멘쯔 1작두(scoring.totalSets) · 화료 +2판(score.extraHan)
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  ROUND_SETTLED,
  SYSTEM_PLAYER,
  createStandardGame,
  createStandardGameFromState,
  handZone,
  installAugment,
} from "@majak/core";
import type { PlayerId, RoundSettledPayload, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { trueDragon } from "../src/augments/true_dragon.js";

type Game = ReturnType<typeof createStandardGameFromState>;

function winValidate(game: Game, player: PlayerId): string | null {
  const def = game.engine.actions.get("win");
  if (def === undefined) throw new Error("no win action");
  return def.validate(
    { player, type: "win", payload: {} },
    { state: game.engine.state, rules: game.engine.rules },
  );
}

function riichiValidate(
  game: Game,
  player: PlayerId,
  tileId: TileId,
): string | null {
  const def = game.engine.actions.get("riichi");
  if (def === undefined) throw new Error("no riichi action");
  return def.validate(
    { player, type: "riichi", payload: { tileId } },
    { state: game.engine.state, rules: game.engine.rules },
  );
}

/** 보유자 17장 완성형: 123m 456m 789m 123p 456p + 77s (정확히 5멘쯔 1작두) */
function craftWin17() {
  return craft({
    hands: { p0: "123m456m789m123p456p77s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
}

describe("true_dragon (진짜 용)", () => {
  it("배패: sys.startRound 후 보유자는 16장, 나머지는 13장을 받는다", () => {
    const game = createStandardGame({ seed: 1 });
    installAugment(game.engine, trueDragon, "p0", { yaku: game.yaku });

    const res = game.engine.submit({
      player: SYSTEM_PLAYER,
      type: "sys.startRound",
      payload: {},
    });
    expect(res.ok).toBe(true);

    const state = game.engine.state;
    expect(state.zones[handZone("p0")]?.tileIds).toHaveLength(16);
    for (const p of ["p1", "p2", "p3"] as PlayerId[]) {
      expect(state.zones[handZone(p)]?.tileIds).toHaveLength(13);
    }
  });

  it("화료: 17장 5멘쯔 1작두 손이 보유자에겐 쯔모 화료형으로 인정된다", () => {
    const game = createStandardGameFromState(craftWin17());
    installAugment(game.engine, trueDragon, "p0", { yaku: game.yaku });
    expect(winValidate(game, "p0")).toBeNull();
  });

  it("리치: 5멘쯔 구성에서 1장 빠진 16장 텐파이면 리치 선언이 검증을 통과한다", () => {
    // 손 17장 = 텐파이 16장(123m456m789m123p456p + 7s 단기) + 쯔모패 1z
    const game = createStandardGameFromState(
      craft({
        hands: { p0: "123m456m789m123p456p7s1z", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
    );
    const drawn = game.engine.state.round.lastDrawnTile as TileId;
    // 미설치: 16장 손은 표준(4멘쯔) 기준으로는 텐파이가 아니다
    expect(riichiValidate(game, "p0", drawn)).toBe("not tenpai after discard");

    installAugment(game.engine, trueDragon, "p0", { yaku: game.yaku });
    expect(riichiValidate(game, "p0", drawn)).toBeNull();
  });

  it("비보유(설치 전): 같은 17장 손은 화료형이 아니다", () => {
    const game = createStandardGameFromState(craftWin17());
    expect(winValidate(game, "p0")).toBe("not a winning hand");
  });

  it("화료 +3판: 정산 winInfo에 extraHan 3이 반영된다 (보유자 전용)", () => {
    const game = createStandardGameFromState(craftWin17());
    installAugment(game.engine, trueDragon, "p0", { yaku: game.yaku });

    // 규칙 합성: 보유자만 +3, 비보유자는 0
    const rctx = { state: game.engine.state };
    expect(
      game.engine.rules.resolve<number>("score.extraHan", { ...rctx, playerId: "p0" }),
    ).toBe(3);
    expect(
      game.engine.rules.resolve<number>("score.extraHan", { ...rctx, playerId: "p1" }),
    ).toBe(0);

    // 쯔모 화료 → 정산까지 실주행
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const winOption = status.prompts
      .find((p) => p.player === "p0")
      ?.options.find((o) => o.type === "win");
    expect(winOption).toBeDefined();
    const done = flow.submit("p0", winOption as { type: string; payload: unknown });
    expect(done).toEqual({ kind: "roundOver", outcome: "win" });

    const settled = game.engine.eventLog.find((e) => e.type === ROUND_SETTLED);
    const payload = settled?.payload as RoundSettledPayload | undefined;
    const info = payload?.winInfos?.[0];
    expect(info?.winner).toBe("p0");
    expect(info?.extraHan).toBe(3);
    // 멘젠쯔모 1판 + 추가 3판 이상
    expect(info?.han ?? 0).toBeGreaterThanOrEqual(4);
  });
});
