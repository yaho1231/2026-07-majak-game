/**
 * score_bonus 그룹 테스트 — 점수·판수 보너스 계열 증강 8종.
 * (gokuakumudo / slow_steady / furo_master / promise_next /
 *  riichi_market / noten_insurance / honba_collector)
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  ROUND_SETTLED,
  SCORE_CHANGED,
  WALL,
  createStandardGame,
  createStandardGameFromState,
  discardsZone,
  installAugment,
} from "@majak/core";
import type {
  GameState,
  PlayerId,
  RoundSettledPayload,
  ScoreChangedPayload,
  TileId,
} from "@majak/core";
import { craft } from "./helpers.js";
import { gokuakumudo } from "../src/augments/gokuakumudo.js";
import { slowSteady } from "../src/augments/slow_steady.js";
import { furoMaster } from "../src/augments/furo_master.js";
import { promiseNext } from "../src/augments/promise_next.js";
import { riichiMarket } from "../src/augments/riichi_market.js";
import { notenInsurance } from "../src/augments/noten_insurance.js";
import { honbaCollector } from "../src/augments/honba_collector.js";
import { bountyTanyao } from "../src/augments/bounty_tanyao.js";
import { jackpot } from "../src/augments/jackpot.js";
import { bigHand } from "../src/augments/big_hand.js";

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

/** reason이 일치하는 SCORE_CHANGED 이벤트를 찾는다 */
function bonusEvent(game: Game, reason: string): ScoreChangedPayload | undefined {
  const e = game.engine.eventLog.find(
    (ev) =>
      ev.type === SCORE_CHANGED &&
      (ev.payload as ScoreChangedPayload).reason === reason,
  );
  return e === undefined ? undefined : (e.payload as ScoreChangedPayload);
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
function craftTanyaoTsumo(seed?: number): GameState {
  return craft({
    hands: { p0: "234m345p456s678s22s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
    ...(seed !== undefined ? { seed } : {}),
  });
}

// ─────────────────────────── gokuakumudo ───────────────────────────

describe("gokuakumudo (극악무도)", () => {
  it("화료 시 후로한 패 1장당 +100점 (펑 2개 = 6장 = 600점)", () => {
    const state = craft({
      hands: { p0: "234m345p55s", p1: "*", p2: "*", p3: "*" },
      melds: {
        p0: [
          { kind: "pon", spec: "666s" },
          { kind: "pon", spec: "777p" },
        ],
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = createStandardGameFromState(state);
    installAugment(game.engine, gokuakumudo, "p0");
    runTsumoWin(game);
    expect(bonusEvent(game, "gokuakumudo")?.delta).toBe(600);
  });

  it("멘젠 화료(후로 0장)면 보너스가 없다", () => {
    const game = createStandardGameFromState(craftTanyaoTsumo());
    installAugment(game.engine, gokuakumudo, "p0");
    runTsumoWin(game);
    expect(bonusEvent(game, "gokuakumudo")).toBeUndefined();
  });
});

// ─────────────────────────── slow_steady ───────────────────────────

describe("slow_steady (천천히 꾸준히)", () => {
  it("6순마다 화료 시 +1판 (13순 → +2판, 5순 → 0판, 남은 아님)", () => {
    const base = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
    });
    const late: GameState = { ...base, round: { ...base.round, turnCount: 13 } };
    const game = createStandardGameFromState(late);
    installAugment(game.engine, slowSteady, "p0");

    const extraOf = (playerId: PlayerId, state: GameState): number =>
      game.engine.rules.resolve<number>("score.extraHan", { playerId, state });

    expect(extraOf("p0", game.engine.state)).toBe(2); // floor(13/6)
    expect(extraOf("p1", game.engine.state)).toBe(0); // 보유자만
    const early: GameState = { ...base, round: { ...base.round, turnCount: 5 } };
    expect(extraOf("p0", early)).toBe(0);
  });
});

// ─────────────────────────── furo_master ───────────────────────────

describe("furo_master (부르는 게 값)", () => {
  it("후로 1개당 +1판이 규칙과 실제 정산(winInfo.extraHan)에 반영된다", () => {
    const state = craft({
      hands: { p0: "234m345p55s", p1: "*", p2: "*", p3: "*" },
      melds: {
        p0: [
          { kind: "pon", spec: "666s" },
          { kind: "pon", spec: "777p" },
        ],
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = createStandardGameFromState(state);
    installAugment(game.engine, furoMaster, "p0");

    expect(
      game.engine.rules.resolve<number>("score.extraHan", {
        playerId: "p0",
        state: game.engine.state,
      }),
    ).toBe(2);
    expect(
      game.engine.rules.resolve<number>("score.extraHan", {
        playerId: "p1",
        state: game.engine.state,
      }),
    ).toBe(0);

    runTsumoWin(game);
    const info = (lastSettled(game).winInfos ?? [])[0];
    expect(info?.winner).toBe("p0");
    expect(info?.extraHan).toBe(2);
  });
});

// ─────────────────────────── promise_next ───────────────────────────

describe("promise_next (다음을 위한 기약)", () => {
  const STACK_KEY = "promise_next:stack:p0";

  it("국을 넘길 때마다 스택 +1, 화료 시 판으로 반영 후 초기화", () => {
    const game = createStandardGameFromState(craftTanyaoTsumo());
    installAugment(game.engine, promiseNext, "p0");

    // 유국(abort) 2번 → 스택 2
    for (let i = 0; i < 2; i++) {
      const r = game.engine.submit({ player: SYS, type: "sys.settleAbort", payload: {} });
      expect(r.ok).toBe(true);
    }
    expect(game.engine.state.augmentData[STACK_KEY]).toBe(2);
    expect(game.engine.state.augmentData["view:*:promise_next:p0"]).toBe(2); // 전원 공개
    expect(
      game.engine.rules.resolve<number>("score.extraHan", {
        playerId: "p0",
        state: game.engine.state,
      }),
    ).toBe(2);
    expect(
      game.engine.rules.resolve<number>("score.extraHan", {
        playerId: "p1",
        state: game.engine.state,
      }),
    ).toBe(0);

    // 쯔모 화료 → 스택 2가 판으로 반영되고, 정산 후 스택 초기화
    const tileId = game.engine.state.round.lastDrawnTile as TileId;
    const r = game.engine.submit({
      player: SYS,
      type: "sys.settleWin",
      payload: { wins: [{ winner: "p0", from: null, tileId, winType: "tsumo" }] },
    });
    expect(r.ok).toBe(true);
    const info = (lastSettled(game).winInfos ?? [])[0];
    expect(info?.extraHan).toBe(2);
    expect(game.engine.state.augmentData[STACK_KEY]).toBe(0);
  });

  it("론당하면 스택이 초기화된다", () => {
    const state = craft({
      hands: {
        p0: "*",
        p1: "234m345p345s678s5s", // 5s 대기 탕야오
        p2: "*",
        p3: "*",
      },
      discards: { p0: "5s" }, // p0의 방총패 (론 대상 패)
      phase: "turn.act",
      turnSeat: 0,
    });
    const game = createStandardGameFromState(state);
    installAugment(game.engine, promiseNext, "p0");

    game.engine.submit({ player: SYS, type: "sys.settleAbort", payload: {} });
    expect(game.engine.state.augmentData[STACK_KEY]).toBe(1);

    const ronTile = game.engine.state.zones[discardsZone("p0")]?.tileIds[0] as TileId;
    const r = game.engine.submit({
      player: SYS,
      type: "sys.settleWin",
      payload: { wins: [{ winner: "p1", from: "p0", tileId: ronTile, winType: "ron" }] },
    });
    expect(r.ok).toBe(true);
    expect(game.engine.state.augmentData[STACK_KEY]).toBe(0); // 방총 → 초기화
  });
});

// ─────────────────────────── riichi_market ───────────────────────────

describe("riichi_market (리치봉 시세)", () => {
  it("화료 시 회수하는 리치봉 1개당 +1000점을 본인만 추가로 받는다", () => {
    // 공탁에 리치봉 2개(2000점)가 쌓여 있는 상황
    const base = craftTanyaoTsumo();
    const withPot: GameState = {
      ...base,
      round: { ...base.round, riichiPot: 2000 },
    };

    // 기준선(증강 없음): 화료 delta에 공탁 2000이 이미 포함된다
    const baseline = createStandardGameFromState({
      ...withPot,
      round: { ...withPot.round },
    });
    runTsumoWin(baseline);
    const baseDelta = lastSettled(baseline).deltas["p0"] ?? 0;

    // 보유자: 리치봉 2개 × 1000 = +2000 보너스가 더 붙는다
    const game = createStandardGameFromState({
      ...withPot,
      round: { ...withPot.round },
    });
    installAugment(game.engine, riichiMarket, "p0");
    runTsumoWin(game);
    const augDelta = lastSettled(game).deltas["p0"] ?? 0;

    expect(augDelta - baseDelta).toBe(2000);
  });

  it("공탁(리치봉)이 없으면 보너스가 없다 — 전역 영향 없음", () => {
    const baseline = createStandardGameFromState(craftTanyaoTsumo());
    runTsumoWin(baseline);
    const baseDelta = lastSettled(baseline).deltas["p0"] ?? 0;

    const game = createStandardGameFromState(craftTanyaoTsumo());
    installAugment(game.engine, riichiMarket, "p1"); // 상대가 보유해도
    runTsumoWin(game);
    const augDelta = lastSettled(game).deltas["p0"] ?? 0;

    expect(augDelta).toBe(baseDelta); // p0에게 아무 영향 없음
  });
});

// ─────────────────────────── noten_insurance ───────────────────────────

describe("noten_insurance (노텐 보험)", () => {
  it("유국 시 보유자는 노텐이어도 벌점을 내지 않는다", () => {
    const state = craft({
      hands: {
        p0: "129m258p369s124z5s", // 노텐 (보유자)
        p1: "234m345p345s678s5s", // 텐파이
        p2: "1289m1289p1289s7z", // 노텐
        p3: "1289m1289p1289s7z", // 노텐
      },
      phase: "turn.draw",
      turnSeat: 0,
    });
    // 패산을 비워 유국 조건을 만든다
    const wall = state.zones[WALL];
    if (wall === undefined) throw new Error("no wall zone");
    const drained: GameState = {
      ...state,
      zones: { ...state.zones, [WALL]: { ...wall, tileIds: [] } },
    };
    const game = createStandardGameFromState(drained);
    installAugment(game.engine, notenInsurance, "p0");

    expect(
      game.engine.rules.resolve<boolean>("draw.notenExempt", { playerId: "p0" }),
    ).toBe(true);
    expect(
      game.engine.rules.resolve<boolean>("draw.notenExempt", { playerId: "p1" }),
    ).toBe(false);

    const r = game.engine.submit({ player: SYS, type: "sys.settleDraw", payload: {} });
    expect(r.ok).toBe(true);
    const scoreOf = (id: PlayerId): number =>
      game.engine.state.players.find((p) => p.id === id)?.score ?? 0;
    expect(scoreOf("p0")).toBe(25000); // 면제 — 벌점 없음
    expect(scoreOf("p1")).toBe(28000); // 텐파이 독식
    expect(scoreOf("p2")).toBe(23500); // 남은 노텐 둘이 3000을 분담
    expect(scoreOf("p3")).toBe(23500);
  });
});

// ─────────────────────────── honba_collector ───────────────────────────

describe("honba_collector (본장 수집가)", () => {
  it("본장 3 국에서 화료하면 +600점 (미보유 대비)", () => {
    const base = craftTanyaoTsumo();
    const withHonba: GameState = { ...base, round: { ...base.round, honba: 3 } };
    const baseline = createStandardGameFromState(structuredClone(withHonba));
    const augmented = createStandardGameFromState(structuredClone(withHonba));
    installAugment(augmented.engine, honbaCollector, "p0");

    runTsumoWin(baseline);
    runTsumoWin(augmented);

    const p0Of = (g: Game): number => g.engine.state.players[0]?.score ?? 0;
    expect(p0Of(augmented) - p0Of(baseline)).toBe(600); // 3본장 × 200
  });

  it("본장 0이면 아무 변화가 없다", () => {
    const base = craftTanyaoTsumo();
    const baseline = createStandardGameFromState(structuredClone(base));
    const augmented = createStandardGameFromState(structuredClone(base));
    installAugment(augmented.engine, honbaCollector, "p0");

    runTsumoWin(baseline);
    runTsumoWin(augmented);

    expect(augmented.engine.state.players[0]?.score).toBe(
      baseline.engine.state.players[0]?.score,
    );
  });
});

// ─────────────────────── 현상금 사냥꾼 계열 (bounty) ───────────────────────

describe("bounty_tanyao (탕야오 전문가)", () => {
  it("탕야오를 포함해 화료하면 본인만 +2500점", () => {
    const base = craftTanyaoTsumo();
    const baseline = createStandardGameFromState(structuredClone(base));
    const augmented = createStandardGameFromState(structuredClone(base));
    installAugment(augmented.engine, bountyTanyao, "p0");

    const before = baseline.engine.state.players[0]?.score ?? 0;
    runTsumoWin(baseline);
    runTsumoWin(augmented);

    const baseGain = (baseline.engine.state.players[0]?.score ?? 0) - before;
    const augGain = (augmented.engine.state.players[0]?.score ?? 0) - before;
    expect(augGain - baseGain).toBe(2500);
  });

  it("상대가 보유해도 나에게는 영향이 없다", () => {
    const base = craftTanyaoTsumo();
    const baseline = createStandardGameFromState(structuredClone(base));
    const augmented = createStandardGameFromState(structuredClone(base));
    installAugment(augmented.engine, bountyTanyao, "p1"); // 상대 보유

    runTsumoWin(baseline);
    runTsumoWin(augmented);
    expect(augmented.engine.state.players[0]?.score).toBe(
      baseline.engine.state.players[0]?.score,
    );
  });
});

// ─────────────────────────── jackpot (일확천금) ───────────────────────────

describe("jackpot (일확천금)", () => {
  it("화료 시 본인의 점수 증감이 정확히 2배가 된다", () => {
    const base = craftTanyaoTsumo();
    const baseline = createStandardGameFromState(structuredClone(base));
    const augmented = createStandardGameFromState(structuredClone(base));
    installAugment(augmented.engine, jackpot, "p0");

    const before = baseline.engine.state.players[0]?.score ?? 0;
    runTsumoWin(baseline);
    runTsumoWin(augmented);

    const baseGain = (baseline.engine.state.players[0]?.score ?? 0) - before;
    const augGain = (augmented.engine.state.players[0]?.score ?? 0) - before;
    expect(baseGain).toBeGreaterThan(0);
    expect(augGain).toBe(baseGain * 2);
  });
});

// ─────────────────────────── big_hand (큰손) ───────────────────────────

describe("big_hand (큰손)", () => {
  it("값싼 손도 최소 만관(자 8000 / 오야 12000)까지 채워져 크게 터진다", () => {
    // 도라를 없애 확실히 만관 미만인 손을 만든다 (탕야오+멘젠쯔모 2판)
    const raw = craftTanyaoTsumo();
    const base: GameState = {
      ...raw,
      round: { ...raw.round, doraIndicators: [] },
    };
    const p0 = base.players.find((p) => p.id === "p0");
    const floor = p0 !== undefined && p0.seat === base.round.dealerSeat ? 12000 : 8000;

    const baseline = createStandardGameFromState(structuredClone(base));
    const augmented = createStandardGameFromState(structuredClone(base));
    installAugment(augmented.engine, bigHand, "p0");

    const before = baseline.engine.state.players[0]?.score ?? 0;
    runTsumoWin(baseline);
    runTsumoWin(augmented);

    const baseGain = (baseline.engine.state.players[0]?.score ?? 0) - before;
    const augGain = (augmented.engine.state.players[0]?.score ?? 0) - before;
    expect(baseGain).toBeLessThan(floor); // 채워지기 전에는 만관 미만
    expect(augGain).toBe(floor); // 정확히 만관 하한까지 채워진다 (공탁·본장 0)
  });
});
