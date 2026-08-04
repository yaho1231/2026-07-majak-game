/**
 * 분열 (tile_split) — 수패 1장을 합이 같은 두 숫자로 쪼갠다.
 *  1. 대상은 a로, 재료 잡패는 b로 바뀐다(a+b = 원래 랭크, 같은 무늬, conjured).
 *  2. 손패 장수는 불변.
 *  3. 자패·랭크 1·잘못된 분할·리치 중은 거부된다.
 */

import { describe, expect, it } from "vitest";
import {
  createStandardGameFromState,
  handIdsOf,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { tileSplit } from "../src/augments/tile_split.js";

/** kindKey = `` (예: pin9) */
const K = {
  p4: kindKey({ suit: "pin", rank: 4 }),
  p5: kindKey({ suit: "pin", rank: 5 }),
  p9: kindKey({ suit: "pin", rank: 9 }),
  e: kindKey({ suit: "wind", rank: 1 }),
};

function withAug(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...ids] } : p,
    ),
  };
}

/** p0 손패: 9p 하나 + 고립된 자패들 + 이어지는 수패 */
function scene(riichi = false): GameState {
  const base = craft({
    hands: { p0: "123m456m789m9p1z5z", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const s = withAug(base, "p0", ["tile_split"]);
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
  installAugment(game.engine, tileSplit, "p0", { yaku: game.yaku });
  return game;
}

/** 손패에서 특정 kindKey를 가진 tileId */
function findTile(game: ReturnType<typeof setup>, key: string): TileId | undefined {
  const st = game.engine.state;
  return handIdsOf(st, "p0").find((id) => kindKey(kindOf(st, id)) === key);
}

function handKeys(game: ReturnType<typeof setup>): string[] {
  const st = game.engine.state;
  return handIdsOf(st, "p0").map((id) => kindKey(kindOf(st, id)));
}

describe("분열 (tile_split)", () => {
  it("9통을 4통+5통으로 쪼갠다 (장수 불변, conjured)", () => {
    const game = setup(scene());
    const target = findTile(game, K.p9);
    expect(target).toBeDefined();
    const before = handKeys(game).length;

    const r = game.engine.submit({
      player: "p0",
      type: "split_tile",
      payload: { tileId: target!, a: 4 },
    });
    expect(r.ok).toBe(true);

    const after = handKeys(game);
    expect(after.length).toBe(before); // 장수 불변
    expect(after).toContain(K.p4);
    expect(after).toContain(K.p5);
    expect(after).not.toContain(K.p9);
    // 두 조각 다 conjured 표식
    const st = game.engine.state;
    for (const key of [K.p4, K.p5]) {
      const id = handIdsOf(st, "p0").find((t) => kindKey(kindOf(st, t)) === key)!;
      expect(st.tiles[id]?.attrs?.conjured).toBe(true);
    }
    // 사용 표식은 **국 단위** — 국이 바뀌면 다시 쓸 수 있다
    const rd = st.round;
    expect(
      st.augmentData[`tile_split:used:${rd.prevalentWind}-${rd.roundNumber}-${rd.honba}:p0`],
    ).toBe(true);
  });

  it("같은 국에 두 번은 못 쓰고, 국이 바뀌면 다시 쓸 수 있다", () => {
    const game = setup(scene());
    const target = findTile(game, K.p9)!;
    expect(
      game.engine.submit({ player: "p0", type: "split_tile", payload: { tileId: target, a: 4 } }).ok,
    ).toBe(true);

    // 같은 국 — 거부
    const again = findTile(game, K.p9) ?? findTile(game, K.p5)!;
    expect(
      game.engine.submit({ player: "p0", type: "split_tile", payload: { tileId: again, a: 2 } }).ok,
    ).toBe(false);

    // 다음 국 — 새 판을 깔면(같은 augmentData 유지) 다시 발동한다
    const st = game.engine.state;
    const next = setup({
      ...scene(),
      augmentData: { ...st.augmentData },
      round: { ...scene().round, roundNumber: 2 },
    });
    const t2 = findTile(next, K.p9)!;
    expect(
      next.engine.submit({ player: "p0", type: "split_tile", payload: { tileId: t2, a: 4 } }).ok,
    ).toBe(true);
  });

  it("합이 맞지 않는 분할은 거부된다", () => {
    const game = setup(scene());
    const target = findTile(game, K.p9)!;
    // a는 1..floor(r/2)만 허용 — 9의 절반을 넘는 5는 거부(4+5는 a=4로 표현)
    expect(
      game.engine.submit({ player: "p0", type: "split_tile", payload: { tileId: target, a: 5 } }).ok,
    ).toBe(false);
    expect(
      game.engine.submit({ player: "p0", type: "split_tile", payload: { tileId: target, a: 0 } }).ok,
    ).toBe(false);
  });

  it("자패는 쪼갤 수 없다", () => {
    const game = setup(scene());
    const honor = findTile(game, K.e)!;
    expect(
      game.engine.submit({ player: "p0", type: "split_tile", payload: { tileId: honor, a: 1 } }).ok,
    ).toBe(false);
  });

  it("리치 중에는 발동할 수 없다", () => {
    const game = setup(scene(true));
    const target = findTile(game, K.p9)!;
    expect(
      game.engine.submit({ player: "p0", type: "split_tile", payload: { tileId: target, a: 4 } }).ok,
    ).toBe(false);
  });

  it("후보는 쪼갤 수 있는 수패마다 a ≤ r/2 만큼 제시된다", () => {
    const game = setup(scene());
    const provider = game.engine.turnOptionProviders[0];
    const opts = provider ? provider(game.engine.state, "p0") : [];
    const target = findTile(game, K.p9)!;
    const forTarget = opts.filter(
      (o) => o.type === "split_tile" && (o.payload as { tileId: number }).tileId === target,
    );
    // 9 → a=1,2,3,4
    expect(forTarget.map((o) => (o.payload as { a: number }).a).sort()).toEqual([1, 2, 3, 4]);
  });
});
