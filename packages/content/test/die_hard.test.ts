/**
 * die_hard (죽기살기) 테스트 — 게임당 1회, **정산 시점 내 점수가 12,500 이하**이면
 * 그 국의 실점이 그대로 플러스로 뒤집힌다 (−8000 → +8000).
 *
 * 2026-08-27 사양 교체: 옛 트리거("정산 결과 점수가 0 미만")를 못박고 있던 테스트를
 * 새 사양으로 고쳤다.
 */

import { describe, expect, it } from "vitest";
import {
  ROUND_SETTLED,
  createStandardGameFromState,
  discardsZone,
  installAugment,
} from "@majak/core";
import type { GameState, RoundSettledPayload, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { dieHard } from "../src/augments/die_hard.js";

const SYS = "__system";
const USES_KEY = "die_hard:uses:p0";

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

/**
 * 이번 정산에서 이 사람이 실제로 받은 증감(deltas).
 *
 * 2026-07-29 감사 이후 부활분은 별도 ScoreChanged가 아니라 **정산 deltas에 실린다** —
 * 결과 화면의 증감 표시와 실제 점수가 어긋나지 않게 하기 위해서다.
 */
function settleDelta(game: Game, id: string): number | undefined {
  const e = [...game.engine.eventLog]
    .reverse()
    .find((ev) => ev.type === ROUND_SETTLED);
  if (e === undefined) return undefined;
  return (e.payload as RoundSettledPayload).deltas[id];
}

/** 증강 없이 같은 정산을 돌렸을 때 p0가 잃는 금액 (양수) */
function plainLoss(p0Score: number): number {
  const plain = createStandardGameFromState(craftRonSetup(p0Score));
  runRonSettle(plain);
  return -(settleDelta(plain, "p0") as number);
}

describe("die_hard (죽기살기)", () => {
  it("점수가 시작 점수 절반 이하면 0 아래로 떨어지지 않아도 실점이 플러스로 뒤집힌다", () => {
    // 12,500(= 25,000의 절반) — 론을 맞아도 점수는 여전히 양수다. 옛 사양이라면
    // 발동하지 않았을 자리다.
    const loss = plainLoss(12_500);
    expect(loss).toBeGreaterThan(0);

    const game = createStandardGameFromState(craftRonSetup(12_500));
    installAugment(game.engine, dieHard, "p0");
    runRonSettle(game);

    expect(settleDelta(game, "p0")).toBe(loss); // −loss → +loss
    expect(scoreOf(game, "p0")).toBe(12_500 + loss);
    expect(game.engine.state.augmentData[USES_KEY]).toBe(1);
  });

  it("사용자 예시: 방총해도 상대와 내가 **같은 금액**을 나란히 받는다", () => {
    // "8000점을 론당하면 상대는 8000점을 얻고, 나도 뱅크에서 8000점을 얻는다."
    const game = createStandardGameFromState(craftRonSetup(12_500));
    installAugment(game.engine, dieHard, "p0");
    runRonSettle(game);

    const mine = settleDelta(game, "p0") as number;
    const theirs = settleDelta(game, "p1") as number;
    expect(mine).toBeGreaterThan(0);
    expect(mine).toBe(theirs); // 상대 +X · 나도 +X — 차액은 뱅크가 낸다
  });

  it("점수가 절반보다 많으면 발동하지 않는다", () => {
    const game = createStandardGameFromState(craftRonSetup(12_600));
    installAugment(game.engine, dieHard, "p0");
    runRonSettle(game);

    expect(settleDelta(game, "p0")).toBeLessThan(0);
    expect(game.engine.state.augmentData[USES_KEY]).toBeUndefined(); // 카운터 소모 없음
  });

  it("증강이 없으면 같은 상황에서 점수가 음수가 된다 (대조군)", () => {
    const game = createStandardGameFromState(craftRonSetup(1000));
    runRonSettle(game);
    expect(scoreOf(game, "p0")).toBeLessThan(0);
  });

  it("이미 한 번 썼으면 반장전이어도 다시 발동하지 않는다 (게임당 1회)", () => {
    const base = craftRonSetup(1000);
    const spent: GameState = {
      ...base,
      augmentData: { ...base.augmentData, [USES_KEY]: 1 },
    };
    const game = createStandardGameFromState(spent);
    installAugment(game.engine, dieHard, "p0");
    runRonSettle(game);

    expect(scoreOf(game, "p0")).toBeLessThan(0); // 재발동 없음
  });

  it("문안이 새 사양(게임 내 1회 · 12,500 이하)을 그대로 적는다", () => {
    expect(dieHard.description).toMatch(/게임 내 1회/);
    expect(dieHard.description).toMatch(/12,500/);
    expect(dieHard.detail).toMatch(/게임 내 1회/);
  });
});
