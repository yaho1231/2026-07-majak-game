/**
 * 등 떠밀기 (push_riichi) — 낙인 대상 강제 리치.
 *  1. 낙인 대상이 멘젠 텐파이로 패를 버리면 그 버림이 강제 리치가 된다.
 *  2. 낙인 발동 후 낙인이 소멸한다.
 *  3. 낙인이 없거나 버린 뒤 노텐이면 강제되지 않는다.
 *  4. 지목은 국당 1회 제한(활성 낙인이 있으면 그동안은 재지목 불가).
 */

import { describe, expect, it } from "vitest";
import { createStandardGameFromState, installAugment } from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { pushRiichi } from "../src/augments/push_riichi.js";

function withAug(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...ids] } : p,
    ),
  };
}

/** p1(seat1)이 9s를 버리면 텐파이(11p 머리 + 23p 대기). p0가 등 떠밀기 보유. */
function scene(opts: { brand?: PlayerId; p1Hand?: string } = {}): GameState {
  const base = craft({
    hands: {
      p0: "*",
      p1: opts.p1Hand ?? "123m456m789m11p23p9s",
      p2: "*",
      p3: "*",
    },
    phase: "turn.act",
    turnSeat: 1,
    drawnLastFor: "p1",
  });
  let s = withAug(base, "p0", ["push_riichi"]);
  if (opts.brand !== undefined) {
    s = { ...s, augmentData: { ...s.augmentData, "push_riichi:brand:p0": opts.brand } };
  }
  return s;
}

function start(state: GameState) {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, pushRiichi, "p0", { yaku: game.yaku });
  return game;
}

/** p1 손패의 마지막 타일(쯔모한 9s) */
function lastTile(game: ReturnType<typeof start>): TileId {
  const hand = game.engine.state.zones["hand:p1"]?.tileIds ?? [];
  return hand[hand.length - 1]!;
}

describe("등 떠밀기 (push_riichi)", () => {
  it("낙인 대상이 텐파이 버림을 하면 강제 리치가 된다", () => {
    const game = start(scene({ brand: "p1" }));
    const r = game.engine.submit({
      player: "p1",
      type: "discard",
      payload: { tileId: lastTile(game) },
    });
    expect(r.ok).toBe(true);
    expect(game.engine.state.round.byPlayer["p1"]?.riichi).not.toBeNull();
    // 낙인 소멸
    expect(game.engine.state.augmentData["push_riichi:brand:p0"]).toBe("");
  });

  it("낙인이 없으면 강제되지 않는다 (대조군)", () => {
    const game = start(scene({}));
    game.engine.submit({ player: "p1", type: "discard", payload: { tileId: lastTile(game) } });
    expect(game.engine.state.round.byPlayer["p1"]?.riichi).toBeNull();
  });

  it("버린 뒤 노텐이면 강제되지 않는다", () => {
    // 흩어진 손 — 무엇을 버려도 텐파이가 아니다
    const game = start(scene({ brand: "p1", p1Hand: "19m19p19s123z44z5z" }));
    game.engine.submit({ player: "p1", type: "discard", payload: { tileId: lastTile(game) } });
    expect(game.engine.state.round.byPlayer["p1"]?.riichi).toBeNull();
    // 낙인은 유지된다 (아직 안 터짐)
    expect(game.engine.state.augmentData["push_riichi:brand:p0"]).toBe("p1");
  });

  it("지목은 국당 1회 — 같은 국에는 못 찍고 다음 국에는 다시 찍는다", () => {
    // p0 턴 상태에서 지목 후보 검증
    const base = craft({ hands: { p0: "*", p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 0 });
    const game = start(withAug(base, "p0", ["push_riichi"]));
    // 첫 지목
    const r1 = game.engine.submit({ player: "p0", type: "push_brand", payload: { target: "p1" } });
    expect(r1.ok).toBe(true);
    // 활성 낙인이 있으면 재지목 거부
    const r2 = game.engine.submit({ player: "p0", type: "push_brand", payload: { target: "p2" } });
    expect(r2.ok).toBe(false);

    // 낙인이 터져 사라져도 **같은 국 안에서는** 다시 못 찍는다
    const spent = {
      ...game.engine.state,
      augmentData: { ...game.engine.state.augmentData, "push_riichi:brand:p0": "" },
    };
    const sameRound = start(spent);
    expect(
      sameRound.engine.submit({ player: "p0", type: "push_brand", payload: { target: "p2" } }).ok,
    ).toBe(false);

    // 국이 바뀌면 사용 표식이 새 키가 되어 다시 찍을 수 있다
    const nextRound = start({
      ...spent,
      round: { ...spent.round, roundNumber: spent.round.roundNumber + 1 },
    });
    expect(
      nextRound.engine.submit({ player: "p0", type: "push_brand", payload: { target: "p2" } }).ok,
    ).toBe(true);
  });
});

describe("등 떠밀기 — 터진 낙인은 화면에서도 내려간다", () => {
  const PUBLIC_KEY = "view:*:push_riichi:p0";

  it("지목하면 전원 공개 채널에 대상이 실린다", () => {
    // p0 턴에서 지목한다
    const base = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = start(withAug(base, "p0", ["push_riichi"]));
    const r = game.engine.submit({
      player: "p0",
      type: "push_brand",
      payload: { target: "p1" },
    });
    expect(r.ok).toBe(true);
    expect(game.engine.state.augmentData[PUBLIC_KEY]).toBe("p1");
  });

  it("낙인이 터지면 공개 채널도 함께 비워진다 (매치 끝까지 잔류 금지)", () => {
    /*
     * 낙인 상태(brandKey)는 발동과 함께 비워지는데 **표시 채널은 그대로 남아**,
     * 이미 사라진 낙인이 매치가 끝날 때까지 이름표에 떠 있었다(docs/25 리치 #8, P4).
     * 상대는 없는 낙인을 피해 계속 다마텐을 포기하게 된다.
     */
    const game = start({
      ...scene({ brand: "p1" }),
      augmentData: {
        ...scene({ brand: "p1" }).augmentData,
        [PUBLIC_KEY]: "p1",
      },
    });
    expect(game.engine.state.augmentData[PUBLIC_KEY]).toBe("p1");

    // p1이 텐파이 버림 → 강제 리치가 걸리며 낙인이 소멸한다
    game.engine.submit({
      player: "p1",
      type: "discard",
      payload: { tileId: lastTile(game) },
    });
    expect(game.engine.state.augmentData["push_riichi:brand:p0"]).toBe("");
    expect(game.engine.state.augmentData[PUBLIC_KEY]).toBe("");
  });
});
