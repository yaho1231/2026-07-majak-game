/**
 * 48차 도파민 개편 회귀 테스트 — 보상을 "보이지 않는 점수/판"에서
 * "눈에 보이는 규칙 파괴"로 바꾼 증강들.
 *
 * avenger(복수자) — 원수 한정 후리텐·무역 무시 론
 * counter(카운터) — 추격 리치 공탁 대납 + 선리치자 일발 소멸
 * near_dora(곁불) — 도라 양옆이 진짜 도라(전원 공개 채널)
 *
 * 설계 근거: docs/16_AUGMENT_REDESIGN.md §1
 */

import { describe, expect, it } from "vitest";
import {
  buildPlayerView,
  createStandardGameFromState,
  handZone,
  installAugment,
  kindKey,
} from "@majak/core";
import type { GameState, PlayerId, TileId, TileKind } from "@majak/core";
import { craft } from "./helpers.js";
import { avenger } from "../src/augments/avenger.js";
import { counter } from "../src/augments/counter.js";

type Game = ReturnType<typeof createStandardGameFromState>;

function withAugments(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...ids] } : p,
    ),
  };
}

function withData(state: GameState, data: Record<string, unknown>): GameState {
  return { ...state, augmentData: { ...state.augmentData, ...data } };
}

function winValidate(game: Game, player: PlayerId): string | null {
  const def = game.engine.actions.get("win");
  if (def === undefined) throw new Error("no win action");
  return def.validate(
    { player, type: "win", payload: {} },
    { state: game.engine.state, rules: game.engine.rules },
  );
}

// ─────────────────────────── avenger (복수자) ───────────────────────────

describe("avenger (복수자) — 원수 한정 규칙 해제", () => {
  /** p0가 5s 단기 탕야오 텐파이인데 5s를 이미 버려 후리텐. p1이 5s를 버린 상황. */
  function furitenRon(from: PlayerId): GameState {
    return craft({
      hands: { p0: "234m345p345s678s5s", p1: "*", p2: "*", p3: "*" },
      discards: { p0: "5s" }, // 대기패를 이미 버림 → 후리텐
      phase: "reaction",
      turnSeat: 1,
      lastDiscard: { player: from, spec: "5s" },
    });
  }

  it("원수가 버린 패면 후리텐이어도 론할 수 있다", () => {
    const state = withData(withAugments(furitenRon("p1"), "p0", ["avenger"]), {
      "avenger:nemesis:p0": "p1",
    });
    const game = createStandardGameFromState(state);
    expect(winValidate(game, "p0")).toBe("furiten");
    installAugment(game.engine, avenger, "p0");
    expect(winValidate(game, "p0")).toBeNull();
  });

  it("원수가 아닌 사람이 버린 패에는 후리텐이 그대로 걸린다", () => {
    // 원수는 p2인데 실제로 버린 사람은 p1 → 해제되지 않아야 한다
    const state = withData(withAugments(furitenRon("p1"), "p0", ["avenger"]), {
      "avenger:nemesis:p0": "p2",
    });
    const game = createStandardGameFromState(state);
    installAugment(game.engine, avenger, "p0");
    expect(winValidate(game, "p0")).toBe("furiten");
  });

  it("원수가 없으면 아무 규칙도 바뀌지 않는다", () => {
    const state = withAugments(furitenRon("p1"), "p0", ["avenger"]);
    const game = createStandardGameFromState(state);
    installAugment(game.engine, avenger, "p0");
    expect(winValidate(game, "p0")).toBe("furiten");
    // 다른 플레이어의 규칙도 건드리지 않는다
    expect(
      game.engine.rules.resolve<boolean>("win.furiten.enabled", {
        playerId: "p1",
        state: game.engine.state,
      }),
    ).toBe(true);
  });

  it("원수가 버린 패면 역이 없어도 론할 수 있다", () => {
    // 111m 456p 789s 234s + 99p, 6p 론 → 멘젠이지만 무역
    const base = craft({
      hands: { p0: "111m45p789s234s99p", p1: "*", p2: "*", p3: "*" },
      phase: "reaction",
      turnSeat: 1,
      lastDiscard: { player: "p1", spec: "6p" },
    });
    const state = withData(withAugments(base, "p0", ["avenger"]), {
      "avenger:nemesis:p0": "p1",
    });
    const game = createStandardGameFromState(state);
    expect(winValidate(game, "p0")).toBe("no yaku");
    installAugment(game.engine, avenger, "p0");
    expect(winValidate(game, "p0")).toBeNull();
  });
});

// ─────────────────────────── counter (카운터) ───────────────────────────

describe("counter (카운터) — 추격 리치 반격", () => {
  /** p0가 5s를 버리면 텐파이가 유지되는 손 (234m345p345s678s + 5s5s) */
  function craftBase(): GameState {
    return craft({
      hands: { p0: "234m345p345s678s55s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
  }

  /** 상대를 일발이 살아있는 리치 상태로 만든다 */
  function withRiichi(state: GameState, player: PlayerId): GameState {
    const rs = state.round.byPlayer[player];
    if (rs === undefined) throw new Error(`no round state for ${player}`);
    return {
      ...state,
      round: {
        ...state.round,
        riichiPot: state.round.riichiPot + 1000,
        byPlayer: {
          ...state.round.byPlayer,
          [player]: {
            ...rs,
            riichi: { double: false, ippatsu: true, discardIndex: 0 },
          },
        },
      },
    };
  }

  function declareRiichi(game: Game): void {
    const tileId = (game.engine.state.zones[handZone("p0")]?.tileIds ?? []).find(
      (id) => kindKey(game.engine.state.tiles[id]?.kind as TileKind) === "sou5",
    );
    expect(tileId).toBeDefined();
    const result = game.engine.submit({
      player: "p0",
      type: "riichi",
      payload: { tileId: tileId as TileId },
    });
    expect(result.ok).toBe(true);
  }

  it("추격 리치 시 선리치자가 내 공탁을 대납하고, 그의 일발이 사라진다", () => {
    // p1이 먼저 리치를 걸어둔 상태 (counter:prev 기록은 그 리치를 본 결과)
    const state = withData(
      withRiichi(withAugments(craftBase(), "p0", ["counter"]), "p1"),
      { "counter:prev:p0": "p1" },
    );
    const game = createStandardGameFromState(state);
    installAugment(game.engine, counter, "p0");
    const scores = (): number[] => game.engine.state.players.map((p) => p.score);
    const before = scores();
    expect(game.engine.state.round.byPlayer["p1"]?.riichi?.ippatsu).toBe(true);

    declareRiichi(game);

    const after = scores();
    // p0: 공탁 -1000 + 대납 +1000 = 순변화 0 / p1: -1000
    expect((after[0] as number) - (before[0] as number)).toBe(0);
    expect((after[1] as number) - (before[1] as number)).toBe(-1000);
    // 내 리치봉은 실제로 공탁에 들어갔다 (p1 1000 + 내 1000)
    expect(game.engine.state.round.riichiPot).toBe(2000);
    // 선리치자의 일발 소멸
    expect(game.engine.state.round.byPlayer["p1"]?.riichi?.ippatsu).toBe(false);
    // 국당 1회 플래그와 공개 채널
    expect(game.engine.state.augmentData["counter:struck:p0"]).toBe(true);
    expect(game.engine.state.augmentData["view:*:counter:p0"]).toBe("p1");
  });

  it("선리치한 상대가 없으면 발동하지 않는다 (내가 먼저 건 국)", () => {
    const game = createStandardGameFromState(
      withAugments(craftBase(), "p0", ["counter"]),
    );
    installAugment(game.engine, counter, "p0");
    const before = game.engine.state.players.map((p) => p.score);

    declareRiichi(game);

    // p0만 공탁 1000을 냈고, 나머지는 아무도 대납하지 않는다
    expect(game.engine.state.players[0]?.score).toBe((before[0] as number) - 1000);
    expect(game.engine.state.players[1]?.score).toBe(before[1]);
    expect(game.engine.state.augmentData["counter:struck:p0"]).toBeUndefined();
  });

  it("반격한 국을 내가 먼저 화료하면 선리치자의 손 가치를 뱅크에서 더 받는다", () => {
    // p0: 5s 단기 텐파이(쯔모 화료 가능) / p1: 리치를 건 텐파이 손
    function craftSettle(withCounter: boolean): GameState {
      let s = craft({
        hands: {
          p0: "234m345p345s678s5s5s", // 쯔모패 5s로 화료 (멘젠쯔모)
          p1: "234m567m234p567p9s", // 리치 텐파이 (9s 단기)
          p2: "*",
          p3: "*",
        },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      });
      s = withRiichi(s, "p1");
      if (withCounter) {
        s = withData(withAugments(s, "p0", ["counter"]), {
          "counter:prev:p0": "p1",
          "counter:struck:p0": true,
        });
      }
      return s;
    }

    function p0Delta(withCounter: boolean): number {
      const game = createStandardGameFromState(craftSettle(withCounter));
      if (withCounter) installAugment(game.engine, counter, "p0", { yaku: game.yaku });
      const before = game.engine.state.players[0]?.score ?? 0;
      const drawn = game.engine.state.round.lastDrawnTile as TileId;
      const r = game.engine.submit({
        player: "__system",
        type: "sys.settleWin",
        payload: { wins: [{ winner: "p0", from: null, tileId: drawn, winType: "tsumo" }] },
      });
      expect(r.ok).toBe(true);
      return (game.engine.state.players[0]?.score ?? 0) - before;
    }

    const plain = p0Delta(false);
    const withSteal = p0Delta(true);
    // 선리치자(p1)의 손이 올랐다면 받았을 점수만큼 더 들어온다
    expect(withSteal).toBeGreaterThan(plain);
  });
});

