/**
 * **잔량이 0이 된 «그 국»에는 아직 죽지 않았다** (`UsesLeftView.spentRound`).
 *
 * 사용자 보고(2026-09-03): 클라이언트는 `left === 0`이면 증강 pill을 흐리게 칠한다.
 * 그런데 **이번 국에** 마지막 한 번을 쓴 증강은 그 국이 끝날 때까지 효과가 살아 있는
 * 경우가 많다 — 다 쓰자마자 회색이 되니 "아직 걸려 있는데 죽은 것처럼 보인다"였다.
 *
 * 그래서 `publishUsesLeft`가 «0이 된 국»의 `roundKey`를 함께 싣는다. 지키는 선:
 *  1. 0이 되는 순간 그 국의 키가 적힌다.
 *  2. 다음 국이 되어도 **적힌 값은 그대로다** — 매 이벤트마다 지금 국으로 덮으면
 *     그 pill은 영원히 살아 있는 것으로 보인다(클라가 «지난 국»을 구별할 수 없다).
 *  3. 다시 충전되면 필드가 사라진다.
 *  4. 값이 같으면 아무것도 내지 않는 no-op 성질이 그대로다 (이벤트 폭주 방지).
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  augmentDataSet,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type { AugmentDef, GameState, PlayerId } from "@majak/core";
import { craft } from "./helpers.js";
import { publishUsesLeft, roundKey, usesViewKey } from "../src/util.js";

/** 잔량을 테스트가 직접 굴리는 시험용 증강 */
const probe: AugmentDef = {
  id: "spent_round_probe",
  tier: "silver",
  category: "etc",
  name: "잔량 시험",
  description: "테스트 전용",
  install(ctx) {
    publishUsesLeft(ctx, () => ({ left: leftNow, total: 2 }));
  },
};

/** 시험용 잔량 — 증강 하나를 만들지 않고 여기서 직접 굴린다 */
let leftNow = 2;

/**
 * 반응(reaction)을 한 번 돌린다. 엔진은 `submit`으로만 이벤트를 흘리므로,
 * 판을 전혀 바꾸지 않는 시험용 액션을 하나 등록해 그걸 태운다
 * (`full_hand_swap_faster.test.ts`와 같은 방식).
 */
let tickN = 0;
function tick(game: { engine: any }): void {
  if (!game.engine.actions.has("test_tick")) {
    game.engine.actions.register({
      type: "test_tick",
      validate: () => null,
      toEvents: () => [augmentDataSet("test:tick", ++tickN)],
    });
  }
  const r = game.engine.submit({ player: "p0", type: "test_tick", payload: {} });
  expect(r.ok, r.ok ? "" : r.reason).toBe(true);
}

const KEY = usesViewKey("p0" as PlayerId, "spent_round_probe");

function scene(extraData: Record<string, unknown> = {}, honba = 0): GameState {
  const base = craft({
    hands: { p0: "123m456p789s11z2z", p1: "*", p2: "*", p3: "*" },
    phase: "turn.draw",
    turnSeat: 0,
  });
  return {
    ...base,
    round: { ...base.round, honba },
    augmentData: { ...base.augmentData, ...extraData },
    players: base.players.map((p) =>
      p.id === ("p0" as PlayerId) ? { ...p, augments: ["spent_round_probe"] } : p,
    ),
  };
}

function start(state: GameState) {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, probe, "p0", { yaku: game.yaku });
  new FlowController(game.engine).begin();
  return game;
}

describe("잔량 0 — 그 국의 키를 함께 싣는다", () => {
  it("0이 되는 순간 그 국의 roundKey가 적히고, 남아 있을 때는 없다", () => {
    leftNow = 2;
    const game = start(scene());
    expect(game.engine.state.augmentData[KEY]).toEqual({
      left: 2,
      total: 2,
      scope: "match",
    });

    const here = roundKey(game.engine.state);
    leftNow = 0;
    tick(game);
    expect(game.engine.state.augmentData[KEY]).toEqual({
      left: 0,
      total: 2,
      scope: "match",
      spentRound: here,
    });
  });

  it("국이 넘어가도 **적힌 국은 그대로다** (지금 국으로 덮지 않는다)", () => {
    // 지난 국(본장 0)에 소진했고, 지금은 본장 1 — roundKey가 다르다.
    leftNow = 2;
    const past = roundKey(scene());
    leftNow = 0;
    const game = start(
      scene({ [KEY]: { left: 0, total: 2, scope: "match", spentRound: past } }, 1),
    );
    expect(roundKey(game.engine.state)).not.toBe(past);
    tick(game);
    expect(game.engine.state.augmentData[KEY]).toEqual({
      left: 0,
      total: 2,
      scope: "match",
      spentRound: past,
    });
  });

  it("다시 충전되면 기록이 사라진다", () => {
    leftNow = 0;
    const game = start(scene());
    expect(game.engine.state.augmentData[KEY]).toHaveProperty("spentRound");

    leftNow = 1;
    tick(game);
    expect(game.engine.state.augmentData[KEY]).toEqual({
      left: 1,
      total: 2,
      scope: "match",
    });
    expect(game.engine.state.augmentData[KEY]).not.toHaveProperty("spentRound");
  });

  it("값이 그대로면 아무것도 내지 않는다 (no-op 유지)", () => {
    leftNow = 0;
    const game = start(scene());
    const before = game.engine.eventLog.length;
    tick(game);
    // test:tick 하나만 늘어야 한다 — 잔량 채널이 다시 발행되면 그보다 많아진다
    expect(game.engine.eventLog.length).toBe(before + 1);
    expect((game.engine.state.augmentData[KEY] as { left: number }).left).toBe(0);
  });
});
