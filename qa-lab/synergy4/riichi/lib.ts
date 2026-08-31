/**
 * 리치 축 시너지 검증 공용 도구 (QA 전용 — packages/ 는 건드리지 않는다).
 */
import {
  DEAD_WALL,
  FlowController,
  ROUND_SETTLED,
  WALL,
  createStandardGameFromState,
  installAugment,
  kindKey,
} from "@majak/core";
import type {
  ActionOption,
  AugmentDef,
  GameState,
  PlayerId,
  RoundSettledPayload,
  TileId,
  WinInfo,
} from "@majak/core";
import { h } from "../../../packages/content/test/helpers.js";
import { contentAugments } from "@majak/content";

export { craft } from "../../../packages/content/test/helpers.js";
export type Game = ReturnType<typeof createStandardGameFromState>;

/** id → AugmentDef (content 인덱스에서 찾는다) */
const DEFS = new Map<string, AugmentDef>();
for (const d of contentAugments) DEFS.set(d.id, d);
export function defOf(id: string): AugmentDef {
  const d = DEFS.get(id);
  if (d === undefined) throw new Error(`no augment def: ${id}`);
  return d;
}

export function withAugments(
  state: GameState,
  bySeat: Partial<Record<PlayerId, string[]>>,
): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      bySeat[p.id] === undefined ? p : { ...p, augments: [...(bySeat[p.id] as string[])] },
    ),
  };
}

/** 상태에 적힌 augments 그대로 설치한 게임을 만든다 */
export function mkGame(state: GameState): Game {
  const game = createStandardGameFromState(state);
  for (const p of state.players) {
    for (const id of p.augments) {
      installAugment(game.engine, defOf(id), p.id, { yaku: game.yaku });
    }
  }
  return game;
}

export function withRiichi(
  state: GameState,
  player: PlayerId,
  opts: { double?: boolean; ippatsu?: boolean; cost?: number } = {},
): GameState {
  const rs = state.round.byPlayer[player];
  if (rs === undefined) throw new Error(`no round state ${player}`);
  return {
    ...state,
    round: {
      ...state.round,
      byPlayer: {
        ...state.round.byPlayer,
        [player]: {
          ...rs,
          riichi: {
            double: opts.double ?? false,
            ippatsu: opts.ippatsu ?? false,
            discardIndex: 0,
            ...(opts.cost !== undefined ? { cost: opts.cost } : {}),
          },
        },
      },
    },
  };
}

/** 왕패의 도라/뒷도라 표시패를 원하는 종류로 갈아 끼운다 (패산에서 미사용 패를 끌어온다) */
export function setIndicators(
  state: GameState,
  doraSpec: string,
  uraSpec: string,
): GameState {
  // 후보 풀: 패산 · 왕패의 비표시패 자리 · "*" 채움 손패(p2/p3) — 자리를 맞바꾼다
  const zones: Record<string, TileId[]> = {};
  for (const z of [DEAD_WALL, WALL, "hand:p2", "hand:p3"]) {
    if (state.zones[z] !== undefined) zones[z] = [...state.zones[z]!.tileIds];
  }
  const swapInto = (slot: number, spec: string): void => {
    const key = kindKey(h(spec)[0]!);
    for (const [z, ids] of Object.entries(zones)) {
      for (let i = 0; i < ids.length; i++) {
        if (z === DEAD_WALL && (i === 4 || i === 5)) continue;
        if (kindKey(state.tiles[ids[i] as TileId]!.kind) !== key) continue;
        const dead = zones[DEAD_WALL] as TileId[];
        const tmp = dead[slot] as TileId;
        dead[slot] = ids[i] as TileId;
        ids[i] = tmp;
        return;
      }
    }
    throw new Error(`no free ${spec} anywhere`);
  };
  swapInto(4, doraSpec);
  swapInto(5, uraSpec);
  const nextZones = { ...state.zones };
  for (const [z, ids] of Object.entries(zones)) {
    nextZones[z] = { ...state.zones[z]!, tileIds: ids };
  }
  return {
    ...state,
    zones: nextZones,
    round: { ...state.round, doraIndicators: [(zones[DEAD_WALL] as TileId[])[4] as TileId] },
  };
}

/** 패산 앞머리를 원하는 패로 채운다 (자리 교환 — 장수 보존) */
export function stackWall(state: GameState, specs: string[]): GameState {
  const zones: Record<string, TileId[]> = {};
  for (const z of [WALL, DEAD_WALL, "hand:p2", "hand:p3"]) {
    if (state.zones[z] !== undefined) zones[z] = [...state.zones[z]!.tileIds];
  }
  const wall = zones[WALL] as TileId[];
  specs.forEach((spec, slot) => {
    const key = kindKey(h(spec)[0]!);
    if (kindKey(state.tiles[wall[slot] as TileId]!.kind) === key) return;
    for (const [z, ids] of Object.entries(zones)) {
      for (let i = 0; i < ids.length; i++) {
        if (z === WALL && i <= slot) continue;
        if (z === DEAD_WALL && (i === 4 || i === 5)) continue;
        if (kindKey(state.tiles[ids[i] as TileId]!.kind) !== key) continue;
        const tmp = wall[slot] as TileId;
        wall[slot] = ids[i] as TileId;
        ids[i] = tmp;
        return;
      }
    }
    throw new Error(`stackWall: no free ${spec}`);
  });
  const nextZones = { ...state.zones };
  for (const [z, ids] of Object.entries(zones)) nextZones[z] = { ...state.zones[z]!, tileIds: ids };
  return { ...state, zones: nextZones };
}

export function optionsFor(status: unknown, player: PlayerId): ActionOption[] {
  const s = status as { kind: string; prompts?: { player: PlayerId; options: ActionOption[] }[] };
  if (s.kind !== "awaiting") return [];
  return s.prompts?.find((p) => p.player === player)?.options ?? [];
}

export function pick(
  status: unknown,
  player: PlayerId,
  type: string,
  match?: (payload: Record<string, unknown>) => boolean,
): ActionOption {
  const o = optionsFor(status, player).find(
    (x) => x.type === type && (match === undefined || match((x.payload ?? {}) as Record<string, unknown>)),
  );
  if (o === undefined) {
    throw new Error(
      `no option ${type} for ${player}; got: ${[...new Set(optionsFor(status, player).map((x) => x.type))].join(",")}`,
    );
  }
  return o;
}

export function has(status: unknown, player: PlayerId, type: string): boolean {
  return optionsFor(status, player).some((x) => x.type === type);
}

export function tileOf(state: GameState, player: PlayerId, spec: string): TileId {
  const key = kindKey(h(spec)[0]!);
  const ids = state.zones[`hand:${player}`]?.tileIds ?? [];
  const id = ids.find((t) => kindKey(state.tiles[t]!.kind) === key);
  if (id === undefined) throw new Error(`${player} has no ${spec}`);
  return id;
}

export function settledOf(game: Game): RoundSettledPayload | null {
  for (let i = game.engine.eventLog.length - 1; i >= 0; i--) {
    const e = game.engine.eventLog[i];
    if (e?.type === ROUND_SETTLED) return e.payload as RoundSettledPayload;
  }
  return null;
}

export interface WinRow {
  han: number;
  fu: number;
  extraHan: number;
  uraHan: number;
  doraHan: number;
  points: number;
  yaku: string[];
  delta: number;
  augPoints: string;
}

export function winRow(
  settled: RoundSettledPayload,
  winner: PlayerId,
): WinRow | null {
  const w = (settled.winInfos ?? []).find((x) => x.winner === winner) as WinInfo | undefined;
  if (w === undefined) return null;
  return {
    han: w.han,
    fu: w.fu,
    extraHan: w.extraHan,
    uraHan: w.uraHan,
    doraHan: w.doraHan,
    points: w.points,
    yaku: (w.yaku ?? []).map((y) => (typeof y === "string" ? y : (y as { id: string }).id)),
    delta: settled.deltas[winner] ?? 0,
    augPoints: (settled.augPoints ?? [])
      .filter((n) => n.player === winner)
      .map((n) => `${n.augId}${n.han !== undefined ? `+${n.han}판` : ""}=${n.points}`)
      .join(" "),
  };
}

export function table(rows: Record<string, WinRow | null>): string {
  const keys = Object.keys(rows);
  const out: string[] = [];
  out.push(
    `| ${"조합".padEnd(28)} | han | extra | ura | dora | 점수 | 역 | augPoints |`,
  );
  out.push(`|${"-".repeat(30)}|-----|-------|-----|------|------|----|----|`);
  for (const k of keys) {
    const r = rows[k];
    out.push(
      r === null
        ? `| ${k.padEnd(28)} | (화료 없음) |`
        : `| ${k.padEnd(28)} | ${r.han} | ${r.extraHan} | ${r.uraHan} | ${r.doraHan} | ${r.points} | ${r.yaku.join(",")} | ${r.augPoints} |`,
    );
  }
  return out.join("\n");
}

export { FlowController };

/**
 * 자동 진행 드라이버 — 지정한 좌석이 지정한 패를 버리고, 화료 가능하면 화료한다.
 * `discardPlan`: player → 버릴 패 spec 목록(순서대로 소진). 없으면 쯔모패를 버린다.
 */
export function drive(
  game: Game,
  flow: FlowController,
  start: unknown,
  opts: {
    winFor?: PlayerId[];
    discardPlan?: Partial<Record<PlayerId, string[]>>;
    maxSteps?: number;
    onStep?: (status: unknown) => void;
  } = {},
): unknown {
  const winners = new Set(opts.winFor ?? []);
  const plan: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(opts.discardPlan ?? {})) plan[k] = [...(v ?? [])];
  let status = start;
  for (let step = 0; step < (opts.maxSteps ?? 60); step++) {
    const s = status as { kind: string; prompts?: { player: PlayerId; options: ActionOption[] }[] };
    if (s.kind !== "awaiting") return status;
    opts.onStep?.(status);
    // 1) 화료
    let acted = false;
    for (const pr of s.prompts ?? []) {
      if (winners.has(pr.player)) {
        const w = pr.options.find((o) => o.type === "win");
        if (w !== undefined) {
          status = flow.submit(pr.player, w);
          acted = true;
          break;
        }
      }
    }
    if (acted) continue;
    // 2) 계획된 버림
    for (const pr of s.prompts ?? []) {
      const want = plan[pr.player];
      if (want === undefined || want.length === 0) continue;
      const key = kindKey(h(want[0] as string)[0]!);
      const o = pr.options.find(
        (x) =>
          x.type === "discard" &&
          kindKey(game.engine.state.tiles[(x.payload as { tileId: TileId }).tileId]!.kind) === key,
      );
      if (o !== undefined) {
        want.shift();
        status = flow.submit(pr.player, o);
        acted = true;
        break;
      }
    }
    if (acted) continue;
    // 3) 그 외 — 버림이 있으면 쯔모패(마지막 후보)를 버리고, 아니면 pass
    for (const pr of s.prompts ?? []) {
      const d = pr.options.filter((o) => o.type === "discard");
      if (d.length > 0) {
        status = flow.submit(pr.player, d[d.length - 1] as ActionOption);
        acted = true;
        break;
      }
    }
    if (acted) continue;
    for (const pr of s.prompts ?? []) {
      const p = pr.options.find((o) => o.type === "pass");
      if (p !== undefined) {
        status = flow.submit(pr.player, p);
        acted = true;
        break;
      }
    }
    if (!acted) return status;
  }
  return status;
}
