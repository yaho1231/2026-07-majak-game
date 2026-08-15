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
import type { GameState, PlayerId, TileId, TileKind } from "@majak/core";
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

/**
 * 손바닥 뒤집기 — 2026-08-15 개편.
 * 리치 **해제**가 아니라 리치를 유지한 채 손패 1장을 패산 맨 위 1장과 맞바꾼다.
 */
describe("손바닥 뒤집기 (palm_flip)", () => {
  const P2 = kindKey({ suit: "pin", rank: 2 });
  const P4 = kindKey({ suit: "pin", rank: 4 });

  /**
   * p0: 123m456m789m 11p 23p + 쯔모 5p (리치 중이라 5p를 쯔모기리한다).
   * 패산 맨 위를 **4p로 고정**해 "2p를 내보내고 4p를 받으면 텐파이 유지"를 결정적으로 만든다
   * (2p→4p: 11p + 34p 대기로 갈아탄다).
   */
  function scene(riichi: boolean, incoming: TileKind = { suit: "pin", rank: 4 }): GameState {
    const base = craft({
      hands: { p0: "123m456m789m11p235p", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    // 패산 맨 위 한 장을 4p로 못박는다 (무엇이 들어오는지 결정적으로 만들기 위해)
    const top = base.zones[WALL]?.tileIds[0];
    if (top === undefined) throw new Error("패산이 비었다");
    const s = withAug(
      {
        ...base,
        tiles: {
          ...base.tiles,
          [top]: { ...base.tiles[top]!, kind: incoming },
        },
      },
      "p0",
      ["palm_flip"],
    );
    if (!riichi) return s;
    return {
      ...s,
      round: {
        ...s.round,
        byPlayer: {
          ...s.round.byPlayer,
          p0: {
            ...s.round.byPlayer["p0"]!,
            riichi: { double: false, ippatsu: false, discardIndex: 0 },
            riichiFuriten: true,
          },
        },
      },
    };
  }
  function setup(state: GameState) {
    const game = createStandardGameFromState(state);
    installAugment(game.engine, palmFlip, "p0", { yaku: game.yaku });
    return game;
  }

  /** 손패에서 그 종류의 첫 패 */
  function handTile(state: GameState, key: string): TileId {
    const id = handIdsOf(state, "p0").find((t) => kindKey(kindOf(state, t)) === key);
    if (id === undefined) throw new Error(`손패에 ${key}가 없다`);
    return id;
  }

  it("리치를 유지한 채 손패 1장과 패산 맨 위 1장을 맞바꾼다", () => {
    const game = setup(scene(true));
    const st0 = game.engine.state;
    const potBefore = st0.round.riichiPot;
    const wallBefore = [...(st0.zones[WALL]?.tileIds ?? [])];
    const out = handTile(st0, P2);
    const incoming = wallBefore[0] as TileId;

    const r = game.engine.submit({
      player: "p0",
      type: "flip_riichi",
      payload: { tileId: out },
    });
    expect(r.ok).toBe(true);

    const st = game.engine.state;
    // 리치는 그대로 서 있다 (해제가 아니다 — 승부수와의 차이)
    expect(st.round.byPlayer["p0"]?.riichi).not.toBeNull();
    // 공탁도 그대로 (환급 없음)
    expect(st.round.riichiPot).toBe(potBefore);
    // 패가 맞바뀌었다: 내보낸 패는 패산 맨 밑, 받은 패는 손에
    expect(handIdsOf(st, "p0")).not.toContain(out);
    expect(handIdsOf(st, "p0")).toContain(incoming);
    expect(st.zones[WALL]?.tileIds).toHaveLength(wallBefore.length);
    expect(st.zones[WALL]?.tileIds.at(-1)).toBe(out);
    // 대기가 통째로 바뀌었으므로 리치 후리텐은 풀린다
    expect(st.round.byPlayer["p0"]?.riichiFuriten).toBe(false);
    // 손패 장수는 그대로
    expect(handIdsOf(st, "p0")).toHaveLength(handIdsOf(st0, "p0").length);
  });

  it("바꾸면 텐파이가 깨지는 패는 고를 수 없다", () => {
    // 들어올 패가 고립 자패(동)면 무엇을 내보내도 텐파이가 깨진다 — 후보가 하나도 없다
    const game = setup(scene(true, { suit: "wind", rank: 1 }));
    const st0 = game.engine.state;
    const bad = handTile(st0, P2);
    const r = game.engine.submit({
      player: "p0",
      type: "flip_riichi",
      payload: { tileId: bad },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not tenpai after swap");
  });

  it("쯔모패 자체는 바꿀 수 없다 (그건 무르기의 몫이다)", () => {
    const game = setup(scene(true));
    const drawn = game.engine.state.round.lastDrawnTile as TileId;
    const r = game.engine.submit({
      player: "p0",
      type: "flip_riichi",
      payload: { tileId: drawn },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("cannot swap the drawn tile");
  });

  it("리치 중이 아니면 발동할 수 없다", () => {
    const game = setup(scene(false));
    const out = handTile(game.engine.state, P2);
    expect(
      game.engine.submit({ player: "p0", type: "flip_riichi", payload: { tileId: out } }).ok,
    ).toBe(false);
  });

  it("리치 공탁에는 손대지 않는다 (재리치 무료가 아니다)", () => {
    const game = setup(scene(true));
    const out = handTile(game.engine.state, P2);
    game.engine.submit({ player: "p0", type: "flip_riichi", payload: { tileId: out } });
    for (const p of ["p0", "p1"] as PlayerId[]) {
      expect(
        game.engine.rules.resolve<number>("riichi.cost", {
          playerId: p,
          state: game.engine.state,
        }),
      ).toBe(1000);
    }
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
