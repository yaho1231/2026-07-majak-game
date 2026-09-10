/**
 * shanten — "화료까지 몇 번 갈아야 하는가"(샹텐)와 그 손을 전진시키는 패(우케이레).
 *
 * 봇이 사람처럼 치려면 **패의 고립도**가 아니라 **손 전체의 진행도**로 버릴 패를 골라야
 * 한다. 예전 봇은 이웃 유무만 보는 keepValue 하나로 버렸기 때문에, 같은 1샹텐이라도
 * 받는 패가 4장인 형태와 16장인 형태를 구분하지 못했다(사람은 당연히 후자를 남긴다).
 *
 * 계산은 **표준형(4멘쯔 1작두) · 치또이 · 국사** 셋을 각각 재고 최솟값을 쓴다.
 * 표준형은 무늬 그룹별로 (멘쯔·부분멘쯔·작두) 조합을 전부 열거해 합치는 정공법이고,
 * 그룹별 결과는 **패 개수 문자열로 메모**하기 때문에 한 국 전체가 수십 µs로 끝난다.
 *
 * ⚠ 범위: 증강이 화료형 자체를 바꾸는 경우(무너진 국경·끝없는 윤회 등)는 이 근사가
 * 정확하지 않다. `totalSets`(진짜 용의 5멘쯔)만 반영하고 나머지 변형은 무시한다 —
 * 샹텐은 **어느 패를 남길지 고르는 휴리스틱**에만 쓰고, 텐파이·대기 판정처럼 정확해야
 * 하는 곳은 `isTenpai`/`winningKinds`에 `scoringOptions`를 넘겨 그대로 쓴다.
 */

import { kindKey, standardKinds } from "../tiles/Tile.js";
import type { TileKind } from "../tiles/Tile.js";
import type { DecomposeOptions } from "./decompose.js";
import { standardCounts, standardIndexOf } from "./standardShape.js";

const NUMBER_SUITS = new Set(["man", "pin", "sou"]);

/** 표준형 한 그룹(무늬)에서 얻어낸 조합 결과 */
interface Profile {
  /** 완성 멘쯔(커쯔·슌쯔) 수 */
  sets: number;
  /** 2장짜리 부분 멘쯔 수 (작두 포함) */
  partials: number;
  /** 그중 작두(같은 패 2장)가 하나라도 있는가 — 머리 후보 */
  hasPair: boolean;
}

/** 무늬 그룹: 같은 무늬 패의 rank별 장수 */
interface Group {
  counts: number[];
  /** 슌쯔를 만들 수 있는 무늬인가 (수패만) */
  runs: boolean;
  /**
   * 커쯔를 만들 수 있는가 — 기본은 참이다.
   *
   * **랭크로 합친 그룹**(`mergedNumberGroup`)에서만 거짓이 된다: 거기서는 같은 칸의
   * 3장이 서로 다른 무늬일 수 있어서, 커쯔를 허용하면 «동수의 결속»이 없는 손에까지
   * 무늬를 섞은 커쯔를 인정해 버린다.
   */
  triplets?: boolean;
  /** 작두(머리)를 만들 수 있는가 — 위와 같은 이유로 합친 그룹에서만 꺼진다. */
  pairs?: boolean;
}

const profileCache = new Map<string, Profile[]>();

/** 손패 kind 목록 → 무늬별 개수 그룹 (증강이 만든 커스텀 무늬도 그룹 하나로 잡힌다) */
function toGroups(kinds: readonly TileKind[]): Group[] {
  const bySuit = new Map<string, number[]>();
  for (const k of kinds) {
    let arr = bySuit.get(k.suit);
    if (arr === undefined) {
      arr = new Array<number>(10).fill(0);
      bySuit.set(k.suit, arr);
    }
    if (k.rank >= 0 && k.rank < arr.length) arr[k.rank] = (arr[k.rank] ?? 0) + 1;
  }
  const out: Group[] = [];
  for (const [suit, counts] of bySuit) {
    out.push({ counts, runs: NUMBER_SUITS.has(suit) });
  }
  return out;
}

/**
 * 한 그룹에서 나올 수 있는 (멘쯔·부분멘쯔·작두) 조합을 전부 열거해
 * 지배당하지 않는(파레토) 것만 남긴다.
 *
 * 분기: 커쯔 · 슌쯔 · 작두 · 변짱/칸짱(2장) · 그냥 버리기. 매 분기가 최소 1장을 소비하니
 * 반드시 끝난다. 손패 14장 규모에선 분기 수가 작고, 결과는 개수 문자열로 메모된다.
 */
/**
 * 프로필 캐시 키. 개수표(10칸)를 16진 자리로 접은 **숫자** — 예전의 `counts.join(",")`
 * 문자열은 봇의 우케이레 계산(34종 × 무늬 그룹)에서 판정 자체만큼 비쌌다.
 * 한 칸이 16장을 넘으면(증강이 만들어 낸 패) 숫자로 접을 수 없어 문자열로 떨어진다.
 */
function profileKey(group: Group): number | string {
  let key = 0;
  for (let i = 0; i < group.counts.length; i++) {
    const c = group.counts[i] ?? 0;
    if (c >= 16 || group.counts.length > 10) {
      return `${group.runs ? "n" : "h"}${group.triplets === false ? "-t" : ""}${
        group.pairs === false ? "-p" : ""
      }:${group.counts.join(",")}`;
    }
    key = key * 16 + c;
  }
  // 상위 자리에 무늬 종류·허용 플래그를 얹는다 (16^10 < 2^40, 정수로 정확하다)
  const flags =
    (group.runs ? 1 : 0) + (group.triplets === false ? 2 : 0) + (group.pairs === false ? 4 : 0);
  return key + flags * 2 ** 40;
}

const profileCacheByNumber = new Map<number, Profile[]>();

function profilesOf(group: Group): Profile[] {
  const key = profileKey(group);
  const cached =
    typeof key === "number" ? profileCacheByNumber.get(key) : profileCache.get(key);
  if (cached !== undefined) return cached;

  const counts = [...group.counts];
  const found: Profile[] = [];
  const seen = new Set<string>();

  const record = (sets: number, partials: number, hasPair: boolean): void => {
    const k = `${sets},${partials},${hasPair ? 1 : 0}`;
    if (seen.has(k)) return;
    seen.add(k);
    found.push({ sets, partials, hasPair });
  };

  const walk = (i: number, sets: number, partials: number, hasPair: boolean): void => {
    if (sets + partials > 5) return; // 5블록(4멘쯔+머리)을 넘는 조합은 쓸모없다
    if (i >= counts.length) {
      record(sets, partials, hasPair);
      return;
    }
    const n = counts[i] ?? 0;
    if (n === 0) {
      walk(i + 1, sets, partials, hasPair);
      return;
    }
    // 커쯔
    if (n >= 3 && group.triplets !== false) {
      counts[i] = n - 3;
      walk(i, sets + 1, partials, hasPair);
      counts[i] = n;
    }
    if (group.runs && i + 2 < counts.length) {
      const a = counts[i + 1] ?? 0;
      const b = counts[i + 2] ?? 0;
      // 슌쯔
      if (a > 0 && b > 0) {
        counts[i] = n - 1;
        counts[i + 1] = a - 1;
        counts[i + 2] = b - 1;
        walk(i, sets + 1, partials, hasPair);
        counts[i] = n;
        counts[i + 1] = a;
        counts[i + 2] = b;
      }
      // 칸짱 (i, i+2)
      if (b > 0) {
        counts[i] = n - 1;
        counts[i + 2] = b - 1;
        walk(i, sets, partials + 1, hasPair);
        counts[i] = n;
        counts[i + 2] = b;
      }
    }
    // 량면/펜짱 (i, i+1)
    if (group.runs && i + 1 < counts.length && (counts[i + 1] ?? 0) > 0) {
      const a = counts[i + 1] ?? 0;
      counts[i] = n - 1;
      counts[i + 1] = a - 1;
      walk(i, sets, partials + 1, hasPair);
      counts[i] = n;
      counts[i + 1] = a;
    }
    // 작두
    if (n >= 2 && group.pairs !== false) {
      counts[i] = n - 2;
      walk(i, sets, partials + 1, true);
      counts[i] = n;
    }
    // 이 패는 쓰지 않는다 (고립패)
    counts[i] = n - 1;
    walk(i, sets, partials, hasPair);
    counts[i] = n;
  };

  walk(0, 0, 0, false);

  // 파레토 정리 — 모든 축에서 뒤지는 조합은 버린다 (조합 폭발 방지)
  const pareto = found.filter(
    (p) =>
      !found.some(
        (q) =>
          q !== p &&
          q.sets >= p.sets &&
          q.partials >= p.partials &&
          (q.hasPair ? 1 : 0) >= (p.hasPair ? 1 : 0) &&
          (q.sets > p.sets ||
            q.partials > p.partials ||
            (q.hasPair ? 1 : 0) > (p.hasPair ? 1 : 0)),
      ),
  );
  const result = pareto.length > 0 ? pareto : [{ sets: 0, partials: 0, hasPair: false }];
  if (typeof key === "number") profileCacheByNumber.set(key, result);
  else profileCache.set(key, result);
  return result;
}

/**
 * 무늬를 무시하고 **랭크로 합친** 수패 그룹 + 자패 그룹들.
 *
 * 무늬 확장 증강(무너진 국경 `mixedRuns` · 동수의 결속 `mixedTriplets` ·
 * 비대칭 `mixedPairs`)이 걸린 손을 재기 위한 두 번째 모형이다. 켜진 축만 허용하고
 * 나머지는 **막는다** — 예컨대 무너진 국경만 켜졌으면 이 그룹에서는 슌쯔만 만들고
 * 커쯔·작두는 만들지 않는다(합쳐 놓은 탓에 무늬가 섞인 커쯔가 될 수 있다).
 *
 * 그래서 이 모형은 «합법 분해의 부분집합»만 센다 = 나온 값은 결코 진짜보다 작지
 * 않다. 표준 모형과 **최솟값**을 취해도 낙관적으로 새지 않는다. 이게 중요한 이유는
 * 샹텐 0이 봇의 텐파이·리치·푸시 판단 전체의 문지기이기 때문이다(read.ts) — 여기서
 * 한 칸이라도 낙관적이면 봇이 텐파이가 아닌 손을 텐파이로 읽는다.
 */
function mergedRankGroups(
  kinds: readonly TileKind[],
  opts: DecomposeOptions,
): Group[] {
  const merged = new Array<number>(10).fill(0);
  const honors: Group[] = [];
  const honorBySuit = new Map<string, number[]>();
  for (const k of kinds) {
    if (NUMBER_SUITS.has(k.suit)) {
      if (k.rank >= 0 && k.rank < merged.length) merged[k.rank] = (merged[k.rank] ?? 0) + 1;
    } else {
      let arr = honorBySuit.get(k.suit);
      if (arr === undefined) {
        arr = new Array<number>(10).fill(0);
        honorBySuit.set(k.suit, arr);
      }
      if (k.rank >= 0 && k.rank < arr.length) arr[k.rank] = (arr[k.rank] ?? 0) + 1;
    }
  }
  // 자패는 무늬 개념이 없어 어느 확장에도 걸리지 않는다 — 그대로 둔다.
  for (const counts of honorBySuit.values()) honors.push({ counts, runs: false });
  return [
    {
      counts: merged,
      runs: opts.mixedRuns === true,
      triplets: opts.mixedTriplets === true,
      pairs: opts.mixedPairs === true,
    },
    ...honors,
  ];
}

/**
 * 무늬 그룹들을 조합해 표준형 샹텐의 최솟값을 낸다 (`standardShanten`의 안쪽).
 *
 * 그룹마다 프로필(멘쯔 수·부분 수·머리 유무)을 하나씩 고르는 조합 — 예전에는 그
 * 곱을 전부 재귀로 돌았다(5무늬 × 프로필 몇 개 = 수천 갈래). 최종 점수는 **합계**
 * (sets·partials·hasPair)만 보므로, 그룹을 하나씩 더하며 같은 합계를 하나로 접는
 * DP로 같은 최솟값이 나온다. 상태는 (sets ≤ 15, partials ≤ 31, pair) 1024칸.
 */
const COMBINE_STATES = 16 * 32 * 2;
/** 상태별 «마지막으로 본 세대» — 세대 번호를 올리면 비우지 않고 다시 쓴다 */
const combineSeen = new Int32Array(COMBINE_STATES);
let combineGen = 0;
let combineCur = new Int16Array(COMBINE_STATES);
let combineNext = new Int16Array(COMBINE_STATES);

function combineGroups(
  groupSet: readonly Group[],
  meldCount: number,
  totalSets: number,
  best: number,
): number {
  const maxBlocks = totalSets + 1;
  const base = totalSets * 2;
  let cur = combineCur;
  let next = combineNext;
  let curLen = 1;
  cur[0] = 0; // (sets 0, partials 0, pair 없음)
  for (const group of groupSet) {
    const profs = profilesOf(group);
    combineGen++;
    let nextLen = 0;
    for (let i = 0; i < curLen; i++) {
      const st = cur[i] as number;
      const pair = st & 1;
      const partials = (st >> 1) & 31;
      const sets = st >> 6;
      for (const prof of profs) {
        let ns = sets + prof.sets;
        let np = partials + prof.partials;
        // 상한을 넘는 값은 점수에서 어차피 잘린다(아래 m·p 클램프) — 칸 밖으로 새지 않게 붙든다
        if (ns > 15) ns = 15;
        if (np > 31) np = 31;
        const key = (ns << 6) | (np << 1) | (pair | (prof.hasPair ? 1 : 0));
        if (combineSeen[key] === combineGen) continue;
        combineSeen[key] = combineGen;
        next[nextLen++] = key;
      }
    }
    const t = cur;
    cur = next;
    next = t;
    curLen = nextLen;
  }
  for (let i = 0; i < curLen; i++) {
    const st = cur[i] as number;
    const hasPair = (st & 1) === 1;
    let p = (st >> 1) & 31;
    let m = meldCount + (st >> 6);
    if (m > totalSets) m = totalSets;
    if (m + p > maxBlocks) p = maxBlocks - m;
    let sc = base - 2 * m - p;
    // 블록이 다 찼는데 머리가 없으면 하나를 헐어 머리를 만들어야 한다
    if (m + p === maxBlocks && !hasPair) sc += 1;
    if (sc < best) best = sc;
  }
  combineCur = cur;
  combineNext = next;
  return best;
}

/** 표준형(4멘쯔 1작두) 샹텐 */
function standardShanten(
  kinds: readonly TileKind[],
  meldCount: number,
  totalSets: number,
  opts?: DecomposeOptions,
): number {
  let best = combineGroups(toGroups(kinds), meldCount, totalSets, totalSets * 2);

  /*
   * 무늬 확장이 걸린 손은 «랭크로 합친» 모형으로 한 번 더 재고 더 좋은 쪽을 쓴다.
   * 두 모형 모두 합법 분해만 세므로(`mergedRankGroups` 주석) 최솟값도 낙관적이지 않다.
   */
  if (
    opts?.mixedRuns === true ||
    opts?.mixedTriplets === true ||
    opts?.mixedPairs === true
  ) {
    best = combineGroups(mergedRankGroups(kinds, opts), meldCount, totalSets, best);
  }
  return best;
}

/**
 * ── 표준 지름길 ──
 *
 * 옵션이 샹텐 계산에 영향을 주지 않는 손(조커·혼색·국사 외길·비대칭 치또이가 없는
 * 손 — 대부분의 손이다)은 34칸 정수 배열에서 바로 잰다. `toGroups`의 Map·배열 할당,
 * 치또이·국사의 Map, 캐시 키 문자열이 전부 사라진다. 답은 `shantenUncached`와 같다:
 * 무늬 그룹은 같은 `profilesOf`를 쓰고, 빈 무늬 그룹은 조합에 아무것도 더하지 않는다.
 *
 * ⚠ `wrapRuns`·`honorRuns`·`polarEnds`·`kokushiDupes`는 샹텐이 원래 보지 않는
 *    옵션이다(`shantenUncached`가 읽지 않는다) — 여기서도 무시한다.
 */
const FAST_COUNTS = new Int32Array(34);
const FAST_GROUPS: Group[] = [
  { counts: new Array<number>(10).fill(0), runs: true },
  { counts: new Array<number>(10).fill(0), runs: true },
  { counts: new Array<number>(10).fill(0), runs: true },
  { counts: new Array<number>(10).fill(0), runs: false },
  { counts: new Array<number>(10).fill(0), runs: false },
];
const ORPHAN_INDEX: readonly number[] = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

function shantenFastEligible(opts: DecomposeOptions | undefined): boolean {
  return (
    opts === undefined ||
    ((opts.wildKinds === undefined || opts.wildKinds.length === 0) &&
      opts.kokushiOnly !== true &&
      opts.mixedRuns !== true &&
      opts.mixedTriplets !== true &&
      opts.mixedPairs !== true &&
      opts.chiitoiMixedPairs !== true)
  );
}

/** 표준 34종만 든 손의 샹텐. 표준 밖의 패가 있으면 null (일반 경로로) */
function shantenFast(
  kinds: readonly TileKind[],
  meldCount: number,
  totalSets: number,
): number | null {
  const c = standardCounts(kinds, FAST_COUNTS);
  if (c === null) return null;
  for (let g = 0; g < 3; g++) {
    const arr = (FAST_GROUPS[g] as Group).counts;
    for (let r = 1; r <= 9; r++) arr[r] = c[g * 9 + r - 1] as number;
  }
  const wind = (FAST_GROUPS[3] as Group).counts;
  for (let r = 1; r <= 4; r++) wind[r] = c[26 + r] as number;
  const dragon = (FAST_GROUPS[4] as Group).counts;
  for (let r = 1; r <= 3; r++) dragon[r] = c[30 + r] as number;

  let best = combineGroups(FAST_GROUPS, meldCount, totalSets, totalSets * 2);
  // 치또이·국사는 멘젠 13/14장 전용 (`shantenUncached`와 같은 조건)
  if (meldCount === 0 && totalSets === 4 && kinds.length >= 13) {
    let pairs = 0;
    let distinct = 0;
    for (let i = 0; i < 34; i++) {
      const n = c[i] as number;
      if (n > 0) distinct++;
      if (n >= 2) pairs++;
    }
    const chiitoi = 6 - pairs + Math.max(0, 7 - distinct);
    let orphanDistinct = 0;
    let orphanPair = false;
    for (const i of ORPHAN_INDEX) {
      const n = c[i] as number;
      if (n > 0) orphanDistinct++;
      if (n >= 2) orphanPair = true;
    }
    const kokushi = 13 - orphanDistinct - (orphanPair ? 1 : 0);
    best = Math.min(best, chiitoi, kokushi);
  }
  return best;
}

/**
 * 치또이쯔 샹텐 (멘젠 전용).
 *
 * **비대칭 치또이**(`chiitoiMixedPairs`)가 걸리면 짝을 «랭크»로 센다 — 1만+1통도 한
 * 쌍이다. 규칙은 `decompose.ts`의 `asyncChiitoiPairs`와 같다: 같은 패는 최대 3장까지만
 * 쓸 수 있고(4장 금지), 수패는 랭크별로 자패는 종류별로 짝을 짓는다.
 */
function chiitoiShanten(kinds: readonly TileKind[], opts?: DecomposeOptions): number {
  if (opts?.chiitoiMixedPairs === true) return chiitoiMixedShanten(kinds);
  const counts = new Map<string, number>();
  for (const k of kinds) {
    const key = kindKey(k);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let pairs = 0;
  for (const c of counts.values()) if (c >= 2) pairs++;
  const kinds7 = counts.size;
  return 6 - pairs + Math.max(0, 7 - kinds7);
}

/** 비대칭 치또이(랭크로 짝짓기) 샹텐 — 표준 치또이의 상위집합이라 값이 더 작거나 같다. */
function chiitoiMixedShanten(kinds: readonly TileKind[]): number {
  // 짝 후보 묶음: 수패는 랭크로, 자패는 종류로 모은다.
  const buckets = new Map<string, Map<string, number>>();
  for (const k of kinds) {
    const bucketKey = NUMBER_SUITS.has(k.suit) ? `n${k.rank}` : kindKey(k);
    let byKind = buckets.get(bucketKey);
    if (byKind === undefined) {
      byKind = new Map<string, number>();
      buckets.set(bucketKey, byKind);
    }
    const key = kindKey(k);
    byKind.set(key, (byKind.get(key) ?? 0) + 1);
  }
  let pairs = 0;
  for (const byKind of buckets.values()) {
    // 같은 패는 최대 3장까지만 쓸 수 있다 (4장 금지 — 같은 쌍이 두 번 나온다).
    let usable = 0;
    for (const c of byKind.values()) usable += Math.min(c, 3);
    pairs += Math.floor(usable / 2);
  }
  const distinct = buckets.size;
  return 6 - Math.min(pairs, 7) + Math.max(0, 7 - distinct);
}

const isOrphan = (k: TileKind): boolean =>
  !NUMBER_SUITS.has(k.suit) || k.rank === 1 || k.rank === 9;

/** 국사무쌍 샹텐 (멘젠 전용) */
function kokushiShanten(kinds: readonly TileKind[]): number {
  const counts = new Map<string, number>();
  for (const k of kinds) {
    if (!isOrphan(k)) continue;
    const key = kindKey(k);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let hasPair = false;
  for (const c of counts.values()) if (c >= 2) hasPair = true;
  return 13 - counts.size - (hasPair ? 1 : 0);
}

/**
 * **울어 국사** 샹텐 — 특수 후로(서로 다른 요구패 3장 × M개)가 3M종을 덮은 손.
 *
 * `decompose`의 울어 국사 분기(meldKokushiPairOf)와 같은 규칙을 샹텐으로 옮긴 것이다.
 * 후로가 덮은 종류는 손에서 다시 쓸 수 없고(머리도 반드시 손패), 남은 (13−3M)종을
 * 손이 1장씩 + 그중 하나를 2장(머리) 채우면 완성이다.
 */
function meldKokushiShanten(
  kinds: readonly TileKind[],
  meldKinds: readonly TileKind[],
): number {
  const meldKeys = new Set(meldKinds.map(kindKey));
  const need = 13 - meldKeys.size;
  if (need <= 0) return 0;
  const counts = new Map<string, number>();
  for (const k of kinds) {
    if (!isOrphan(k)) continue;
    const key = kindKey(k);
    if (meldKeys.has(key)) continue; // 후로가 덮은 종류는 손에서 쓸모없다
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let hasPair = false;
  for (const c of counts.values()) if (c >= 2) hasPair = true;
  return need - counts.size - (hasPair ? 1 : 0);
}

/**
 * 손패의 샹텐 — 0이면 텐파이, -1이면 화료형.
 * 13장·14장 어느 쪽을 넣어도 된다(블록 계산이라 남는 한 장은 자연히 무시된다).
 */
/*
 * ─────────────── 샹텐 캐시 (감사 2026-08-17 §7-9) ───────────────
 *
 * **무엇이 문제였나**: 봇의 결정 1회에 `shantenOf`가 180번 넘게 불린다
 * (`14 + 34k` — 버릴 후보 14장 각각, 그리고 우케이레가 34종을 훑는다).
 * `thinkMs` 지연 뒤에 숨어 있어 그 방에서는 안 보이지만, 이 계산은 **동기**라
 * 이벤트 루프를 그동안 통째로 잡는다 — 그 시간이 곧 **다른 방의 지연**이다.
 *
 * `shantenOf`는 순수 함수이고, 실제로 들어오는 손은 매우 잘 겹친다:
 *  - 우케이레는 같은 손에 한 장씩 더해 34번 재는데, 손 하나가 순마다 거의 그대로다.
 *  - 네 좌석의 봇이 같은 국을 돌며 비슷한 손을 훑는다.
 *  - `discard`·`call`·`kan`·`read`가 같은 손을 각자 다시 잰다.
 *
 * **키를 어떻게 만드나**: 샹텐은 패의 **순서와 무관**하므로 종류키를 정렬해 잇는다.
 * 그래야 "같은 손인데 배치만 다른" 경우가 같은 키로 모인다(손패 배치는 사람이
 * 언제든 바꾼다). 정렬·연결 비용은 13~14개의 짧은 문자열이라 블록 DP보다 훨씬 싸다.
 *
 * **캐시하지 않는 경우**: `opts`에 `Set`(`sequenceSuits`)이 들어오면 JSON으로
 * 구별할 수 없다 — 서로 다른 옵션이 같은 키가 되면 **틀린 답을 준다**. 그때는
 * 그냥 계산한다. 조용히 틀리느니 느린 편이 낫다.
 */
const SHANTEN_CACHE = new Map<string, number>();
/**
 * 상한. 한 판이 도는 동안 실제로 쌓이는 서로 다른 손은 수천 개 수준이라 넉넉하다.
 * 넘치면 통째로 비운다 — LRU를 흉내 내는 것보다 예측 가능하고, 다시 채우는 비용이
 * 어차피 원래 한 번의 비용이다.
 */
const SHANTEN_CACHE_MAX = 20000;

/** 옵션을 캐시 키로 쓸 수 있는가 (Set이 섞이면 구별이 안 된다). */
function cacheableOpts(opts?: DecomposeOptions): boolean {
  return opts?.sequenceSuits === undefined;
}

/**
 * 옵션 부분의 캐시 키. 예전에는 `JSON.stringify(opts)`였다 — 호출마다 새 객체가
 * 오므로(`scoringOptionsOf`) 매번 직렬화가 돌았다. 여기서는 `shantenUncached`가
 * 실제로 읽는 항목만 정해진 순서로 잇는다. 기본값과 같은 값은 빈 자리로 두므로
 * `{}`와 `{wrapRuns:false}`가 같은 키가 되지만, 답도 같다.
 */
function shantenOptsKey(opts: DecomposeOptions | undefined): string {
  if (opts === undefined) return "";
  let s =
    (opts.wrapRuns === true ? "1" : "0") +
    (opts.mixedRuns === true ? "1" : "0") +
    (opts.mixedTriplets === true ? "1" : "0") +
    (opts.mixedPairs === true ? "1" : "0") +
    (opts.kokushiOnly === true ? "1" : "0") +
    (opts.polarEnds === true ? "1" : "0") +
    (opts.chiitoiMixedPairs === true ? "1" : "0") +
    (opts.honorRuns === true ? "1" : "0") +
    "|" +
    (opts.totalSets ?? 4) +
    "|" +
    (opts.kokushiDupes ?? 0);
  if (opts.wildKinds !== undefined && opts.wildKinds.length > 0) {
    s += "|w" + opts.wildKinds.map(kindKey).sort().join(",");
  }
  if (opts.kokushiMeldKinds !== undefined && opts.kokushiMeldKinds.length > 0) {
    s += "|k" + opts.kokushiMeldKinds.map(kindKey).sort().join(",");
  }
  return s;
}

/** 손 부분의 캐시 키 — 정렬된 kind 표기 */
function sortedKindKey(kinds: readonly TileKind[]): string {
  const keys = new Array<string>(kinds.length);
  for (let i = 0; i < kinds.length; i++) keys[i] = kindKey(kinds[i] as TileKind);
  keys.sort();
  return keys.join(",");
}

export function shantenOf(
  kinds: readonly TileKind[],
  meldCount: number,
  opts?: DecomposeOptions,
): number {
  if (kinds.length === 0) return 8;
  if (shantenFastEligible(opts)) {
    const fast = shantenFast(kinds, meldCount, opts?.totalSets ?? 4);
    if (fast !== null) return fast;
  }
  if (cacheableOpts(opts)) {
    const key = `${sortedKindKey(kinds)}|${meldCount}|${shantenOptsKey(opts)}`;
    const hit = SHANTEN_CACHE.get(key);
    if (hit !== undefined) return hit;
    const value = shantenUncached(kinds, meldCount, opts);
    if (SHANTEN_CACHE.size >= SHANTEN_CACHE_MAX) SHANTEN_CACHE.clear();
    SHANTEN_CACHE.set(key, value);
    return value;
  }
  return shantenUncached(kinds, meldCount, opts);
}

/** **테스트 전용** — 지름길·캐시를 타지 않은 일반 경로. 지름길과 대조하는 데 쓴다. */
export function shantenOfGeneric(
  kinds: readonly TileKind[],
  meldCount: number,
  opts?: DecomposeOptions,
): number {
  if (kinds.length === 0) return 8;
  return shantenUncached(kinds, meldCount, opts);
}

function shantenUncached(
  kinds: readonly TileKind[],
  meldCount: number,
  opts?: DecomposeOptions,
): number {
  /**
   * 조커(조커) — 무엇이든 될 수 있는 패는 **어떤 한 장을 뽑은 것과 같다**. 어떤 손이든
   * 한 장을 더해 줄어드는 샹텐은 최대 1이므로, 조커를 빼고 잰 값에서 장수만큼 뺀다.
   *
   * 블록 모형이 장수를 세지 않아 "4멘쯔 + 조커"처럼 머리만 없는 손에서 1 낙관적으로
   * 나올 수 있다. 그래도 되는 자리다 — 샹텐은 **어느 패를 버릴지 고르는 휴리스틱**이고
   * (파일 머리말), 텐파이·화료 판정은 조커를 정확히 아는 `winningKinds`/`isWinningShape`가
   * 따로 한다. 정작 중요한 것은 **조커를 버리면 손이 나빠진다**가 여기서 보이는 것이다 —
   * 이게 없으면 봇이 백을 그냥 흘린다.
   */
  /*
   * ⚠ 조커를 뺀 `rest`로 **세 화료형을 각각** 재고 장수만큼 뺀다 (2026-08-20).
   *
   * 예전에는 `shantenOf(rest, ...) - wilds` 한 줄로 끝냈다. 그 `rest`는 12장 이하라
   * 바로 아래 특수형 게이트(`kinds.length >= 13`)에 걸려 **치또이·국사가 통째로
   * 계산되지 않았다** — 국사 13면 텐파이가 샹텐 7로 읽혀 봇이 자기 텐파이를 노텐으로
   * 보고 오름패를 흘렸다(qa-lab shape 확정 1). 게이트는 **원래 손 장수**로 보고,
   * 각 화료형은 조커를 뺀 손 위에서 재는 것이 맞다.
   */
  const totalSets = opts?.totalSets ?? 4;
  const wildKinds = opts?.wildKinds ?? [];
  let rest = kinds;
  let wilds = 0;
  if (wildKinds.length > 0) {
    const wildKeys = new Set(wildKinds.map(kindKey));
    rest = kinds.filter((k) => !wildKeys.has(kindKey(k)));
    wilds = kinds.length - rest.length;
  }
  /*
   * ⚠ **국사 외길**(우는 국사무쌍의 특수 퐁 뒤)은 표준형·치또이를 아예 열거하지
   * 않는다(`decompose.ts`의 kokushiOnly). 샹텐도 같은 길을 재야 한다 — 예전에는
   * 이 옵션을 보지 않아 표준형 값이 그대로 답이 됐고, 국사 텐파이가 샹텐 6으로
   * 읽혀 봇이 **자기 역만 텐파이를 노텐으로** 봤다(read.ts의 `if (shanten <= 0)`이
   * 대기·푸시·리치 판단 전체의 문지기다). 2026-08-20 QA 확정.
   */
  if (opts?.kokushiOnly === true) {
    const meldKinds = opts.kokushiMeldKinds ?? [];
    let k =
      (meldKinds.length > 0
        ? meldKokushiShanten(rest, meldKinds)
        : kokushiShanten(rest)) - wilds;
    if (wilds > 0) {
      // 조커 근사가 낙관적일 수 있다 — 장수가 모자라면 -1(완성)로 떨어질 수 없다
      const floor = kinds.length >= 14 - meldKinds.length ? -1 : 0;
      if (k < floor) k = floor;
    }
    return k;
  }
  let best = standardShanten(rest, meldCount, totalSets, opts) - wilds;
  // 치또이·국사는 멘젠 13/14장 전용. 특수 화료형 증강이 걸린 손은 표준형만 본다.
  if (meldCount === 0 && totalSets === 4 && kinds.length >= 13) {
    best = Math.min(best, chiitoiShanten(rest, opts) - wilds, kokushiShanten(rest) - wilds);
  }
  /*
   * 조커 근사는 낙관적일 수 있다(블록 모형이 장수를 세지 않는다). **장수 바닥**을
   * 씌워 13장짜리 손이 -1(=이미 완성)로 나오는 일만은 막는다 — 그 값은 EV·우케이레
   * 비교를 통째로 어긋나게 한다.
   */
  if (wilds > 0) {
    const needed = 3 * Math.max(0, totalSets - meldCount) + 2;
    const floor = kinds.length >= needed ? -1 : 0;
    if (best < floor) best = floor;
  }
  return best;
}

/** 우케이레 결과 — 어떤 종류가 손을 전진시키는지와 그 실제 남은 장수 합 */
export interface Ukeire {
  kinds: TileKind[];
  /** 남은 장수 합 (보이지 않는 곳에 실제로 몇 장 있는가) */
  tiles: number;
}

/**
 * 이 13장(또는 그 이하)에서 **샹텐을 줄여 주는 패**와 그 잔여 장수.
 * `remainingOf`는 보이는 패를 뺀 실제 남은 장수를 돌려주는 함수(danger.ts의 추적기).
 */
export function ukeireOf(
  kinds: readonly TileKind[],
  meldCount: number,
  remainingOf: (kind: TileKind) => number,
  opts?: DecomposeOptions,
): Ukeire {
  const current = shantenOf(kinds, meldCount, opts);
  const out: TileKind[] = [];
  let tiles = 0;
  // 후보를 끝에 붙인 손을 한 번만 만들어 마지막 칸만 바꿔 가며 잰다 (34번의 복사 대신)
  const probe: TileKind[] = [...kinds, kinds[0] ?? { suit: "man", rank: 1 }];
  const last = probe.length - 1;
  for (const cand of universeFor(kinds)) {
    const left = remainingOf(cand);
    if (left <= 0) continue; // 남은 게 없는 패는 받아도 소용없다 — 사람도 세지 않는다
    probe[last] = cand;
    if (shantenOf(probe, meldCount, opts) < current) {
      out.push({ suit: cand.suit, rank: cand.rank });
      tiles += left;
    }
  }
  return { kinds: out, tiles };
}

/** 표준 34종 — 호출마다 만들지 않는다. 밖으로 나가는 객체는 복사한다 */
const STANDARD_UNIVERSE: readonly TileKind[] = standardKinds();

/** 후보 패 종류 — 표준 34종 + 손에 실제로 있는 커스텀 무늬 */
function universeFor(kinds: readonly TileKind[]): readonly TileKind[] {
  let out: TileKind[] | null = null;
  for (const k of kinds) {
    if (standardIndexOf(k) >= 0) continue;
    out ??= [...STANDARD_UNIVERSE];
    const key = kindKey(k);
    if (!out.some((o) => kindKey(o) === key)) out.push(k);
  }
  return out ?? STANDARD_UNIVERSE;
}
