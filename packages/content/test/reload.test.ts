/**
 * 재장전 (reload) — 소진한 내 다른 증강의 사용 횟수를 1 복구.
 *  1. 대상 증강의 `<id>:uses:<holder>` 카운터를 1 되돌리고, 재장전 자신을 1 소진한다.
 *  2. 소진 이력이 없는 증강·미보유 증강·자기 자신은 복구 대상이 아니다.
 */

import { describe, expect, it } from "vitest";
import {
  DraftController,
  createStandardGame,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "./helpers.js";
import { contentAugments } from "../src/index.js";
import { reload } from "../src/augments/reload.js";

function withAug(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...ids] } : p,
    ),
  };
}

/** p0 = reload + call_seal(사용 카운터 지정). */
function scene(callSealUses: number): GameState {
  const base = craft({
    hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
  });
  const s = withAug(base, "p0", ["reload", "call_seal"]);
  return { ...s, augmentData: { ...s.augmentData, "call_seal:uses:p0": callSealUses } };
}

function start(state: GameState) {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, reload, "p0", { yaku: game.yaku });
  return game;
}

describe("재장전 (reload)", () => {
  it("소진한 증강의 사용 카운터를 1 되돌리고 재장전을 1 소진한다", () => {
    const game = start(scene(2)); // call_seal 2회 소진
    const r = game.engine.submit({
      player: "p0",
      type: "reload_use",
      payload: { augmentId: "call_seal" },
    });
    expect(r.ok).toBe(true);
    expect(game.engine.state.augmentData["call_seal:uses:p0"]).toBe(1); // 1 복구
    expect(game.engine.state.augmentData["reload:uses:p0"]).toBe(1); // 재장전 소진
  });

  it("소진 이력이 없는(카운터 0) 증강은 후보가 아니다", () => {
    const game = start(scene(0));
    const r = game.engine.submit({
      player: "p0",
      type: "reload_use",
      payload: { augmentId: "call_seal" },
    });
    expect(r.ok).toBe(false);
  });

  it("자기 자신·미보유 증강은 복구할 수 없다", () => {
    const game = start(scene(2));
    expect(
      game.engine.submit({ player: "p0", type: "reload_use", payload: { augmentId: "reload" } }).ok,
    ).toBe(false);
    expect(
      game.engine.submit({ player: "p0", type: "reload_use", payload: { augmentId: "spy" } }).ok,
    ).toBe(false);
  });

  it("불리언 :used: 플래그로 소진을 기록하는 증강(red_five_touch)도 복구 대상이 된다", () => {
    const base = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
    });
    const s = withAug(base, "p0", ["reload", "red_five_touch"]);
    const withUsed: GameState = {
      ...s,
      augmentData: { ...s.augmentData, "red_five_touch:used:p0": true },
    };
    const game = start(withUsed);
    const provider = game.engine.turnOptionProviders[0];
    const opts = provider ? provider(game.engine.state, "p0") : [];
    expect(opts.some((o) => o.type === "reload_use")).toBe(true);

    const r = game.engine.submit({
      player: "p0",
      type: "reload_use",
      payload: { augmentId: "red_five_touch" },
    });
    expect(r.ok).toBe(true);
    expect(game.engine.state.augmentData["red_five_touch:used:p0"]).toBe(false);
  });

  it("holderTurnOptions가 복구 가능한 증강만 후보로 낸다", () => {
    const game = start(scene(1));
    const provider = game.engine.turnOptionProviders[0];
    const opts = provider ? provider(game.engine.state, "p0") : [];
    expect(opts.some((o) => o.type === "reload_use")).toBe(true);
    // 소진 이력이 없으면 후보 없음
    const game2 = start(scene(0));
    const provider2 = game2.engine.turnOptionProviders[0];
    const opts2 = provider2 ? provider2(game2.engine.state, "p0") : [];
    expect(opts2.some((o) => o.type === "reload_use")).toBe(false);
  });

  // 첫 스테이지에는 되살릴 증강이 아직 없다 — 그 자리에서 집으면 한 칸을 빈손으로 쓴다.
  it("첫 드래프트(gameStart)에는 제시되지 않고, 이후 스테이지에는 제시될 수 있다", () => {
    const players: PlayerId[] = ["p0", "p1", "p2", "p3"];
    let laterOffers = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const g = createStandardGame({
        seed,
        mode: "hanchan",
        extraAugments: contentAugments,
      });
      const draft = new DraftController(g.engine, g.augments, { yaku: g.yaku });
      for (const p of players) {
        expect(draft.roll("gameStart", p).map((d) => d.id)).not.toContain("reload");
        for (const stage of ["eastThird", "southEntry", "southThird"] as const) {
          if (draft.roll(stage, p).some((d) => d.id === "reload")) laterOffers++;
        }
      }
    }
    expect(laterOffers).toBeGreaterThan(0);
  });
});
