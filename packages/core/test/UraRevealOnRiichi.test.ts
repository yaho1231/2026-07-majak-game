/**
 * **뒷도라 표시패는 실제로 셀 때만 연다** (2026-08-27 사용자 보고).
 *
 * 예전에는 화료면 무조건 `uraIndicatorIds`를 실어 보냈다. 그러면 리치 없이 난 국에도
 * 중앙 도라 줄 **바로 아래에 라벨 없는 패 몇 장**이 갑자기 나타난다 — 아무 데도 안 세는
 * 패라 화면에 근거가 없다. 깡으로 표시패가 늘어난 국(장사진 깡 2회 = 표시패 3장)에서는
 * 그 줄이 통째로 세 장이라 «저 패는 어디서 나온 거냐»가 된다.
 */

import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../src/engine/state/GameState.js";
import { DEAD_WALL } from "../src/engine/zones/Zone.js";
import type { PlayerId } from "../src/engine/zones/Zone.js";
import {
  revealedUraIndicatorIds,
  uraIndicatorIds,
} from "../src/mahjong/flow/helpers.js";
import type { GameState } from "../src/engine/state/GameState.js";


/** 도라 표시패 n장이 열려 있는 판 (깡 도라 포함) */
function scene(indicators: number): GameState {
  const base = createInitialGameState(
    { seed: 3, playerIds: ["p0", "p1", "p2", "p3"] },
    { startScore: 25000, redFivesPerSuit: 1 },
  );
  // 왕패 14장을 손으로 깐다 (배패 전 초기 상태에는 존이 비어 있다)
  const dead = Object.values(base.tiles)
    .slice(0, 14)
    .map((t) => t.id);
  const zone = base.zones[DEAD_WALL];
  // 표시패는 왕패 앞쪽(영상패 4장)을 피해 잡는다 — 뒷도라는 그 바로 다음 장이다
  const doraIndicators = Array.from({ length: indicators }, (_v, i) => dead[4 + i * 2] as number);
  return {
    ...base,
    zones: { ...base.zones, [DEAD_WALL]: { ...zone!, tileIds: dead } },
    round: { ...base.round, doraIndicators },
  };
}

const withRiichi = (state: GameState, p: PlayerId): GameState => ({
  ...state,
  round: {
    ...state.round,
    byPlayer: {
      ...state.round.byPlayer,
      [p]: {
        ...state.round.byPlayer[p]!,
        riichi: { double: false, ippatsu: false, discardIndex: 0 },
      },
    },
  },
});

const win = (winner: PlayerId, uraHan = 0): { winner: PlayerId; uraHan: number } => ({
  winner,
  uraHan,
});

describe("뒷도라 표시패 공개 조건", () => {
  it("리치 없이 난 화료에는 열지 않는다", () => {
    const state = scene(3);
    expect(uraIndicatorIds(state)).toHaveLength(3); // 열 것 자체는 있다
    expect(revealedUraIndicatorIds(state, [win("p0")])).toEqual([]);
  });

  it("리치로 화료하면 표시패 수만큼 연다", () => {
    const state = withRiichi(scene(3), "p0");
    expect(revealedUraIndicatorIds(state, [win("p0")])).toEqual(uraIndicatorIds(state));
  });

  it("리치가 없어도 뒷도라 판수가 실제로 붙었으면 연다 (숨은 칼날 계열)", () => {
    const state = scene(1);
    expect(revealedUraIndicatorIds(state, [win("p0", 2)])).toEqual(uraIndicatorIds(state));
  });

  it("더블론 — 한쪽만 리치여도 연다", () => {
    const state = withRiichi(scene(2), "p1");
    expect(revealedUraIndicatorIds(state, [win("p0"), win("p1")])).toEqual(
      uraIndicatorIds(state),
    );
  });

  it("화료가 없으면(유국) 열지 않는다", () => {
    expect(revealedUraIndicatorIds(scene(2), [])).toEqual([]);
  });
});
