/**
 * buff_52_b — 52차 "발동 순간이 없는 순수 배율·패시브" 그룹(⑤B) 버프 검증.
 *
 * 대상 8종: jackpot · late_bloomer · late_bloomer_east · eternal_dealer ·
 *           devils_advance · karma · riichi_upgrade · red_five_touch
 * 판정 근거: docs/16_AUGMENT_REDESIGN.md §1b B 표.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  ROUND_SETTLED,
  createStandardGame,
  createStandardGameFromState,
  discardsZone,
  handZone,
  installAugment,
  isNumberSuit,
} from "@majak/core";
import type {
  ActionOption,
  AugmentDef,
  GameState,
  PlayerId,
  RoundSettledPayload,
  TileId,
} from "@majak/core";
import { craft } from "./helpers.js";

import { jackpot } from "../src/augments/jackpot.js";
import { lateBloomer } from "../src/augments/late_bloomer.js";
import { lateBloomerEast } from "../src/augments/late_bloomer_east.js";
import { eternalDealer } from "../src/augments/eternal_dealer.js";
import { devilsAdvance } from "../src/augments/devils_advance.js";
import { karma } from "../src/augments/karma.js";
import { riichiUpgrade } from "../src/augments/riichi_upgrade.js";
import { redFiveTouch } from "../src/augments/red_five_touch.js";

const SYS = "__system";

type Game = ReturnType<typeof createStandardGameFromState>;

// ─────────────────────────── 공용 하네스 ───────────────────────────

/** 보유 검사(player.augments)가 있는 증강용 — 상태에 보유를 직접 심는다 */
function withAugment(
  state: GameState,
  player: PlayerId,
  id: string,
): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...p.augments, id] } : p,
    ),
  };
}

function withAugmentData(
  state: GameState,
  entries: Record<string, unknown>,
): GameState {
  return { ...state, augmentData: { ...state.augmentData, ...entries } };
}

/** 탕야오 멘젠쯔모가 가능한 p0 화료 직전 상태 (234m345p456s678s + 2s 단기) */
function craftTanyaoTsumo(): GameState {
  return craft({
    hands: { p0: "234m345p456s678s22s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
}

/** 청일색 멘젠쯔모 — 만관 이상(limit !== null)이 확실한 p0 화료 직전 상태 */
function craftBigTsumo(): GameState {
  return craft({
    hands: { p0: "234m345m456m678m22m", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
}

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

/** p0 턴에 뜨는 옵션 목록 */
function turnOptions(game: Game): ActionOption[] {
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  return status.prompts.find((p) => p.player === "p0")?.options ?? [];
}

const roundKeyOf = (s: GameState): string =>
  `${s.round.prevalentWind}-${s.round.roundNumber}-${s.round.honba}`;

// ─────────────────────────── jackpot (일확천금) ───────────────────────────

describe("jackpot (일확천금) — 룰렛을 돌린 국만 배수가 붙는다", () => {
  function setup(): Game {
    const base = withAugment(craftTanyaoTsumo(), "p0", "jackpot");
    const game = createStandardGameFromState(structuredClone(base));
    installAugment(game.engine, jackpot, "p0");
    return game;
  }

  it("자기 턴에 룰렛을 돌리면 2·3·4 중 하나가 확정되고 전원에게 공개된다", () => {
    const game = setup();
    const before = game.engine.state.prngState;
    const r = game.engine.submit({
      player: "p0",
      type: "jackpot_roll",
      payload: {},
    });
    expect(r.ok).toBe(true);

    const s = game.engine.state;
    const mult = s.augmentData[`jackpot:mult:${roundKeyOf(s)}:p0#round`];
    expect([0.5, 2, 3, 4]).toContain(mult);
    expect(s.augmentData["view:*:jackpot:p0#round"]).toBe(`${String(mult)}배`);
    // 난수를 소비했으면 전진된 상태가 되돌려져 있어야 한다 (결정론)
    expect(s.prngState).not.toBe(before);
  });

  it("국당 1회 — 두 번째 발동은 거부된다", () => {
    const game = setup();
    expect(
      game.engine.submit({ player: "p0", type: "jackpot_roll", payload: {} }).ok,
    ).toBe(true);
    expect(
      game.engine.submit({ player: "p0", type: "jackpot_roll", payload: {} }).ok,
    ).toBe(false);
  });

  it("굴리지 않은 국은 배수가 붙지 않는다 (기존 상시 2배 삭제)", () => {
    const base = withAugment(craftTanyaoTsumo(), "p0", "jackpot");
    const baseline = createStandardGameFromState(structuredClone(base));
    const augmented = createStandardGameFromState(structuredClone(base));
    installAugment(augmented.engine, jackpot, "p0");

    runTsumoWin(baseline);
    runTsumoWin(augmented);
    expect(lastSettled(augmented).deltas["p0"]).toBe(
      lastSettled(baseline).deltas["p0"],
    );
  });

  it("굴린 국의 획득 점수는 뽑힌 배수만큼 곱해진다", () => {
    const base = withAugment(craftTanyaoTsumo(), "p0", "jackpot");
    const baseline = createStandardGameFromState(structuredClone(base));
    runTsumoWin(baseline);
    const baseGain = lastSettled(baseline).deltas["p0"] ?? 0;
    expect(baseGain).toBeGreaterThan(0);

    const game = createStandardGameFromState(structuredClone(base));
    installAugment(game.engine, jackpot, "p0");
    game.engine.submit({ player: "p0", type: "jackpot_roll", payload: {} });
    const s = game.engine.state;
    const mult = s.augmentData[`jackpot:mult:${roundKeyOf(s)}:p0#round`] as number;
    runTsumoWin(game);
    expect(lastSettled(game).deltas["p0"]).toBe(baseGain * mult);
  });
});

// ─────────────────────────── late_bloomer (대기만성) ───────────────────────────

/** 장·국번을 갈아끼운다 */
function atRound(state: GameState, wind: number, num: number): GameState {
  return {
    ...state,
    round: { ...state.round, prevalentWind: wind, roundNumber: num },
  };
}

function bloomGame(
  aug: AugmentDef,
  wind: number,
  num: number,
): Game {
  const base = withAugment(atRound(craftTanyaoTsumo(), wind, num), "p0", aug.id);
  const game = createStandardGameFromState(structuredClone(base));
  installAugment(game.engine, aug, "p0");
  return game;
}

function rulesAt(game: Game, player: PlayerId): {
  yaku: boolean;
  furiten: boolean;
} {
  const state = game.engine.state;
  return {
    yaku: game.engine.rules.resolve<boolean>("win.requiresYaku", {
      playerId: player,
      state,
    }),
    furiten: game.engine.rules.resolve<boolean>("win.furiten.enabled", {
      playerId: player,
      state,
    }),
  };
}

describe("late_bloomer (대기만성 · 반장전) — 배율 대신 규칙 두 개", () => {
  // 만개 시점은 2026-08-25 반장전 QA에서 남4국 → **남3국**으로 앞당겼다 —
  // 동풍전판이 판의 25%를 만개 구간으로 갖는 것과 비중을 맞추기 위해서다(8국 중 2국).
  it("남2국까지는 표준 규칙 그대로", () => {
    const g = bloomGame(lateBloomer, 2, 2); // 남2국
    expect(rulesAt(g, "p0")).toEqual({ yaku: true, furiten: true });
  });

  it("남3국부터 후리텐 무시 + 무형화료를 얻는다", () => {
    const g = bloomGame(lateBloomer, 2, 3);
    expect(rulesAt(g, "p0")).toEqual({ yaku: false, furiten: false });
  });

  it("남4국에도 만개가 유지된다", () => {
    const g = bloomGame(lateBloomer, 2, 4);
    expect(rulesAt(g, "p0")).toEqual({ yaku: false, furiten: false });
    // 상대에게는 아무 영향이 없다
    expect(rulesAt(g, "p1")).toEqual({ yaku: true, furiten: true });
  });

  it("서입(장≥3)에도 만개가 유지된다", () => {
    const g = bloomGame(lateBloomer, 3, 1);
    expect(rulesAt(g, "p0")).toEqual({ yaku: false, furiten: false });
  });

  it("만개 국이 시작되면 전원 공개 뷰에 '만개'가 실린다", () => {
    // 남4국에서 국이 시작되는 상황 (아직 배패 전)
    const fresh = createStandardGame({ seed: 7 }).engine.state;
    const game = createStandardGameFromState(
      withAugment(atRound(fresh, 2, 4), "p0", "late_bloomer"),
    );
    installAugment(game.engine, lateBloomer, "p0", { yaku: game.yaku });
    new FlowController(game.engine).begin();
    expect(game.engine.state.augmentData["view:*:late_bloomer:p0"]).toBe("만개");
  });

  it("획득 점수 3배는 사라지고, 만개 후 화료에 +3판이 붙는다", () => {
    const base = withAugment(
      atRound(craftTanyaoTsumo(), 2, 4),
      "p0",
      "late_bloomer",
    );
    const baseline = createStandardGameFromState(structuredClone(base));
    const augmented = createStandardGameFromState(structuredClone(base));
    installAugment(augmented.engine, lateBloomer, "p0");
    runTsumoWin(baseline);
    runTsumoWin(augmented);
    const baseGain = lastSettled(baseline).deltas["p0"] ?? 0;
    const augGain = lastSettled(augmented).deltas["p0"] ?? 0;
    expect(baseGain).toBeGreaterThan(0);
    expect(augGain).toBeGreaterThan(baseGain); // 배율이 아니라 +3판 환산분
  });
});

describe("late_bloomer_east (대기만성 · 동풍전)", () => {
  it("동3국에는 아직, 동4국부터 만개한다", () => {
    expect(rulesAt(bloomGame(lateBloomerEast, 1, 3), "p0")).toEqual({
      yaku: true,
      furiten: true,
    });
    expect(rulesAt(bloomGame(lateBloomerEast, 1, 4), "p0")).toEqual({
      yaku: false,
      furiten: false,
    });
  });

  it("남입(장≥2)에도 만개가 유지된다", () => {
    expect(rulesAt(bloomGame(lateBloomerEast, 2, 1), "p0")).toEqual({
      yaku: false,
      furiten: false,
    });
  });
});

// ─────────────────────────── eternal_dealer (만년 오야) ───────────────────────────

/**
 * p0가 오야가 아닌 판 (오야 = seat 1).
 * 로테이션 기준 자리도 함께 옮긴다 — 오야가 자리 1이라는 것은 "동2국"이지
 * "오야를 빼앗긴 동1국"이 아니다. 기준을 0에 둔 채로 두면 다음 오야가 다시 자리 1이 된다.
 */
function craftNonDealerWin(): GameState {
  const s = craftTanyaoTsumo();
  return { ...s, round: { ...s.round, dealerSeat: 1, rotationSeat: 1 } };
}

/** 동 커쯔가 든 p0 멘젠쯔모 직전 상태 (111z + 234m + 345p + 456s + 22s 단기) */
function craftEastTripletTsumo(): GameState {
  const s = craft({
    hands: { p0: "111z234m345p456s22s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  // p0를 오야가 아닌 자리로 — 자풍이 동이 아니어야 추가 역패가 의미를 갖는다
  return { ...s, round: { ...s.round, dealerSeat: 1, rotationSeat: 1 } };
}

describe("eternal_dealer (만년 오야) — 역패 동 추가 + 연장 (동풍전 3·반장전 5회)", () => {
  /**
   * 2026-08-15 사용자 지시: 자풍 **교체**(`scoring.seatWind` = 1)를 걷어내고 역패 동을
   * **추가**한다. 교체 시절에는 남가가 南 커쯔를 모아도 값이 0이라, 얻는 것 하나에
   * 잃는 것 하나가 딸려 왔다.
   */
  it("자풍은 실제 자리 그대로다 — 덮어쓰지 않는다", () => {
    const base = withAugment(craftNonDealerWin(), "p0", "eternal_dealer");
    const game = createStandardGameFromState(structuredClone(base));
    installAugment(game.engine, eternalDealer, "p0", { yaku: game.yaku });
    const state = game.engine.state;
    for (const id of ["p0", "p1"]) {
      expect(
        game.engine.rules.resolve<number | null>("scoring.seatWind", {
          playerId: id,
          state,
        }),
      ).toBe(null);
    }
  });

  it("자풍이 동이 아니어도 동 커쯔에 역패 1판이 더 붙는다", () => {
    const base = withAugment(craftEastTripletTsumo(), "p0", "eternal_dealer");

    const baseline = createStandardGameFromState(structuredClone(base));
    runTsumoWin(baseline);
    const b = lastSettled(baseline).winInfos?.[0];
    expect(b?.yaku.map((y) => y.name)).not.toContain("역패 동");

    const game = createStandardGameFromState(structuredClone(base));
    installAugment(game.engine, eternalDealer, "p0", { yaku: game.yaku });
    runTsumoWin(game);
    const a = lastSettled(game).winInfos?.[0];
    expect(a?.yaku.map((y) => y.name)).toContain("역패 동");
    // 장풍 동(동장)과 겹쳐 더블동이 된다 — 정확히 1판만 늘어난다
    expect(a?.han).toBe((b?.han ?? 0) + 1);
  });

  it("자풍이 이미 동인 동가에게는 두 번 주지 않는다", () => {
    // dealerSeat = 0 → p0의 자풍이 동이라 표준 자풍패가 이미 1판을 준다
    const base = withAugment(
      craft({
        hands: { p0: "111z234m345p456s22s", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      "p0",
      "eternal_dealer",
    );
    const baseline = createStandardGameFromState(structuredClone(base));
    runTsumoWin(baseline);
    const b = lastSettled(baseline).winInfos?.[0];

    const game = createStandardGameFromState(structuredClone(base));
    installAugment(game.engine, eternalDealer, "p0", { yaku: game.yaku });
    runTsumoWin(game);
    const a = lastSettled(game).winInfos?.[0];
    expect(a?.yaku.map((y) => y.name)).not.toContain("역패 동");
    expect(a?.han).toBe(b?.han);
  });

  it("오야가 아닌데 화료하면 오야 자리를 자기 자리로 가져오고 횟수가 1 소모된다", () => {
    const base = withAugment(craftNonDealerWin(), "p0", "eternal_dealer");
    const baseline = createStandardGameFromState(structuredClone(base));
    runTsumoWin(baseline);
    expect(lastSettled(baseline).dealerSeat).not.toBe(1); // 원래는 오야가 넘어간다

    const game = createStandardGameFromState(structuredClone(base));
    installAugment(game.engine, eternalDealer, "p0");
    runTsumoWin(game);
    // 2026-07-29 감사: 예전에는 옛 오야 자리(1)가 그대로 유지되어, 보유자가 자기 횟수를
    // 태워 **남의 오야를 늘려 주는** 결과였다. 이제 보유자 자리로 옮겨 온다.
    const holderSeat = game.engine.state.players.find((pl) => pl.id === "p0")?.seat;
    expect(lastSettled(game).dealerSeat).toBe(holderSeat);
    expect(game.engine.state.augmentData["eternal_dealer:keeps:p0"]).toBe(1);
    // 시나리오는 판을 안 정했으니 반장전 = 예산 5회 (2026-08-23: 반장전 몫 1.5배)
    expect(game.engine.state.augmentData["view:*:eternal_dealer:p0"]).toBe(
      "연장 (남은 4회)",
    );
  });

  it("매치 예산(반장전 5회)을 다 쓰면 더는 연장되지 않는다 (무한 국 방지)", () => {
    const base = withAugmentData(
      withAugment(craftNonDealerWin(), "p0", "eternal_dealer"),
      { "eternal_dealer:keeps:p0": 5 },
    );
    const game = createStandardGameFromState(structuredClone(base));
    installAugment(game.engine, eternalDealer, "p0");
    expect(
      game.engine.rules.resolve<boolean>("round.keepDealer", {
        playerId: "p0",
        state: game.engine.state,
      }),
    ).toBe(false);
    runTsumoWin(game);
    expect(lastSettled(game).dealerSeat).not.toBe(1);
    expect(game.engine.state.augmentData["eternal_dealer:keeps:p0"]).toBe(5);
  });

  it("오야 취급 채점(win.treatAsDealer)은 그대로 유지된다", () => {
    const base = withAugment(craftNonDealerWin(), "p0", "eternal_dealer");
    const game = createStandardGameFromState(structuredClone(base));
    installAugment(game.engine, eternalDealer, "p0");
    expect(
      game.engine.rules.resolve<boolean>("win.treatAsDealer", {
        playerId: "p0",
        state: game.engine.state,
      }),
    ).toBe(true);
  });
});

// ─────────────────────────── devils_advance (가불 인생) ───────────────────────────

describe("devils_advance (가불 인생) — 빚이 보이고, 만관에 터진다", () => {
  it("첫 국에 +10000과 함께 '가불 10000'이 전원에게 공개된다", () => {
    const game = createStandardGame({ seed: 3, extraAugments: [devilsAdvance] });
    game.engine.state.players.find((p) => p.id === "p0")?.augments.push(
      "devils_advance",
    );
    installAugment(game.engine, devilsAdvance, "p0", { yaku: game.yaku });
    new FlowController(game.engine).begin();
    expect(game.engine.state.players.find((p) => p.id === "p0")?.score).toBe(
      35000,
    );
    expect(game.engine.state.augmentData["view:*:devils_advance:p0"]).toBe(
      "가불 10000",
    );
  });

  /**
   * 2026-08-15 사용자 지시: 걷은 9000점은 **빚을 갚는 돈**이라 뱅크로 간다.
   * 예전에는 보유자가 +9000을 함께 받아(제로섬) 만관 한 방이 두 배로 커졌다.
   */
  it("만관 이상 화료 순간 상대 셋만 3000점씩 낸다 — 내 점수는 그대로다", () => {
    const base = withAugment(craftBigTsumo(), "p0", "devils_advance");
    const baseline = createStandardGameFromState(structuredClone(base));
    runTsumoWin(baseline);
    const b = lastSettled(baseline);
    expect(b.winInfos?.[0]?.limit).not.toBe(null); // 만관 이상인지 확인

    const game = createStandardGameFromState(structuredClone(base));
    installAugment(game.engine, devilsAdvance, "p0");
    runTsumoWin(game);
    const a = lastSettled(game);
    expect(a.deltas["p0"]).toBe(b.deltas["p0"] ?? 0);
    for (const id of ["p1", "p2", "p3"]) {
      expect(a.deltas[id]).toBe((b.deltas[id] ?? 0) - 3000);
    }
    // 걷은 9000은 뱅크로 빠진다 — 총합이 그만큼 줄어든다
    const sum = (d: Record<string, number>): number =>
      Object.values(d).reduce((x, y) => x + y, 0);
    expect(sum(a.deltas)).toBe(sum(b.deltas) - 9000);
    expect(game.engine.state.augmentData["devils_advance:exempt:p0"]).toBe(true);
    expect(game.engine.state.augmentData["view:*:devils_advance:p0"]).toBe(
      "청산",
    );
  });

  it("게임당 1회 — 이미 터졌으면 다시 터지지 않는다", () => {
    const base = withAugmentData(
      withAugment(craftBigTsumo(), "p0", "devils_advance"),
      { "devils_advance:exempt:p0": true },
    );
    const baseline = createStandardGameFromState(structuredClone(base));
    runTsumoWin(baseline);
    const game = createStandardGameFromState(structuredClone(base));
    installAugment(game.engine, devilsAdvance, "p0");
    runTsumoWin(game);
    expect(lastSettled(game).deltas["p1"]).toBe(
      lastSettled(baseline).deltas["p1"],
    );
  });

  it("만관 미만 화료로는 터지지 않는다", () => {
    // 도라를 없애 확실히 만관 미만(탕야오+멘젠쯔모)인 손으로 만든다
    const raw = craftTanyaoTsumo();
    const base = withAugment(
      { ...raw, round: { ...raw.round, doraIndicators: [] } },
      "p0",
      "devils_advance",
    );
    const baseline = createStandardGameFromState(structuredClone(base));
    runTsumoWin(baseline);
    expect(lastSettled(baseline).winInfos?.[0]?.limit).toBe(null);

    const game = createStandardGameFromState(structuredClone(base));
    installAugment(game.engine, devilsAdvance, "p0");
    runTsumoWin(game);
    expect(lastSettled(game).deltas["p1"]).toBe(
      lastSettled(baseline).deltas["p1"],
    );
  });
});

// ─────────────────────────── karma (카르마) ───────────────────────────

describe("karma (카르마) — 즉시 적립, 즉시 강탈", () => {
  it("방총으로 잃으면 그 액수가 업보 게이지로 즉시 쌓이고 전원에게 보인다", () => {
    const raw = craft({
      hands: { p0: "*", p1: "234m345p345s678s5s", p2: "*", p3: "*" },
      discards: { p0: "5s" },
      phase: "turn.act",
      turnSeat: 0,
    });
    const base = withAugment(raw, "p0", "karma");
    const game = createStandardGameFromState(structuredClone(base));
    installAugment(game.engine, karma, "p0");
    const ronTile = game.engine.state.zones[discardsZone("p0")]
      ?.tileIds[0] as TileId;
    const r = game.engine.submit({
      player: SYS,
      type: "sys.settleWin",
      payload: {
        wins: [{ winner: "p1", from: "p0", tileId: ronTile, winType: "ron" }],
      },
    });
    expect(r.ok).toBe(true);
    const loss = -(lastSettled(game).deltas["p0"] ?? 0);
    expect(loss).toBeGreaterThan(0);
    expect(game.engine.state.augmentData["karma:gauge:p0"]).toBe(loss);
    expect(game.engine.state.augmentData["view:*:karma:p0"]).toBe(loss);
  });

  it("게이지 8000 미만이면 발동할 수 없다", () => {
    const base = withAugmentData(withAugment(craftTanyaoTsumo(), "p0", "karma"), {
      "karma:gauge:p0": 5000,
    });
    const game = createStandardGameFromState(structuredClone(base));
    installAugment(game.engine, karma, "p0");
    expect(
      game.engine.submit({ player: "p0", type: "karma_burn", payload: {} }).ok,
    ).toBe(false);
    // 후보로도 뜨지 않는다
    expect(turnOptions(game).some((o) => o.type === "karma_burn")).toBe(false);
  });

  it("게이지를 태우면 상대 셋에게서 균등하게 즉시 강탈한다 (제로섬)", () => {
    const base = withAugmentData(withAugment(craftTanyaoTsumo(), "p0", "karma"), {
      "karma:gauge:p0": 9000,
    });
    const game = createStandardGameFromState(structuredClone(base));
    installAugment(game.engine, karma, "p0");
    const before = Object.fromEntries(
      game.engine.state.players.map((p) => [p.id, p.score]),
    );
    expect(turnOptions(game).some((o) => o.type === "karma_burn")).toBe(true);
    expect(
      game.engine.submit({ player: "p0", type: "karma_burn", payload: {} }).ok,
    ).toBe(true);

    const after = game.engine.state.players;
    expect((after.find((p) => p.id === "p0")?.score ?? 0) - before["p0"]!).toBe(
      9000,
    );
    for (const id of ["p1", "p2", "p3"]) {
      expect((after.find((p) => p.id === id)?.score ?? 0) - before[id]!).toBe(
        -3000,
      );
    }
    // 태우면 게이지는 0
    expect(game.engine.state.augmentData["karma:gauge:p0"]).toBe(0);
    expect(game.engine.state.augmentData["view:*:karma:p0"]).toBe(0);
  });

  it("강탈액은 100점 단위로 떨어진다 (3으로 안 나눠떨어져도)", () => {
    const base = withAugmentData(withAugment(craftTanyaoTsumo(), "p0", "karma"), {
      "karma:gauge:p0": 9100,
    });
    const game = createStandardGameFromState(structuredClone(base));
    installAugment(game.engine, karma, "p0");
    const before = Object.fromEntries(
      game.engine.state.players.map((p) => [p.id, p.score]),
    );
    expect(
      game.engine.submit({ player: "p0", type: "karma_burn", payload: {} }).ok,
    ).toBe(true);

    const after = game.engine.state.players;
    // 9,100 / 3 = 3,033.3… → 1인당 3,000 (100점 단위 내림), 내가 받는 건 그 합계 9,000
    for (const id of ["p1", "p2", "p3"]) {
      expect((after.find((p) => p.id === id)?.score ?? 0) - before[id]!).toBe(
        -3000,
      );
    }
    expect((after.find((p) => p.id === "p0")?.score ?? 0) - before["p0"]!).toBe(
      9000,
    );
  });

  it("지연 환급(오라스 전액 환급)은 사라졌다 — 최종국 화료에 보너스가 없다", () => {
    const raw = atRound(craftTanyaoTsumo(), 2, 4); // 오라스
    const base = withAugmentData(withAugment(raw, "p0", "karma"), {
      "karma:gauge:p0": 12000,
    });
    const baseline = createStandardGameFromState(structuredClone(base));
    const augmented = createStandardGameFromState(structuredClone(base));
    installAugment(augmented.engine, karma, "p0");
    runTsumoWin(baseline);
    runTsumoWin(augmented);
    expect(lastSettled(augmented).deltas["p0"]).toBe(
      lastSettled(baseline).deltas["p0"],
    );
  });
});

// ─────────────────────────── riichi_upgrade (이중 선언) ───────────────────────────

describe("riichi_upgrade (이중 선언) — 더블리치 + 하가 리치 봉인", () => {
  function riichiSetup(): Game {
    const raw = craft({
      hands: { p0: "234m345p456s678s25s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const base = withAugment(raw, "p0", "riichi_upgrade");
    const game = createStandardGameFromState(structuredClone(base));
    installAugment(game.engine, riichiUpgrade, "p0");
    return game;
  }

  it("리치를 선언하면 더블리치가 되고 하가(p1)의 리치가 그 국 동안 봉인된다", () => {
    const game = riichiSetup();
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const opt = status.prompts
      .find((p) => p.player === "p0")
      ?.options.find((o) => o.type === "riichi");
    expect(opt).toBeDefined();
    flow.submit("p0", opt as ActionOption);

    const state = game.engine.state;
    expect(state.round.byPlayer["p0"]?.riichi?.double).toBe(true);
    expect(
      state.augmentData[`riichi_upgrade:seal:${roundKeyOf(state)}:p0#round`],
    ).toBe("p1");
    expect(state.augmentData["view:*:riichi_upgrade:p0"]).toBe("p1");

    // 봉인 대상만 리치가 잠긴다
    const blocked = (id: PlayerId): boolean =>
      game.engine.rules.resolve<boolean>("riichi.blocked", {
        playerId: id,
        state: game.engine.state,
      });
    expect(blocked("p1")).toBe(true);
    expect(blocked("p2")).toBe(false);
    expect(blocked("p3")).toBe(false);
    expect(blocked("p0")).toBe(false);
  });

  it("리치를 선언하지 않았으면 아무도 봉인되지 않는다", () => {
    const game = riichiSetup();
    expect(
      game.engine.rules.resolve<boolean>("riichi.blocked", {
        playerId: "p1",
        state: game.engine.state,
      }),
    ).toBe(false);
  });
});

// ─────────────────────────── red_five_touch (붉은 손길) ───────────────────────────

describe("red_five_touch (붉은 손길) — 아무 숫자나 지정한다", () => {
  function touchSetup(): Game {
    const raw = craft({
      // 3만·3통·3삭 + 5삭 등 — 지정 대상 후보가 여럿
      hands: { p0: "333m345p456s678s22s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const base = withAugment(raw, "p0", "red_five_touch");
    const game = createStandardGameFromState(structuredClone(base));
    installAugment(game.engine, redFiveTouch, "p0");
    return game;
  }

  /** 손패 안의 (랭크 → 장수) */
  function handRankCounts(game: Game): Map<number, number> {
    const out = new Map<number, number>();
    for (const id of game.engine.state.zones[handZone("p0")]?.tileIds ?? []) {
      const kind = game.engine.state.tiles[id]?.kind;
      if (kind === undefined || !isNumberSuit(kind)) continue;
      out.set(kind.rank, (out.get(kind.rank) ?? 0) + 1);
    }
    return out;
  }

  it("후보는 손패에 실제로 있는 랭크만 나온다", () => {
    const game = touchSetup();
    const ranks = turnOptions(game)
      .filter((o) => o.type === "red_touch")
      .map((o) => (o.payload as { rank: number }).rank);
    const inHand = [...handRankCounts(game).keys()].sort((a, b) => a - b);
    expect(ranks).toEqual(inHand);
    expect(ranks.length).toBeGreaterThan(1); // 5 고정이 아니다
  });

  it("지정한 숫자의 패가 전부 적도라가 된다 (5가 아니어도)", () => {
    const game = touchSetup();
    const count3 = handRankCounts(game).get(3) ?? 0;
    expect(count3).toBeGreaterThan(0);

    /** 손패의 (랭크 3인 적도라 수, 랭크 3이 아닌 적도라 수) */
    const redSplit = (): [number, number] => {
      const state = game.engine.state;
      const hand = state.zones[handZone("p0")]?.tileIds ?? [];
      let three = 0;
      let other = 0;
      for (const id of hand) {
        const tile = state.tiles[id];
        if (tile?.attrs.red !== true) continue;
        if (isNumberSuit(tile.kind) && tile.kind.rank === 3) three += 1;
        else other += 1;
      }
      return [three, other];
    };
    const [threeBefore, otherBefore] = redSplit();
    expect(threeBefore).toBe(0); // 원래 3은 적도라가 아니다 (표준은 적5뿐)

    const r = game.engine.submit({
      player: "p0",
      type: "red_touch",
      payload: { rank: 3 },
    });
    expect(r.ok).toBe(true);

    const [threeAfter, otherAfter] = redSplit();
    expect(threeAfter).toBe(count3); // 지정한 3이 전부 적도라가 됐다
    expect(otherAfter).toBe(otherBefore); // 다른 랭크는 건드리지 않는다
    expect(game.engine.state.augmentData["red_five_touch:used:p0"]).toBe(true);
  });

  it("손에 없는 숫자·범위 밖 숫자는 거부된다, 게임당 1회", () => {
    const game = touchSetup();
    expect(
      game.engine.submit({
        player: "p0",
        type: "red_touch",
        payload: { rank: 9 },
      }).ok,
    ).toBe(false);
    expect(
      game.engine.submit({
        player: "p0",
        type: "red_touch",
        payload: { rank: 0 },
      }).ok,
    ).toBe(false);
    expect(
      game.engine.submit({
        player: "p0",
        type: "red_touch",
        payload: { rank: 3 },
      }).ok,
    ).toBe(true);
    expect(
      game.engine.submit({
        player: "p0",
        type: "red_touch",
        payload: { rank: 4 },
      }).ok,
    ).toBe(false);
  });
});

// ─────────────────────────── 실게임 크래시 스위프 ───────────────────────────

const STD = new Set([
  "discard",
  "riichi",
  "pon",
  "chi",
  "minkan",
  "ankan",
  "shouminkan",
  "win",
  "pass",
  "kyushuKyuhai",
]);

function decide(options: ActionOption[], usedAug: Set<string>): ActionOption {
  const win = options.find((o) => o.type === "win");
  if (win) return win;
  const aug = options.find((o) => !STD.has(o.type) && !usedAug.has(o.type));
  if (aug) {
    usedAug.add(aug.type);
    return aug;
  }
  const discard = options.find((o) => o.type === "discard");
  if (discard) return discard;
  const pass = options.find((o) => o.type === "pass");
  if (pass) return pass;
  return options[0]!;
}

/** 증강을 p0에 얹고 한 국을 완주시킨다. 예외가 나면 실패. */
function playOneRound(aug: AugmentDef, seed: number): void {
  const game = createStandardGame({ seed, extraAugments: [aug] });
  installAugment(game.engine, aug, "p0", { yaku: game.yaku });
  game.engine.state.players.find((p) => p.id === "p0")?.augments.push(aug.id);
  const flow = new FlowController(game.engine);
  const usedAug = new Set<string>();
  let status = flow.begin();
  let guard = 0;
  while (status.kind === "awaiting" && guard++ < 2000) {
    const prompt = status.prompts[0]!;
    status = flow.submit(prompt.player, decide(prompt.options, usedAug));
  }
  expect(status.kind).toBe("roundOver");
}

describe("⑤B 버프 8종 — 실게임 크래시 스위프", () => {
  const SEEDS = [1, 7, 42];
  const AUGS: AugmentDef[] = [
    jackpot,
    lateBloomer,
    lateBloomerEast,
    eternalDealer,
    devilsAdvance,
    karma,
    riichiUpgrade,
    redFiveTouch,
  ];
  for (const aug of AUGS) {
    it(`${aug.id} — ${String(SEEDS.length)}시드 완주`, () => {
      for (const seed of SEEDS) playOneRound(aug, seed);
    });
  }
});
