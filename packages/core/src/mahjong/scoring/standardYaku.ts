/**
 * standardYaku — 01_GAME_RULES §6의 표준 역 전체.
 *
 * 이 파일은 YakuRegistry 등록 API의 "첫 사용자"다 — 증강이 새 역을 만들 때
 * 쓰는 것과 같은 문으로 들어간다. 배타 관계(이페코/량페코, 찬타/준찬타 등)는
 * check 안에서 구조적으로 처리한다.
 *
 * 설계: docs/08_MAHJONG_ENGINE.md §3
 */

import {
  Suits,
  isHonor,
  isNumberSuit,
  isTerminal,
  isTerminalOrHonor,
  kindKey,
} from "../tiles/Tile.js";
import type { TileKind } from "../tiles/Tile.js";
import { allKinds } from "./WinContext.js";
import type { ScoringSet, ScoringVariant, WinContext } from "./WinContext.js";
import type { YakuDef, YakuRegistry } from "./YakuRegistry.js";

const first = (s: ScoringSet): TileKind => s.tiles[0] as TileKind;
const runs = (v: ScoringVariant): ScoringSet[] => v.sets.filter((s) => s.type === "run");
const triplets = (v: ScoringVariant): ScoringSet[] =>
  v.sets.filter((s) => s.type === "triplet");
const isStd = (v: ScoringVariant): boolean => v.form === "standard";

/** 슌쯔의 시작 랭크 (후로 슌쯔는 순서 보장이 없으므로 min으로) */
const runStart = (s: ScoringSet): number => Math.min(...s.tiles.map((t) => t.rank));

/**
 * 랭크가 min부터 **연속으로 이어지는** 평범한 슌쯔인가.
 *
 * 끝없는 윤회(wrapRuns)는 8-9-1·9-1-2 같은 순환 슌쯔를 만든다. 그런데 `runStart`가
 * 최솟값이라 8-9-1의 시작 랭크가 **1**로 잡혀, 123과 같은 슌쯔로 기록됐다. 그래서
 * 삼색동순·일기통관·이페코가 통째로 헛성립했다(docs/25 벽패 #1).
 *
 * 무늬를 요구하는 역이 `isPureRun`을 함께 걸어야 하듯, **순서를 요구하는 역**은
 * 이 검사를 함께 걸어야 한다. 순환 슌쯔는 "1부터 시작하는 슌쯔"가 아니다.
 */
const isLinearRun = (s: ScoringSet): boolean => {
  const ranks = s.tiles.map((t) => t.rank).sort((a, b) => a - b);
  return ranks.every((r, i) => r === (ranks[0] as number) + i);
};

/**
 * 한 무늬로만 이뤄진 슌쯔인가.
 * 무너진 국경(mixedRuns)은 2만·3통·4삭 같은 혼색 슌쯔를 만든다 — 무늬를 요구하는
 * 역(삼색동순·일기통관·이페코)은 first(s).suit만 보면 그런 슌쯔를 제 무늬로 착각하므로
 * 반드시 이 검사를 함께 걸어야 한다.
 */
const isPureRun = (s: ScoringSet): boolean =>
  s.tiles.every((t) => t.suit === first(s).suit);

/**
 * 한 무늬로만 이뤄진 커쯔인가.
 * 무너진 국경(mixedTriplets)은 2만·2통·2삭 같은 혼색 커쯔를 만든다 — 무늬를 요구하는
 * 역(삼색동각 등)은 first(s).suit만 보면 그런 커쯔를 제 무늬로 착각하므로 함께 걸어야 한다.
 * (isPureRun의 커쯔판 — 51차 교훈의 확장)
 */
const isPureTriplet = (s: ScoringSet): boolean =>
  s.tiles.every((t) => t.suit === first(s).suit);

/**
 * 한 랭크로만 이뤄진 커쯔인가.
 * 양극(polarEnds)은 199·191·911 같은 1·9 혼합 커쯔를 만든다 — 랭크를 요구하는
 * 역(삼색동각 등)은 first(s).rank만 보면 199를 '1 커쯔'로 착각하므로 함께 걸어야 한다.
 * (isPureTriplet의 랭크판)
 */
const isSameRankTriplet = (s: ScoringSet): boolean =>
  s.tiles.every((t) => t.rank === first(s).rank);

const hasTripletOf = (v: ScoringVariant, suit: string, rank: number): boolean =>
  triplets(v).some(
    (s) =>
      isPureTriplet(s) &&
      isSameRankTriplet(s) &&
      first(s).suit === suit &&
      first(s).rank === rank,
  );

const dragonTriplets = (v: ScoringVariant): number =>
  triplets(v).filter((s) => first(s).suit === Suits.Dragon).length;

const windTriplets = (v: ScoringVariant): number =>
  triplets(v).filter((s) => first(s).suit === Suits.Wind).length;

/**
 * 국사무쌍 13면 대기인가 — 더블 역만.
 * 판정은 "머리(중복된 요구패)가 곧 화료패"다. 그러면 화료 직전 손은 요구패 13종 ×1장이었고,
 * 13종 어느 것으로도 화료할 수 있었다는 뜻이 된다.
 * 손패 13종이 다 있는지도 함께 본다 — 왕의 징표(kokushiDupes)로 종류가 빠진 채 선 국사는
 * 머리와 화료패가 우연히 같아도 13면이 아니다.
 */
function isKokushi13(v: ScoringVariant, ctx: WinContext): boolean {
  if (v.form !== "kokushi" || v.pair === null) return false;
  if (kindKey(v.pair) !== kindKey(ctx.winningTile)) return false;
  return new Set(allKinds(v).map(kindKey)).size === 13;
}

/**
 * 구련보등 뼈대인가 — 맞으면 **뼈대(1112345678999)를 넘겨 남는 한 장의 랭크**를 준다.
 *
 * 화료형 14장은 언제나 "뼈대 13장 + 아무 랭크 한 장"이다. 그 남는 랭크가 곧 순정(9면 대기)
 * 판정의 재료가 된다 — 화료패가 그 한 장이었다면 화료 직전 손이 순수한 뼈대였다는 뜻이다.
 */
function chuurenSurplus(
  v: ScoringVariant,
  ctx: WinContext,
): { suit: string; rank: number } | null {
  if (!isStd(v) || !v.isClosed || ctx.melds.length > 0) return null;
  const p = suitProfile(v);
  if (p.numberSuits.size !== 1 || p.hasHonor) return null;
  const suit = [...p.numberSuits][0] as string;
  const kinds = allKinds(v);
  // 구련은 **정확히 14장**의 뼈대다. 장수를 안 보면 진짜 용의 17장 손
  // (111p 999p + 슌쯔 3개 + 작두)이 1·9 셋씩 + 2~8 하나씩을 우연히 만족해
  // 역만이 헛성립한다(docs/25 역/점수 #3).
  if (kinds.length !== 14) return null;
  const counts = new Array<number>(10).fill(0);
  for (const k of kinds) counts[k.rank] = (counts[k.rank] ?? 0) + 1;
  if ((counts[1] ?? 0) < 3 || (counts[9] ?? 0) < 3) return null;
  for (let r = 2; r <= 8; r++) if ((counts[r] ?? 0) < 1) return null;
  // 뼈대를 빼고 남는 한 장 — 14 = 13 + 1 이므로 초과분은 정확히 하나뿐이다.
  for (let r = 1; r <= 9; r++) {
    const base = r === 1 || r === 9 ? 3 : 1;
    if ((counts[r] ?? 0) > base) return { suit, rank: r };
  }
  return null;
}

/**
 * 순정구련보등(9면 대기)인가 — 더블 역만.
 * 판정은 국사 13면과 같은 논리다: **뼈대를 넘어선 그 한 장이 곧 화료패**면 화료 직전 손이
 * 순수한 1112345678999였고, 그 무늬 아홉 종 어느 것으로도 화료할 수 있었다는 뜻이 된다.
 * 화료패가 그 무늬의 수패가 아니면(와일드로 채운 화료 등) 순정으로 보지 않는다.
 */
function isJunseiChuuren(v: ScoringVariant, ctx: WinContext): boolean {
  const surplus = chuurenSurplus(v, ctx);
  if (surplus === null) return false;
  const win = ctx.winningTile;
  return win.suit === surplus.suit && win.rank === surplus.rank;
}

/**
 * 스안커 뼈대 — 표준형 + **손 전체가 안커**.
 *
 * 샹퐁 대기를 론으로 채우면 그 커쯔는 명각이 되므로(buildVariants) 여기서 자동으로
 * 걸러진다. 즉 이 함수가 참인 론은 전부 단기 대기이고, 쯔모는 둘 다 가능하다.
 *
 * ⚠ 멘쯔 수를 4로 하드코딩하지 않는다. 진짜 용(scoring.totalSets=5)에서는
 * "안커 4개 + 슌쯔 1개"가 `=== 4`를 만족해 역만이 붙고, 정작 5안커를 세우면
 * 조건이 깨져 **더 좋은 손이 역만에서 탈락**했다(docs/25 역/점수 #2).
 * 조건은 장수가 아니라 "몸통이 전부 안커인가"다.
 */
const isSuuankou = (v: ScoringVariant): boolean =>
  isStd(v) &&
  v.sets.length > 0 &&
  v.sets.every((s) => s.type === "triplet" && s.concealed);

const isYakuhaiPair = (pair: TileKind, ctx: WinContext): boolean =>
  pair.suit === Suits.Dragon ||
  (pair.suit === Suits.Wind &&
    (pair.rank === ctx.seatWind || pair.rank === ctx.prevalentWind));

/** 동일 슌쯔 쌍의 수 (이페코=1, 량페코=2) */
function duplicateRunPairs(v: ScoringVariant): number {
  const countByRun = new Map<string, number>();
  for (const r of runs(v)) {
    if (!isPureRun(r)) continue; // 혼색 슌쯔는 '같은 슌쯔' 판정에서 제외
    if (!isLinearRun(r)) continue; // 순환 슌쯔(8-9-1)는 123과 같은 슌쯔가 아니다
    // 자패 슌쯔(바람의 계보의 동남서)는 이페코·량페코의 '같은 슌쯔'가 아니다.
    // 자패는 suit가 하나(wind/dragon)라 isPureRun을 그냥 통과한다(docs/25 역/점수 #10).
    if (!isNumberSuit(first(r))) continue;
    const key = `${first(r).suit}:${runStart(r)}`;
    countByRun.set(key, (countByRun.get(key) ?? 0) + 1);
  }
  let pairs = 0;
  for (const n of countByRun.values()) pairs += Math.floor(n / 2);
  return pairs;
}

/** 수패 suit별 존재 여부 + 자패 존재 여부 */
function suitProfile(v: ScoringVariant): { numberSuits: Set<string>; hasHonor: boolean } {
  const numberSuits = new Set<string>();
  let hasHonor = false;
  for (const k of allKinds(v)) {
    if (isHonor(k)) hasHonor = true;
    else numberSuits.add(k.suit);
  }
  return { numberSuits, hasHonor };
}

const NUMBER_SUITS = [Suits.Man, Suits.Pin, Suits.Sou] as const;

const GREEN_KEYS = new Set(
  [
    { suit: Suits.Sou, rank: 2 },
    { suit: Suits.Sou, rank: 3 },
    { suit: Suits.Sou, rank: 4 },
    { suit: Suits.Sou, rank: 6 },
    { suit: Suits.Sou, rank: 8 },
    { suit: Suits.Dragon, rank: 2 },
  ].map(kindKey),
);

export const standardYakuList: YakuDef[] = [
  // ── 1판 ──
  {
    id: "riichi",
    name: "리치",
    closedHan: 1,
    openHan: null,
    check: (_v, ctx) => ctx.riichi !== null && !ctx.riichi.double,
  },
  {
    id: "double_riichi",
    name: "더블리치",
    closedHan: 2,
    openHan: null,
    check: (_v, ctx) => ctx.riichi?.double === true,
  },
  {
    id: "ippatsu",
    name: "일발",
    closedHan: 1,
    openHan: null,
    check: (_v, ctx) => ctx.riichi?.ippatsu === true,
  },
  {
    id: "menzen_tsumo",
    name: "멘젠쯔모",
    closedHan: 1,
    openHan: null,
    check: (v, ctx) => v.isClosed && ctx.winType === "tsumo",
  },
  {
    id: "pinfu",
    name: "핑후",
    closedHan: 1,
    openHan: null,
    check: (v, ctx) =>
      isStd(v) &&
      // 깡은 어떤 경우에도 슌쯔가 아니다 — 랭크가 섞인 깡(바람의 계보의 동남서북,
      // 장사진의 4연속)이 슌쯔성 몸통으로 나오므로 isKan을 함께 막아야 핑후가 헛성립하지 않는다.
      // 자패 슌쯔도 핑후가 아니다 — 핑후는 수패 슌쯔 넷이 전제다
      v.sets.every(
        (s) => s.type === "run" && s.isKan !== true && isNumberSuit(first(s)),
      ) &&
      v.pair !== null &&
      !isYakuhaiPair(v.pair, ctx) &&
      v.waitType === "ryanmen",
  },
  {
    id: "tanyao",
    name: "탕야오",
    closedHan: 1,
    openHan: 1, // 쿠이탄 허용 (01 확정)
    check: (v) => v.form !== "kokushi" && allKinds(v).every((k) => !isTerminalOrHonor(k)),
  },
  {
    id: "iipeiko",
    name: "이페코",
    closedHan: 1,
    openHan: null,
    check: (v) => isStd(v) && duplicateRunPairs(v) === 1,
  },
  {
    id: "yakuhai_haku",
    name: "역패 백",
    closedHan: 1,
    openHan: 1,
    check: (v) => hasTripletOf(v, Suits.Dragon, 1),
  },
  {
    id: "yakuhai_hatsu",
    name: "역패 발",
    closedHan: 1,
    openHan: 1,
    check: (v) => hasTripletOf(v, Suits.Dragon, 2),
  },
  {
    id: "yakuhai_chun",
    name: "역패 중",
    closedHan: 1,
    openHan: 1,
    check: (v) => hasTripletOf(v, Suits.Dragon, 3),
  },
  {
    id: "yakuhai_seat",
    name: "자풍패",
    closedHan: 1,
    openHan: 1,
    check: (v, ctx) => hasTripletOf(v, Suits.Wind, ctx.seatWind),
  },
  {
    id: "yakuhai_prevalent",
    name: "장풍패",
    closedHan: 1,
    openHan: 1,
    check: (v, ctx) => hasTripletOf(v, Suits.Wind, ctx.prevalentWind),
  },
  {
    id: "haitei",
    name: "해저로월",
    closedHan: 1,
    openHan: 1,
    check: (_v, ctx) => ctx.flags?.haitei === true && ctx.winType === "tsumo",
  },
  {
    id: "houtei",
    name: "하저로어",
    closedHan: 1,
    openHan: 1,
    check: (_v, ctx) => ctx.flags?.houtei === true && ctx.winType === "ron",
  },
  {
    id: "rinshan",
    name: "영상개화",
    closedHan: 1,
    openHan: 1,
    check: (_v, ctx) => ctx.flags?.rinshan === true && ctx.winType === "tsumo",
  },
  {
    id: "chankan",
    name: "창깡",
    closedHan: 1,
    openHan: 1,
    check: (_v, ctx) => ctx.flags?.chankan === true && ctx.winType === "ron",
  },
  // ── 2판 ──
  {
    id: "chiitoitsu",
    name: "치또이쯔",
    closedHan: 2,
    openHan: null,
    check: (v) => v.form === "chiitoitsu",
  },
  {
    id: "toitoi",
    name: "또이또이",
    closedHan: 2,
    openHan: 2,
    check: (v) => isStd(v) && v.sets.every((s) => s.type === "triplet"),
  },
  {
    id: "sanankou",
    name: "산안커",
    closedHan: 2,
    openHan: 2,
    check: (v) => isStd(v) && triplets(v).filter((s) => s.concealed).length >= 3,
  },
  {
    id: "sankantsu",
    name: "산깡쯔",
    closedHan: 2,
    openHan: 2,
    check: (v) => v.sets.filter((s) => s.isKan).length === 3,
  },
  {
    id: "sanshoku",
    name: "삼색동순",
    closedHan: 2,
    openHan: 1,
    check: (v) => {
      if (!isStd(v)) return false;
      for (let r = 1; r <= 7; r++) {
        if (
          NUMBER_SUITS.every((suit) =>
            runs(v).some(
              (s) =>
                isPureRun(s) &&
                isLinearRun(s) &&
                first(s).suit === suit &&
                runStart(s) === r,
            ),
          )
        ) {
          return true;
        }
      }
      return false;
    },
  },
  {
    id: "sanshoku_doukou",
    name: "삼색동각",
    closedHan: 2,
    openHan: 2,
    check: (v) => {
      if (!isStd(v)) return false;
      for (let r = 1; r <= 9; r++) {
        if (NUMBER_SUITS.every((suit) => hasTripletOf(v, suit, r))) return true;
      }
      return false;
    },
  },
  {
    id: "shousangen",
    name: "소삼원",
    closedHan: 2,
    openHan: 2,
    check: (v) =>
      isStd(v) && dragonTriplets(v) === 2 && v.pair?.suit === Suits.Dragon,
  },
  {
    id: "honroutou",
    name: "혼노두",
    closedHan: 2,
    openHan: 2,
    check: (v) =>
      v.form !== "kokushi" &&
      allKinds(v).every(isTerminalOrHonor) &&
      allKinds(v).some(isHonor) &&
      allKinds(v).some(isTerminal),
  },
  {
    id: "chanta",
    name: "찬타",
    closedHan: 2,
    openHan: 1,
    check: (v) =>
      isStd(v) &&
      runs(v).length >= 1 &&
      allKinds(v).some(isHonor) && // 자패가 없으면 준찬타의 영역
      v.sets.every((s) => s.tiles.some(isTerminalOrHonor)) &&
      v.pair !== null &&
      isTerminalOrHonor(v.pair),
  },
  {
    id: "ittsuu",
    name: "일기통관",
    closedHan: 2,
    openHan: 1,
    check: (v) =>
      isStd(v) &&
      NUMBER_SUITS.some((suit) =>
        [1, 4, 7].every((r) =>
          runs(v).some(
            (s) =>
              isPureRun(s) &&
              isLinearRun(s) &&
              first(s).suit === suit &&
              runStart(s) === r,
          ),
        ),
      ),
  },
  // ── 3판 이상 ──
  {
    id: "ryanpeiko",
    name: "량페코",
    closedHan: 3,
    openHan: null,
    check: (v) => isStd(v) && duplicateRunPairs(v) === 2,
  },
  {
    id: "junchan",
    name: "준찬타",
    closedHan: 3,
    openHan: 2,
    check: (v) =>
      isStd(v) &&
      runs(v).length >= 1 &&
      !allKinds(v).some(isHonor) &&
      v.sets.every((s) => s.tiles.some(isTerminal)) &&
      v.pair !== null &&
      isTerminal(v.pair),
  },
  {
    id: "honitsu",
    name: "혼일색",
    closedHan: 3,
    openHan: 2,
    check: (v) => {
      const p = suitProfile(v);
      return p.numberSuits.size === 1 && p.hasHonor;
    },
  },
  {
    id: "chinitsu",
    name: "청일색",
    closedHan: 6,
    openHan: 5,
    check: (v) => {
      const p = suitProfile(v);
      return p.numberSuits.size === 1 && !p.hasHonor;
    },
  },
  // ── 역만 ──
  {
    id: "kokushi",
    name: "국사무쌍",
    closedHan: 13,
    openHan: null,
    isYakuman: true,
    // 13면 대기는 kokushi_13(더블)이 잡는다 — 둘이 함께 서면 3배가 되므로 배타로 뺀다
    check: (v, ctx) => v.form === "kokushi" && !isKokushi13(v, ctx),
  },
  {
    id: "kokushi_13",
    name: "국사무쌍 13면 대기",
    closedHan: 26,
    // 멘젠 한정 — 울어 국사(kokushi_open, 증강)는 자기 def로 단일 역만을 유지한다
    openHan: null,
    isYakuman: true,
    yakumanMultiplier: 2,
    check: (v, ctx) => isKokushi13(v, ctx),
  },
  {
    id: "suuankou",
    name: "스안커",
    closedHan: 13,
    openHan: null,
    isYakuman: true,
    // 단기(머리 대기)는 suuankou_tanki(더블)가 잡는다 — 둘이 함께 서면 3배가 되므로 배타로 뺀다
    check: (v) => isSuuankou(v) && v.waitType !== "tanki",
  },
  {
    id: "suuankou_tanki",
    name: "스안커 단기",
    // 더블 역만 — 안커 4개를 세운 채 **머리 한 장**으로 기다리는 손이다. 샹퐁 대기와 달리
    // 론으로도 안커가 깨지지 않아(화료패가 커쯔에 들어가지 않는다) 성립 자체가 한 급 위다.
    closedHan: 26,
    openHan: null,
    isYakuman: true,
    yakumanMultiplier: 2,
    check: (v) => isSuuankou(v) && v.waitType === "tanki",
  },
  {
    id: "daisangen",
    name: "대삼원",
    closedHan: 13,
    openHan: 13,
    isYakuman: true,
    check: (v) => dragonTriplets(v) === 3,
  },
  {
    id: "shousuushii",
    name: "소사희",
    closedHan: 13,
    openHan: 13,
    isYakuman: true,
    check: (v) =>
      isStd(v) && windTriplets(v) === 3 && v.pair?.suit === Suits.Wind,
  },
  {
    id: "daisuushii",
    name: "대사희",
    // 더블 역만 — 바람 4종을 전부 커쯔로 모으는 난도는 소사희와 급이 다르다
    closedHan: 26,
    openHan: 26,
    isYakuman: true,
    yakumanMultiplier: 2,
    check: (v) => windTriplets(v) === 4,
  },
  {
    id: "tsuuiisou",
    name: "자일색",
    closedHan: 13,
    openHan: 13,
    isYakuman: true,
    check: (v) => v.form !== "kokushi" && allKinds(v).every(isHonor),
  },
  {
    id: "ryuuiisou",
    name: "녹일색",
    closedHan: 13,
    openHan: 13,
    isYakuman: true,
    check: (v) => allKinds(v).every((k) => GREEN_KEYS.has(kindKey(k))),
  },
  {
    id: "chinroutou",
    name: "청노두",
    closedHan: 13,
    openHan: 13,
    isYakuman: true,
    check: (v) => v.form !== "kokushi" && allKinds(v).every(isTerminal),
  },
  {
    id: "chuuren",
    name: "구련보등",
    closedHan: 13,
    openHan: null,
    isYakuman: true,
    // 9면 대기는 chuuren_junsei(더블)가 잡는다 — 둘이 함께 서면 3배가 되므로 배타로 뺀다
    check: (v, ctx) => chuurenSurplus(v, ctx) !== null && !isJunseiChuuren(v, ctx),
  },
  {
    id: "chuuren_junsei",
    name: "순정구련보등",
    // 더블 역만 — 뼈대 1112345678999를 그대로 세운 채 그 무늬 **아홉 종 전부**로 기다리는 손이다.
    closedHan: 26,
    openHan: null,
    isYakuman: true,
    yakumanMultiplier: 2,
    check: (v, ctx) => isJunseiChuuren(v, ctx),
  },
  {
    id: "suukantsu",
    name: "스깡쯔",
    closedHan: 13,
    openHan: 13,
    isYakuman: true,
    check: (v) => v.sets.filter((s) => s.isKan).length === 4,
  },
  {
    id: "tenhou",
    name: "천화",
    closedHan: 13,
    openHan: null,
    isYakuman: true,
    check: (_v, ctx) => ctx.flags?.tenhou === true && ctx.winType === "tsumo",
  },
  {
    id: "chihou",
    name: "지화",
    closedHan: 13,
    openHan: null,
    isYakuman: true,
    check: (_v, ctx) => ctx.flags?.chihou === true && ctx.winType === "tsumo",
  },
];

export function registerStandardYaku(registry: YakuRegistry): void {
  for (const def of standardYakuList) registry.register(def);
}
