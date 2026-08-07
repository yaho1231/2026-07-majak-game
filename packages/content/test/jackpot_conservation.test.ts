/**
 * 일확천금 0.5배 — **점수 보존**과 무페널티 회귀 테스트 (2026-08-07).
 *
 * 버그: Multiply 단계가 보유자의 양수 델타만 절반으로 줄이고 지불자의 델타는
 * 표준 금액 그대로 뒀다. 차액이 어디에도 가지 않고 사라져
 *   합계 -24100 · deltas {p2: -48300, p3: +24200}
 * 같은 정산이 나왔다(총점 100,000 → 80,300). 방총자는 화료자가 받지도 않는
 * 점수를 물어 "증강이 없었을 때보다 나빠진다" — §0 무페널티 위반.
 *
 * 고친 뒤: 깎인 몫은 지금 실제로 내는 사람들에게 낸 비율대로 되돌아간다.
 *   ① 네 사람 델타의 합이 배수 적용 전과 **정확히 같다** (뱅크 발행/소멸 0).
 *   ② 지불자는 바닐라(배수 없음)보다 **절대 더 내지 않는다.**
 *   ③ 2·3배(상방)는 종전대로 뱅크가 발행한다 — 상대가 더 내지 않는다.
 */

import { describe, expect, it } from "vitest";
import { ROUND_SETTLED, createStandardGameFromState, installAugment } from "@majak/core";
import type { GameState, PlayerId, RoundSettledPayload } from "@majak/core";
import { craft } from "./helpers.js";
import { jackpot } from "../src/augments/jackpot.js";
import { roundKey } from "../src/util.js";

type Game = ReturnType<typeof createStandardGameFromState>;

/** p0가 이번 국에 배수를 뽑아 둔 상태 (mult=null이면 증강 없음 = 바닐라) */
function scene(mult: number | null, pot = 0): Game {
  const base = craft({
    hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const rk = roundKey(base);
  const state: GameState = {
    ...base,
    players: base.players.map((p) =>
      p.id === "p0" ? { ...p, augments: mult === null ? [] : ["jackpot"] } : p,
    ),
    round: { ...base.round, riichiPot: pot },
    augmentData: {
      ...base.augmentData,
      ...(mult === null ? {} : { [`jackpot:mult:${rk}:p0`]: mult }),
    },
  };
  const game = createStandardGameFromState(state, undefined, mult === null ? [] : [jackpot]);
  if (mult !== null) installAugment(game.engine, jackpot, "p0", { yaku: game.yaku });
  return game;
}

const winInfo = (
  winType: "ron" | "tsumo",
  from: PlayerId | null,
  points: number,
): RoundSettledPayload["winInfos"] extends (infer T)[] ? T : never =>
  ({
    winner: "p0" as PlayerId,
    from,
    winType,
    points,
    han: 3,
    fu: 30,
    yaku: [],
    yakumanCount: 0,
  }) as never;

/** ROUND_SETTLED를 정산 인터셉터 체인에 흘려 최종 payload를 얻는다 */
function settle(game: Game, payload: RoundSettledPayload): RoundSettledPayload {
  let out = payload;
  for (const { intercept } of game.engine.effects.interceptorsFor(ROUND_SETTLED)) {
    const r = intercept(
      { type: ROUND_SETTLED, payload: out },
      { state: game.engine.state, rules: game.engine.rules },
    );
    if (r !== null) out = r.payload as RoundSettledPayload;
  }
  return out;
}

const sum = (d: Record<PlayerId, number>): number =>
  Object.values(d).reduce((s, v) => s + v, 0);

/** 론: p2가 p0에게 쐈다 (실측 버그 재현값 24,100 사라짐에 대응) */
function ronPayload(g: Game, points: number, pot = 0): RoundSettledPayload {
  return {
    outcome: "win",
    deltas: { p0: points + pot, p1: 0, p2: -points, p3: 0 },
    dealerSeat: g.engine.state.round.dealerSeat,
    honba: 0,
    riichiPot: pot,
    roundNumber: g.engine.state.round.roundNumber,
    prevalentWind: g.engine.state.round.prevalentWind,
    winInfos: [winInfo("ron", "p2", points)],
  } as RoundSettledPayload;
}

/** 쯔모: p1 2000 · p2 1000 · p3 1000 (친 p0 기준 분배는 아니지만 비율 검증용) */
function tsumoPayload(g: Game): RoundSettledPayload {
  return {
    outcome: "win",
    deltas: { p0: 8100, p1: -4100, p2: -2000, p3: -2000 },
    dealerSeat: g.engine.state.round.dealerSeat,
    honba: 0,
    riichiPot: 0,
    roundNumber: g.engine.state.round.roundNumber,
    prevalentWind: g.engine.state.round.prevalentWind,
    winInfos: [winInfo("tsumo", null, 8100)],
  } as RoundSettledPayload;
}

describe("일확천금 0.5배 — 정산 총합이 보존된다", () => {
  it("론 24000: 사라지는 점수가 0이다 (예전엔 12000이 증발했다)", () => {
    const vanilla = settle(scene(null), ronPayload(scene(null), 24000));
    const half = settle(scene(0.5), ronPayload(scene(0.5), 24000));

    expect(sum(vanilla.deltas)).toBe(0);
    expect(sum(half.deltas)).toBe(0); // ← 예전 -12000
    expect(half.deltas["p0"]).toBe(12000); // 획득은 절반 그대로
    expect(half.deltas["p2"]).toBe(-12000); // 지불자가 그만큼 덜 낸다
  });

  it("지불자는 바닐라보다 절대 더 내지 않는다 (무페널티)", () => {
    for (const points of [1000, 2900, 3900, 8000, 12000, 16000, 24100, 48000]) {
      const vanilla = settle(scene(null), ronPayload(scene(null), points));
      const half = settle(scene(0.5), ronPayload(scene(0.5), points));
      expect(sum(half.deltas)).toBe(sum(vanilla.deltas));
      for (const id of ["p1", "p2", "p3"] as PlayerId[]) {
        expect(half.deltas[id] ?? 0).toBeGreaterThanOrEqual(vanilla.deltas[id] ?? 0);
      }
      // 델타는 100점 격자를 벗어나지 않는다
      for (const v of Object.values(half.deltas)) expect(Math.abs(v % 100)).toBe(0);
    }
  });

  it("쯔모 — 되돌림이 낸 비율대로 나뉘고 합계가 정확히 맞는다", () => {
    const half = settle(scene(0.5), tsumoPayload(scene(0.5)));
    expect(sum(half.deltas)).toBe(0);
    // 8100 → 4100(round100). 되돌릴 몫 4000을 4100:2000:2000 비율로.
    expect(half.deltas["p0"]).toBe(4100);
    const refunded =
      (half.deltas["p1"] ?? 0) + 4100 + ((half.deltas["p2"] ?? 0) + 2000) +
      ((half.deltas["p3"] ?? 0) + 2000);
    expect(refunded).toBe(4000);
    // 가장 많이 낸 p1이 가장 많이 돌려받는다
    expect(half.deltas["p1"] ?? 0).toBeGreaterThan(-4100);
    expect((half.deltas["p1"] ?? 0) + 4100).toBeGreaterThanOrEqual(
      (half.deltas["p2"] ?? 0) + 2000,
    );
  });

  it("공탁(리치봉)은 깎임의 대상도 되돌림의 대상도 아니다", () => {
    const pot = 1000;
    const half = settle(scene(0.5, pot), ronPayload(scene(0.5, pot), 8000, pot));
    // 화료분 8000만 4000으로 깎이고 공탁 1000은 그대로 남는다
    expect(half.deltas["p0"]).toBe(4000 + pot);
    expect(half.deltas["p2"]).toBe(-4000);
    // 공탁은 payload 밖(뱅크 보관분)이라 델타 합은 pot만큼 양수다 — 바닐라와 같다
    const vanilla = settle(scene(null, pot), ronPayload(scene(null, pot), 8000, pot));
    expect(sum(half.deltas)).toBe(sum(vanilla.deltas));
  });

  it("되돌릴 지불자가 없으면 깎지 않는다 — 점수 소멸 대신 무효", () => {
    const g = scene(0.5);
    const payload: RoundSettledPayload = {
      ...ronPayload(g, 8000),
      // 전액이 뱅크/공탁에서 온 상황 (지불자 없음)
      deltas: { p0: 8000, p1: 0, p2: 0, p3: 0 },
    };
    const out = settle(g, payload);
    expect(out.deltas["p0"]).toBe(8000);
    expect(sum(out.deltas)).toBe(sum(payload.deltas));
  });
});

describe("일확천금 2·3배 — 상방은 종전대로 뱅크가 발행한다", () => {
  it("지불자의 델타는 바닐라와 완전히 같다", () => {
    for (const mult of [2, 3]) {
      const vanilla = settle(scene(null), ronPayload(scene(null), 8000));
      const up = settle(scene(mult), ronPayload(scene(mult), 8000));
      expect(up.deltas["p0"]).toBe(8000 * mult);
      expect(up.deltas["p2"]).toBe(vanilla.deltas["p2"]);
      // 늘어난 몫만큼만 뱅크가 발행한다
      expect(sum(up.deltas) - sum(vanilla.deltas)).toBe(8000 * (mult - 1));
    }
  });
});
