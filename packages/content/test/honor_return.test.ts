/**
 * 귀환 (honor_return) — 버린 자패를 다음 국 배패로.
 *  1. 발동하면 이번 국 바닥의 자패를 최대 4장(최근순) 기록한다.
 *  2. 다음 국 시작 시 배패 앞자리가 그 kind로 덮이고 기록이 비워진다(장수 불변).
 *  3. 자패를 버리지 않았으면 발동할 수 없다.
 */

import { describe, expect, it } from "vitest";
import {
  SYSTEM_PLAYER,
  createStandardGameFromState,
  handZone,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft, h } from "./helpers.js";
import { honorReturn } from "../src/augments/honor_return.js";

function withAug(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...ids] } : p,
    ),
  };
}

function setup(state: GameState) {
  const game = createStandardGameFromState(withAug(state, "p0", ["honor_return"]));
  installAugment(game.engine, honorReturn, "p0", { yaku: game.yaku });
  return game;
}

/** p0 바닥에 지정한 버림패를 깔아 둔 자기 턴 국면 */
function scene(discards: string): GameState {
  return craft({
    hands: { p0: "123m456m789m123p11s", p1: "*", p2: "*", p3: "*" },
    discards: { p0: discards },
    phase: "turn.act",
    turnSeat: 0,
  });
}

function handKeys(game: ReturnType<typeof setup>, id: PlayerId): string[] {
  const st = game.engine.state;
  return (st.zones[handZone(id)]?.tileIds ?? []).map((t) => kindKey(kindOf(st, t)));
}

describe("귀환 (honor_return) — 기록", () => {
  it("바닥의 자패를 최대 4장(최근순) 기록한다", () => {
    // 백(5z)·백·동(1z)·동 + 수패 몇 장 → 자패 4장
    const game = setup(scene("3m5z5z1z1z"));
    const r = game.engine.submit({ player: "p0", type: "honor_recall", payload: {} });
    expect(r.ok).toBe(true);
    const kept = game.engine.state.augmentData["honor_return:keep:p0"] as { suit: string; rank: number }[];
    expect(kept.length).toBe(4);
    // 최근순: 1z,1z,5z,5z (뒤에서부터)
    expect(kept.map((k) => kindKey(k as never))).toEqual(
      h("1z1z5z5z").map(kindKey),
    );
    // 사용 카운터 소진
    expect(game.engine.state.augmentData["honor_return:uses:p0"]).toBe(1);
  });

  it("자패가 5장 이상이어도 4장까지만 기록한다", () => {
    const game = setup(scene("1z2z3z4z5z6z"));
    game.engine.submit({ player: "p0", type: "honor_recall", payload: {} });
    const kept = game.engine.state.augmentData["honor_return:keep:p0"] as unknown[];
    expect(kept.length).toBe(4);
  });

  it("자패를 하나도 버리지 않았으면 발동할 수 없다", () => {
    const game = setup(scene("3m4m5m"));
    const r = game.engine.submit({ player: "p0", type: "honor_recall", payload: {} });
    expect(r.ok).toBe(false);
  });

  it("리치 중에는 발동할 수 없다 (docs/21 D-2 재확인 수정)", () => {
    const base = scene("3m5z5z1z1z");
    const state: GameState = {
      ...base,
      round: {
        ...base.round,
        byPlayer: {
          ...base.round.byPlayer,
          p0: {
            ...base.round.byPlayer["p0"]!,
            riichi: { double: false, ippatsu: false, discardIndex: 0 },
          },
        },
      },
    };
    const game = setup(state);
    const r = game.engine.submit({ player: "p0", type: "honor_recall", payload: {} });
    expect(r.ok).toBe(false);
  });
});

describe("귀환 (honor_return) — 배패 주입", () => {
  it("다음 국 배패 앞자리가 기록된 자패로 덮이고 기록이 비워진다", () => {
    const keep = h("1z1z5z5z");
    const base = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
    });
    const state: GameState = {
      ...base,
      round: { ...base.round, phase: "round.over" },
      augmentData: {
        ...base.augmentData,
        "honor_return:keep:p0": keep.map((k) => ({ ...k })),
      },
    };
    const game = setup(state);
    const r = game.engine.submit({ player: SYSTEM_PLAYER, type: "sys.startRound", payload: {} });
    expect(r.ok).toBe(true);

    // 배패 앞 4장이 기록된 자패다
    expect(handKeys(game, "p0").slice(0, 4)).toEqual(keep.map(kindKey));
    // 손패 장수 불변 (13장)
    expect(handKeys(game, "p0").length).toBe(13);
    // 기록은 비워졌다
    expect(game.engine.state.augmentData["honor_return:keep:p0"]).toEqual([]);
  });
});
