/**
 * 국 도중 직접 점수 이동은 상대를 음수로 만들지 않는다 (사용자 확정 2026-08-04).
 *
 * 카운터·카르마는 정산이 아니라 **국 도중에** 점수를 옮긴다. 토비(0점 이하 종료)
 * 판정은 국 정산 뒤에만 돌기 때문에, 캡이 없으면 상대가 음수 점수인 채로 그 국을
 * 계속 치게 된다 — 리치도 못 걸고 화면에 음수가 뜬 상태로(docs/25 방해 #14).
 */

import { describe, expect, it } from "vitest";
import { createStandardGameFromState, installAugment } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "./helpers.js";
import { karma } from "../src/augments/karma.js";

/** p0가 카르마 게이지를 잔뜩 쌓았고, 상대들의 점수를 지정한 상태 */
function scene(
  gauge: number,
  scores: Record<PlayerId, number>,
): ReturnType<typeof createStandardGameFromState> {
  const base = craft({
    hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const state: GameState = {
    ...base,
    players: base.players.map((p) => ({
      ...p,
      ...(p.id === "p0" ? { augments: ["karma"] } : {}),
      score: scores[p.id] ?? p.score,
    })),
    augmentData: { ...base.augmentData, [`karma:gauge:p0`]: gauge },
  };
  const game = createStandardGameFromState(state, undefined, [karma]);
  installAugment(game.engine, karma, "p0", { yaku: game.yaku });
  return game;
}

const scoreOf = (
  g: ReturnType<typeof createStandardGameFromState>,
  id: PlayerId,
): number => g.engine.state.players.find((p) => p.id === id)?.score ?? 0;

describe("카르마 — 잔여 점수를 넘겨 태우지 않는다", () => {
  it("아무도 음수가 되지 않는다", () => {
    // p1은 800점뿐인데 1인당 몫은 4000이다
    const game = scene(12000, { p0: 25000, p1: 800, p2: 25000, p3: 25000 });
    const res = game.engine.submit({ player: "p0", type: "karma_burn", payload: {} });
    if (!res.ok) throw new Error(`karma_burn rejected: ${res.reason}`);

    for (const p of game.engine.state.players) {
      expect(p.score).toBeGreaterThanOrEqual(0);
    }
  });

  it("빈털터리에게서는 있는 만큼만 가져온다", () => {
    const game = scene(12000, { p0: 25000, p1: 800, p2: 25000, p3: 25000 });
    game.engine.submit({ player: "p0", type: "karma_burn", payload: {} });
    expect(scoreOf(game, "p1")).toBe(0);
  });

  it("받은 총액과 나간 총액이 같다 (뱅크가 발행하지 않는다)", () => {
    const before = { p0: 25000, p1: 800, p2: 25000, p3: 25000 };
    const game = scene(12000, before);
    game.engine.submit({ player: "p0", type: "karma_burn", payload: {} });

    const gained = scoreOf(game, "p0") - before.p0;
    const lost =
      before.p1 -
      scoreOf(game, "p1") +
      (before.p2 - scoreOf(game, "p2")) +
      (before.p3 - scoreOf(game, "p3"));
    expect(gained).toBe(lost);
  });

  it("전원이 넉넉하면 종전대로 균등하게 태운다 (회귀 방지)", () => {
    const game = scene(12000, { p0: 25000, p1: 25000, p2: 25000, p3: 25000 });
    game.engine.submit({ player: "p0", type: "karma_burn", payload: {} });
    expect(scoreOf(game, "p1")).toBe(21000);
    expect(scoreOf(game, "p2")).toBe(21000);
    expect(scoreOf(game, "p3")).toBe(21000);
    expect(scoreOf(game, "p0")).toBe(25000 + 12000);
  });
});
