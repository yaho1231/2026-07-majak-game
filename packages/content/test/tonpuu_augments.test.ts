/**
 * 동풍전 전용 템포 변형 증강 + 모드 드래프트 필터 테스트.
 *
 * - 모드 필터: 반장전 전용(late_bloomer)은 동풍전 드래프트에
 *   절대 안 나오고, 동풍전 전용(*_east)은 반장전 드래프트에 절대 안 나온다.
 * - late_bloomer_east: 동4국부터 획득 delta 3배.
 * (선봉vanguard/vanguard_east은 48차 도파민 리디자인에서 삭제)
 */

import { describe, expect, it } from "vitest";
import {
  DraftController,
  FlowController,
  createStandardGame,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type { GameMode, GameState, RoundSettledPayload } from "@majak/core";
import { ROUND_SETTLED } from "@majak/core";
import { craft } from "./helpers.js";
import { contentAugments } from "../src/index.js";
import { lateBloomerEast } from "../src/augments/late_bloomer_east.js";

type Game = ReturnType<typeof createStandardGameFromState>;

const HANCHAN_ONLY = ["late_bloomer"];
const TONPUU_ONLY = ["late_bloomer_east"];
const PLAYERS = ["p0", "p1", "p2", "p3"] as const;

/** 여러 시드·양 스테이지에서 특정 모드의 드래프트에 제시된 모든 증강 id 집합 */
function offeredIds(mode: GameMode): Set<string> {
  const stages =
    mode === "tonpuu"
      ? (["gameStart", "eastThird", "eastFourth"] as const)
      : (["gameStart", "eastThird", "southEntry", "southThird"] as const);
  const seen = new Set<string>();
  for (let seed = 1; seed <= 60; seed++) {
    const game = createStandardGame({ seed, mode, extraAugments: contentAugments });
    const draft = new DraftController(game.engine, game.augments, { yaku: game.yaku });
    for (const stage of stages) {
      for (const player of PLAYERS) {
        for (const def of draft.roll(stage, player)) seen.add(def.id);
      }
    }
  }
  return seen;
}

function runTsumoWin(game: Game): void {
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  const win = status.prompts.find((p) => p.player === "p0")?.options.find((o) => o.type === "win");
  if (win === undefined) throw new Error("no win option for p0");
  flow.submit("p0", win);
}

function lastSettled(game: Game): RoundSettledPayload {
  for (let i = game.engine.eventLog.length - 1; i >= 0; i--) {
    const e = game.engine.eventLog[i];
    if (e?.type === ROUND_SETTLED) return e.payload as RoundSettledPayload;
  }
  throw new Error("no RoundSettled event");
}

function craftTanyaoTsumo(): GameState {
  return craft({
    hands: { p0: "234m345p456s678s22s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
}

function atRound(base: GameState, prevalentWind: number, roundNumber: number): GameState {
  return { ...base, round: { ...base.round, prevalentWind, roundNumber } };
}

/** 같은 상태를 기준선/보유자 두 벌로 돌려 p0의 정산 delta를 비교한다 */
function settleDeltas(
  state: GameState,
  aug: Parameters<typeof installAugment>[1],
): { base: number; aug: number } {
  const baseline = createStandardGameFromState(structuredClone(state));
  const augmented = createStandardGameFromState(structuredClone(state));
  installAugment(augmented.engine, aug, "p0");
  runTsumoWin(baseline);
  runTsumoWin(augmented);
  return {
    base: lastSettled(baseline).deltas["p0"] ?? 0,
    aug: lastSettled(augmented).deltas["p0"] ?? 0,
  };
}

describe("동풍전 모드 드래프트 필터", () => {
  it("동풍전 드래프트: 반장전 전용은 안 나오고, 동풍전 전용은 나온다", () => {
    const offered = offeredIds("tonpuu");
    for (const id of HANCHAN_ONLY) expect(offered.has(id)).toBe(false);
    for (const id of TONPUU_ONLY) expect(offered.has(id)).toBe(true);
  });

  it("반장전 드래프트: 동풍전 전용은 안 나오고, 반장전 전용은 나온다", () => {
    const offered = offeredIds("hanchan");
    for (const id of TONPUU_ONLY) expect(offered.has(id)).toBe(false);
    for (const id of HANCHAN_ONLY) expect(offered.has(id)).toBe(true);
  });
});

describe("late_bloomer_east (대기만성 · 동풍전)", () => {
  // 52차(docs/16 §1b B): 3배 배율 → 후반 규칙 획득(후리텐 무시 + 역 없이 화료)
  const bloomedRules = (state: GameState): { furiten: boolean; needYaku: boolean } => {
    const game = createStandardGameFromState(structuredClone(state));
    installAugment(game.engine, lateBloomerEast, "p0");
    const ctx = { playerId: "p0", state: game.engine.state };
    return {
      furiten: game.engine.rules.resolve<boolean>("win.furiten.enabled", ctx),
      needYaku: game.engine.rules.resolve<boolean>("win.requiresYaku", ctx),
    };
  };

  it("동4국에 만개하면 후리텐 무시·역 없음 화료를 얻는다", () => {
    const r = bloomedRules(atRound(craftTanyaoTsumo(), 1, 4));
    expect(r.furiten).toBe(false);
    expect(r.needYaku).toBe(false);
  });

  it("동3국까지는 아무 규칙도 얻지 않는다", () => {
    const r = bloomedRules(atRound(craftTanyaoTsumo(), 1, 3));
    expect(r.furiten).toBe(true);
    expect(r.needYaku).toBe(true);
  });

  it("동3국까지는 정산 배율도 없다 (delta 동일)", () => {
    const { base, aug } = settleDeltas(atRound(craftTanyaoTsumo(), 1, 3), lateBloomerEast);
    expect(base).toBeGreaterThan(0);
    expect(aug).toBe(base);
  });

  it("남입 연장(장=2)에서도 만개한다", () => {
    const r = bloomedRules(atRound(craftTanyaoTsumo(), 2, 1));
    expect(r.furiten).toBe(false);
    expect(r.needYaku).toBe(false);
  });
});

