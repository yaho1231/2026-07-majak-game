/**
 * 손바닥 뒤집기 (palm_flip) · 북풍 상인 (north_trader).
 */

import { describe, expect, it } from "vitest";
import {
  DEAD_WALL,
  WALL,
  createStandardGameFromState,
  discardsZone,
  handIdsOf,
  installAugment,
  kindKey,
  kindOf,
  meldsZone,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { palmFlip } from "../src/augments/palm_flip.js";
import { northTrader } from "../src/augments/north_trader.js";

const NORTH = kindKey({ suit: "wind", rank: 4 });

function withAug(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === player ? { ...p, augments: [...ids] } : p)),
  };
}

describe("손바닥 뒤집기 (palm_flip)", () => {
  function scene(riichi: boolean): GameState {
    const base = craft({
      hands: { p0: "123m456m789m11p23p", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const s = withAug(base, "p0", ["palm_flip"]);
    if (!riichi) return s;
    return {
      ...s,
      round: {
        ...s.round,
        byPlayer: {
          ...s.round.byPlayer,
          p0: { ...s.round.byPlayer["p0"]!, riichi: { double: false, ippatsu: false, discardIndex: 0 } },
        },
      },
    };
  }
  function setup(state: GameState) {
    const game = createStandardGameFromState(state);
    installAugment(game.engine, palmFlip, "p0", { yaku: game.yaku });
    return game;
  }

  it("리치를 해제하고 재리치가 무료가 된다 (공탁 환급 없음)", () => {
    const game = setup(scene(true));
    const potBefore = game.engine.state.round.riichiPot;
    const r = game.engine.submit({ player: "p0", type: "flip_riichi", payload: {} });
    expect(r.ok).toBe(true);
    // 리치 해제
    expect(game.engine.state.round.byPlayer["p0"]?.riichi).toBeNull();
    // 공탁은 그대로 (환급 없음 — 승부수와의 차이)
    expect(game.engine.state.round.riichiPot).toBe(potBefore);
    // 재리치 공탁이 0
    expect(
      game.engine.rules.resolve<number>("riichi.cost", {
        playerId: "p0",
        state: game.engine.state,
      }),
    ).toBe(0);
  });

  it("리치 중이 아니면 발동할 수 없다", () => {
    const game = setup(scene(false));
    expect(game.engine.submit({ player: "p0", type: "flip_riichi", payload: {} }).ok).toBe(false);
  });

  it("타가의 재리치 공탁은 그대로다", () => {
    const game = setup(scene(true));
    game.engine.submit({ player: "p0", type: "flip_riichi", payload: {} });
    expect(
      game.engine.rules.resolve<number>("riichi.cost", {
        playerId: "p1",
        state: game.engine.state,
      }),
    ).toBe(1000);
  });
});

describe("북풍 상인 (north_trader)", () => {
  function scene(): GameState {
    const base = craft({
      hands: { p0: "4z123m456m789m11p1s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    return withAug(base, "p0", ["north_trader"]);
  }
  function setup(state: GameState) {
    const game = createStandardGameFromState(state);
    installAugment(game.engine, northTrader, "p0", { yaku: game.yaku });
    return game;
  }

  it("北을 후로 자리에 놓고 영상패로 보충한다 (손패 장수 불변, 후리텐 기록 없음)", () => {
    const game = setup(scene());
    const before = handIdsOf(game.engine.state, "p0").length;
    const wallBefore = game.engine.state.zones[WALL]!.tileIds.length;
    const deadBefore = [...game.engine.state.zones[DEAD_WALL]!.tileIds];
    const wallTail = game.engine.state.zones[WALL]!.tileIds.at(-1) as TileId;
    const north = handIdsOf(game.engine.state, "p0").find(
      (id) => kindKey(kindOf(game.engine.state, id)) === NORTH,
    ) as TileId;

    const r = game.engine.submit({ player: "p0", type: "north_pull", payload: { tileId: north } });
    expect(r.ok).toBe(true);

    const st = game.engine.state;
    expect(handIdsOf(st, "p0").length).toBe(before); // 장수 불변
    expect(st.zones[WALL]!.tileIds.length).toBe(wallBefore - 1); // 패산 1장 소모
    // 보충은 **영상패**(왕패 맨 앞) — 패산 맨 앞이 아니다
    expect(handIdsOf(st, "p0")).toContain(deadBefore[0]);
    // 왕패는 패산 최후미로 되채워져 14장 그대로, 되채운 패가 맨 앞에 온다
    expect(st.zones[DEAD_WALL]!.tileIds.length).toBe(deadBefore.length);
    expect(st.zones[DEAD_WALL]!.tileIds[0]).toBe(wallTail);
    // 신규패(쯔모패) 자리는 보충패로 넘어가고, 영상 쯔모라 영상개화가 선다
    expect(st.round.lastDrawnTile).toBe(deadBefore[0]);
    expect(st.round.lastDrawRinshan).toBe(true);
    // 후로 자리에 보관 — 바닥(버림패 줄)에는 가지 않는다
    expect(st.zones[meldsZone("p0")]?.tileIds).toContain(north);
    expect(st.zones[discardsZone("p0")]?.tileIds ?? []).not.toContain(north);
    // 버림이 아니다 — 후리텐 이력·lastDiscard 무변
    expect(st.round.byPlayer["p0"]?.discardedKinds ?? []).not.toContain(NORTH);
    expect(st.round.lastDiscard).toBeNull();
    // 후로 자리에 놓였지만 Meld는 아니다 — 손은 여전히 닫혀 있다(멘젠 유지)
    expect(st.round.byPlayer["p0"]?.melds ?? []).toHaveLength(0);
  });

  it("깡도라를 뒤집지 않고 일발도 끊지 않는다 (북빼기는 후로가 아니다)", () => {
    // 상대 하나에게 리치 일발을 세워 둔다 — 북빼기로 꺼지면 안 된다
    const base = scene();
    const game = setup({
      ...base,
      round: {
        ...base.round,
        byPlayer: {
          ...base.round.byPlayer,
          p1: {
            ...base.round.byPlayer["p1"]!,
            riichi: { double: false, ippatsu: true, discardIndex: 0 },
          },
        },
      },
    });
    const doraBefore = [...game.engine.state.round.doraIndicators];
    const north = handIdsOf(game.engine.state, "p0").find(
      (id) => kindKey(kindOf(game.engine.state, id)) === NORTH,
    ) as TileId;
    expect(
      game.engine.submit({ player: "p0", type: "north_pull", payload: { tileId: north } }).ok,
    ).toBe(true);

    const st = game.engine.state;
    expect(st.round.doraIndicators).toEqual(doraBefore);
    expect(st.round.byPlayer["p1"]?.riichi?.ippatsu).toBe(true);
  });

  it("빼놓은 장수만큼 판이 붙는다 (보유자 전용)", () => {
    const game = setup(scene());
    const north = handIdsOf(game.engine.state, "p0").find(
      (id) => kindKey(kindOf(game.engine.state, id)) === NORTH,
    ) as TileId;
    game.engine.submit({ player: "p0", type: "north_pull", payload: { tileId: north } });
    expect(
      game.engine.rules.resolve<number>("score.extraHan", {
        playerId: "p0",
        state: game.engine.state,
      }),
    ).toBe(1);
    expect(
      game.engine.rules.resolve<number>("score.extraHan", {
        playerId: "p1",
        state: game.engine.state,
      }),
    ).toBe(0);
  });

  it("北이 아닌 패는 뺄 수 없다", () => {
    const game = setup(scene());
    const other = handIdsOf(game.engine.state, "p0").find(
      (id) => kindKey(kindOf(game.engine.state, id)) !== NORTH,
    ) as TileId;
    expect(
      game.engine.submit({ player: "p0", type: "north_pull", payload: { tileId: other } }).ok,
    ).toBe(false);
  });
});
