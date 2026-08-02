/**
 * 2026-08-02 사용자 피드백 2차 — 규칙이 실제로 바뀐 4건의 회귀 테스트.
 *
 *  1. 바닥의 족보: 두 역이 **보조역**이 되어, 손에 진짜 역이 없으면 화료가 성립하지 않는다.
 *  2. 미련: 상시 → **2국에 1회** (보존이 성사된 국의 다음 국은 쿨다운).
 *  3. 복수자: 원수를 론하면 **+2판** (쯔모·제3자 론에는 안 붙는다).
 *  4. 선언 간파: **스텔스 리치는 간파 대상이 아니다** — 후보 목록에 뜨는 것만으로
 *     "저 사람이 리치다"가 새어 나가므로, 드래프트 배제로는 막을 수 없는 누설이다
 *     (배제는 한 사람이 두 증강을 같이 갖는 것만 막는다).
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  SYSTEM_PLAYER,
  buildWinContext,
  createStandardGameFromState,
  discardsZone,
  evaluateWin,
  installAugment,
} from "@majak/core";
import type { ActionOption, GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { bottomYaku } from "../src/augments/bottom_yaku.js";
import { regret } from "../src/augments/regret.js";
import { avenger } from "../src/augments/avenger.js";
import { peekRiichiWaits } from "../src/augments/peek_riichi_waits.js";
import { stealthRiichi } from "../src/augments/stealth_riichi.js";

type Game = ReturnType<typeof createStandardGameFromState>;

function withAug(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...ids] } : p,
    ),
  };
}

function turnOptions(game: Game, player: PlayerId): ActionOption[] {
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  return status.prompts.find((p) => p.player === player)?.options ?? [];
}

// ───────────────────────── 1. 바닥의 족보 = 보조역 ─────────────────────────

describe("바닥의 족보 — 이 역만으로는 화료할 수 없다", () => {
  /** p1이 버린 ron 패를 p0가 잡는다. bottom = p0의 바닥 */
  function evalRon(hand: string, ron: string, bottom: string) {
    const state = craft({
      hands: { p0: hand, p1: "*", p2: "*", p3: "*" },
      discards: { p0: bottom },
      phase: "reaction",
      turnSeat: 1,
      lastDiscard: { player: "p1", spec: ron },
    });
    const game = createStandardGameFromState(withAug(state, "p0", ["bottom_yaku"]));
    installAugment(game.engine, bottomYaku, "p0", { yaku: game.yaku });
    const ronTile = game.engine.state.zones[discardsZone("p1")]?.tileIds[0] as TileId;
    const ctx = buildWinContext(game.engine.state, "p0", "ron", ronTile, {
      rules: game.engine.rules,
      from: "p1",
    });
    return evaluateWin(ctx, game.yaku);
  }

  it("역이 하나도 없는 손은 바닥이 완주여도 화료가 성립하지 않는다", () => {
    // 456m789m444z55p22s + 2s = 4멘쯔+머리. 444z는 북(p0는 동가·동장이라 역패가 아니다),
    // 슌쯔가 있어 또이또이도 아니고 멘젠 론만으로는 역이 되지 않는다 → 역이 0개인 손.
    // 바닥에는 만수 1~9 완주와 같은 패 3장이 모두 들어 있다.
    const ev = evalRon("456m789m444z55p22s", "2s", "123456789m111p");
    expect(ev?.ok).toBe(false);
    // 보조역이라 판도 세지 않는다
    expect(ev?.yaku.some((y) => y.id === "bottom_flow")).toBe(false);
    expect(ev?.yaku.some((y) => y.id === "bottom_letgo")).toBe(false);
  });

  it("손에 진짜 역이 있으면 그 위에 그대로 얹힌다 (역류 통관 2판)", () => {
    const ev = evalRon("123p456p789p23s55s", "4s", "123456789m");
    expect(ev?.ok).toBe(true);
    expect(ev?.yaku.find((y) => y.id === "bottom_flow")?.han).toBe(2);
  });
});

// ───────────────────────── 2. 미련 = 2국에 1회 ─────────────────────────

describe("미련 — 2국에 1회", () => {
  /** 유국 직전 국면 (p0 멘젠 텐파이 + 빈 벽). seq/used를 직접 심어 쿨다운만 본다 */
  function drawScene(seq?: number, used?: number): GameState {
    const base = craft({
      hands: { p0: "123m456m789m11p23p", p1: "*", p2: "*", p3: "*" },
      phase: "turn.draw",
      turnSeat: 0,
    });
    return {
      ...base,
      zones: { ...base.zones, wall: { ...base.zones["wall"]!, tileIds: [] } },
      augmentData: {
        ...base.augmentData,
        ...(seq === undefined ? {} : { "regret:seq:p0": seq }),
        ...(used === undefined ? {} : { "regret:usedSeq:p0": used }),
      },
    };
  }

  /** 유국을 돌리고 보존 결과를 돌려준다 */
  function settleDraw(state: GameState): { kept: unknown; used: unknown } {
    const game = createStandardGameFromState(withAug(state, "p0", ["regret"]));
    installAugment(game.engine, regret, "p0", { yaku: game.yaku });
    const r = game.engine.submit({
      player: SYSTEM_PLAYER,
      type: "sys.settleDraw",
      payload: {},
    });
    expect(r.ok).toBe(true);
    return {
      kept: game.engine.state.augmentData["regret:keep:p0"],
      used: game.engine.state.augmentData["regret:usedSeq:p0"],
    };
  }

  it("첫 유국에는 보존되고, 그 국의 순번이 기록된다", () => {
    const { kept, used } = settleDraw(drawScene(1));
    expect((kept as unknown[]).length).toBe(13);
    expect(used).toBe(1);
  });

  it("보존 다음 국(1국 경과)의 유국에는 보존되지 않는다", () => {
    expect(settleDraw(drawScene(2, 1)).kept).toBeUndefined();
  });

  it("2국이 지나면 다시 보존된다", () => {
    const { kept, used } = settleDraw(drawScene(3, 1));
    expect((kept as unknown[]).length).toBe(13);
    expect(used).toBe(3);
  });
});

// ───────────────────────── 3. 복수자 +2판 ─────────────────────────

describe("복수자 — 원수를 론하면 +2판", () => {
  function extraHanOf(nemesis: string | null, from: PlayerId): number {
    const base = craft({
      hands: { p0: "123p456p789p23s55s", p1: "*", p2: "*", p3: "*" },
      phase: "reaction",
      turnSeat: 1,
      lastDiscard: { player: from, spec: "4s" },
    });
    const state: GameState = {
      ...base,
      augmentData: {
        ...base.augmentData,
        ...(nemesis === null ? {} : { "avenger:nemesis:p0": nemesis }),
      },
    };
    const game = createStandardGameFromState(withAug(state, "p0", ["avenger"]));
    installAugment(game.engine, avenger, "p0", { yaku: game.yaku });
    return game.engine.rules.resolve<number>("score.extraHan", {
      playerId: "p0",
      state: game.engine.state,
    });
  }

  it("원수의 버림패를 론하면 +2판", () => {
    expect(extraHanOf("p1", "p1")).toBe(2);
  });

  it("원수가 아닌 사람의 버림패에는 붙지 않는다", () => {
    expect(extraHanOf("p2", "p1")).toBe(0);
  });

  it("원수가 없으면 붙지 않는다", () => {
    expect(extraHanOf(null, "p1")).toBe(0);
  });
});

// ─────────────── 4. 선언 간파 × 스텔스 리치 (정보 누설 방지) ───────────────

describe("선언 간파 — 스텔스 리치는 간파 대상이 아니다", () => {
  /**
   * p0(선언 간파)의 순. p1은 이미 리치 중이다.
   * stealth=true면 p1의 리치가 **스텔스 액션으로 걸렸다**는 국 단위 표식을 심는다 —
   * `riichi.hidden`이 그 표식이 있을 때만 참이 된다(표준 리치와 구분).
   */
  function scene(stealth: boolean): Game {
    const base = craft({
      hands: {
        p0: "123m456m789m11p23p",
        p1: "234m345p345s678s5s",
        p2: "*",
        p3: "*",
      },
      discards: { p1: "5s" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const p1Round = base.round.byPlayer["p1"];
    if (p1Round === undefined) throw new Error("no p1 round state");
    const state: GameState = {
      ...base,
      round: {
        ...base.round,
        byPlayer: {
          ...base.round.byPlayer,
          p1: { ...p1Round, riichi: { double: false, ippatsu: false, discardIndex: 0 } },
        },
      },
      augmentData: {
        ...base.augmentData,
        // 스텔스 액션으로 걸었다는 표식 (roundKey = "장-국-본장")
        ...(stealth
          ? {
              [`stealth_riichi:active:${base.round.prevalentWind}-${base.round.roundNumber}-${base.round.honba}:p1`]:
                true,
            }
          : {}),
      },
    };
    const withAugs = withAug(
      withAug(state, "p0", ["peek_riichi_waits"]),
      "p1",
      stealth ? ["stealth_riichi"] : [],
    );
    const game = createStandardGameFromState(withAugs);
    installAugment(game.engine, peekRiichiWaits, "p0", { yaku: game.yaku });
    if (stealth) installAugment(game.engine, stealthRiichi, "p1", { yaku: game.yaku });
    return game;
  }

  /** peek_waits {target:p1} 이 합법인가 (null이면 합법) */
  function peekVerdict(game: Game): string | null | undefined {
    return game.engine.actions
      .get("peek_waits")
      ?.validate(
        { player: "p0", type: "peek_waits", payload: { target: "p1" } },
        { state: game.engine.state, rules: game.engine.rules },
      );
  }

  it("평범한 리치는 간파할 수 있다", () => {
    expect(peekVerdict(scene(false))).toBeNull();
  });

  it("스텔스 리치는 간파 액션이 거부된다", () => {
    expect(peekVerdict(scene(true))).toBe("target is not in riichi");
  });

  it("스텔스 리치는 간파 **후보 목록에도** 오르지 않는다 (후보 자체가 누설)", () => {
    const plain = turnOptions(scene(false), "p0");
    expect(plain.some((o) => o.type === "peek_waits")).toBe(true);
    const hidden = turnOptions(scene(true), "p0");
    expect(hidden.some((o) => o.type === "peek_waits")).toBe(false);
  });
});
