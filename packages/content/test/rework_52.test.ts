/**
 * 52차 기존 증강 재조정 회귀 테스트 — "조용한 규칙 완화"(§1b E)에 확정 보상을 붙인 3종.
 *
 * cliff_bloom(절벽 위에 피어난 꽃) — 만개한 국의 화료에 +6000점 (기존 +3판과 중복)
 * tanyao_break(탕야오 해방) — 해방된 탕야오가 성립한 화료에 +2000점
 * counter(카운터) — 선제 리치자를 직격 론으로 잡으면 +6000점 (기존 손 가치 강탈과 중복)
 *
 * 설계 근거: docs/16_AUGMENT_REDESIGN.md §1c "기존 증강 재조정 (4종)"
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  ROUND_SETTLED,
  SYSTEM_PLAYER,
  createStandardGame,
  createStandardGameFromState,
  discardsZone,
  installAugment,
} from "@majak/core";
import type {
  ActionOption,
  AugmentDef,
  GameState,
  PlayerId,
  RoundSettledPayload,
  TileId,
  WinInfo,
} from "@majak/core";
import { craft } from "./helpers.js";
import { roundKey, winPointsWithExtraHan } from "../src/util.js";
import { cliffBloom } from "../src/augments/cliff_bloom.js";
import { tanyaoBreak } from "../src/augments/tanyao_break.js";
import { counter } from "../src/augments/counter.js";

type Game = ReturnType<typeof createStandardGameFromState>;

function withAugments(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...ids] } : p,
    ),
  };
}

function withData(state: GameState, data: Record<string, unknown>): GameState {
  return { ...state, augmentData: { ...state.augmentData, ...data } };
}

/** 마지막 ROUND_SETTLED payload */
function lastSettled(game: Game): RoundSettledPayload {
  for (let i = game.engine.eventLog.length - 1; i >= 0; i--) {
    const e = game.engine.eventLog[i];
    if (e?.type === ROUND_SETTLED) return e.payload as RoundSettledPayload;
  }
  throw new Error("no RoundSettled event");
}

function infoOf(p: RoundSettledPayload, player: PlayerId): WinInfo {
  const info = (p.winInfos ?? []).find((w) => w.winner === player);
  if (info === undefined) throw new Error(`no WinInfo for ${player}`);
  return info;
}

// ───────────────── cliff_bloom (절벽 위에 피어난 꽃) ─────────────────

describe("cliff_bloom (절벽 위에 피어난 꽃) — 만개 국의 영상개화 4판 취급", () => {
  interface Settled {
    delta: number;
    info: WinInfo;
    before: GameState;
  }

  /**
   * p0가 쯔모로 화료한다. mode에 따라 증강 설치 / 만개 플래그를 바꾼다.
   * rinshan=true면 영상 쯔모로 취급되어 표준 영상개화(1판)가 붙는다 —
   * 만개 보너스는 그 영상개화를 4판으로 올리는 것이므로 이 플래그가 전제다.
   */
  function settleTsumo(mode: "none" | "aug" | "bloom", rinshan = true): Settled {
    let s = craft({
      hands: { p0: "234m345p345s678s5s5s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    s = { ...s, round: { ...s.round, lastDrawRinshan: rinshan } };
    s = withAugments(s, "p0", ["cliff_bloom"]);
    if (mode === "bloom") {
      s = withData(s, { [`cliff_bloom:bloomed:${roundKey(s)}:p0#round`]: true });
    }
    const game = createStandardGameFromState(s);
    if (mode !== "none") {
      installAugment(game.engine, cliffBloom, "p0", { yaku: game.yaku });
    }
    const before = game.engine.state;
    const tileId = before.round.lastDrawnTile as TileId;
    const r = game.engine.submit({
      player: SYSTEM_PLAYER,
      type: "sys.settleWin",
      payload: { wins: [{ winner: "p0", from: null, tileId, winType: "tsumo" }] },
    });
    expect(r.ok).toBe(true);
    const settled = lastSettled(game);
    return { delta: settled.deltas["p0"] ?? 0, info: infoOf(settled, "p0"), before };
  }

  it("만개한 국의 영상개화는 4판으로 취급된다 (표준 1판과의 차이 +3판)", () => {
    const plain = settleTsumo("aug");
    const bloom = settleTsumo("bloom");
    expect(plain.info.yaku.some((y) => y.id === "rinshan")).toBe(true);
    // 2026-08-01: 차액을 '보이지 않는 점수 보정'이 아니라 score.extraHan으로 얹는다 —
    // 정산창이 "증강 보너스 3판"으로 보여 준다(그전엔 영상개화 1판만 보였다).
    expect(plain.info.extraHan).toBe(0);
    expect(bloom.info.extraHan).toBe(3);
    expect(bloom.info.han).toBe(plain.info.han + 3);
    const expected = winPointsWithExtraHan(bloom.before, "p0", plain.info, 3);
    expect(expected).toBeGreaterThan(0);
    expect(bloom.delta - plain.delta).toBe(expected);
    expect(bloom.info.points).toBe(plain.info.points + expected);
  });

  it("만개하지 않은 국의 화료에는 아무 보너스도 붙지 않는다", () => {
    // (깡을 했든 안 했든 만개 전이면 보너스는 없다 — 하이라이트는 만개다)
    expect(settleTsumo("aug").delta).toBe(settleTsumo("none").delta);
  });

  it("만개했어도 영상개화가 붙지 않은 화료에는 보너스가 없다", () => {
    // 만개 자체가 영상 쯔모라 실전에서는 거의 없지만, 보너스의 정의가
    // "영상개화를 4판으로 취급"이므로 그 역이 없으면 얹을 것도 없다
    const bloom = settleTsumo("bloom", false);
    expect(bloom.info.yaku.some((y) => y.id === "rinshan")).toBe(false);
    expect(bloom.delta).toBe(settleTsumo("none", false).delta);
  });
});

// ───────────────── tanyao_break (탕야오 해방) ─────────────────

describe("tanyao_break (탕야오 해방) — 역 자체가 2판", () => {
  /** p0가 주어진 손으로 쯔모 화료한다 (본장·공탁 0이라 delta = 화료점 + 보너스). */
  function settle(hand: string): {
    delta: number;
    info: WinInfo;
    before: GameState;
  } {
    const s = withAugments(
      craft({
        hands: { p0: hand, p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      "p0",
      ["tanyao_break"],
    );
    const game = createStandardGameFromState(s);
    installAugment(game.engine, tanyaoBreak, "p0", { yaku: game.yaku });
    const tileId = game.engine.state.round.lastDrawnTile as TileId;
    const before = game.engine.state;
    const r = game.engine.submit({
      player: SYSTEM_PLAYER,
      type: "sys.settleWin",
      payload: { wins: [{ winner: "p0", from: null, tileId, winType: "tsumo" }] },
    });
    expect(r.ok).toBe(true);
    const settled = lastSettled(game);
    return { delta: settled.deltas["p0"] ?? 0, info: infoOf(settled, "p0"), before };
  }

  it("1·9를 낀 수패-only 손으로 화료하면 그 역이 2판으로 붙는다", () => {
    const { delta, info } = settle("123m11m456p789s234s");
    // 2026-07-26: "1판 + 화료 시 +2판 보너스"를 역 판수 2판 하나로 접었다 —
    // 별도의 정산 보정이 없으므로 delta는 화료점 그대로다.
    expect(info.yaku.some((y) => y.id === "tanyao_break" && y.han === 2)).toBe(true);
    expect(delta).toBe(info.points);
  });

  it("자패가 섞인 손에는 역도 보너스도 붙지 않는다", () => {
    const { delta, info } = settle("123m456p789s234s11z");
    expect(info.yaku.some((y) => y.id === "tanyao_break")).toBe(false);
    expect(delta).toBe(info.points);
  });
});

// ───────────────── counter (카운터) ─────────────────

describe("counter (카운터) — 선제 리치자 직격 론 +3판 (2026-08-25 재조정)", () => {
  const RIICHI = { double: false, ippatsu: false, discardIndex: 0 };

  /**
   * p0(추격 리치)가 9s에 론 화료한다. from을 바꿔가며 델타를 비교한다.
   * prevTenpai=false면 선리치자 p1의 손이 형식조차 텐파이가 아니라
   * "손 가치 강탈"이 0점이 되어 직격 보너스만 남는다.
   */
  function ronScene(
    from: PlayerId,
    prevTenpai: boolean,
  ): { delta: number; info: WinInfo; before: GameState } {
    let s = craft({
      hands: {
        p0: "123m789p234s678s9s",
        p1: prevTenpai ? "234m567m234p567p9p" : "147m258p369s1235z",
        p2: "*",
        p3: "*",
      },
      discards: { p1: "9s", p2: "9s" },
      phase: "turn.act",
      turnSeat: 0,
    });
    const ronTileId = s.zones[discardsZone(from)]?.tileIds[0] as TileId;
    s = {
      ...s,
      round: {
        ...s.round,
        doraIndicators: [], // 도라 제거 → 저판 유지 (상한에 묻히지 않게)
        byPlayer: {
          ...s.round.byPlayer,
          p0: { ...s.round.byPlayer["p0"]!, riichi: RIICHI },
          p1: { ...s.round.byPlayer["p1"]!, riichi: RIICHI },
        },
      },
    };
    s = withData(withAugments(s, "p0", ["counter"]), {
      "counter:prev:p0": "p1",
      "counter:struck:p0": true,
    });
    const game = createStandardGameFromState(s);
    installAugment(game.engine, counter, "p0", { yaku: game.yaku });
    const before = game.engine.state;
    const r = game.engine.submit({
      player: SYSTEM_PLAYER,
      type: "sys.settleWin",
      payload: { wins: [{ winner: "p0", from, tileId: ronTileId, winType: "ron" }] },
    });
    expect(r.ok).toBe(true);
    const settled = lastSettled(game);
    const info = infoOf(settled, "p0");
    return { delta: (settled.deltas["p0"] ?? 0) - info.points, info, before };
  }

  const ronDelta = (from: PlayerId, prevTenpai: boolean): number =>
    ronScene(from, prevTenpai).delta;

  it("선리치자를 직격 론으로 잡으면 정확히 +3판이 더 들어온다", () => {
    // p1이 노텐이라 손 가치 강탈은 0 — 남는 것은 직격 보너스뿐이다
    const { delta, info, before } = ronScene("p1", false);
    const bonus = winPointsWithExtraHan(before, "p0", info, 3);
    expect(bonus).toBeGreaterThan(0);
    expect(delta).toBe(bonus);
  });

  it("선리치자가 아닌 사람에게서 론하면 직격 보너스가 없다", () => {
    expect(ronDelta("p2", false)).toBe(0);
  });

  it("손 가치 강탈과 직격 보너스는 중복 적용된다", () => {
    const other = ronScene("p2", true); // 강탈만
    const direct = ronScene("p1", true); // 강탈 + 직격
    expect(other.delta).toBeGreaterThan(0);
    expect(direct.delta - other.delta).toBe(
      winPointsWithExtraHan(direct.before, "p0", direct.info, 3),
    );
  });

  it("반격한 국이라도 쯔모 화료에는 직격 보너스가 붙지 않는다", () => {
    let s = craft({
      hands: {
        p0: "234m345p345s678s5s5s",
        p1: "147m258p369s1235z",
        p2: "*",
        p3: "*",
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    s = withData(withAugments(s, "p0", ["counter"]), {
      "counter:prev:p0": "p1",
      "counter:struck:p0": true,
    });
    const game = createStandardGameFromState(s);
    installAugment(game.engine, counter, "p0", { yaku: game.yaku });
    const tileId = game.engine.state.round.lastDrawnTile as TileId;
    const r = game.engine.submit({
      player: SYSTEM_PLAYER,
      type: "sys.settleWin",
      payload: { wins: [{ winner: "p0", from: null, tileId, winType: "tsumo" }] },
    });
    expect(r.ok).toBe(true);
    const settled = lastSettled(game);
    expect((settled.deltas["p0"] ?? 0) - infoOf(settled, "p0").points).toBe(0);
  });
});

// ───────────────── 크래시 스위프 (실게임 한 국) ─────────────────

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

function playOneRound(aug: AugmentDef, seed: number): void {
  const game = createStandardGame({ seed, extraAugments: [aug] });
  installAugment(game.engine, aug, "p0", { yaku: game.yaku });
  game.engine.state.players.find((p) => p.id === "p0")!.augments.push(aug.id);
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

describe("52차 재조정 3종 — 실게임 한 국 완주", () => {
  const SEEDS = [1, 7, 42];
  for (const aug of [cliffBloom, tanyaoBreak, counter]) {
    it(`${aug.id} — ${SEEDS.length}시드 완주`, () => {
      for (const seed of SEEDS) playOneRound(aug, seed);
    });
  }
});
