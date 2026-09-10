/**
 * standardShape — **표준 리치마작 규칙**일 때의 화료형 판정 지름길.
 *
 * `decompose.ts`의 일반 분해기는 증강이 여는 온갖 형태(순환 슌쯔·혼색 몸통·조커·
 * 5멘쯔·왕의 징표…)를 다 다루느라 문자열 키 Map 위에서 돈다. 그런데 실제 대국의
 * 판정 대부분은 옵션이 하나도 켜지지 않은 표준 손이다 — 그 경우는 34칸 정수
 * 배열로 같은 답을 훨씬 싸게 낼 수 있다.
 *
 * **답이 같아야 한다.** 이 파일은 일반 분해기의 `shapeOnly` 결과(분해가 하나라도
 * 존재하는가)를 표준 옵션에 한해 그대로 재현한다:
 *  - 표준형: (4 − 후로 수) 몸통 + 머리. 몸통은 같은 패 3장 또는 수패의 (r, r+1, r+2).
 *  - 치또이: 후로 0 · 14장 · **서로 다른** 7종 × 2장.
 *  - 국사: 후로 0 · 14장 · 요구패 13종 전부 + 그중 하나 2장.
 * 옵션이 하나라도 켜져 있거나 손에 표준 34종 밖의 패가 있으면 `null`을 돌려
 * 일반 경로로 넘긴다 — 여기서 추측하지 않는다.
 *
 * 프로파일(2026-09-11): 반장 1판의 CPU 절반이 `winningKinds`(34종 × 화료형 판정)
 * 였고, 그 안에서 메모 키 문자열 만들기가 분해 자체만큼 비쌌다.
 */

import { Suits } from "../tiles/Tile.js";
import type { TileKind } from "../tiles/Tile.js";

/** 표준 34종의 칸 번호. 만 0~8 · 통 9~17 · 삭 18~26 · 풍 27~30 · 삼원 31~33. 밖이면 -1 */
export function standardIndexOf(kind: TileKind): number {
  const r = kind.rank;
  switch (kind.suit) {
    case Suits.Man:
      return r >= 1 && r <= 9 ? r - 1 : -1;
    case Suits.Pin:
      return r >= 1 && r <= 9 ? r + 8 : -1;
    case Suits.Sou:
      return r >= 1 && r <= 9 ? r + 17 : -1;
    case Suits.Wind:
      return r >= 1 && r <= 4 ? r + 26 : -1;
    case Suits.Dragon:
      return r >= 1 && r <= 3 ? r + 30 : -1;
    default:
      return -1;
  }
}

/** 칸 번호 → kind (새 객체) */
export function standardKindAt(i: number): TileKind {
  if (i < 9) return { suit: Suits.Man, rank: i + 1 };
  if (i < 18) return { suit: Suits.Pin, rank: i - 8 };
  if (i < 27) return { suit: Suits.Sou, rank: i - 17 };
  if (i < 31) return { suit: Suits.Wind, rank: i - 26 };
  return { suit: Suits.Dragon, rank: i - 30 };
}

/** 국사 요구패 13칸 */
const ORPHAN_INDEX: readonly number[] = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
const IS_ORPHAN: readonly boolean[] = (() => {
  const a = new Array<boolean>(34).fill(false);
  for (const i of ORPHAN_INDEX) a[i] = true;
  return a;
})();

/**
 * 손패를 34칸 개수표로. 표준 밖의 패가 하나라도 있으면 `null`.
 * `counts`를 넘기면 그 배열을 비우고 채운다(할당 없이 재사용).
 */
export function standardCounts(
  hand: readonly TileKind[],
  counts?: Int32Array,
): Int32Array | null {
  const c = counts ?? new Int32Array(34);
  if (counts !== undefined) c.fill(0);
  for (const k of hand) {
    const i = standardIndexOf(k);
    if (i < 0) return null;
    c[i] = (c[i] as number) + 1;
  }
  return c;
}

/** 지름길이 다루는 옵션 — 이 밖의 옵션(조커·혼색·양극·국사 외길·울어 국사)은 일반 경로 */
export interface FastShapeOptions {
  /** 8-9-1 같은 순환 슌쯔 (부숴진 벽) */
  wrapRuns: boolean;
  /** 자패 슌쯔 — 동남서·남서북·백발중 (바람의 계보) */
  honorRuns: boolean;
  /** 표준형 몸통 수 (기본 4) */
  totalSets: number;
  /** 국사 요구패가 몇 종까지 빠져도 되는가 (왕의 징표) */
  kokushiDupes: number;
  /** 치또이 짝을 무늬 무관 랭크로 (비대칭 치또이) */
  chiitoiMixedPairs: boolean;
}

export const STANDARD_FAST_OPTIONS: FastShapeOptions = {
  wrapRuns: false,
  honorRuns: false,
  totalSets: 4,
  kokushiDupes: 0,
  chiitoiMixedPairs: false,
};

/**
 * 남은 패 전부를 `setsLeft`개의 몸통으로 정확히 소진할 수 있는가.
 * "첫 번째 남은 칸은 반드시 지금 소비된다" — 일반 분해기와 같은 기법이다.
 */
function canExtractSets(
  c: Int32Array,
  from: number,
  setsLeft: number,
  o: FastShapeOptions,
): boolean {
  let i = from;
  while (i < 34 && c[i] === 0) i++;
  if (i >= 34) return setsLeft === 0;
  if (setsLeft <= 0) return false;
  const n = c[i] as number;
  // 커쯔
  if (n >= 3) {
    c[i] = n - 3;
    const ok = canExtractSets(c, i, setsLeft - 1, o);
    c[i] = n;
    if (ok) return true;
  }
  if (i < 27) {
    // 수패 슌쯔. 표준: 첫 칸이 최소 랭크이므로 (r, r+1, r+2)만. 순환이면 첫 칸이
    // 순환 슌쯔의 중간·끝일 수 있어(8-9-1의 1) 세 위치를 다 본다 — 일반 분해기와 같다.
    const base = i - (i % 9);
    const r = i % 9; // 0~8
    for (let pos = 0; pos <= (o.wrapRuns ? 2 : 0); pos++) {
      const r0 = r - pos;
      if (!o.wrapRuns && (r0 < 0 || r0 + 2 > 8)) continue;
      const a = base + (((r0 % 9) + 9) % 9);
      const b = base + (((r0 + 1) % 9 + 9) % 9);
      const d = base + (((r0 + 2) % 9 + 9) % 9);
      if (a === i || b === i || d === i) {
        const na = c[a] as number;
        const nb = c[b] as number;
        const nd = c[d] as number;
        if (na > 0 && nb > 0 && nd > 0) {
          c[a] = na - 1;
          c[b] = nb - 1;
          c[d] = nd - 1;
          const ok = canExtractSets(c, i, setsLeft - 1, o);
          c[a] = na;
          c[b] = nb;
          c[d] = nd;
          if (ok) return true;
        }
      }
    }
  } else if (o.honorRuns) {
    // 자패 슌쯔 — 바람 1-2-3·2-3-4, 삼원 1-2-3. 순환 없음.
    const max = i < 31 ? 30 : 33;
    if (i + 2 <= max) {
      const n1 = c[i + 1] as number;
      const n2 = c[i + 2] as number;
      if (n1 > 0 && n2 > 0) {
        c[i] = n - 1;
        c[i + 1] = n1 - 1;
        c[i + 2] = n2 - 1;
        const ok = canExtractSets(c, i, setsLeft - 1, o);
        c[i] = n;
        c[i + 1] = n1;
        c[i + 2] = n2;
        if (ok) return true;
      }
    }
  }
  return false;
}

/**
 * 이 개수표(총 `total`장, 후로 `meldCount`)가 화료형인가.
 * `c`는 호출이 끝나면 원래대로 돌아온다.
 */
export function isStandardWinningShape(
  c: Int32Array,
  total: number,
  meldCount: number,
  o: FastShapeOptions = STANDARD_FAST_OPTIONS,
): boolean {
  const setsNeeded = o.totalSets - meldCount;
  // ── 표준형 ──
  if (total === setsNeeded * 3 + 2) {
    for (let p = 0; p < 34; p++) {
      const n = c[p] as number;
      if (n < 2) continue;
      c[p] = n - 2;
      const ok = canExtractSets(c, 0, setsNeeded, o);
      c[p] = n;
      if (ok) return true;
    }
  }
  if (meldCount !== 0 || total !== 14 || o.totalSets !== 4) return false;
  // ── 치또이 ──
  if (o.chiitoiMixedPairs) {
    // 비대칭: 같은 패 4장 금지, 수패는 랭크별(무늬 무관) 짝수, 자패는 종류별 짝수.
    // 14장이 전부 짝수로 나뉘면 쌍은 자동으로 7개다.
    let ok = true;
    for (let r = 0; r < 9 && ok; r++) {
      let sum = 0;
      for (let s = 0; s < 27; s += 9) {
        const n = c[s + r] as number;
        if (n > 3) ok = false;
        sum += n;
      }
      if (sum % 2 !== 0) ok = false;
    }
    for (let i = 27; i < 34 && ok; i++) {
      const n = c[i] as number;
      if (n > 3 || n % 2 !== 0) ok = false;
    }
    if (ok) return true;
  } else {
    // 서로 다른 7종 × 2장
    let pairs = 0;
    let over = false;
    for (let i = 0; i < 34; i++) {
      const n = c[i] as number;
      if (n === 2) pairs++;
      else if (n > 2) {
        over = true;
        break;
      }
    }
    if (!over && pairs === 7) return true;
  }
  // ── 국사: 요구패 13종(왕의 징표면 13−d종) + 어딘가 2장 ──
  let distinct = 0;
  let doubled = false;
  for (let i = 0; i < 34; i++) {
    const n = c[i] as number;
    if (n === 0) continue;
    if (!IS_ORPHAN[i]) return false;
    distinct++;
    if (n >= 2) doubled = true;
  }
  return 13 - distinct <= o.kokushiDupes && doubled;
}
