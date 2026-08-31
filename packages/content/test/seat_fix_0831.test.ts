/**
 * 2026-08-31 QA synergy4 회귀 — 「좌석·오야·자원」 묶음 (docs/49 §7).
 *
 * 각 describe는 결함 하나에 대응한다.
 *  - B-3  자리 바꿈이 묵계(silent)의 「멘젠 유지」를 비보유자에게 넘긴다
 *  - B-12 오야 강탈 후 자리를 바꾸면 빼앗은 오야가 상대에게 간다
 *  - B-9  무덤 도굴이 격(win.minHan) 미달인 손을 화료 후보로 낸다
 *  - C-1  재장전이 만년 오야의 `keeps:` 카운터를 복구하지 못한다
 */

import {
  FlowController,
  createStandardGameFromState,
  installAugment,
  openMeldCountOf,
} from "@majak/core";
import type { AugmentDef, GameState, PlayerId } from "@majak/core";
import { describe, expect, it } from "vitest";
import { seatSwap } from "../src/augments/seat_swap.js";
import { silentPact } from "../src/augments/silent_pact.js";
import { pseudoDealer } from "../src/augments/pseudo_dealer.js";
import { graveRob } from "../src/augments/grave_rob.js";
import { rankGate } from "../src/augments/rank_gate.js";
import { reload } from "../src/augments/reload.js";
import { eternalDealer } from "../src/augments/eternal_dealer.js";
import { roundScopedKey } from "../src/augments/roundScope.js";
import { craft } from "./helpers.js";

/** 좌석별 증강 부여 + 전부 install */
function setup(
  state: GameState,
  who: Record<string, string[]>,
  defs: AugmentDef[],
): ReturnType<typeof createStandardGameFromState> {
  const withAug: GameState = {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      augments: [...p.augments, ...(who[p.id] ?? [])],
    })),
  };
  const game = createStandardGameFromState(withAug, undefined, defs);
  for (const [pid, ids] of Object.entries(who)) {
    for (const id of ids) {
      const def = defs.find((d) => d.id === id);
      if (def === undefined) throw new Error(`no def for ${id}`);
      installAugment(game.engine, def, pid as PlayerId, { yaku: game.yaku });
    }
  }
  return game;
}

function meldsOf(state: GameState, p: PlayerId) {
  return state.round.byPlayer[p]?.melds ?? [];
}

/** p의 첫 후로에 묵계 표식을 단다 (silent_pon으로 부른 상태를 흉내) */
function markSilent(s: GameState, p: PlayerId): GameState {
  const rs = s.round.byPlayer[p];
  if (rs === undefined) throw new Error(`no round state for ${p}`);
  return {
    ...s,
    round: {
      ...s.round,
      byPlayer: {
        ...s.round.byPlayer,
        [p]: {
          ...rs,
          melds: rs.melds.map((m, i) => (i === 0 ? { ...m, silent: true } : m)),
        },
      },
    },
  };
}

function silentScene(): GameState {
  const base = craft({
    hands: { p0: "123m456m789m99p", p1: "234p567p88s22s", p2: "*", p3: "*" },
    melds: {
      p0: [{ kind: "pon", spec: "111z", from: "p2" }],
      p1: [{ kind: "pon", spec: "555z", from: "p2" }],
    },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return markSilent(base, "p1");
}

/** B-3 */
describe("seat_swap × silent_pact — 묵계의 «멘젠 유지»는 몸통을 따라가지 않는다", () => {
  it("묵계를 갖지 않은 발동자에게 넘어간 후로는 평범한 퐁이 된다", () => {
    const game = setup(
      silentScene(),
      { p0: ["seat_swap"], p1: ["silent_pact"] },
      [seatSwap, silentPact],
    );
    const res = game.engine.submit({
      player: "p0",
      type: "seat_swap",
      payload: { target: "p1" } as never,
    });
    expect(res.ok, "자리 바꿈이 성립해야 한다").toBe(true);

    const s = game.engine.state;
    // 몸통(555z 퐁)은 p0에게 갔지만 silent 표식은 따라가지 않는다
    expect(meldsOf(s, "p0").some((m) => m.silent === true)).toBe(false);
    // 그래서 p0의 손은 **열려 있다** — 되돌리면 여기서 0이 나오고 리치가 열린다
    expect(openMeldCountOf(s, "p0")).toBe(1);
  });

  it("리치 후보가 열리지 않는다 (멘젠이 새지 않는다는 최종 확인)", () => {
    const game = setup(
      silentScene(),
      { p0: ["seat_swap"], p1: ["silent_pact"] },
      [seatSwap, silentPact],
    );
    const flow = new FlowController(game.engine);
    flow.begin();
    const status = flow.submit("p0", {
      type: "seat_swap",
      payload: { target: "p1" },
    } as never);
    const opts =
      status.kind === "awaiting"
        ? (status.prompts ?? []).flatMap((q) =>
            q.player === "p0" ? (q.options ?? []) : [],
          )
        : [];
    expect(opts.some((o) => o.type === "riichi")).toBe(false);
  });

  it("새 주인도 묵계 보유자면 표식은 그대로 살아 있다", () => {
    const game = setup(
      silentScene(),
      { p0: ["seat_swap", "silent_pact"], p1: ["silent_pact"] },
      [seatSwap, silentPact],
    );
    const res = game.engine.submit({
      player: "p0",
      type: "seat_swap",
      payload: { target: "p1" } as never,
    });
    expect(res.ok).toBe(true);
    expect(meldsOf(game.engine.state, "p0").some((m) => m.silent === true)).toBe(true);
    expect(openMeldCountOf(game.engine.state, "p0")).toBe(0);
  });
});

/** B-12 */
describe("pseudo_dealer → seat_swap — 강탈한 오야는 강탈한 사람을 따라간다", () => {
  function dealerScene(): GameState {
    const base = craft({
      hands: { p0: "123m456m789m99p2s3s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 2,
      drawnLastFor: "p2",
    });
    return { ...base, round: { ...base.round, dealerSeat: 0 } };
  }

  it("claim → swap 순서로도 오야가 p2에게 남는다", () => {
    const game = setup(
      dealerScene(),
      { p2: ["pseudo_dealer", "seat_swap"] },
      [pseudoDealer, seatSwap],
    );
    expect(game.engine.submit({ player: "p2", type: "claim_dealer", payload: {} }).ok).toBe(
      true,
    );
    expect(game.engine.state.round.dealerSeat).toBe(2);
    expect(
      game.engine.submit({
        player: "p2",
        type: "seat_swap",
        payload: { target: "p3" } as never,
      }).ok,
    ).toBe(true);

    const s = game.engine.state;
    const p2seat = s.players.find((p) => p.id === "p2")?.seat;
    expect(p2seat, "자리를 실제로 바꿨다").toBe(3);
    // 되돌리면 dealerSeat=2 (=p3의 새 자리) 가 되어 오야가 상대에게 간다
    expect(s.round.dealerSeat).toBe(p2seat);
  });

  it("swap → claim 역순도 같은 결과 (p2가 오야)", () => {
    const game = setup(
      dealerScene(),
      { p2: ["pseudo_dealer", "seat_swap"] },
      [pseudoDealer, seatSwap],
    );
    expect(
      game.engine.submit({
        player: "p2",
        type: "seat_swap",
        payload: { target: "p3" } as never,
      }).ok,
    ).toBe(true);
    expect(game.engine.submit({ player: "p2", type: "claim_dealer", payload: {} }).ok).toBe(
      true,
    );
    const s = game.engine.state;
    expect(s.round.dealerSeat).toBe(s.players.find((p) => p.id === "p2")?.seat);
  });

  it("강탈이 없었으면 오야는 자리에 남는다 (카드 설명 그대로)", () => {
    // p0(원래 오야)이 자리 바꿈으로 p1과 바꾸면 오야는 seat0 = 이제 p1의 것이다
    const base = craft({
      hands: { p0: "123m456m789m99p2s3s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = setup(
      { ...base, round: { ...base.round, dealerSeat: 0 } },
      { p0: ["seat_swap"] },
      [seatSwap],
    );
    expect(
      game.engine.submit({
        player: "p0",
        type: "seat_swap",
        payload: { target: "p1" } as never,
      }).ok,
    ).toBe(true);
    const s = game.engine.state;
    expect(s.round.dealerSeat).toBe(0);
    expect(s.players.find((p) => p.seat === 0)?.id).toBe("p1");
  });
});

/** B-9 */
describe("grave_rob × rank_gate — 격 미달인 손은 도굴 후보가 아니다", () => {
  function graveScene(gated: boolean): ReturnType<typeof setup> {
    let state = craft({
      hands: { p0: "234m678m678s23p33p9m", p1: "*", p2: "*", p3: "*" },
      discards: { p0: "", p1: "4p", p2: "1z", p3: "2z" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    if (gated) {
      state = {
        ...state,
        augmentData: {
          ...state.augmentData,
          // p1의 격이 p0을 지목한 상태 (win.minHan(p0) = 5)
          [roundScopedKey("rank_gate", "mark", state, "p1")]: "p0",
        },
      };
    }
    return setup(
      state,
      { p0: ["grave_rob"], ...(gated ? { p1: ["rank_gate"] } : {}) },
      [graveRob, rankGate],
    );
  }

  function robOptions(game: ReturnType<typeof setup>): unknown[] {
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") return [];
    return (status.prompts ?? [])
      .filter((q) => q.player === "p0")
      .flatMap((q) => (q.options ?? []).filter((o) => o.type === "grave_rob"));
  }

  it("격이 없으면 후보가 뜬다 (대조군)", () => {
    const game = graveScene(false);
    expect(game.engine.rules.resolve("win.minHan", {
      playerId: "p0",
      state: game.engine.state,
    })).toBe(0);
    expect(robOptions(game).length).toBeGreaterThan(0);
  });

  it("격(최소 5판)에 걸린 3판 손은 후보가 0개다", () => {
    const game = graveScene(true);
    expect(game.engine.rules.resolve("win.minHan", {
      playerId: "p0",
      state: game.engine.state,
    })).toBe(5);
    // 되돌리면 여기서 1개가 뜨고, 누르면 uses만 오른 채 국이 계속된다
    expect(robOptions(game)).toHaveLength(0);
  });

  it("직접 제출해도 validate가 거부한다", () => {
    const gated = graveScene(true);
    const open = graveScene(false);
    // 격이 없을 때 뜨는 후보를 그대로 격 상태에 제출한다
    const opt = robOptions(open)[0] as { payload: unknown } | undefined;
    expect(opt).toBeDefined();
    const res = gated.engine.submit({
      player: "p0",
      type: "grave_rob",
      payload: (opt as { payload: never }).payload,
    });
    expect(res.ok).toBe(false);
    expect(gated.engine.state.augmentData["grave_rob:uses:p0"]).toBeUndefined();
  });
});

/** C-1 */
describe("reload × eternal_dealer — `keeps:` 카운터도 복구 대상이다", () => {
  function reloadScene(data: Record<string, unknown>): ReturnType<typeof setup> {
    const base = craft({
      hands: { p0: "123m456m789m22p33p", p1: "*", p2: "*", p3: "*" },
      discards: { p0: "6z", p1: "", p2: "", p3: "" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    return setup(
      { ...base, augmentData: { ...base.augmentData, ...data } },
      { p0: ["reload", "eternal_dealer"] },
      [reload, eternalDealer],
    );
  }

  it("연장을 한 번 쓴 만년 오야가 재장전 후보에 뜬다", () => {
    const game = reloadScene({ "eternal_dealer:keeps:p0": 1 });
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    const targets =
      status.kind === "awaiting"
        ? (status.prompts ?? [])
            .filter((q) => q.player === "p0")
            .flatMap((q) => (q.options ?? []))
            .filter((o) => o.type === "reload_use")
            .map((o) => (o.payload as { augmentId: string }).augmentId)
        : [];
    // 되돌리면 목록이 비어 만년 오야는 재장전의 사각지대로 남는다
    expect(targets).toContain("eternal_dealer");
  });

  it("복구하면 keeps 카운터가 1 줄고 재장전이 1 소진된다", () => {
    const game = reloadScene({ "eternal_dealer:keeps:p0": 2 });
    const res = game.engine.submit({
      player: "p0",
      type: "reload_use",
      payload: { augmentId: "eternal_dealer" } as never,
    });
    expect(res.ok).toBe(true);
    expect(game.engine.state.augmentData["eternal_dealer:keeps:p0"]).toBe(1);
    expect(game.engine.state.augmentData["reload:uses:p0"]).toBe(1);
  });

  it("아직 한 번도 안 쓴 만년 오야는 복구 대상이 아니다", () => {
    const game = reloadScene({});
    const res = game.engine.submit({
      player: "p0",
      type: "reload_use",
      payload: { augmentId: "eternal_dealer" } as never,
    });
    expect(res.ok).toBe(false);
  });
});
