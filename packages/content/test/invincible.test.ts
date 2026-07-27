/**
 * invincible (천하무적) — 2국당 1회, 선언한 국 동안 타가는 보유자를 론할 수 없다.
 * 코어 규칙 `win.ronImmune`(playerId = '쏘일 사람')로 표준 win 액션의 리액션 분기를 막는다.
 */

import { describe, expect, it } from "vitest";
import { createStandardGameFromState, installAugment } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "./helpers.js";
import { roundKey } from "../src/util.js";
import { invincible } from "../src/augments/invincible.js";

type Game = ReturnType<typeof createStandardGameFromState>;

function winValidate(game: Game, player: PlayerId): string | null {
  const def = game.engine.actions.get("win");
  if (def === undefined) throw new Error("no win action");
  return def.validate(
    { player, type: "win", payload: {} },
    { state: game.engine.state, rules: game.engine.rules },
  );
}

/** p0가 5s를 버리고 p1이 그걸 론할 수 있는 리액션 상황 */
function craftRon(): GameState {
  const s = craft({
    hands: { p0: "*", p1: "234m345p345s678s5s", p2: "*", p3: "*" },
    phase: "reaction",
    turnSeat: 0,
    lastDiscard: { player: "p0", spec: "5s" },
  });
  return {
    ...s,
    players: s.players.map((p) =>
      p.id === "p0" ? { ...p, augments: ["invincible"] } : p,
    ),
  };
}

describe("invincible (천하무적)", () => {
  it("선언 전에는 평소대로 론당한다", () => {
    const game = createStandardGameFromState(craftRon());
    installAugment(game.engine, invincible, "p0", { yaku: game.yaku });
    expect(winValidate(game, "p1")).toBeNull();
  });

  it("선언한 국에는 아무도 보유자의 버림패를 론할 수 없다", () => {
    const base = craftRon();
    const state: GameState = {
      ...base,
      augmentData: {
        ...base.augmentData,
        [`invincible:active:${roundKey(base)}:p0`]: true,
      },
    };
    const game = createStandardGameFromState(state);
    installAugment(game.engine, invincible, "p0", { yaku: game.yaku });
    expect(winValidate(game, "p1")).toBe("discarder is immune to ron");
  });

  it("자기 턴에 선언하면 플래그와 쿨다운 2국이 기록되고, 쿨다운 중에는 막힌다", () => {
    const base = craft({
      hands: { p0: "234m345p345s678s55s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0" ? { ...p, augments: ["invincible"] } : p,
      ),
    };
    const game = createStandardGameFromState(state);
    installAugment(game.engine, invincible, "p0", { yaku: game.yaku });

    const r = game.engine.submit({
      player: "p0",
      type: "invincible_guard",
      payload: {},
    });
    expect(r.ok).toBe(true);

    const st = game.engine.state;
    expect(st.augmentData[`invincible:active:${roundKey(st)}:p0`]).toBe(true);
    expect(st.augmentData["invincible:cd:p0"]).toBe(2);

    // 같은 국 재선언 거부
    const again = game.engine.submit({
      player: "p0",
      type: "invincible_guard",
      payload: {},
    });
    expect(again.ok).toBe(false);
  });
});
