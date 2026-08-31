/**
 * **봇이 쓰는 샹텐** — 코어의 `shantenOf`(빠른 블록 휴리스틱) 위에 «형 완화 옵션»을
 * 얹어 봇이 자기 텐파이를 놓치지 않게 한다.
 *
 * ## 무엇이 문제였나 (QA synergy4 A-13)
 * `shantenOf`는 분해 옵션 중 **일부만** 읽는다(파일 머리말이 그렇게 적혀 있다 —
 * 「정확하지 않다」). 그래서 형을 넓히는 증강이 걸린 손에서 **진짜 텐파이인데 샹텐이
 * 1 이상**으로 나온다. 실측 누락률: 양극 90.5% · 끝없는 윤회 57.8% · 바람의 계보 99.1%.
 * `read.ts`의 `if (shanten <= 0)`이 대기·리치·푸시 판단 전체의 문지기라, 봇은 자기
 * 텐파이를 노텐으로 보고 오름패를 흘렸다.
 *
 * ## 어떻게 고치나
 * 2026-08-20에는 `kokushiOnly`·조커만 예외로 **하나씩** 뚫었다. 그러면 옵션이 늘어날
 * 때마다 같은 결함이 다시 생긴다. 여기서는 방향을 뒤집는다:
 *
 *  1. `shantenOf`가 **실제로 읽는 옵션 키**를 한 벌 적어 둔다(아래 목록).
 *  2. 그 목록에 없는 옵션이 켜져 있으면 「샹텐 값을 믿을 수 없다」로 본다.
 *  3. 그때는 **정확한 계산기**(`winningKinds` — 분해 옵션을 전부 읽는다)로 텐파이를
 *     직접 확인하고, 텐파이면 샹텐을 0으로 내린다.
 *
 * 그래서 새 형 완화 옵션이 추가되면 목록에 없다는 이유만으로 **자동으로** 정확한
 * 경로를 탄다 — 하드코딩 예외를 더 나열할 필요가 없다. 반대로 코어 `shantenOf`가
 * 어떤 옵션을 제대로 모델링하게 되면 그때 목록에 한 줄 더하면 된다(그러면 느린
 * 경로를 타지 않는다).
 *
 * 비용: 정확 경로는 「손패 장수 × 34종」의 화료 판정이라 싸지 않다. 형 완화 옵션이
 * 걸린 손에서만 돌고, 결과는 손 단위로 캐시한다.
 */

import { kindKey, shantenOf, winningKinds } from "@majak/core";
import type { DecomposeOptions, TileKind } from "@majak/core";

/**
 * 코어 `shantenOf`가 실제로 읽는 옵션 키 (2026-08-31 기준 `scoring/shanten.ts` 확인).
 *
 * - `sequenceSuits`는 형을 **좁히는** 옵션이다 — 샹텐이 낙관적으로 나올 뿐 텐파이를
 *   놓치지 않으므로 여기 둔다(정확 경로가 필요 없다).
 */
const SHANTEN_MODELED_OPTIONS: ReadonlySet<string> = new Set([
  "totalSets",
  "wildKinds",
  "kokushiOnly",
  "kokushiMeldKinds",
  "mixedRuns",
  "mixedTriplets",
  "mixedPairs",
  "chiitoiMixedPairs",
  "sequenceSuits",
]);

/** 이 손의 채점 옵션에 «샹텐이 모르는 형 완화»가 섞여 있는가 */
export function hasUnmodeledShapeOptions(opts: DecomposeOptions | undefined): boolean {
  if (opts === undefined) return false;
  for (const [key, value] of Object.entries(opts)) {
    if (value === undefined || value === null || value === false || value === 0) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (value instanceof Set && value.size === 0) continue;
    if (!SHANTEN_MODELED_OPTIONS.has(key)) return true;
  }
  return false;
}

/**
 * 정확한 텐파이 판정 — 13장이면 그대로, 14장이면 한 장씩 빼 보며 대기형을 찾는다.
 * 가장 넓은 대기를 함께 돌려준다(호출부가 다시 계산하지 않게).
 */
export function exactTenpai(
  hand: readonly TileKind[],
  meldCount: number,
  opts?: DecomposeOptions,
): { tenpai: boolean; waits: TileKind[] } {
  if (hand.length === 0) return { tenpai: false, waits: [] };
  let waits: TileKind[] = winningKinds(hand, meldCount, undefined, opts);
  if (waits.length > 0) return { tenpai: true, waits };
  let tenpai = false;
  for (let i = 0; i < hand.length; i++) {
    const rest = hand.slice(0, i).concat(hand.slice(i + 1));
    const w = winningKinds(rest, meldCount, undefined, opts);
    if (w.length > 0) {
      tenpai = true;
      if (w.length > waits.length) waits = w;
    }
  }
  return { tenpai, waits };
}

/** 손 단위 캐시 — 한 결정에서 같은 손을 여러 번 묻는다(우케이레·후로 비교) */
const TENPAI_CACHE = new Map<string, boolean>();
const TENPAI_CACHE_MAX = 20000;

function cacheKey(
  hand: readonly TileKind[],
  meldCount: number,
  opts: DecomposeOptions | undefined,
): string | null {
  if (opts?.sequenceSuits !== undefined) return null; // Set은 JSON으로 구별되지 않는다
  return `${hand.map(kindKey).sort().join(",")}|${meldCount}|${JSON.stringify(opts ?? {})}`;
}

/**
 * 봇이 쓰는 샹텐. 표준 손에서는 `shantenOf`와 **한 글자도 다르지 않다**(같은 값을
 * 그대로 돌려준다). 형 완화 옵션이 걸린 손에서만 정확 판정으로 0까지 내려온다.
 */
export function botShantenOf(
  hand: readonly TileKind[],
  meldCount: number,
  opts?: DecomposeOptions,
): number {
  const raw = shantenOf(hand, meldCount, opts);
  if (raw <= 0) return raw;
  if (!hasUnmodeledShapeOptions(opts)) return raw;
  const key = cacheKey(hand, meldCount, opts);
  const hit = key === null ? undefined : TENPAI_CACHE.get(key);
  const tenpai = hit ?? exactTenpai(hand, meldCount, opts).tenpai;
  if (key !== null && hit === undefined) {
    if (TENPAI_CACHE.size >= TENPAI_CACHE_MAX) TENPAI_CACHE.clear();
    TENPAI_CACHE.set(key, tenpai);
  }
  return tenpai ? 0 : raw;
}
