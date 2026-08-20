/**
 * 2026-08-20 페르소나 QA 회귀 — 손패 조작 계열 (hand-a / hand-b / riichi / text).
 *
 * 각 describe는 findings 문서의 확정 항목 하나에 대응한다.
 */

import {
  DEAD_WALL,
  SYSTEM_PLAYER,
  TILE_DISCARDED,
  discardsZone,
  kindKey,
  createStandardGameFromState,
  handZone,
  installAugment,
} from "@majak/core";
import type { AugmentDef, GameState, PlayerId, TileId } from "@majak/core";
import { describe, expect, it } from "vitest";
import { deadWallMaster } from "../src/augments/dead_wall_master.js";
import { futureSight } from "../src/augments/future_sight.js";
import { fullHandSwap } from "../src/augments/full_hand_swap.js";
import { bluffPretense } from "../src/augments/bluff_pretense.js";
import { honorReturn } from "../src/augments/honor_return.js";
import { tileSplit } from "../src/augments/tile_split.js";
import { regret } from "../src/augments/regret.js";
import { pickyEater, questProgress } from "../src/augments/picky_eater.js";
import { redFiveTouch } from "../src/augments/red_five_touch.js";
import { handSwap3 } from "../src/augments/hand_swap3.js";
import { seatSwap } from "../src/augments/seat_swap.js";
import { roundKey } from "../src/util.js";
import { craft } from "./helpers.js";

function withAugments(state: GameState, who: string, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === who ? { ...p, augments: [...p.augments, ...ids] } : p,
    ),
  };
}

/** hand-b 확정 1 */
describe("dead_wall_master — 영상 쯔모를 왕패 패로 갈아 끼우면 영상개화가 내려간다", () => {
  it("lastDrawRinshan이 false가 된다", () => {
    const base = craft({
      hands: { p0: "234m567m88p99s", p1: "111z", p2: "222z", p3: "333z" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const drawn = base.round.lastDrawnTile as TileId;
    // 안깡 직후(영상 쯔모)를 흉내낸다
    const state = withAugments(
      { ...base, round: { ...base.round, lastDrawRinshan: true } },
      "p0",
      [deadWallMaster.id],
    );

    const game = createStandardGameFromState(state, undefined, [deadWallMaster]);
    installAugment(game.engine, deadWallMaster, "p0", { yaku: game.yaku });

    const res = game.engine.submit({
      player: "p0",
      type: "dw_swap",
      payload: { handTileId: drawn, deadIndex: 0 },
    });
    expect(res.ok).toBe(true);
    const after = game.engine.state;
    expect(after.round.lastDrawRinshan).toBe(false);
    // 가져온 왕패 패가 새 쯔모패다
    expect(after.round.lastDrawnTile).toBe(
      state.zones[DEAD_WALL]?.tileIds[0] as TileId,
    );
    expect(
      (after.zones[handZone("p0")]?.tileIds ?? []).includes(
        after.round.lastDrawnTile as TileId,
      ),
    ).toBe(true);
  });

  it("쯔모패가 아닌 패를 내보내면 영상 플래그는 그대로다", () => {
    const base = craft({
      hands: { p0: "234m567m88p99s", p1: "111z", p2: "222z", p3: "333z" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const hand = base.zones[handZone("p0")]?.tileIds ?? [];
    const notDrawn = hand[0] as TileId;
    const state = withAugments(
      { ...base, round: { ...base.round, lastDrawRinshan: true } },
      "p0",
      [deadWallMaster.id],
    );
    const game = createStandardGameFromState(state, undefined, [deadWallMaster]);
    installAugment(game.engine, deadWallMaster, "p0", { yaku: game.yaku });
    const res = game.engine.submit({
      player: "p0",
      type: "dw_swap",
      payload: { handTileId: notDrawn, deadIndex: 0 },
    });
    expect(res.ok).toBe(true);
    expect(game.engine.state.round.lastDrawRinshan).toBe(true);
    expect(game.engine.state.round.lastDrawnTile).toBe(base.round.lastDrawnTile);
  });
});

/** riichi 확정 7 */
describe("보유자 자신이 리치 중이면 손 통째 교환은 막힌다", () => {
  const RIICHI = { double: true, ippatsu: true, discardIndex: 0, cost: 1000 };

  function scene(def: { id: string }): GameState {
    const base = craft({
      hands: { p0: "234m345p345s678s55s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    return {
      ...withAugments(base, "p0", [def.id]),
      round: {
        ...base.round,
        turnCount: 1,
        riichiPot: 1000,
        byPlayer: {
          ...base.round.byPlayer,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          p0: { ...base.round.byPlayer["p0"]!, riichi: RIICHI },
        },
      },
    };
  }

  const cases: {
    name: string;
    def: AugmentDef;
    action: string;
    payload: unknown;
  }[] = [
    {
      name: "full_hand_swap",
      def: fullHandSwap,
      action: "hand_swap",
      payload: { target: "p1" },
    },
    {
      name: "hand_swap3",
      def: handSwap3,
      action: "swap3",
      payload: { target: "p1" },
    },
    {
      name: "seat_swap",
      def: seatSwap,
      action: "seat_swap",
      payload: { target: "p1" },
    },
  ];

  for (const c of cases) {
    it(`${c.name} — 리치 중 발동이 거부되고 손패가 그대로다`, () => {
      const st = scene(c.def);
      const game = createStandardGameFromState(st);
      installAugment(game.engine, c.def, "p0", { yaku: game.yaku });
      const before = [...(game.engine.state.zones[handZone("p0")]?.tileIds ?? [])];
      const res = game.engine.submit({
        player: "p0",
        type: c.action,
        payload: c.payload as never,
      });
      expect(res.ok).toBe(false);
      expect(game.engine.state.zones[handZone("p0")]?.tileIds).toEqual(before);
      expect(game.engine.state.round.byPlayer["p0"]?.riichi).not.toBeNull();
    });
  }
});

/** text 확정 18 — 후로 직후(쯔모패 없는 순)에는 자리 바꿈이 열리지 않는다 */
describe("seat_swap — 쯔모패가 없는 순에는 발동할 수 없다", () => {
  it("lastDrawnTile이 null이면 거부되고 후보도 비어 있다", () => {
    const base = craft({
      hands: { p0: "234m345p345s678s", p1: "*", p2: "*", p3: "*" },
      melds: { p0: [{ kind: "pon", spec: "111z", from: "p1" }] },
      phase: "turn.act",
      turnSeat: 0,
    });
    const state = {
      ...withAugments(base, "p0", [seatSwap.id]),
      round: { ...base.round, turnCount: 1, lastDrawnTile: null },
    };
    const game = createStandardGameFromState(state, undefined, [seatSwap]);
    installAugment(game.engine, seatSwap, "p0", { yaku: game.yaku });
    const res = game.engine.submit({
      player: "p0",
      type: "seat_swap",
      payload: { target: "p1" } as never,
    });
    expect(res.ok).toBe(false);
  });

  it("쯔모패가 있으면 정상 발동하고 남는 한 장이 그 쯔모패다", () => {
    const base = craft({
      hands: { p0: "123m456m789m123p1p", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const drawn = base.round.lastDrawnTile as TileId;
    const state = {
      ...withAugments(base, "p0", [seatSwap.id]),
      round: { ...base.round, turnCount: 1 },
    };
    const game = createStandardGameFromState(state, undefined, [seatSwap]);
    installAugment(game.engine, seatSwap, "p0", { yaku: game.yaku });
    const oldHand = new Set(state.zones[handZone("p0")]?.tileIds ?? []);
    const res = game.engine.submit({
      player: "p0",
      type: "seat_swap",
      payload: { target: "p1" } as never,
    });
    expect(res.ok).toBe(true);
    const kept = (game.engine.state.zones[handZone("p0")]?.tileIds ?? []).filter(
      (id) => oldHand.has(id),
    );
    expect(kept).toEqual([drawn]);
  });
});

/** hand-a 확정 3 — 무장 자체가 발동을 소모한다 (공짜 확인·공짜 취소 차단) */
describe("future_sight — future_arm이 쿨다운을 소모한다", () => {
  function scene(extra: Record<string, unknown> = {}): GameState {
    const base = craft({
      hands: { p0: "123m456m789m123p1p", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    return {
      ...withAugments(base, "p0", [futureSight.id]),
      augmentData: { ...base.augmentData, ...extra },
    };
  }

  it("무장하면 쿨다운 기준점이 그 자리에서 찍힌다", () => {
    const st = scene();
    const rk = roundKey(st);
    const game = createStandardGameFromState(st, undefined, [futureSight]);
    installAugment(game.engine, futureSight, "p0", { yaku: game.yaku });
    const res = game.engine.submit({
      player: "p0",
      type: "future_arm",
      payload: {} as never,
    });
    expect(res.ok).toBe(true);
    expect(game.engine.state.augmentData[`future_sight:last:${rk}:p0#round`]).toBe(0);
    expect(game.engine.state.augmentData[`future_sight:armed:${rk}:p0#round`]).toBe(true);
  });

  it("무장만 하고 물러났다면 다음 순에 다시 무장할 수 없다", () => {
    const probe = scene();
    const rk = roundKey(probe);
    // 0순에 무장하고 물러난 뒤(armed=false) 1순이 된 상태
    const st = scene({
      [`future_sight:last:${rk}:p0#round`]: 0,
      [`future_sight:turns:${rk}:p0#round`]: 1,
    });
    const game = createStandardGameFromState(st, undefined, [futureSight]);
    installAugment(game.engine, futureSight, "p0", { yaku: game.yaku });
    const res = game.engine.submit({
      player: "p0",
      type: "future_arm",
      payload: {} as never,
    });
    expect(res.ok).toBe(false);
  });

  it("내 순이 3번 지나면 다시 무장할 수 있다", () => {
    const probe = scene();
    const rk = roundKey(probe);
    const st = scene({
      [`future_sight:last:${rk}:p0#round`]: 0,
      [`future_sight:turns:${rk}:p0#round`]: 3,
    });
    const game = createStandardGameFromState(st, undefined, [futureSight]);
    installAugment(game.engine, futureSight, "p0", { yaku: game.yaku });
    const res = game.engine.submit({
      player: "p0",
      type: "future_arm",
      payload: {} as never,
    });
    expect(res.ok).toBe(true);
  });

  it("무장 중에는 그 무장이 찍은 쿨다운이 교환을 막지 않는다 — 뽑힌 3장으로 교환된다", () => {
    const probe = scene();
    const hand = [...(probe.zones[handZone("p0")]?.tileIds ?? [])];
    let ok = 0;
    for (const tileId of hand) {
      const game = createStandardGameFromState(scene(), undefined, [futureSight]);
      installAugment(game.engine, futureSight, "p0", { yaku: game.yaku });
      expect(
        game.engine.submit({
          player: "p0",
          type: "future_arm",
          payload: {} as never,
        }).ok,
      ).toBe(true);
      if (
        game.engine.submit({
          player: "p0",
          type: "future_exchange",
          payload: { tileId } as never,
        }).ok
      ) {
        ok++;
      }
    }
    expect(ok).toBe(3);
  });
});

/** hand-a 확정 4 — 넘길 3장 중 하나가 손을 떠나면 그 선택은 무효가 되고 다시 고를 수 있다 */
describe("hand_swap3 — give한 패를 버려도 그 국의 교환이 죽지 않는다", () => {
  function setup(): {
    game: ReturnType<typeof createStandardGameFromState>;
    state: GameState;
  } {
    const base = craft({
      hands: { p0: "123m456m789m123p1p", p1: "234s567s99p11z22z", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const state = withAugments(base, "p0", [handSwap3.id]);
    const game = createStandardGameFromState(state, undefined, [handSwap3]);
    installAugment(game.engine, handSwap3, "p0", { yaku: game.yaku });
    return { game, state };
  }

  it("버린 뒤에 give를 다시 고르고 교환까지 끝낼 수 있다", () => {
    const { game } = setup();
    expect(
      game.engine.submit({
        player: "p0",
        type: "swap3",
        payload: { target: "p1" } as never,
      }).ok,
    ).toBe(true);

    const hand = [...(game.engine.state.zones[handZone("p0")]?.tileIds ?? [])].sort(
      (a, b) => a - b,
    );
    const gives = hand.slice(0, 3);
    expect(
      game.engine.submit({
        player: "p0",
        type: "swap3_give",
        payload: { gives } as never,
      }).ok,
    ).toBe(true);

    // 넘기기로 한 3장 중 하나를 그냥 버린다
    expect(
      game.engine.submit({
        player: "p0",
        type: "discard",
        payload: { tileId: gives[0] } as never,
      }).ok,
    ).toBe(true);

    // 내 순이 다시 오면 give를 새로 고를 수 있어야 한다
    const st = game.engine.state;
    const back: GameState = {
      ...st,
      round: { ...st.round, phase: "turn.act", turnSeat: 0 },
    };
    const g2 = createStandardGameFromState(back, undefined, [handSwap3]);
    installAugment(g2.engine, handSwap3, "p0", { yaku: g2.yaku });
    const myHand = [...(g2.engine.state.zones[handZone("p0")]?.tileIds ?? [])].sort(
      (a, b) => a - b,
    );
    const gives2 = myHand.slice(0, 3);
    expect(
      g2.engine.submit({
        player: "p0",
        type: "swap3_give",
        payload: { gives: gives2 } as never,
      }).ok,
    ).toBe(true);

    const theirs = [...(g2.engine.state.zones[handZone("p1")]?.tileIds ?? [])]
      .sort((a, b) => a - b)
      .slice(0, 3);
    const res = g2.engine.submit({
      player: "p0",
      type: "swap3_take",
      payload: { takes: theirs } as never,
    });
    expect(res.ok).toBe(true);
    const after = g2.engine.state.zones[handZone("p0")]?.tileIds ?? [];
    for (const id of theirs) expect(after).toContain(id);
    for (const id of gives2) expect(after).not.toContain(id);
  });

  it("3장이 그대로 손에 있으면 give는 다시 고를 수 없다", () => {
    const { game } = setup();
    game.engine.submit({
      player: "p0",
      type: "swap3",
      payload: { target: "p1" } as never,
    });
    const hand = [...(game.engine.state.zones[handZone("p0")]?.tileIds ?? [])].sort(
      (a, b) => a - b,
    );
    expect(
      game.engine.submit({
        player: "p0",
        type: "swap3_give",
        payload: { gives: hand.slice(0, 3) } as never,
      }).ok,
    ).toBe(true);
    expect(
      game.engine.submit({
        player: "p0",
        type: "swap3_give",
        payload: { gives: hand.slice(3, 6) } as never,
      }).ok,
    ).toBe(false);
  });
});

/** hand-a 확정 5 — 각인은 TILE_DRAWN이 아니라 '손패가 바뀌면' 다시 새긴다 */
describe("red_five_touch — 증강으로 손에 들어온 패에도 각인이 붙는다", () => {
  it("hand_swap3로 받아온 패가 그 자리에서 적도라가 된다", () => {
    const base = craft({
      hands: {
        p0: "123m456m789m123p1p",
        p1: "333s456s678s99p11z",
        p2: "*",
        p3: "*",
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const state = withAugments(base, "p0", [redFiveTouch.id, handSwap3.id]);
    const game = createStandardGameFromState(state, undefined, [
      redFiveTouch,
      handSwap3,
    ]);
    installAugment(game.engine, redFiveTouch, "p0", { yaku: game.yaku });
    installAugment(game.engine, handSwap3, "p0", { yaku: game.yaku });

    expect(
      game.engine.submit({
        player: "p0",
        type: "red_touch",
        payload: { rank: 3 } as never,
      }).ok,
    ).toBe(true);

    // p1의 3s 세 장을 받아온다 (쯔모가 아니므로 예전에는 각인이 안 붙었다)
    const theirThrees = (game.engine.state.zones[handZone("p1")]?.tileIds ?? [])
      .filter((id) => {
        const k = game.engine.state.tiles[id]?.kind;
        return k?.suit === "sou" && k.rank === 3;
      })
      .sort((a, b) => a - b);
    expect(theirThrees).toHaveLength(3);

    expect(
      game.engine.submit({
        player: "p0",
        type: "swap3",
        payload: { target: "p1" } as never,
      }).ok,
    ).toBe(true);
    const mine = [...(game.engine.state.zones[handZone("p0")]?.tileIds ?? [])].sort(
      (a, b) => a - b,
    );
    expect(
      game.engine.submit({
        player: "p0",
        type: "swap3_give",
        payload: { gives: mine.slice(0, 3) } as never,
      }).ok,
    ).toBe(true);
    expect(
      game.engine.submit({
        player: "p0",
        type: "swap3_take",
        payload: { takes: theirThrees } as never,
      }).ok,
    ).toBe(true);

    for (const id of theirThrees) {
      const attrs = game.engine.state.tiles[id]?.attrs;
      expect(attrs?.red).toBe(true);
      expect(attrs?.redFor).toBe("p0");
    }
  });
});

/** hand-b 확정 4 — 누명이 심은 패는 편식 퀘스트를 깨지도, 밀어 주지도 않는다 */
describe("picky_eater — 남이 심은 버림은 내 퀘스트에 세지 않는다", () => {
  it("creditTo로 심긴 패가 퀘스트를 깨지 않는다", () => {
    const base = craft({
      hands: { p0: "123456789m1234p", p1: "678p222s333s444z5z", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const state = withAugments(base, "p0", [pickyEater.id]);
    const game = createStandardGameFromState(state, undefined, [pickyEater]);
    installAugment(game.engine, pickyEater, "p0", { yaku: game.yaku });

    // p0가 만수 한 장을 실제로 버린다 → 퀘스트 무늬가 man으로 잠긴다
    const man1 = (game.engine.state.zones[handZone("p0")]?.tileIds ?? []).find(
      (id) => game.engine.state.tiles[id]?.kind.suit === "man",
    ) as TileId;
    expect(
      game.engine.submit({
        player: "p0",
        type: "discard",
        payload: { tileId: man1 } as never,
      }).ok,
    ).toBe(true);
    const before = questProgress(game.engine.state, "p0");
    expect(before.suit).toBe("man");
    expect(before.failed).toBe(false);
    expect(before.count).toBe(1);

    // p1이 누명처럼 통수 한 장을 p0 명의로 심는다 (creditTo)
    const pin = (game.engine.state.zones[handZone("p1")]?.tileIds ?? []).find(
      (id) => game.engine.state.tiles[id]?.kind.suit === "pin",
    ) as TileId;
    game.engine.actions.register({
      type: "test_plant",
      validate: () => null,
      toEvents: () => [
        {
          type: TILE_DISCARDED,
          payload: {
            player: "p1",
            tileId: pin,
            riichi: false,
            riichiCost: 0,
            creditTo: "p0",
          },
        },
      ],
    });
    expect(
      game.engine.submit({ player: "p1", type: "test_plant", payload: {} as never })
        .ok,
    ).toBe(true);
    // 심긴 패는 p0의 후리텐 이력에는 들어간다 (그건 정상)
    expect(game.engine.state.round.byPlayer["p0"]?.discardedKinds).toContain("pin6");

    const after = questProgress(game.engine.state, "p0");
    expect(after.failed).toBe(false);
    expect(after.suit).toBe("man");
    // 진행도도 올려 주지 않는다
    expect(after.count).toBe(1);
  });
});

/** text 확정 14·15 — 재료로 쓰는 '잡패'가 도라·적도라를 태우지 않는다 */
describe("tile_split · bluff_pretense — 도라·적도라는 재료가 되지 않는다", () => {
  /** 손패의 특정 kind 한 장을 적도라로 만든다 */
  function makeRed(state: GameState, who: PlayerId, key: string): GameState {
    const id = (state.zones[handZone(who)]?.tileIds ?? []).find(
      (t) => kindKey(state.tiles[t]?.kind as never) === key,
    ) as TileId;
    return {
      ...state,
      tiles: {
        ...state.tiles,
        [id]: {
          ...(state.tiles[id] as NonNullable<(typeof state.tiles)[TileId]>),
          attrs: { ...(state.tiles[id]?.attrs ?? {}), red: true },
        },
      },
    };
  }

  it("tile_split — 적도라 외톨이 대신 다른 잡패를 태운다", () => {
    const base = craft({
      hands: { p0: "123456789m5p22s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const red = makeRed(base, "p0", "pin5");
    const state = withAugments(red, "p0", [tileSplit.id]);
    const game = createStandardGameFromState(state, undefined, [tileSplit]);
    installAugment(game.engine, tileSplit, "p0", { yaku: game.yaku });

    const man9 = (state.zones[handZone("p0")]?.tileIds ?? []).find(
      (id) => kindKey(state.tiles[id]?.kind as never) === "man9",
    ) as TileId;
    const pin5 = (state.zones[handZone("p0")]?.tileIds ?? []).find(
      (id) => kindKey(state.tiles[id]?.kind as never) === "pin5",
    ) as TileId;

    expect(
      game.engine.submit({
        player: "p0",
        type: "split_tile",
        payload: { tileId: man9, a: 4 } as never,
      }).ok,
    ).toBe(true);

    // 적도라 5통은 그대로 살아 있어야 한다
    const after = game.engine.state;
    expect(kindKey(after.tiles[pin5]?.kind as never)).toBe("pin5");
    expect(after.tiles[pin5]?.attrs.red).toBe(true);
  });

  it("bluff_pretense — 적도라는 희생되지 않는다", () => {
    const base = craft({
      hands: { p0: "123456789m5p1z", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 1,
      lastDiscard: { player: "p1", spec: "1z" },
    });
    const red = makeRed(base, "p0", "pin5");
    const state: GameState = {
      ...withAugments(red, "p0", [bluffPretense.id]),
      round: { ...red.round, phase: "reaction" },
    };
    const game = createStandardGameFromState(state, undefined, [bluffPretense]);
    installAugment(game.engine, bluffPretense, "p0", { yaku: game.yaku });

    const pin5 = (state.zones[handZone("p0")]?.tileIds ?? []).find(
      (id) => kindKey(state.tiles[id]?.kind as never) === "pin5",
    ) as TileId;
    const wind1 = (state.zones[handZone("p0")]?.tileIds ?? []).find(
      (id) => kindKey(state.tiles[id]?.kind as never) === "wind1",
    ) as TileId;

    const res = game.engine.submit({
      player: "p0",
      type: "bluff_pon",
      payload: { tileId: wind1 } as never,
    });
    expect(res.ok).toBe(true);
    const after = game.engine.state;
    expect(kindKey(after.tiles[pin5]?.kind as never)).toBe("pin5");
    expect(after.tiles[pin5]?.attrs.red).toBe(true);
  });
});

/** text 확정 17 — 남이 울어 간 자패도 '내가 버린 자패'로 센다 */
describe("honor_return — 울려 나간 자패도 기억한다", () => {
  it("바닥에서 사라진 자패가 목록에 남는다", () => {
    const base = craft({
      hands: { p0: "123456789m123p1p", p1: "*", p2: "*", p3: "*" },
      discards: { p0: "1z2z5z" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    // 白(dragon1 = 5z) 한 장이 퐁으로 바닥에서 빠진 상황을 흉내낸다
    const pond = [...(base.zones[discardsZone("p0")]?.tileIds ?? [])];
    const called = pond[pond.length - 1] as TileId;
    const state: GameState = withAugments(
      {
        ...base,
        zones: {
          ...base.zones,
          [discardsZone("p0")]: {
            ...(base.zones[discardsZone("p0")] as NonNullable<
              (typeof base.zones)[string]
            >),
            tileIds: pond.filter((id) => id !== called),
          },
        },
      },
      "p0",
      [honorReturn.id],
    );
    const game = createStandardGameFromState(state, undefined, [honorReturn]);
    installAugment(game.engine, honorReturn, "p0", { yaku: game.yaku });

    expect(
      game.engine.submit({
        player: "p0",
        type: "honor_recall",
        payload: {} as never,
      }).ok,
    ).toBe(true);
    const kept = game.engine.state.augmentData["honor_return:keep:p0"] as {
      suit: string;
      rank: number;
    }[];
    expect(kept.map((k) => `${k.suit}${k.rank}`)).toEqual([
      "dragon1",
      "wind2",
      "wind1",
    ]);
  });
});

/** text 확정 16 — 보존한 손의 적도라가 다음 국 배패에 그대로 돌아온다 */
describe("regret — '그대로'에는 적도라도 포함된다", () => {
  it("진짜 적5와 붉은 손길 각인이 다음 국 배패에 살아 있다", () => {
    const base = craft({
      hands: { p0: "123456789m11p45p", p1: "*", p2: "*", p3: "*" },
      phase: "turn.draw",
      turnSeat: 0,
    });
    const handIds = base.zones[handZone("p0")]?.tileIds ?? [];
    const pin5 = handIds.find(
      (i) => kindKey(base.tiles[i]?.kind as never) === "pin5",
    ) as TileId;
    const man5 = handIds.find(
      (i) => kindKey(base.tiles[i]?.kind as never) === "man5",
    ) as TileId;
    const state: GameState = {
      ...withAugments(base, "p0", [regret.id]),
      tiles: {
        ...base.tiles,
        [pin5]: {
          ...(base.tiles[pin5] as NonNullable<(typeof base.tiles)[TileId]>),
          attrs: { ...(base.tiles[pin5]?.attrs ?? {}), red: true },
        },
        [man5]: {
          ...(base.tiles[man5] as NonNullable<(typeof base.tiles)[TileId]>),
          attrs: { ...(base.tiles[man5]?.attrs ?? {}), red: true, redFor: "p0" },
        },
      },
      zones: {
        ...base.zones,
        wall: {
          ...(base.zones["wall"] as NonNullable<(typeof base.zones)[string]>),
          tileIds: [],
        },
      },
    };

    const game = createStandardGameFromState(state);
    installAugment(game.engine, regret, "p0", { yaku: game.yaku });
    expect(
      game.engine.submit({
        player: SYSTEM_PLAYER,
        type: "sys.settleDraw",
        payload: {} as never,
      }).ok,
    ).toBe(true);
    expect(
      game.engine.submit({
        player: SYSTEM_PLAYER,
        type: "sys.startRound",
        payload: {} as never,
      }).ok,
    ).toBe(true);

    const after = game.engine.state;
    const reds = (after.zones[handZone("p0")]?.tileIds ?? []).filter(
      (i) => after.tiles[i]?.attrs.red === true,
    );
    expect(reds).toHaveLength(2);
    // 붉은 손길 각인(소유자)도 따라온다
    expect(
      reds.some((i) => after.tiles[i]?.attrs.redFor === "p0"),
    ).toBe(true);
  });
});

/**
 * 계약 보강 — `rinshan_flag_contract.test.ts`의 소스 스캔은 `lastDrawnTile:`(콜론)만 본다.
 * 왕패의 주인은 `round: { ...state.round, doraIndicators, lastDrawnTile }` 처럼
 * **객체 축약 표기**로 써서 그 그물을 통째로 빠져나갔다(hand-b 확정 1). 축약 표기도 센다.
 */
describe("lastDrawRinshan 계약 — 객체 축약 표기도 놓치지 않는다", () => {
  it("축약으로 쯔모패를 갈아끼우는 증강은 플래그를 함께 다룬다", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const dir = fileURLToPath(new URL("../src/augments/", import.meta.url));
    const intentional = new Set(["north_trader.ts"]);
    const offenders: string[] = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
      if (intentional.has(f)) continue;
      const src = readFileSync(dir + f, "utf8");
      // `{ ..., lastDrawnTile }` / `{ ..., lastDrawnTile }` 축약
      if (!/[{,]\s*lastDrawnTile\s*[,}]/.test(src)) continue;
      if (src.includes("replaceDrawnTile") || src.includes("lastDrawRinshan")) continue;
      offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});
