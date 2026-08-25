/**
 * 방 상세설정(고급 규칙) 회귀 테스트.
 *
 * 검증: 값 정리(범위 자르기·「1위 필요점수 > 시작점수」) · 쿠이탕을 끄면 탕야오가
 *       멘젠 전용이 된다 · 손패 공개를 켜면 남의 손패가 뷰에 실린다 ·
 *       아무것도 안 주면 **종전과 완전히 동일**하다(기본값 회귀 방지).
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROOM_RULES,
  ROOM_SCORE_MAX,
  ROOM_SCORE_MIN,
  normalizeRoomRules,
} from "../src/network/protocol.js";
import { createStandardGame } from "../src/mahjong/flow/standardGame.js";
import { setupRound } from "../src/engine/state/GameState.js";
import { buildPlayerView } from "../src/information/PlayerView.js";
import { handZone } from "../src/engine/zones/Zone.js";

describe("normalizeRoomRules", () => {
  it("아무것도 안 주면 기본값 그대로다", () => {
    expect(normalizeRoomRules(undefined)).toEqual(DEFAULT_ROOM_RULES);
  });

  it("범위를 벗어난 점수는 잘린다", () => {
    const r = normalizeRoomRules({ startScore: 1, returnScore: 999_999 });
    expect(r.startScore).toBe(ROOM_SCORE_MIN);
    expect(r.returnScore).toBe(ROOM_SCORE_MAX);
  });

  it("1위 필요점수가 시작점수 이하면 필요점수를 올린다", () => {
    const r = normalizeRoomRules({ startScore: 50_000, returnScore: 30_000 });
    expect(r.startScore).toBe(50_000);
    expect(r.returnScore).toBeGreaterThan(50_000);
  });

  it("바꾸지 않은 항목은 이전 값을 유지한다", () => {
    const base = normalizeRoomRules({ kuitan: false, startScore: 30_000 });
    const next = normalizeRoomRules({ dobi: false }, base);
    expect(next.kuitan).toBe(false);
    expect(next.startScore).toBe(30_000);
    expect(next.dobi).toBe(false);
  });

  it("숫자가 아닌 값은 무시하고 이전 값을 쓴다", () => {
    const r = normalizeRoomRules({ startScore: Number.NaN });
    expect(r.startScore).toBe(DEFAULT_ROOM_RULES.startScore);
  });
});

describe("쿠이탕 (후로 탕야오)", () => {
  it("기본은 후로 탕야오가 성립한다 (1판)", () => {
    const game = createStandardGame({ seed: 1 });
    expect(game.yaku.get("tanyao")?.openHan).toBe(1);
  });

  it("끄면 탕야오가 멘젠 전용이 된다", () => {
    const game = createStandardGame({ seed: 1, kuitan: false });
    expect(game.yaku.get("tanyao")?.openHan).toBeNull();
    expect(game.yaku.get("tanyao")?.closedHan).toBe(1);
  });
});

describe("손패 공개", () => {
  function handSizeSeenBy(openHands: boolean): number {
    const game = createStandardGame({ seed: 7, ...(openHands ? { openHands: true } : {}) });
    const state = setupRound(game.engine.state);
    const view = buildPlayerView(state, "p0", game.engine.rules);
    return view.zones[handZone("p1")]?.tileIds.length ?? 0;
  }

  it("기본은 남의 손패가 보이지 않는다", () => {
    expect(handSizeSeenBy(false)).toBe(0);
  });

  it("켜면 남의 손패가 그대로 실린다", () => {
    expect(handSizeSeenBy(true)).toBe(13);
  });
});

describe("적도라 수 (방 설정 → 엔진)", () => {
  it("0으로 주면 적5가 한 장도 없다", () => {
    const game = createStandardGame({ seed: 3, redFivesPerSuit: 0 });
    const reds = Object.values(game.engine.state.tiles).filter((t) => t?.attrs.red === true);
    expect(reds.length).toBe(0);
  });

  it("기본은 무늬마다 한 장씩 (3장)", () => {
    const game = createStandardGame({ seed: 3 });
    const reds = Object.values(game.engine.state.tiles).filter((t) => t?.attrs.red === true);
    expect(reds.length).toBe(3);
  });
});
