/**
 * 커스텀 역의 무장해제는 **화료자 본인** 기준으로 판정한다 (docs/25 최우선#3).
 *
 * 커스텀 역은 게임당 한 번만 등록되므로 `YakuDef.source`는 먼저 설치된 보유자의
 * 인스턴스 id로 고정된다. 그런데 같은 증강을 두 명이 가질 수 있다(드래프트 보충
 * 경로가 남의 보유분을 제외하지 않는다). 그대로 대조하면:
 *   · 설치자를 잠그면 → **다른 보유자의 역까지** 사라진다
 *   · 다른 보유자를 잠그면 → **아무 일도 일어나지 않는다**
 *
 * 감사 8개 팀 중 4개가 서로 모른 채 독립 발견한 건이다.
 */

import { describe, expect, it } from "vitest";
import {
  DISARMED_SOURCES_KEY,
  augmentInstanceId,
  buildWinContext,
  createStandardGameFromState,
  evaluateWin,
  installAugment,
  handIdsOf,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { tanyaoBreak } from "../src/augments/tanyao_break.js";

const AUG = "tanyao_break";
/** 탕야오 해방이 붙는 손 — 자패가 없고 1·9가 섞여 있다(표준 탕야오는 불성립) */
const HAND = "123m567m234p99p678s";

/**
 * p0·p1이 **둘 다** 탕야오 해방을 보유한 게임.
 * 설치 순서는 p0 → p1이라 역의 source는 p0에 고정된다.
 */
function twoHolders(disarmed: string[]): ReturnType<typeof createStandardGameFromState> {
  const base = craft({
    hands: { p0: HAND, p1: HAND, p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const state: GameState = {
    ...base,
    players: base.players.map((p) =>
      p.id === "p0" || p.id === "p1" ? { ...p, augments: [AUG] } : p,
    ),
    augmentData: { ...base.augmentData, [DISARMED_SOURCES_KEY]: disarmed },
  };
  const game = createStandardGameFromState(state, undefined, [tanyaoBreak]);
  installAugment(game.engine, tanyaoBreak, "p0", { yaku: game.yaku });
  installAugment(game.engine, tanyaoBreak, "p1", { yaku: game.yaku });
  return game;
}

/** 그 사람이 지금 손으로 쯔모 화료했을 때 탕야오 해방이 붙는가 */
function hasBreakYaku(
  game: ReturnType<typeof createStandardGameFromState>,
  player: PlayerId,
): boolean {
  const state = game.engine.state;
  const winTile = handIdsOf(state, player)[0] as TileId;
  const ev = evaluateWin(
    buildWinContext(state, player, "tsumo", winTile, { rules: game.engine.rules }),
    game.yaku,
  );
  return (ev?.yaku ?? []).some((y) => y.id.includes(AUG) || y.name.includes("탕야오"));
}

describe("커스텀 역 source — 두 명이 같은 증강을 가질 때", () => {
  it("아무도 안 잠겼으면 둘 다 역이 붙는다 (기준선)", () => {
    const game = twoHolders([]);
    expect(hasBreakYaku(game, "p0")).toBe(true);
    expect(hasBreakYaku(game, "p1")).toBe(true);
  });

  it("설치자(p0)를 잠그면 p0만 잃고 p1은 그대로다", () => {
    const game = twoHolders([augmentInstanceId("p0", AUG)]);
    expect(hasBreakYaku(game, "p0")).toBe(false);
    // 예전에는 여기가 false였다 — 지목당하지 않은 p1의 역까지 함께 죽었다
    expect(hasBreakYaku(game, "p1")).toBe(true);
  });

  it("나중 설치자(p1)를 잠그면 p1만 잃는다", () => {
    const game = twoHolders([augmentInstanceId("p1", AUG)]);
    // 예전에는 여기가 true였다 — 지목당한 본인에게 아무 일도 일어나지 않았다
    expect(hasBreakYaku(game, "p1")).toBe(false);
    expect(hasBreakYaku(game, "p0")).toBe(true);
  });
});
