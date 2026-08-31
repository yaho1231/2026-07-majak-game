/** 후로·친·손익 축 공용 도구 (QA 전용 — packages/ 는 건드리지 않는다). */
export * from "../riichi/lib.js";
import type { GameState, PlayerId, RoundSettledPayload } from "@majak/core";

export function withScores(
  state: GameState,
  scores: Partial<Record<PlayerId, number>>,
): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      scores[p.id] === undefined ? p : { ...p, score: scores[p.id] as number },
    ),
  };
}

export function withData(
  state: GameState,
  data: Record<string, unknown>,
): GameState {
  return { ...state, augmentData: { ...state.augmentData, ...data } };
}

export function roundKeyOf(state: GameState): string {
  const r = state.round;
  return `${r.prevalentWind}-${r.roundNumber}-${r.honba}`;
}

/** sign_flip 등 armOnNextRound 계열을 이번 국에 강제로 켠다 */
export function arm(state: GameState, augId: string, holder: PlayerId): GameState {
  return withData(state, { [`${augId}:armedRound:${holder}`]: roundKeyOf(state) });
}

export function deltasOf(s: RoundSettledPayload): string {
  return (["p0", "p1", "p2", "p3"] as PlayerId[])
    .map((p) => `${p}=${s.deltas[p] ?? 0}`)
    .join(" ");
}

export function augPointsOf(s: RoundSettledPayload): string {
  return (s.augPoints ?? [])
    .map((n) => `${n.augId}/${n.player}=${n.points}`)
    .join(" ") || "-";
}

export function sumDeltas(s: RoundSettledPayload): number {
  return (["p0", "p1", "p2", "p3"] as PlayerId[]).reduce(
    (a, p) => a + (s.deltas[p] ?? 0),
    0,
  );
}

/** shapeDeclare 계열(broken_border·mixed_triplet·async_chiitoi)을 이번 국에 켠다 */
export function shapeOn(state: GameState, id: string, holder: PlayerId): GameState {
  return withData(state, {
    [`${id}:on:${roundKeyOf(state)}:${holder}#round`]: true,
  });
}
