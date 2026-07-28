/**
 * 책임전가 (blame_shift) 동작 테스트.
 *
 * 핵심 계약:
 *  1. 보유자가 론으로 화료하면 지불이 나를 뺀 세 명에게 3분할된다.
 *  2. 보유자가 받는 총액은 그대로다(정산 전체 합 = 0, 홀더 delta 불변).
 *  3. 쯔모 화료·비보유자 화료에는 개입하지 않는다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  ROUND_SETTLED,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type {
  GameEvent,
  GameState,
  PlayerId,
  RoundSettledPayload,
} from "@majak/core";
import { craft } from "./helpers.js";
import { blameShift } from "../src/augments/blame_shift.js";

function withAugments(
  state: GameState,
  player: PlayerId,
  augments: string[],
): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...augments] } : p,
    ),
  };
}

function lastSettled(flow: FlowController): RoundSettledPayload {
  const log = (flow as unknown as { engine: { eventLog: GameEvent[] } }).engine
    .eventLog;
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i]?.type === ROUND_SETTLED) {
      return log[i]!.payload as RoundSettledPayload;
    }
  }
  throw new Error("no RoundSettled event");
}

/** p0가 9s 단기 대기, p1이 9s를 버려 p0가 론할 수 있는 장면. holder=p0. */
function ronScene(holderHasAug: boolean): GameState {
  const base = craft({
    hands: { p0: "123m123p123s678s9s", p1: "*", p2: "*", p3: "*" },
    discards: { p1: "9s" },
    phase: "reaction",
    turnSeat: 1,
    lastDiscard: { player: "p1", spec: "9s" },
  });
  return holderHasAug ? withAugments(base, "p0", ["blame_shift"]) : base;
}

function startFlow(state: GameState) {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, blameShift, "p0", { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  return { game, flow, status };
}

describe("책임전가 (blame_shift)", () => {
  it("보유자의 론 지불이 세 명에게 3분할된다 (총액·홀더 수령 불변)", () => {
    const { flow } = startFlow(ronScene(true));
    const status = flow.submit("p0", { type: "win", payload: {} });
    expect(status.kind).toBe("roundOver");

    const settled = lastSettled(flow);
    expect(settled.outcome).toBe("win");
    expect(settled.winInfos?.[0]?.winner).toBe("p0");

    // 총액 보존
    const total = Object.values(settled.deltas).reduce((a, b) => a + b, 0);
    expect(total).toBe(0);

    // 나를 뺀 세 명이 전부 지불한다 (한 명에게 몰리지 않음)
    const losers: PlayerId[] = ["p1", "p2", "p3"];
    for (const id of losers) {
      expect(settled.deltas[id] ?? 0).toBeLessThan(0);
    }
    // 홀더는 받는다
    expect(settled.deltas["p0"] ?? 0).toBeGreaterThan(0);

    // 홀더 수령액 = 세 명 지불 합의 절대값
    const paid = losers.reduce((a, id) => a + (settled.deltas[id] ?? 0), 0);
    expect(settled.deltas["p0"]).toBe(-paid);
  });

  it("증강이 없으면 쏜 사람 혼자 문다 (대조군)", () => {
    const game = createStandardGameFromState(ronScene(false));
    const flow = new FlowController(game.engine);
    flow.begin();
    flow.submit("p0", { type: "win", payload: {} });
    const settled = lastSettled(flow);
    // p1만 음수, p2·p3는 0
    expect(settled.deltas["p1"] ?? 0).toBeLessThan(0);
    expect(settled.deltas["p2"] ?? 0).toBe(0);
    expect(settled.deltas["p3"] ?? 0).toBe(0);
  });
});
