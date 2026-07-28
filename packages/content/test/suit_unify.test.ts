/**
 * suit_unify (단색 세계) 테스트.
 * (1) 발동창이 동1국이 아니라 '각 국의 첫 순'에 열린다(게임당 1회는 usedKey로 유지, 46차).
 * (2) 48차: 청일색 봉인 삭제 — 발동 전후 어느 시점에도 역을 봉인하지 않는다
 *     (리미트는 횟수로만 준다, 10_AUGMENT_SYSTEM §0).
 */

import { describe, expect, it } from "vitest";
import {
  SYSTEM_PLAYER,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "./helpers.js";
import { suitUnify } from "../src/augments/suit_unify.js";

type Game = ReturnType<typeof createStandardGameFromState>;

function monoValidate(game: Game, player: PlayerId): string | null {
  const def = game.engine.actions.get("mono_world");
  if (def === undefined) throw new Error("no mono_world action");
  return def.validate(
    { player, type: "mono_world", payload: { suit: "pin" } },
    { state: game.engine.state, rules: game.engine.rules },
  );
}

function blockedYaku(game: Game, player: PlayerId): string[] {
  return game.engine.rules.resolve<string[]>("win.blockedYaku", {
    playerId: player,
    state: game.engine.state,
  });
}

/** 보유 증강을 player.augments에 심는다(실게임은 드래프트 리듀서가 채우는 자리). */
function withAugment(state: GameState, pid: PlayerId, augId: string): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === pid ? { ...p, augments: [...p.augments, augId] } : p,
    ),
  };
}

/** 자기 첫 순(turn.act·아직 안 버림) 상태 — round만 원하는 국으로 바꿔 쓴다. */
function firstHandState(round: Partial<GameState["round"]>): GameState {
  const base = craft({
    hands: { p0: "123m456m789m123p11s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return withAugment({ ...base, round: { ...base.round, ...round } }, "p0", "suit_unify");
}

describe("suit_unify (단색 세계)", () => {
  it("동1국이 아닌 국(남1국)에서도 첫 순이면 발동할 수 있다", () => {
    const game = createStandardGameFromState(
      firstHandState({ prevalentWind: 2, roundNumber: 1, honba: 0 }),
    );
    installAugment(game.engine, suitUnify, "p0", { yaku: game.yaku });
    expect(monoValidate(game, "p0")).toBeNull();
  });

  it("이미 버린 뒤(첫 순이 지남)에는 발동할 수 없다", () => {
    const base = craft({
      hands: { p0: "123m456m789m123p1s", p1: "*", p2: "*", p3: "*" },
      discards: { p0: "9m" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = createStandardGameFromState(
      withAugment(
        { ...base, round: { ...base.round, prevalentWind: 2, roundNumber: 1 } },
        "p0",
        "suit_unify",
      ),
    );
    installAugment(game.engine, suitUnify, "p0", { yaku: game.yaku });
    expect(monoValidate(game, "p0")).toBe("only on the first hand");
  });

  it("발동 전후 어느 쪽도 역을 봉인하지 않는다 — 청일색까지 그대로 (동풍전 1회)", () => {
    const base = firstHandState({ prevalentWind: 1, roundNumber: 1, honba: 0 });
    const game = createStandardGameFromState({
      ...base,
      config: { ...base.config, mode: "tonpuu" },
    });
    installAugment(game.engine, suitUnify, "p0", { yaku: game.yaku });

    expect(blockedYaku(game, "p0")).not.toContain("chinitsu");

    const res = game.engine.submit({ player: "p0", type: "mono_world", payload: { suit: "pin" } });
    expect(res.ok).toBe(true);

    // 48차: 통일해 준 색으로 청일색을 그대로 노릴 수 있다 (페널티 없음)
    expect(blockedYaku(game, "p0")).not.toContain("chinitsu");
    expect(blockedYaku(game, "p1")).not.toContain("chinitsu");

    // 리미트는 오직 횟수 — 게임당 1회
    expect(monoValidate(game, "p0")).toBe("already used");
  });
});
