/**
 * 정산 인터셉터 리그 — 실제 sysSettleWin이 만드는 payload 모양 그대로
 * ROUND_SETTLED를 인터셉터 체인에 흘린다.
 *
 * ⚠ 핵심: 진짜 엔진은 화료 정산에서 `payload.riichiPot = 0`을 싣는다
 * (packages/core/src/mahjong/flow/standardActions.ts:1113). 회수한 공탁 금액은
 * `winInfos[0].riichiPotGain`에만 남는다. content 테스트의 픽스처는 payload.riichiPot에
 * 회수액을 넣어 두어(= 엔진과 다른 모양) 이 차이를 덮고 있다.
 */
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
import { craft } from "../../packages/content/test/helpers.js";

export type Game = ReturnType<typeof createStandardGameFromState>;

export function scene(opts: {
  augments: Partial<Record<PlayerId, readonly AugmentDef[]>>;
  data?: Record<string, unknown>;
  potBefore?: number;
  honba?: number;
  dealerSeat?: number;
}): Game {
  const base = craft({
    hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const defs: AugmentDef[] = [];
  for (const list of Object.values(opts.augments)) for (const d of list ?? []) defs.push(d);
  const state: GameState = {
    ...base,
    players: base.players.map((p) => ({
      ...p,
      augments: (opts.augments[p.id] ?? []).map((d) => d.id),
    })),
    round: {
      ...base.round,
      riichiPot: opts.potBefore ?? 0,
      honba: opts.honba ?? 0,
      ...(opts.dealerSeat !== undefined ? { dealerSeat: opts.dealerSeat } : {}),
    },
    augmentData: { ...base.augmentData, ...(opts.data ?? {}) },
  };
  const game = createStandardGameFromState(state, undefined, defs);
  for (const [pid, list] of Object.entries(opts.augments)) {
    for (const d of list ?? []) {
      installAugment(game.engine, d, pid as PlayerId, { yaku: game.yaku });
    }
  }
  return game;
}

export function settle(game: Game, payload: RoundSettledPayload): RoundSettledPayload {
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

export const win = (o: Partial<WinInfo> & { winner: PlayerId; points: number }): WinInfo =>
  ({
    from: null,
    winType: "tsumo",
    han: 3,
    fu: 30,
    yakumanCount: 0,
    yaku: [],
    limit: null,
    ...o,
  }) as unknown as WinInfo;

/** 엔진이 실제로 만드는 화료 정산 payload (riichiPot=0, 회수액은 winInfo.riichiPotGain) */
export function realWinPayload(g: Game, o: {
  deltas: Record<string, number>;
  winInfos: WinInfo[];
}): RoundSettledPayload {
  return {
    outcome: "win",
    deltas: o.deltas as Record<PlayerId, number>,
    dealerSeat: g.engine.state.round.dealerSeat,
    honba: 0,
    riichiPot: 0, // ← sysSettleWin과 동일
    roundNumber: g.engine.state.round.roundNumber,
    prevalentWind: g.engine.state.round.prevalentWind,
    winInfos: o.winInfos,
  } as RoundSettledPayload;
}

export const sum = (d: Record<string, number>): number =>
  Object.values(d).reduce((s, v) => s + v, 0);
