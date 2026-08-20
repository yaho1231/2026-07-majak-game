/**
 * 스파이 (spy) 동작 테스트.
 *
 * 핵심 계약:
 *  1. 자기 턴에 손패 종류를 지정할 수 있고, 지정은 게임당 1회다.
 *  2. 지정 내용은 홀더 전용 채널로만 나간다(비밀).
 *  3. 찍힌 종류로 상대가 화료하면 그 화료의 이득이 통째로 홀더에게 온다
 *     (화료 자체는 성립하고, 지불자들이 내는 액수는 그대로 — 총액 불변).
 *  4. 찍지 않은 종류로 화료하면 아무 일도 없다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  ROUND_SETTLED,
  createStandardGameFromState,
  installAugment,
  kindKey,
} from "@majak/core";
import type {
  GameEvent,
  GameState,
  PlayerId,
  RoundSettledPayload,
} from "@majak/core";
import { craft } from "./helpers.js";
import { roundKey } from "../src/util.js";
import { spy } from "../src/augments/spy.js";

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
  const log = (flow as unknown as { engine: { eventLog: GameEvent[] } }).engine.eventLog;
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i]?.type === ROUND_SETTLED) return log[i]!.payload as RoundSettledPayload;
  }
  throw new Error("no RoundSettled event");
}

/**
 * p1이 3만 단기 대기(리치 없이 멘젠 쯔모로 화료 가능한 손), p0은 스파이 보유.
 * p1 차례에 3만을 쯔모해 화료한다.
 */
function scene(mark: string | null): GameState {
  const base = craft({
    hands: {
      p0: "*",
      p1: "123m456m789m123p3m3m",
      p2: "*",
      p3: "*",
    },
    phase: "turn.act",
    turnSeat: 1,
    drawnLastFor: "p1",
  });
  const withAug = withAugments(base, "p0", ["spy"]);
  if (mark === null) return withAug;
  return {
    ...withAug,
    augmentData: { ...withAug.augmentData, "spy:mark:p0": mark },
  };
}

function startFlow(state: GameState) {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, spy, "p0", { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  return { game, flow, status };
}

const MAN3 = kindKey({ suit: "man", rank: 3 });

describe("스파이 (spy)", () => {
  it("자기 턴에 손패 종류를 지정할 수 있다 (종류당 1개만 제시)", () => {
    const base = craft({
      hands: { p0: "112233m456p789s1z", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const { status } = startFlow(withAugments(base, "p0", ["spy"]));
    const prompt = status.prompts.find((p) => p.player === "p0");
    const marks = prompt?.options.filter((o) => o.type === "spy_mark") ?? [];
    expect(marks.length).toBeGreaterThan(0);
    // 1m이 두 장이어도 후보는 종류당 하나뿐이다
    expect(marks.length).toBe(new Set(marks.map((o) => o.type + JSON.stringify(o.payload))).size);
    expect(marks.length).toBeLessThanOrEqual(14);
  });

  it("이번 국에 이미 찍었으면 다시 제시되지 않는다 (국당 1회 — 2026-07-31 버프)", () => {
    const base = craft({
      hands: { p0: "112233m456p789s1z", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const marked: GameState = {
      ...withAugments(base, "p0", ["spy"]),
      augmentData: {
        "spy:mark:p0": MAN3,
        [`spy:marked:${roundKey(base)}:p0#round`]: true,
      },
    };
    const { status } = startFlow(marked);
    const prompt = status.prompts.find((p) => p.player === "p0");
    expect(prompt?.options.filter((o) => o.type === "spy_mark")).toHaveLength(0);
  });

  it("국이 바뀌면 다시 찍을 수 있다 (지정은 새로 찍기 전까지 유효)", () => {
    const base = craft({
      hands: { p0: "112233m456p789s1z", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    // 지난 국에 찍어 둔 상태 — 이번 국(roundKey가 다르다)에는 다시 후보가 뜬다
    const marked: GameState = {
      ...withAugments(base, "p0", ["spy"]),
      augmentData: { "spy:mark:p0": MAN3, "spy:marked:1-0-0:p0#round": true },
    };
    const { status } = startFlow(marked);
    const prompt = status.prompts.find((p) => p.player === "p0");
    expect((prompt?.options.filter((o) => o.type === "spy_mark") ?? []).length)
      .toBeGreaterThan(0);
  });

  it("찍힌 패로 상대가 화료하면 그 이득이 통째로 홀더에게 온다", () => {
    const { flow } = startFlow(scene(MAN3));
    const status = flow.submit("p1", { type: "win", payload: {} });
    expect(status.kind).toBe("roundOver");

    const settled = lastSettled(flow);
    // 화료 자체는 성립한다
    expect(settled.outcome).toBe("win");
    expect(settled.winInfos?.[0]?.winner).toBe("p1");
    // 그러나 이득은 화료자가 아니라 홀더에게
    expect(settled.deltas["p1"] ?? 0).toBe(0);
    expect(settled.deltas["p0"] ?? 0).toBeGreaterThan(0);
    // 지불자들은 그대로 낸다 (총액 불변)
    const total = Object.values(settled.deltas).reduce((a, b) => a + b, 0);
    expect(total).toBe(0);
  });

  it("찍지 않은 종류로 화료하면 아무 일도 없다", () => {
    // 9통을 찍어 뒀지만 p1은 3만으로 화료한다
    const { flow } = startFlow(scene(kindKey({ suit: "pin", rank: 9 })));
    flow.submit("p1", { type: "win", payload: {} });

    const settled = lastSettled(flow);
    expect(settled.deltas["p1"] ?? 0).toBeGreaterThan(0);
    expect(settled.deltas["p0"] ?? 0).toBeLessThan(0); // 평범하게 쯔모 지불만 한다
  });

  it("지정을 하지 않았으면 정산에 개입하지 않는다", () => {
    const { flow } = startFlow(scene(null));
    flow.submit("p1", { type: "win", payload: {} });

    const settled = lastSettled(flow);
    expect(settled.deltas["p1"] ?? 0).toBeGreaterThan(0);
  });

  it("더블 론으로 두 명이 동시에 찍힌 패로 화료하면 둘 다에게서 훔친다 (.find 편향 회귀)", () => {
    // p0=holder(spy, 3만 지정). p1·p2 둘 다 3만으로 론했다고 가정한 합성 정산 이벤트를
    // 직접 밀어 넣어 settleInterceptor(Transfer)가 winInfos 전원을 훑는지 검증한다.
    const base = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
    });
    const state: GameState = {
      ...withAugments(base, "p0", ["spy"]),
      augmentData: { "spy:mark:p0": MAN3 },
    };
    const game = createStandardGameFromState(state);
    installAugment(game.engine, spy, "p0", { yaku: game.yaku });

    const winTileEntry = Object.entries(game.engine.state.tiles).find(
      ([, t]) => kindKey(t.kind) === MAN3,
    );
    if (winTileEntry === undefined) throw new Error("no 3m tile in deck");
    const winTile = Number(winTileEntry[0]);
    const payload: RoundSettledPayload = {
      outcome: "win",
      winInfos: [
        { winner: "p1", winType: "ron", from: "p3", points: 2000, winningTileId: winTile },
        { winner: "p2", winType: "ron", from: "p3", points: 3000, winningTileId: winTile },
      ],
      deltas: { p0: 0, p1: 2000, p2: 3000, p3: -5000 },
    } as unknown as RoundSettledPayload;

    // 실제 게임 진행 없이 정산 인터셉터 파이프라인만 태우는 합성 액션
    game.engine.actions.register({
      type: "__test_settle__",
      validate: () => null,
      toEvents: () => [{ type: ROUND_SETTLED, payload }],
    });
    const r = game.engine.submit({ player: "p0", type: "__test_settle__", payload: {} });
    expect(r.ok).toBe(true);

    const final = (r as { events: GameEvent[] }).events.find(
      (e) => e.type === ROUND_SETTLED,
    )?.payload as RoundSettledPayload;
    // 둘 다 3만으로 화료했으므로 두 승자 몫이 전부 홀더에게 온다
    expect(final.deltas["p1"] ?? 0).toBe(0);
    expect(final.deltas["p2"] ?? 0).toBe(0);
    expect(final.deltas["p0"] ?? 0).toBe(5000);
  });
});
