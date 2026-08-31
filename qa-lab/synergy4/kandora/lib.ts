/**
 * synergy4 «깡·도라·타점» 축 — 정산(ROUND_SETTLED) 실험대.
 *
 * packages/content/test/settle_synergy_0823.test.ts 의 픽스처 규약을 그대로 쓴다
 * (같은 인터셉터 파이프라인을 손으로 돌린다). 소스는 건드리지 않는다.
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
import { roundKey } from "../../../packages/content/src/util.js";
import { roundScopedKey } from "../../../packages/content/src/augments/roundScope.js";

export { roundKey, roundScopedKey };
export type { GameState, PlayerId, RoundSettledPayload, WinInfo, AugmentDef };

export type Game = ReturnType<typeof createStandardGameFromState>;

export function blank(score = 25000, dealerSeat = 0): GameState {
  const base = craft({
    hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return {
    ...base,
    players: base.players.map((p) => ({ ...p, score })),
    round: { ...base.round, dealerSeat },
  };
}

export function withAugs(
  state: GameState,
  spec: readonly { player: PlayerId; def: AugmentDef }[],
  extra: (s: GameState) => Record<string, unknown> = () => ({}),
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
    augmentData: { ...state.augmentData, ...extra(state) },
  };
  const uniq = [...new Map(spec.map((x) => [x.def.id, x.def])).values()];
  const game = createStandardGameFromState(seeded, undefined, uniq);
  for (const { player, def } of spec) {
    installAugment(game.engine, def, player, { yaku: game.yaku, catalog: game.augments });
  }
  return game;
}

/** 정산 인터셉터 파이프라인을 우선순위 순서대로 한 번 돌린다 */
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

export const sum = (d: Record<PlayerId, number>): number =>
  Object.values(d).reduce((s, v) => s + v, 0);

export function win(
  o: Partial<WinInfo> & { winner: PlayerId; winType: "ron" | "tsumo"; points: number },
): WinInfo {
  return {
    from: null,
    han: 3,
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

export function winPayload(
  g: Game,
  deltas: Record<PlayerId, number>,
  winInfos: WinInfo[],
  over: Partial<RoundSettledPayload> = {},
): RoundSettledPayload {
  const r = g.engine.state.round;
  return {
    outcome: "win",
    deltas,
    dealerSeat: r.dealerSeat,
    honba: 0,
    riichiPot: 0,
    roundNumber: r.roundNumber,
    prevalentWind: r.prevalentWind,
    winInfos,
    ...over,
  } as RoundSettledPayload;
}

export function augPointsOf(out: RoundSettledPayload, player?: PlayerId): { augId: string; player: string; points: number }[] {
  return ((out.augPoints ?? []) as { augId: string; player: string; points: number }[])
    .filter((n) => player === undefined || n.player === player);
}

export function show(label: string, out: RoundSettledPayload): void {
  const d = out.deltas;
  console.log(
    `${label.padEnd(34)} p0=${String(d["p0"]).padStart(8)} p1=${String(d["p1"]).padStart(8)} ` +
      `p2=${String(d["p2"]).padStart(7)} p3=${String(d["p3"]).padStart(7)} | 합=${String(sum(d)).padStart(8)}` +
      ` | augPoints=[${augPointsOf(out).map((n) => `${n.augId}/${n.player}:${n.points}`).join(", ")}]`,
  );
}
