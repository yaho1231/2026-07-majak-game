/**
 * 통째로 바꾸기 (full_hand_swap) — **「빠름」 표식** (2026-08-27 사용자 지시).
 *
 * 사용자 지시 원문: *"내 손패보다 샹텐이 빠를것으로 추정되는 패에 표시해주기"*.
 *
 * 이 카드는 상대 손을 못 보고 지르는 것이 본질이라 실측 기대 이득이 거의 0이었다.
 * 그렇다고 손패를 보여 주면 블라인드 성격이 사라지므로, **정확한 샹텐을 계산하되
 * 노출은 이진(빠름 / 표식 없음)** 으로만 한다.
 *
 * 이 파일이 못박는 계약:
 *  1. 표식은 **보유자 전용 채널**에만 실린다 — 남의 시야로 새지 않는다.
 *  2. 값은 **id 목록뿐**이다 — 샹텐 숫자도, 손패도, 얼마나 빠른지도 실리지 않는다.
 *  3. 나보다 샹텐이 낮은 상대만 들어간다 (같거나 느리면 빠진다).
 *  4. **고르는 창이 열려 있을 때만** 채워지고, 창이 닫히면 비워진다 — 국 내내 남으면
 *     갱신되지 않는 거짓말이 되고 정보 노출도 창 밖으로 번진다.
 */

import { describe, expect, it } from "vitest";
import {
  ROUND_SCOPED_MARK,
  augmentDataSet,
  buildPlayerView,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "./helpers.js";
import { fullHandSwap } from "../src/augments/full_hand_swap.js";

/** 보유자 전용 채널 (국 스코프) */
const FASTER_KEY = `view:p0:full_hand_swap:faster${ROUND_SCOPED_MARK}`;

function withAugments(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...ids] } : p,
    ),
  };
}

/**
  * p0(보유자)은 2샹텐, p1은 텐파이(0샹텐 — 나보다 빠르다), p2는 고립패 잡손(느리다).
 * p0의 손은 «한 장 버린 뒤»의 최소 샹텐으로 재므로 상대의 13장과 같은 잣대에 오른다.
 */
function scene(): GameState {
  const base = craft({
    hands: {
      p0: "123m456m789m1p4p7s9s", // 몸통 3 + 고립패 4장 — 한 장 뽑아도 텐파이가 못 된다
      p1: "123m456m789m123p1p", // 1p 단기 텐파이(0샹텐)
      p2: "147m147p258s1234z", // 고립패뿐 — 나보다 한참 느리다
      p3: "*",
    },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return withAugments(base, "p0", ["full_hand_swap"]);
}

function start(state: GameState) {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, fullHandSwap, "p0", { yaku: game.yaku });
  return game;
}

/**
 * 반응(reaction)을 한 번 돌린다. 엔진은 `submit`으로만 이벤트를 흘리므로,
 * 판을 전혀 바꾸지 않는 시험용 액션을 하나 등록해 그걸 태운다.
 */
let tickN = 0;
function tick(game: ReturnType<typeof start>): void {
  if (!game.engine.actions.has("test_tick")) {
    game.engine.actions.register({
      type: "test_tick",
      validate: () => null,
      toEvents: () => [augmentDataSet("test:tick", ++tickN)],
    });
  }
  const r = game.engine.submit({ player: "p0", type: "test_tick", payload: {} });
  expect(r.ok, r.ok ? "" : r.reason).toBe(true);
}

describe("통째로 바꾸기 — 「빠름」 표식", () => {
  it("나보다 샹텐이 낮은 상대만 표식이 붙는다 (id 목록만 — 숫자·손패는 안 나간다)", () => {
    const game = start(scene());
    tick(game);

    const raw = game.engine.state.augmentData[FASTER_KEY];
    expect(Array.isArray(raw)).toBe(true);
    const list = raw as unknown[];
    // 텐파이인 p1은 반드시 들어간다
    expect(list).toContain("p1");
    // 실린 것은 좌석 id 문자열뿐 — 샹텐 숫자나 패가 섞이면 안 된다
    for (const v of list) expect(typeof v).toBe("string");
    // 나 자신은 절대 대상이 아니다
    expect(list).not.toContain("p0");
    // 잡손인 p2는 나보다 빠르지 않다 (이진 표식이 아무에게나 붙지 않는다)
    expect(list).not.toContain("p2");
  });

  it("보유자 전용 채널이라 남의 뷰에는 실리지 않는다", () => {
    const game = start(scene());
    tick(game);

    const mine = buildPlayerView(game.engine.state, "p0", game.engine.rules);
    const theirs = buildPlayerView(game.engine.state, "p1", game.engine.rules);
    expect(Array.isArray(mine.augmentView["full_hand_swap:faster"])).toBe(true);
    expect(theirs.augmentView["full_hand_swap:faster"]).toBeUndefined();
  });

  it("고르는 창이 닫혀 있으면(내 순이 아니면) 아예 채워지지 않는다", () => {
    /*
     * 정보 노출이 늘어난 만큼 «언제» 노출되는지가 계약이다. 발동 창 밖에서도
     * 채널이 살아 있으면, 국 내내 갱신되지 않는 남의 샹텐 정보를 보유자가 쥐게 된다.
     */
    const closed = { ...scene(), round: { ...scene().round, turnSeat: 1 } };
    const game = start(closed);
    tick(game);
    expect(game.engine.state.augmentData[FASTER_KEY]).toBeUndefined();
  });
});
