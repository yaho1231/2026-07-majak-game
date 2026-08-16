/**
 * 손바닥 뒤집기 (palm_flip) · 북풍 상인 (north_trader).
 */

import { describe, expect, it } from "vitest";
import {
  DEAD_WALL,
  FlowController,
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
import { cooldownReady } from "../src/util.js";
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
 * 리치 **해제**가 아니라, 리치로 잠긴 손이 한 번 풀려 쯔모기리 대신 원하는 패를 버린다.
 * (첫 개편의 "패산 위 패와 맞바꾸기"는 후보가 사실상 늘 비어 폐기했다.)
 */
describe("손바닥 뒤집기 (palm_flip)", () => {
  const S4 = kindKey({ suit: "sou", rank: 4 });
  const M1 = kindKey({ suit: "man", rank: 1 });

  /**
   * p0: 123m456m789m 11p 46s = 5삭 칸짱 텐파이. 거기에 **7삭을 쯔모**했다.
   * 4삭을 버리면 67s 량면(5·8삭)으로 갈아탄다 — 이 증강이 쓰이는 바로 그 장면이다.
   */
  function scene(riichi: boolean): GameState {
    const base = craft({
      hands: { p0: "123m456m789m11p467s", p1: "*", p2: "*", p3: "*" },
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

  /** p0 턴에 뜨는 flip_riichi 후보 */
  function flipOptions(game: ReturnType<typeof setup>) {
    const st = new FlowController(game.engine).begin();
    if (st.kind !== "awaiting") throw new Error("expected awaiting");
    return (st.prompts.find((p) => p.player === "p0")?.options ?? []).filter(
      (o) => o.type === "flip_riichi",
    );
  }

  it("후보는 '버려도 텐파이가 남는 패'뿐이다 — 여기서는 4삭 하나", () => {
    const game = setup(scene(true));
    const opts = flipOptions(game);
    expect(opts).toHaveLength(1);
    expect((opts[0]!.payload as { tileId: TileId }).tileId).toBe(
      handTile(game.engine.state, S4),
    );
  });

  it("리치를 유지한 채 고른 패를 버린다 (오름패가 갈린다)", () => {
    const game = setup(scene(true));
    const st0 = game.engine.state;
    const potBefore = st0.round.riichiPot;
    const out = handTile(st0, S4);

    const r = game.engine.submit({
      player: "p0",
      type: "flip_riichi",
      payload: { tileId: out },
    });
    expect(r.ok, r.ok ? "" : r.reason).toBe(true);

    const st = game.engine.state;
    // 리치는 그대로 서 있다 (해제가 아니다 — 승부수와의 차이)
    expect(st.round.byPlayer["p0"]?.riichi).not.toBeNull();
    // 공탁도 그대로 (환급 없음)
    expect(st.round.riichiPot).toBe(potBefore);
    // 고른 패가 실제로 바닥으로 갔고, 쯔모패(7삭)는 손에 남았다
    expect(handIdsOf(st, "p0")).not.toContain(out);
    expect(st.zones[discardsZone("p0")]?.tileIds).toContain(out);
    expect(handIdsOf(st, "p0")).toContain(st0.round.lastDrawnTile as TileId);
    expect(handIdsOf(st, "p0")).toHaveLength(13);
    // 대기가 통째로 바뀌었으므로 리치 후리텐은 풀린다
    expect(st.round.byPlayer["p0"]?.riichiFuriten).toBe(false);
  });

  it("텐파이가 깨지는 패는 고를 수 없다", () => {
    const game = setup(scene(true));
    const bad = handTile(game.engine.state, M1);
    const r = game.engine.submit({
      player: "p0",
      type: "flip_riichi",
      payload: { tileId: bad },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not tenpai after discard");
  });

  it("쯔모패는 후보가 아니다 (그건 그냥 쯔모기리다)", () => {
    const game = setup(scene(true));
    const drawn = game.engine.state.round.lastDrawnTile as TileId;
    const r = game.engine.submit({
      player: "p0",
      type: "flip_riichi",
      payload: { tileId: drawn },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("drawn tile must use the normal discard");
  });

  it("리치 중이 아니면 발동할 수 없다", () => {
    const game = setup(scene(false));
    const out = handTile(game.engine.state, S4);
    expect(
      game.engine.submit({ player: "p0", type: "flip_riichi", payload: { tileId: out } }).ok,
    ).toBe(false);
  });

  /*
   * 2026-08-16: 리미트가 매치 횟수(동풍1·반장2) → **2국에 1회** 쿨다운이 됐다.
   * 발동한 국과 바로 다음 국이 잠기고, 그 다음 국에 다시 열린다.
   */
  it("2국에 1회 — 쓴 국은 잠기고, 잔량이 보유자 화면에 실린다", () => {
    const game = setup(scene(true));
    const out = handTile(game.engine.state, S4);
    expect(
      game.engine.submit({ player: "p0", type: "flip_riichi", payload: { tileId: out } }).ok,
    ).toBe(true);

    // 쿨다운 기준점이 찍혔다 — 이 국과 다음 국은 잠긴다
    expect(cooldownReady(game.engine.state, "palm_flip", "p0", 2)).toBe(false);
    // 잔량 표시는 발동하는 그 자리에서 선다 — 다음 국을 기다리지 않는다
    expect(game.engine.state.augmentData["view:p0:cooldown:palm_flip"]).toBe(2);

    // 자기 순이 다시 오더라도 거절 사유는 쿨다운이다
    const def = game.engine.actions.get("flip_riichi");
    if (def === undefined) throw new Error("no flip_riichi action");
    const base = scene(true);
    expect(
      def.validate(
        { player: "p0", type: "flip_riichi", payload: { tileId: out } },
        {
          state: { ...base, augmentData: { "palm_flip:usedSeq:p0": 0 } },
          rules: game.engine.rules,
        },
      ),
    ).toBe("on cooldown");
  });

  it("쿨다운이 2국 지나면 다시 열린다", () => {
    const game = setup(scene(true));
    const s = game.engine.state;
    // 발동 이력만 심어 국 경과를 흉내 낸다 (roundSeq는 ROUND_STARTED가 올린다)
    const withHistory = {
      ...s,
      augmentData: {
        ...s.augmentData,
        "palm_flip:usedSeq:p0": 1,
        "palm_flip:seq:p0": 2, // 1국 지남 — 아직 잠김
      },
    };
    const g1 = createStandardGameFromState(withHistory);
    installAugment(g1.engine, palmFlip, "p0", { yaku: g1.yaku });
    const out = handTile(g1.engine.state, S4);
    expect(
      g1.engine.submit({ player: "p0", type: "flip_riichi", payload: { tileId: out } }).ok,
    ).toBe(false);

    const g2 = createStandardGameFromState({
      ...withHistory,
      augmentData: { ...withHistory.augmentData, "palm_flip:seq:p0": 3 }, // 2국 지남
    });
    installAugment(g2.engine, palmFlip, "p0", { yaku: g2.yaku });
    expect(
      g2.engine.submit({ player: "p0", type: "flip_riichi", payload: { tileId: out } }).ok,
    ).toBe(true);
  });

  it("리치 공탁에는 손대지 않는다 (재리치 무료가 아니다)", () => {
    const game = setup(scene(true));
    const out = handTile(game.engine.state, S4);
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
