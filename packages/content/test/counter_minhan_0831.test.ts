/**
 * 카운터의 «손 가치 강탈» 밑값이 격(win.minHan)을 본다 — 2026-08-31 QA synergy4 후속.
 *
 * `counter.ts`의 `bestWinValue`는 선리치자의 대기패마다 가상 론을 평가해 최고 점수를
 * 고른다. 그런데 격(`rank_gate`, win.minHan=5)에 걸린 상대는 **그 손으로 실제로는
 * 화료할 수 없다** — 코어의 표준 론 검증이 WIN_BLOCKED_MIN_HAN으로 막는다.
 * 그런 손을 만점으로 세면 "그 상대가 받았을 점수"라는 전제가 무너져 강탈액이 부푼다.
 *
 * 되돌리면(= belowMinHan 게이트를 빼면) 아래 첫 테스트가 빨개진다.
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
import { counter } from "../src/augments/counter.js";
import { rankGate } from "../src/augments/rank_gate.js";
import { roundScopedKey } from "../src/augments/roundScope.js";

type Game = ReturnType<typeof createStandardGameFromState>;

const H: PlayerId = "p0";
/** 선리치자 = 반격 대상. 탕야오 텐파이(2~8만 · 5s/8s 대기) — 격이 없으면 싸게 오른다. */
const TARGET_HAND = "234m567m234p55p67s";

function base(): GameState {
  const s = craft({
    hands: { p0: "*", p1: TARGET_HAND, p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return { ...s, round: { ...s.round, dealerSeat: 1 } };
}

function withAugs(
  state: GameState,
  spec: readonly { player: PlayerId; def: AugmentDef }[],
  extra: Record<string, unknown>,
): Game {
  const ids = new Map<PlayerId, string[]>();
  for (const { player, def } of spec) {
    ids.set(player, [...(ids.get(player) ?? []), def.id]);
  }
  const seeded: GameState = {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      augments: [...p.augments, ...(ids.get(p.id) ?? [])],
    })),
    augmentData: { ...state.augmentData, ...extra },
  };
  const uniq = [...new Map(spec.map((x) => [x.def.id, x.def])).values()];
  const game = createStandardGameFromState(seeded, undefined, uniq);
  for (const { player, def } of spec) {
    installAugment(game.engine, def, player, { yaku: game.yaku, catalog: game.augments });
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

/** p0(자)가 p2에게서 3판30부 론 — 직격(+3판)이 아닌 경로라 강탈액만 본다 */
function ronPayload(g: Game): RoundSettledPayload {
  const r = g.engine.state.round;
  return {
    outcome: "win",
    deltas: { p0: 3900, p1: 0, p2: -3900, p3: 0 },
    dealerSeat: r.dealerSeat,
    honba: 0,
    riichiPot: 0,
    roundNumber: r.roundNumber,
    prevalentWind: r.prevalentWind,
    winInfos: [
      {
        winner: "p0",
        winType: "ron",
        from: "p2",
        points: 3900,
        han: 3,
        fu: 30,
        yaku: [],
        yakumanCount: 0,
        doraHan: 0,
        uraHan: 0,
        redHan: 0,
        limit: null,
      } as unknown as WinInfo,
    ],
  } as RoundSettledPayload;
}

const counterSeed = {
  [`counter:prev:${H}`]: "p1",
  [`counter:struck:${H}`]: true,
};

const gain = (out: RoundSettledPayload): number =>
  ((out.augPoints ?? []) as { augId: string; player: string; points: number }[])
    .filter((n) => n.player === H && n.augId === "counter")
    .reduce((s, n) => s + n.points, 0);

describe("카운터 손 가치 강탈 — 격(win.minHan)에 걸린 손은 0으로 센다", () => {
  it("격이 없으면 선리치자의 손 가치를 그대로 강탈한다 (밑값 확인)", () => {
    const g = withAugs(base(), [{ player: H, def: counter }], counterSeed);
    expect(gain(settle(g, ronPayload(g)))).toBeGreaterThan(0);
  });

  it("p1이 격(5판)에 지목당했으면 강탈액이 0이다", () => {
    const s = base();
    const g = withAugs(
      s,
      [
        { player: H, def: counter },
        { player: "p2", def: rankGate },
      ],
      { ...counterSeed, [roundScopedKey("rank_gate", "mark", s, "p2")]: "p1" },
    );
    // 게이트가 실제로 서 있는지 확인 (지목이 안 걸렸다면 이 테스트는 무의미하다)
    expect(
      g.engine.rules.resolve<number>("win.minHan", {
        playerId: "p1",
        state: g.engine.state,
      }),
    ).toBe(5);
    expect(gain(settle(g, ronPayload(g)))).toBe(0);
  });
});
