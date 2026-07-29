/**
 * shanten — "화료까지 몇 번 갈아야 하는가"(샹텐)와 그 손을 전진시키는 패(우케이레).
 *
 * 봇이 사람처럼 치려면 **패의 고립도**가 아니라 **손 전체의 진행도**로 버릴 패를 골라야
 * 한다. 예전 봇은 이웃 유무만 보는 keepValue 하나로 버렸기 때문에, 같은 1샹텐이라도
 * 받는 패가 4장인 형태와 16장인 형태를 구분하지 못했다(사람은 당연히 후자를 남긴다).
 *
 * 계산은 **표준형(4멘쯔 1작두) · 치토이 · 국사** 셋을 각각 재고 최솟값을 쓴다.
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
function profilesOf(group: Group): Profile[] {
  const key = `${group.runs ? "n" : "h"}:${group.counts.join(",")}`;
  const cached = profileCache.get(key);
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
    if (n >= 3) {
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
    if (n >= 2) {
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
  profileCache.set(key, result);
  return result;
}

/** 표준형(4멘쯔 1작두) 샹텐 */
function standardShanten(
  kinds: readonly TileKind[],
  meldCount: number,
  totalSets: number,
): number {
  const groups = toGroups(kinds);
  const maxBlocks = totalSets + 1;
  const base = totalSets * 2;
  let best = base;

  const combine = (idx: number, sets: number, partials: number, hasPair: boolean): void => {
    if (idx >= groups.length) {
      let m = meldCount + sets;
      let p = partials;
      if (m > totalSets) m = totalSets;
      if (m + p > maxBlocks) p = maxBlocks - m;
      let s = base - 2 * m - p;
      // 블록이 다 찼는데 머리가 없으면 하나를 헐어 머리를 만들어야 한다
      if (m + p === maxBlocks && !hasPair) s += 1;
      if (s < best) best = s;
      return;
    }
    const group = groups[idx];
    if (group === undefined) return;
    for (const prof of profilesOf(group)) {
      combine(
        idx + 1,
        sets + prof.sets,
        partials + prof.partials,
        hasPair || prof.hasPair,
      );
    }
  };
  combine(0, 0, 0, false);
  return best;
}

/** 치토이쯔 샹텐 (멘젠 전용) */
function chiitoiShanten(kinds: readonly TileKind[]): number {
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
 * 손패의 샹텐 — 0이면 텐파이, -1이면 화료형.
 * 13장·14장 어느 쪽을 넣어도 된다(블록 계산이라 남는 한 장은 자연히 무시된다).
 */
export function shantenOf(
  kinds: readonly TileKind[],
  meldCount: number,
  opts?: DecomposeOptions,
): number {
  if (kinds.length === 0) return 8;
  const totalSets = opts?.totalSets ?? 4;
  let best = standardShanten(kinds, meldCount, totalSets);
  // 치토이·국사는 멘젠 13/14장 전용. 특수 화료형 증강이 걸린 손은 표준형만 본다.
  if (meldCount === 0 && totalSets === 4 && kinds.length >= 13) {
    best = Math.min(best, chiitoiShanten(kinds), kokushiShanten(kinds));
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
  for (const cand of universeFor(kinds)) {
    const left = remainingOf(cand);
    if (left <= 0) continue; // 남은 게 없는 패는 받아도 소용없다 — 사람도 세지 않는다
    if (shantenOf([...kinds, cand], meldCount, opts) < current) {
      out.push(cand);
      tiles += left;
    }
  }
  return { kinds: out, tiles };
}

/** 후보 패 종류 — 표준 34종 + 손에 실제로 있는 커스텀 무늬 */
function universeFor(kinds: readonly TileKind[]): TileKind[] {
  const out = standardKinds();
  const seen = new Set(out.map(kindKey));
  for (const k of kinds) {
    const key = kindKey(k);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(k);
    }
  }
  return out;
}
