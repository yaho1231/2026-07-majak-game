/**
 * 정산 리그 (aug-1 전용) — qa-lab/score-a/settleRig.ts 를 그대로 쓰되
 * **같은 증강을 여러 좌석이 드는 경우**를 지원한다(카탈로그 중복 등록 금지 회피).
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
import { craft } from "../../../packages/content/test/helpers.js";

export type Game = ReturnType<typeof createStandardGameFromState>;

export function scene(opts: {
  augments: Partial<Record<PlayerId, readonly AugmentDef[]>>;
  data?: Record<string, unknown>;
  potBefore?: number;
  honba?: number;
  dealerSeat?: number;
  scores?: Partial<Record<PlayerId, number>>;
}): Game {
  const base = craft({
    hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const defs: AugmentDef[] = [];
  const seen = new Set<string>();
  for (const list of Object.values(opts.augments)) {
    for (const d of list ?? []) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      defs.push(d);
    }
  }
  const state: GameState = {
    ...base,
    players: base.players.map((p) => ({
      ...p,
      score: opts.scores?.[p.id] ?? p.score,
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

export function realWinPayload(g: Game, o: {
  deltas: Record<string, number>;
  winInfos: WinInfo[];
  honba?: number;
}): RoundSettledPayload {
  return {
    outcome: "win",
    deltas: o.deltas as Record<PlayerId, number>,
    dealerSeat: g.engine.state.round.dealerSeat,
    honba: o.honba ?? 0,
    riichiPot: 0,
    roundNumber: g.engine.state.round.roundNumber,
    prevalentWind: g.engine.state.round.prevalentWind,
    winInfos: o.winInfos,
  } as RoundSettledPayload;
}

export function drawPayload(g: Game, o: {
  deltas: Record<string, number>;
  tenpaiPlayers?: PlayerId[];
}): RoundSettledPayload {
  return {
    outcome: "draw",
    deltas: o.deltas as Record<PlayerId, number>,
    dealerSeat: g.engine.state.round.dealerSeat,
    honba: 0,
    riichiPot: g.engine.state.round.riichiPot,
    roundNumber: g.engine.state.round.roundNumber,
    prevalentWind: g.engine.state.round.prevalentWind,
    ...(o.tenpaiPlayers !== undefined ? { tenpaiPlayers: o.tenpaiPlayers } : {}),
  } as RoundSettledPayload;
}

export const sum = (d: Record<string, number>): number =>
  Object.values(d).reduce((s, v) => s + v, 0);

export const roundKeyOf = (g: Game): string => {
  const r = g.engine.state.round;
  return `${r.prevalentWind}-${r.roundNumber}-${r.honba}`;
};
