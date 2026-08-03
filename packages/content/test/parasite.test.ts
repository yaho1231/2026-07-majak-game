/**
 * parasite (기생충) 테스트 — 지정 액션 validate(국마다 1회) / 정산 절반 이전(제로섬 보존) /
 * 숙주가 잃는 국 무페널티 / 국이 바뀌면 지정이 풀려 다시 지정할 수 있다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  ROUND_SETTLED,
  SYSTEM_PLAYER,
  createStandardGameFromState,
  discardsZone,
  installAugment,
} from "@majak/core";
import type {
  GameState,
  PlayerId,
  RoundSettledPayload,
  TileId,
} from "@majak/core";
import { craft } from "./helpers.js";
import { roundKey, roundViewKey } from "../src/util.js";
import { parasite } from "../src/augments/parasite.js";

type Game = ReturnType<typeof createStandardGameFromState>;

/** 이번 국의 기생 대상 키 (국이 바뀌면 만료된다) */
const targetKeyOf = (state: GameState): string =>
  `parasite:target:p0:${roundKey(state)}`;
const VIEW_KEY = roundViewKey("*", "parasite:p0");

/** state.players[].augments에 증강 보유를 직접 주입한다 (드래프트 이벤트 생략) */
function withAugments(state: GameState, grants: Record<PlayerId, string[]>): GameState {
  return {
    ...state,
    players: state.players.map((p) => {
      const extra = grants[p.id];
      return extra === undefined ? p : { ...p, augments: [...p.augments, ...extra] };
    }),
  };
}

/** 지정 완료 상태를 직접 주입한다 (p0가 target에 기생 중) */
function withParasiteOn(state: GameState, target: PlayerId): GameState {
  return {
    ...state,
    augmentData: {
      ...state.augmentData,
      [targetKeyOf(state)]: target,
      [VIEW_KEY]: target,
    },
  };
}

/** 시스템 액션으로 쯔모 화료를 정산한다 (winner의 lastDrawnTile 사용) */
function settleTsumo(game: Game, winner: PlayerId): void {
  const tileId = game.engine.state.round.lastDrawnTile as TileId;
  const r = game.engine.submit({
    player: SYSTEM_PLAYER,
    type: "sys.settleWin",
    payload: { wins: [{ winner, from: null, tileId, winType: "tsumo" }] },
  });
  if (!r.ok) throw new Error(r.reason);
}

/** 마지막 ROUND_SETTLED payload */
function lastSettled(game: Game): RoundSettledPayload {
  for (let i = game.engine.eventLog.length - 1; i >= 0; i--) {
    const e = game.engine.eventLog[i];
    if (e?.type === ROUND_SETTLED) return e.payload as RoundSettledPayload;
  }
  throw new Error("no RoundSettled event");
}

function sumOf(deltas: Record<PlayerId, number>): number {
  return Object.values(deltas).reduce((a, b) => a + b, 0);
}

/** winner가 탕야오 멘젠쯔모 직전인 상태 (234m345p456s678s22s, 2s 탕키) */
function craftTsumoBy(winner: PlayerId): GameState {
  const hands: Record<PlayerId, string> = { p0: "*", p1: "*", p2: "*", p3: "*" };
  hands[winner] = "234m345p456s678s22s";
  const seat = Number(winner.slice(1));
  return craft({ hands, phase: "turn.act", turnSeat: seat, drawnLastFor: winner });
}

// ─────────────────────────── 지정 액션 ───────────────────────────

describe("parasite (기생충) — parasite_attach 지정", () => {
  it("남의 턴·자신 지정·재사용은 거부, 정상 지정 시 대상·뷰 키가 기록된다", () => {
    const base = craft({
      hands: { p0: "123m456p789s11z22z", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
    });
    const game = createStandardGameFromState(withAugments(base, { p0: ["parasite"] }));
    installAugment(game.engine, parasite, "p0");

    const def = game.engine.actions.get("parasite_attach");
    if (def === undefined) throw new Error("no parasite_attach action");
    const ctx = { state: game.engine.state, rules: game.engine.rules };

    // 자신 지정·미지의 대상·비보유자는 거부
    expect(
      def.validate({ player: "p0", type: "parasite_attach", payload: { target: "p0" } }, ctx),
    ).toBe("cannot attach to yourself");
    expect(
      def.validate({ player: "p0", type: "parasite_attach", payload: { target: "px" } }, ctx),
    ).toBe("unknown target");
    expect(
      def.validate({ player: "p1", type: "parasite_attach", payload: { target: "p0" } }, ctx),
    ).toBe("no parasite augment");

    // 남의 턴에는 거부
    const otherTurn = {
      state: {
        ...game.engine.state,
        round: { ...game.engine.state.round, turnSeat: 1 },
      },
      rules: game.engine.rules,
    };
    expect(
      def.validate(
        { player: "p0", type: "parasite_attach", payload: { target: "p1" } },
        otherTurn,
      ),
    ).toBe("not your turn");

    // 지정 전에는 턴 프롬프트에 상대 3명 후보가 노출된다
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const targets = (status.prompts.find((p) => p.player === "p0")?.options ?? [])
      .filter((o) => o.type === "parasite_attach")
      .map((o) => (o.payload as { target: PlayerId }).target)
      .sort();
    expect(targets).toEqual(["p1", "p2", "p3"]);

    // 정상 지정 → 대상 키 + 전원 공개 뷰 키 기록
    const result = game.engine.submit({
      player: "p0",
      type: "parasite_attach",
      payload: { target: "p1" },
    });
    expect(result.ok).toBe(true);
    expect(game.engine.state.augmentData[targetKeyOf(base)]).toBe("p1");
    expect(game.engine.state.augmentData[VIEW_KEY]).toBe("p1");

    // 국마다 1회 — 같은 국에 다시 지정은 거부, 후보도 더 이상 노출되지 않는다
    expect(
      def.validate(
        { player: "p0", type: "parasite_attach", payload: { target: "p2" } },
        { state: game.engine.state, rules: game.engine.rules },
      ),
    ).toBe("parasite already attached this round");
    const status2 = new FlowController(game.engine).begin();
    if (status2.kind !== "awaiting") throw new Error("expected awaiting");
    expect(
      (status2.prompts.find((p) => p.player === "p0")?.options ?? []).some(
        (o) => o.type === "parasite_attach",
      ),
    ).toBe(false);
  });
});

// ─────────────────────────── 정산 절반 이전 ───────────────────────────

describe("parasite (기생충) — 정산 절반 이전", () => {
  it("숙주가 쯔모 화료하면 획득의 절반을 대신 받고, 합계는 불변(제로섬)", () => {
    const base = craftTsumoBy("p1");
    const baseline = createStandardGameFromState(structuredClone(base));
    const augmented = createStandardGameFromState(
      structuredClone(withParasiteOn(base, "p1")),
    );
    installAugment(augmented.engine, parasite, "p0");

    settleTsumo(baseline, "p1");
    settleTsumo(augmented, "p1");

    const baseD = lastSettled(baseline).deltas;
    const augD = lastSettled(augmented).deltas;
    const share = Math.round((baseD["p1"] ?? 0) / 200) * 100;
    expect(share).toBeGreaterThan(0); // 숙주 이득의 절반 (100점 단위)
    expect(augD["p1"]).toBe((baseD["p1"] ?? 0) - share);
    expect(augD["p0"]).toBe((baseD["p0"] ?? 0) + share);
    expect(sumOf(augD)).toBe(sumOf(baseD)); // 제로섬 보존
    // 나머지 지불자는 영향 없음
    expect(augD["p2"]).toBe(baseD["p2"]);
    expect(augD["p3"]).toBe(baseD["p3"]);

    // 대상은 저절로 옮겨 다니지 않는다 — 이 국의 숙주는 끝까지 p1
    expect(augmented.engine.state.augmentData[targetKeyOf(base)]).toBe("p1");
  });

  it("숙주가 잃을 때는 함께 잃지 않는다 (48차 무페널티)", () => {
    // p2가 쯔모 화료 → 숙주 p1은 지불자
    const base = craftTsumoBy("p2");
    const baseline = createStandardGameFromState(structuredClone(base));
    const augmented = createStandardGameFromState(
      structuredClone(withParasiteOn(base, "p1")),
    );
    installAugment(augmented.engine, parasite, "p0");

    settleTsumo(baseline, "p2");
    settleTsumo(augmented, "p2");

    const baseD = lastSettled(baseline).deltas;
    const augD = lastSettled(augmented).deltas;
    // 48차 무페널티: 숙주가 잃을 때는 함께 잃지 않는다 — 정산이 그대로다
    expect(baseD["p1"] ?? 0).toBeLessThan(0);
    expect(augD["p1"]).toBe(baseD["p1"]);
    expect(augD["p0"]).toBe(baseD["p0"]);
    expect(sumOf(augD)).toBe(sumOf(baseD));

    expect(augmented.engine.state.augmentData[targetKeyOf(base)]).toBe("p1");
  });

  it("숙주가 론을 맞아도 손실은 분담하지 않는다", () => {
    // p1이 5s를 버렸고 p2가 그 5s로 론 (234m345p345s678s + 55s)
    const base = craft({
      hands: { p0: "*", p1: "*", p2: "234m345p345s678s5s", p3: "*" },
      discards: { p1: "5s" },
      phase: "turn.act",
      turnSeat: 1,
    });
    const settleRon = (game: Game): void => {
      const ronTile = game.engine.state.zones[discardsZone("p1")]?.tileIds[0] as TileId;
      const r = game.engine.submit({
        player: SYSTEM_PLAYER,
        type: "sys.settleWin",
        payload: { wins: [{ winner: "p2", from: "p1", tileId: ronTile, winType: "ron" }] },
      });
      if (!r.ok) throw new Error(r.reason);
    };

    const baseline = createStandardGameFromState(structuredClone(base));
    const augmented = createStandardGameFromState(
      structuredClone(withParasiteOn(base, "p1")),
    );
    installAugment(augmented.engine, parasite, "p0");

    settleRon(baseline);
    settleRon(augmented);

    const baseD = lastSettled(baseline).deltas;
    const augD = lastSettled(augmented).deltas;
    // 48차 무페널티: 숙주의 손실은 분담하지 않는다 (이득만 뜯어온다)
    expect(baseD["p1"] ?? 0).toBeLessThan(0);
    expect(augD["p1"]).toBe(baseD["p1"]);
    expect(augD["p0"]).toBe(baseD["p0"]);
    expect(sumOf(augD)).toBe(sumOf(baseD));

    // 론을 맞아도 대상은 옮겨가지 않는다 — 이 국의 숙주는 끝까지 p1
    expect(augmented.engine.state.augmentData[targetKeyOf(base)]).toBe("p1");
  });

  it("지난 국의 지정은 다음 국 정산에 영향을 주지 않는다 (국 단위 만료)", () => {
    // 1국(동1국 0본장)에 p1을 지정해 뒀지만, 정산은 2국(동2국) 상태에서 일어난다
    const base = craftTsumoBy("p1");
    const stale = {
      ...base,
      augmentData: {
        ...base.augmentData,
        [`parasite:target:p0:${roundKey(base)}`]: "p1",
      },
      round: { ...base.round, roundNumber: 2 },
    };
    const baseline = createStandardGameFromState(
      structuredClone({ ...base, round: { ...base.round, roundNumber: 2 } }),
    );
    const augmented = createStandardGameFromState(structuredClone(stale));
    installAugment(augmented.engine, parasite, "p0");

    settleTsumo(baseline, "p1");
    settleTsumo(augmented, "p1");

    // 국이 바뀌었으므로 지난 국의 지정은 죽어 있다 — 정산이 기준선과 같다
    expect(lastSettled(augmented).deltas).toEqual(lastSettled(baseline).deltas);
  });

  it("국이 바뀌면 다시 지정할 수 있다 (매 국 1회 액티브)", () => {
    const base = craft({
      hands: { p0: "123m456p789s11z22z", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
    });
    const game = createStandardGameFromState(withAugments(base, { p0: ["parasite"] }));
    installAugment(game.engine, parasite, "p0");
    const def = game.engine.actions.get("parasite_attach");
    if (def === undefined) throw new Error("no parasite_attach action");

    const r = game.engine.submit({
      player: "p0",
      type: "parasite_attach",
      payload: { target: "p1" },
    });
    expect(r.ok).toBe(true);

    // 다음 국(동2국)에서는 지정이 풀려 있어 다른 상대로 새로 지정할 수 있다
    const nextRound = {
      ...game.engine.state,
      round: { ...game.engine.state.round, roundNumber: 2 },
    };
    expect(
      def.validate(
        { player: "p0", type: "parasite_attach", payload: { target: "p2" } },
        { state: nextRound, rules: game.engine.rules },
      ),
    ).toBeNull();
  });
});

describe("parasite — augPoints 기록 (docs/25 P9)", () => {
  it("증강이 움직인 점수가 결과 화면용 augPoints에 정확히 실린다", () => {
    const base = craftTsumoBy("p1");
    const baseline = createStandardGameFromState(structuredClone(base));
    const augmented = createStandardGameFromState(
      structuredClone(withParasiteOn(base, "p1")),
    );
    installAugment(augmented.engine, parasite, "p0");

    settleTsumo(baseline, "p1");
    settleTsumo(augmented, "p1");

    const baseD = lastSettled(baseline).deltas;
    const augSettle = lastSettled(augmented);
    const note = (augSettle.augPoints ?? []).find(
      (n) => n.player === "p0" && n.augId === "parasite",
    );

    // 기록이 있어야 하고, 그 값이 **실제 delta 변동과 같아야** 한다.
    // 예전에는 deltas만 고쳐서 결과 화면에 이유 없는 점수 이동만 남았다.
    expect(note).toBeDefined();
    expect(note?.points).toBe((augSettle.deltas["p0"] ?? 0) - (baseD["p0"] ?? 0));
  });
});
