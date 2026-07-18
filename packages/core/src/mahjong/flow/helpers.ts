/**
 * flow helpers — GameState에서 채점·판정 입력을 뽑아내는 순수 함수들.
 *
 * 설계: docs/11_GAME_FLOW.md
 */

import { DEAD_WALL, discardsZone, handZone } from "../../engine/zones/Zone.js";
import type { PlayerId } from "../../engine/zones/Zone.js";
import type { GameState, PlayerState } from "../../engine/state/GameState.js";
import type { RuleRegistry } from "../../engine/rules/RuleRegistry.js";
import { kindKey } from "../tiles/Tile.js";
import type { TileId, TileKind } from "../tiles/Tile.js";
import { doraKindFor } from "../scoring/dora.js";
import { winningKinds } from "../scoring/waits.js";
import type { DecomposeOptions } from "../scoring/decompose.js";
import type { MeldInfo, WinContext } from "../scoring/WinContext.js";

/** 시스템 액션 전용 플레이어 id. 서버는 소켓에서 이 id를 절대 받지 않는다 */
export const SYSTEM_PLAYER: PlayerId = "__system";

export function playerOf(state: GameState, id: PlayerId): PlayerState {
  const p = state.players.find((x) => x.id === id);
  if (p === undefined) throw new Error(`Unknown player: ${id}`);
  return p;
}

export function playerAtSeat(state: GameState, seat: number): PlayerState {
  const p = state.players.find((x) => x.seat === seat);
  if (p === undefined) throw new Error(`No player at seat: ${seat}`);
  return p;
}

/** @param direction 1=시계(표준), -1=역방향 (turn.direction 규칙) */
export function nextSeat(state: GameState, seat: number, direction = 1): number {
  const n = state.players.length;
  return (((seat + direction) % n) + n) % n;
}

/** 자풍 (1동 2남 3서 4북). direction -1이면 반대 방향으로 바람이 돈다 */
export function seatWindOf(
  state: GameState,
  id: PlayerId,
  direction = 1,
): number {
  const n = state.players.length;
  const diff = playerOf(state, id).seat - state.round.dealerSeat;
  return ((((diff * direction) % n) + n) % n) + 1;
}

export function kindOf(state: GameState, tileId: TileId): TileKind {
  const tile = state.tiles[tileId];
  if (tile === undefined) throw new Error(`Unknown tile: ${tileId}`);
  return tile.kind;
}

export function handIdsOf(state: GameState, id: PlayerId): readonly TileId[] {
  return state.zones[handZone(id)]?.tileIds ?? [];
}

export function handKindsOf(state: GameState, id: PlayerId): TileKind[] {
  return handIdsOf(state, id).map((t) => kindOf(state, t));
}

export function meldInfosOf(state: GameState, id: PlayerId): MeldInfo[] {
  const rs = state.round.byPlayer[id];
  return (rs?.melds ?? []).map((m) => ({
    kind: m.kind,
    tiles: m.tileIds.map((t) => kindOf(state, t)),
  }));
}

export function meldCountOf(state: GameState, id: PlayerId): number {
  return state.round.byPlayer[id]?.melds.length ?? 0;
}

/**
 * scoring.* 규칙 → 분해 옵션. 증강이 만든 채점 변형(순환 순자, 5멘쯔,
 * 부로 국사)을 모든 판정 지점(화료·텐파이·후리텐·대기)에 일관 적용한다.
 */
export function scoringOptionsOf(
  state: GameState,
  rules: RuleRegistry,
  player: PlayerId,
): DecomposeOptions {
  const ctx = { playerId: player, state };
  const opts: DecomposeOptions = {};
  if (rules.has("scoring.wrapRuns") && rules.resolve<boolean>("scoring.wrapRuns", ctx)) {
    opts.wrapRuns = true;
  }
  if (rules.has("scoring.totalSets")) {
    const totalSets = rules.resolve<number>("scoring.totalSets", ctx);
    if (totalSets !== 4) opts.totalSets = totalSets;
  }
  if (
    rules.has("scoring.kokushiMeldAssist") &&
    rules.resolve<boolean>("scoring.kokushiMeldAssist", ctx)
  ) {
    const melds = state.round.byPlayer[player]?.melds ?? [];
    // 울어 국사 특수 부로(서로 다른 요구패 3장)의 모든 kind를 국사 덮개로 넘긴다
    opts.kokushiMeldKinds = melds
      .filter((m) => m.kind === "kokushi_pon")
      .flatMap((m) => m.tileIds.map((id) => kindOf(state, id)));
  }
  return opts;
}

/**
 * 기본 후리텐: 자기가 버린 적 있는 패에 대기패가 있으면 론 불가.
 * 버림 '이력'(discardedKinds)을 쓴다 — 버림패가 부로로 강에서 사라져도
 * 후리텐은 유지된다 (표준 룰).
 */
export function isFuriten(
  state: GameState,
  id: PlayerId,
  opts?: DecomposeOptions,
): boolean {
  const rs = state.round.byPlayer[id];
  if (rs?.temporaryFuriten === true || rs?.riichiFuriten === true) return true;
  const discarded = rs?.discardedKinds ?? [];
  if (discarded.length === 0) return false;
  const waits = winningKinds(
    handKindsOf(state, id),
    meldCountOf(state, id),
    undefined,
    opts,
  );
  if (waits.length === 0) return false;
  const waitKeys = new Set(waits.map(kindKey));
  return discarded.some((k) => waitKeys.has(k));
}

/** 공개된 도라 표시패의 바로 다음 왕패가 우라 표시패 (07 §2 규약) */
export function uraIndicatorIds(state: GameState): TileId[] {
  const deadWall = state.zones[DEAD_WALL]?.tileIds ?? [];
  const ura: TileId[] = [];
  for (const indicator of state.round.doraIndicators) {
    const idx = deadWall.indexOf(indicator);
    const uraId = idx >= 0 ? deadWall[idx + 1] : undefined;
    if (uraId !== undefined) ura.push(uraId);
  }
  return ura;
}

export interface BuildWinContextOptions {
  includeUra?: boolean;
  /**
   * 규칙 레지스트리 — 넘기면 winnerId·blockedYaku·분해 옵션·턴 방향까지
   * 채워진 완전한 문맥을 만든다 (증강 연동 경로).
   */
  rules?: RuleRegistry;
}

export function buildWinContext(
  state: GameState,
  winner: PlayerId,
  winType: "tsumo" | "ron",
  winningTileId: TileId,
  options: BuildWinContextOptions = {},
): WinContext {
  const winKind = kindOf(state, winningTileId);
  const ownHand = handKindsOf(state, winner);
  const hand = winType === "ron" ? [...ownHand, winKind] : ownHand;
  const rs = state.round.byPlayer[winner];
  const melds = meldInfosOf(state, winner);
  const wallEmpty = (state.zones["wall"]?.tileIds.length ?? 0) === 0;

  const handTileIds = [
    ...handIdsOf(state, winner),
    ...(winType === "ron" ? [winningTileId] : []),
    ...(rs?.melds ?? []).flatMap((m) => m.tileIds),
  ];
  const redCount = handTileIds.filter(
    (t) => state.tiles[t]?.attrs.red === true,
  ).length;

  const rules = options.rules;
  const direction =
    rules !== undefined && rules.has("turn.direction")
      ? rules.resolve<number>("turn.direction", { state })
      : 1;

  return {
    hand,
    melds,
    winningTile: winKind,
    winType,
    seatWind: seatWindOf(state, winner, direction),
    prevalentWind: state.round.prevalentWind,
    riichi:
      rs?.riichi != null
        ? { double: rs.riichi.double, ippatsu: rs.riichi.ippatsu }
        : null,
    flags: {
      // 영상패는 해저패가 아니다 — 영상개화와 해저로월은 병립하지 않는다
      haitei: winType === "tsumo" && wallEmpty && !state.round.lastDrawRinshan,
      houtei: winType === "ron" && wallEmpty,
      rinshan: winType === "tsumo" && state.round.lastDrawRinshan,
      chankan:
        winType === "ron" &&
        state.round.chankan !== null &&
        state.round.chankan.tileId === winningTileId,
      // 천화: 친의 첫 쯔모 화료 / 지화: 자의 첫 쯔모 화료 (첫 바퀴·무부로)
      tenhou:
        winType === "tsumo" &&
        state.round.firstTurn &&
        !state.round.goAroundBroken &&
        (rs?.discardedKinds.length ?? 0) === 0 &&
        playerOf(state, winner).seat === state.round.dealerSeat,
      chihou:
        winType === "tsumo" &&
        state.round.firstTurn &&
        !state.round.goAroundBroken &&
        (rs?.discardedKinds.length ?? 0) === 0 &&
        playerOf(state, winner).seat !== state.round.dealerSeat,
    },
    doraKinds: state.round.doraIndicators.map((t) => doraKindFor(kindOf(state, t))),
    uraDoraKinds:
      options.includeUra === true
        ? uraIndicatorIds(state).map((t) => doraKindFor(kindOf(state, t)))
        : [],
    redCount,
    winnerId: winner,
    ...(rules !== undefined
      ? {
          blockedYaku: rules.has("win.blockedYaku")
            ? rules.resolve<string[]>("win.blockedYaku", {
                playerId: winner,
                state,
              })
            : [],
          options: scoringOptionsOf(state, rules, winner),
        }
      : {}),
  };
}
