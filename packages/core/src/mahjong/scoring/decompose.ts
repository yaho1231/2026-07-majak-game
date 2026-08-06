/**
 * decompose — 손패를 화료 형태로 분해한다.
 * 4멘쯔 1작두(standard) / 치토이 / 국사 세 형태를 전부 열거한다.
 *
 * "첫 번째 남은 패는 반드시 지금 소비된다" 기법으로 중복 없이 모든 분해를 얻는다.
 * 슌쯔 허용 suit는 파라미터 — 증강이 새 suit를 추가해도 동작한다.
 *
 * 설계: docs/08_MAHJONG_ENGINE.md §2
 */

import { Suits, kindKey, standardKinds } from "../tiles/Tile.js";
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
  /** standard의 손패 쪽 멘쯔 (후로 멘쯔 제외) */
  sets: DecompSet[];
  /**
   * 조커(`wildKinds`)를 **실제 패로 바꿔 놓은** 손패. 조커가 없으면 undefined.
   * 채점은 이 손을 봐야 한다 — 치토이·국사는 sets/pair가 아니라 손패 전체로
   * 역을 판정하기 때문이다(`WinContext.allKinds`).
   */
  effectiveHand?: TileKind[];
  /** 이 분해에서 조커가 각각 무엇이 됐는가 (손패에 있던 조커 수만큼) */
  wildAs?: TileKind[];
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
  /** 8-9-1, 9-1-2 같은 순환 슌쯔 허용 (부숴진 벽) */
  wrapRuns?: boolean;
  /** 표준형에 필요한 총 멘쯔 수 (기본 4, 진짜 용 = 5) */
  totalSets?: number;
  /** 후로 멘쯔를 국사 요구패 1장으로 인정 (후로한 멘쯔의 대표 kind 목록) */
  kokushiMeldKinds?: TileKind[];
  /**
   * 무늬가 다른 수패로도 슌쯔를 만든다 (무너진 국경) — 2만·3통·4삭도 슌쯔다.
   * wrapRuns와 동형 확장: 랭크 연속만 보고 무늬 일치는 요구하지 않는다.
   */
  mixedRuns?: boolean;
  /**
   * 무늬가 다른 수패로도 커쯔를 만든다 (**동수의 결속**) — 2만·2통·2삭도 커쯔다.
   * (2026-07-27 이전엔 무너진 국경도 이 옵션을 함께 켜서 동수의 결속을 죽은 픽으로
   *  만들었다. 지금은 무너진 국경 = mixedRuns(슌쯔), 동수의 결속 = mixedTriplets(커쯔)로
   *  역할이 갈려 있고, 둘을 함께 가져야 "랭크만 맞으면 뭐든 몸통"이 된다.)
   * 랭크만 일치하면 되고 무늬 일치는 요구하지 않는다(2만·2만·2통처럼 섞여도 된다).
   * 자패는 무늬 개념이 없으므로 이 옵션과 무관하게 기존처럼 동일 패 3장만 커쯔다.
   */
  mixedTriplets?: boolean;
  /**
   * 무늬가 다른 수패로도 작두(머리)를 만든다 — 2만+2통도 머리다.
   * mixedRuns·mixedTriplets와 짝을 이루는 세 번째 축으로, 셋을 모두 켜면 화료형이
   * **랭크만으로** 성립한다(뒤섞인 아홉 개의 연꽃). 자패는 무늬 개념이 없으므로
   * 이 옵션과 무관하게 동일 패 2장만 머리다.
   */
  mixedPairs?: boolean;
  /**
   * 국사 형태로만 화료 가능 (우는 국사무쌍: 특수 퐁을 한 순간 다른 길이 닫힌다).
   * 표준형·치토이 분해를 아예 열거하지 않는다 — 화료·텐파이·대기·후리텐이
   * 전부 이 분해를 통해 계산되므로, 여기서 막으면 모든 판정 지점에 일관 적용된다.
   */
  kokushiOnly?: boolean;
  /**
   * 국사무쌍에서 요구패 종류가 몇 개까지 빠져도 되는가 (왕의 징표) — 기본 0(표준: 13종 전부).
   * d로 두면 서로 다른 요구패가 13−d종만 있어도, 빠진 자리를 중복(같은 요구패 2장 이상)으로
   * 메워 국사가 성립한다. 예: d=1이면 12종 + 어딘가 2장 중복으로도 화료.
   * 손패는 여전히 14장 전부 요구패여야 하고, 머리는 count≥2인 종류 하나다.
   */
  kokushiDupes?: number;
  /**
   * 1과 9만으로 몸통(커쯔)을 이룰 수 있다 (양극) — 199·191·911도 하나의 커쯔다.
   * 같은 무늬의 1·9를 동일 패로 보고, 그 셋으로 커쯔 몸통을 만든다. 순수 커쯔(111·999)는
   * 기존처럼 처리되고, 여기서 새로 생기는 것은 1과 9가 섞인 몸통뿐이다. 머리는 표준대로
   * 같은 패 2장이어야 한다(1·9 혼합 머리는 인정하지 않는다).
   */
  polarEnds?: boolean;
  /**
   * 치또이쯔에서 무늬가 달라도 숫자가 같으면 한 쌍으로 인정한다 (비대칭 치또이) —
   * 1만+1통도 머리다. 자패는 기존처럼 같은 종류 2장. 같은 패는 최대 2장까지만(4장 금지).
   * 수패는 랭크별 짝수, 자패는 종류별 짝수여야 7쌍이 성립한다. 표준 치또이의 상위집합.
   */
  chiitoiMixedPairs?: boolean;
  /**
   * 자패에 순서를 부여해 슌쯔를 인정한다 (바람의 계보) — 동→남→서→북(rank 1-2-3-4),
   * 백→발→중(rank 1-2-3)이 연속으로 이어진다. 같은 자패 suit 안에서 (r, r+1, r+2)
   * 연속 3장이면 슌쯔다(순환 없음, 무늬 혼합 없음). 바람 슌쯔=동남서·남서북, 삼원 슌쯔=백발중.
   * 자패 커쯔·머리는 기존처럼 동일 패라 이 옵션과 무관하다.
   */
  honorRuns?: boolean;
  /**
   * **조커** — 여기 실린 종류의 패는 손패에서 "무엇이든 될 수 있는 패"로 본다 (조커).
   * 손에 그 종류가 있으면 그 자리를 다른 kind로 바꿔 놓은 손을 전부 만들어 분해한다.
   * 그래서 머리가 되든 몸통이 되든 상관없고, 대기·화료·후리텐이 전부 같은 규칙을 탄다.
   *
   * 어느 패가 되는지는 **고르지 않는다** — 분해가 전부 나오므로 `evaluateWin`이
   * 그중 가장 비싼 것을 채택한다(변형 비교는 역만 수 > 판 > 부).
   * ⚠ 도라는 **물리적인 패**로 센다(`evaluate.fullKinds`가 `ctx.hand`를 본다) —
   *    조커가 무엇으로 변하든 도라 판정은 원래 패 그대로다.
   */
  wildKinds?: readonly TileKind[];
}

/** 기본값이 전부 채워진 분해 옵션 (내부 전용) */
interface NormalizedOptions {
  sequenceSuits: ReadonlySet<Suit>;
  wrapRuns: boolean;
  totalSets: number;
  kokushiOnly: boolean;
  mixedRuns: boolean;
  mixedTriplets: boolean;
  mixedPairs: boolean;
  kokushiDupes: number;
  polarEnds: boolean;
  chiitoiMixedPairs: boolean;
  honorRuns: boolean;
  wildKinds: readonly TileKind[];
  kokushiMeldKinds?: TileKind[];
}

/** 하위 호환: Set이 오면 sequenceSuits로 해석한다 */
function normalizeOptions(
  opts?: DecomposeOptions | ReadonlySet<Suit>,
): NormalizedOptions {
  if (opts instanceof Set) {
    return {
      sequenceSuits: opts,
      wrapRuns: false,
      totalSets: 4,
      kokushiOnly: false,
      mixedRuns: false,
      mixedTriplets: false,
      mixedPairs: false,
      kokushiDupes: 0,
      polarEnds: false,
      chiitoiMixedPairs: false,
      honorRuns: false,
      wildKinds: [],
    };
  }
  const o = (opts ?? {}) as DecomposeOptions;
  return {
    sequenceSuits: o.sequenceSuits ?? DEFAULT_SEQUENCE_SUITS,
    wrapRuns: o.wrapRuns ?? false,
    totalSets: o.totalSets ?? 4,
    kokushiOnly: o.kokushiOnly ?? false,
    mixedRuns: o.mixedRuns ?? false,
    mixedTriplets: o.mixedTriplets ?? false,
    mixedPairs: o.mixedPairs ?? false,
    kokushiDupes: o.kokushiDupes ?? 0,
    polarEnds: o.polarEnds ?? false,
    chiitoiMixedPairs: o.chiitoiMixedPairs ?? false,
    honorRuns: o.honorRuns ?? false,
    wildKinds: o.wildKinds ?? [],
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

const NUMBER_SUITS: ReadonlySet<Suit> = new Set([Suits.Man, Suits.Pin, Suits.Sou]);

/**
 * 비대칭 치또이(무늬 무관 rank 머리) 성립 판정 + 대표 쌍 목록.
 * - 같은 패(kind)는 최대 2장(4장·3장 금지) — 표준 치또이의 동일 패 4장 금지 확장.
 * - 수패는 랭크별 짝수(무늬 무관 짝지음), 자패는 종류별 짝수(자패는 교차 짝 없음).
 * 위를 만족하면 14장이 전부 7쌍으로 갈라진다. 표준 치또이(7종×2)의 상위집합이다.
 * 반환: 성립 시 대표 쌍 kind 7개(표시·구조용, 실제 역 판정은 handKinds로 한다), 아니면 null.
 */
function asyncChiitoiPairs(hand: readonly TileKind[]): TileKind[] | null {
  // 같은 kind 최대 2장
  const byKind = new Map<string, TileKind[]>();
  for (const k of hand) {
    const key = kindKey(k);
    const arr = byKind.get(key) ?? [];
    arr.push(k);
    byKind.set(key, arr);
  }
  for (const arr of byKind.values()) if (arr.length > 2) return null;

  // 수패: 랭크별(무늬 무관) 짝수 / 자패: 종류별 짝수
  const numberByRank = new Map<number, TileKind[]>();
  const honorByKind = new Map<string, TileKind[]>();
  for (const k of hand) {
    if (NUMBER_SUITS.has(k.suit)) {
      const arr = numberByRank.get(k.rank) ?? [];
      arr.push(k);
      numberByRank.set(k.rank, arr);
    } else {
      const key = kindKey(k);
      const arr = honorByKind.get(key) ?? [];
      arr.push(k);
      honorByKind.set(key, arr);
    }
  }
  const pairs: TileKind[] = [];
  for (const arr of numberByRank.values()) {
    if (arr.length % 2 !== 0) return null;
    for (let i = 0; i < arr.length; i += 2) pairs.push(arr[i] as TileKind);
  }
  for (const arr of honorByKind.values()) {
    if (arr.length % 2 !== 0) return null;
    for (let i = 0; i < arr.length; i += 2) pairs.push(arr[i] as TileKind);
  }
  return pairs.length === 7 ? pairs : null;
}

/** 자패 슌쯔(바람의 계보)에서 각 자패 suit의 최대 rank — 바람 4(동남서북), 삼원 3(백발중) */
export function honorMaxRank(suit: Suit): number {
  return suit === Suits.Wind ? 4 : suit === Suits.Dragon ? 3 : 0;
}

/**
 * 이 세 패가 자패 슌쯔(동남서·남서북·백발중)인가 — 바람의 계보(honorRuns) 전용.
 * 분해(extractSets)와 **치 판정**이 같은 정의를 봐야 "손에서는 되는데 울 수는 없는"
 * 어긋남이 생기지 않는다.
 */
export function isHonorRun(kinds: readonly TileKind[]): boolean {
  if (kinds.length !== 3) return false;
  const suit = kinds[0]?.suit;
  if (suit === undefined) return false;
  const max = honorMaxRank(suit);
  if (max === 0) return false;
  if (!kinds.every((k) => k.suit === suit)) return false;
  const ranks = [...kinds.map((k) => k.rank)].sort((a, b) => a - b);
  if ((ranks[2] as number) > max) return false;
  return ranks.every((r, i) => i === 0 || r === (ranks[i - 1] as number) + 1);
}

/** counts에서 멘쯔만으로 전부 소진하는 모든 방법 (첫 남은 패 강제 소비로 중복 방지) */

function extractSets(
  counts: Counts,
  seqSuits: ReadonlySet<Suit>,
  wrap: boolean,
  mixed = false,
  mixedTri = false,
  polar = false,
  honor = false,
): DecompSet[][] {
  const firstKey = counts.order.find((key) => (counts.n.get(key) ?? 0) > 0);
  if (firstKey === undefined) return [[]]; // 전부 소진 = 해 1개 (빈 목록)

  const kind = counts.kindOf.get(firstKey) as TileKind;
  const count = counts.n.get(firstKey) ?? 0;
  const solutions: DecompSet[][] = [];

  if (count >= 3) {
    counts.n.set(firstKey, count - 3);
    for (const rest of extractSets(counts, seqSuits, wrap, mixed, mixedTri, polar, honor)) {
      solutions.push([{ type: "triplet", tiles: [kind, kind, kind] }, ...rest]);
    }
    counts.n.set(firstKey, count);
  }

  // 혼색 커쯔 (동수의 결속) — 랭크만 같으면 무늬가 섞여도 커쯔다.
  // 자패는 무늬 개념이 없으므로 수패(seqSuits)에만 적용한다.
  // 위의 순수 커쯔와 중복되지 않게 "무늬가 최소 2종"인 조합만 만든다.
  if (mixedTri && seqSuits.has(kind.suit)) {
    const suits = [...seqSuits];
    const triCandidates: TileKind[][] = [];
    const triSeen = new Set<string>();
    for (let i = 0; i < suits.length; i++) {
      for (let j = i; j < suits.length; j++) {
        for (let k = j; k < suits.length; k++) {
          const tiles = [
            { suit: suits[i] as Suit, rank: kind.rank },
            { suit: suits[j] as Suit, rank: kind.rank },
            { suit: suits[k] as Suit, rank: kind.rank },
          ];
          // 순수 커쯔는 위에서 이미 처리했다
          if (new Set(tiles.map((t) => t.suit)).size < 2) continue;
          // firstKey를 소비하지 않는 후보는 다른 재귀 단계가 이미 다룬다
          if (!tiles.some((t) => kindKey(t) === firstKey)) continue;
          const key = tiles.map(kindKey).sort().join("|");
          if (triSeen.has(key)) continue;
          triSeen.add(key);
          triCandidates.push(tiles);
        }
      }
    }
    for (const tiles of triCandidates) {
      const keys = tiles.map(kindKey);
      // 같은 kind가 두 번 들어갈 수 있으므로 필요 수량을 모아서 확인한다
      const need = new Map<string, number>();
      for (const k of keys) need.set(k, (need.get(k) ?? 0) + 1);
      let ok = true;
      for (const [k, want] of need) {
        if ((counts.n.get(k) ?? 0) < want) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      for (const [k, want] of need) counts.n.set(k, (counts.n.get(k) ?? 0) - want);
      for (const rest of extractSets(counts, seqSuits, wrap, mixed, mixedTri, polar, honor)) {
        solutions.push([{ type: "triplet", tiles }, ...rest]);
      }
      for (const [k, want] of need) counts.n.set(k, (counts.n.get(k) ?? 0) + want);
    }
  }

  // 양극(polar) — 같은 무늬의 1·9만으로 이루는 커쯔 몸통(199·191·911).
  // 순수 커쯔(111·999)는 위에서 이미 처리했으므로, 여기서는 1과 9가 **둘 다 든** 혼합
  // 몸통만 만든다. firstKey(현재 rank 1 또는 9)를 반드시 소비하는 후보만 남긴다.
  if (polar && seqSuits.has(kind.suit) && (kind.rank === 1 || kind.rank === 9)) {
    const one: TileKind = { suit: kind.suit, rank: 1 };
    const nine: TileKind = { suit: kind.suit, rank: 9 };
    const oneKey = kindKey(one);
    const nineKey = kindKey(nine);
    // 1·9가 섞인 3장 조합: 1이 a개(1..2), 9가 3-a개. a=1 → 199, a=2 → 119.
    for (let ones = 1; ones <= 2; ones++) {
      const nines = 3 - ones;
      const tiles = [
        ...Array.from({ length: ones }, () => one),
        ...Array.from({ length: nines }, () => nine),
      ];
      // firstKey를 소비하지 않는 후보는 다른 재귀 단계가 이미 다룬다
      if (!tiles.some((tk) => kindKey(tk) === firstKey)) continue;
      if ((counts.n.get(oneKey) ?? 0) < ones) continue;
      if ((counts.n.get(nineKey) ?? 0) < nines) continue;
      counts.n.set(oneKey, (counts.n.get(oneKey) ?? 0) - ones);
      counts.n.set(nineKey, (counts.n.get(nineKey) ?? 0) - nines);
      for (const rest of extractSets(counts, seqSuits, wrap, mixed, mixedTri, polar, honor)) {
        solutions.push([{ type: "triplet", tiles }, ...rest]);
      }
      counts.n.set(oneKey, (counts.n.get(oneKey) ?? 0) + ones);
      counts.n.set(nineKey, (counts.n.get(nineKey) ?? 0) + nines);
    }
  }

  if (seqSuits.has(kind.suit)) {
    // 시도할 슌쯔 후보(kind 3개)를 만든다.
    //  - 표준: firstKey가 최소 rank이므로 (r, r+1, r+2)만 보면 된다.
    //  - wrap: firstKey가 순환 슌쯔의 중간·끝일 수 있어 세 위치 전부 시도한다.
    //  - mixed(무너진 국경): 무늬 정렬이 랭크 순서와 무관해져 firstKey가 어느 위치든
    //    될 수 있고, 나머지 두 자리의 무늬도 전부 시도해야 한다. firstKey를 반드시
    //    소비하는 후보만 남겨 중복 열거를 막는다.
    const candidates: TileKind[][] = [];
    const seen = new Set<string>();
    const push = (tiles: TileKind[]): void => {
      const key = tiles.map(kindKey).join("|");
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push(tiles);
    };
    const positions = wrap || mixed ? [0, 1, 2] : [0];
    for (const pos of positions) {
      const base = kind.rank - pos;
      if (!wrap && (base < 1 || base + 2 > 9)) continue;
      const ranks = wrap
        ? [wrapRank(base), wrapRank(base + 1), wrapRank(base + 2)]
        : [base, base + 1, base + 2];
      if (!mixed) {
        push(ranks.map((r) => ({ suit: kind.suit, rank: r })));
        continue;
      }
      for (const s0 of seqSuits) {
        for (const s1 of seqSuits) {
          for (const s2 of seqSuits) {
            const tiles = [
              { suit: s0, rank: ranks[0] as number },
              { suit: s1, rank: ranks[1] as number },
              { suit: s2, rank: ranks[2] as number },
            ];
            // firstKey를 소비하지 않는 후보는 다른 재귀 단계가 이미 다룬다
            if (kindKey(tiles[pos] as TileKind) !== firstKey) continue;
            push(tiles);
          }
        }
      }
    }

    for (const tiles of candidates) {
      const keys = tiles.map(kindKey);
      const cs = keys.map((k) => counts.n.get(k) ?? 0);
      // 같은 kind가 한 슌쯔에 두 번 들어갈 수 있다 (mixed에서는 불가하지만 방어적으로)
      if (cs.some((c) => c <= 0)) continue;
      keys.forEach((k, i) => counts.n.set(k, (cs[i] as number) - 1));
      for (const rest of extractSets(counts, seqSuits, wrap, mixed, mixedTri, polar, honor)) {
        solutions.push([{ type: "run", tiles }, ...rest]);
      }
      keys.forEach((k, i) => counts.n.set(k, cs[i] as number));
    }
  }

  // 자패 슌쯔 (바람의 계보) — 같은 자패 suit 안에서 (r, r+1, r+2) 연속 3장.
  // firstKey가 최소 rank이므로 pos 0(오름차순 시작)만 보면 된다. 순환·무늬혼합 없음.
  // 바람: 1-2-3(동남서)·2-3-4(남서북) / 삼원: 1-2-3(백발중).
  if (honor && (kind.suit === Suits.Wind || kind.suit === Suits.Dragon)) {
    const base = kind.rank;
    if (base + 2 <= honorMaxRank(kind.suit)) {
      const tiles = [
        { suit: kind.suit, rank: base },
        { suit: kind.suit, rank: base + 1 },
        { suit: kind.suit, rank: base + 2 },
      ];
      const keys = tiles.map(kindKey);
      const cs = keys.map((k) => counts.n.get(k) ?? 0);
      if (cs.every((c) => c > 0)) {
        keys.forEach((k, i) => counts.n.set(k, (cs[i] as number) - 1));
        for (const rest of extractSets(counts, seqSuits, wrap, mixed, mixedTri, polar, honor)) {
          solutions.push([{ type: "run", tiles }, ...rest]);
        }
        keys.forEach((k, i) => counts.n.set(k, cs[i] as number));
      }
    }
  }

  return solutions;
}

// ───────────────────────── 조커 (wildKinds) ─────────────────────────

/**
 * 조커가 시도할 kind 목록. 표준 34종 + 손에 실제로 있는 커스텀 무늬 전부를 쓴다 —
 * "무엇이든 될 수 있다"가 이 증강의 정의라 후보를 줄여 두면 조용히 안 되는 손이 생긴다.
 *
 * 다만 **순서**는 줄인다: 손패와 이웃한(±2) 후보를 앞세워, 존재만 보면 되는
 * `isWinningShape`가 대개 첫 몇 개에서 끝나게 한다.
 */
function wildUniverse(
  base: readonly TileKind[],
  seqSuits: ReadonlySet<Suit>,
): TileKind[] {
  const nearKeys = new Set<string>();
  for (const k of base) {
    nearKeys.add(kindKey(k));
    if (!seqSuits.has(k.suit)) continue;
    for (let d = -2; d <= 2; d++) {
      const r = k.rank + d;
      if (r >= 1 && r <= 9) nearKeys.add(kindKey({ suit: k.suit, rank: r }));
    }
  }
  const all = standardKinds();
  const seen = new Set(all.map(kindKey));
  for (const k of base) {
    const key = kindKey(k);
    if (seen.has(key)) continue;
    seen.add(key);
    all.push(k);
  }
  return [
    ...all.filter((k) => nearKeys.has(kindKey(k))),
    ...all.filter((k) => !nearKeys.has(kindKey(k))),
  ];
}

/**
 * "이 손이 화료형인가"의 메모. 조커가 있으면 한 번의 대기 계산(34종 × 조커 후보 34종)이
 * 1000번 넘게 분해를 부르는데, 그중 **같은 손이 절반**이다 — 조커가 a가 되고 후보가 b인
 * 손과 그 반대가 정확히 같은 손이기 때문이다. 국이 바뀌어도 같은 손은 같은 답이라
 * (순수 함수) 무효화가 필요 없고, 크기만 막는다.
 */
const wildShapeCache = new Map<string, boolean>();
const WILD_CACHE_MAX = 200_000;

/** 옵션 중 분해 결과를 바꾸는 값만 뽑은 서명 (조커 후보는 손에 이미 반영돼 있다) */
function optionsSignature(norm: NormalizedOptions, meldCount: number): string {
  return [
    meldCount,
    norm.totalSets,
    norm.wrapRuns ? 1 : 0,
    norm.mixedRuns ? 1 : 0,
    norm.mixedTriplets ? 1 : 0,
    norm.mixedPairs ? 1 : 0,
    norm.polarEnds ? 1 : 0,
    norm.chiitoiMixedPairs ? 1 : 0,
    norm.honorRuns ? 1 : 0,
    norm.kokushiOnly ? 1 : 0,
    norm.kokushiDupes,
    [...norm.sequenceSuits].sort().join("."),
    (norm.kokushiMeldKinds ?? []).map(kindKey).sort().join("."),
  ].join("/");
}

function isWinningShapeMemo(
  hand: readonly TileKind[],
  meldCount: number,
  norm: NormalizedOptions,
  signature: string,
): boolean {
  const key = `${signature}#${hand.map(kindKey).sort().join(",")}`;
  const hit = wildShapeCache.get(key);
  if (hit !== undefined) return hit;
  const ok = decomposeExact(hand, meldCount, norm).length > 0;
  if (wildShapeCache.size >= WILD_CACHE_MAX) wildShapeCache.clear();
  wildShapeCache.set(key, ok);
  return ok;
}

/**
 * 손패의 조커를 실제 패로 바꿔 놓은 손을 하나씩 만들어 `visit`에 넘긴다.
 * 조커끼리는 구분되지 않으므로 **중복 조합**(오름차순 인덱스)만 만든다.
 * `visit`가 true를 돌려주면 즉시 멈춘다 (존재 판정의 조기 종료).
 */
function forEachWildHand(
  hand: readonly TileKind[],
  norm: NormalizedOptions,
  visit: (effectiveHand: TileKind[], wildAs: TileKind[]) => boolean,
): void {
  const wildKeys = new Set(norm.wildKinds.map(kindKey));
  const base: TileKind[] = [];
  let wilds = 0;
  for (const k of hand) {
    if (wildKeys.has(kindKey(k))) wilds++;
    else base.push(k);
  }
  if (wilds === 0) {
    visit([...hand], []);
    return;
  }
  const universe = wildUniverse(base, norm.sequenceSuits);
  const chosen: TileKind[] = [];
  const walk = (start: number): boolean => {
    if (chosen.length === wilds) return visit([...base, ...chosen], [...chosen]);
    for (let i = start; i < universe.length; i++) {
      chosen.push(universe[i] as TileKind);
      const stop = walk(i);
      chosen.pop();
      if (stop) return true;
    }
    return false;
  };
  walk(0);
}

/**
 * @param hand 손패의 kind 목록 (화료패 포함, 후로 제외)
 * @param meldCount 후로(깡 포함) 수 — 손패 쪽에 필요한 멘쯔 수가 그만큼 줄어든다
 * @param opts 분해 옵션 (하위 호환: ReadonlySet<Suit>는 sequenceSuits로 해석)
 */
export function decompose(
  hand: readonly TileKind[],
  meldCount: number,
  opts?: DecomposeOptions | ReadonlySet<Suit>,
): Decomposition[] {
  const norm = normalizeOptions(opts);
  if (norm.wildKinds.length === 0) return decomposeExact(hand, meldCount, norm);

  // 조커 — 바꿔 놓은 손마다 분해를 전부 모은다. 어느 것을 쓸지는 채점이 고른다.
  const out: Decomposition[] = [];
  forEachWildHand(hand, norm, (effectiveHand, wildAs) => {
    for (const d of decomposeExact(effectiveHand, meldCount, norm)) {
      out.push({ ...d, effectiveHand, wildAs });
    }
    return false;
  });
  return out;
}

/** 조커를 이미 실제 패로 바꾼 손 하나를 분해한다 (조커를 모르는 원래 알고리즘) */
function decomposeExact(
  hand: readonly TileKind[],
  meldCount: number,
  norm: NormalizedOptions,
): Decomposition[] {
  const {
    sequenceSuits,
    wrapRuns,
    totalSets,
    kokushiMeldKinds,
    kokushiOnly,
    mixedRuns,
    mixedTriplets,
    mixedPairs,
    kokushiDupes,
    polarEnds,
    chiitoiMixedPairs,
    honorRuns,
  } = norm;
  const results: Decomposition[] = [];
  const setsNeeded = totalSets - meldCount;

  // ── standard: 작두 후보마다 나머지를 멘쯔로 소진 ──
  if (!kokushiOnly && hand.length === setsNeeded * 3 + 2) {
    const counts = buildCounts(hand);
    for (const pairKey of counts.order) {
      const c = counts.n.get(pairKey) ?? 0;
      if (c < 2) continue;
      counts.n.set(pairKey, c - 2);
      const pairKind = counts.kindOf.get(pairKey) as TileKind;
      for (const sets of extractSets(
        counts,
        sequenceSuits,
        wrapRuns,
        mixedRuns,
        mixedTriplets,
        polarEnds,
        honorRuns,
      )) {
        results.push({ form: "standard", pair: pairKind, sets });
      }
      counts.n.set(pairKey, c);
    }

    // 혼색 머리 — 랭크만 같으면 무늬가 달라도 작두다 (수패 한정).
    // 위의 순수 머리와 겹치지 않게 **서로 다른 두 kind**의 조합만 만든다.
    if (mixedPairs) {
      for (let i = 0; i < counts.order.length; i++) {
        for (let j = i + 1; j < counts.order.length; j++) {
          const ka = counts.order[i] as string;
          const kb = counts.order[j] as string;
          const a = counts.kindOf.get(ka) as TileKind;
          const b = counts.kindOf.get(kb) as TileKind;
          if (a.rank !== b.rank) continue;
          if (!sequenceSuits.has(a.suit) || !sequenceSuits.has(b.suit)) continue;
          if ((counts.n.get(ka) ?? 0) < 1 || (counts.n.get(kb) ?? 0) < 1) continue;
          counts.n.set(ka, (counts.n.get(ka) as number) - 1);
          counts.n.set(kb, (counts.n.get(kb) as number) - 1);
          for (const sets of extractSets(
            counts,
            sequenceSuits,
            wrapRuns,
            mixedRuns,
            mixedTriplets,
            polarEnds,
            honorRuns,
          )) {
            results.push({ form: "standard", pair: a, sets });
          }
          counts.n.set(ka, (counts.n.get(ka) as number) + 1);
          counts.n.set(kb, (counts.n.get(kb) as number) + 1);
        }
      }
    }
  }

  // ── 치토이: 후로 없음, 서로 다른 7종 × 2장 (표준 4멘쯔 게임에서만) ──
  if (meldCount === 0 && hand.length === 14 && totalSets === 4) {
    const counts = buildCounts(hand);
    const keys = counts.order;
    if (!kokushiOnly) {
      if (chiitoiMixedPairs) {
        // 비대칭 치또이 — 표준(7종×2)을 포함하는 상위집합이므로 이 분기만 돌린다
        const pairs = asyncChiitoiPairs(hand);
        if (pairs !== null) {
          results.push({ form: "chiitoitsu", pair: null, pairs, sets: [] });
        }
      } else if (keys.length === 7 && keys.every((key) => counts.n.get(key) === 2)) {
        results.push({
          form: "chiitoitsu",
          pair: null,
          pairs: keys.map((key) => counts.kindOf.get(key) as TileKind),
          sets: [],
        });
      }
    }

    // ── 국사: 13종 요구패 전부 + 그중 하나 2장 ──
    // 왕의 징표(kokushiDupes>0)면 종류가 d개까지 빠져도 되고, 빠진 자리는 중복으로 메운다.
    const orphanKeys = new Set(ORPHAN_KINDS.map(kindKey));
    const allOrphans = hand.every((k) => orphanKeys.has(kindKey(k)));
    if (allOrphans) {
      // allOrphans가 counts.order ⊆ orphanKeys를 보장하므로 빠진 종류 수는 13−distinct다.
      const missing = ORPHAN_KINDS.length - counts.order.length;
      const doubled = counts.order.find((key) => (counts.n.get(key) ?? 0) >= 2);
      if (missing <= kokushiDupes && doubled !== undefined) {
        results.push({
          form: "kokushi",
          pair: counts.kindOf.get(doubled) as TileKind,
          sets: [],
        });
      }
    }
  }

  // ── 울어 국사 (특수 후로 지원): 서로 다른 요구패 3장 후로 M개가 3M종을 덮는다 ──
  // 후로가 3M종(전부 서로 다른 요구패)을 덮고, 손 (14−3M)장이 나머지 (13−3M)종을
  // 1장씩 + 머리(1종 2장)로 덮으면 국사 성립. 머리는 반드시 손패(울지 않은 패)다.
  if (kokushiMeldKinds !== undefined && kokushiMeldKinds.length > 0 && meldCount > 0) {
    const K = kokushiMeldKinds.length;
    const orphanKeys = new Set(ORPHAN_KINDS.map(kindKey));
    const meldKeys = kokushiMeldKinds.map(kindKey);
    const meldSet = new Set(meldKeys);
    if (
      K === meldCount * 3 && // 후로마다 정확히 3종
      meldSet.size === K && // 후로 kind가 전부 서로 다르다
      meldKeys.every((key) => orphanKeys.has(key)) && // 전부 요구패
      hand.length === 14 - K // 손패 장수
    ) {
      const handKeys = hand.map(kindKey);
      const handDistinct = new Set(handKeys);
      const counts = new Map<string, number>();
      for (const key of handKeys) counts.set(key, (counts.get(key) ?? 0) + 1);
      const covered =
        handKeys.every((key) => orphanKeys.has(key)) && // 손패 전부 요구패
        [...handDistinct].every((key) => !meldSet.has(key)) && // 후로와 겹치지 않음(머리도 손패)
        handDistinct.size + meldSet.size === 13 && // 후로+손 = 13종 전부
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
  const norm = normalizeOptions(opts);
  if (norm.wildKinds.length === 0) {
    return decomposeExact(hand, meldCount, norm).length > 0;
  }
  // 조커 — **존재만** 보면 되므로 첫 성공에서 멈춘다. 대기 계산(winningKinds)이
  // 34종을 훑으며 이 함수를 부르기 때문에 조기 종료가 곧 체감 속도다.
  const signature = optionsSignature(norm, meldCount);
  let found = false;
  forEachWildHand(hand, norm, (effectiveHand) => {
    if (!isWinningShapeMemo(effectiveHand, meldCount, norm, signature)) return false;
    found = true;
    return true;
  });
  return found;
}
