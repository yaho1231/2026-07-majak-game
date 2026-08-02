/**
 * 스텔스 리치 (stealth_riichi) — 커스텀 액션(stealth_riichi, 공탁 면제)으로 리치를
 * 걸면 타가 뷰에서 리치 신호가 가려진다.
 *
 * 회귀: `riichi.hidden`이 보유자에게 조건 없이 항상 켜져 있어서, 홀더가 (커스텀
 * 액션이 아니라) 표준 riichi 액션으로 공탁 1000점을 내고 정식으로 선언해도 그대로
 * 은닉됐다 — "공탁까지 낸 정식 리치인데 아무에게도 안 보이는" 모순(docs/22).
 * 이제 이 국의 리치가 실제로 stealth 액션으로 선언됐을 때만 가린다.
 */

import { describe, expect, it } from "vitest";
import {
  buildPlayerView,
  createStandardGameFromState,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { stealthRiichi } from "../src/augments/stealth_riichi.js";

function withAug(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...ids] } : p,
    ),
  };
}

function handTilesOfKind(game: Game, player: PlayerId, key: string): TileId[] {
  const st = game.engine.state;
  return (st.zones[`hand:${player}`]?.tileIds ?? []).filter(
    (id) => kindKey(kindOf(st, id)) === key,
  );
}

type Game = ReturnType<typeof createStandardGameFromState>;

/** p0 텐파이(2s/5s/8s 대기) — 5s 한 장을 버리면 리치 성립. 14장 turn.act. */
function scene(): GameState {
  const base = craft({
    hands: { p0: "234m345p345s678s55s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return withAug(base, "p0", ["stealth_riichi"]);
}

function setup(state: GameState) {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, stealthRiichi, "p0", { yaku: game.yaku });
  return game;
}

describe("스텔스 리치 (stealth_riichi)", () => {
  it("커스텀 액션으로 선언하면 타가 뷰에서 리치가 가려진다 (공탁 없음)", () => {
    const game = setup(scene());
    const before = game.engine.state.players.find((p) => p.id === "p0")!.score;
    const tileId = handTilesOfKind(game, "p0", "sou5")[0];
    expect(tileId).toBeDefined();
    const r = game.engine.submit({
      player: "p0",
      type: "stealth_riichi",
      payload: { tileId: tileId as TileId },
    });
    expect(r.ok).toBe(true);
    // 공탁 없음 — 점수 변화 없음
    const after = game.engine.state.players.find((p) => p.id === "p0")!.score;
    expect(after).toBe(before);

    const viewP1 = buildPlayerView(game.engine.state, "p1", game.engine.rules);
    expect(viewP1.round.byPlayer["p0"]?.riichiDeclared).toBe(false);
    const viewP0 = buildPlayerView(game.engine.state, "p0", game.engine.rules);
    expect(viewP0.round.byPlayer["p0"]?.riichiHidden).toBe(true);
  });

  it("표준 riichi 액션(공탁 1000점)으로 선언하면 은닉되지 않는다 (회귀 수정)", () => {
    const game = setup(scene());
    const before = game.engine.state.players.find((p) => p.id === "p0")!.score;
    const tileId = handTilesOfKind(game, "p0", "sou5")[0];
    expect(tileId).toBeDefined();
    const r = game.engine.submit({
      player: "p0",
      type: "riichi",
      payload: { tileId: tileId as TileId },
    });
    expect(r.ok).toBe(true);
    // 공탁 1000점 지불 — 정식 리치
    const after = game.engine.state.players.find((p) => p.id === "p0")!.score;
    expect(after).toBe(before - 1000);

    const viewP1 = buildPlayerView(game.engine.state, "p1", game.engine.rules);
    expect(viewP1.round.byPlayer["p0"]?.riichiDeclared).toBe(true);
  });
});
