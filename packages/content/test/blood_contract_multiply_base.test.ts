/**
 * 핏빛 계약 × 같은 Multiply 단계의 다른 배수 증강 — 밑값 회귀 가드.
 *
 * 배경(QA verify-score 확정 1, 2026-08-20): blood_contract의 detail은 "배수가 걸리는
 * 것은 **손의 화료점뿐**"이라고 적어 두고, 구현은 `deltas[holder]`(공탁·본장만 제외)를
 * 밑값으로 삼았다. 같은 `SETTLE_STAGE.Multiply`의 let_it_ride·jackpot이 먼저 돌아
 * 델타를 부풀려 놓으면 그 부풀린 몫 전체에 1.5배가 걸렸다 —
 * 손 8,000 · 연승 4배에서 계약이 얹는 몫이 기대 +4,000이 아니라 **+16,000**이었다.
 *
 * 연쇄 자체는 설계다(settleStages.ts가 셋을 같은 단계에 둔다). 어긋난 것은 밑값 규약
 * 하나뿐이라, let_it_ride(let_it_ride.ts의 `winInfos[].points` 밑값)와 같게 맞췄다.
 */

import { describe, expect, it } from "vitest";
import {
  ROUND_SETTLED,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  PlayerId,
  RoundSettledPayload,
  WinInfo,
} from "@majak/core";
import { craft } from "./helpers.js";
import { bloodContract } from "../src/augments/blood_contract.js";
import { jackpot } from "../src/augments/jackpot.js";
import { letItRide } from "../src/augments/let_it_ride.js";
import { roundScopedKey } from "../src/augments/roundScope.js";

type Game = ReturnType<typeof createStandardGameFromState>;

const HAND = 8000;

const BASE = craft({
  hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
  phase: "turn.act",
  turnSeat: 0,
  drawnLastFor: "p0",
});

interface Opts {
  /** 일확천금 배수 */
  readonly mult?: number;
  /** 판돈 굴리기 연승 카운터 (3 → 4배) */
  readonly streak?: number;
  /** 계약 적중 여부 (true면 탕야오를 걸고 탕야오로 화료) */
  readonly contract?: boolean;
  readonly pot?: number;
  readonly honba?: number;
}

function scene(opts: Opts): Game {
  const defs: AugmentDef[] = [
    ...(opts.mult !== undefined ? [jackpot] : []),
    ...(opts.streak !== undefined ? [letItRide] : []),
    ...(opts.contract === true ? [bloodContract] : []),
  ];
  const data: Record<string, unknown> = {};
  if (opts.mult !== undefined) {
    data[roundScopedKey("jackpot", "mult", BASE, "p0")] = opts.mult;
  }
  if (opts.streak !== undefined) data["let_it_ride:streak:p0"] = opts.streak;
  if (opts.contract === true) {
    data[roundScopedKey("blood_contract", "yaku", BASE, "p0")] = "tanyao";
  }
  const state: GameState = {
    ...BASE,
    players: BASE.players.map((p) =>
      p.id === "p0" ? { ...p, augments: defs.map((d) => d.id) } : p,
    ),
    round: { ...BASE.round, riichiPot: opts.pot ?? 0 },
    augmentData: { ...BASE.augmentData, ...data },
  };
  const game = createStandardGameFromState(state, undefined, defs);
  for (const d of defs) installAugment(game.engine, d, "p0", { yaku: game.yaku });
  return game;
}

/** 화료 정산 payload를 인터셉터 체인에 흘린다 (엔진과 같은 모양: riichiPot=0) */
function settle(game: Game, opts: Opts): RoundSettledPayload {
  const pot = opts.pot ?? 0;
  const honba = opts.honba ?? 0;
  const winInfo = {
    winner: "p0" as PlayerId,
    from: "p2" as PlayerId,
    winType: "ron",
    points: HAND,
    han: 4,
    fu: 40,
    yakumanCount: 0,
    limit: null,
    yaku: [{ id: "tanyao", name: "탕야오", han: 1 }],
    riichiPotGain: pot,
    honbaBonus: honba,
  } as unknown as WinInfo;
  let out: RoundSettledPayload = {
    outcome: "win",
    deltas: { p0: HAND + pot + honba, p1: 0, p2: -(HAND + honba), p3: 0 },
    dealerSeat: game.engine.state.round.dealerSeat,
    honba: 0,
    riichiPot: 0,
    roundNumber: game.engine.state.round.roundNumber,
    prevalentWind: game.engine.state.round.prevalentWind,
    winInfos: [winInfo],
  } as RoundSettledPayload;
  for (const { intercept } of game.engine.effects.interceptorsFor(ROUND_SETTLED)) {
    const r = intercept(
      { type: ROUND_SETTLED, payload: out },
      { state: game.engine.state, rules: game.engine.rules },
    );
    if (r !== null) out = r.payload as RoundSettledPayload;
  }
  return out;
}

const run = (opts: Opts): RoundSettledPayload => settle(scene(opts), opts);

const noteOf = (p: RoundSettledPayload, augId: string): number =>
  (p.augPoints ?? [])
    .filter((a) => a.player === "p0" && a.augId === augId)
    .reduce((s, a) => s + a.points, 0);

describe("핏빛 계약 — 배수의 밑값은 언제나 손의 화료점", () => {
  it("단독이면 손 8,000의 0.5배인 +4,000을 얹는다", () => {
    const out = run({ contract: true });
    expect(out.deltas["p0"]).toBe(12000);
    expect(noteOf(out, "blood_contract")).toBe(4000);
  });

  it("판돈 굴리기(4배)가 먼저 부풀려도 계약 몫은 +4,000 그대로다", () => {
    const out = run({ streak: 3, contract: true });
    expect(noteOf(out, "let_it_ride")).toBe(24000);
    // ★ 회귀 지점: 예전에는 32,000 전체에 1.5배가 걸려 +16,000이었다(합계 48,000).
    expect(noteOf(out, "blood_contract")).toBe(4000);
    expect(out.deltas["p0"]).toBe(36000);
  });

  it("일확천금(3배)이 먼저 부풀려도 계약 몫은 +4,000 그대로다", () => {
    const out = run({ mult: 3, contract: true });
    expect(noteOf(out, "jackpot")).toBe(16000);
    // ★ 예전에는 24,000 전체에 1.5배 → +12,000(합계 36,000).
    expect(noteOf(out, "blood_contract")).toBe(4000);
    expect(out.deltas["p0"]).toBe(28000);
  });

  it("셋이 겹치고 공탁·본장이 섞여도 계약 몫은 +4,000이고 공탁·본장은 배수 밖이다", () => {
    const opts: Opts = { mult: 3, streak: 3, contract: true, pot: 3000, honba: 900 };
    const out = run(opts);
    expect(noteOf(out, "blood_contract")).toBe(4000);
    // 공탁 3,000 + 본장 900은 어느 배수에도 닿지 않는다 —
    // 최종 델타에서 배수 몫을 빼면 원래 수령액이 정확히 남는다.
    const bonus =
      noteOf(out, "let_it_ride") + noteOf(out, "jackpot") + noteOf(out, "blood_contract");
    expect((out.deltas["p0"] ?? 0) - bonus).toBe(HAND + 3000 + 900);
  });

  it("계약을 못 지키면(배수 1배) 아무것도 얹지 않는다 — 앞 단계 몫도 건드리지 않는다", () => {
    // 계약은 탕야오인데 화료 역에 탕야오가 없는 경우를 흉내내기 위해
    // 계약 없이 판돈 굴리기만 돌린 값과 비교한다.
    const withoutContract = run({ streak: 3 });
    expect(withoutContract.deltas["p0"]).toBe(32000);
    expect(noteOf(withoutContract, "blood_contract")).toBe(0);
  });
});
