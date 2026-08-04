/**
 * content 테스트 공용 하네스 — 원하는 손패·버림패·멜드로 GameState를 조립한다.
 * (packages/core/test/Augment.test.ts의 craft를 @majak/core 공개 API로 이식)
 */

import {
  DEAD_WALL,
  WALL,
  calculateScore,
  createInitialGameState,
  createZone,
  discardsZone,
  handZone,
  kindKey,
  meldsZone,
  shantenOf,
  winningKinds,
} from "@majak/core";
import type {
  BotAugmentOption,
  BotDecisionContext,
  GameState,
  Meld,
  PlayerId,
  PlayerView,
  TileId,
  TileKind,
  WinInfo,
} from "@majak/core";

/**
 * 봇 정책 테스트용 문맥 — 실제 BotAgent가 넘기는 판 읽기를 뷰에서 그대로 계산한다.
 * (샹텐·텐파이·대기는 진짜 값이라, 손패만 바꿔도 정책이 실제 게임과 같게 반응한다.)
 * 위협·안전도처럼 판 상황에 달린 값은 기본이 '평화로운 판'이고 overrides로 덮어쓴다.
 */
export function botCtx(
  view: PlayerView,
  options: BotAugmentOption[],
  overrides: Partial<BotDecisionContext> = {},
): BotDecisionContext {
  const hand: TileKind[] = [];
  for (const id of view.zones[handZone(view.playerId)]?.tileIds ?? []) {
    const k = view.tiles[id]?.kind;
    if (k !== undefined) hand.push(k);
  }
  const meldCount = view.round.byPlayer[view.playerId]?.meldCount ?? 0;
  const shanten = shantenOf(hand, meldCount, view.scoringOptions);
  // BotAgent와 같게: 13장이면 그대로, 14장(쯔모 직후)이면 한 장씩 빼 보며 대기형을 찾는다
  let waits = winningKinds(hand, meldCount, undefined, view.scoringOptions);
  if (waits.length === 0) {
    for (let i = 0; i < hand.length; i++) {
      const rest = hand.slice(0, i).concat(hand.slice(i + 1));
      const w = winningKinds(rest, meldCount, undefined, view.scoringOptions);
      if (w.length > waits.length) waits = w;
    }
  }
  return {
    view,
    options,
    holder: view.playerId,
    rng: { int: () => 0, float: () => 0 },
    tenpai: waits.length > 0,
    shanten,
    waits,
    turn: view.round.turnCount,
    wallLeft: 60,
    threat: 0,
    remaining: () => 4,
    safety: () => 1,
    ...overrides,
  };
}

/**
 * 확정 보상 "+N판"이 실제로 얹어 주는 뱅크 점수 —
 * `src/util.ts`의 winPointsWithExtraHan과 같은 계산이다.
 * (2026-07-26: 증강 확정 보상 단위를 점수 → 판수로 통일하면서 추가)
 */
export function hanBonusPoints(
  state: GameState,
  winner: PlayerId,
  info: WinInfo,
  extraHan: number,
): number {
  const isDealer =
    state.players.find((p) => p.seat === state.round.dealerSeat)?.id === winner;
  const boosted = calculateScore({
    han: info.han + extraHan,
    fu: info.fu,
    yakumanCount: info.yakumanCount,
    isDealer,
    winType: info.winType,
  }).total;
  return Math.max(0, boosted - info.points);
}

/** "234m55z" 표기 → TileKind[] (z: 1~4=풍, 5~7=삼원) */
export function h(spec: string): TileKind[] {
  const out: TileKind[] = [];
  let digits = "";
  for (const ch of spec) {
    if (ch >= "0" && ch <= "9") {
      digits += ch;
      continue;
    }
    for (const d of digits) {
      const r = Number(d);
      if (ch === "m") out.push({ suit: "man", rank: r });
      else if (ch === "p") out.push({ suit: "pin", rank: r });
      else if (ch === "s") out.push({ suit: "sou", rank: r });
      else if (ch === "z")
        out.push(r <= 4 ? { suit: "wind", rank: r } : { suit: "dragon", rank: r - 4 });
      else throw new Error(`bad suit: ${ch}`);
    }
    digits = "";
  }
  return out;
}

export const PLAYERS: PlayerId[] = ["p0", "p1", "p2", "p3"];

export interface CraftConfig {
  hands: Record<PlayerId, string>;
  discards?: Record<PlayerId, string>;
  melds?: Partial<Record<PlayerId, { kind: Meld["kind"]; spec: string }[]>>;
  phase: string;
  turnSeat: number;
  drawnLastFor?: PlayerId;
  lastDiscard?: { player: PlayerId; spec: string };
  seed?: number;
}

export function craft(cfg: CraftConfig): GameState {
  const base = createInitialGameState(
    { seed: cfg.seed ?? 1, playerIds: [...PLAYERS] },
    { startScore: 25000, redFivesPerSuit: 1 },
  );
  const pool = new Map<string, TileId[]>();
  for (const tile of Object.values(base.tiles)) {
    const key = kindKey(tile.kind);
    pool.set(key, [...(pool.get(key) ?? []), tile.id]);
  }
  const take = (kind: TileKind): TileId => {
    const id = pool.get(kindKey(kind))?.shift();
    if (id === undefined) throw new Error(`No tiles left of ${kindKey(kind)}`);
    return id;
  };

  const zones = { ...base.zones };
  const byPlayer = { ...base.round.byPlayer };
  let lastDiscardRef: { player: PlayerId; tileId: TileId } | null = null;

  const fillLater: PlayerId[] = [];
  for (const p of PLAYERS) {
    const spec = cfg.hands[p] ?? "";
    if (spec === "*") {
      fillLater.push(p);
      zones[handZone(p)] = createZone(handZone(p), "hand", p);
    } else {
      zones[handZone(p)] = {
        ...createZone(handZone(p), "hand", p),
        tileIds: h(spec).map(take),
      };
    }
    const meldTiles: TileId[] = [];
    const melds: Meld[] = (cfg.melds?.[p] ?? []).map((m) => {
      const ids = h(m.spec).map(take);
      meldTiles.push(...ids);
      return { kind: m.kind, tileIds: ids };
    });
    zones[meldsZone(p)] = {
      ...createZone(meldsZone(p), "melds", p),
      tileIds: meldTiles,
    };
    const discardIds = h(cfg.discards?.[p] ?? "").map(take);
    zones[discardsZone(p)] = {
      ...createZone(discardsZone(p), "discards", p),
      tileIds: discardIds,
    };
    byPlayer[p] = {
      riichi: null,
      temporaryFuriten: false,
      riichiFuriten: false,
      furiten: false,
      melds,
      discardedKinds: h(cfg.discards?.[p] ?? "").map(kindKey),
      discardCount: h(cfg.discards?.[p] ?? "").length,
      tsumogiriIds: [],
    };
  }

  if (cfg.lastDiscard !== undefined) {
    const kind = h(cfg.lastDiscard.spec)[0] as TileKind;
    const tileId = take(kind);
    const zone = zones[discardsZone(cfg.lastDiscard.player)];
    zones[discardsZone(cfg.lastDiscard.player)] = {
      ...(zone as NonNullable<typeof zone>),
      tileIds: [...(zone?.tileIds ?? []), tileId],
    };
    lastDiscardRef = { player: cfg.lastDiscard.player, tileId };
    const rs = byPlayer[cfg.lastDiscard.player];
    if (rs !== undefined) {
      byPlayer[cfg.lastDiscard.player] = {
        ...rs,
        discardedKinds: [...rs.discardedKinds, kindKey(kind)],
      };
    }
  }

  let rest = [...pool.values()].flat().sort((a, b) => a - b);
  // "*" 손패는 남은 패에서 13장씩 자동 채움 (내용 무관한 자리)
  for (const p of fillLater) {
    zones[handZone(p)] = {
      ...createZone(handZone(p), "hand", p),
      tileIds: rest.slice(0, 13),
    };
    rest = rest.slice(13);
  }
  zones[DEAD_WALL] = { ...createZone(DEAD_WALL, "deadWall"), tileIds: rest.slice(0, 14) };
  zones[WALL] = { ...createZone(WALL, "wall"), tileIds: rest.slice(14) };

  const drawn =
    cfg.drawnLastFor === undefined
      ? null
      : (zones[handZone(cfg.drawnLastFor)]?.tileIds.at(-1) ?? null);

  return {
    ...base,
    zones,
    round: {
      ...base.round,
      phase: cfg.phase,
      turnSeat: cfg.turnSeat,
      doraIndicators: [zones[DEAD_WALL]?.tileIds[4] as TileId],
      lastDrawnTile: drawn,
      lastDiscard: lastDiscardRef,
      // 게임 중간 스냅샷 의미 — 첫 바퀴 아님 (천화·지화 오판 방지)
      firstTurn: false,
      byPlayer,
    },
  };
}
