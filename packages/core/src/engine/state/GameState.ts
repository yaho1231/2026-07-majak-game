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

import { buildStandardTileSet, kindKey } from "../../mahjong/tiles/Tile.js";
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

/**
 * 게임 모드 — 진행 길이(장 수)와 증강 템포를 결정한다.
 * - hanchan(반장전): 동+남 2장(기본 남4국까지). 드래프트 gameStart+southEntry.
 * - tonpuu(동풍전): 동 1장(기본 동4국까지). 드래프트 gameStart+eastThird.
 * 생략 시(구 리플레이·테스트) hanchan으로 폴백한다.
 */
export type GameMode = "hanchan" | "tonpuu";

export interface GameConfig {
  seed: number;
  /** 자리 순서 고정, [0] = 기가(최초 동가) */
  playerIds: PlayerId[];
  /** seat 식별자→표시 정보. 없으면(구 리플레이·테스트) id·비봇으로 폴백. */
  playerMeta?: Record<PlayerId, PlayerMeta>;
  /** 게임 모드. 없으면 hanchan(반장전)으로 폴백. 증강 모드 필터·템포 판정에 쓰인다. */
  mode?: GameMode;
}

export interface RiichiState {
  double: boolean;
  ippatsu: boolean;
  /** 선언패의 discards 내 인덱스 */
  discardIndex: number;
}

export interface Meld {
  /** kokushi_pon = 울어 국사 전용 특수 후로(서로 다른 요구패 3장) */
  kind: "chi" | "pon" | "kan_open" | "kan_added" | "kan_closed" | "kokushi_pon";
  tileIds: TileId[];
  calledFrom?: PlayerId;
  calledTileId?: TileId;
  /**
   * 멘젠(닫힌 손) 유지 후로 (묵계) — 이 후로는 눈에 보이게 눕지만 멘젠 판정에서는
   * 안깡(kan_closed)처럼 손을 열지 않는다. 리치·멘젠쯔모·멘젠 론 부수가 그대로 살아 있다.
   */
  silent?: boolean;
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
   * 버림패가 후로로 바닥에서 사라져도 후리텐 판정은 이 이력을 쓴다 (표준 룰).
   */
  discardedKinds: string[];
  /**
   * **쯔모기리**로 버린 패의 tileId 목록 — 방금 쯔모한 패를 손에 넣지 않고 그대로 버린 것.
   *
   * 실제 탁자에서 전원이 보는 정보다(손이 열리지 않으니 손버림과 눈에 띄게 다르다).
   * 상대의 손이 언제 움직였는지가 곧 판 읽기의 재료라, 바닥에 표식으로 남겨 둔다.
   *
   * 인덱스가 아니라 **tileId**로 담는다 — 후로로 바닥에서 패가 빠지면 인덱스가 밀려
   * (리치 선언패 인덱스가 겪는 문제) 엉뚱한 패에 표식이 붙는다.
   */
  tsumogiriIds: TileId[];
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
  /** 마지막 버림 (reaction 대상). 후로·턴 진행 시 갱신 */
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
  /** 첫 순위 유지 여부 (구종구패, 사풍연타 판정용. 후로/깡 발생 시 false) */
  firstTurn: boolean;
  /** 깡 후 버림 시 공개할 도라 갯수 예약 */
  pendingDora: number;
  /** 첫 바퀴가 후로로 깨졌는가 (더블리치 판정) */
  goAroundBroken: boolean;
  byPlayer: Record<PlayerId, PlayerRoundState>;
}

export interface GameState {
  config: GameConfig;
  prngState: number;
  players: PlayerState[];
  /**
   * 이 게임의 적도라 수 (수패 5의 몇 번째 사본까지). 국 시작 시 tiles를
   * 원본 표준 세트로 되돌리는 데 쓴다 — 증강의 패 변형(kind·conjured 등)이
   * 다음 국으로 새지 않게 한다. createInitialGameState가 고정한다.
   */
  redFivesPerSuit: number;
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

/**
 * **국 스코프 augmentData 키 표식.**
 *
 * 키 이름 끝에 이 표식이 붙은 augmentData 항목은 다음 국이 시작될 때(`setupRound`)
 * 통째로 지워진다 — "이번 국 동안만" 유효한 플래그·표시가 다음 국으로 새지 않게 한다.
 *
 * 왜 필요한가: 증강의 **효과** 키는 대개 `roundKey`를 섞어 국이 바뀌면 자동 만료되는데,
 * 그 효과를 화면에 알리는 **뷰 채널**(`view:*:…`)은 고정 키라 그대로 남았다. 그래서
 * 일확천금의 "3배!"·무장해제의 지목 관계처럼 이미 끝난 국의 표시가 다음 국 화면에
 * 계속 떠 있었다(2026-07-31 사용자 보고). 증강마다 ROUND_STARTED 리액션으로 하나씩
 * 지우는 대신, 키에 표식 하나만 붙이면 국 경계에서 엔진이 일괄 정리한다.
 *
 * 뷰 채널에 써도 클라이언트는 이 표식을 보지 못한다 — `buildPlayerView`가 떼고 넘긴다.
 * 국을 넘어 유지돼야 하는 값(스택·낙인·게임당 1회 지정 등)에는 붙이지 말 것.
 */
export const ROUND_SCOPED_MARK = "#round";

/** 이 키가 국 경계에서 지워지는 국 스코프 키인가 */
export function isRoundScopedKey(key: string): boolean {
  return key.endsWith(ROUND_SCOPED_MARK);
}

/** 시작 점수·적도라 수는 호출자(Core Engine)가 RuleRegistry에서 읽어 넘긴다 */
export interface InitialStateOptions {
  startScore: number;
  redFivesPerSuit: number;
}

/** deadWall 크기 (영상패 4 + 도라/뒷도라 표시패 10). docs/07 §2 */
export const DEAD_WALL_SIZE = 14;
/** 도라·뒷도라 표시패 블록의 장수 — 도라 5장과 뒷도라 5장이 교대로 붙어 있다 */
export const INDICATOR_BLOCK_SIZE = 10;
/**
 * 국 시작 시점 첫 도라 표시패의 deadWall 인덱스.
 *
 * ⚠ **고정 상수로 쓰지 말 것.** 깡으로 영상패를 뽑으면 왕패 앞이 한 장씩 비어
 * (보충하지 않는다 — 2026-07-26 사용자 확정) 뒤의 인덱스가 그만큼 당겨진다.
 * 지금 인덱스는 `doraIndicatorIndex()`로 구하고, 이 상수는 배패 시점 계산에만 쓴다.
 */
export const FIRST_DORA_INDEX = DEAD_WALL_SIZE - INDICATOR_BLOCK_SIZE;
export const HAND_START_SIZE = 13;

/**
 * 아직 남아 있는 **영상패** 장수.
 *
 * 왕패는 앞쪽 영상패 블록 + 뒤쪽 표시패 블록(항상 10장)으로 이뤄진다.
 * 깡으로 영상패를 뽑으면 앞이 한 장씩 줄어들 뿐 보충되지 않으므로,
 * 남은 영상패 = 왕패 전체 − 표시패 블록이다. 깡은 4회가 상한이라 0 밑으로는 안 간다.
 * (북풍 상인의 북빼기는 뽑은 자리를 패산 최후미로 되채우므로 이 값이 줄지 않는다.)
 */
export function rinshanRemaining(state: GameState): number {
  const len = state.zones[DEAD_WALL]?.tileIds.length ?? 0;
  return Math.max(0, len - INDICATOR_BLOCK_SIZE);
}

/**
 * k번째(0-based) 도라 표시패가 **지금** 왕패 배열의 몇 번째에 있는가.
 *
 * 표시패 블록은 늘 왕패의 마지막 10장이다 — 앞의 영상패가 비어도 표시패는 밀리지 않고
 * 배열 인덱스만 그만큼 당겨진다. 그래서 절대 상수(4·6·8·10·12)가 아니라
 * **뒤에서부터** 센다. 뒷도라 표시패는 바로 그 오른쪽(+1)이다(07 §2).
 */
export function doraIndicatorIndex(state: GameState, k: number): number {
  const len = state.zones[DEAD_WALL]?.tileIds.length ?? 0;
  return len - INDICATOR_BLOCK_SIZE + k * 2;
}

function freshPlayerRoundState(): PlayerRoundState {
  return {
    riichi: null,
    temporaryFuriten: false,
    riichiFuriten: false,
    furiten: false,
    melds: [],
    discardedKinds: [],
    tsumogiriIds: [],
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
    redFivesPerSuit: options.redFivesPerSuit,
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
  /**
   * 플레이어별 **강제 배패** (kindKey 목록 — "man5"·"wind1"). 증강 테스트 전용으로,
   * deal.presetHand 규칙에서 유도된다. 빈 배열·undefined면 평소대로 무작위 배패.
   *
   * 배패가 끝난 뒤 패산과 맞바꾸는 방식이라 총 장수·패산 길이·왕패는 그대로다
   * (남은 장수·도라 표시패가 어긋나지 않는다). 지정한 종류의 패가 패산에 남아 있지
   * 않으면(이미 4장을 다 썼거나 다른 좌석이 가져갔으면) 그 자리는 조용히 건너뛴다.
   *
   * 배패 장수(13)보다 **한 장 더** 지정하면 그 한 장은 그 좌석의 **첫 쯔모**가 된다 —
   * 14장을 고르는 것이 곧 "이 손으로 첫 순을 맞겠다"이기 때문이다(2026-08-01 사용자
   * 보고: 14장을 골랐는데 13장만 들어왔다). 그보다 더 지정한 몫은 버려진다.
   */
  presetHandFor?: (playerId: PlayerId) => readonly string[] | undefined;
}

/**
 * 강제 배패 적용 — 이미 배패가 끝난 zones에서 요청한 종류의 패를 패산과 맞바꾼다.
 *
 * 좌석을 **친부터 자리 순서대로** 처리하므로 같은 패를 두 좌석이 요구하면 앞선
 * 좌석이 먼저 가져간다(결정적). 밀려난 손패는 패산 **맨 뒤**로 보내 남은 국의 쯔모
 * 순서가 요청 때문에 앞당겨지지 않게 한다.
 *
 * 요청한 사본이 왕패로 새어 들어갔을 때도 **영상패 블록(앞 4장)에서는 회수한다** —
 * 그러지 않으면 "3장 지정했는데 2장만 들어온다"가 뽑기 운으로 종종 일어났다.
 * 도라·뒷도라 표시패(왕패의 마지막 10장)는 끝까지 건드리지 않으므로 도라는 그대로다.
 */
function applyPresetHands(
  zones: Zones,
  tiles: Record<TileId, Tile>,
  order: readonly PlayerId[],
  presetFor: (playerId: PlayerId) => readonly string[] | undefined,
): Zones {
  const wanted = new Map<PlayerId, readonly string[]>();
  for (const p of order) {
    const list = presetFor(p);
    if (list !== undefined && list.length > 0) wanted.set(p, list);
  }
  if (wanted.size === 0) return zones; // 지정 없음 — 배패를 한 장도 건드리지 않는다

  const keyOf = (id: TileId): string => {
    const tile = tiles[id];
    return tile === undefined ? "" : kindKey(tile.kind);
  };
  const dealt = new Map<PlayerId, TileId[]>(
    order.map((p) => [p, [...(zones[handZone(p)]?.tileIds ?? [])]]),
  );
  const wall = [...(zones[WALL]?.tileIds ?? [])];
  const deadWall = [...(zones[DEAD_WALL]?.tileIds ?? [])];
  /**
   * 왕패에서 가져와도 되는 구간 — **영상패 블록(앞)**뿐이다.
   * 도라·뒷도라 표시패는 언제나 왕패의 마지막 10장이라 이 구간을 건드려도
   * 표시패는 한 장도 바뀌지 않는다(시험 조건인 도라가 흔들리지 않는다).
   */
  const rinshanCount = Math.max(0, deadWall.length - INDICATOR_BLOCK_SIZE);
  const rinshanIds = deadWall.slice(0, rinshanCount);

  // ① 요청한 종류를 확보한다 — 자기 손 → 패산 → 다른 좌석의 손 → **영상패** 순.
  //    표시패(도라)는 끝까지 건드리지 않는다. 네 곳을 다 뒤져도 사본이 없으면
  //    (요청이 5장째거나 이미 다 나갔으면) 그 자리는 조용히 무작위로 채운다.
  const claimed = new Set<TileId>();
  const picked = new Map<PlayerId, TileId[]>();
  /** 배패 장수를 넘겨 지정한 한 장 — 그 좌석의 첫 쯔모로 깔아 준다 */
  const firstDraw = new Map<PlayerId, TileId>();
  for (const player of order) {
    const own = dealt.get(player) ?? [];
    const mine: TileId[] = [];
    // 손패 장수 + 1까지 본다. 마지막 한 장은 손이 아니라 첫 쯔모 자리로 간다.
    for (const key of (wanted.get(player) ?? []).slice(0, own.length + 1)) {
      const search = (ids: readonly TileId[]): TileId | undefined =>
        ids.find((id) => !claimed.has(id) && keyOf(id) === key);
      const found =
        search(own) ??
        search(wall) ??
        search(order.flatMap((q) => (q === player ? [] : (dealt.get(q) ?? [])))) ??
        search(rinshanIds);
      if (found === undefined) continue; // 남은 사본 없음 — 이 자리는 무작위로 채운다
      claimed.add(found);
      if (mine.length < own.length) mine.push(found);
      else firstDraw.set(player, found);
    }
    picked.set(player, mine);
  }

  // ② 남은 자리 — 원래 자기 손에 남은 패 우선, 모자라면 패산 앞쪽에서 당겨 온다
  const leftoverOwn = new Map<PlayerId, TileId[]>(
    order.map((p) => [p, (dealt.get(p) ?? []).filter((id) => !claimed.has(id))]),
  );
  const spare = wall.filter((id) => !claimed.has(id));
  for (const player of order) {
    const hand = picked.get(player) ?? [];
    const own = leftoverOwn.get(player) ?? [];
    const size = (dealt.get(player) ?? []).length;
    while (hand.length < size) {
      const next = own.shift() ?? spare.shift();
      if (next === undefined) break;
      hand.push(next);
    }
  }

  // ③ 첫 쯔모 지정 — 패산 맨 앞은 친부터 자리 순서대로 한 장씩 뽑혀 나간다.
  //    지정이 있는 좌석의 자리에 그 패를 끼워 넣으면 그 좌석의 첫 쯔모가 된다.
  //    (그 사이에 후로가 끼면 순서가 밀린다 — 첫 순 시험이 목적이므로 그대로 둔다.)
  const front: TileId[] = [];
  if (firstDraw.size > 0) {
    const last = order.reduce((acc, p, i) => (firstDraw.has(p) ? i : acc), -1);
    for (let i = 0; i <= last; i++) {
      const want = firstDraw.get(order[i] as PlayerId);
      const next = want ?? spare.shift();
      if (next !== undefined) front.push(next);
    }
  }

  // ④ 영상패를 빼 왔으면 그 자리를 메운다 — 왕패는 언제나 14장이어야 하고(깡 흐름·
  //    남은 장수 표시), 표시패 블록은 여전히 마지막 10장 그대로다. 메울 패는 패산
  //    **맨 뒤**에서 꺼내 쓴다(앞에서 꺼내면 다음 쯔모 순서가 밀린다).
  const leftovers = order.flatMap((p) => leftoverOwn.get(p) ?? []);
  const tail = [...spare, ...leftovers];
  const deadOut = deadWall.map((id) => {
    if (!claimed.has(id)) return id;
    const fill = tail.pop();
    return fill ?? id;
  });

  // ⑤ 패산 = 첫 쯔모 지정 + 남은 패산(원래 순서) + 손에서 밀려난 패(최후미).
  //    밀려난 패를 앞에 두면 방금 뺏은 패가 다음 쯔모로 곧장 되돌아온다.
  const out: Zones = {
    ...zones,
    [WALL]: { ...zones[WALL]!, tileIds: [...front, ...tail] },
    ...(zones[DEAD_WALL] !== undefined
      ? { [DEAD_WALL]: { ...zones[DEAD_WALL], tileIds: deadOut } }
      : {}),
  };
  for (const player of order) {
    out[handZone(player)] = {
      ...zones[handZone(player)]!,
      tileIds: picked.get(player) ?? [],
    };
  }
  return out;
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

  // 패를 원본 표준 세트로 되돌린다 — 지난 국에서 증강이 바꾼 kind·attrs
  // (색 통일·conjured 보라 이펙트·적도라 부여 등)가 다음 국으로 새지 않게 한다.
  // 패 id는 게임 내내 재사용되므로, 리셋하지 않으면 능력을 쓰지 않은 국에도
  // 변형이 남는다. (redFivesPerSuit는 게임 생성 시 고정 → 리플레이 결정성 유지)
  const tiles: Record<TileId, Tile> = {};
  for (const tile of buildStandardTileSet({ redFivesPerSuit: state.redFivesPerSuit })) {
    tiles[tile.id] = tile;
  }

  const allTileIds = Object.keys(tiles)
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

  // 강제 배패 (증강 테스트) — 배패가 끝난 뒤 패산과 맞바꾼다. 친부터 자리 순서대로.
  let dealt: Zones = zones;
  if (options.presetHandFor !== undefined) {
    const seatOrder: PlayerId[] = [];
    for (let i = 0; i < playerCount; i++) {
      const seat = (state.round.dealerSeat + i) % playerCount;
      const player = state.players.find((p) => p.seat === seat);
      if (player !== undefined) seatOrder.push(player.id);
    }
    dealt = applyPresetHands(zones, tiles, seatOrder, options.presetHandFor);
  }

  const firstDora = deadWallIds[FIRST_DORA_INDEX];
  if (firstDora === undefined) {
    throw new Error("Dead wall is too small for a dora indicator");
  }

  // 국 스코프 표식이 붙은 augmentData는 국 경계에서 통째로 지운다 — 지난 국의
  // 효과 플래그·공개 표시가 다음 국으로 새지 않는다(ROUND_SCOPED_MARK 참조).
  // 증강의 ROUND_STARTED 리액션은 이 리듀서 **뒤에** 돌므로, 새 국의 값을 다시 실을 수 있다.
  const augmentData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state.augmentData)) {
    if (!isRoundScopedKey(key)) augmentData[key] = value;
  }

  return {
    ...state,
    prngState: prng.getState(),
    tiles,
    zones: dealt,
    augmentData,
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
