/**
 * 미련 (regret) — 유국 멘젠 텐파이 손을 다음 국 배패로.
 *  1. 유국(sys.settleDraw) 시 보유자가 멘젠 텐파이면 손패 kind가 보존된다.
 *  2. 텐파이가 아니거나 후로가 있으면 보존되지 않는다.
 *  3. 다음 국 시작(sys.startRound) 시 보존 손이 있으면 배패가 그 kind로 덮이고 보존이 비워진다.
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
import { regret } from "../src/augments/regret.js";

function withAug(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...ids] } : p,
    ),
  };
}

function setup(state: GameState) {
  const game = createStandardGameFromState(withAug(state, "p0", ["regret"]));
  installAugment(game.engine, regret, "p0", { yaku: game.yaku });
  return game;
}

function handKeys(game: ReturnType<typeof setup>, id: PlayerId): string[] {
  const st = game.engine.state;
  return (st.zones[handZone(id)]?.tileIds ?? [])
    .map((t) => kindKey(kindOf(st, t)))
    .sort();
}

/** 유국 국면 — 손패 지정, 벽 비움, phase turn.draw */
function drawScene(p0Hand: string, melds?: { kind: "pon"; spec: string }[]): GameState {
  const base = craft({
    hands: { p0: p0Hand, p1: "*", p2: "*", p3: "*" },
    ...(melds ? { melds: { p0: melds } } : {}),
    phase: "turn.draw",
    turnSeat: 0,
  });
  // 벽을 비워 유국 성립 (sys.settleDraw validate)
  return { ...base, zones: { ...base.zones, wall: { ...base.zones["wall"]!, tileIds: [] } } };
}

describe("미련 (regret) — 보존", () => {
  it("유국 시 멘젠 텐파이면 손패 kind가 보존된다", () => {
    // 123m456m789m11p23p = 1p/4p 대기 멘젠 텐파이
    const game = setup(drawScene("123m456m789m11p23p"));
    const r = game.engine.submit({ player: SYSTEM_PLAYER, type: "sys.settleDraw", payload: {} });
    expect(r.ok).toBe(true);
    const kept = game.engine.state.augmentData["regret:keep:p0"];
    expect(Array.isArray(kept)).toBe(true);
    expect((kept as unknown[]).length).toBe(13);
    // 보존된 kind가 원래 손패와 같은 집합
    const keptKeys = (kept as { suit: string; rank: number }[])
      .map((k) => kindKey(k as never))
      .sort();
    expect(keptKeys).toEqual(h("123m456m789m11p23p").map(kindKey).sort());
  });

  it("노텐이면 보존되지 않는다", () => {
    // 완전 노텐 손 (흩어진 패)
    const game = setup(drawScene("19m19p19s1234z55m"));
    game.engine.submit({ player: SYSTEM_PLAYER, type: "sys.settleDraw", payload: {} });
    expect(game.engine.state.augmentData["regret:keep:p0"]).toBeUndefined();
  });

  it("후로(열린 손)면 보존되지 않는다", () => {
    // 멜드 하나 + 나머지 손 — 멘젠이 아니므로 스킵
    const game = setup(drawScene("456m789m11p23p", [{ kind: "pon", spec: "111m" }]));
    game.engine.submit({ player: SYSTEM_PLAYER, type: "sys.settleDraw", payload: {} });
    expect(game.engine.state.augmentData["regret:keep:p0"]).toBeUndefined();
  });
});

describe("미련 (regret) — 배패 주입", () => {
  it("보존 손이 있으면 다음 국 배패가 그 kind로 덮이고 보존이 비워진다", () => {
    const keep = h("123m456m789m11p23p"); // 보존할 13 kind
    const base = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
    });
    const state: GameState = {
      ...base,
      round: { ...base.round, phase: "round.over" },
      augmentData: { ...base.augmentData, "regret:keep:p0": keep.map((k) => ({ ...k })) },
    };
    const game = setup(state);
    const r = game.engine.submit({ player: SYSTEM_PLAYER, type: "sys.startRound", payload: {} });
    expect(r.ok).toBe(true);

    // 배패가 보존 kind로 덮였다
    expect(handKeys(game, "p0")).toEqual(keep.map(kindKey).sort());
    // 보존은 비워졌다
    expect(game.engine.state.augmentData["regret:keep:p0"]).toEqual([]);
  });

  it("보존이 없으면 배패를 건드리지 않는다", () => {
    const base = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
    });
    const state: GameState = { ...base, round: { ...base.round, phase: "round.over" } };
    const game = setup(state);
    const before = game.engine.state.prngState;
    const r = game.engine.submit({ player: SYSTEM_PLAYER, type: "sys.startRound", payload: {} });
    expect(r.ok).toBe(true);
    // 정상적으로 새 배패가 깔린다 (13장)
    expect((game.engine.state.zones[handZone("p0")]?.tileIds ?? []).length).toBe(13);
    void before;
  });
});
