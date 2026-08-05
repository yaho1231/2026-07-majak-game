/**
 * 봉인 자물쇠 표시는 **버림 액션의 최종 판정과 같아야 한다** (docs/25 방해 #7).
 *
 * `PlayerView`는 `sealedDiscardIds`를 그대로 실었는데, 버림 액션은 그 위에 두 가지
 * 예외를 더 얹는다:
 *  1. **리치 중에는 봉인을 보지 않는다** — 리치는 쯔모패만 버릴 수 있어, 봉인까지 걸면
 *     버릴 패가 없어질 수 있기 때문이다.
 *  2. **손패가 전부 봉인이면 허용한다** — 소프트락 방지.
 * 그래서 화면에는 자물쇠가 걸렸는데 실제로는 버려지는(또는 그 반대의) 거짓 UI가 났다.
 */

import { describe, expect, it } from "vitest";
import {
  RuleLayer,
  buildPlayerView,
  createStandardGameFromState,
  handIdsOf,
} from "@majak/core";
import type { GameState, TileId } from "@majak/core";
import { craft } from "./helpers.js";

const RIICHI = { double: false, ippatsu: false, discardIndex: 0 };

function scene(riichi: boolean): GameState {
  const base = craft({
    hands: { p0: "123m456m789m123p11s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  if (!riichi) return base;
  return {
    ...base,
    round: {
      ...base.round,
      byPlayer: {
        ...base.round.byPlayer,
        p0: { ...base.round.byPlayer["p0"]!, riichi: RIICHI },
      },
    },
  };
}

/** 주어진 tileId들을 봉인한 뒤 p0 본인 뷰의 자물쇠 목록을 돌려준다 */
function lockedInView(state: GameState, seal: (ids: TileId[]) => TileId[]): TileId[] {
  const game = createStandardGameFromState(state);
  const sealed = seal([...handIdsOf(game.engine.state, "p0")]);
  game.engine.rules.addModifier<TileId[]>("discard.blockedTileIds", {
    source: "test:seal",
    layer: RuleLayer.Prism,
    apply: (cur, rctx) => (rctx.playerId === "p0" ? [...cur, ...sealed] : cur),
  });
  const view = buildPlayerView(game.engine.state, "p0", game.engine.rules);
  return [...(view.round.byPlayer["p0"]?.sealedTileIds ?? [])];
}

/** 그 패를 실제로 버릴 수 있는가 (액션 validate의 판정) */
function canDiscard(
  state: GameState,
  seal: (ids: TileId[]) => TileId[],
  pick: (ids: TileId[]) => TileId,
): boolean {
  const game = createStandardGameFromState(state);
  const hand = [...handIdsOf(game.engine.state, "p0")];
  const sealed = seal(hand);
  game.engine.rules.addModifier<TileId[]>("discard.blockedTileIds", {
    source: "test:seal",
    layer: RuleLayer.Prism,
    apply: (cur, rctx) => (rctx.playerId === "p0" ? [...cur, ...sealed] : cur),
  });
  const def = game.engine.actions.get("discard");
  if (def === undefined) throw new Error("no discard action");
  return (
    def.validate(
      { player: "p0", type: "discard", payload: { tileId: pick(hand) } },
      { state: game.engine.state, rules: game.engine.rules },
    ) === null
  );
}

describe("봉인 자물쇠 표시 = 버림 판정", () => {
  it("평시 부분 봉인은 그대로 자물쇠로 보인다 (기준선)", () => {
    const firstTwo = (ids: TileId[]): TileId[] => ids.slice(0, 2);
    expect(lockedInView(scene(false), firstTwo)).toHaveLength(2);
    expect(canDiscard(scene(false), firstTwo, (ids) => ids[0] as TileId)).toBe(false);
  });

  it("리치 중에는 자물쇠가 걸리지 않는다 — 버림 판정이 봉인을 보지 않는다", () => {
    const firstTwo = (ids: TileId[]): TileId[] => ids.slice(0, 2);
    // 리치 중 버림 판정은 "쯔모패인가"만 본다 — 봉인은 무시된다
    expect(lockedInView(scene(true), firstTwo)).toEqual([]);
  });

  it("손패가 전부 봉인이면 자물쇠를 걸지 않는다 — 소프트락 방지로 전부 버릴 수 있다", () => {
    const all = (ids: TileId[]): TileId[] => [...ids];
    expect(canDiscard(scene(false), all, (ids) => ids[0] as TileId)).toBe(true);
    expect(lockedInView(scene(false), all)).toEqual([]);
  });
});
