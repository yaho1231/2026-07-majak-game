/**
 * 2026-08-25 사용자 보고 묶음.
 *
 *  2. 「국의 첫 순」 증강(통째로 바꾸기·격)이 **내 순이 오기 전에 남이 울면** 발동 창을
 *     잃었다. 창은 «국의 첫 바퀴»가 아니라 **내가 아직 한 장도 버리지 않은 내 순**이다.
 *  4. 카운터의 선리치자 직격 보너스가 +4판 → **+3판**.
 *  5. 판돈 굴리기의 연승은 **상대의 론**에도 끊긴다(상대의 쯔모는 끊지 않는다).
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { fullHandSwap } from "../src/augments/full_hand_swap.js";
import { rankGate } from "../src/augments/rank_gate.js";
import { letItRide } from "../src/augments/let_it_ride.js";

function withAugments(
  state: GameState,
  grants: Partial<Record<PlayerId, string[]>>,
): GameState {
  return {
    ...state,
    players: state.players.map((p) => {
      const extra = grants[p.id];
      return extra === undefined ? p : { ...p, augments: [...p.augments, ...extra] };
    }),
  };
}

function withData(state: GameState, data: Record<string, unknown>): GameState {
  return { ...state, augmentData: { ...state.augmentData, ...data } };
}

/** 국이 이미 몇 바퀴 돈 상태 — 남이 울어 내 순이 뒤로 밀린 국을 흉내 낸다. */
function atTurnCount(state: GameState, turnCount: number): GameState {
  return { ...state, round: { ...state.round, turnCount } };
}

describe("첫 순 증강 — 남의 후로로 내 순이 밀려도 창이 닫히지 않는다 (2026-08-25)", () => {
  /*
   * 예전 조건은 「국의 첫 바퀴」였다.
   *  - 통째로 바꾸기: `round.turnCount > 1` — turnCount는 **친의 쯔모**에만 오르는데,
   *    앞자리가 울어 내 자리가 건너뛰어지면 내가 아직 한 장도 안 버렸는데도 친이 다시
   *    쯔모하는 순간 2가 되어 창이 닫혔다.
   *  - 격: `round.firstTurn` — 이 플래그는 **누구든** 울거나 깡을 하면 그 자리에서
   *    내려간다. 남의 퐁 한 번으로 국당 1회짜리 선언이 통째로 사라졌다.
   * 두 카드 모두 판정을 **내 이력**(내 버림 수·내 후로 수)으로 옮긴다.
   */
  function scene(): GameState {
    return craft({
      hands: { p0: "123m456p789s1122z", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
  }

  it("통째로 바꾸기 — turnCount가 2여도 내가 아직 안 버렸으면 발동한다", () => {
    // craft는 firstTurn:false·discardCount 0 — 남이 이미 울어 바퀴가 돈 국이다
    const st = atTurnCount(withAugments(scene(), { p0: ["full_hand_swap"] }), 2);
    const game = createStandardGameFromState(st);
    installAugment(game.engine, fullHandSwap, "p0", { yaku: game.yaku });

    const r = game.engine.submit({
      player: "p0",
      type: "hand_swap",
      payload: { target: "p1" },
    });
    expect(r.ok).toBe(true);
    expect(game.engine.state.augmentData["full_hand_swap:used:p0"]).toBe(1);
  });

  it("통째로 바꾸기 — 내가 이미 버렸으면(내 첫 순이 지났으면) 발동하지 않는다", () => {
    const st = withAugments(
      craft({
        hands: { p0: "123m456p789s1122z", p1: "*", p2: "*", p3: "*" },
        discards: { p0: "1z", p1: "", p2: "", p3: "" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      { p0: ["full_hand_swap"] },
    );
    const game = createStandardGameFromState(st);
    installAugment(game.engine, fullHandSwap, "p0", { yaku: game.yaku });
    expect(
      game.engine.submit({
        player: "p0",
        type: "hand_swap",
        payload: { target: "p1" },
      }).ok,
    ).toBe(false);
  });

  it("격 — round.firstTurn이 내려간 뒤에도 내 첫 순이면 지목할 수 있다", () => {
    const st = withAugments(scene(), { p0: ["rank_gate"] });
    expect(st.round.firstTurn).toBe(false); // 남이 울어 플래그가 내려간 상태
    const game = createStandardGameFromState(st);
    installAugment(game.engine, rankGate, "p0", { yaku: game.yaku });

    const r = game.engine.submit({
      player: "p0",
      type: "rank_gate_mark",
      payload: { target: "p2" },
    });
    expect(r.ok).toBe(true);
    expect(game.engine.state.augmentData["view:*:rank_gate:p0"]).toMatchObject({
      by: "p0",
      target: "p2",
    });
  });

  it("격 — 내가 이미 울었으면 내 첫 순이 아니다", () => {
    const st = withAugments(
      craft({
        hands: { p0: "123m456p789s11z", p1: "*", p2: "*", p3: "*" },
        melds: { p0: [{ kind: "pon", spec: "222z", from: "p1" }] },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      { p0: ["rank_gate"] },
    );
    const game = createStandardGameFromState(st);
    installAugment(game.engine, rankGate, "p0", { yaku: game.yaku });
    expect(
      game.engine.submit({
        player: "p0",
        type: "rank_gate_mark",
        payload: { target: "p2" },
      }).ok,
    ).toBe(false);
  });
});

describe("판돈 굴리기 — 상대의 론은 연승을 끊고, 상대의 쯔모는 끊지 않는다 (2026-08-25)", () => {
  /** p1이 p2의 버림패를 론할 수 있는 상태 (보유자 p0는 무관한 자리) */
  function opponentRonScene(): GameState {
    return craft({
      hands: {
        p0: "147m147p147s2233z",
        p1: "234m345p345s678s5s",
        p2: "129m258p369s124z5s",
        p3: "258m369p258s4455z",
      },
      phase: "turn.act",
      turnSeat: 2,
      drawnLastFor: "p2",
    });
  }

  function setup(state: GameState, streak: number) {
    const game = createStandardGameFromState(
      withData(withAugments(state, { p0: ["let_it_ride"] }), {
        "let_it_ride:streak:p0": streak,
      }),
    );
    installAugment(game.engine, letItRide, "p0", { yaku: game.yaku });
    return game;
  }

  it("상대끼리의 론(내가 쏘지 않았다)도 연승을 끊는다", () => {
    const game = setup(opponentRonScene(), 2);
    const flow = new FlowController(game.engine);
    let status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const drawn = game.engine.state.round.lastDrawnTile as TileId;
    status = flow.submit("p2", { type: "discard", payload: { tileId: drawn } });
    if (status.kind !== "awaiting") throw new Error("expected reaction");
    for (const prompt of status.prompts) {
      if (prompt.player === "p1") continue;
      if (!prompt.options.some((o) => o.type === "pass")) continue;
      flow.submit(prompt.player, { type: "pass", payload: {} });
    }
    flow.submit("p1", { type: "win", payload: {} });

    // 내가 쏘지도, 화료하지도 않았지만 **남의 론**이 연승을 끊는다
    expect(game.engine.state.augmentData["let_it_ride:streak:p0"]).toBe(0);
  });

  it("상대의 쯔모는 연승을 끊지 않는다", () => {
    const tsumoScene = craft({
      hands: {
        p0: "129m258p369s124z5s",
        p1: "234m34555p345678s",
        p2: "*",
        p3: "*",
      },
      phase: "turn.act",
      turnSeat: 1,
      drawnLastFor: "p1",
    });
    const game = setup(tsumoScene, 2);
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const win = status.prompts
      .find((p) => p.player === "p1")
      ?.options.find((o) => o.type === "win");
    if (win === undefined) throw new Error("no win option");
    flow.submit("p1", win);

    expect(game.engine.state.augmentData["let_it_ride:streak:p0"]).toBe(2);
  });
});
