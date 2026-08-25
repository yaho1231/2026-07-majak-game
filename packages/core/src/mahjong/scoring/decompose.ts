/**
 * decompose — 손패를 화료 형태로 분해한다.
 * 4멘쯔 1작두(standard) / 치또이 / 국사 세 형태를 전부 열거한다.
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
   * 채점은 이 손을 봐야 한다 — 치또이·국사는 sets/pair가 아니라 손패 전체로
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
 * 이 네 랭크가 연속 4장이면 **그 시작 랭크**, 아니면 null (장사진의 4연속 깡 판정).
 * `wrap`이면 9를 넘어 이어지는 시작(7·8·9)도 답이 된다 — 8-9-1-2의 시작은 8이다.
 *
 * 시작 랭크를 돌려주는 이유: 순환 깡은 정렬만으로 순서를 복원할 수 없다
 * (8-9-1-2를 오름차순으로 늘어놓으면 1-2-8-9가 된다). 후보 생성·validate·채점의
 * 대표 3장(`runQuadRepr`)이 같은 한 곳에서 순서를 얻어야 어긋나지 않는다.
 */
export function runQuadStart(
  ranks: readonly number[],
  wrap = false,
): number | null {
  if (ranks.length !== 4) return null;
  const have = new Set(ranks);
  if (have.size !== 4) return null;
  const last = wrap ? 9 : 6; // 순환이 없으면 시작은 6까지(6-7-8-9)
  for (let start = 1; start <= last; start++) {
    let ok = true;
    for (let d = 0; d < 4; d++) {
      if (!have.has(((start - 1 + d) % 9) + 1)) {
        ok = false;
        break;
      }
    }
    if (ok) return start;
  }
  return null;
}

/**
 * 4연속 깡의 **대표 3장**(랭크 순서대로 앞 셋). 순환 깡(8-9-1-2)의 대표는 8-9-1이다.
 * 연속이 아니면(사풍깡 등) null — 그쪽은 오름차순 앞 3장이 종전 규약이다.
 */
export function runQuadRepr(kinds: readonly TileKind[]): TileKind[] | null {
  const start = runQuadStart(kinds.map((k) => k.rank), true);
  if (start === null) return null;
  const byRank = new Map(kinds.map((k) => [k.rank, k]));
  const out: TileKind[] = [];
  for (let d = 0; d < 3; d++) {
    const k = byRank.get(((start - 1 + d) % 9) + 1);
    if (k === undefined) return null;
    out.push(k);
  }
  return out;
}

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
   * 표준형·치또이 분해를 아예 열거하지 않는다 — 화료·텐파이·대기·후리텐이
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
    // 동수의 결속(mixedTriplets)은 "같은 랭크면 같은 패"라는 재정의다 — 커쯔만
    // 열고 머리를 닫아 두면 1통+1삭·5만+5삭 같은 **샹퐁 대기가 통째로 사라진다**
    // (7m7p7p1p1s5m5s + 후로 2 → 777 + 111 + 55머리인데 머리가 혼색이라 불성립).
    // 그래서 커쯔를 여는 옵션은 머리도 함께 연다. (2026-08-25 사용자 보고)
    mixedPairs: (o.mixedPairs ?? false) || (o.mixedTriplets ?? false),
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

// ───────────────────────── 조커(wildKinds) — 재귀가 직접 안다 ─────────────────────────
//
// ⚠ 예전에는 조커를 **실제 패로 바꿔 놓은 손을 전부 만들어** 다시 분해했다. 후보 kind가
//   34종이라 조커 W장이면 34^W개의 손이 되고, 대기 계산은 거기에 34를 또 곱한다 —
//   `123456789백백백백`처럼 백 4장이면 한 번의 대기 계산이 5~10초였다(2026-08-07 사용자 보고).
//
// 지금은 **분해 재귀가 조커를 직접 안다**: 몸통을 만들다 모자란 자리를 조커로 메운다.
// 조커가 무엇이 됐는지는 그 몸통이 결정하므로(빈자리의 kind) 후보를 훑을 일이 없다.
// 조커만으로 이루는 몸통·머리만 kind가 자유롭고, 그때만 후보를 열거한다.

/** 멘쯔 분해 한 가지 — 조커가 무엇이 됐는지를 함께 들고 다닌다 */
interface SetSolution {
  sets: DecompSet[];
  wildAs: TileKind[];
}

interface ExtractCtx {
  seqSuits: ReadonlySet<Suit>;
  wrap: boolean;
  mixed: boolean;
  mixedTri: boolean;
  polar: boolean;
  honor: boolean;
  /** 조커만으로 이루는 몸통·머리에 쓸 kind 후보 (표준 34종 + 손의 커스텀 무늬) */
  freeKinds: readonly TileKind[];
  /** 조커 전용 몸통·머리의 kind를 전부 열거하는가 (채점용). false면 대표 하나만 */
  enumerateFree: boolean;
  /** 해가 하나 나오면 즉시 멈춘다 (존재 판정 — isWinningShape) */
  stopAtFirst: boolean;
}

/**
 * 후보 몸통을 counts에서 꺼낸다 — **실제 패를 먼저 쓰고 모자란 만큼만** 조커를 쓴다.
 *
 * 실제 패 우선이 일반성을 잃지 않는 이유(교환 논증): 어떤 해가 실제 패 K를 남겨 둔 채
 * 조커를 K로 썼다면, 그 조커와 남은 실제 K를 맞바꾼 해가 반드시 존재하고 두 해의 kind
 * 구성은 완전히 같다. 그래서 "조커를 어디에 쓸까"를 따로 열거할 필요가 없다.
 *
 * @returns 불가능하면 null (조커가 모자라다)
 */
function takeGroup(
  counts: Counts,
  tiles: readonly TileKind[],
  wilds: number,
): { used: Map<string, number>; wildAs: TileKind[] } | null {
  const need = new Map<string, { kind: TileKind; n: number }>();
  for (const t of tiles) {
    const key = kindKey(t);
    const cur = need.get(key);
    if (cur === undefined) need.set(key, { kind: t, n: 1 });
    else cur.n += 1;
  }
  const used = new Map<string, number>();
  const wildAs: TileKind[] = [];
  for (const [key, want] of need) {
    const have = Math.min(counts.n.get(key) ?? 0, want.n);
    if (have > 0) used.set(key, have);
    for (let i = have; i < want.n; i++) wildAs.push(want.kind);
  }
  if (wildAs.length > wilds) return null;
  return { used, wildAs };
}

function applyUsed(counts: Counts, used: Map<string, number>, sign: number): void {
  for (const [key, n] of used) counts.n.set(key, (counts.n.get(key) ?? 0) + sign * n);
}

/** 조커만으로 이루는 몸통 후보 (커쯔 + 슌쯔). 존재 판정이면 대표 하나면 충분하다 */
function freeGroupCandidates(ctx: ExtractCtx): DecompSet[] {
  const first = ctx.freeKinds[0] as TileKind;
  if (!ctx.enumerateFree) return [{ type: "triplet", tiles: [first, first, first] }];
  const out: DecompSet[] = ctx.freeKinds.map((k) => ({
    type: "triplet" as const,
    tiles: [k, k, k],
  }));
  for (const suit of ctx.seqSuits) {
    for (let r = 1; r + 2 <= 9; r++) {
      out.push({
        type: "run",
        tiles: [
          { suit, rank: r },
          { suit, rank: r + 1 },
          { suit, rank: r + 2 },
        ],
      });
    }
  }
  return out;
}

/** 남은 조커 3n장이 몸통 n개를 이룬다 (조커끼리는 순서가 없으므로 중복 조합) */
function freeSets(n: number, ctx: ExtractCtx): SetSolution[] {
  if (n === 0) return [{ sets: [], wildAs: [] }];
  const cands = freeGroupCandidates(ctx);
  const out: SetSolution[] = [];
  const chosen: DecompSet[] = [];
  const walk = (start: number): void => {
    if (chosen.length === n) {
      out.push({ sets: [...chosen], wildAs: chosen.flatMap((s) => s.tiles) });
      return;
    }
    for (let i = start; i < cands.length; i++) {
      chosen.push(cands[i] as DecompSet);
      walk(i);
      chosen.pop();
      if (ctx.stopAtFirst && out.length > 0) return;
    }
  };
  walk(0);
  return out;
}

/**
 * counts(실제 패)와 조커 `wilds`장으로 몸통 `setsLeft`개를 만드는 모든 방법.
 * "첫 남은 실제 패는 반드시 지금 소비된다" 기법으로 중복 없이 모든 분해를 얻는다 —
 * 조커가 붙어도 `takeGroup`이 그 패를 실제로 소비하므로 불변량이 유지된다.
 */
function extractSets(
  counts: Counts,
  wilds: number,
  setsLeft: number,
  ctx: ExtractCtx,
): SetSolution[] {
  const firstKey = counts.order.find((key) => (counts.n.get(key) ?? 0) > 0);
  if (firstKey === undefined) {
    // 실제 패는 다 썼다 — 남은 조커가 남은 몸통을 **정확히** 채워야 한다
    return wilds === setsLeft * 3 ? freeSets(setsLeft, ctx) : [];
  }
  if (setsLeft <= 0) return []; // 실제 패가 남았는데 채울 몸통이 없다

  const kind = counts.kindOf.get(firstKey) as TileKind;
  const solutions: SetSolution[] = [];

  // 이 자리에서 시도할 몸통 후보 — 전부 firstKey를 품는다(중복 열거 방지).
  // 장수는 보지 않는다: 모자란 자리는 takeGroup이 조커로 메운다.
  const candidates: DecompSet[] = [];
  const seen = new Set<string>();
  const push = (set: DecompSet): void => {
    if (!set.tiles.some((t) => kindKey(t) === firstKey)) return;
    const key = `${set.type}|${set.tiles.map(kindKey).join("|")}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(set);
  };

  push({ type: "triplet", tiles: [kind, kind, kind] });

  // 혼색 커쯔 (동수의 결속) — 랭크만 같으면 무늬가 섞여도 커쯔다.
  // 자패는 무늬 개념이 없으므로 수패(seqSuits)에만 적용한다.
  // 위의 순수 커쯔와 중복되지 않게 "무늬가 최소 2종"인 조합만 만든다.
  if (ctx.mixedTri && ctx.seqSuits.has(kind.suit)) {
    const suits = [...ctx.seqSuits];
    for (let i = 0; i < suits.length; i++) {
      for (let j = i; j < suits.length; j++) {
        for (let k = j; k < suits.length; k++) {
          const tiles = [
            { suit: suits[i] as Suit, rank: kind.rank },
            { suit: suits[j] as Suit, rank: kind.rank },
            { suit: suits[k] as Suit, rank: kind.rank },
          ];
          if (new Set(tiles.map((t) => t.suit)).size < 2) continue;
          push({ type: "triplet", tiles });
        }
      }
    }
  }

  // 양극(polar) — 같은 무늬의 1·9만으로 이루는 커쯔 몸통(199·191·911).
  // 순수 커쯔(111·999)는 위에서 이미 다뤘으므로 1과 9가 **둘 다 든** 몸통만 만든다.
  if (ctx.polar && ctx.seqSuits.has(kind.suit) && (kind.rank === 1 || kind.rank === 9)) {
    const one: TileKind = { suit: kind.suit, rank: 1 };
    const nine: TileKind = { suit: kind.suit, rank: 9 };
    for (let ones = 1; ones <= 2; ones++) {
      push({
        type: "triplet",
        tiles: [
          ...Array.from({ length: ones }, () => one),
          ...Array.from({ length: 3 - ones }, () => nine),
        ],
      });
    }
  }

  if (ctx.seqSuits.has(kind.suit)) {
    // 시도할 슌쯔 후보(kind 3개).
    //  - 표준: firstKey가 최소 rank이므로 (r, r+1, r+2)만 보면 된다.
    //  - wrap: firstKey가 순환 슌쯔의 중간·끝일 수 있어 세 위치 전부 시도한다.
    //  - mixed(무너진 국경): 무늬 정렬이 랭크와 무관해져 firstKey가 어느 위치든 될 수 있다.
    //  - **조커가 있으면** 앞자리를 조커가 메울 수 있으므로 firstKey가 최소 rank라는
    //    전제가 깨진다 — 이때도 세 위치를 전부 시도한다.
    const positions = ctx.wrap || ctx.mixed || wilds > 0 ? [0, 1, 2] : [0];
    for (const pos of positions) {
      const base = kind.rank - pos;
      if (!ctx.wrap && (base < 1 || base + 2 > 9)) continue;
      const ranks = ctx.wrap
        ? [wrapRank(base), wrapRank(base + 1), wrapRank(base + 2)]
        : [base, base + 1, base + 2];
      if (!ctx.mixed) {
        push({ type: "run", tiles: ranks.map((r) => ({ suit: kind.suit, rank: r })) });
        continue;
      }
      for (const s0 of ctx.seqSuits) {
        for (const s1 of ctx.seqSuits) {
          for (const s2 of ctx.seqSuits) {
            const tiles = [
              { suit: s0, rank: ranks[0] as number },
              { suit: s1, rank: ranks[1] as number },
              { suit: s2, rank: ranks[2] as number },
            ];
            // firstKey를 그 자리에서 소비하지 않는 후보는 다른 재귀 단계가 다룬다
            if (kindKey(tiles[pos] as TileKind) !== firstKey) continue;
            push({ type: "run", tiles });
          }
        }
      }
    }
  }

  // 자패 슌쯔 (바람의 계보) — 같은 자패 suit 안에서 (r, r+1, r+2) 연속 3장.
  // 바람: 1-2-3(동남서)·2-3-4(남서북) / 삼원: 1-2-3(백발중). 순환·무늬혼합 없음.
  if (ctx.honor && (kind.suit === Suits.Wind || kind.suit === Suits.Dragon)) {
    const max = honorMaxRank(kind.suit);
    // 조커가 앞자리를 메울 수 있으므로 firstKey가 시작이 아닐 수도 있다
    for (const pos of wilds > 0 ? [0, 1, 2] : [0]) {
      const base = kind.rank - pos;
      if (base < 1 || base + 2 > max) continue;
      push({
        type: "run",
        tiles: [
          { suit: kind.suit, rank: base },
          { suit: kind.suit, rank: base + 1 },
          { suit: kind.suit, rank: base + 2 },
        ],
      });
    }
  }

  for (const cand of candidates) {
    const take = takeGroup(counts, cand.tiles, wilds);
    if (take === null) continue;
    applyUsed(counts, take.used, -1);
    for (const rest of extractSets(counts, wilds - take.wildAs.length, setsLeft - 1, ctx)) {
      solutions.push({
        sets: [cand, ...rest.sets],
        wildAs: [...take.wildAs, ...rest.wildAs],
      });
      if (ctx.stopAtFirst) break;
    }
    applyUsed(counts, take.used, 1);
    if (ctx.stopAtFirst && solutions.length > 0) break;
  }

  return solutions;
}

/** 조커가 자유롭게 될 수 있는 kind (표준 34종 + 손에 실제로 있는 커스텀 무늬) */
function freeKindUniverse(hand: readonly TileKind[]): TileKind[] {
  const all = standardKinds();
  const seen = new Set(all.map(kindKey));
  for (const k of hand) {
    const key = kindKey(k);
    if (seen.has(key)) continue;
    seen.add(key);
    all.push(k);
  }
  return all;
}

/** 치또이 한 가지 — 쌍 7개와 조커가 무엇이 됐는지 */
interface ChiitoiSolution {
  pairs: TileKind[];
  wildAs: TileKind[];
}

/**
 * 치또이 — 조커는 **혼자 남은 패의 짝**이 되거나, 둘이 모여 **새 쌍**이 된다.
 * 같은 패 3장 이상은 조커로도 못 고친다(치또이는 서로 다른 7종).
 */
function chiitoiWithWilds(counts: Counts, wilds: number, ctx: ExtractCtx): ChiitoiSolution[] {
  const pairs: TileKind[] = [];
  const wildAs: TileKind[] = [];
  for (const key of counts.order) {
    const c = counts.n.get(key) as number;
    if (c > 2) return [];
    const k = counts.kindOf.get(key) as TileKind;
    pairs.push(k);
    if (c === 1) wildAs.push(k);
  }
  const left = wilds - wildAs.length;
  if (left < 0 || left % 2 !== 0) return [];
  const extra = left / 2;
  if (pairs.length + extra !== 7) return [];
  if (extra === 0) return [{ pairs, wildAs }];

  // 남는 조커는 **손에 없는 새 종류**로 쌍을 만든다 (7종은 서로 달라야 한다)
  const used = new Set(counts.order);
  const pool = ctx.freeKinds.filter((k) => !used.has(kindKey(k)));
  const out: ChiitoiSolution[] = [];
  const chosen: TileKind[] = [];
  const walk = (start: number): void => {
    if (chosen.length === extra) {
      out.push({
        pairs: [...pairs, ...chosen],
        wildAs: [...wildAs, ...chosen.flatMap((k) => [k, k])],
      });
      return;
    }
    for (let i = start; i < pool.length; i++) {
      chosen.push(pool[i] as TileKind);
      walk(i + 1);
      chosen.pop();
      if (!ctx.enumerateFree && out.length > 0) return;
    }
  };
  walk(0);
  return out;
}

/**
 * 비대칭 치또이(무늬 무관 rank 쌍) + 조커.
 *
 * 홀수로 남은 그룹(수패는 랭크, 자패는 종류)마다 조커 한 장을 넣어 짝수로 만들고,
 * 남는 조커는 둘씩 새 종류의 쌍이 된다. 배치를 정한 뒤 **기존 판정기로 검증**하므로
 * 규칙이 두 벌로 갈리지 않는다.
 */
function asyncChiitoiWithWilds(
  real: readonly TileKind[],
  wilds: number,
  ctx: ExtractCtx,
): ChiitoiSolution | null {
  const count = new Map<string, number>();
  for (const k of real) count.set(kindKey(k), (count.get(kindKey(k)) ?? 0) + 1);
  const groupOf = (k: TileKind): string =>
    NUMBER_SUITS.has(k.suit) ? `n${k.rank}` : kindKey(k);
  const size = new Map<string, number>();
  for (const k of real) size.set(groupOf(k), (size.get(groupOf(k)) ?? 0) + 1);

  const wildAs: TileKind[] = [];
  const bump = (k: TileKind): void => {
    count.set(kindKey(k), (count.get(kindKey(k)) ?? 0) + 1);
    wildAs.push(k);
  };
  for (const [g, s] of size) {
    if (s % 2 === 0) continue;
    // 같은 패 2장을 넘지 않는 자리를 그 그룹 안에서 고른다
    const slot = ctx.freeKinds.find(
      (k) => groupOf(k) === g && (count.get(kindKey(k)) ?? 0) < 2,
    );
    if (slot === undefined) return null;
    bump(slot);
  }
  const left = wilds - wildAs.length;
  if (left < 0 || left % 2 !== 0) return null;
  for (let i = 0; i < left / 2; i++) {
    const fresh = ctx.freeKinds.find((k) => (count.get(kindKey(k)) ?? 0) === 0);
    if (fresh === undefined) return null;
    bump(fresh);
    bump(fresh);
  }
  const pairs = asyncChiitoiPairs([...real, ...wildAs]);
  return pairs === null ? null : { pairs, wildAs };
}

/**
 * 국사 — 조커가 될 수 있는 것은 **요구패 13종뿐**이라 그대로 열거해도 싸다
 * (조커 4장이라도 1820가지). 손패가 전부 요구패일 때만 불린다.
 */
function forEachOrphanFill(wilds: number, visit: (fill: TileKind[]) => boolean): void {
  const chosen: TileKind[] = [];
  const walk = (start: number): boolean => {
    if (chosen.length === wilds) return visit([...chosen]);
    for (let i = start; i < ORPHAN_KINDS.length; i++) {
      chosen.push(ORPHAN_KINDS[i] as TileKind);
      const stop = walk(i);
      chosen.pop();
      if (stop) return true;
    }
    return false;
  };
  walk(0);
}

/** 손패 14장이 국사인가 — 성립하면 머리 kind (kokushiDupes = 왕의 징표) */
function kokushiPairOf(hand: readonly TileKind[], kokushiDupes: number): TileKind | null {
  const counts = buildCounts(hand);
  const missing = ORPHAN_KINDS.length - counts.order.length;
  const doubled = counts.order.find((key) => (counts.n.get(key) ?? 0) >= 2);
  if (missing > kokushiDupes || doubled === undefined) return null;
  return counts.kindOf.get(doubled) as TileKind;
}

/**
 * 울어 국사 — 후로가 3M종을 덮고 손이 나머지를 덮는가. 성립하면 머리 kind.
 *
 * `kokushiDupes`(왕의 징표)는 닫힌 국사(`kokushiPairOf`)와 **같은 뜻**이다 — 종류가
 * d개까지 빠져도 되고 빠진 자리는 중복으로 메운다. 2026-08-23까지 이 분기만 그 값을
 * 안 받아 13종을 강제했다: 같은 자리에서 조커(`forEachOrphanFill`)는 통하는데 중복만
 * 안 통해, 두 카드를 함께 든 사람이 12종에서 kokushi_pon을 부르면 화료형이 서지 않고
 * `kokushiOnly`가 다른 길까지 막아 **벽돌 국**이 됐다(QA synergy3 shape 확정 1).
 * 머리는 그대로 손패(울지 않은 패)에서만 나온다.
 */
function meldKokushiPairOf(
  hand: readonly TileKind[],
  meldSet: ReadonlySet<string>,
  orphanKeys: ReadonlySet<string>,
  kokushiDupes: number,
): TileKind | null {
  const handKeys = hand.map(kindKey);
  const handDistinct = new Set(handKeys);
  const counts = new Map<string, number>();
  for (const key of handKeys) counts.set(key, (counts.get(key) ?? 0) + 1);
  // 빠진 종류 수 — 후로+손이 덮은 종류가 13에서 몇 개 모자라는가
  const missing = 13 - (handDistinct.size + meldSet.size);
  const covered =
    handKeys.every((key) => orphanKeys.has(key)) && // 손패 전부 요구패
    [...handDistinct].every((key) => !meldSet.has(key)) && // 후로와 겹치지 않음(머리도 손패)
    missing >= 0 &&
    missing <= kokushiDupes;
  if (!covered) return null;
  // 손패 장수는 바깥에서 14−K로 고정돼 있으므로, 빠진 d종만큼 중복이 더 생긴다.
  // 머리는 그중 아무 중복 종류 하나 — 결정적으로 첫 번째를 쓴다.
  const pairKey = [...counts.entries()].find(([, n]) => n >= 2)?.[0];
  if (pairKey === undefined) return null;
  return hand.find((k) => kindKey(k) === pairKey) ?? null;
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
  return decomposeInternal(hand, meldCount, normalizeOptions(opts), false);
}

/**
 * `isWinningShape` 메모 — **순수 함수의 결과 캐시**다.
 *
 * 이 함수는 대기 계산(`winningKinds`)이 34종을 훑으며 부르고, 봇은 한 번의 결정에서
 * 손 읽기·버림 후보·위험도를 재느라 같은 손을 몇 번이고 다시 묻는다. 화료형을 넓히는
 * 증강(무너진 국경 `mixedRuns` 등)이 켜지면 분해 가지가 폭증해, 그 반복이 곧 체감
 * 지연이 된다 — 실측으로 **한 장에 봇 진행이 3.4배 느려졌다**(3.7s → 12.7s/판,
 * 2026-08-23 QA synergy3 build 확정 4).
 *
 * 입력이 같으면 출력이 같으므로 무효화가 필요 없다. 다만 무한히 자라면 안 되므로
 * 상한을 두고 넘치면 통째로 비운다(LRU를 쓸 만큼 뜨겁지 않다).
 */
const SHAPE_MEMO_MAX = 20_000;
const shapeMemo = new Map<string, boolean>();

/** 메모 키 — 손 + 후로 수 + **분해 규칙 전부**. 하나라도 빠지면 오답이 캐시된다. */
function shapeMemoKey(
  hand: readonly TileKind[],
  meldCount: number,
  n: NormalizedOptions,
): string {
  const tiles = hand.map(kindKey).sort().join(",");
  const suits = [...n.sequenceSuits].sort().join("");
  const wild = n.wildKinds.map(kindKey).sort().join(",");
  const kokushi =
    n.kokushiMeldKinds === undefined
      ? ""
      : n.kokushiMeldKinds.map(kindKey).sort().join(",");
  const flags = [
    n.wrapRuns,
    n.kokushiOnly,
    n.mixedRuns,
    n.mixedTriplets,
    n.mixedPairs,
    n.polarEnds,
    n.chiitoiMixedPairs,
    n.honorRuns,
  ]
    .map((b) => (b ? "1" : "0"))
    .join("");
  return `${tiles}|${meldCount}|${n.totalSets}|${suits}|${flags}|${n.kokushiDupes}|${wild}|${kokushi}`;
}

/** 화료 형태인가 (분해가 하나라도 존재) */
export function isWinningShape(
  hand: readonly TileKind[],
  meldCount: number,
  opts?: DecomposeOptions | ReadonlySet<Suit>,
): boolean {
  const norm = normalizeOptions(opts);
  const key = shapeMemoKey(hand, meldCount, norm);
  const hit = shapeMemo.get(key);
  if (hit !== undefined) return hit;
  // 존재만 보면 되므로 첫 해에서 멈춘다 — 대기 계산(winningKinds)이 34종을 훑으며
  // 이 함수를 부르기 때문에 조기 종료가 곧 체감 속도다.
  const out = decomposeInternal(hand, meldCount, norm, true).length > 0;
  if (shapeMemo.size >= SHAPE_MEMO_MAX) shapeMemo.clear();
  shapeMemo.set(key, out);
  return out;
}

/**
 * @param shapeOnly true면 **해 하나만** 찾고 멈춘다. 조커 전용 몸통·머리의 kind도
 *   열거하지 않는다 — 화료형인지만 묻는 자리(텐파이·대기·후리텐)에서는 그 kind가
 *   무엇이든 형태가 성립하는지에 영향이 없기 때문이다.
 */
function decomposeInternal(
  hand: readonly TileKind[],
  meldCount: number,
  norm: NormalizedOptions,
  shapeOnly: boolean,
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
    wildKinds,
  } = norm;

  // 조커와 실제 패를 가른다 — 조커는 kind가 아니라 **장수**로만 들고 다닌다
  const wildKeys = new Set(wildKinds.map(kindKey));
  const real: TileKind[] = [];
  let wilds = 0;
  for (const k of hand) {
    if (wildKeys.has(kindKey(k))) wilds += 1;
    else real.push(k);
  }

  const ctx: ExtractCtx = {
    seqSuits: sequenceSuits,
    wrap: wrapRuns,
    mixed: mixedRuns,
    mixedTri: mixedTriplets,
    polar: polarEnds,
    honor: honorRuns,
    freeKinds: wilds > 0 ? freeKindUniverse(real) : [],
    enumerateFree: !shapeOnly,
    stopAtFirst: shapeOnly,
  };

  const results: Decomposition[] = [];
  const done = (): boolean => shapeOnly && results.length > 0;
  const add = (d: Decomposition, wildAs: TileKind[]): void => {
    if (wilds === 0) {
      results.push(d);
      return;
    }
    results.push({ ...d, wildAs, effectiveHand: [...real, ...wildAs] });
  };

  const setsNeeded = totalSets - meldCount;

  // ── standard: 작두 후보마다 나머지를 멘쯔로 소진 ──
  if (!kokushiOnly && hand.length === setsNeeded * 3 + 2) {
    const counts = buildCounts(real);

    // 머리 — 실제 패를 먼저 쓰고 모자란 한 장만 조커로 채운다
    for (const pairKey of counts.order) {
      const c = counts.n.get(pairKey) as number;
      const useReal = Math.min(c, 2);
      const needWild = 2 - useReal;
      if (needWild > wilds) continue;
      const pairKind = counts.kindOf.get(pairKey) as TileKind;
      counts.n.set(pairKey, c - useReal);
      for (const sol of extractSets(counts, wilds - needWild, setsNeeded, ctx)) {
        add(
          { form: "standard", pair: pairKind, sets: sol.sets },
          [...Array.from({ length: needWild }, () => pairKind), ...sol.wildAs],
        );
        if (done()) break;
      }
      counts.n.set(pairKey, c);
      if (done()) break;
    }

    // 조커 둘이 곧 머리 — kind가 자유로우므로 후보를 훑는다(채점용)
    if (!done() && wilds >= 2) {
      for (const pk of ctx.freeKinds) {
        for (const sol of extractSets(counts, wilds - 2, setsNeeded, ctx)) {
          add({ form: "standard", pair: pk, sets: sol.sets }, [pk, pk, ...sol.wildAs]);
          if (done()) break;
        }
        if (done() || !ctx.enumerateFree) break;
      }
    }

    // 혼색 머리 — 랭크만 같으면 무늬가 달라도 작두다 (수패 한정).
    // 위의 순수 머리와 겹치지 않게 **서로 다른 두 kind**의 조합만 만든다.
    if (mixedPairs && !done()) {
      const realKinds = counts.order.map((k) => counts.kindOf.get(k) as TileKind);
      const partners = wilds > 0 ? [...realKinds, ...ctx.freeKinds] : realKinds;
      const seenPair = new Set<string>();
      outer: for (const a of realKinds) {
        for (const b of partners) {
          if (kindKey(a) === kindKey(b)) continue;
          if (a.rank !== b.rank) continue;
          if (!sequenceSuits.has(a.suit) || !sequenceSuits.has(b.suit)) continue;
          const key = [kindKey(a), kindKey(b)].sort().join("|");
          if (seenPair.has(key)) continue;
          seenPair.add(key);
          const take = takeGroup(counts, [a, b], wilds);
          if (take === null) continue;
          applyUsed(counts, take.used, -1);
          for (const sol of extractSets(
            counts,
            wilds - take.wildAs.length,
            setsNeeded,
            ctx,
          )) {
            add(
              { form: "standard", pair: a, sets: sol.sets },
              [...take.wildAs, ...sol.wildAs],
            );
            if (done()) break;
          }
          applyUsed(counts, take.used, 1);
          if (done()) break outer;
        }
      }
    }
  }

  // ── 치또이: 후로 없음, 서로 다른 7종 × 2장 (표준 4멘쯔 게임에서만) ──
  if (meldCount === 0 && hand.length === 14 && totalSets === 4 && !done()) {
    const counts = buildCounts(real);
    if (!kokushiOnly) {
      if (chiitoiMixedPairs) {
        // 비대칭 치또이 — 표준(7종×2)을 포함하는 상위집합이므로 이 분기만 돌린다
        const sol =
          wilds === 0
            ? ((p) => (p === null ? null : { pairs: p, wildAs: [] }))(
                asyncChiitoiPairs(real),
              )
            : asyncChiitoiWithWilds(real, wilds, ctx);
        if (sol !== null) {
          add({ form: "chiitoitsu", pair: null, pairs: sol.pairs, sets: [] }, sol.wildAs);
        }
      } else {
        for (const sol of chiitoiWithWilds(counts, wilds, ctx)) {
          add({ form: "chiitoitsu", pair: null, pairs: sol.pairs, sets: [] }, sol.wildAs);
          if (done()) break;
        }
      }
    }

    // ── 국사: 13종 요구패 전부 + 그중 하나 2장 ──
    // 왕의 징표(kokushiDupes>0)면 종류가 d개까지 빠져도 되고, 빠진 자리는 중복으로 메운다.
    const orphanKeys = new Set(ORPHAN_KINDS.map(kindKey));
    if (!done() && real.every((k) => orphanKeys.has(kindKey(k)))) {
      forEachOrphanFill(wilds, (fill) => {
        const filled = [...real, ...fill];
        const pair = kokushiPairOf(filled, kokushiDupes);
        if (pair !== null) add({ form: "kokushi", pair, sets: [] }, fill);
        return done();
      });
    }
  }

  // ── 울어 국사 (특수 후로 지원): 서로 다른 요구패 3장 후로 M개가 3M종을 덮는다 ──
  // 후로가 3M종(전부 서로 다른 요구패)을 덮고, 손 (14−3M)장이 나머지 (13−3M)종을
  // 1장씩 + 머리(1종 2장)로 덮으면 국사 성립. 머리는 반드시 손패(울지 않은 패)다.
  if (
    kokushiMeldKinds !== undefined &&
    kokushiMeldKinds.length > 0 &&
    meldCount > 0 &&
    !done()
  ) {
    const K = kokushiMeldKinds.length;
    const orphanKeys = new Set(ORPHAN_KINDS.map(kindKey));
    const meldKeys = kokushiMeldKinds.map(kindKey);
    const meldSet = new Set(meldKeys);
    if (
      K === meldCount * 3 && // 후로마다 정확히 3종
      meldSet.size === K && // 후로 kind가 전부 서로 다르다
      meldKeys.every((key) => orphanKeys.has(key)) && // 전부 요구패
      hand.length === 14 - K && // 손패 장수
      real.every((k) => orphanKeys.has(kindKey(k)))
    ) {
      forEachOrphanFill(wilds, (fill) => {
        const pair = meldKokushiPairOf(
          [...real, ...fill],
          meldSet,
          orphanKeys,
          kokushiDupes,
        );
        if (pair !== null) add({ form: "kokushi", pair, sets: [] }, fill);
        return done();
      });
    }
  }

  return results;
}
