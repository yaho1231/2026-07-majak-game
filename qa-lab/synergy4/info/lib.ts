/**
 * synergy4 «정보» 축 실험대 — 뷰 직렬화(buildPlayerView)를 좌석별로 직접 만들어
 * 무엇이 실제로 전선에 실리는지 본다. 소스는 건드리지 않는다.
 */
import {
  DEAD_WALL,
  WALL,
  SPECTATOR_ID,
  buildPlayerView,
  createStandardGameFromState,
  discardsZone,
  handZone,
  installAugment,
  isConcealedTileId,
  kindKey,
  kindOf,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  PlayerId,
  PlayerView,
  TileId,
} from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { contentAugments } from "@majak/content";

export {
  DEAD_WALL,
  WALL,
  SPECTATOR_ID,
  discardsZone,
  handZone,
  isConcealedTileId,
  kindKey,
  kindOf,
  craft,
};
export type { GameState, PlayerId, PlayerView, TileId, AugmentDef };

export const SEATS: PlayerId[] = ["p0", "p1", "p2", "p3"];
export const defOf = new Map(contentAugments.map((d) => [d.id, d]));
export function need(id: string): AugmentDef {
  const d = defOf.get(id);
  if (d === undefined) throw new Error(`no augment ${id}`);
  return d;
}

export type Game = ReturnType<typeof createStandardGameFromState>;

export function base(over: Partial<Parameters<typeof craft>[0]> = {}): GameState {
  return craft({
    hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
    ...over,
  });
}

/** 좌석별 증강을 심고 설치한 게임 */
export function build(
  state: GameState,
  spec: Record<string, readonly string[]>,
  extra: Record<string, unknown> = {},
): Game {
  const seeded: GameState = {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      augments: [...p.augments, ...(spec[p.id] ?? [])],
    })),
    augmentData: { ...state.augmentData, ...extra },
  };
  const all = [...new Set(Object.values(spec).flat())].map(need);
  const game = createStandardGameFromState(seeded, undefined, all);
  for (const seat of SEATS) {
    for (const id of spec[seat] ?? []) {
      installAugment(game.engine, need(id), seat, {
        yaku: game.yaku,
        catalog: game.augments,
      });
    }
  }
  return game;
}

export function view(game: Game, viewer: PlayerId): PlayerView {
  return buildPlayerView(game.engine.state, viewer, game.engine.rules, {
    yaku: game.yaku,
  });
}

export function allViews(game: Game): Record<string, PlayerView> {
  const out: Record<string, PlayerView> = {};
  for (const s of SEATS) out[s] = view(game, s);
  out[SPECTATOR_ID] = view(game, SPECTATOR_ID);
  return out;
}

/** 액션을 제출하고 결과를 확인 (실패하면 throw) */
export function submit(
  game: Game,
  player: PlayerId,
  type: string,
  payload: unknown = {},
): void {
  const res = game.engine.submit({ player, type, payload } as never);
  const r = res as { ok?: boolean; error?: unknown };
  if (r.ok === false) throw new Error(`submit ${type} by ${player} failed: ${String(r.error)}`);
}

/** 액션 제출 — 실패하면 사유 문자열, 성공하면 null */
export function act(
  game: Game,
  player: PlayerId,
  type: string,
  payload: unknown = {},
): string | null {
  const r = game.engine.submit({ player, type, payload } as never) as {
    ok?: boolean;
    reason?: string;
  };
  return r.ok === true ? null : (r.reason ?? "unknown failure");
}

export function trySubmit(
  game: Game,
  player: PlayerId,
  type: string,
  payload: unknown = {},
): string | null {
  const res = game.engine.submit({ player, type, payload } as never) as {
    ok?: boolean;
    error?: unknown;
  };
  return res.ok === false ? String(res.error) : null;
}

/** 이 뷰어가 보는 존의 패 kind 목록 (자리표는 "?") */
export function zoneKinds(v: PlayerView, zoneId: string): string[] {
  return (v.zones[zoneId]?.tileIds ?? []).map((id) =>
    v.tiles[id] === undefined ? "?" : kindKey(v.tiles[id]!.kind),
  );
}

export function doraKindsIn(v: PlayerView): string[] {
  return v.round.doraIndicators.map((id) =>
    v.tiles[id] === undefined ? "?" : kindKey(v.tiles[id]!.kind),
  );
}

/**
 * 일반 누출 검사 — 뷰어의 `tiles` 맵에 «어느 존에서도 보이지 않는» 패가 실렸는가.
 * (revealTiles 채널을 통한 누출이 여기 잡힌다.)
 */
export function strayTiles(v: PlayerView): TileId[] {
  const seen = new Set<TileId>();
  for (const z of Object.values(v.zones)) for (const id of z.tileIds) seen.add(id);
  for (const id of v.round.doraIndicators) seen.add(id);
  for (const id of v.round.uraDoraIndicators ?? []) seen.add(id);
  return Object.keys(v.tiles)
    .map(Number)
    .filter((id) => !seen.has(id));
}

export function ok(cond: boolean, msg: string): void {
  console.log(`${cond ? "  OK " : "  !! "} ${msg}`);
}
export function line(s = ""): void {
  console.log(s);
}
export function head(s: string): void {
  console.log(`\n=== ${s}`);
}

/** 리액션(`reaction("*")`)이 한 번 돌게 이벤트를 하나 흘린다 — 턴 플레이어가 한 장 버린다 */
export function poke(game: Game): string | null {
  const st = game.engine.state;
  const seat = st.players.find((p) => p.seat === st.round.turnSeat)?.id as PlayerId;
  const tileId = st.zones[handZone(seat)]?.tileIds.at(-1);
  const res = game.engine.submit({
    player: seat,
    type: "discard",
    payload: { tileId },
  } as never) as { ok?: boolean; reason?: string };
  return res.ok === true ? null : (res.reason ?? "unknown");
}
