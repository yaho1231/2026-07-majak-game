/**
 * flowEvents — 국 진행의 표준 이벤트와 Reducer.
 * 페이즈 전이는 전부 여기(데이터)에 있다 (Issue 003 해결).
 *
 * 설계: docs/11_GAME_FLOW.md §3
 */

import type { ReducerRegistry } from "../../engine/reducers/ReducerRegistry.js";
import { identityReducer } from "../../engine/reducers/ReducerRegistry.js";
import { setupRound } from "../../engine/state/GameState.js";
import type { GameState, Meld, PlayerRoundState } from "../../engine/state/GameState.js";
import type { RuleRegistry } from "../../engine/rules/RuleRegistry.js";
import {
  DEAD_WALL,
  WALL,
  discardsZone,
  handZone,
  meldsZone,
  moveTiles,
} from "../../engine/zones/Zone.js";
import type { PlayerId } from "../../engine/zones/Zone.js";
import { kindKey } from "../tiles/Tile.js";
import type { TileId } from "../tiles/Tile.js";
import { playerAtSeat } from "./helpers.js";

export const ROUND_STARTED = "RoundStarted";
export const TILE_DRAWN = "TileDrawn";
export const TILE_DISCARDED = "TileDiscarded";
export const CALL_MADE = "CallMade";
export const KAN_DECLARED = "KanDeclared";
export const DORA_FLIPPED = "DoraFlipped";
export const FURITEN_MARKED = "FuritenMarked";
export const TURN_PASSED = "TurnPassed";
export const WIN_DECLARED = "WinDeclared";
export const ROUND_SETTLED = "RoundSettled";

export interface TileDrawnPayload {
  player: PlayerId;
  tileId: TileId;
  rinshan: boolean;
}

export interface TileDiscardedPayload {
  player: PlayerId;
  tileId: TileId;
  riichi: boolean;
  /** 리치일 때 공탁 비용 (Rule은 액션 시점에 읽어 payload에 고정 — Reducer 순수성) */
  riichiCost: number;
  /**
   * 더블리치 강제 플래그 (증강용). 지정하면 "첫 버림" 판정 대신 이 값을 쓴다.
   * Interceptor가 payload를 바꿔 리치를 더블리치로 승격시킬 수 있다.
   */
  riichiDouble?: boolean;
}

export interface CallMadePayload {
  caller: PlayerId;
  from: PlayerId;
  /** kokushi_pon = 울어 국사 전용 특수 부로(서로 다른 요구패 3장) */
  meldKind: "pon" | "chi" | "kokushi_pon";
  /** 손에서 내는 패 */
  handTileIds: TileId[];
  calledTileId: TileId;
}

export interface KanDeclaredPayload {
  player: PlayerId;
  kanKind: "kan_closed" | "kan_open" | "kan_added";
  handTileIds: TileId[];
  calledFrom?: PlayerId;
  calledTileId?: TileId;
  /** 소명깡(shouminkan)의 경우 기존 pon 멜드의 tileId */
  targetMeldTileId?: TileId;
}

export interface DoraFlippedPayload {
  tileId: TileId;
}

export interface FuritenMarkedPayload {
  player: PlayerId;
  permanent: boolean;
}

export interface TurnPassedPayload {
  nextSeat: number;
}

export interface WinDeclaredPayload {
  winner: PlayerId;
  /** null = 쯔모 */
  from: PlayerId | null;
  tileId: TileId;
  winType: "tsumo" | "ron";
}

/** 화료 1건의 채점 상세 — 클라이언트 결과 화면·증강 Interceptor 공용 */
export interface WinInfo {
  winner: PlayerId;
  /** null = 쯔모 */
  from: PlayerId | null;
  winType: "tsumo" | "ron";
  winningTileId: TileId;
  han: number;
  fu: number;
  yakumanCount: number;
  /** score.extraHan 규칙으로 더해진 판 (han에 이미 포함) */
  extraHan: number;
  yaku: { id: string; name: string; han: number }[];
  doraHan: number;
  uraHan: number;
  redHan: number;
  /** 화료자 총 획득점 (본장·공탁 제외) */
  points: number;
  limit: string | null;
}

export interface RoundSettledPayload {
  outcome: "win" | "draw" | "abort";
  deltas: Record<PlayerId, number>;
  dealerSeat: number;
  honba: number;
  riichiPot: number;
  roundNumber: number;
  prevalentWind: number;
  /** outcome=win일 때 화료 상세 (트리플론 제외 최대 2건) */
  winInfos?: WinInfo[];
}

function withPlayerRound(
  state: GameState,
  player: PlayerId,
  patch: (rs: PlayerRoundState) => PlayerRoundState,
): GameState {
  const rs = state.round.byPlayer[player];
  if (rs === undefined) throw new Error(`Unknown player round state: ${player}`);
  return {
    ...state,
    round: {
      ...state.round,
      byPlayer: { ...state.round.byPlayer, [player]: patch(rs) },
    },
  };
}

/**
 * @param rules 넘기면 deal.handSize 규칙이 배패 장수에 반영된다 (진짜 용 등).
 *              규칙 합성은 결정적이므로 리플레이에서도 같은 결과가 나온다.
 */
export function registerFlowReducers(
  reducers: ReducerRegistry,
  rules?: RuleRegistry,
): void {
  reducers.register(ROUND_STARTED, (state) =>
    setupRound(
      state,
      rules !== undefined && rules.has("deal.handSize")
        ? {
            handSizeFor: (playerId) =>
              rules.resolve<number>("deal.handSize", { playerId, state }),
          }
        : undefined,
    ),
  );

  reducers.register(TILE_DRAWN, (state, event) => {
    const p = event.payload as TileDrawnPayload;
    const isDealer = playerAtSeat(state, state.round.dealerSeat).id === p.player;
    const sourceZone = p.rinshan ? DEAD_WALL : WALL;
    let zones = moveTiles(state.zones, sourceZone, handZone(p.player), [p.tileId]);

    // 영상패 쯔모 시 패산 마지막 패를 왕패 '앞'에 보충 — 왕패 14장 유지 +
    // 도라 표시패의 절대 인덱스(4·6·8·10·12) 불변 (sys.flipDora 규약)
    if (p.rinshan) {
      const wall = zones[WALL];
      const dead = zones[DEAD_WALL];
      const last = wall?.tileIds.at(-1);
      if (wall !== undefined && dead !== undefined && last !== undefined) {
        zones = {
          ...zones,
          [WALL]: { ...wall, tileIds: wall.tileIds.slice(0, -1) },
          [DEAD_WALL]: { ...dead, tileIds: [last, ...dead.tileIds] },
        };
      }
    }

    // 이번에 뽑는 플레이어가 이미 버림 이력이 있으면 첫 바퀴 종료
    const drawerDiscarded =
      (state.round.byPlayer[p.player]?.discardedKinds.length ?? 0) > 0;

    // 깡이 실제로 완성되는 시점(영상 쯔모)에 전원 일발 소멸 —
    // 선언 시점에 끄면 창깡(가깡 론)의 일발이 부당하게 사라진다 (표준 룰)
    const byPlayer = p.rinshan
      ? Object.fromEntries(
          Object.entries(state.round.byPlayer).map(([id, rs]) => [
            id,
            {
              ...rs,
              riichi: rs.riichi === null ? null : { ...rs.riichi, ippatsu: false },
              temporaryFuriten: id === p.player ? false : rs.temporaryFuriten,
            },
          ]),
        )
      : {
          ...state.round.byPlayer,
          [p.player]: {
            ...state.round.byPlayer[p.player]!,
            temporaryFuriten: false,
          },
        };

    return {
      ...state,
      zones,
      round: {
        ...state.round,
        phase: "turn.act",
        lastDrawnTile: p.tileId,
        lastDrawRinshan: p.rinshan,
        chankan: null,
        turnCount: state.round.turnCount + (isDealer ? 1 : 0),
        firstTurn: state.round.firstTurn && !drawerDiscarded,
        byPlayer,
      },
    };
  });

  reducers.register(TILE_DISCARDED, (state, event) => {
    const p = event.payload as TileDiscardedPayload;
    const discardsBefore =
      state.zones[discardsZone(p.player)]?.tileIds.length ?? 0;
    const discardedKind = state.tiles[p.tileId]?.kind;
    let next: GameState = {
      ...state,
      zones: moveTiles(state.zones, handZone(p.player), discardsZone(p.player), [
        p.tileId,
      ]),
      round: {
        ...state.round,
        phase: "reaction",
        lastDiscard: { player: p.player, tileId: p.tileId },
        lastDrawRinshan: false,
        chankan: null,
      },
    };
    // 버림 이력 기록 (부로로 강에서 사라져도 후리텐 판정에 남는다)
    if (discardedKind !== undefined) {
      next = withPlayerRound(next, p.player, (rs) => ({
        ...rs,
        discardedKinds: [...rs.discardedKinds, kindKey(discardedKind)],
      }));
    }
    if (p.riichi) {
      next = withPlayerRound(next, p.player, (rs) => ({
        ...rs,
        riichi: {
          double:
            p.riichiDouble ?? (discardsBefore === 0 && !state.round.goAroundBroken),
          ippatsu: true,
          discardIndex: discardsBefore,
        },
      }));
      next = {
        ...next,
        players: next.players.map((pl) =>
          pl.id === p.player ? { ...pl, score: pl.score - p.riichiCost } : pl,
        ),
        round: { ...next.round, riichiPot: next.round.riichiPot + p.riichiCost },
      };
    } else if (state.round.byPlayer[p.player]?.riichi != null) {
      // 리치자가 화료 없이 다시 버림 → 일발 소멸
      next = withPlayerRound(next, p.player, (rs) => ({
        ...rs,
        riichi: rs.riichi === null ? null : { ...rs.riichi, ippatsu: false },
      }));
    }
    return next;
  });

  reducers.register(CALL_MADE, (state, event) => {
    const p = event.payload as CallMadePayload;
    let zones = moveTiles(
      state.zones,
      discardsZone(p.from),
      meldsZone(p.caller),
      [p.calledTileId],
    );
    zones = moveTiles(zones, handZone(p.caller), meldsZone(p.caller), p.handTileIds);
    const meld: Meld = {
      kind: p.meldKind,
      tileIds: [...p.handTileIds, p.calledTileId],
      calledFrom: p.from,
      calledTileId: p.calledTileId,
    };
    // 부로 발생 → 첫 바퀴 종료, 전원 일발 소멸.
    // 부로한 사람은 자기 수순이 온 것이므로 일시 후리텐 해소 (EMA 통용 룰)
    const byPlayer = Object.fromEntries(
      Object.entries(state.round.byPlayer).map(([id, rs]) => [
        id,
        {
          ...rs,
          riichi: rs.riichi === null ? null : { ...rs.riichi, ippatsu: false },
          melds: id === p.caller ? [...rs.melds, meld] : rs.melds,
          temporaryFuriten: id === p.caller ? false : rs.temporaryFuriten,
        },
      ]),
    );
    return {
      ...state,
      zones,
      round: {
        ...state.round,
        phase: "turn.act",
        turnSeat: state.players.find((x) => x.id === p.caller)?.seat ?? 0,
        goAroundBroken: true,
        firstTurn: false,
        lastDiscard: null,
        lastDrawnTile: null,
        lastDrawRinshan: false,
        chankan: null,
        byPlayer,
      },
    };
  });

  reducers.register(KAN_DECLARED, (state, event) => {
    const p = event.payload as KanDeclaredPayload;
    let zones = state.zones;
    let melds = [...(state.round.byPlayer[p.player]?.melds ?? [])];

    if (p.kanKind === "kan_closed") {
      zones = moveTiles(zones, handZone(p.player), meldsZone(p.player), p.handTileIds);
      melds.push({ kind: "kan_closed", tileIds: p.handTileIds });
    } else if (p.kanKind === "kan_open") {
      zones = moveTiles(zones, discardsZone(p.calledFrom!), meldsZone(p.player), [p.calledTileId!]);
      zones = moveTiles(zones, handZone(p.player), meldsZone(p.player), p.handTileIds);
      melds.push({
        kind: "kan_open",
        tileIds: [...p.handTileIds, p.calledTileId!],
        calledFrom: p.calledFrom as PlayerId,
        calledTileId: p.calledTileId as TileId,
      });
    } else if (p.kanKind === "kan_added") {
      zones = moveTiles(zones, handZone(p.player), meldsZone(p.player), p.handTileIds);
      const mIdx = melds.findIndex(m => m.kind === "pon" && m.tileIds.includes(p.targetMeldTileId!));
      if (mIdx >= 0) {
        melds[mIdx] = {
          ...melds[mIdx]!,
          kind: "kan_added",
          tileIds: [...melds[mIdx]!.tileIds, ...p.handTileIds],
        };
      }
    }

    const kanCallers = [...state.round.kanCallers, p.player];

    // 일발은 여기서 끄지 않는다 — 깡이 '완성'되는 영상 쯔모(TILE_DRAWN rinshan)
    // 시점에 끈다. 창깡(가깡 론)은 깡 무효이므로 로버의 일발이 유지되어야 한다.
    const byPlayer = Object.fromEntries(
      Object.entries(state.round.byPlayer).map(([id, rs]) => [
        id,
        {
          ...rs,
          melds: id === p.player ? melds : rs.melds,
        },
      ]),
    );

    return {
      ...state,
      zones,
      round: {
        ...state.round,
        phase:
          p.kanKind === "kan_added" || p.kanKind === "kan_closed"
            ? "reaction"
            : "turn.draw",
        turnSeat: state.players.find((x) => x.id === p.player)?.seat ?? 0,
        goAroundBroken: true,
        firstTurn: false,
        lastDiscard: null,
        chankan:
          p.kanKind === "kan_added" || p.kanKind === "kan_closed"
            ? {
                player: p.player,
                tileId: p.handTileIds[0] as TileId,
                closedKan: p.kanKind === "kan_closed",
              }
            : null,
        kanCount: state.round.kanCount + 1,
        kanCallers,
        pendingDora: state.round.pendingDora + 1,
        byPlayer,
      },
    };
  });

  reducers.register(DORA_FLIPPED, (state, event) => {
    const p = event.payload as DoraFlippedPayload;
    return {
      ...state,
      round: {
        ...state.round,
        doraIndicators: [...state.round.doraIndicators, p.tileId],
        pendingDora: Math.max(0, state.round.pendingDora - 1),
      },
    };
  });

  reducers.register(FURITEN_MARKED, (state, event) => {
    const p = event.payload as FuritenMarkedPayload;
    return withPlayerRound(state, p.player, (rs) => ({
      ...rs,
      temporaryFuriten: true,
      riichiFuriten: p.permanent ? true : rs.riichiFuriten,
    }));
  });

  reducers.register(TURN_PASSED, (state, event) => {
    const p = event.payload as TurnPassedPayload;
    return {
      ...state,
      round: {
        ...state.round,
        phase: "turn.draw",
        turnSeat: p.nextSeat,
        lastDrawnTile: null,
        lastDrawRinshan: false,
        chankan: null,
      },
    };
  });

  reducers.register(WIN_DECLARED, identityReducer);

  reducers.register(ROUND_SETTLED, (state, event) => {
    const p = event.payload as RoundSettledPayload;
    return {
      ...state,
      players: state.players.map((pl) => ({
        ...pl,
        score: pl.score + (p.deltas[pl.id] ?? 0),
      })),
      round: {
        ...state.round,
        phase: "round.over",
        dealerSeat: p.dealerSeat,
        honba: p.honba,
        riichiPot: p.riichiPot,
        roundNumber: p.roundNumber,
        prevalentWind: p.prevalentWind,
      },
    };
  });
}
