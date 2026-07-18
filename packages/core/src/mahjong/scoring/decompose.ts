/**
 * decompose — 손패를 화료 형태로 분해한다.
 * 4멘쯔 1작두(standard) / 치토이 / 국사 세 형태를 전부 열거한다.
 *
 * "첫 번째 남은 패는 반드시 지금 소비된다" 기법으로 중복 없이 모든 분해를 얻는다.
 * 순자 허용 suit는 파라미터 — 증강이 새 suit를 추가해도 동작한다.
 *
 * 설계: docs/08_MAHJONG_ENGINE.md §2
 */

import { Suits, kindKey } from "../tiles/Tile.js";
import type { Suit, TileKind } from "../tiles/Tile.js";

export interface DecompSet {
  type: "run" | "triplet";
  /** run: [r, r+1, r+2] 같은 suit / triplet: 동일 kind 3개 */
  tiles: TileKind[];
}

export interface Decomposition {
  form: "standard" | "chiitoitsu" | "kokushi";
  /** standard: 작두 / kokushi: 중복된 요구패 / chiitoitsu: null */
  pair: TileKind | null;
  /** chiitoitsu의 7종 */
  pairs?: TileKind[];
  /** standard의 손패 쪽 멘쯔 (부로 멘쯔 제외) */
  sets: DecompSet[];
}

export const DEFAULT_SEQUENCE_SUITS: ReadonlySet<Suit> = new Set([
  Suits.Man,
  Suits.Pin,
  Suits.Sou,
]);

/**
 * 분해 동작을 바꾸는 옵션. 증강이 RuleRegistry 값에서 만들어 넘긴다
 * (helpers.scoringOptionsOf). 생략 시 표준 리치마작.
 */
export interface DecomposeOptions {
  sequenceSuits?: ReadonlySet<Suit>;
  /** 8-9-1, 9-1-2 같은 순환 순자 허용 (부숴진 벽) */
  wrapRuns?: boolean;
  /** 표준형에 필요한 총 멘쯔 수 (기본 4, 진짜 용 = 5) */
  totalSets?: number;
  /** 부로 멘쯔를 국사 요구패 1장으로 인정 (부로한 멘쯔의 대표 kind 목록) */
  kokushiMeldKinds?: TileKind[];
}

/** 하위 호환: Set이 오면 sequenceSuits로 해석한다 */
function normalizeOptions(
  opts?: DecomposeOptions | ReadonlySet<Suit>,
): Required<Pick<DecomposeOptions, "sequenceSuits" | "wrapRuns" | "totalSets">> &
  Pick<DecomposeOptions, "kokushiMeldKinds"> {
  if (opts instanceof Set) {
    return { sequenceSuits: opts, wrapRuns: false, totalSets: 4 };
  }
  const o = (opts ?? {}) as DecomposeOptions;
  return {
    sequenceSuits: o.sequenceSuits ?? DEFAULT_SEQUENCE_SUITS,
    wrapRuns: o.wrapRuns ?? false,
    totalSets: o.totalSets ?? 4,
    ...(o.kokushiMeldKinds !== undefined
      ? { kokushiMeldKinds: o.kokushiMeldKinds }
      : {}),
  };
}

/** 국사무쌍의 13종 요구패 */
export const ORPHAN_KINDS: readonly TileKind[] = [
  { suit: Suits.Man, rank: 1 },
  { suit: Suits.Man, rank: 9 },
  { suit: Suits.Pin, rank: 1 },
  { suit: Suits.Pin, rank: 9 },
  { suit: Suits.Sou, rank: 1 },
  { suit: Suits.Sou, rank: 9 },
  { suit: Suits.Wind, rank: 1 },
  { suit: Suits.Wind, rank: 2 },
  { suit: Suits.Wind, rank: 3 },
  { suit: Suits.Wind, rank: 4 },
  { suit: Suits.Dragon, rank: 1 },
  { suit: Suits.Dragon, rank: 2 },
  { suit: Suits.Dragon, rank: 3 },
];

interface Counts {
  /** kindKey → 남은 수 */
  n: Map<string, number>;
  /** kindKey → kind (복원용) */
  kindOf: Map<string, TileKind>;
  /** 결정적 순회 순서 (suit, rank 정렬) */
  order: string[];
}

function buildCounts(kinds: readonly TileKind[]): Counts {
  const n = new Map<string, number>();
  const kindOf = new Map<string, TileKind>();
  for (const k of kinds) {
    const key = kindKey(k);
    n.set(key, (n.get(key) ?? 0) + 1);
    if (!kindOf.has(key)) kindOf.set(key, k);
  }
  const order = [...n.keys()].sort((a, b) => {
    const ka = kindOf.get(a) as TileKind;
    const kb = kindOf.get(b) as TileKind;
    return ka.suit === kb.suit ? ka.rank - kb.rank : ka.suit < kb.suit ? -1 : 1;
  });
  return { n, kindOf, order };
}

/** 1~9 순환 rank (부숴진 벽) */
function wrapRank(r: number): number {
  return ((((r - 1) % 9) + 9) % 9) + 1;
}

/** counts에서 멘쯔만으로 전부 소진하는 모든 방법 (첫 남은 패 강제 소비로 중복 방지) */
function extractSets(
  counts: Counts,
  seqSuits: ReadonlySet<Suit>,
  wrap: boolean,
): DecompSet[][] {
  const firstKey = counts.order.find((key) => (counts.n.get(key) ?? 0) > 0);
  if (firstKey === undefined) return [[]]; // 전부 소진 = 해 1개 (빈 목록)

  const kind = counts.kindOf.get(firstKey) as TileKind;
  const count = counts.n.get(firstKey) ?? 0;
  const solutions: DecompSet[][] = [];

  if (count >= 3) {
    counts.n.set(firstKey, count - 3);
    for (const rest of extractSets(counts, seqSuits, wrap)) {
      solutions.push([{ type: "triplet", tiles: [kind, kind, kind] }, ...rest]);
    }
    counts.n.set(firstKey, count);
  }

  if (seqSuits.has(kind.suit)) {
    // 표준: firstKey가 최소 rank이므로 (r, r+1, r+2)만 시도하면 된다.
    // wrap이면 firstKey가 순환 순자의 중간·끝일 수 있어 세 위치 전부 시도한다.
    const starts = wrap ? [kind.rank, kind.rank - 1, kind.rank - 2] : [kind.rank];
    for (const start of starts) {
      const ranks = wrap
        ? [wrapRank(start), wrapRank(start + 1), wrapRank(start + 2)]
        : [start, start + 1, start + 2];
      const keys = ranks.map((r) => kindKey({ suit: kind.suit, rank: r }));
      const cs = keys.map((k) => counts.n.get(k) ?? 0);
      if (cs.some((c) => c <= 0)) continue;
      keys.forEach((k, i) => counts.n.set(k, (cs[i] as number) - 1));
      const tiles = keys.map(
        (k, i) =>
          counts.kindOf.get(k) ?? { suit: kind.suit, rank: ranks[i] as number },
      );
      for (const rest of extractSets(counts, seqSuits, wrap)) {
        solutions.push([{ type: "run", tiles }, ...rest]);
      }
      keys.forEach((k, i) => counts.n.set(k, cs[i] as number));
    }
  }

  return solutions;
}

/**
 * @param hand 손패의 kind 목록 (화료패 포함, 부로 제외)
 * @param meldCount 부로(깡 포함) 수 — 손패 쪽에 필요한 멘쯔 수가 그만큼 줄어든다
 * @param opts 분해 옵션 (하위 호환: ReadonlySet<Suit>는 sequenceSuits로 해석)
 */
export function decompose(
  hand: readonly TileKind[],
  meldCount: number,
  opts?: DecomposeOptions | ReadonlySet<Suit>,
): Decomposition[] {
  const { sequenceSuits, wrapRuns, totalSets, kokushiMeldKinds } =
    normalizeOptions(opts);
  const results: Decomposition[] = [];
  const setsNeeded = totalSets - meldCount;

  // ── standard: 작두 후보마다 나머지를 멘쯔로 소진 ──
  if (hand.length === setsNeeded * 3 + 2) {
    const counts = buildCounts(hand);
    for (const pairKey of counts.order) {
      const c = counts.n.get(pairKey) ?? 0;
      if (c < 2) continue;
      counts.n.set(pairKey, c - 2);
      const pairKind = counts.kindOf.get(pairKey) as TileKind;
      for (const sets of extractSets(counts, sequenceSuits, wrapRuns)) {
        results.push({ form: "standard", pair: pairKind, sets });
      }
      counts.n.set(pairKey, c);
    }
  }

  // ── 치토이: 부로 없음, 서로 다른 7종 × 2장 (표준 4멘쯔 게임에서만) ──
  if (meldCount === 0 && hand.length === 14 && totalSets === 4) {
    const counts = buildCounts(hand);
    const keys = counts.order;
    if (keys.length === 7 && keys.every((key) => counts.n.get(key) === 2)) {
      results.push({
        form: "chiitoitsu",
        pair: null,
        pairs: keys.map((key) => counts.kindOf.get(key) as TileKind),
        sets: [],
      });
    }

    // ── 국사: 13종 요구패 전부 + 그중 하나 2장 ──
    const orphanKeys = new Set(ORPHAN_KINDS.map(kindKey));
    const allOrphans = hand.every((k) => orphanKeys.has(kindKey(k)));
    if (allOrphans) {
      const covered = orphanKeys.size === counts.order.length &&
        counts.order.every((key) => orphanKeys.has(key));
      const doubled = counts.order.find((key) => counts.n.get(key) === 2);
      if (covered && doubled !== undefined) {
        results.push({
          form: "kokushi",
          pair: counts.kindOf.get(doubled) as TileKind,
          sets: [],
        });
      }
    }
  }

  // ── 울어 국사 (특수 부로 지원): 서로 다른 요구패 3장 부로 M개가 3M종을 덮는다 ──
  // 부로가 3M종(전부 서로 다른 요구패)을 덮고, 손 (14−3M)장이 나머지 (13−3M)종을
  // 1장씩 + 머리(1종 2장)로 덮으면 국사 성립. 머리는 반드시 손패(울지 않은 패)다.
  if (kokushiMeldKinds !== undefined && kokushiMeldKinds.length > 0 && meldCount > 0) {
    const K = kokushiMeldKinds.length;
    const orphanKeys = new Set(ORPHAN_KINDS.map(kindKey));
    const meldKeys = kokushiMeldKinds.map(kindKey);
    const meldSet = new Set(meldKeys);
    if (
      K === meldCount * 3 && // 부로마다 정확히 3종
      meldSet.size === K && // 부로 kind가 전부 서로 다르다
      meldKeys.every((key) => orphanKeys.has(key)) && // 전부 요구패
      hand.length === 14 - K // 손패 장수
    ) {
      const handKeys = hand.map(kindKey);
      const handDistinct = new Set(handKeys);
      const counts = new Map<string, number>();
      for (const key of handKeys) counts.set(key, (counts.get(key) ?? 0) + 1);
      const covered =
        handKeys.every((key) => orphanKeys.has(key)) && // 손패 전부 요구패
        [...handDistinct].every((key) => !meldSet.has(key)) && // 부로와 겹치지 않음(머리도 손패)
        handDistinct.size + meldSet.size === 13 && // 부로+손 = 13종 전부
        handKeys.length === handDistinct.size + 1; // 정확히 1종만 2장(머리)
      if (covered) {
        const pairKey = [...counts.entries()].find(([, n]) => n === 2)?.[0];
        const pairKind = hand.find((k) => kindKey(k) === pairKey);
        if (pairKind !== undefined) {
          results.push({ form: "kokushi", pair: pairKind, sets: [] });
        }
      }
    }
  }

  return results;
}

/** 화료 형태인가 (분해가 하나라도 존재) */
export function isWinningShape(
  hand: readonly TileKind[],
  meldCount: number,
  opts?: DecomposeOptions | ReadonlySet<Suit>,
): boolean {
  return decompose(hand, meldCount, opts).length > 0;
}
