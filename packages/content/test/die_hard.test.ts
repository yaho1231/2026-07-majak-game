/**
 * die_hard (죽기살기) 테스트 — 게임당 1회, 정산으로 점수가 0 미만이 되면
 * 부족분을 환급받아 정확히 0에서 멈춘다 (도비 방지).
 */

import { describe, expect, it } from "vitest";
import {
  SCORE_CHANGED,
  createStandardGameFromState,
  discardsZone,
  installAugment,
} from "@majak/core";
import type {
  GameState,
  ScoreChangedPayload,
  TileId,
} from "@majak/core";
import { craft } from "./helpers.js";
import { dieHard } from "../src/augments/die_hard.js";

const SYS = "__system";
const USED_KEY = "die_hard:used:p0";

type Game = ReturnType<typeof createStandardGameFromState>;

/** p1이 p0의 버림패(5s)를 론할 수 있는 상태 — p0 점수를 원하는 값으로 세팅 */
function craftRonSetup(p0Score?: number): GameState {
  const base = craft({
    hands: {
      p0: "*",
      p1: "234m345p345s678s5s", // 5s 탕키 탕야오
      p2: "*",
      p3: "*",
    },
    discards: { p0: "5s" }, // p0의 방총패
    phase: "turn.act",
    turnSeat: 0,
  });
  if (p0Score === undefined) return base;
  return {
    ...base,
    players: base.players.map((pl) =>
      pl.id === "p0" ? { ...pl, score: p0Score } : pl,
    ),
  };
}

/** p1이 p0를 론으로 잡는 정산을 실행한다 */
function runRonSettle(game: Game): void {
  const ronTile = game.engine.state.zones[discardsZone("p0")]?.tileIds[0] as TileId;
  const r = game.engine.submit({
    player: SYS,
    type: "sys.settleWin",
    payload: { wins: [{ winner: "p1", from: "p0", tileId: ronTile, winType: "ron" }] },
  });
  if (!r.ok) throw new Error(r.reason);
}

function scoreOf(game: Game, id: string): number {
  return game.engine.state.players.find((p) => p.id === id)?.score ?? 0;
}

/** reason이 일치하는 SCORE_CHANGED 이벤트를 찾는다 */
function bonusEvent(game: Game, reason: string): ScoreChangedPayload | undefined {
  const e = game.engine.eventLog.find(
    (ev) =>
      ev.type === SCORE_CHANGED &&
      (ev.payload as ScoreChangedPayload).reason === reason,
  );
  return e === undefined ? undefined : (e.payload as ScoreChangedPayload);
}

describe("die_hard (죽기살기)", () => {
  it("지불이 점수를 초과하면 정확히 0에서 멈추고 사용 플래그가 남는다", () => {
    // p0 점수 1000 < 론 지불(탕야오 멘젠 론 ≥ 1300) → 증강 없으면 음수
    const game = createStandardGameFromState(craftRonSetup(1000));
    installAugment(game.engine, dieHard, "p0");
    runRonSettle(game);

    expect(scoreOf(game, "p0")).toBe(0); // 정확히 0 — 도비(0 미만) 회피
    expect(game.engine.state.augmentData[USED_KEY]).toBe(true);
    const refund = bonusEvent(game, "die_hard");
    expect(refund?.player).toBe("p0");
    expect(refund?.delta).toBeGreaterThan(0); // 부족분만큼 환급
  });

  it("증강이 없으면 같은 상황에서 점수가 음수가 된다 (대조군)", () => {
    const game = createStandardGameFromState(craftRonSetup(1000));
    runRonSettle(game);
    expect(scoreOf(game, "p0")).toBeLessThan(0);
  });

  it("이미 사용했으면 발동하지 않는다 (게임당 1회)", () => {
    const base = craftRonSetup(1000);
    const spent: GameState = {
      ...base,
      augmentData: { ...base.augmentData, [USED_KEY]: true },
    };
    const game = createStandardGameFromState(spent);
    installAugment(game.engine, dieHard, "p0");
    runRonSettle(game);

    expect(scoreOf(game, "p0")).toBeLessThan(0); // 재발동 없음
    expect(bonusEvent(game, "die_hard")).toBeUndefined();
  });

  it("점수가 0 미만으로 떨어지지 않는 정산에서는 발동하지 않는다", () => {
    // 기본 25000점 — 론 지불 후에도 충분히 양수
    const game = createStandardGameFromState(craftRonSetup());
    installAugment(game.engine, dieHard, "p0");
    runRonSettle(game);

    expect(scoreOf(game, "p0")).toBeGreaterThan(0);
    expect(game.engine.state.augmentData[USED_KEY]).toBeUndefined(); // 플래그 소모 없음
    expect(bonusEvent(game, "die_hard")).toBeUndefined();
  });
});
