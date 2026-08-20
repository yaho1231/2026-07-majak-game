/**
 * 모 아니면 도 (all_or_nothing) — 판돈은 **그 리치로** 화료했을 때만 나온다.
 *
 * 정산 게이트가 "판돈이 걸려 있고 내가 화료했는가"뿐이라, 승부수·손바닥 뒤집기로
 * 리치를 풀고 완전히 다른 손으로 화료해도 판돈 전액이 지급됐다(docs/25 P10).
 * detail이 약속하는 것은 "그 리치로 화료하면"이다.
 */

import { describe, expect, it } from "vitest";
import {
  ROUND_SETTLED,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type { GameState, PlayerId, RoundSettledPayload } from "@majak/core";
import { craft } from "./helpers.js";
import { allOrNothing } from "../src/augments/all_or_nothing.js";

const RIICHI = { double: false, ippatsu: false, discardIndex: 0 };
const ALL_IN = 12000;

const activeKeyOf = (s: GameState, h: PlayerId): string =>
  `all_or_nothing:active:${s.round.prevalentWind}-${s.round.roundNumber}-${s.round.honba}:${h}#round`;

/** 판돈이 걸린 상태. riichi=true면 그 리치가 아직 살아 있다. */
function scene(riichi: boolean): GameState {
  const base = craft({
    hands: { p0: "123m456m789m123p11s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
  });
  const withAug: GameState = {
    ...base,
    players: base.players.map((p) =>
      p.id === "p0" ? { ...p, augments: ["all_or_nothing"] } : p,
    ),
    augmentData: { ...base.augmentData, [activeKeyOf(base, "p0")]: ALL_IN },
  };
  if (!riichi) return withAug;
  return {
    ...withAug,
    round: {
      ...withAug.round,
      byPlayer: {
        ...withAug.round.byPlayer,
        p0: { ...withAug.round.byPlayer["p0"]!, riichi: RIICHI },
      },
    },
  };
}

/** p0 화료 정산 이벤트를 인터셉터에 통과시키고 최종 deltas를 돌려준다 */
function settle(state: GameState): Record<PlayerId, number> {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, allOrNothing, "p0", { yaku: game.yaku });
  const payload: RoundSettledPayload = {
    outcome: "win",
    deltas: { p0: 8000, p1: -8000, p2: 0, p3: 0 },
    dealerSeat: state.round.dealerSeat,
    honba: 0,
    riichiPot: 0,
    roundNumber: state.round.roundNumber,
    prevalentWind: state.round.prevalentWind,
    winInfos: [
      {
        winner: "p0",
        from: "p1",
        winType: "ron",
        winningTileId: 0,
        han: 3,
        fu: 30,
        yakumanCount: 0,
        extraHan: 0,
        yaku: [],
        doraHan: 0,
        uraHan: 0,
        redHan: 0,
        points: 8000,
        limit: null,
      },
    ],
  };
  const out = game.engine.effects
    .interceptorsFor(ROUND_SETTLED)
    .reduce<{ type: string; payload: unknown }>(
      (ev, i) =>
        i.intercept(ev, { state: game.engine.state, rules: game.engine.rules } as never) ??
        ev,
      { type: ROUND_SETTLED, payload },
    );
  return (out.payload as RoundSettledPayload).deltas;
}

describe("모 아니면 도 — 판돈은 그 리치로 화료했을 때만", () => {
  it("리치가 살아 있으면 판돈이 지급된다", () => {
    expect(settle(scene(true))["p0"]).toBe(8000 + ALL_IN);
  });

  it("리치를 취소했으면 판돈이 나오지 않는다", () => {
    expect(settle(scene(false))["p0"]).toBe(8000);
  });
});
