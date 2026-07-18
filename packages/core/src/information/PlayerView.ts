/**
 * Information System — 가시성 제어 및 PlayerView 생성.
 *
 * 핵심 원칙: 가시성도 규칙이다.
 * 서버는 GameState 전체를 알고, 각 플레이어에게는 buildPlayerView가
 * 걸러낸 PlayerView만 보낸다. 클라이언트에 전송되지 않은 정보는
 * 해킹으로도 볼 수 없다 (Server Authority의 실질적 의미).
 *
 * 설계: docs/09_INFORMATION_SYSTEM.md
 */

import type { GameState, Meld, PlayerRoundState, RoundState } from "../engine/state/GameState.js";
import type { RuleRegistry } from "../engine/rules/RuleRegistry.js";
import type { PlayerId, ZoneId } from "../engine/zones/Zone.js";
import { kindKey } from "../mahjong/tiles/Tile.js";
import type { TileAttrs, TileId, TileKind } from "../mahjong/tiles/Tile.js";
import { winningKinds } from "../mahjong/scoring/waits.js";
import { scoringOptionsOf } from "../mahjong/flow/helpers.js";
import { discardsZone, handZone, meldsZone } from "../engine/zones/Zone.js";

// ─────────────────────────── 가시성 타입 ───────────────────────────

/**
 * Zone의 패 공개 여부.
 * - `public`     : 전원 공개 (버림패, 멜드, 도라 표시패)
 * - `owner`      : 소유자만 공개 (손패)
 * - `hidden`     : 전원 비공개 (패산, 왕패)
 * - `count_only` : 장수만 공개, 내용 비공개
 * - `{mode:"peek",count}` : 앞에서 N장만 공개, 나머지는 장수만
 *   (엿보기 증강 — Modifier가 viewer/zoneOwner 문맥으로 조건부 반환)
 */
export type PeekVisibility = { mode: "peek"; count: number };
export type VisibilityRule =
  | "public"
  | "owner"
  | "hidden"
  | "count_only"
  | PeekVisibility;

/** 특수 관전자 playerId. 이 id를 사용하면 모든 정보가 공개된다 */
export const SPECTATOR_ID: PlayerId = "__spectator";

// ─────────────────────────── PlayerView 타입 ───────────────────────────

/**
 * 가시성이 적용된 Zone 표현.
 * - `tileIds`    : 이 뷰어에게 공개된 패 id 목록
 * - `hiddenCount`: 숨겨진 패의 장수 (count_only / owner의 타인 시점)
 */
export interface ZoneView {
  id: ZoneId;
  kind: string;
  owner?: PlayerId;
  tileIds: TileId[];
  hiddenCount: number;
}

/** 플레이어 공개 정보 (점수·증강은 전원 공개) */
export interface PlayerInfo {
  id: PlayerId;
  seat: number;
  score: number;
  /** 보유 증강 id 목록. 전원 공개 (2026-07-15 확정) */
  augments: string[];
  /** 표시용 닉네임 (없으면 id로 폴백) */
  nickname: string;
  /** 봇 여부 (표시용) */
  isBot: boolean;
}

export interface PublicTileView {
  id: TileId;
  kind: TileKind;
  attrs: TileAttrs;
}

/**
 * 공개 멜드(부로) 표현. 치/펑/깡 구성과 어느 방향에서 가져왔는지까지
 * 실제 마작에서 전원에게 공개되는 정보만 담는다.
 */
export interface MeldView {
  kind: Meld["kind"];
  tileIds: TileId[];
  calledFrom?: PlayerId;
  calledTileId?: TileId;
}

/**
 * 국 단위 공개 정보.
 * byPlayer에서 타인은 리치 선언 여부만 노출하고,
 * 후리텐·일발 세부는 본인만 확인할 수 있다.
 */
export interface PlayerRoundView {
  /** 리치 선언 여부 (공개) */
  riichiDeclared: boolean;
  /** 더블리치 여부. 리치 중일 때만 의미 있음 */
  doubleRiichi: boolean;
  /** 일발 유효 여부 (본인 뷰에서만 포함) */
  ippatsu?: boolean;
  /** 후리텐 상태 (본인 뷰에서만 포함) */
  furiten?: boolean;
  /** 후리텐 사유 (본인 뷰에서만 포함) */
  furitenReasons?: FuritenReason[];
  /** 멜드(부로) 수 — melds Zone 장수로 계산 가능하지만 편의용 */
  meldCount: number;
  /**
   * 멜드 상세 (치/펑/깡 묶음·호출 방향). melds Zone이 이 뷰어에게
   * 공개(hiddenCount=0)일 때만 채워지고, 아니면 빈 배열.
   */
  melds: MeldView[];
  /** 리치 선언패의 discards 내 인덱스 (강에서 눕혀 그리는 용도, 공개) */
  riichiTileIndex?: number;
}

export type FuritenReason = "discard" | "temporary" | "riichi";

export interface RoundView {
  prevalentWind: number;
  roundNumber: number;
  honba: number;
  riichiPot: number;
  dealerSeat: number;
  turnSeat: number;
  turnCount: number;
  phase: string;
  /** 턴 진행 방향 (1=표준, -1=역방향 — 자풍 표기·다음 차례 표시용) */
  direction: number;
  /** 공개된 도라 표시패 id 목록 */
  doraIndicators: TileId[];
  /** 마지막 버림패. reaction 페이즈에서 누가 무엇을 버렸는지 */
  lastDiscard: { player: PlayerId; tileId: TileId } | null;
  /**
   * 이번 턴 쯔모패 — 뷰어 본인의 손패에 있을 때만 노출 (그 외 null).
   * 클라이언트가 손패 정렬 시 쯔모패를 분리해 그리는 용도.
   */
  myDrawnTile: TileId | null;
  /**
   * 화료 정산 후 우라도라 표시패 (평소 null).
   * RoundSettled 이후 서버가 뷰를 재생성할 때 채운다.
   */
  uraDoraIndicators: TileId[] | null;
  byPlayer: Record<PlayerId, PlayerRoundView>;
}

/** buildPlayerView가 반환하는 단일 플레이어 뷰 */
export interface PlayerView {
  /** 이 뷰를 받는 플레이어 (또는 SPECTATOR_ID) */
  playerId: PlayerId;
  /** 이 뷰에서 공개된 tile id의 메타데이터 */
  tiles: Record<TileId, PublicTileView>;
  /** 가시성이 적용된 Zone 목록 */
  zones: Record<ZoneId, ZoneView>;
  /** 플레이어 목록 (공개 정보만) */
  players: PlayerInfo[];
  /** 국 진행 상태 (공개 정보만) */
  round: RoundView;
  /**
   * 증강 정보 채널. augmentData의 `view:{viewerId}:{key}`(본인 전용)와
   * `view:*:{key}`(전원 공개) 항목이 {key: value}로 담긴다.
   * 예: 오름패 엿보기 결과, 지정역 공개 등.
   */
  augmentView: Record<string, unknown>;
}

// ─────────────────────────── 표준 가시성 규칙 등록 ───────────────────────────

/**
 * 표준 가시성 규칙을 RuleRegistry에 등록한다.
 * GameEngine 초기화 시 (표준 규칙 정의와 함께) 한 번 호출한다.
 *
 * 커스텀 Zone을 추가하는 증강은 이 함수 호출 후
 * `rules.define("visibility.<customKind>", ...)` 로 기본값을 정의한다.
 */
export function defineVisibilityRules(rules: RuleRegistry): void {
  rules.define<VisibilityRule>("visibility.hand", "owner");
  rules.define<VisibilityRule>("visibility.discards", "public");
  rules.define<VisibilityRule>("visibility.melds", "public");
  rules.define<VisibilityRule>("visibility.wall", "hidden");
  rules.define<VisibilityRule>("visibility.deadWall", "hidden");
}

// ─────────────────────────── 핵심: buildPlayerView ───────────────────────────

/**
 * GameState + 뷰어 id + 규칙 → PlayerView.
 *
 * - SPECTATOR_ID를 viewerId로 넘기면 모든 Zone이 public으로 처리된다.
 * - 규칙에 정의되지 않은 kind의 Zone은 "hidden" 으로 폴백한다 (안전 기본값).
 * - 우라도라 인디케이터는 호출자가 uraDoraIndicators를 직접 전달한다
 *   (RoundSettled 시점에만 서버가 채운다).
 */
export function buildPlayerView(
  state: GameState,
  viewerId: PlayerId,
  rules: RuleRegistry,
  options?: {
    /** 화료 정산 직후 우라도라 표시패를 함께 전달 */
    uraDoraIndicators?: TileId[];
  },
): PlayerView {
  const isSpectator = viewerId === SPECTATOR_ID;

  // ── Zone 가시성 필터링 ──
  const zones: Record<ZoneId, ZoneView> = {};
  for (const zone of Object.values(state.zones)) {
    const visibility = resolveZoneVisibility(
      zone.kind,
      viewerId,
      rules,
      isSpectator,
      zone.owner,
      state,
    );
    const { tileIds, hiddenCount } = applyVisibility(
      zone.tileIds,
      zone.owner,
      viewerId,
      visibility,
    );
    zones[zone.id] = {
      id: zone.id,
      kind: zone.kind,
      ...(zone.owner !== undefined ? { owner: zone.owner } : {}),
      tileIds,
      hiddenCount,
    };
  }

  // ── 플레이어 공개 정보 ──
  const players: PlayerInfo[] = state.players.map((p) => ({
    id: p.id,
    seat: p.seat,
    score: p.score,
    augments: [...p.augments],
    nickname: p.nickname,
    isBot: p.isBot,
  }));

  // ── 국 뷰 ──
  const round = buildRoundView(
    state.round,
    state.players.map((p) => p.id),
    viewerId,
    state,
    rules,
    options?.uraDoraIndicators ?? null,
    // 멜드 상세는 melds Zone이 이 뷰어에게 전부 공개일 때만 노출
    (pid) => zones[meldsZone(pid)]?.hiddenCount === 0,
  );

  const visibleTileIds = collectVisibleTileIds(zones, round);
  const tiles: Record<TileId, PublicTileView> = {};
  for (const id of visibleTileIds) {
    const tile = state.tiles[id];
    if (tile !== undefined) {
      tiles[id] = {
        id,
        kind: tile.kind,
        attrs: tile.attrs,
      };
    }
  }

  // ── 증강 정보 채널 (view:{viewer}:* 본인 전용, view:*:* 전원 공개) ──
  const augmentView: Record<string, unknown> = {};
  const ownPrefix = `view:${viewerId}:`;
  const publicPrefix = "view:*:";
  for (const [key, value] of Object.entries(state.augmentData)) {
    if (key.startsWith(publicPrefix)) {
      augmentView[key.slice(publicPrefix.length)] = value;
    } else if (isSpectator && key.startsWith("view:")) {
      const rest = key.slice("view:".length);
      const sep = rest.indexOf(":");
      if (sep > 0) augmentView[rest.slice(sep + 1)] = value;
    } else if (key.startsWith(ownPrefix)) {
      augmentView[key.slice(ownPrefix.length)] = value;
    }
  }

  return { playerId: viewerId, tiles, zones, players, round, augmentView };
}

// ─────────────────────────── 내부 헬퍼 ───────────────────────────

function resolveZoneVisibility(
  kind: string,
  viewerId: PlayerId,
  rules: RuleRegistry,
  isSpectator: boolean,
  zoneOwner: PlayerId | undefined,
  state: GameState,
): VisibilityRule {
  if (isSpectator) return "public";

  const ruleKey = `visibility.${kind}`;
  if (rules.has(ruleKey)) {
    return rules.resolve<VisibilityRule>(ruleKey, {
      playerId: viewerId,
      state,
      ...(zoneOwner !== undefined ? { zoneOwner } : {}),
    });
  }
  // 알 수 없는 Zone kind는 hidden으로 폴백 (증강이 새 Zone을 등록하기 전 안전장치)
  return "hidden";
}

function applyVisibility(
  tileIds: readonly TileId[],
  owner: PlayerId | undefined,
  viewerId: PlayerId,
  visibility: VisibilityRule,
): { tileIds: TileId[]; hiddenCount: number } {
  if (typeof visibility === "object") {
    // peek: 소유자는 전체, 타인은 앞 N장만
    if (owner === viewerId) {
      return { tileIds: [...tileIds], hiddenCount: 0 };
    }
    const shown = tileIds.slice(0, Math.max(0, visibility.count));
    return { tileIds: shown, hiddenCount: tileIds.length - shown.length };
  }
  switch (visibility) {
    case "public":
      return { tileIds: [...tileIds], hiddenCount: 0 };

    case "owner":
      if (owner === viewerId) {
        return { tileIds: [...tileIds], hiddenCount: 0 };
      }
      return { tileIds: [], hiddenCount: tileIds.length };

    case "hidden":
      return { tileIds: [], hiddenCount: tileIds.length };

    case "count_only":
      return { tileIds: [], hiddenCount: tileIds.length };
  }
}

function buildRoundView(
  round: RoundState,
  playerIds: PlayerId[],
  viewerId: PlayerId,
  state: GameState,
  rules: RuleRegistry,
  uraDoraIndicators: TileId[] | null,
  meldsVisible: (pid: PlayerId) => boolean,
): RoundView {
  const byPlayer: Record<PlayerId, PlayerRoundView> = {};
  for (const pid of playerIds) {
    const pr: PlayerRoundState = round.byPlayer[pid] ?? {
      riichi: null,
      temporaryFuriten: false,
      riichiFuriten: false,
      furiten: false,
      melds: [],
      discardedKinds: [],
    };
    const meldCount = pr.melds.length;
    const riichiDeclared = pr.riichi !== null;
    const doubleRiichi = pr.riichi?.double ?? false;
    const melds: MeldView[] = meldsVisible(pid)
      ? pr.melds.map((m) => ({
          kind: m.kind,
          tileIds: [...m.tileIds],
          ...(m.calledFrom !== undefined ? { calledFrom: m.calledFrom } : {}),
          ...(m.calledTileId !== undefined ? { calledTileId: m.calledTileId } : {}),
        }))
      : [];
    const riichiIndex =
      pr.riichi !== null ? { riichiTileIndex: pr.riichi.discardIndex } : {};

    if (pid === viewerId) {
      const furitenReasons = buildFuritenReasons(state, pid, pr, rules);
      // 본인 뷰: 전체 정보 공개
      byPlayer[pid] = {
        riichiDeclared,
        doubleRiichi,
        ippatsu: pr.riichi?.ippatsu ?? false,
        furiten: furitenReasons.length > 0,
        furitenReasons,
        meldCount,
        melds,
        ...riichiIndex,
      };
    } else {
      // 타인 뷰: 리치 선언 여부·더블 여부만 공개
      byPlayer[pid] = {
        riichiDeclared,
        doubleRiichi,
        meldCount,
        melds,
        ...riichiIndex,
      };
    }
  }

  // 쯔모패는 뷰어 본인의 손패에 실제로 들어 있을 때만 노출한다
  // (관전자는 모든 손패가 공개이므로 항상 노출)
  const viewerHand = state.zones[handZone(viewerId)]?.tileIds ?? [];
  const myDrawnTile =
    round.lastDrawnTile !== null &&
    (viewerId === SPECTATOR_ID || viewerHand.includes(round.lastDrawnTile))
      ? round.lastDrawnTile
      : null;

  return {
    prevalentWind: round.prevalentWind,
    roundNumber: round.roundNumber,
    honba: round.honba,
    riichiPot: round.riichiPot,
    dealerSeat: round.dealerSeat,
    turnSeat: round.turnSeat,
    turnCount: round.turnCount,
    phase: round.phase,
    direction: rules.has("turn.direction")
      ? rules.resolve<number>("turn.direction", { state })
      : 1,
    doraIndicators: [...round.doraIndicators],
    lastDiscard: round.lastDiscard
      ? { player: round.lastDiscard.player, tileId: round.lastDiscard.tileId }
      : null,
    myDrawnTile,
    uraDoraIndicators,
    byPlayer,
  };
}

function buildFuritenReasons(
  state: GameState,
  player: PlayerId,
  pr: PlayerRoundState,
  rules: RuleRegistry,
): FuritenReason[] {
  const reasons: FuritenReason[] = [];
  if (hasDiscardFuriten(state, player, pr, rules)) reasons.push("discard");
  if (pr.temporaryFuriten) reasons.push("temporary");
  if (pr.riichiFuriten) reasons.push("riichi");
  return reasons;
}

function collectVisibleTileIds(
  zones: Record<ZoneId, ZoneView>,
  round: RoundView,
): Set<TileId> {
  const ids = new Set<TileId>();
  for (const zone of Object.values(zones)) {
    for (const tileId of zone.tileIds) ids.add(tileId);
  }
  for (const tileId of round.doraIndicators) ids.add(tileId);
  for (const tileId of round.uraDoraIndicators ?? []) ids.add(tileId);
  if (round.lastDiscard !== null) ids.add(round.lastDiscard.tileId);
  return ids;
}

function hasDiscardFuriten(
  state: GameState,
  player: PlayerId,
  pr: PlayerRoundState,
  rules: RuleRegistry,
): boolean {
  if (pr.furiten) return true;
  // 버림 '이력'(discardedKinds) 기준 — 부로로 강에서 사라진 패도 후리텐 유지
  const discarded = pr.discardedKinds;
  if (discarded.length === 0) return false;
  const handKinds = (state.zones[handZone(player)]?.tileIds ?? []).map((id) => {
    const tile = state.tiles[id];
    if (tile === undefined) throw new Error(`Unknown tile: ${id}`);
    return tile.kind;
  });
  const waits = winningKinds(
    handKinds,
    pr.melds.length,
    undefined,
    scoringOptionsOf(state, rules, player),
  );
  if (waits.length === 0) return false;
  const waitKeys = new Set(waits.map(kindKey));
  return discarded.some((k) => waitKeys.has(k));
}
