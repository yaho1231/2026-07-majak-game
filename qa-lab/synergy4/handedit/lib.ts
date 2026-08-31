/**
 * handedit 축 공용 하네스 — craft()로 장면을 세우고 증강 여럿을 심는다.
 * packages/** 는 읽기만 한다.
 */
import {
  FlowController,
  createStandardGameFromState,
  discardsZone,
  handZone,
  installAugment,
  kindKey,
  kindOf,
  WALL,
  DEAD_WALL,
} from "@majak/core";
import type { AugmentDef, GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import type { CraftConfig } from "../../../packages/content/test/helpers.js";

export { craft, discardsZone, handZone, kindKey, kindOf, WALL, DEAD_WALL };
export type { GameState, PlayerId, TileId, CraftConfig };

export type Game = ReturnType<typeof createStandardGameFromState>;

/** 좌석마다 증강 id 목록을 얹는다 */
export function withAugments(
  state: GameState,
  map: Partial<Record<PlayerId, string[]>>,
): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      map[p.id] === undefined ? p : { ...p, augments: [...(map[p.id] as string[])] },
    ),
  };
}

/** 증강 정의를 좌석별로 설치하고 FlowController까지 띄운다 */
export function start(
  state: GameState,
  installs: { def: AugmentDef; holder: PlayerId }[],
  opts: { flow?: boolean } = {},
): { game: Game; flow: FlowController | null } {
  const game = createStandardGameFromState(state);
  for (const { def, holder } of installs) {
    installAugment(game.engine, def, holder, {
      yaku: game.yaku,
      catalog: game.augments,
    });
  }
  if (opts.flow === false) return { game, flow: null };
  const flow = new FlowController(game.engine);
  flow.begin();
  return { game, flow };
}

export const handIds = (s: GameState, p: PlayerId): TileId[] => [
  ...(s.zones[handZone(p)]?.tileIds ?? []),
];
export const pondIds = (s: GameState, p: PlayerId): TileId[] => [
  ...(s.zones[discardsZone(p)]?.tileIds ?? []),
];
export const wallLen = (s: GameState): number => s.zones[WALL]?.tileIds.length ?? 0;
export const deadLen = (s: GameState): number => s.zones[DEAD_WALL]?.tileIds.length ?? 0;
export const handSpec = (s: GameState, p: PlayerId): string =>
  handIds(s, p).map((id) => kindKey(kindOf(s, id))).join(" ");

/** 전체 tileId가 정확히 한 존에만 있는가 + 총량 136 */
export function tileCensus(s: GameState): { total: number; dupes: number[] } {
  const seen = new Map<number, number>();
  for (const z of Object.values(s.zones)) {
    for (const id of z?.tileIds ?? []) seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  return { total: seen.size, dupes };
}

/** 어떤 종류가 5장 이상 존재하는가 (conjured 중복 감시) */
export function kindOverflow(s: GameState): Record<string, number> {
  const counts = new Map<string, number>();
  for (const t of Object.values(s.tiles)) {
    const k = kindKey(t.kind);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const out: Record<string, number> = {};
  for (const [k, n] of counts) if (n > 4) out[k] = n;
  return out;
}

/** 프롬프트에 실제로 제시된 옵션 (FlowController가 payload 키 순서까지 대조한다) */
export function options(
  flow: FlowController,
  player: PlayerId,
): { type: string; payload?: unknown }[] {
  const st = flow.begin();
  if (st.kind !== "awaiting") return [];
  return st.prompts.find((p) => p.player === player)?.options ?? [];
}

/** 액션을 직접 validate만 해 본다 */
export function validate(
  game: Game,
  type: string,
  player: PlayerId,
  payload: unknown,
): string | null | "NO_ACTION" {
  const def = game.engine.actions.get(type);
  if (def === undefined) return "NO_ACTION";
  return def.validate(
    { player, type, payload } as never,
    { state: game.engine.state, rules: game.engine.rules } as never,
  );
}

let failures = 0;
export function check(name: string, ok: boolean, detail = ""): void {
  if (!ok) failures++;
  console.log(`${ok ? "  ok " : "  XX "} ${name}${detail ? " — " + detail : ""}`);
}
export function section(t: string): void {
  console.log(`\n=== ${t}`);
}
export function done(): void {
  console.log(`\n${failures === 0 ? "ALL CLEAN" : `${failures} DEVIATION(S)`}`);
}
