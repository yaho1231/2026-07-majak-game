/**
 * **재료로 태울 잡패 고르기 — 한 곳.**
 *
 * 분열·허장성세·삼원의 의지처럼 "손패 한 장을 태워 다른 것으로 만드는" 증강은
 * 무엇을 태울지 스스로 정한다(§0 무작위→선택 원칙에 따라 발동 대상은 플레이어가 고르고,
 * 재료만 규칙이 결정적으로 고른다). 그 판정이 예전에는 **세 파일에 세 벌**로 있었고,
 * 셋 다 같은 휴리스틱이었다 — "주변에 이어지는 패가 가장 적은 장".
 *
 * 그 휴리스틱은 손을 **모양으로** 보지 않아서 이미 완성된 몸통·머리를 깨뜨렸다.
 * 예를 들어 123m 456m 789m 中中 5s 에서 5s를 쪼개면, 中은 짝이 하나뿐이라 이어짐
 * 점수가 낮고 자패라 순위가 더 낮아 **유일한 머리인 中中이** 재료로 타 버렸다
 * (2026-09-04 사용자 보고, PR #467). 이어짐만 세면 **몸통 한쪽이 재료로 사라진다.**
 *
 * 그래서 **결과 손을 실제로 세어 본다.** 후보마다 "그 패를 태운 뒤의 손"을 그대로
 * 만들어 샹텐을 재고(코어 `shantenOf` — 치또이·국사까지 본다), 가장 낮은 것을 고른다.
 * 샹텐이 같으면 수용 폭(우케이레 종 수)이 넓은 쪽, 그것도 같으면 예전 이어짐 점수로
 * 가른다(자패 → 노두패 → 그 밖의 수패 순). 무작위는 없다 — 봇도 사람도 같은 답을 본다.
 *
 * ⚠ 2026-09-16 재적용: #467은 9분 뒤 머지된 #469(오래된 base)에 통째로 지워졌다.
 * 그 사이 #490·#496이 «재료 미리보기»(`{augId}:material` 채널)를 옛 함수 위에 얹었으므로,
 * 미리보기도 **반드시 이 모듈의 같은 함수**로 계산한다 — 짚어 준 패와 실제로 타는 패가
 * 갈리면 화면이 거짓말을 한다.
 */

import {
  doraKindFor,
  handIdsOf,
  kindKey,
  kindOf,
  meldCountOf,
  scoringOptionsOf,
  shantenOf,
  ukeireOf,
} from "@majak/core";
import type {
  DecomposeOptions,
  GameState,
  PlayerId,
  RuleRegistry,
  TileId,
  TileKind,
} from "@majak/core";

const isNum = (k: TileKind): boolean =>
  k.suit === "man" || k.suit === "pin" || k.suit === "sou";

/**
 * **재료(잡패)로 태워서는 안 되는 패인가** — 도라·적도라.
 *
 * 분열·허장성세·삼원의 의지는 재료를 «잡패»라고 부른다. '잡패'는 값이 없는 패라는
 * 뜻인데, 고립도만 보면 **그 국의 도라이자 적도라인 외톨이 패**가 1순위 재료로 뽑혀
 * 도라 1판 + 적도라 1판이 한 번에 증발했다(2026-08-20 QA text 확정 14·15). 같은 팩의
 * `even_world`가 이미 같은 이유로 도라·적5를 명시적으로 지킨다(`even_world.ts` shouldFlip).
 *
 * 허장성세 파일에 있던 것을 여기로 옮겼다(2026-09-16) — 이 모듈이 허장성세를 부르고
 * 허장성세가 이 모듈을 부르는 순환을 없애기 위해서다. `bluff_pretense.ts`가 그대로
 * 다시 내보내므로 기존 호출처(`void_kan` 등)는 바뀌지 않는다.
 */
export function isPreciousMaterial(state: GameState, id: TileId): boolean {
  if (state.tiles[id]?.attrs.red === true) return true; // 적도라
  const key = kindKey(kindOf(state, id));
  for (const t of state.round.doraIndicators) {
    if (kindKey(doraKindFor(kindOf(state, t))) === key) return true; // 표시패 도라
  }
  return false;
}

/**
 * 이어짐 점수 — 낮을수록 고립. 샹텐·수용 폭이 같을 때의 **동점 판정에만** 쓴다.
 *
 * ① 같은 패(+2)·이웃 패(+1)가 손에 몇 장 붙어 있는가
 * ② 같으면 자패(0) → 노두패(1) → 그 밖의 수패(2) 순으로 먼저 태운다
 *    (자패는 슌쯔가 아예 불가능하고 노두패는 한쪽으로만 이어진다 — 2026-08-17 보고).
 *
 * `botHelpers.isolatedIndex`(이번 순에 버릴 만한 패)도 같은 점수를 쓴다.
 */
export function isolationCost(
  kinds: readonly TileKind[],
  i: number,
  exceptIdx = -1,
): number {
  const k = kinds[i] as TileKind;
  let n = 0;
  for (let j = 0; j < kinds.length; j++) {
    if (j === i || j === exceptIdx) continue;
    const o = kinds[j] as TileKind;
    if (o.suit !== k.suit) continue;
    if (o.rank === k.rank) n += 2;
    else if (isNum(k) && Math.abs(o.rank - k.rank) <= 2) n += 1;
  }
  const rank = !isNum(k) ? 0 : k.rank === 1 || k.rank === 9 ? 1 : 2;
  return n * 10 + rank;
}

/**
 * **수용 폭** — 이 손을 한 걸음 나아가게 하는 패가 몇 종인가.
 *
 * 샹텐만으로는 재료 후보가 자주 동점이 된다(몸통을 깨든 안 깨든 샹텐은 같을 수 있다).
 * 그때 갈라 주는 것이 이 값이다 — 123만에서 1만을 태운 손과 中中 머리를 태운 손은
 * 샹텐이 같아도 다음에 받아들일 수 있는 패의 폭이 다르다. 폭이 넓은 쪽이 사람이 고를
 * 손이다. 벽에 몇 장 남았는지는 보지 않는다(`remainingOf`는 늘 1) — 재료 선정은
 * 결정적이어야 하고, 종 수만 세어도 «몸통을 깨지 마라»는 판단에는 충분하다.
 */
function ukeireWidth(
  kinds: readonly TileKind[],
  meldCount: number,
  opts: DecomposeOptions | undefined,
): number {
  return ukeireOf(kinds, meldCount, () => 1, opts).kinds.length;
}

/** 재료 한 장을 고를 때 쓰는 후보 평가 옵션 */
export interface SpareOptions {
  /** 몇 장을 고르는가 (기본 1) */
  count?: number;
  /** 후보가 될 수 있는 패인가 (기본: 전부) */
  usable?: (id: TileId) => boolean;
  /**
   * 이 조합을 재료로 썼을 때의 **손패 kind 목록**. 기본은 "손에서 그냥 빠진다".
   * 허장성세·삼원의 의지처럼 재료가 다른 패로 바뀌는 경우 그 결과를 그대로 만들어 넘긴다.
   */
  resultKinds?: (picked: readonly TileId[]) => TileKind[];
  /**
   * 결과 손이 **여러 갈래**일 때 — 분열은 재료를 고르는 시점에 «어떻게 쪼갤지(a)»가
   * 아직 없다(미리보기는 대상마다 값 하나를 싣고, 화면은 그 뒤에 a를 고른다). 갈래마다
   * 결과 손을 넘기면 후보는 **가장 좋은 갈래**로 평가된다 — 그래서 어떤 a를 고르든 재료가
   * 같고, 미리 보여 준 패가 곧 타는 패가 된다. `resultKinds`보다 우선한다.
   */
  resultVariants?: (picked: readonly TileId[]) => TileKind[][];
  /** 결과에서 후로 수가 달라지는가 (허장성세는 펑이 하나 생긴다) */
  meldDelta?: number;
  /** 이어짐 계산에서 빼 둘 패 (분열의 쪼갤 대상 — 곧 두 조각이 된다) */
  ignoreForIsolation?: TileId;
}

/**
 * **재료로 태울 잡패 `count`장** — 없으면 null.
 *
 * 도라·적도라는 '잡패'가 아니다(`isPreciousMaterial`). 후보에서 먼저 뺀 뒤, 그것만으로
 * 수가 모자랄 때에만 도라를 후보에 되돌린다 — 발동 자체가 막히지 않도록.
 *
 * 조커(백)는 따로 지키지 않아도 된다: 조커를 태우면 결과 손의 샹텐이 올라가므로
 * 샹텐 우선 순위가 알아서 남긴다(`scoringOptionsOf`가 `wildKinds`를 실어 준다).
 *
 * 여러 장(삼원의 의지)은 탐욕적으로 한 장씩 고른다 — 세 장을 동시에 최적화해도 답이
 * 거의 같고, 후보 수가 세제곱으로 늘어 미리보기가 매 이벤트마다 그 값을 치르게 된다.
 */
export function pickSpareTiles(
  state: GameState,
  rules: RuleRegistry | undefined,
  holder: PlayerId,
  o: SpareOptions = {},
): TileId[] | null {
  const count = o.count ?? 1;
  const handIds = handIdsOf(state, holder);
  const all = handIds.filter((id) => o.usable?.(id) ?? true);
  if (all.length < count) return null;
  const spare = all.filter((id) => !isPreciousMaterial(state, id));
  const pool = spare.length >= count ? spare : all;

  const opts: DecomposeOptions | undefined =
    rules === undefined ? undefined : scoringOptionsOf(state, rules, holder);
  const meldCount = Math.max(0, meldCountOf(state, holder) + (o.meldDelta ?? 0));
  const variantsOf =
    o.resultVariants ??
    ((picked: readonly TileId[]): TileKind[][] => [
      o.resultKinds?.(picked) ??
        handIds.filter((id) => !picked.includes(id)).map((id) => kindOf(state, id)),
    ]);

  /* 이어짐 점수는 **손패 전체** 기준으로 잰다 (후보만 모아 재면 이웃이 사라진다). */
  const handKinds = handIds.map((id) => kindOf(state, id));
  const ignoreIdx =
    o.ignoreForIsolation === undefined ? -1 : handIds.indexOf(o.ignoreForIsolation);

  const chosen: TileId[] = [];
  for (let step = 0; step < count; step++) {
    /*
     * 순위는 ① 결과 손의 샹텐 ② 수용 폭(넓을수록 좋다) ③ 이어짐 점수 ④ 손패 순서.
     * ①만 보면 «몸통을 깨도 샹텐은 같다»는 자리에서 갈리지 않아 예전처럼 몸통이
     * 탄다 — ②가 그 자리를 가른다. 전부 결정적이라 봇도 사람도 같은 답을 본다.
     * ②는 무거우므로(34종 × 샹텐) ①에서 동점인 후보에만 잰다.
     */
    interface Scored {
      id: TileId;
      shanten: number;
      /** ①에서 최선을 낸 갈래들 — ②는 이 중 가장 넓은 값을 쓴다 */
      bestVariants: TileKind[][];
      width: number;
      iso: number;
      at: number;
    }
    const scored: Scored[] = [];
    let bestShanten = Number.POSITIVE_INFINITY;
    for (const id of pool) {
      if (chosen.includes(id)) continue;
      let shanten = Number.POSITIVE_INFINITY;
      const bestVariants: TileKind[][] = [];
      for (const v of variantsOf([...chosen, id])) {
        const sh = shantenOf(v, meldCount, opts);
        if (sh < shanten) {
          shanten = sh;
          bestVariants.length = 0;
        }
        if (sh === shanten) bestVariants.push(v);
      }
      if (bestVariants.length === 0) continue;
      bestShanten = Math.min(bestShanten, shanten);
      const at = handIds.indexOf(id);
      scored.push({
        id,
        shanten,
        bestVariants,
        width: 0,
        iso: isolationCost(handKinds, at, ignoreIdx),
        at,
      });
    }
    const tied = scored.filter((e) => e.shanten === bestShanten);
    if (tied.length === 0) return null;
    if (tied.length > 1) {
      for (const e of tied) {
        for (const v of e.bestVariants) {
          e.width = Math.max(e.width, ukeireWidth(v, meldCount, opts));
        }
      }
    }
    tied.sort((a, b) => b.width - a.width || a.iso - b.iso || a.at - b.at);
    chosen.push((tied[0] as Scored).id);
  }
  return chosen;
}

/**
 * **재료가 있기는 한가** — 후보 수만 세는 값싼 확인.
 *
 * 발동 버튼을 낼지 말지(옵션 목록)에는 «어느 패가 재료가 되는가»가 필요 없다. 순위를
 * 매기는 계산(샹텐·수용 폭)은 실제로 발동할 때와 미리보기에서만 돌면 된다 — 옵션
 * 목록에서 후보마다 전부 돌리면 한 순에 수천 번 세게 된다.
 */
export function hasSpareTile(
  state: GameState,
  holder: PlayerId,
  o: Pick<SpareOptions, "count" | "usable"> = {},
): boolean {
  const count = o.count ?? 1;
  return handIdsOf(state, holder).filter((id) => o.usable?.(id) ?? true).length >= count;
}

/** 한 장짜리 편의 함수 */
export function pickSpareTile(
  state: GameState,
  rules: RuleRegistry | undefined,
  holder: PlayerId,
  o: SpareOptions = {},
): TileId | undefined {
  return pickSpareTiles(state, rules, holder, { ...o, count: 1 })?.[0];
}
