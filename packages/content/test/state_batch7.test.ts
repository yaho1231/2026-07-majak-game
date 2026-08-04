/**
 * 뚫린 천장 쯔모 분할 / 삼원의 의지 후로 집계 (docs/25 역/점수 #12·#14).
 */

import { describe, expect, it } from "vitest";
import {
  ROUND_SETTLED,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type { GameState, PlayerId, RoundSettledPayload } from "@majak/core";
import { craft } from "./helpers.js";
import { aotenjouCeiling } from "../src/augments/aotenjou_ceiling.js";
import { splitOnGrid } from "../src/util.js";
import { threeDragonsWill } from "../src/augments/three_dragons_will.js";

describe("뚫린 천장 — 쯔모 분할이 총액을 넘지 않는다 (docs/25 역/점수 #12)", () => {
  /** p0가 쯔모 화료한 정산을 흘려 최종 deltas를 얻는다 */
  function settle(han: number, dealer: boolean): RoundSettledPayload {
    const base = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0" ? { ...p, augments: ["aotenjou_ceiling"] } : p,
      ),
      round: { ...base.round, dealerSeat: dealer ? 0 : 1 },
    };
    const game = createStandardGameFromState(state, undefined, [aotenjouCeiling]);
    installAugment(game.engine, aotenjouCeiling, "p0", { yaku: game.yaku });

    let payload = {
      outcome: "win",
      deltas: { p0: 0, p1: 0, p2: 0, p3: 0 },
      dealerSeat: dealer ? 0 : 1,
      honba: 0,
      riichiPot: 0,
      roundNumber: base.round.roundNumber,
      prevalentWind: base.round.prevalentWind,
      winInfos: [
        {
          winner: "p0",
          from: null,
          winType: "tsumo",
          points: 8000,
          han,
          fu: 30,
          yaku: [],
          yakumanCount: 0,
          extraHan: 0,
          doraHan: 0,
          uraHan: 0,
          redHan: 0,
          limit: null,
          winningTileId: 0,
        },
      ],
    } as unknown as RoundSettledPayload;

    for (const { intercept } of game.engine.effects.interceptorsFor(ROUND_SETTLED)) {
      const out = intercept(
        { type: ROUND_SETTLED, payload },
        { state: game.engine.state, rules: game.engine.rules },
      );
      if (out !== null) payload = out.payload as RoundSettledPayload;
    }
    return payload;
  }

  for (const [label, dealer] of [["자", false], ["친", true]] as const) {
    it(`${label} 쯔모: 받는 액수와 내는 액수의 합이 정확히 같다 (제로섬)`, () => {
      const out = settle(10, dealer);
      const sum = Object.values(out.deltas).reduce((a, b) => a + b, 0);
      // 예전에는 각 지불을 따로 올림해 최대 300점이 무에서 생겼다
      expect(sum).toBe(0);
    });

    it(`${label} 쯔모: 모든 이동액이 100점 격자 위에 있다`, () => {
      const out = settle(10, dealer);
      for (const v of Object.values(out.deltas)) {
        expect(Math.abs(v) % 100).toBe(0);
      }
    });
  }
});

describe("splitOnGrid — 분배 합이 총액과 정확히 같다 (docs/25 역/점수 #12)", () => {
  const sum = (rows: { amount: number }[]): number =>
    rows.reduce((a, r) => a + r.amount, 0);

  it("나누어떨어지지 않는 총액도 초과하지 않는다 (예전 2500 → 2800)", () => {
    // 자 쯔모: 친 2몫 + 자 1몫 + 자 1몫 = 4몫
    const rows = splitOnGrid(2500, [
      { id: "p1" as PlayerId, weight: 2 },
      { id: "p2" as PlayerId, weight: 1 },
      { id: "p3" as PlayerId, weight: 1 },
    ]);
    expect(sum(rows)).toBe(2500);
    for (const r of rows) expect(r.amount % 100).toBe(0);
  });

  it("친 쯔모(3등분)도 총액을 지킨다", () => {
    const rows = splitOnGrid(2500, [
      { id: "p1" as PlayerId, weight: 1 },
      { id: "p2" as PlayerId, weight: 1 },
      { id: "p3" as PlayerId, weight: 1 },
    ]);
    expect(sum(rows)).toBe(2500);
  });

  it("무거운 쪽이 더 낸다 (비율은 유지된다)", () => {
    const rows = splitOnGrid(4000, [
      { id: "p1" as PlayerId, weight: 2 },
      { id: "p2" as PlayerId, weight: 1 },
      { id: "p3" as PlayerId, weight: 1 },
    ]);
    expect(rows[0]?.amount).toBe(2000);
    expect(rows[1]?.amount).toBe(1000);
    expect(rows[2]?.amount).toBe(1000);
  });

  it("나누어떨어지면 나머지 배분이 일어나지 않는다", () => {
    const rows = splitOnGrid(1200, [
      { id: "p1" as PlayerId, weight: 1 },
      { id: "p2" as PlayerId, weight: 1 },
      { id: "p3" as PlayerId, weight: 1 },
    ]);
    expect(rows.map((r) => r.amount)).toEqual([400, 400, 400]);
  });
});

describe("삼원의 의지 — 후로한 삼원 커쯔도 센다 (docs/25 역/점수 #14)", () => {
  function optionsFor(melded: boolean): number {
    const base = craft({
      // 발발발(손) + 中 한 장. 백백백은 melded면 후로, 아니면 손패에 있다.
      // 발발발(6z) + 中(7z) 한 장. 백백백(5z)은 melded면 후로, 아니면 손패에 있다.
      hands: melded
        ? { p0: "666z7z234m567m", p1: "*", p2: "*", p3: "*" }
        : { p0: "555z666z7z234m567m", p1: "*", p2: "*", p3: "*" },
      ...(melded
        ? { melds: { p0: [{ kind: "pon" as const, spec: "555z" }] } }
        : {}),
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0" ? { ...p, augments: ["three_dragons_will"] } : p,
      ),
    };
    const game = createStandardGameFromState(state, undefined, [threeDragonsWill]);
    installAugment(game.engine, threeDragonsWill, "p0", { yaku: game.yaku });
    const providers = game.engine.turnOptionProviders;
    return providers.flatMap((f) => f(game.engine.state, "p0" as PlayerId)).length;
  }

  it("손패에 두 커쯔가 있으면 발동 후보가 뜬다 (기준선)", () => {
    expect(optionsFor(false)).toBeGreaterThan(0);
  });

  it("한 커쯔가 후로여도 발동 후보가 뜬다", () => {
    // 예전에는 손패만 세서 후로한 백백백이 0장으로 잡혀 발동할 수 없었다
    expect(optionsFor(true)).toBeGreaterThan(0);
  });
});
