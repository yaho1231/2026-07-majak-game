/**
 * 붉은 손길 (red_five_touch) — 자기 턴에 숫자 하나를 지정해 손패의 그 숫자를
 * 전부 적도라로 만든다(게임당 1회, 이후 상시 각인).
 *
 * 회귀: 리치 중에는 손이 잠긴다는 전제가 다른 손패 변형 액티브(giant_god 등)와
 * 달리 이 증강엔 없었다 — 리치 후에도 무비용으로 판수를 늘릴 수 있었다(docs/22 D-2).
 */

import { describe, expect, it } from "vitest";
import { createStandardGameFromState, installAugment } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "./helpers.js";
import { redFiveTouch } from "../src/augments/red_five_touch.js";

function withAug(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...ids] } : p,
    ),
  };
}

function scene(riichi: boolean): GameState {
  const base = craft({
    hands: { p0: "555m456p789s123p1z", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
  });
  const withAugs = withAug(base, "p0", ["red_five_touch"]);
  if (!riichi) return withAugs;
  return {
    ...withAugs,
    round: {
      ...withAugs.round,
      byPlayer: {
        ...withAugs.round.byPlayer,
        p0: {
          ...withAugs.round.byPlayer["p0"]!,
          riichi: { double: false, ippatsu: false, discardIndex: 0 },
        },
      },
    },
  };
}

function setup(state: GameState) {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, redFiveTouch, "p0", { yaku: game.yaku });
  return game;
}

describe("붉은 손길 (red_five_touch)", () => {
  it("리치가 아니면 지정한 숫자를 적도라로 물들일 수 있다", () => {
    const game = setup(scene(false));
    const r = game.engine.submit({
      player: "p0",
      type: "red_touch",
      payload: { rank: 5 },
    });
    expect(r.ok).toBe(true);
  });

  it("리치 중에는 발동할 수 없다 (손이 잠긴다는 전제 위반 — docs/22 D-2 재확인 수정)", () => {
    const game = setup(scene(true));
    const r = game.engine.submit({
      player: "p0",
      type: "red_touch",
      payload: { rank: 5 },
    });
    expect(r.ok).toBe(false);
  });
});
