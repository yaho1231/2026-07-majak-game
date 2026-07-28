/**
 * score_bonus 그룹 테스트 — 정산 보정 계열 증강 3종.
 * (promise_next / jackpot / big_hand)
 *
 * 2026-07-22 (48차): 순수 패시브 점수 보너스 증강(극악무도·천천히 꾸준히·
 * 부르는 게 값·리치봉 수집가·노텐 보험·본장 수집가·현상금 계열)이 삭제되면서
 * 해당 테스트도 함께 제거됐다. 판정 근거는 docs/16_AUGMENT_REDESIGN.md §1.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  ROUND_SETTLED,
  SCORE_CHANGED,
  WALL,
  augmentStageKey,
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


// ─────────────────────────── slow_steady ───────────────────────────

// ─────────────────────────── furo_master ───────────────────────────

// ─────────────────────────── riichi_market ───────────────────────────

// ─────────────────────────── noten_insurance ───────────────────────────

// ─────────────────────────── jackpot (일확천금) ───────────────────────────

describe("jackpot (일확천금)", () => {
  // 52차(docs/16 §1b B): 상시 2배 패시브 → 국당 1회 룰렛(2~4배) 액티브.
  // 굴리지 않은 국은 아무 효과가 없다.
  it("룰렛을 굴리지 않은 국은 점수가 그대로다", () => {
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
    expect(augGain).toBe(baseGain);
  });

  it("룰렛을 굴리면 그 국 획득이 뽑힌 배수(2~4)만큼 불어난다", () => {
    const base = craftTanyaoTsumo();
    const baseline = createStandardGameFromState(structuredClone(base));
    const augmented = createStandardGameFromState(structuredClone(base));
    installAugment(augmented.engine, jackpot, "p0");
    augmented.engine.state.players.find((p) => p.id === "p0")?.augments.push("jackpot");

    const roll = augmented.engine.submit({
      player: "p0",
      type: "jackpot_roll",
      payload: {},
    });
    expect(roll.ok).toBe(true);

    const before = baseline.engine.state.players[0]?.score ?? 0;
    runTsumoWin(baseline);
    runTsumoWin(augmented);

    const baseGain = (baseline.engine.state.players[0]?.score ?? 0) - before;
    const augGain = (augmented.engine.state.players[0]?.score ?? 0) - before;
    expect(baseGain).toBeGreaterThan(0);
    // 뽑힌 배수는 시드에 따라 0.5·2·3·4 중 하나 — 정확히 그 배수여야 한다
    // (0.5는 사용자가 지시한 밸런스용 꽝 칸이다)
    const mult = augGain / baseGain;
    expect([0.5, 2, 3, 4]).toContain(mult);
  });
});

// ─────────────────────────── big_hand (큰손) ───────────────────────────

/** 큰손을 이번 국에 선언한 상태로 만든다 (액티브 발동 — 첫 턴 declare_big_hand 대체). */
function withBigHandDeclared(state: GameState, holder: PlayerId): GameState {
  const key = `${state.round.prevalentWind}-${state.round.roundNumber}-${state.round.honba}`;
  return {
    ...state,
    augmentData: { ...state.augmentData, [`big_hand:round:${holder}`]: key },
  };
}

describe("big_hand (큰손)", () => {
  it("값싼 손도 최소 만관(자 8000 / 오야 12000)까지 채워져 크게 터진다", () => {
    // 도라를 없애 확실히 만관 미만인 손을 만든다 (탕야오+멘젠쯔모 2판)
    const raw = craftTanyaoTsumo();
    const base: GameState = withBigHandDeclared(
      { ...raw, round: { ...raw.round, doraIndicators: [] } },
      "p0",
    );
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

  it("선언한 국에 방총해도 지불이 오르지 않는다 — 다운사이드 삭제 (48차 무페널티)", () => {
    const raw = craft({
      hands: { p0: "*", p1: "234m345p345s678s5s", p2: "*", p3: "*" }, // p1 탕야오 5s 대기
      discards: { p0: "5s" }, // p0의 방총패
      phase: "turn.act",
      turnSeat: 0,
    });
    // 도라를 없애 p1 손을 확실히 만관 미만(탕야오 1판)으로 만든다
    // 보유자 p0가 이번 국에 큰손을 선언한 상태로 둔다 (다운사이드 발동 조건)
    const state: GameState = withBigHandDeclared(
      { ...raw, round: { ...raw.round, doraIndicators: [] } },
      "p0",
    );
    const p1 = state.players.find((p) => p.id === "p1");
    const floor =
      p1 !== undefined && p1.seat === state.round.dealerSeat ? 12000 : 8000;

    const ronOf = (g: Game) => {
      const ronTile = g.engine.state.zones[discardsZone("p0")]?.tileIds[0] as TileId;
      const r = g.engine.submit({
        player: SYS,
        type: "sys.settleWin",
        payload: {
          wins: [{ winner: "p1", from: "p0", tileId: ronTile, winType: "ron" }],
        },
      });
      expect(r.ok).toBe(true);
      return lastSettled(g);
    };

    const baseS = ronOf(createStandardGameFromState(structuredClone(state)));
    const aug = createStandardGameFromState(structuredClone(state));
    installAugment(aug.engine, bigHand, "p0");
    const augS = ronOf(aug);

    const basePay = -(baseS.deltas["p0"] ?? 0);
    expect(basePay).toBeGreaterThan(0);
    expect(basePay).toBeLessThan(floor); // 값싼 손(탕야오 1판)이라 만관 미만
    // 예전에는 선언한 국의 방총이 만관까지 올랐다. 이제 정산이 그대로다.
    expect(augS.deltas["p0"]).toBe(baseS.deltas["p0"]);
    expect(augS.deltas["p1"]).toBe(baseS.deltas["p1"]);
  });

  it("선언하지 않은 국에는 만관 하한이 적용되지 않는다 (액티브)", () => {
    // 선언 augmentData를 심지 않으면 값싼 손 그대로 정산된다
    const base: GameState = {
      ...craftTanyaoTsumo(),
      round: { ...craftTanyaoTsumo().round, doraIndicators: [] },
    };
    const p0 = base.players.find((p) => p.id === "p0");
    const floor = p0 !== undefined && p0.seat === base.round.dealerSeat ? 12000 : 8000;

    const augmented = createStandardGameFromState(structuredClone(base));
    installAugment(augmented.engine, bigHand, "p0");
    const before = augmented.engine.state.players[0]?.score ?? 0;
    runTsumoWin(augmented);
    const gain = (augmented.engine.state.players[0]?.score ?? 0) - before;
    expect(gain).toBeGreaterThan(0);
    expect(gain).toBeLessThan(floor); // 미선언 → 만관 미만 그대로
  });

  it("첫 턴에 declare_big_hand가 노출되고 선언하면 플래그가 선다 (2국에 1회)", () => {
    const raw = craftTanyaoTsumo();
    // validate가 player.augments를 확인하므로 보유 목록에 넣어준다
    const withAug: GameState = {
      ...raw,
      players: raw.players.map((p) =>
        p.id === "p0" ? { ...p, augments: ["big_hand"] } : p,
      ),
    };
    const game = createStandardGameFromState(structuredClone(withAug));
    installAugment(game.engine, bigHand, "p0");

    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const opt = status.prompts
      .find((p) => p.player === "p0")
      ?.options.find((o) => o.type === "declare_big_hand");
    expect(opt).toBeDefined();

    flow.submit("p0", opt as NonNullable<typeof opt>);
    const rkey = `${game.engine.state.round.prevalentWind}-${game.engine.state.round.roundNumber}-${game.engine.state.round.honba}`;
    expect(game.engine.state.augmentData["big_hand:round:p0"]).toBe(rkey);
  });
});
