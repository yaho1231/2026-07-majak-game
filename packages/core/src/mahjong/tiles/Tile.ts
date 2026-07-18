/**
 * Tile — 패의 정의.
 *
 * 핵심 설계: 정체성(id)과 속성(kind, attrs)의 분리.
 * id는 게임 내내 불변이고, kind·attrs는 증강이 바꿀 수 있다.
 * 역·점수 계산은 오직 현재의 kind·attrs만 본다 (Issue 002 해결).
 *
 * 설계: docs/07_TILE_SYSTEM.md §1
 */

export type TileId = number;

/** 표준 5종 suit. suit 자체는 열린 문자열 — 증강이 새 suit를 등록할 수 있다 */
export const Suits = {
  Man: "man",
  Pin: "pin",
  Sou: "sou",
  Wind: "wind",
  Dragon: "dragon",
} as const;

export type StandardSuit = (typeof Suits)[keyof typeof Suits];
export type Suit = string;

export interface TileKind {
  suit: Suit;
  /** 수패: 1~9 / 풍패: 1동 2남 3서 4북 / 삼원패: 1백 2발 3중 */
  rank: number;
}

/** 확장 가능한 속성 주머니. red = 적도라 */
export interface TileAttrs {
  red?: boolean;
  /**
   * 증강이 패산의 실제 패가 아니라 "새로 만들어낸" 패(종류를 바꿔 생성된 패 등).
   * 원래 4장 한도를 넘을 수 있으므로 클라이언트가 다른 이펙트로 구분해 표시한다.
   */
  conjured?: boolean;
  [key: string]: unknown;
}

export interface Tile {
  /** 물리적 정체성. 절대 변하지 않는다 */
  id: TileId;
  /** 현재 종류. 증강이 바꿀 수 있다 */
  kind: TileKind;
  attrs: TileAttrs;
}

const NUMBER_SUITS: readonly Suit[] = [Suits.Man, Suits.Pin, Suits.Sou];
const HONOR_SUITS: readonly Suit[] = [Suits.Wind, Suits.Dragon];

export function isNumberSuit(kind: TileKind): boolean {
  return NUMBER_SUITS.includes(kind.suit);
}

export function isHonor(kind: TileKind): boolean {
  return HONOR_SUITS.includes(kind.suit);
}

export function isTerminal(kind: TileKind): boolean {
  return isNumberSuit(kind) && (kind.rank === 1 || kind.rank === 9);
}

export function isTerminalOrHonor(kind: TileKind): boolean {
  return isTerminal(kind) || isHonor(kind);
}

export function sameKind(a: TileKind, b: TileKind): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

/** "man5", "wind1" — 집계·디버깅용 표준 표기 */
export function kindKey(kind: TileKind): string {
  return `${kind.suit}${kind.rank}`;
}

/** 표준 34종 kind (만·통·삭 1~9, 풍 4, 삼원 3). 대기 계산의 기본 universe */
export function standardKinds(): TileKind[] {
  const kinds: TileKind[] = [];
  for (const suit of NUMBER_SUITS) {
    for (let rank = 1; rank <= 9; rank++) kinds.push({ suit, rank });
  }
  for (let rank = 1; rank <= 4; rank++) kinds.push({ suit: Suits.Wind, rank });
  for (let rank = 1; rank <= 3; rank++) kinds.push({ suit: Suits.Dragon, rank });
  return kinds;
}

export interface StandardSetOptions {
  /** 수패 suit마다 5의 몇 번째 사본까지 적도라로 만들지. 표준 1 → 총 3장 */
  redFivesPerSuit: number;
}

/**
 * 표준 136장 세트 생성. id는 0~135, 생성 순서 고정 (suit → rank → 사본).
 * 섞지 않는다 — 섞는 것은 국 시작 시 PRNG의 일이다.
 */
export function buildStandardTileSet(options: StandardSetOptions): Tile[] {
  const tiles: Tile[] = [];
  const push = (suit: Suit, rank: number, red: boolean): void => {
    tiles.push({
      id: tiles.length,
      kind: { suit, rank },
      attrs: red ? { red: true } : {},
    });
  };
  for (const suit of NUMBER_SUITS) {
    for (let rank = 1; rank <= 9; rank++) {
      for (let copy = 0; copy < 4; copy++) {
        push(suit, rank, rank === 5 && copy < options.redFivesPerSuit);
      }
    }
  }
  for (let rank = 1; rank <= 4; rank++) {
    for (let copy = 0; copy < 4; copy++) push(Suits.Wind, rank, false);
  }
  for (let rank = 1; rank <= 3; rank++) {
    for (let copy = 0; copy < 4; copy++) push(Suits.Dragon, rank, false);
  }
  return tiles;
}
