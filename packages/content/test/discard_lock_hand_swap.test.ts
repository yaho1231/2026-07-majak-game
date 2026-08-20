/**
 * 봉인술사 (discard_lock) — **봉인은 사람이 아니라 패를 따라간다.**
 *
 * 봉인 목록은 대상 playerId 별 키에 담기지만 담긴 값은 tileId다. 예전 모디파이어는
 * "지금 버리려는 사람" 칸 하나만 읽어서, 손을 통째로 맞바꾸는 증강(seat_swap ·
 * full_hand_swap)이 끼면 봉인이 **아무에게도** 걸리지 않았다 — 잠긴 패는 상대 손으로
 * 건너가 원래 주인의 손패 필터를 통과하지 못하고, 넘겨받은 사람 칸에는 그 id가 없다.
 * p1↔p2 가 손을 바꾸면 두 좌석의 봉인이 동시에 0장이 됐다(2026-08-20 QA disrupt 확정 1).
 *
 * 계약: 어느 좌석이 그 패를 쥐고 있든 잠긴다(보유자 본인만 예외).
 */

import { describe, expect, it } from "vitest";
import {
  ROUND_SCOPED_MARK,
  createStandardGameFromState,
  installAugment,
  lockedDiscardIds,
} from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "./helpers.js";
import { discardLock } from "../src/augments/discard_lock.js";

/** 보유자 p0 이 target 좌석에 걸어 둔 봉인 목록 키 */
const sealKey = (target: PlayerId): string =>
  `view:p0:discardLockReveal:${target}${ROUND_SCOPED_MARK}`;

function scene(): GameState {
  const base = craft({
    hands: {
      p0: "123m456m789m11p23p",
      p1: "111m222m333m44p55p",
      p2: "999s888s777s66p12s",
      p3: "*",
    },
    phase: "turn.act",
    turnSeat: 1,
    drawnLastFor: "p1",
  });
  return {
    ...base,
    players: base.players.map((p) =>
      p.id === "p0" ? { ...p, augments: ["discard_lock"] } : p,
    ),
  };
}

function start(state: GameState) {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, discardLock, "p0", { yaku: game.yaku, catalog: game.augments });
  return game;
}

const handOf = (s: GameState, p: PlayerId): number[] => [...(s.zones[`hand:${p}`]?.tileIds ?? [])];

describe("봉인술사 — 손 교환이 끼어도 봉인은 그 패를 따라간다", () => {
  it("교환 전: 봉인 목록에 적힌 좌석의 그 패가 잠긴다 (대조군)", () => {
    const base = scene();
    const locked = [handOf(base, "p1")[0]!, handOf(base, "p1")[1]!];
    const game = start({
      ...base,
      augmentData: { ...base.augmentData, [sealKey("p1")]: locked },
    });
    const got = lockedDiscardIds(game.engine.state, game.engine.rules, "p1");
    expect([...got].sort()).toEqual([...locked].sort());
  });

  it("손을 통째로 맞바꾼 뒤에도 그 패는 잠긴 채 넘어간다", () => {
    const base = scene();
    // p1 에 걸린 봉인패 2장이 seat_swap/full_hand_swap 으로 p2 손에 있는 상황
    const sealedOnP1 = [handOf(base, "p2")[0]!, handOf(base, "p2")[1]!];
    const sealedOnP2 = [handOf(base, "p1")[0]!, handOf(base, "p1")[1]!];
    const game = start({
      ...base,
      augmentData: {
        ...base.augmentData,
        [sealKey("p1")]: sealedOnP1, // 값은 그대로인데 그 패는 이제 p2 손에 있다
        [sealKey("p2")]: sealedOnP2, // 그 패는 이제 p1 손에 있다
      },
    });
    const s = game.engine.state;
    // 어느 좌석도 봉인이 증발하지 않는다 — 각자 지금 쥔 봉인패가 잠긴다
    expect([...lockedDiscardIds(s, game.engine.rules, "p2")].sort()).toEqual(
      [...sealedOnP1].sort(),
    );
    expect([...lockedDiscardIds(s, game.engine.rules, "p1")].sort()).toEqual(
      [...sealedOnP2].sort(),
    );
  });

  it("봉인패가 보유자 손으로 넘어오면 보유자는 자유롭다 (자기 증강에 자기가 묶이지 않는다)", () => {
    const base = scene();
    const onHolder = [handOf(base, "p0")[0]!, handOf(base, "p0")[1]!];
    const game = start({
      ...base,
      augmentData: { ...base.augmentData, [sealKey("p1")]: onHolder },
    });
    expect(lockedDiscardIds(game.engine.state, game.engine.rules, "p0").size).toBe(0);
  });
});
