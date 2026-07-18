/**
 * GameState — 게임의 유일한 진실 (Single Source of Truth).
 *
 * 불변 규칙:
 * - JSON 직렬화 가능한 순수 데이터만 담는다 (클래스·Map·함수 금지)
 * - 확정된 Event의 Reducer만이 상태를 바꾼다
 * - PRNG 상태도 GameState의 일부 — 초기 상태 + Event Log = 완전한 재현
 *
 * 설계: docs/03_GAME_STATE.md
 */

import { buildStandardTileSet } from "../../mahjong/tiles/Tile.js";
import type { Tile, TileId } from "../../mahjong/tiles/Tile.js";
import { Prng } from "../random/Prng.js";
import {
  DEAD_WALL,
  WALL,
  createZone,
  discardsZone,
  handZone,
  meldsZone,
} from "../zones/Zone.js";
import type { PlayerId, Zones } from "../zones/Zone.js";

/** 자리(playerId)별 표시 정보 — 실제 닉네임·봇 여부 (없으면 id·비봇으로 폴백) */
export interface PlayerMeta {
  nickname: string;
  isBot: boolean;
}

export interface GameConfig {
  seed: number;
  /** 자리 순서 고정, [0] = 기가(최초 동가) */
  playerIds: PlayerId[];
  /** seat 식별자→표시 정보. 없으면(구 리플레이·테스트) id·비봇으로 폴백. */
  playerMeta?: Record<PlayerId, PlayerMeta>;
}

export interface RiichiState {
  double: boolean;
  ippatsu: boolean;
  /** 선언패의 discards 내 인덱스 */
  discardIndex: number;
}

export interface Meld {
  /** kokushi_pon = 울어 국사 전용 특수 부로(서로 다른 요구패 3장) */
  kind: "chi" | "pon" | "kan_open" | "kan_added" | "kan_closed" | "kokushi_pon";
  tileIds: TileId[];
  calledFrom?: PlayerId;
  calledTileId?: TileId;
}

export interface PlayerRoundState {
  riichi: RiichiState | null;
  /** 같은 순 안에서 론 가능한 패를 넘긴 상태. 다음 자기 쯔모 때 해제된다. */
  temporaryFuriten: boolean;
  /** 리치 후 론 가능한 패를 넘긴 상태. 국 끝까지 유지된다. */
  riichiFuriten: boolean;
  furiten: boolean;
  /** 의미 정보. 물리 위치는 melds:p Zone (docs/07 §4) */
  melds: Meld[];
  /**
   * 이번 국 자신이 버린 패의 kindKey 이력 (버림 시점 스냅샷, 순서 보존).
   * 버림패가 부로로 강에서 사라져도 후리텐 판정은 이 이력을 쓴다 (표준 룰).
   */
  discardedKinds: string[];
}

export interface PlayerState {
  id: PlayerId;
  /** 0~3, 게임 내내 불변. 자풍은 (seat - dealerSeat + n) % n 으로 유도 */
  seat: number;
  score: number;
  /** 보유 증강 인스턴스 id. 전원 공개 (2026-07-15 확정) */
  augments: string[];
  /** 표시용 닉네임 (config.playerMeta에서 옴, 없으면 id) */
  nickname: string;
  /** 봇 여부 (표시용) */
  isBot: boolean;
}

export interface RoundState {
  /** 장풍: 1동 2남 (서입 시 3서) */
  prevalentWind: number;
  /** 국 번호 1~4 */
  roundNumber: number;
  honba: number;
  /** 공탁 리치봉 (점수 단위, 이월 포함) */
  riichiPot: number;
  dealerSeat: number;
  turnSeat: number;
  /** 현재 순 (친의 n번째 쯔모 = n순). setupRound 직후 0 */
  turnCount: number;
  /** 페이즈 id — 전이표는 11_GAME_FLOW에서 데이터로 정의 */
  phase: string;
  /** 공개된 도라 표시패. deadWall 인덱스 규약은 docs/07 §2 */
  doraIndicators: TileId[];
  /** 마지막 버림 (reaction 대상). 부로·턴 진행 시 갱신 */
  lastDiscard: { player: PlayerId; tileId: TileId } | null;
  /** 이번 턴 쯔모패 (쯔모 화료·리치 후 버림 제한용) */
  lastDrawnTile: TileId | null;
  /** 이번 턴 쯔모가 영상패인지 여부 (영상개화 판정용) */
  lastDrawRinshan: boolean;
  /** 깡 직후 창깡 판정 대상. 안깡은 국사무쌍만 허용한다. */
  chankan: { player: PlayerId; tileId: TileId; closedKan: boolean } | null;
  /** 현재 국의 총 깡 횟수 (사깡산료 판정 등) */
  kanCount: number;
  /** 깡을 선언한 플레이어 목록 */
  kanCallers: PlayerId[];
  /** 첫 순위 유지 여부 (구종구패, 사풍연타 판정용. 부로/깡 발생 시 false) */
  firstTurn: boolean;
  /** 깡 후 버림 시 공개할 도라 갯수 예약 */
  pendingDora: number;
  /** 첫 바퀴가 부로로 깨졌는가 (더블리치 판정) */
  goAroundBroken: boolean;
  byPlayer: Record<PlayerId, PlayerRoundState>;
}

export interface GameState {
  config: GameConfig;
  prngState: number;
  players: PlayerState[];
  tiles: Record<TileId, Tile>;
  zones: Zones;
  round: RoundState;
  lastEventSeq: number;
  /**
   * 증강 전용 게임 단위 저장소. 증강이 자유롭게 키를 쓴다
   * (예: "recall_used:p0" → true). 국이 바뀌어도 유지된다.
   * 오직 이벤트 Reducer로만 변경한다 (SSOT). docs/10_AUGMENT_SYSTEM.md §6
   */
  augmentData: Record<string, unknown>;
}

/** 시작 점수·적도라 수는 호출자(Core Engine)가 RuleRegistry에서 읽어 넘긴다 */
export interface InitialStateOptions {
  startScore: number;
  redFivesPerSuit: number;
}

/** deadWall 크기 (영상패 4 + 도라/우라 표시패 10). docs/07 §2 */
export const DEAD_WALL_SIZE = 14;
/** 첫 도라 표시패의 deadWall 인덱스 */
export const FIRST_DORA_INDEX = 4;
export const HAND_START_SIZE = 13;

function freshPlayerRoundState(): PlayerRoundState {
  return {
    riichi: null,
    temporaryFuriten: false,
    riichiFuriten: false,
    furiten: false,
    melds: [],
    discardedKinds: [],
  };
}

function freshByPlayer(playerIds: readonly PlayerId[]): Record<PlayerId, PlayerRoundState> {
  const byPlayer: Record<PlayerId, PlayerRoundState> = {};
  for (const id of playerIds) byPlayer[id] = freshPlayerRoundState();
  return byPlayer;
}

/**
 * 초기 상태 생성: 136장 전부 wall, 표준 Zone 14개, 1국 준비 전 상태.
 * 배패·셔플은 setupRound가 한다.
 */
export function createInitialGameState(
  config: GameConfig,
  options: InitialStateOptions,
): GameState {
  const { playerIds } = config;
  if (playerIds.length < 2) {
    throw new Error(`Need at least 2 players, got ${playerIds.length}`);
  }
  if (new Set(playerIds).size !== playerIds.length) {
    throw new Error("Duplicate player ids");
  }

  const tileList = buildStandardTileSet({ redFivesPerSuit: options.redFivesPerSuit });
  const tiles: Record<TileId, Tile> = {};
  for (const tile of tileList) tiles[tile.id] = tile;

  const zones: Zones = {
    [WALL]: { ...createZone(WALL, "wall"), tileIds: tileList.map((t) => t.id) },
    [DEAD_WALL]: createZone(DEAD_WALL, "deadWall"),
  };
  for (const p of playerIds) {
    zones[handZone(p)] = createZone(handZone(p), "hand", p);
    zones[discardsZone(p)] = createZone(discardsZone(p), "discards", p);
    zones[meldsZone(p)] = createZone(meldsZone(p), "melds", p);
  }

  return {
    config,
    prngState: new Prng(config.seed).getState(),
    players: playerIds.map((id, seat) => ({
      id,
      seat,
      score: options.startScore,
      augments: [],
      nickname: config.playerMeta?.[id]?.nickname ?? id,
      isBot: config.playerMeta?.[id]?.isBot ?? false,
    })),
    tiles,
    zones,
    round: {
      prevalentWind: 1,
      roundNumber: 1,
      honba: 0,
      riichiPot: 0,
      dealerSeat: 0,
      turnSeat: 0,
      turnCount: 0,
      phase: "setup",
      doraIndicators: [],
      lastDiscard: null,
      lastDrawnTile: null,
      lastDrawRinshan: false,
      chankan: null,
      kanCount: 0,
      kanCallers: [],
      firstTurn: true,
      pendingDora: 0,
      goAroundBroken: false,
      byPlayer: freshByPlayer(playerIds),
    },
    lastEventSeq: 0,
    augmentData: {},
  };
}

export interface SetupRoundOptions {
  /** 플레이어별 배패 장수 (기본 13). deal.handSize 규칙에서 유도된다 */
  handSizeFor?: (playerId: PlayerId) => number;
}

/**
 * 국 준비: 전체 패를 PRNG로 셔플 → deadWall 14장 분리 → 친부터 13장씩 배패
 * → 첫 도라 표시패 공개 → 친의 쯔모 대기 상태로.
 *
 * 순수 함수 — 소비한 난수만큼 prngState가 전진하며, 같은 시드는 같은 배패를 만든다.
 * 모든 Zone은 비워지고 표준 Zone만 다시 채워진다
 * (커스텀 Zone의 국 경계 유지 여부는 10_AUGMENT_SYSTEM에서 설계).
 */
export function setupRound(
  state: GameState,
  options: SetupRoundOptions = {},
): GameState {
  const prng = new Prng(0);
  prng.setState(state.prngState);

  const allTileIds = Object.keys(state.tiles)
    .map(Number)
    .sort((a, b) => a - b);
  const shuffled = prng.shuffle(allTileIds);

  const deadWallIds = shuffled.slice(shuffled.length - DEAD_WALL_SIZE);
  let rest = shuffled.slice(0, shuffled.length - DEAD_WALL_SIZE);

  const playerCount = state.players.length;
  const zones: Zones = {
    [WALL]: createZone(WALL, "wall"),
    [DEAD_WALL]: { ...createZone(DEAD_WALL, "deadWall"), tileIds: deadWallIds },
  };
  // 친부터 자리 순서대로 13장씩 (deal.handSize 규칙으로 플레이어별 변경 가능)
  for (let i = 0; i < playerCount; i++) {
    const seat = (state.round.dealerSeat + i) % playerCount;
    const player = state.players.find((p) => p.seat === seat);
    if (player === undefined) throw new Error(`No player at seat ${seat}`);
    const handSize = options.handSizeFor?.(player.id) ?? HAND_START_SIZE;
    zones[handZone(player.id)] = {
      ...createZone(handZone(player.id), "hand", player.id),
      tileIds: rest.slice(0, handSize),
    };
    rest = rest.slice(handSize);
  }
  zones[WALL] = { ...createZone(WALL, "wall"), tileIds: rest };
  for (const p of state.players) {
    zones[discardsZone(p.id)] = createZone(discardsZone(p.id), "discards", p.id);
    zones[meldsZone(p.id)] = createZone(meldsZone(p.id), "melds", p.id);
  }

  const firstDora = deadWallIds[FIRST_DORA_INDEX];
  if (firstDora === undefined) {
    throw new Error("Dead wall is too small for a dora indicator");
  }

  return {
    ...state,
    prngState: prng.getState(),
    zones,
    round: {
      ...state.round,
      turnSeat: state.round.dealerSeat,
      turnCount: 0,
      phase: "turn.draw",
      doraIndicators: [firstDora],
      lastDiscard: null,
      lastDrawnTile: null,
      lastDrawRinshan: false,
      chankan: null,
      kanCount: 0,
      kanCallers: [],
      firstTurn: true,
      pendingDora: 0,
      goAroundBroken: false,
      byPlayer: freshByPlayer(state.players.map((p) => p.id)),
    },
  };
}
