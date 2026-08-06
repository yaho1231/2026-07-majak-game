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

import { ROUND_SCOPED_MARK } from "../engine/state/GameState.js";
import type { GameState, Meld, PlayerRoundState, RoundState } from "../engine/state/GameState.js";
import type { RuleRegistry } from "../engine/rules/RuleRegistry.js";
import type { PlayerId, ZoneId } from "../engine/zones/Zone.js";
import { kindKey } from "../mahjong/tiles/Tile.js";
import type { TileAttrs, TileId, TileKind } from "../mahjong/tiles/Tile.js";
import { winningKinds } from "../mahjong/scoring/waits.js";
import type { DecomposeOptions } from "../mahjong/scoring/decompose.js";
import {
  furitenOptionsOf,
  scoringOptionsOf,
  lockedDiscardIds,
  tenpaiNoYaku,
  yakulessWaits,
} from "../mahjong/flow/helpers.js";
import type { YakuRegistry } from "../mahjong/scoring/YakuRegistry.js";
import { discardsZone, handZone, meldsZone } from "../engine/zones/Zone.js";

// ─────────────────────────── 가시성 타입 ───────────────────────────

/**
 * Zone의 패 공개 여부.
 * - `public`     : 전원 공개 (버림패, 후로, 도라 표시패)
 * - `owner`      : 소유자만 공개 (손패)
 * - `hidden`     : 전원 비공개 (패산, 왕패)
 * - `count_only` : 장수만 공개, 내용 비공개
 * - `{mode:"peek",count}` : N장만 공개, 나머지는 장수만
 *   (엿보기 증강 — Modifier가 viewer/zoneOwner 문맥으로 조건부 반환)
 *   pick 생략/"front"=앞 N장, "back"=뒤 N장, "random"=무작위 N장
 *   (random은 손패가 안 바뀌면 같은 패로 고정)
 *
 * `"back"`은 패산처럼 **양쪽 끝이 서로 다른 의미**인 Zone을 위한 것이다 —
 * 패산은 index 0이 다음에 뽑을 패고 최후미가 '맨 밑'(밑장빼기가 보는 자리,
 * 미래를 보는 자가 패를 밀어 넣는 자리)이다. 뷰는 매번 상태에서 다시 계산되므로
 * 다른 증강이 밑에 패를 넣으면 창이 그대로 따라 밀린다(스냅샷이 아니다).
 */
export type PeekVisibility = {
  mode: "peek";
  count: number;
  pick?: "front" | "back" | "random";
};
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
  /**
   * 봇의 전략 원형 id — 이름표에 성향을 세운다 (사람이면 null).
   * 표시 전용이라 선택 필드다: 판단에 쓰이지 않으므로 테스트 뷰는 생략해도 된다.
   */
  archetype?: string | null;
}

export interface PublicTileView {
  id: TileId;
  kind: TileKind;
  attrs: TileAttrs;
}

/**
 * 공개 후로 표현. 치/펑/깡 구성과 어느 방향에서 가져왔는지까지
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
  /**
   * 이 리치가 **타가에게 보이지 않는** 리치인가 (스텔스 리치). 본인 뷰에서만 채워진다.
   * 클라이언트가 "리치!"·"더블리치!" 같은 전원 공개형 연출을 대신 조용한 표시로
   * 바꾸는 데 쓴다 — 큰 컷인이 뜨면 여러 시점을 함께 보는 화면에서 은닉이 새 보인다.
   */
  riichiHidden?: boolean;
  /** 일발 유효 여부 (본인 뷰에서만 포함) */
  ippatsu?: boolean;
  /** 후리텐 상태 (본인 뷰에서만 포함) */
  furiten?: boolean;
  /** 후리텐 사유 (본인 뷰에서만 포함) */
  furitenReasons?: FuritenReason[];
  /**
   * 형식텐파이(역없음) — 텐파이지만 어떤 오름패로도 역이 없어 화료할 수 없는 상태.
   * 본인 뷰에서만, 그리고 yaku 레지스트리가 주어졌을 때만 채워진다.
   * 열린 손 전용(멘젠 손은 리치·멘젠쯔모로 역을 만들 수 있어 해당 없음).
   */
  noYaku?: boolean;
  /**
   * 대기패 중 **역이 없어 론이 성립하지 않는** 종류(kindKey 목록). 본인 뷰 전용.
   * 오름패 표시가 "기다리면 먹을 수 있다"로 읽히는 오해를 막는다 —
   * 이 목록에 든 패는 화면에서 "역없음"으로 구분해 그린다.
   * 리치 중이면 리치가 역이 되므로 자연히 비어 있다.
   */
  noYakuWaits?: string[];
  /**
   * 봉인되어 버릴 수 없는 패 종류(kindKey 목록) — discard.blockedKinds 규칙의
   * 해석 결과. 본인 뷰(관전자는 전원 뷰)에서만 포함. 클라이언트가 봉인 패에
   * 자물쇠 표시를 그리는 용도 (봉인 여부는 클릭해 보면 드러나므로 숨길 정보가 아니다).
   */
  sealedKinds?: string[];
  /**
   * 봉인되어 버릴 수 없는 **개별 손패**(tileId 목록) — `discard.blockedKinds`와
   * `discard.blockedTileIds`를 합친 최종 판정 결과. 본인 뷰(관전자는 전원)에만 실린다.
   *
   * `sealedKinds`만으로는 "종류는 잠겼지만 이 한 장은 안 잠긴" 개별 봉인을 그릴 수 없다 —
   * 자물쇠는 이 목록으로 그려야 서버 판정과 정확히 일치한다.
   */
  sealedTileIds?: TileId[];
  /** 후로 수 — melds Zone 장수로 계산 가능하지만 편의용 */
  meldCount: number;
  /**
   * 후로 상세 (치/펑/깡 묶음·호출 방향). melds Zone이 이 뷰어에게
   * 공개(hiddenCount=0)일 때만 채워지고, 아니면 빈 배열.
   */
  melds: MeldView[];
  /** 리치 선언패의 discards 내 인덱스 (바닥에서 눕혀 그리는 용도, 공개) */
  riichiTileIndex?: number;
  /**
   * **쯔모기리**로 버린 패의 tileId 목록 (공개).
   * 바닥에 "손을 대지 않고 그대로 흘린 패" 표식을 그리는 용도 —
   * 실제 탁자에서 손이 움직였는지는 전원이 보는 정보다.
   */
  tsumogiriIds: TileId[];
  /**
   * 지금 **쯔모패를 손패와 떨어뜨려 쥐고 있는가** (공개).
   *
   * 실제 탁자에서 쯔모패는 손패 오른쪽에 한 장 따로 놓인다 — 내용은 안 보여도
   * "따로 한 장 있다"는 건 전원이 본다. true면 이 사람의 손패 마지막 한 장이
   * 그 쯔모패이므로, 클라이언트는 그 앞에 틈을 벌려 그린다.
   *
   * 손패에 끼워 넣었거나(직접 배치를 옮겼거나) 이미 버렸으면 false다.
   */
  drawnSeparated: boolean;
}

export type FuritenReason = "discard" | "temporary" | "riichi";

/** 버림패가 나온 손패 자리 — 내용은 밝히지 않고 자리만 공개한다 */
export interface DiscardOrigin {
  player: PlayerId;
  tileId: TileId;
  /** 버리기 직전 배치에서의 0-based 자리 (왼→오른쪽) */
  index: number;
  /** 그때의 총 자릿수 (쯔모패 포함) */
  handSize: number;
  /** 떨어져 있던 쯔모패를 그대로 버렸는가 */
  tsumogiri: boolean;
}

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
   * 마지막 버림패가 **손패 어느 자리에서 나왔는가** (공개).
   *
   * 실제 탁자에서 남의 손이 어느 자리에서 열렸는지는 전원이 본다 — 그게 판 읽기의
   * 재료다. 배치를 서버가 알고 있으므로(handOrder) 패 내용을 밝히지 않고
   * 자리만 공개할 수 있다. 클라이언트가 그 자리에 잠깐 표식을 띄운다.
   *
   * `index`는 **버리기 직전** 배치에서의 0-based 자리(왼→오른쪽), `handSize`는 그때의
   * 총 자릿수다. `index === handSize - 1 && tsumogiri`면 떨어져 있던 쯔모패를 그대로 버린 것.
   */
  lastDiscardFrom: DiscardOrigin | null;
  /**
   * 이번 턴 쯔모패 — 뷰어 본인의 손패에 있을 때만 노출 (그 외 null).
   * 클라이언트가 손패 정렬 시 쯔모패를 분리해 그리는 용도.
   */
  myDrawnTile: TileId | null;
  /**
   * 화료 정산 후 뒷도라 표시패 (평소 null).
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
  /**
   * 이 뷰어에게 적용되는 화료형 분해 옵션 (`scoringOptionsOf`의 결과).
   *
   * 증강이 화료형 자체를 바꾸면(진짜 용 = 5멘쯔, 무너진 국경 = 무늬 무시 슌쯔,
   * 끝없는 윤회 = 순환 슌쯔 …) **대기 계산도 같이 바뀌어야 한다.** 그런데 봇 정책과
   * 클라이언트는 GameState도 RuleRegistry도 못 보므로 `scoringOptionsOf`를 부를 수 없어,
   * 예전엔 전부 표준 4멘쯔로 대기를 계산했다 — 진짜 용 보유자의 봇이 자기 대기를
   * 못 읽던 원인이다(60차).
   *
   * `winningKinds(kinds, meldCount, undefined, view.scoringOptions)`처럼 그대로 넘기면 된다.
   * `scoringOptionsOf`는 `sequenceSuits`(Set)를 채우지 않으므로 JSON 직렬화에 안전하다.
   */
  scoringOptions: DecomposeOptions;
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
  /**
   * 이 뷰어에게 도라 표시패를 감춘다 (가려진 도라). playerId = **보는 사람**.
   * true면 그 뷰어의 PlayerView에서 도라 표시패가 빠져 뒷면으로 렌더된다.
   * 보유자는 자기 규칙만 false로 두고 타인에게만 true가 걸리게 Modifier를 짠다.
   */
  rules.define<boolean>("visibility.doraIndicators.hidden", false);
}

// ─────────────────────────── 손패 배치(정렬) ───────────────────────────

/**
 * **손패 배치는 소유자의 것이다.**
 *
 * 실제 탁자에서 손패의 왼→오른쪽 순서는 그 사람이 정한다. 남들에게는 뒷면이라
 * 내용이 안 보일 뿐, **자리 자체는 모두가 같은 것을 본다**. 뷰어마다 제각기
 * 정렬하면 관전·투시로 공개될 때 그 사람이 실제로 쥔 배치와 어긋난다
 * (2026-08-01 사용자 지적).
 *
 * 그래서 배치는 뷰를 만들 때 **한 번만** 정하고 모든 뷰어가 그 순서를 받는다.
 * - 소유자가 배치를 보내 왔으면(`handOrder`) 그 순서 그대로.
 * - 보내지 않았으면(봇·아직 한 번도 안 보낸 사람) 표준 정렬로 폴백한다.
 *
 * 배치는 곧 낡는다(쯔모·후로로 손패가 바뀌므로). 낡아도 안전하게 흡수한다:
 * 지금 손에 없는 id는 무시하고, 배치에 없는 새 패(= 방금 쯔모한 패)는 **맨 뒤**로
 * 보낸다 — 실제 마작에서 쯔모패를 손패 오른쪽에 따로 놓는 것과 같다.
 */
const DISPLAY_SUIT_ORDER: Record<string, number> = {
  man: 0,
  pin: 1,
  sou: 2,
  wind: 3,
  dragon: 4,
};

/** 표준 정렬 키 — 만→통→삭→풍→삼원, 같은 패면 적도라가 앞. 클라이언트 sortTileIds의 사본 */
function displayOrderOf(state: GameState, id: TileId): number {
  const tile = state.tiles[id];
  if (tile === undefined) return Number.MAX_SAFE_INTEGER;
  const suit = DISPLAY_SUIT_ORDER[tile.kind.suit] ?? 9;
  return suit * 1000 + tile.kind.rank * 10 - (tile.attrs.red === true ? 1 : 0);
}

function sortForDisplay(state: GameState, tileIds: readonly TileId[]): TileId[] {
  return [...tileIds].sort((a, b) => {
    const oa = displayOrderOf(state, a);
    const ob = displayOrderOf(state, b);
    if (oa !== ob) return oa - ob;
    const sa = state.tiles[a]?.kind.suit ?? "";
    const sb = state.tiles[b]?.kind.suit ?? "";
    if (sa !== sb) return sa < sb ? -1 : 1;
    return a - b;
  });
}

/**
 * 소유자가 정한 배치를 지금 손패에 적용한다 (배치가 없으면 표준 정렬).
 *
 * 배치가 없을 때 **쯔모패는 맨 뒤**로 뺀다 — 실제 탁자에서 쯔모패는 손패 오른쪽에
 * 한 장 따로 놓기 때문이다. 배치를 보내는 클라이언트도 같은 자리에 둔다.
 * (배치를 직접 옮겨 손패 사이에 끼워 넣었다면 그 배치를 존중한다 — 그때는
 * `drawnSeparated`가 false가 되어 화면에서도 틈이 사라진다.)
 */
function arrangeHand(
  state: GameState,
  tileIds: readonly TileId[],
  order: readonly TileId[] | undefined,
): TileId[] {
  if (order === undefined || order.length === 0) {
    const drawn = state.round.lastDrawnTile;
    if (drawn !== null && tileIds.includes(drawn)) {
      return [...sortForDisplay(state, tileIds.filter((id) => id !== drawn)), drawn];
    }
    return sortForDisplay(state, tileIds);
  }
  const inHand = new Set(tileIds);
  const placed: TileId[] = [];
  const seen = new Set<TileId>();
  for (const id of order) {
    if (!inHand.has(id) || seen.has(id)) continue;
    seen.add(id);
    placed.push(id);
  }
  // 배치에 없는 패(= 배치를 보낸 뒤에 들어온 패)는 정렬해 맨 뒤에 붙인다
  const rest = sortForDisplay(
    state,
    tileIds.filter((id) => !seen.has(id)),
  );
  return [...placed, ...rest];
}

/**
 * 이 사람의 **지금 손패를 배치 순서대로** 돌려준다 (뷰와 똑같은 순서).
 *
 * 뷰를 만들지 않고 자리만 알아야 하는 쪽(버리기 직전에 자리를 재는 HanchanController)이
 * 쓴다 — 뷰와 같은 함수를 거쳐야 화면의 자리와 어긋나지 않는다.
 */
export function arrangeHandForDisplay(
  state: GameState,
  player: PlayerId,
  order: readonly TileId[] | undefined,
): TileId[] {
  return arrangeHand(state, state.zones[handZone(player)]?.tileIds ?? [], order);
}

// ─────────────────────────── 핵심: buildPlayerView ───────────────────────────

/**
 * GameState + 뷰어 id + 규칙 → PlayerView.
 *
 * - SPECTATOR_ID를 viewerId로 넘기면 모든 Zone이 public으로 처리된다.
 * - 규칙에 정의되지 않은 kind의 Zone은 "hidden" 으로 폴백한다 (안전 기본값).
 * - 뒷도라 인디케이터는 호출자가 uraDoraIndicators를 직접 전달한다
 *   (RoundSettled 시점에만 서버가 채운다).
 */
export function buildPlayerView(
  state: GameState,
  viewerId: PlayerId,
  rules: RuleRegistry,
  options?: {
    /** 화료 정산 직후 뒷도라 표시패를 함께 전달 */
    uraDoraIndicators?: TileId[];
    /** 역 레지스트리 — 주면 본인 뷰에 형식텐파이(역없음) 여부를 채운다 */
    yaku?: YakuRegistry;
    /**
     * 플레이어별 손패 배치 (소유자가 직접 정한 왼→오른쪽 순서).
     * 없는 플레이어는 표준 정렬로 폴백한다. 자세한 규약은 arrangeHand 주석.
     */
    handOrder?: Record<PlayerId, readonly TileId[]>;
    /**
     * 마지막 버림패가 나온 손패 자리. 배치를 아는 쪽(HanchanController)이
     * 버리기 **직전**에 재어 넘긴다 — 패가 손을 떠난 뒤에는 복원할 수 없다.
     */
    lastDiscardFrom?: DiscardOrigin | null;
  },
): PlayerView {
  const isSpectator = viewerId === SPECTATOR_ID;
  /** 이 뷰어에게 도라 표시패가 가려져 있는가 (가려진 도라) — 왕패 열람에도 적용한다 */
  const hidesDoraIndicators =
    !isSpectator &&
    rules.has("visibility.doraIndicators.hidden") &&
    rules.resolve<boolean>("visibility.doraIndicators.hidden", {
      playerId: viewerId,
      state,
    });

  // ── Zone 가시성 필터링 ──
  const zones: Record<ZoneId, ZoneView> = {};
  /** 좌석별 배치가 적용된 손패 (가시성 적용 전) — 쯔모패 분리 판정에 쓴다 */
  const arrangedHands: Record<PlayerId, TileId[]> = {};
  for (const zone of Object.values(state.zones)) {
    const visibility = resolveZoneVisibility(
      zone.kind,
      viewerId,
      rules,
      isSpectator,
      zone.owner,
      state,
    );
    // 손패는 소유자가 정한 배치를 **가시성보다 먼저** 입힌다 — 그래야
    // 엿보기(앞 N장)도, 관전·투시(전부 공개)도 모두 같은 배치를 본다.
    let zoneTileIds = zone.tileIds;
    if (zone.kind === "hand" && zone.owner !== undefined) {
      zoneTileIds = arrangeHand(state, zone.tileIds, options?.handOrder?.[zone.owner]);
      // 배치는 가려진 손패에도 존재한다 — 쯔모패가 따로 놓였는지(공개 정보)를
      // 판단하려면 뷰가 아니라 이 배치를 봐야 한다.
      arrangedHands[zone.owner] = zoneTileIds;
    }
    let { tileIds, hiddenCount } = applyVisibility(
      zoneTileIds,
      zone.owner,
      viewerId,
      visibility,
    );
    // 가려진 도라(dora_conceal)는 RoundView.doraIndicators만 비웠다. 그런데 표시패
    // **실물은 왕패 Zone에 그대로 있어**, 왕패를 여는 증강(이면투시·왕패의 주인·
    // 절벽 위에 피어난 꽃·영상 정찰)을 가진 뷰어에게는 종류까지 그대로 새어 나갔다 —
    // prism 증강의 유일한 능력이 상대의 silver 하나로 무효화됐다(docs/25 정보 #3).
    // 표시패를 별도 Zone으로 분리하는 대신, 여기서 그 tileId만 뺀다.
    if (zone.kind === "deadWall" && hidesDoraIndicators) {
      const indicators = new Set(state.round.doraIndicators);
      const kept = tileIds.filter((id) => !indicators.has(id));
      hiddenCount += tileIds.length - kept.length;
      tileIds = kept;
    }
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
    archetype: p.archetype ?? null,
  }));

  // ── 국 뷰 ──
  const round = buildRoundView(
    state.round,
    state.players.map((p) => p.id),
    viewerId,
    state,
    rules,
    options?.uraDoraIndicators ?? null,
    // 후로 상세는 melds Zone이 이 뷰어에게 전부 공개일 때만 노출
    (pid) => zones[meldsZone(pid)]?.hiddenCount === 0,
    arrangedHands,
    options?.lastDiscardFrom ?? null,
    options?.yaku,
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
  /**
   * 채널 이름에서 국 스코프 표식을 뗀다 — 클라이언트는 표식을 모른다.
   * (표식이 붙은 키는 다음 국 시작에 setupRound가 통째로 지운다.)
   */
  const channel = (raw: string): string =>
    raw.endsWith(ROUND_SCOPED_MARK)
      ? raw.slice(0, raw.length - ROUND_SCOPED_MARK.length)
      : raw;
  /**
   * 비워진 채널은 아예 내려보내지 않는다.
   *
   * 증강이 표시를 내릴 때 `augmentDataSet(key, "")`로 값을 비우는데(리듀서에 삭제가
   * 없다), 클라이언트는 **키가 있으면 그린다** — 리치 봉인·핏빛 계약이 값 검사 없이
   * 행을 만들어 "봉인 해제됐는데 봉인 배지가 남는" 증상이 났다(2026-07-31).
   * 빈 값은 여기서 잘라, 어느 증강이든 ""로 비우면 화면에서도 사라지게 한다.
   */
  const cleared = (v: unknown): boolean => v === undefined || v === null || v === "";
  for (const [key, value] of Object.entries(state.augmentData)) {
    if (cleared(value)) continue;
    if (key.startsWith(publicPrefix)) {
      augmentView[channel(key.slice(publicPrefix.length))] = value;
    } else if (isSpectator && key.startsWith("view:")) {
      const rest = key.slice("view:".length);
      const sep = rest.indexOf(":");
      if (sep > 0) augmentView[channel(rest.slice(sep + 1))] = value;
    } else if (key.startsWith(ownPrefix)) {
      augmentView[channel(key.slice(ownPrefix.length))] = value;
    }
  }

  // ── 실제 패 공개 채널 (revealTiles:*) ──
  // augmentView에 `revealTiles:{tag}` = TileId[] 로 실린 항목은, 그 특정 패들의
  // 메타데이터를 이 뷰어의 tiles에 포함시켜 클라이언트가 '진짜 패'로 그릴 수 있게 한다.
  // 명시된 tile id만 노출하므로 상대 손패 Zone 전체가 새지 않는다.
  // (첫 사용처: 봉인술사가 상대 손패의 봉인된 실제 패를 보유자에게 보여준다.)
  for (const [key, value] of Object.entries(augmentView)) {
    if (!key.startsWith("revealTiles:") || !Array.isArray(value)) continue;
    for (const id of value as unknown[]) {
      if (typeof id !== "number" || tiles[id] !== undefined) continue;
      const tile = state.tiles[id];
      if (tile !== undefined) {
        tiles[id] = { id, kind: tile.kind, attrs: tile.attrs };
      }
    }
  }

  return {
    playerId: viewerId,
    tiles,
    zones,
    players,
    round,
    augmentView,
    // 화료형 변형(진짜 용 5멘쯔 등)을 봇·클라이언트의 대기 계산에도 전달한다.
    // 관전자는 특정 플레이어가 아니므로 표준 옵션으로 둔다.
    scoringOptions:
      viewerId === SPECTATOR_ID ? {} : scoringOptionsOf(state, rules, viewerId),
  };
}

/**
 * **이 뷰어에게 실제로 보이는** 그 Zone의 패 id — 뷰를 통째로 만들지 않고 묻는다.
 *
 * 증강이 남의 바닥·손패를 후보로 낼 때 쓴다. 프롬프트 후보는 **그 자체가 정보**다 —
 * FlowController가 validate를 통과한 후보만 제시하므로, 가려진 패를 후보에 담으면
 * "무엇이 거기 있는가"가 후보의 존재·개수로 새어 나간다. 특히 후보를 조건으로
 * 거르는 증강(무덤 도굴 = '화료되는 패만')은 가려진 패의 정체를 그대로 알려 준다
 * (2026-08-02 감사, 안개 계열 × 무덤 도굴).
 *
 * 판정은 buildPlayerView와 **같은 두 함수**(resolveZoneVisibility·applyVisibility)를
 * 거친다 — 사본을 만들면 화면에 보이는 것과 후보가 갈라진다.
 */
export function visibleTileIdsIn(
  state: GameState,
  rules: RuleRegistry,
  viewer: PlayerId,
  zoneId: ZoneId,
): TileId[] {
  const zone = state.zones[zoneId];
  if (zone === undefined) return [];
  const visibility = resolveZoneVisibility(
    zone.kind,
    viewer,
    rules,
    viewer === SPECTATOR_ID,
    zone.owner,
    state,
  );
  return applyVisibility(zone.tileIds, zone.owner, viewer, visibility).tileIds;
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
    // peek: 소유자는 전체, 타인은 N장만
    if (owner === viewerId) {
      return { tileIds: [...tileIds], hiddenCount: 0 };
    }
    const count = Math.max(0, Math.min(visibility.count, tileIds.length));
    // "back"은 배열 순서를 그대로 유지한 채 **뒤 N장**을 준다 —
    // 패산이라면 마지막 원소가 '맨 밑장'(다음 밑장빼기로 나올 패)이다.
    const shown =
      visibility.pick === "random"
        ? peekRandom(tileIds, count)
        : visibility.pick === "back"
          ? tileIds.slice(tileIds.length - count)
          : tileIds.slice(0, count);
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
      // 자기 Zone은 자기가 안다. peek 분기에는 있던 소유자 면제가 여기엔 없어서,
      // 박무(brief_fog)가 깔리면 **피해자가 자기 바닥도 못 봤다** — 실제 탁자에서
      // 불가능한 상태이고, 자기 후리텐 판단(내가 뭘 버렸는지)이 화면에서 사라졌다
      // (docs/25 정보 #2). 안개는 남의 바닥을 가리는 능력이지 내 기억을 지우는
      // 능력이 아니다.
      if (owner === viewerId) {
        return { tileIds: [...tileIds], hiddenCount: 0 };
      }
      return { tileIds: [], hiddenCount: tileIds.length };
  }
}

/**
 * 무작위 peek — tile id 집합에서 결정적으로 count장을 고른다.
 * 시드를 정렬된 tile id 집합으로 잡아, 손패(패 id 다중집합)가 그대로면
 * 매 렌더마다 같은 패가 뽑힌다(리렌더로 더 많은 패가 새는 것을 방지).
 * 손패가 바뀌면(쯔모·버림) 뽑히는 패도 자연히 바뀐다. 반환은 원래 순서.
 */
function peekRandom(tileIds: readonly TileId[], count: number): TileId[] {
  if (count >= tileIds.length) return [...tileIds];
  // FNV-1a로 정렬된 id 집합을 해시해 시드 생성
  let seed = 2166136261 >>> 0;
  for (const id of [...tileIds].sort((a, b) => a - b)) {
    seed = Math.imul(seed ^ (id >>> 0), 16777619) >>> 0;
  }
  const rng = (): number => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const idx = tileIds.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idx[i]!, idx[j]!] = [idx[j]!, idx[i]!];
  }
  const chosen = idx.slice(0, count).sort((a, b) => a - b);
  return chosen.map((i) => tileIds[i]!);
}

function buildRoundView(
  round: RoundState,
  playerIds: PlayerId[],
  viewerId: PlayerId,
  state: GameState,
  rules: RuleRegistry,
  uraDoraIndicators: TileId[] | null,
  meldsVisible: (pid: PlayerId) => boolean,
  arrangedHands: Record<PlayerId, TileId[]>,
  lastDiscardFrom: DiscardOrigin | null,
  yaku?: YakuRegistry,
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
      discardCount: 0,
      tsumogiriIds: [],
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
    /*
     * 리치 선언패 자리 — **그 패의 현재 위치**를 다시 찾는다.
     *
     * 저장된 `discardIndex`를 그대로 내보내면, 도굴(grave_rob)처럼 바닥 중간에서
     * 패를 빼 가는 증강이 지나간 뒤 뒤쪽 패가 한 칸씩 당겨져 **엉뚱한 패가 눕혀
     * 표시된다**(docs/25 손패 조작 #4). tileId가 없는 구 상태는 종전대로 인덱스 폴백.
     */
    const riichiIndex = ((): { riichiTileIndex?: number } => {
      if (pr.riichi === null) return {};
      const declaredId = pr.riichi.discardTileId;
      if (declaredId === undefined) return { riichiTileIndex: pr.riichi.discardIndex };
      const river = state.zones[discardsZone(pid)]?.tileIds ?? [];
      const at = river.indexOf(declaredId);
      // 선언패 자체가 바닥에서 사라졌으면(도굴 대상이 선언패였다) 표식을 내린다 —
      // 없는 패를 가리키느니 아무것도 안 가리키는 편이 정직하다.
      return at >= 0 ? { riichiTileIndex: at } : {};
    })();
    // 쯔모패가 손패와 떨어져 있는가 — 배치의 **마지막 한 장**이 이번 쯔모패면 그렇다.
    // (버리면 lastDrawnTile이 비므로 자연히 false가 된다.)
    const arranged = arrangedHands[pid] ?? [];
    const drawnSeparated =
      round.lastDrawnTile !== null &&
      arranged.length > 0 &&
      arranged[arranged.length - 1] === round.lastDrawnTile;
    // 쯔모기리 표식·분리 여부는 실제 탁자에서 전원이 보는 정보다 (본인·타인 공통)
    const publicDraw = { tsumogiriIds: [...pr.tsumogiriIds], drawnSeparated };

    // 봉인된 패 — 본인(관전자는 전원)에게만 노출. 규칙 미정의 상태(비표준 게임) 폴백 [].
    const showSealed = pid === viewerId || viewerId === SPECTATOR_ID;
    const sealedKinds =
      showSealed && rules.has("discard.blockedKinds")
        ? [...new Set(rules.resolve<string[]>("discard.blockedKinds", { playerId: pid, state }))]
        : [];
    // 실제로 잠긴 손패 — 리치 예외·소프트락 예외까지 얹은 **버림 액션과 같은 판정**.
    // 원재료(sealedDiscardIds)를 그대로 실으면 화면에는 자물쇠가 걸렸는데 실제로는
    // 버려지는 거짓 UI가 된다(docs/25 방해 #7).
    const sealedTileIds = showSealed ? [...lockedDiscardIds(state, rules, pid)] : [];
    const sealed = {
      ...(sealedKinds.length > 0 ? { sealedKinds } : {}),
      ...(sealedTileIds.length > 0 ? { sealedTileIds } : {}),
    };

    // 이 사람의 리치가 은닉 대상인가 (본인 뷰 표시 + 타인 뷰 마스킹의 단일 판정)
    const riichiIsHidden =
      riichiDeclared &&
      rules.has("riichi.hidden") &&
      rules.resolve<boolean>("riichi.hidden", { playerId: pid, state });

    if (pid === viewerId) {
      const furitenReasons = buildFuritenReasons(state, pid, pr, rules);
      // 형식텐파이(역없음)는 yaku 레지스트리가 주어졌을 때만 계산 (열린 손 전용)
      const noYaku = yaku !== undefined && tenpaiNoYaku(state, pid, rules, yaku);
      // 역이 없어 론이 안 되는 대기패 종류 — "오름패인데 왜 못 먹지?"를 미리 알려 준다
      const noYakuWaits = yaku !== undefined ? yakulessWaits(state, pid, rules, yaku) : [];
      // 본인 뷰: 전체 정보 공개
      byPlayer[pid] = {
        riichiDeclared,
        doubleRiichi,
        ippatsu: pr.riichi?.ippatsu ?? false,
        furiten: furitenReasons.length > 0,
        furitenReasons,
        ...(noYaku ? { noYaku: true } : {}),
        ...(noYakuWaits.length > 0 ? { noYakuWaits } : {}),
        ...(riichiIsHidden ? { riichiHidden: true } : {}),
        meldCount,
        melds,
        ...riichiIndex,
        ...sealed,
        ...publicDraw,
      };
    } else {
      // 스텔스 리치 — 이 사람의 리치는 타인에게 보이지 않는다(본인·관전자는 그대로).
      // 타인에게 새는 리치 신호는 이 셋뿐이므로 셋을 함께 가린다.
      const hidden = viewerId !== SPECTATOR_ID && riichiIsHidden;
      // 타인 뷰: 리치 선언 여부·더블 여부만 공개
      byPlayer[pid] = {
        riichiDeclared: hidden ? false : riichiDeclared,
        doubleRiichi: hidden ? false : doubleRiichi,
        meldCount,
        melds,
        ...(hidden ? {} : riichiIndex),
        ...sealed,
        ...publicDraw,
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
    // 가려진 도라: 이 뷰어에게 도라 표시패를 감춘다(빈 배열 → collectVisibleTileIds가
    // 자동으로 뒷면 처리). 보유자·관전자는 자기 규칙이 false라 그대로 본다.
    doraIndicators:
      viewerId !== SPECTATOR_ID &&
      rules.resolve<boolean>("visibility.doraIndicators.hidden", {
        playerId: viewerId,
        state,
      })
        ? []
        : [...round.doraIndicators],
    lastDiscard: round.lastDiscard
      ? { player: round.lastDiscard.player, tileId: round.lastDiscard.tileId }
      : null,
    // 지금 바닥에 놓인 그 버림패의 출처일 때만 싣는다 — 더 진행된 뒤의 낡은 표식이
    // 엉뚱한 자리에 남지 않게 한다.
    lastDiscardFrom:
      lastDiscardFrom !== null &&
      round.lastDiscard !== null &&
      lastDiscardFrom.tileId === round.lastDiscard.tileId &&
      lastDiscardFrom.player === round.lastDiscard.player
        ? lastDiscardFrom
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
  // 버림 '이력'(discardedKinds) 기준 — 후로로 바닥에서 사라진 패도 후리텐 유지
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
    // 조커가 넓힌 대기는 후리텐을 만들지 않는다 (helpers.furitenOptionsOf)
    furitenOptionsOf(state, rules, player),
  );
  if (waits.length === 0) return false;
  const waitKeys = new Set(waits.map(kindKey));
  return discarded.some((k) => waitKeys.has(k));
}
