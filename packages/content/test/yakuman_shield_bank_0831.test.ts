/**
 * 역만 방어술 — **면제분은 뱅크가 낸다. 화료자의 수령액은 깎지 않는다.** (2026-08-31)
 *
 * 배경: QA synergy4 disrupt 「역만 방어술 3장이면 화료자 수령이 0」.
 * 예전 구현은 환급분을 화료자의 이득에서 (이득 한도까지) 차감했다. 그래서 방어막이
 * 여럿 깔리면 32,000 역만 쯔모의 화료자가 본장 300점만 받았다. 그런데 같은 카드의
 * **유국역만 경로는 정반대 정책**("면제분은 뱅크가 낸다 — 화료자 몫은 깎지 않는다",
 * nagashi_yakuman.ts)을 명시하고 있었다. 유국역만 쪽으로 통일한다.
 *
 * 되돌리면(= 화료자 차감 루프를 되살리면) 아래 화료자 수령 단언이 전부 실패한다.
 */

import { describe, expect, it } from "vitest";
import {
  ROUND_SETTLED,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  PlayerId,
  RoundSettledPayload,
  WinInfo,
} from "@majak/core";
import { craft } from "./helpers.js";
import { yakumanShield } from "../src/augments/yakuman_shield.js";

type Game = ReturnType<typeof createStandardGameFromState>;

function blank(): GameState {
  return craft({
    hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
}

function withShields(holders: readonly PlayerId[]): Game {
  const base = blank();
  const seeded: GameState = {
    ...base,
    players: base.players.map((p) =>
      holders.includes(p.id) ? { ...p, augments: [...p.augments, yakumanShield.id] } : p,
    ),
  };
  const game = createStandardGameFromState(seeded, undefined, [yakumanShield]);
  for (const h of holders) {
    installAugment(game.engine, yakumanShield, h, { yaku: game.yaku });
  }
  return game;
}

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

function win(o: Partial<WinInfo> & { winner: PlayerId; winType: "ron" | "tsumo"; points: number }): WinInfo {
  return {
    from: null,
    han: 13,
    fu: 30,
    yaku: [],
    yakumanCount: 0,
    doraHan: 0,
    uraHan: 0,
    redHan: 0,
    limit: null,
    ...o,
  } as WinInfo;
}

function winPayload(
  g: Game,
  deltas: Record<PlayerId, number>,
  winInfos: WinInfo[],
  honba = 1,
): RoundSettledPayload {
  const r = g.engine.state.round;
  return {
    outcome: "win",
    deltas,
    dealerSeat: r.dealerSeat,
    honba,
    riichiPot: 0,
    roundNumber: r.roundNumber,
    prevalentWind: r.prevalentWind,
    winInfos,
  } as RoundSettledPayload;
}

/** 자 역만 쯔모 32,000 + 본장 1 — p0가 오야(16,000), p2·p3가 자(8,000) */
const YAKUMAN_TSUMO: WinInfo = win({
  winner: "p1",
  winType: "tsumo",
  points: 32000,
  honbaBonus: 300,
  yakumanCount: 1,
  limit: "yakuman",
  payments: { dealer: 16000, others: 8000 },
});
const BASE_DELTAS = { p0: -16100, p1: 32300, p2: -8100, p3: -8100 } as Record<PlayerId, number>;

describe("yakuman_shield — 면제분은 뱅크가 낸다", () => {
  it.each([
    [[] as PlayerId[], { p0: -16100, p2: -8100, p3: -8100 }, 0],
    [["p0"] as PlayerId[], { p0: -100, p2: -8100, p3: -8100 }, 16000],
    [["p0", "p2"] as PlayerId[], { p0: -100, p2: -100, p3: -8100 }, 24000],
    [["p0", "p2", "p3"] as PlayerId[], { p0: -100, p2: -100, p3: -100 }, 32000],
  ])("방어막 %s장 — 화료자는 언제나 32,300을 받는다", (holders, losers, issued) => {
    const g = withShields(holders);
    const out = settle(g, winPayload(g, { ...BASE_DELTAS }, [YAKUMAN_TSUMO]));

    // ★ 핵심: 남이 몇 장 들었든 화료자의 수령은 표준 정산 그대로다.
    expect(out.deltas["p1"]).toBe(32300);
    for (const [id, v] of Object.entries(losers)) {
      // 방어막을 든 사람은 본장 100만 남고, 안 든 사람은 그대로 문다.
      expect(out.deltas[id as PlayerId]).toBe(v);
    }
    // 뱅크 발행액 = 면제분 합 (이중 감면이 없다는 확인이기도 하다 —
    // 겹쳐 깎였다면 여기가 16,000의 배수를 넘거나 화료자 몫이 줄어든다)
    const sum = Object.values(out.deltas).reduce((s, v) => s + v, 0);
    expect(sum).toBe(issued);
  });

  it("역만 직격(론)도 화료자 수령은 그대로", () => {
    const g = withShields(["p0"]);
    const out = settle(
      g,
      winPayload(g, { p0: -32600, p1: 32600, p2: 0, p3: 0 }, [
        win({
          winner: "p1",
          winType: "ron",
          from: "p0",
          points: 32000,
          honbaBonus: 600,
          yakumanCount: 1,
          limit: "yakuman",
          payments: { discarder: 32000 },
        }),
      ]),
    );
    expect(out.deltas["p0"]).toBe(-600); // 본장만 남는다
    expect(out.deltas["p1"]).toBe(32600); // 깎이지 않는다
  });

  it("배만 절반 방어에서도 화료자 수령은 그대로", () => {
    const g = withShields(["p0"]);
    const out = settle(
      g,
      winPayload(g, { p0: -16000, p1: 16000, p2: 0, p3: 0 }, [
        win({
          winner: "p1",
          winType: "ron",
          from: "p0",
          points: 16000,
          limit: "baiman",
          payments: { discarder: 16000 },
        }),
      ], 0),
    );
    expect(out.deltas["p0"]).toBe(-8000); // 절반만 맞는다
    expect(out.deltas["p1"]).toBe(16000);
  });

  it("같은 국의 평범한 화료는 방어막에 깎이지 않는다 (더블론)", () => {
    const g = withShields(["p0"]);
    // p1 역만 론(직격) + p2 3,900 론 — p0가 둘 다 문다
    const out = settle(
      g,
      winPayload(
        g,
        { p0: -35900, p1: 32000, p2: 3900, p3: 0 },
        [
          win({
            winner: "p1",
            winType: "ron",
            from: "p0",
            points: 32000,
            yakumanCount: 1,
            limit: "yakuman",
            payments: { discarder: 32000 },
          }),
          win({ winner: "p2", winType: "ron", from: "p0", points: 3900, payments: { discarder: 3900 } }),
        ],
        0,
      ),
    );
    expect(out.deltas["p0"]).toBe(-3900); // 역만분만 면제
    expect(out.deltas["p1"]).toBe(32000);
    expect(out.deltas["p2"]).toBe(3900);
  });
});
