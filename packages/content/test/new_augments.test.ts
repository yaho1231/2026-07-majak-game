/**
 * new_augments — 이번에 추가된 증강들의 핵심 효과 검증.
 * (판 보너스 = winInfo.extraHan / 점수 보너스 = deltas 반영)
 *
 * 크래시·완주 커버리지는 봇 스위프(별도)에서, 여기서는 수치 정확성만 본다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  ROUND_SETTLED,
  createStandardGame,
  createStandardGameFromState,
  evaluateWin,
  installAugment,
} from "@majak/core";
import type { GameState, RoundSettledPayload, TileKind, WinContext } from "@majak/core";
import { craft, h } from "./helpers.js";
import { dealerGrit } from "../src/augments/dealer_grit.js";
import { pickyEater } from "../src/augments/picky_eater.js";
import { finalSpurt } from "../src/augments/final_spurt.js";
import { waitArt } from "../src/augments/wait_art.js";

type Game = ReturnType<typeof createStandardGameFromState>;

function runTsumoWin(game: Game): void {
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  const prompt = status.prompts.find((p) => p.player === "p0");
  const win = prompt?.options.find((o) => o.type === "win");
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

function winInfoP0(game: Game): NonNullable<RoundSettledPayload["winInfos"]>[number] {
  const info = lastSettled(game).winInfos?.find((w) => w.winner === "p0");
  if (info === undefined) throw new Error("no win info for p0");
  return info;
}

/** 만·통·삭 3색을 쓰는 탕야오 쯔모 손 (p0 오야 = seat 0) */
function tanyaoTsumo(): GameState {
  return craft({
    hands: { p0: "234m345p456s678s22s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
}

describe("dealer_grit (오야 근성)", () => {
  it("오야(친)일 때 화료하면 +1판", () => {
    const state = tanyaoTsumo();
    state.round = { ...state.round, dealerSeat: 0 }; // p0(seat 0) = 오야
    const game = createStandardGameFromState(state);
    installAugment(game.engine, dealerGrit, "p0");
    runTsumoWin(game);
    expect(winInfoP0(game).extraHan).toBe(1);
  });

  it("오야가 아니면 효과 없음", () => {
    const state = tanyaoTsumo();
    state.round = { ...state.round, dealerSeat: 1 }; // 오야는 p1
    const game = createStandardGameFromState(state);
    installAugment(game.engine, dealerGrit, "p0");
    runTsumoWin(game);
    expect(winInfoP0(game).extraHan).toBe(0);
  });
});

describe("picky_eater (편식)", () => {
  it("한 수패를 안 쓴 손(통+삭만)으로 화료하면 +1000점", () => {
    const state = craft({
      hands: { p0: "234p567p11p456s789s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = createStandardGameFromState(state);
    installAugment(game.engine, pickyEater, "p0");
    runTsumoWin(game);
    const info = winInfoP0(game);
    expect(lastSettled(game).deltas["p0"]).toBe(info.points + 1000);
  });

  it("만·통·삭 3색을 모두 쓰면 효과 없음", () => {
    const game = createStandardGameFromState(tanyaoTsumo());
    installAugment(game.engine, pickyEater, "p0");
    runTsumoWin(game);
    const info = winInfoP0(game);
    expect(lastSettled(game).deltas["p0"]).toBe(info.points);
  });
});

describe("wait_art (대기의 미학) — 보조 역", () => {
  function evalWith(hand: string, winningTile: TileKind, winType: "tsumo" | "ron") {
    const game = createStandardGame({ seed: 1 });
    installAugment(game.engine, waitArt, "p0", { yaku: game.yaku });
    const ctx: WinContext = {
      hand: h(hand),
      melds: [],
      winningTile,
      winType,
      seatWind: 1,
      prevalentWind: 1,
      riichi: null,
      winnerId: "p0",
    };
    return evaluateWin(ctx, game.yaku);
  }

  it("다른 역(탕야오·쯔모)이 있으면 단기 대기에 +2판이 붙는다", () => {
    // 234m456p345s678s + 55m 단기 쯔모 — 탕야오·멘젠쯔모 성립
    const ev = evalWith("234m456p345s678s55m", { suit: "man", rank: 5 }, "tsumo");
    expect(ev?.ok).toBe(true);
    const waitYaku = ev?.yaku.find((y) => y.id === "wait_art_tanki");
    expect(waitYaku?.han).toBe(2);
  });

  it("다른 역이 없으면 적용되지 않는다 — 이 효과만으로 화료 불가", () => {
    // 123m456p789s222z + 99m 단기 론 — 탕야오 없음(1·9), 쯔모 아님, 역패 아님(남풍)
    const ev = evalWith("123m456p789s222z99m", { suit: "man", rank: 9 }, "ron");
    expect(ev).not.toBeNull();
    expect(ev?.ok).toBe(false); // 역 없음 → 화료 불가
    expect(ev?.yaku).toHaveLength(0); // 보조 역도 목록에 남지 않는다
  });
});

describe("final_spurt (막판 스퍼트)", () => {
  it("패산 20장 이하에서 화료하면 +1판", () => {
    const state = tanyaoTsumo();
    // 패산을 20장으로 줄인다
    const wall = state.zones["wall"]!;
    state.zones = {
      ...state.zones,
      wall: { ...wall, tileIds: wall.tileIds.slice(0, 20) },
    };
    const game = createStandardGameFromState(state);
    installAugment(game.engine, finalSpurt, "p0");
    runTsumoWin(game);
    expect(winInfoP0(game).extraHan).toBe(1);
  });
});
