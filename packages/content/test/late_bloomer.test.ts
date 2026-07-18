/**
 * late_bloomer (대기만성) 테스트 — 남4국부터 획득 점수 3배 + 드래프트 스테이지 제한.
 */

import { describe, expect, it } from "vitest";
import {
  DraftController,
  FlowController,
  createStandardGame,
  createStandardGameFromState,
  discardsZone,
  installAugment,
} from "@majak/core";
import type {
  GameState,
  RoundSettledPayload,
  TileId,
} from "@majak/core";
import { ROUND_SETTLED } from "@majak/core";
import { craft } from "./helpers.js";
import { lateBloomer } from "../src/augments/late_bloomer.js";

const SYS = "__system";

type Game = ReturnType<typeof createStandardGameFromState>;

/** turn.act 상태에서 p0의 쯔모 화료를 끝까지 진행한다 */
function runTsumoWin(game: Game): void {
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  const prompt = status.prompts.find((p) => p.player === "p0");
  const win = prompt?.options.find((o) => o.type === "win");
  if (win === undefined) throw new Error("no win option for p0");
  flow.submit("p0", win);
}

/** 마지막 ROUND_SETTLED payload */
function lastSettled(game: Game): RoundSettledPayload {
  for (let i = game.engine.eventLog.length - 1; i >= 0; i--) {
    const e = game.engine.eventLog[i];
    if (e?.type === ROUND_SETTLED) return e.payload as RoundSettledPayload;
  }
  throw new Error("no RoundSettled event");
}

/** 탕야오 멘젠쯔모가 가능한 p0 화료 직전 상태 (234m345p456s678s + 22s, 2s 탕키) */
function craftTanyaoTsumo(): GameState {
  return craft({
    hands: { p0: "234m345p456s678s22s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
}

/** 국(장풍·국수)만 바꾼 사본 */
function atRound(base: GameState, prevalentWind: number, roundNumber: number): GameState {
  return {
    ...base,
    round: { ...base.round, prevalentWind, roundNumber },
  };
}

/** 같은 상태를 기준선/보유자 두 벌로 돌려 p0의 정산 delta를 비교한다 */
function settleDeltas(state: GameState): { base: number; aug: number } {
  const baseline = createStandardGameFromState(structuredClone(state));
  const augmented = createStandardGameFromState(structuredClone(state));
  installAugment(augmented.engine, lateBloomer, "p0");
  runTsumoWin(baseline);
  runTsumoWin(augmented);
  return {
    base: lastSettled(baseline).deltas["p0"] ?? 0,
    aug: lastSettled(augmented).deltas["p0"] ?? 0,
  };
}

describe("late_bloomer (대기만성)", () => {
  it("남4국 화료 시 획득 delta가 정확히 3배가 된다", () => {
    const { base, aug } = settleDeltas(atRound(craftTanyaoTsumo(), 2, 4));
    expect(base).toBeGreaterThan(0);
    expect(aug).toBe(base * 3);
  });

  it("동1국에서는 효과가 없다 (delta 동일)", () => {
    const { base, aug } = settleDeltas(atRound(craftTanyaoTsumo(), 1, 1));
    expect(base).toBeGreaterThan(0);
    expect(aug).toBe(base);
  });

  it("서입(연장, prevalentWind=3)에서도 3배가 적용된다", () => {
    const { base, aug } = settleDeltas(atRound(craftTanyaoTsumo(), 3, 1));
    expect(base).toBeGreaterThan(0);
    expect(aug).toBe(base * 3);
  });

  it("잃는 점수는 3배가 되지 않는다 (남4국에 방총당해도 delta 그대로)", () => {
    // p1이 5s 대기 탕야오, p0의 버림패 5s로 론 — p0은 지불자
    const raw = craft({
      hands: {
        p0: "*",
        p1: "234m345p345s678s5s",
        p2: "*",
        p3: "*",
      },
      discards: { p0: "5s" },
      phase: "turn.act",
      turnSeat: 0,
    });
    const state = atRound(raw, 2, 4);

    const settleRon = (game: Game): number => {
      const ronTile = game.engine.state.zones[discardsZone("p0")]?.tileIds[0] as TileId;
      const r = game.engine.submit({
        player: SYS,
        type: "sys.settleWin",
        payload: {
          wins: [{ winner: "p1", from: "p0", tileId: ronTile, winType: "ron" }],
        },
      });
      if (!r.ok) throw new Error(r.reason);
      return lastSettled(game).deltas["p0"] ?? 0;
    };

    const baseline = createStandardGameFromState(structuredClone(state));
    const augmented = createStandardGameFromState(structuredClone(state));
    installAugment(augmented.engine, lateBloomer, "p0");

    const baseDelta = settleRon(baseline);
    const augDelta = settleRon(augmented);
    expect(baseDelta).toBeLessThan(0); // 방총 지불 — 음수
    expect(augDelta).toBe(baseDelta); // 음수는 그대로
  });

  it("남장 드래프트(southEntry)에서는 절대 제시되지 않고, catalog에는 존재한다", () => {
    let offeredAtGameStart = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const game = createStandardGame({ seed, extraAugments: [lateBloomer] });
      expect(game.augments.get("late_bloomer")).toBe(lateBloomer); // catalog 존재
      const draft = new DraftController(game.engine, game.augments, { yaku: game.yaku });
      for (const player of ["p0", "p1", "p2", "p3"] as const) {
        const south = draft.roll("southEntry", player).map((d) => d.id);
        expect(south).not.toContain("late_bloomer");
        if (draft.roll("gameStart", player).some((d) => d.id === "late_bloomer")) {
          offeredAtGameStart += 1;
        }
      }
    }
    // 스테이지 제한이지 카탈로그 누락이 아님 — 게임 시작 드래프트에서는 나온다
    expect(offeredAtGameStart).toBeGreaterThan(0);
  });
});
