/**
 * 등 떠밀기 (push_riichi) — 낙인 대상 강제 리치.
 *  1. 낙인 대상이 멘젠 텐파이로 패를 버리면 그 버림이 강제 리치가 된다.
 *  2. 낙인 발동 후 낙인이 소멸한다.
 *  3. 낙인이 없거나 버린 뒤 노텐이면 강제되지 않는다.
 *  4. 지목은 국당 1회 제한(활성 낙인이 있으면 그동안은 재지목 불가).
 *  5. 낙인은 국을 넘지 않는다 — 넘으면 "매 국 1회"가 깨져 같은 국에 두 번 찍힌다.
 */

import { describe, expect, it } from "vitest";
import { ROUND_SCOPED_MARK, createStandardGameFromState, installAugment } from "@majak/core";
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

/** 낙인 키는 **국 단위**다 — 국이 바뀌면 키가 달라져 저절로 풀린다. */
function brandKeyOf(state: GameState, holder: PlayerId = "p0"): string {
  const r = state.round;
  return `push_riichi:brand:${r.prevalentWind}-${r.roundNumber}-${r.honba}:${holder}`;
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
    s = { ...s, augmentData: { ...s.augmentData, [brandKeyOf(s)]: opts.brand } };
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
    expect(game.engine.state.augmentData[brandKeyOf(game.engine.state)]).toBe("");
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
    expect(game.engine.state.augmentData[brandKeyOf(game.engine.state)]).toBe("p1");
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
      augmentData: {
        ...game.engine.state.augmentData,
        [brandKeyOf(game.engine.state)]: "",
      },
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

  it("터지지 않은 낙인은 국을 넘기지 않는다 — 다음 국에 새로 찍을 수 있다", () => {
    /*
     * ⚠ 회귀 (2026-08-12 사용자 보고). 예전 낙인은 게임 단위라 국을 넘어 살아남았는데,
     * "매 국 1회" 표식(usedKey)은 낙인을 **찍은 국**에만 찍힌다. 그래서 E1의 낙인이
     * E2에 터지면 E2에는 표식이 없어 **같은 국에 낙인을 한 번 더** 찍을 수 있었다.
     * 낙인을 국 단위로 내려 그 경로 자체를 없앴다.
     */
    const base = craft({ hands: { p0: "*", p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 0 });
    const game = start(withAug(base, "p0", ["push_riichi"]));
    expect(
      game.engine.submit({ player: "p0", type: "push_brand", payload: { target: "p1" } }).ok,
    ).toBe(true);
    const branded = game.engine.state;
    expect(branded.augmentData[brandKeyOf(branded)]).toBe("p1");

    // 다음 국 — 낙인 키가 통째로 달라져 지난 국의 낙인은 없는 것이 된다
    const nextState = {
      ...branded,
      round: { ...branded.round, roundNumber: branded.round.roundNumber + 1 },
    };
    expect(nextState.augmentData[brandKeyOf(nextState)]).toBeUndefined();

    const next = start(nextState);
    // 지난 국 낙인이 남아 있었다면 "a brand is already active"로 막혔을 자리
    expect(
      next.engine.submit({ player: "p0", type: "push_brand", payload: { target: "p2" } }).ok,
    ).toBe(true);
    // 그리고 새 국에서도 여전히 한 번뿐이다
    expect(
      next.engine.submit({ player: "p0", type: "push_brand", payload: { target: "p3" } }).ok,
    ).toBe(false);
  });
});

describe("등 떠밀기 — 터진 낙인은 화면에서도 내려간다", () => {
  // 국 스코프 표시 채널 — 국 경계에서 엔진이 걷어 간다(ROUND_SCOPED_MARK).
  const PUBLIC_KEY = `view:*:push_riichi:p0${ROUND_SCOPED_MARK}`;

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
    expect(game.engine.state.augmentData[brandKeyOf(game.engine.state)]).toBe("");
    expect(game.engine.state.augmentData[PUBLIC_KEY]).toBe("");
  });
});

describe("등 떠밀기 — 발동 연출은 강제 리치에만", () => {
  /*
   * 클라이언트는 이 채널을 보고 **리치 연출 앞에** "등 떠밀기" 컷인을 끼워 넣는다
   * (2026-08-17 사용자 요청). 낙인은 자발적 리치로도 소진되므로, 채널을 조건 없이
   * 쏘면 낙인 대상이 스스로 건 리치에도 없는 사건이 그려진다.
   */
  const FIRED_KEY = `view:*:push_riichi:fired:p0${ROUND_SCOPED_MARK}`;

  it("강제 리치면 발동 채널에 대상이 실린다", () => {
    const game = start(scene({ brand: "p1" }));
    game.engine.submit({
      player: "p1",
      type: "discard",
      payload: { tileId: lastTile(game) },
    });
    expect(game.engine.state.round.byPlayer["p1"]?.riichi).not.toBeNull();
    expect(game.engine.state.augmentData[FIRED_KEY]).toBe("p1");
  });

  it("낙인 대상이 스스로 리치를 걸면 낙인만 소진되고 발동 채널은 뜨지 않는다", () => {
    const game = start(scene({ brand: "p1" }));
    const r = game.engine.submit({
      player: "p1",
      type: "riichi",
      payload: { tileId: lastTile(game) },
    });
    expect(r.ok).toBe(true);
    expect(game.engine.state.round.byPlayer["p1"]?.riichi).not.toBeNull();
    // 리치 가능 상태에 도달했으므로 낙인은 소진된다
    expect(game.engine.state.augmentData[brandKeyOf(game.engine.state)]).toBe("");
    // 그러나 밀어서 걸린 리치가 아니다 — 연출 채널은 비어 있어야 한다
    expect(game.engine.state.augmentData[FIRED_KEY]).toBeUndefined();
  });
});
