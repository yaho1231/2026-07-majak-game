/**
 * 염색 — 매치 예산 자원 (2026-08-04, 국당 1회에서 연금술사와 같은 구조로 개편).
 * 한 순에 한 번, **동풍전 5회 · 반장전 8회**(2026-08-23), 남은 횟수는 보유자 채널로 노출된다.
 *
 * 여기 시나리오는 판을 안 정한다 = 반장전이다(서버 기본과 같다). 모드별 한도 자체는
 * `mode_scaled_uses_0823.test.ts`가 두 모드로 못박는다.
 */

import { describe, expect, it } from "vitest";
import { createStandardGameFromState, installAugment } from "@majak/core";
import type { GameState, TileId } from "@majak/core";
import { tileDyeing } from "../src/augments/tile_dyeing.js";
import { craft } from "./helpers.js";

/** used = 이미 쓴 횟수 (게임 스코프 카운터를 미리 세팅해 한도를 시험한다) */
function scene(used = 0): GameState {
  const s = craft({
    hands: { p0: "123m456p789s11z2z", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return {
    ...s,
    players: s.players.map((p) => (p.id === "p0" ? { ...p, augments: ["tile_dyeing"] } : p)),
    augmentData: { ...s.augmentData, ...(used > 0 ? { "tile_dyeing:used:p0": used } : {}) },
  };
}

function setup(used = 0): ReturnType<typeof createStandardGameFromState> {
  const game = createStandardGameFromState(scene(used), undefined, [tileDyeing]);
  installAugment(game.engine, tileDyeing, "p0", { yaku: game.yaku });
  return game;
}

function dye(
  game: ReturnType<typeof createStandardGameFromState>,
  idx: number,
  suit: "man" | "pin" | "sou",
): boolean {
  const hand = game.engine.state.zones["hand:p0"]?.tileIds ?? [];
  return game.engine.submit({
    player: "p0",
    type: "tile_dye",
    payload: { tileId: hand[idx] as TileId, suit },
  }).ok;
}

describe("염색 — 매치 예산 (반장전 8회)", () => {
  it("한 순에 두 번은 못 쓴다", () => {
    const game = setup();
    expect(dye(game, 0, "pin")).toBe(true);
    expect(dye(game, 1, "sou")).toBe(false);
  });

  it("이미 8회를 썼으면 막힌다", () => {
    const game = setup(8);
    expect(dye(game, 0, "pin")).toBe(false);
    // 후보 열거에서도 사라진다 (액티브 버튼이 헛돌지 않게)
    const opts = game.engine.turnOptionProviders.flatMap((p) => p(game.engine.state, "p0"));
    expect(opts.some((o) => o.type === "tile_dye")).toBe(false);
  });

  it("7회를 썼으면 마지막 1회는 쓸 수 있고 남은 횟수가 0이 된다", () => {
    const game = setup(7);
    expect(dye(game, 0, "pin")).toBe(true);
    expect(game.engine.state.augmentData["view:p0:uses:tile_dyeing"]).toEqual({
      left: 0,
      total: 8,
      scope: "match",
    });
  });

  /*
   * 남은 횟수는 **횟수형 증강 공용 채널**(`view:{보유자}:uses:{증강id}`)로 나간다.
   *
   * 2026-08-25까지는 이 증강만 쓰는 `tile_dyeing:left`에 숫자 하나를 실었다. 총 횟수가
   * 없으니 이름표 pill이 게이지도 "N회 중 n회 남음" 문구도 못 그렸고, 동기화가 쯔모
   * 한 이벤트에만 걸려 있어 발동 직후에는 값이 다음 쯔모까지 옛날 값으로 서 있었다
   * (사용자 보고: "염색은 횟수형인데 pill에 남은 횟수가 안 나온다").
   */
  it("남은 횟수가 공용 잔량 채널로, 국 스코프가 아닌 게임 스코프 키로 실린다", () => {
    const game = setup();
    expect(dye(game, 0, "pin")).toBe(true);
    expect(game.engine.state.augmentData["view:p0:uses:tile_dyeing"]).toEqual({
      left: 7,
      total: 8,
      scope: "match",
    });
    // 국이 바뀌어도 지워지지 않아야 하므로 roundKey가 섞이지 않은 고정 키다
    expect(game.engine.state.augmentData["tile_dyeing:used:p0"]).toBe(1);
  });
});
