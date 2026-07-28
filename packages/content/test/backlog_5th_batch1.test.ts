/**
 * 5차 §2b 배치 1 — 코어 규칙을 쓰는 5종의 계약 테스트.
 *  - no_ron_pact  : win.ronImmune 게이트(첫 6순·리치/후로 파기)
 *  - always_tenpai: draw.treatAsTenpai 보유자 전용
 *  - dora_conceal : 비보유자 뷰에서 도라 표시패가 사라진다
 *  - late_double  : 7순 이내 리치가 더블로 승격된다
 *  - call_seal    : 봉인 중 비보유자 후로가 막힌다
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  buildPlayerView,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "./helpers.js";
import { noRonPact } from "../src/augments/no_ron_pact.js";
import { alwaysTenpai } from "../src/augments/always_tenpai.js";
import { doraConceal } from "../src/augments/dora_conceal.js";
import { lateDouble } from "../src/augments/late_double.js";
import { callSeal } from "../src/augments/call_seal.js";

function withAug(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...ids] } : p,
    ),
  };
}

function setTurnCount(state: GameState, n: number): GameState {
  return { ...state, round: { ...state.round, turnCount: n } };
}

describe("불가침 조약 (no_ron_pact)", () => {
  function game(state: GameState) {
    const g = createStandardGameFromState(withAug(state, "p0", ["no_ron_pact"]));
    installAugment(g.engine, noRonPact, "p0", { yaku: g.yaku });
    return g;
  }
  const base = () =>
    craft({ hands: { p0: "*", p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 0 });

  it("첫 6순 동안 보유자는 론 면역이다", () => {
    const g = game(setTurnCount(base(), 3));
    expect(g.engine.rules.resolve<boolean>("win.ronImmune", { playerId: "p0", state: g.engine.state })).toBe(true);
  });

  it("7순부터는 면역이 풀린다", () => {
    const g = game(setTurnCount(base(), 7));
    expect(g.engine.rules.resolve<boolean>("win.ronImmune", { playerId: "p0", state: g.engine.state })).toBe(false);
  });

  it("내가 리치하면 조약이 파기된다", () => {
    const s = setTurnCount(base(), 2);
    const riichi: GameState = {
      ...s,
      round: {
        ...s.round,
        byPlayer: {
          ...s.round.byPlayer,
          p0: { ...s.round.byPlayer["p0"]!, riichi: { double: false, ippatsu: true, discardIndex: 0 } },
        },
      },
    };
    const g = game(riichi);
    expect(g.engine.rules.resolve<boolean>("win.ronImmune", { playerId: "p0", state: g.engine.state })).toBe(false);
  });

  it("타가에게는 면역을 주지 않는다", () => {
    const g = game(setTurnCount(base(), 2));
    expect(g.engine.rules.resolve<boolean>("win.ronImmune", { playerId: "p1", state: g.engine.state })).toBe(false);
  });
});

describe("승승장구 (always_tenpai)", () => {
  it("보유자만 유국 시 항상 텐파이 취급이다", () => {
    const s = withAug(
      craft({ hands: { p0: "*", p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 0 }),
      "p0",
      ["always_tenpai"],
    );
    const g = createStandardGameFromState(s);
    installAugment(g.engine, alwaysTenpai, "p0", { yaku: g.yaku });
    expect(g.engine.rules.resolve<boolean>("draw.treatAsTenpai", { playerId: "p0", state: g.engine.state })).toBe(true);
    expect(g.engine.rules.resolve<boolean>("draw.treatAsTenpai", { playerId: "p1", state: g.engine.state })).toBe(false);
    // 노텐 벌점 총액은 표준 3000 그대로다
    expect(g.engine.rules.resolve<number>("draw.notenPenalty")).toBe(3000);
  });
});

describe("가려진 도라 (dora_conceal)", () => {
  it("비보유자에게는 도라 표시패가 사라지고, 보유자·관전자는 그대로 본다", () => {
    const s = withAug(
      craft({ hands: { p0: "*", p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 0 }),
      "p0",
      ["dora_conceal"],
    );
    const g = createStandardGameFromState(s);
    installAugment(g.engine, doraConceal, "p0", { yaku: g.yaku });

    const holderView = buildPlayerView(g.engine.state, "p0", g.engine.rules);
    const oppView = buildPlayerView(g.engine.state, "p1", g.engine.rules);
    expect(holderView.round.doraIndicators.length).toBeGreaterThan(0);
    expect(oppView.round.doraIndicators.length).toBe(0);
  });
});

describe("뒤늦은 출진 (late_double)", () => {
  /** p0가 9s를 버리면 텐파이(11p 머리 + 23p 대기). 앞서 2번 버려 표준이면 더블 아님. */
  function scene(withAugment: boolean): GameState {
    const s = setTurnCount(
      craft({
        hands: { p0: "123m456m789m11p23p9s", p1: "*", p2: "*", p3: "*" },
        discards: { p0: "5s6s" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      5,
    );
    return withAugment ? withAug(s, "p0", ["late_double"]) : s;
  }
  function riichiTile(g: ReturnType<typeof createStandardGameFromState>) {
    const hand = g.engine.state.zones["hand:p0"]?.tileIds ?? [];
    return hand[hand.length - 1]!; // 마지막 = 쯔모한 9s
  }

  it("5순 리치가 더블리치로 승격된다", () => {
    const g = createStandardGameFromState(scene(true));
    installAugment(g.engine, lateDouble, "p0", { yaku: g.yaku });
    const flow = new FlowController(g.engine);
    flow.begin();
    flow.submit("p0", { type: "riichi", payload: { tileId: riichiTile(g) } });
    expect(g.engine.state.round.byPlayer["p0"]?.riichi?.double).toBe(true);
  });

  it("증강이 없으면 5순 리치는 더블이 아니다 (대조군)", () => {
    const g = createStandardGameFromState(scene(false));
    const flow = new FlowController(g.engine);
    flow.begin();
    flow.submit("p0", { type: "riichi", payload: { tileId: riichiTile(g) } });
    expect(g.engine.state.round.byPlayer["p0"]?.riichi?.double).toBe(false);
  });
});

describe("함구령 (call_seal)", () => {
  /** p1이 2m 두 장 보유, p0가 2m을 버린 reaction 국면. p0가 함구령 보유. */
  function scene(active: boolean): GameState {
    let s = craft({
      hands: { p0: "*", p1: "22m456p789p11s34s", p2: "*", p3: "*" },
      phase: "reaction",
      turnSeat: 0,
      lastDiscard: { player: "p0", spec: "2m" },
    });
    s = withAug(s, "p0", ["call_seal"]);
    s = setTurnCount(s, active ? 2 : 10);
    return {
      ...s,
      augmentData: {
        ...s.augmentData,
        "call_seal:uses:p0": 1,
        "call_seal:turn:p0": 0,
      },
    };
  }
  function game(active: boolean) {
    const g = createStandardGameFromState(scene(active));
    installAugment(g.engine, callSeal, "p0", { yaku: g.yaku });
    return g;
  }

  it("봉인 중 비보유자의 후로가 규칙상 막힌다", () => {
    const g = game(true);
    expect(g.engine.rules.resolve<boolean>("call.blocked", { playerId: "p1", state: g.engine.state })).toBe(true);
    // 보유자 본인은 막히지 않는다
    expect(g.engine.rules.resolve<boolean>("call.blocked", { playerId: "p0", state: g.engine.state })).toBe(false);
  });

  it("봉인이 만료되면(6순 경과) 다시 후로할 수 있다", () => {
    const g = game(false);
    expect(g.engine.rules.resolve<boolean>("call.blocked", { playerId: "p1", state: g.engine.state })).toBe(false);
  });

  it("봉인 중에는 pon 후보가 제시되지 않는다", () => {
    const g = game(true);
    const flow = new FlowController(g.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const p1Prompt = status.prompts.find((p) => p.player === "p1");
    expect(p1Prompt?.options.some((o) => o.type === "pon")).toBe(false);
  });
});
