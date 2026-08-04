/**
 * 북풍 상인 × 자리 바꿈 — 빼놓은 北의 도라 판은 **실물을 따라간다**.
 *
 * 북빼기 도라는 `north_trader:pulled:...` 카운터로 세고 있었는데, 자리 바꿈은
 * 손패·후로 존을 통째로 맞바꾼다. 그래서 **北 실물은 상대에게 넘어갔는데 도라 판은
 * 원래 주인에게 남았다**(docs/25 손패 조작 #5) — 자기 앞에 없는 패로 판을 받는다.
 * 카운터 대신 지금 내 후로 존에 서 있는 北을 세면 실물과 점수가 어긋나지 않는다.
 */

import { describe, expect, it } from "vitest";
import {
  createStandardGameFromState,
  installAugment,
  kindOf,
  meldsZone,
  moveTiles,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { northTrader } from "../src/augments/north_trader.js";

const NORTH = { suit: "wind" as const, rank: 4 };

function withAug(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...ids] } : p,
    ),
  };
}

/** p0가 北 두 장을 빼놓은 상태 (후로 존에 서 있고, 어떤 Meld에도 속하지 않는다) */
function pulledTwo(): GameState {
  const base = craft({
    hands: { p0: "44z123m456m789m11p", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
  });
  const northIds = (base.zones[`hand:p0`]?.tileIds ?? []).filter((id) => {
    const k = kindOf(base, id);
    return k.suit === NORTH.suit && k.rank === NORTH.rank;
  });
  expect(northIds).toHaveLength(2);
  const zones = moveTiles(base.zones, `hand:p0`, meldsZone("p0"), northIds);
  return withAug({ ...base, zones }, "p0", ["north_trader"]);
}

function extraHanOf(state: GameState, holder: PlayerId): number {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, northTrader, holder, { yaku: game.yaku });
  return game.engine.rules.resolve<number>("score.extraHan", {
    playerId: holder,
    state: game.engine.state,
  });
}

describe("북풍 상인 — 빼놓은 北의 판은 실물을 따라간다", () => {
  it("내 앞에 北 두 장이 서 있으면 +2판", () => {
    expect(extraHanOf(pulledTwo(), "p0")).toBe(2);
  });

  it("자리 바꿈으로 후로 존이 넘어가면 판도 함께 사라진다", () => {
    const base = pulledTwo();
    const mine = [...(base.zones[meldsZone("p0")]?.tileIds ?? [])] as TileId[];
    // 자리 바꿈이 하는 일 — 후로 존을 통째로 상대에게 넘긴다
    const swapped: GameState = {
      ...base,
      zones: moveTiles(base.zones, meldsZone("p0"), meldsZone("p1"), mine),
    };
    expect(extraHanOf(swapped, "p0")).toBe(0);
  });
});

describe("북풍 상인 — 이름표 표시도 실물을 따라간다", () => {
  const VIEW_KEY = "view:*:north_trader:p0#round";

  it("후로 존이 넘어간 뒤 한 번 버리면 표시가 다시 맞춰진다", () => {
    const base = pulledTwo();
    const mine = [...(base.zones[meldsZone("p0")]?.tileIds ?? [])] as TileId[];
    const swapped: GameState = {
      ...base,
      // 표시에는 아직 2장으로 남아 있는데 실물은 넘어간 상태
      augmentData: { ...base.augmentData, [VIEW_KEY]: 2 },
      zones: moveTiles(base.zones, meldsZone("p0"), meldsZone("p1"), mine),
    };
    const game = createStandardGameFromState(swapped);
    installAugment(game.engine, northTrader, "p0", { yaku: game.yaku });
    expect(game.engine.state.augmentData[VIEW_KEY]).toBe(2);

    const tileId = (game.engine.state.zones["hand:p0"]?.tileIds ?? [])[0] as TileId;
    const r = game.engine.submit({ player: "p0", type: "discard", payload: { tileId } });
    expect(r.ok).toBe(true);
    expect(game.engine.state.augmentData[VIEW_KEY]).toBe(0);
  });
});
